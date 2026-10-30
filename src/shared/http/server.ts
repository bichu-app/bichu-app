/** Borda HTTP: correlação, formato de erro e limite de chamadas. */
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
  /** Contador de teto e o HMAC de IP, instalados no decorador `tetoDeChamada`. */
  readonly teto: DependenciasDoTeto;
  /**
   * Confere e consome `X-Reauth-Token` nas operações que declaram `reauthScope`
   * (BICHUS-48).
   */
  readonly reautenticacao?: VerificadorDeReautenticacao;
  /**
   * Para onde o log vai. So o teste de redacao passa um destino (para ler o que foi
   * escrito); em execucao e a saida padrao, como sempre foi.
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

/** Traduz o erro do framework para o vocabulário do contrato. */
function traduzir(erro: unknown): AppError {
  if (erro instanceof AppError) return erro;
  if (!ehErroDoFastify(erro)) return problemas.interno(erro);

  const status = erro.statusCode ?? 500;
  if (erro.code === 'FST_ERR_VALIDATION' || status === 400) {
    const campos = camposDoSchema(erro.validation);
    if (campos !== undefined) return problemas.validacao(campos, 'Confira os dados enviados.');
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
    void reply.header('Retry-After', String(erro.retryAfterSeconds));
  }
  return reply
    .status(erro.status)
    .header('content-type', `${TIPO_DE_CONTEUDO_DO_PROBLEMA}; charset=utf-8`)
    .send(corpo);
}

export function criarServidor(opcoes: OpcoesDoServidor): RegistradorDeRotas {
  const app = Fastify({
    genReqId: (request) => correlacaoDeEntrada(request.headers[CABECALHO_DE_CORRELACAO]) ?? randomUUID(),
    requestIdHeader: false,
    bodyLimit: opcoes.bodyLimitBytes ?? 1_048_576,
    trustProxy: true,
    disableRequestLogging: false,
    logger: {
      level: opcoes.isProduction ? 'info' : 'debug',
      ...(opcoes.destinoDoLog === undefined ? {} : { stream: opcoes.destinoDoLog }),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-reauth-token"]',
          'req.headers["x-csrf-token"]',
          'req.headers["x-admin-reauth-token"]',
          'res.headers["set-cookie"]',
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
        req: (request) => ({
          method: request.method,
          url: ocultarCodigoDaTagNaUrl(request.url),
          host: request.host,
          remoteAddress: request.ip,
        }),
      },
    },
  });

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
