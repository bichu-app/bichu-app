/**
 * Idempotência por cabeçalho `Idempotency-Key` (BICHUS-31, critérios 11 a 13).
 *
 * Três regras, e a segunda é a que costuma faltar:
 *
 * 1. Mesma chave, mesmo dono, mesma rota, mesmo corpo, dentro de 24 h: devolve a
 *    resposta original **sem executar de novo**.
 * 2. Mesma chave com corpo diferente, ou com outro dono, ou em outra rota: a
 *    requisição é **recusada**. Chave reaproveitada para outra coisa é erro, não
 *    atalho — e devolver o corpo gravado só pela igualdade da chave entregaria a
 *    resposta de um usuário a outro que adivinhou o UUID.
 * 3. A reserva é feita **antes** de executar, com `ON CONFLICT DO NOTHING`. Duas
 *    tentativas simultâneas da mesma chave não podem executar as duas: a que
 *    perde a corrida espera o resultado da que ganhou, em vez de repetir o
 *    efeito.
 */
import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/pool.js';
import { hashDeCorpo, iguaisEmTempoConstante } from '../crypto/digest.js';
import type { Contrato } from './contract.js';
import { ehObjetoDoContrato, resolverRefDoContrato } from './contract.js';
import { AppError, problemas } from './errors.js';

const VALIDADE_EM_HORAS = 24;
const STATUS_RESERVADO = 0;

export interface RespostaGravada {
  readonly status: number;
  readonly body: unknown;
}

export interface Idempotencia {
  /**
   * Devolve a resposta original quando a chave já foi concluída, `undefined`
   * quando é a primeira vez (e a reserva ficou registrada em nome de quem
   * chamou), e lança quando a chave está sendo usada para outra coisa.
   */
  reservar(entrada: EntradaDeIdempotencia): Promise<RespostaGravada | undefined>;
  concluir(chave: string, status: number, corpo: unknown): Promise<void>;
  /** Libera a reserva quando a execução falhou, para que o cliente possa repetir. */
  liberar(chave: string): Promise<void>;
}

export interface EntradaDeIdempotencia {
  readonly chave: string;
  /** UUID do usuário, ou o hash da credencial ao portador quando não há conta. */
  readonly donoOuToken: string;
  readonly endpoint: string;
  readonly corpoCanonico: string;
  readonly agoraEmMilissegundos: number;
}

function conflitoDeChave(): AppError {
  return problemas.validacao(
    [{ field: 'Idempotency-Key', code: 'reused', message: 'Esta chave já foi usada para outro pedido.' }],
    'Use uma chave nova para um pedido diferente.',
  );
}

export function criarIdempotencia(db: Db): Idempotencia {
  return {
    async reservar(entrada) {
      const requestHash = hashDeCorpo(entrada.corpoCanonico);
      const expiresAt = new Date(entrada.agoraEmMilissegundos + VALIDADE_EM_HORAS * 3600 * 1000);

      const reserva = await db
        .insertInto('idempotency_keys')
        .values({
          key: entrada.chave,
          user_or_token_ref: entrada.donoOuToken,
          endpoint: entrada.endpoint,
          request_hash: requestHash,
          response_status: STATUS_RESERVADO,
          response_body: null,
          expires_at: expiresAt,
        })
        .onConflict((oc) =>
          // Reaproveita a linha quando ela já venceu: a validade é de 24 h, e
          // uma chave vencida é uma chave livre.
          oc
            .column('key')
            .where(sql<boolean>`idempotency_keys.expires_at <= now()`)
            .doUpdateSet({
              user_or_token_ref: entrada.donoOuToken,
              endpoint: entrada.endpoint,
              request_hash: requestHash,
              response_status: STATUS_RESERVADO,
              response_body: null,
              expires_at: expiresAt,
            }),
        )
        .returning('key')
        .executeTakeFirst();

      if (reserva !== undefined) return undefined;

      const existente = await db
        .selectFrom('idempotency_keys')
        .select(['user_or_token_ref', 'endpoint', 'request_hash', 'response_status', 'response_body'])
        .where('key', '=', entrada.chave)
        .executeTakeFirst();

      if (existente === undefined) {
        // A linha sumiu entre a tentativa e a leitura (expurgo concorrente). Não
        // inventamos resultado: o cliente repete e a próxima tentativa reserva.
        throw problemas.interno();
      }
      if (
        existente.user_or_token_ref !== entrada.donoOuToken ||
        existente.endpoint !== entrada.endpoint ||
        !iguaisEmTempoConstante(existente.request_hash, requestHash)
      ) {
        throw conflitoDeChave();
      }
      if (existente.response_status === STATUS_RESERVADO) {
        // A primeira tentativa ainda está em curso. Recusar é melhor do que
        // executar em paralelo: o efeito duplicado é justamente o que a chave
        // existe para impedir.
        throw problemas.limiteDeChamadas(1);
      }
      return { status: existente.response_status, body: existente.response_body };
    },

    async concluir(chave, status, corpo) {
      await db
        .updateTable('idempotency_keys')
        .set({ response_status: status, response_body: corpo === undefined ? null : corpo })
        .where('key', '=', chave)
        .execute();
    },

    async liberar(chave) {
      await db
        .deleteFrom('idempotency_keys')
        .where('key', '=', chave)
        .where('response_status', '=', STATUS_RESERVADO)
        .execute();
    },
  };
}

/**
 * Forma canônica do corpo para o hash: chaves ordenadas em todos os níveis.
 * Sem isso, o mesmo pedido com os campos em outra ordem produziria outro hash e
 * a segunda tentativa da fila offline seria recusada como se fosse outra coisa.
 */
export function canonicalizarCorpo(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonicalizarCorpo).join(',')}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([chave, item]) => `${JSON.stringify(chave)}:${canonicalizarCorpo(item)}`);
  return `{${entradas.join(',')}}`;
}

// ---------------------------------------------------------------------------
// LIGACAO COM O CONTRATO
// ---------------------------------------------------------------------------
// O que decide se uma rota é idempotente NÃO é o julgamento de quem escreve o
// handler: é o `Idempotency-Key` declarado na operação em `api/openapi.yaml`.
// Ligar por julgamento produz o par de defeitos que ninguém vê — rota que
// promete idempotência no contrato e não a executa, e rota que a executa sem
// prometer. Aqui a especificação é lida em tempo de execução e a divergência
// derruba a subida.

const CABECALHO_DE_IDEMPOTENCIA = 'idempotency-key';

/** O contrato declara `Idempotency-Key` nesta operação, e como. */
export type ExigenciaDeIdempotencia = 'ausente' | 'opcional' | 'obrigatoria';

/** `format: uuid` do contrato. Recusar aqui evita gravar chave que não é chave. */
const FORMATO_DE_CHAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parametroResolvido(
  contrato: Contrato,
  bruto: unknown,
): Record<string, unknown> | undefined {
  if (!ehObjetoDoContrato(bruto)) return undefined;
  const ref = bruto['$ref'];
  if (typeof ref !== 'string') return bruto;
  const alvo = resolverRefDoContrato(contrato.spec, ref);
  return ehObjetoDoContrato(alvo) ? alvo : undefined;
}

export function exigenciaDeIdempotencia(
  contrato: Contrato,
  operationId: string,
): ExigenciaDeIdempotencia {
  const operacao = contrato.operacoes.get(operationId);
  if (operacao === undefined) {
    // Rota que cita um `operationId` que a especificação não tem é rastro
    // quebrado entre os dois documentos, e não vale como "não declara".
    throw new Error(`Operação fora do contrato: ${operationId}`);
  }
  const parametros = operacao.raw['parameters'];
  if (!Array.isArray(parametros)) return 'ausente';
  for (const bruto of parametros) {
    const parametro = parametroResolvido(contrato, bruto);
    if (parametro === undefined) continue;
    if (parametro['in'] !== 'header') continue;
    const nome = parametro['name'];
    if (typeof nome !== 'string' || nome.toLowerCase() !== CABECALHO_DE_IDEMPOTENCIA) continue;
    return parametro['required'] === true ? 'obrigatoria' : 'opcional';
  }
  return 'ausente';
}

/** Todas as operações que o contrato declara idempotentes, por `operationId`. */
export function operacoesComIdempotencia(
  contrato: Contrato,
): ReadonlyMap<string, Exclude<ExigenciaDeIdempotencia, 'ausente'>> {
  const mapa = new Map<string, Exclude<ExigenciaDeIdempotencia, 'ausente'>>();
  for (const operationId of contrato.operacoes.keys()) {
    const exigencia = exigenciaDeIdempotencia(contrato, operationId);
    if (exigencia !== 'ausente') mapa.set(operationId, exigencia);
  }
  return mapa;
}

export interface PedidoIdempotente {
  readonly exigencia: ExigenciaDeIdempotencia;
  /** `request.headers['idempotency-key']`, cru, como o cliente mandou. */
  readonly chaveDoCabecalho: unknown;
  /** UUID do usuário, ou o hash da credencial ao portador quando não há conta. */
  readonly donoOuToken: string;
  readonly endpoint: string;
  readonly corpo: unknown;
  readonly agoraEmMilissegundos: number;
}

function chaveAusente(): AppError {
  return problemas.validacao(
    [{ field: 'Idempotency-Key', code: 'required', message: 'Envie uma chave de idempotência.' }],
    'Esta operação exige `Idempotency-Key` para que o reenvio não repita o efeito.',
  );
}

function chaveMalformada(): AppError {
  return problemas.validacao(
    [{ field: 'Idempotency-Key', code: 'format', message: 'A chave precisa ser um UUID.' }],
  );
}

/**
 * Executa o efeito **uma vez por chave**.
 *
 * Isto é o que faltava entre a tabela `idempotency_keys` e as rotas: sem esta
 * função no caminho da requisição, a tabela existe, o adaptador existe, e o
 * segundo envio executa o efeito de novo.
 *
 * `executar` só é chamado quando a reserva foi ganha. Quando ele lança, a
 * reserva é liberada, porque uma tentativa que não produziu efeito não pode
 * bloquear a repetição da chave pelas 24 h seguintes.
 */
export async function executarComIdempotencia(
  idempotencia: Idempotencia,
  pedido: PedidoIdempotente,
  executar: () => Promise<RespostaGravada>,
): Promise<RespostaGravada> {
  if (pedido.exigencia === 'ausente') {
    // Defeito de fiação, não de quem chamou: a rota mandou passar por aqui e o
    // contrato não promete idempotência nela. Silenciar aqui faria a rota
    // ganhar comportamento que a especificação não declara.
    throw new Error(
      'Rota sem `Idempotency-Key` no contrato passando pela idempotência. ' +
        'Declare o parâmetro na operação ou tire a rota daqui.',
    );
  }

  const bruto = typeof pedido.chaveDoCabecalho === 'string' ? pedido.chaveDoCabecalho.trim() : '';
  if (bruto === '') {
    if (pedido.exigencia === 'obrigatoria') throw chaveAusente();
    return executar();
  }
  if (!FORMATO_DE_CHAVE.test(bruto)) throw chaveMalformada();
  const chave = bruto.toLowerCase();

  const gravada = await idempotencia.reservar({
    chave,
    donoOuToken: pedido.donoOuToken,
    endpoint: pedido.endpoint,
    corpoCanonico: canonicalizarCorpo(pedido.corpo),
    agoraEmMilissegundos: pedido.agoraEmMilissegundos,
  });
  if (gravada !== undefined) return gravada;

  let resposta: RespostaGravada;
  try {
    resposta = await executar();
  } catch (erro) {
    await idempotencia.liberar(chave);
    throw erro;
  }
  await idempotencia.concluir(chave, resposta.status, resposta.body);
  return resposta;
}

// ---------------------------------------------------------------------------
// O PORTAO DE SUBIDA
// ---------------------------------------------------------------------------

/** Marca, na própria rota, que ela passa por `executarComIdempotencia`. */
export interface ConfigDeRotaIdempotente {
  readonly idempotencia?: true;
}

function caminhoDoContrato(url: string, prefixoDaApi: string): string {
  const semPrefixo =
    prefixoDaApi !== '' && url.startsWith(`${prefixoDaApi}/`) ? url.slice(prefixoDaApi.length) : url;
  return semPrefixo.replace(/:([^/]+)/g, '{$1}');
}

/**
 * Confere, na subida, que rota idempotente e contrato dizem a mesma coisa.
 *
 * Registre ANTES das rotas e chame a função devolvida DEPOIS do registro. Ela
 * reprova nos dois sentidos: operação que declara `Idempotency-Key` e rota que
 * não passa pela idempotência, e rota que passa sem o contrato declarar.
 *
 * Silêncio aqui não é aprovação: quando não há nenhuma rota idempotente
 * registrada, a conferência diz isso com essas palavras no log, em vez de
 * terminar calada como se tivesse conferido alguma coisa.
 */
export function vigiarIdempotenciaDasRotas(
  app: FastifyInstance,
  contrato: Contrato,
  prefixoDaApi: string,
): () => void {
  const registradas: { metodo: string; caminho: string; marcada: boolean }[] = [];

  app.addHook('onRoute', (rota) => {
    const config = (rota.config ?? {}) as unknown as ConfigDeRotaIdempotente;
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    for (const metodo of metodos) {
      registradas.push({
        metodo: metodo.toLowerCase(),
        caminho: caminhoDoContrato(rota.url, prefixoDaApi),
        marcada: config.idempotencia === true,
      });
    }
  });

  const porRota = new Map<string, string>();
  for (const operacao of contrato.operacoes.values()) {
    porRota.set(`${operacao.method} ${operacao.path}`, operacao.operationId);
  }

  return () => {
    const semIdempotencia: string[] = [];
    const semContrato: string[] = [];
    let cobertas = 0;

    for (const rota of registradas) {
      const operationId = porRota.get(`${rota.metodo} ${rota.caminho}`);
      const exigencia =
        operationId === undefined ? 'ausente' : exigenciaDeIdempotencia(contrato, operationId);
      const identificacao = `${rota.metodo.toUpperCase()} ${rota.caminho}`;

      if (exigencia !== 'ausente' && !rota.marcada) semIdempotencia.push(identificacao);
      if (exigencia === 'ausente' && rota.marcada) semContrato.push(identificacao);
      if (exigencia !== 'ausente' && rota.marcada) cobertas += 1;
    }

    if (semIdempotencia.length > 0 || semContrato.length > 0) {
      throw new Error(
        'Idempotência e contrato divergem, e a divergência só apareceria no ' +
          'segundo envio de um cliente offline. ' +
          `Declaram \`Idempotency-Key\` e não passam pela idempotência: ${semIdempotencia.join(', ') || 'nenhuma'}. ` +
          `Passam pela idempotência sem o contrato declarar: ${semContrato.join(', ') || 'nenhuma'}.`,
      );
    }

    const declaradas = operacoesComIdempotencia(contrato);
    if (cobertas === 0) {
      app.log.warn(
        { operacoesDeclaradasNoContrato: [...declaradas.keys()] },
        'nenhuma rota idempotente registrada: a conferência não teve o que conferir. ' +
          'As operações acima declaram `Idempotency-Key` no contrato e ainda não têm handler.',
      );
      return;
    }
    app.log.info({ rotasIdempotentes: cobertas }, 'idempotência conferida contra o contrato');
  };
}
