/**
 * Borda HTTP: correlação, formato de erro e limite de chamadas.
 *
 * Nada aqui conhece domínio. O que este arquivo garante, e que vale para toda
 * resposta do produto:
 *
 * - **todo erro sai em `application/problem+json`**, inclusive os que o
 *   framework produz sozinho (corpo malformado, rota inexistente, corpo grande
 *   demais). `200` com `{"erro": ...}` quebra todo cliente que confia no
 *   protocolo, e um 404 em HTML do framework quebra do mesmo jeito;
 * - **`correlation_id` é o mesmo no corpo, no cabeçalho e no log**, que é o que
 *   permite depurar um fluxo inteiro a partir de um print de tela;
 * - **detalhe técnico nunca sai na resposta.** Stack, consulta e dado de outro
 *   usuário ficam no log interno.
 */
import Fastify, {
  type FastifyBaseLogger,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AbsoluteUrl } from '../types/brands.js';
import type { DependenciasDoTeto } from './aplicacao-de-teto.js';
import type { RegistradorDeRotas, VerificadorDeReautenticacao } from './registrar-rota.js';
import { AppError, problemas } from './errors.js';
import { ocultarCodigoDaTagNaUrl } from './redacao-de-url.js';
import { camposDoSchema } from './erros-de-schema.js';
import {
  montarProblema,
  TIPO_DE_CONTEUDO_DO_PROBLEMA,
  type ProblemBody,
} from './problem-response.js';

export const CABECALHO_DE_CORRELACAO = 'x-correlation-id';

export interface OpcoesDoServidor {
  readonly problemBaseUrl: AbsoluteUrl;
  readonly isProduction: boolean;
  readonly bodyLimitBytes?: number;
  /**
   * Contador de teto e o HMAC de IP, instalados no decorador `tetoDeChamada`.
   *
   * **Obrigatório de propósito.** Enquanto o servidor podia ser criado sem
   * contador, criar um servidor sem teto era a coisa mais fácil do mundo — e
   * foi o que aconteceu: `server.ts` não mencionava limite de chamada em lugar
   * nenhum e as 80 operações declaravam tetos que ninguém aplicava
   * (BICHUS-178, adr/ADR-0016 Emenda 1). Em teste, `criarContadorEmMemoria`
   * ou `criarContadorDesligado` servem; em produção, quem escolhe é
   * `RATE_LIMIT_DRIVER`, e `disabled` fora de `dev` não sobe.
   */
  readonly teto: DependenciasDoTeto;
  /**
   * Confere e consome `X-Reauth-Token` nas operações que declaram
   * `reauthScope` (BICHUS-48).
   *
   * **Opcional aqui e obrigatório lá.** Um servidor que não registra nenhuma
   * rota destrutiva não precisa dele, e exigi-lo de todas as bancadas de teste
   * seria ruído. Mas `registrarRota` derruba a subida quando uma rota declara
   * `reauthScope` e este campo não veio: a operação destrutiva nunca chega a
   * ser servida sem a segunda credencial.
   */
  readonly reautenticacao?: VerificadorDeReautenticacao;
  /**
   * Para onde o log vai. So o teste de redacao passa um destino (para ler o que
   * foi escrito); em execucao e a saida padrao, como sempre foi.
   */
  readonly destinoDoLog?: { write(linha: string): void };
}

/** Só aceita correlação vinda de fora se ela tiver a forma de um UUID. */
function correlacaoDeEntrada(cabecalho: unknown): string | undefined {
  if (typeof cabecalho !== 'string') return undefined;
  const formato = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return formato.test(cabecalho) ? cabecalho.toLowerCase() : undefined;
}

function ehErroDoFastify(
  erro: unknown,
): erro is { statusCode?: number; code?: string; message: string; validation?: unknown } {
  return typeof erro === 'object' && erro !== null && 'message' in erro;
}

/**
 * Traduz o erro do framework para o vocabulário do contrato.
 *
 * O mapeamento é por **causa**, não por status: dois problemas diferentes
 * respondem 400, e deduzir o `type` do status faria a tela tratar os dois igual,
 * que é justamente o que a regra "o cliente decide por `type`" existe para
 * impedir.
 */
function traduzir(erro: unknown): AppError {
  if (erro instanceof AppError) return erro;
  if (!ehErroDoFastify(erro)) return problemas.interno(erro);

  const status = erro.statusCode ?? 500;
  if (erro.code === 'FST_ERR_VALIDATION' || status === 400) {
    // O Fastify entrega o achado do Ajv em `erro.validation`, e é dele que sai o
    // NOME do campo. Enquanto isto era uma cadeia vazia, o 400 de corpo dizia
    // "um ou mais campos" sem dizer qual — e `errors[].field` existe no contrato
    // exatamente para a tela marcar um.
    const campos = camposDoSchema(erro.validation);
    if (campos !== undefined) return problemas.validacao(campos, 'Confira os dados enviados.');
    // Sem achado para ler não há campo a nomear: corpo que nem chegou a ser JSON
    // (`FST_ERR_CTP_EMPTY_JSON_BODY`, parse que falhou) cai aqui. Inventar um
    // nome seria mandar a pessoa corrigir o que está certo.
    return problemas.validacao(
      [{ field: '', code: 'schema', message: 'Um ou mais campos não passaram na validação.' }],
      'Confira os dados enviados.',
    );
  }
  if (status === 404) return problemas.naoEncontrado();
  if (status === 401) return problemas.naoAutenticado();
  if (status === 413) {
    return problemas.validacao([{ field: '', code: 'too_large', message: 'O envio é grande demais.' }]);
  }
  if (status === 415) {
    return problemas.validacao([
      { field: 'Content-Type', code: 'unsupported', message: 'Envie o corpo como JSON.' },
    ]);
  }
  if (status === 429) return problemas.limiteDeChamadas(60);
  return problemas.interno(erro);
}

export function responderProblema(
  request: FastifyRequest,
  reply: FastifyReply,
  erro: AppError,
  problemBaseUrl: AbsoluteUrl,
): FastifyReply {
  // `instance` também carrega o caminho, e o caminho da rota pública carrega o
  // código da tag. Quem recebe o corpo já tem o código, mas o corpo de erro é
  // justamente o que acaba colado em chamado de suporte e em relato de defeito.
  const corpo: ProblemBody = montarProblema(
    erro,
    problemBaseUrl,
    request.id,
    ocultarCodigoDaTagNaUrl(request.url),
  );
  for (const [nome, valor] of Object.entries(erro.cabecalhos ?? {})) {
    void reply.header(nome, valor);
  }
  if (erro.retryAfterSeconds !== undefined) {
    // A RFC 9110 exige `Retry-After` no 429, e o cliente offline precisa dele
    // para decidir quando reenviar a fila em vez de martelar.
    void reply.header('Retry-After', String(erro.retryAfterSeconds));
  }
  return reply
    .status(erro.status)
    .header('content-type', `${TIPO_DE_CONTEUDO_DO_PROBLEMA}; charset=utf-8`)
    .send(corpo);
}

export function criarServidor(opcoes: OpcoesDoServidor): RegistradorDeRotas {
  const app = Fastify({
    // Correlação: aproveita a de fora quando ela tem forma de UUID, e gera uma
    // quando não tem. Aceitar qualquer texto do cliente deixaria o log ser
    // envenenado por quem chama.
    genReqId: (request) => correlacaoDeEntrada(request.headers[CABECALHO_DE_CORRELACAO]) ?? randomUUID(),
    requestIdHeader: false,
    // Teto de corpo na aplicação além do teto da borda: basta uma rota interna
    // nova para a borda ser contornada (ADR-0001).
    bodyLimit: opcoes.bodyLimitBytes ?? 1_048_576,
    trustProxy: true,
    disableRequestLogging: false,
    logger: {
      level: opcoes.isProduction ? 'info' : 'debug',
      ...(opcoes.destinoDoLog === undefined ? {} : { stream: opcoes.destinoDoLog }),
      redact: {
        // Credencial nunca entra no log, nem por acidente de serialização.
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-reauth-token"]',
          // Backoffice (ADR-0027). O cookie `__Host-bichu_adm` viaja em
          // `req.headers.cookie`, ja acima; o `Set-Cookie` que o login e a
          // reautenticacao devolvem carrega o MESMO valor, e o anti-CSRF e a
          // janela de reautenticacao sao credenciais por si.
          'req.headers["x-csrf-token"]',
          'req.headers["x-admin-reauth-token"]',
          'res.headers["set-cookie"]',
          // E a mesma lista sob `headers` na raiz do objeto logado: e a forma
          // de quem escreve `request.log.info({ headers: request.headers })`
          // para depurar, e `req.headers.*` nao a alcanca.
          'headers.authorization',
          'headers.cookie',
          'headers["set-cookie"]',
          'headers["x-reauth-token"]',
          'headers["x-csrf-token"]',
          'headers["x-admin-reauth-token"]',
          'req.body.password',
          'req.body.new_password',
          'req.body.current_password',
          'req.body.refresh_token',
          'req.body.token',
        ],
        censor: '[removido]',
      },
      serializers: {
        // `redact` não alcança a URL: ela não é um campo, é parte do caminho. O
        // código da tag é uma credencial ao portador e entraria em claro em toda
        // linha de log de acesso da rota mais pública do produto (ADR-0004).
        req: (request) => ({
          method: request.method,
          url: ocultarCodigoDaTagNaUrl(request.url),
          host: request.host,
          remoteAddress: request.ip,
        }),
      },
    },
  });

  // O contador viaja no próprio servidor e não numa dependência que cada
  // módulo precisaria receber. `registrarRota` o lê daqui, e um servidor sem
  // ele derruba o registro na subida em vez de servir rota sem teto.
  app.decorate('tetoDeChamada', opcoes.teto);
  if (opcoes.reautenticacao !== undefined) {
    app.decorate('reautenticacao', opcoes.reautenticacao);
  }

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header(CABECALHO_DE_CORRELACAO, request.id);
    done(null, payload);
  });

  app.setErrorHandler((erro, request, reply) => {
    const traduzido = traduzir(erro);
    if (traduzido.status >= 500) {
      // O detalhe técnico fica aqui, e só aqui.
      request.log.error({ err: erro }, 'falha não tratada');
    } else {
      request.log.info({ problem: traduzido.problemType, status: traduzido.status }, 'pedido recusado');
    }
    return responderProblema(request, reply, traduzido, opcoes.problemBaseUrl);
  });

  app.setNotFoundHandler((request, reply) =>
    responderProblema(request, reply, problemas.naoEncontrado(), opcoes.problemBaseUrl),
  );

  return app;
}

export type Logger = FastifyBaseLogger;
