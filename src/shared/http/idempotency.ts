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
import type { Db } from '../db/pool.js';
import { hashDeCorpo, iguaisEmTempoConstante } from '../crypto/digest.js';
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
