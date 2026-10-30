/** Push entregue ao FCM, pela API HTTP v1, por HTTP, sem SDK. */
import { assegurarSuperficiePublica } from '../../domain/conteudo-do-push.js';
import type {
  MensagemDePush,
  PushSender,
  ResultadoDoEnvio,
} from '../../ports/push-sender.js';
import { PushNaoEnviadoError } from '../../ports/push-sender.js';
import { TOKEN_DA_CONTA_DE_SERVICO } from '../../../../shared/adapters/external/metadados-do-gcp.js';

/** Fonte da credencial da instância. */
const METADADOS = TOKEN_DA_CONTA_DE_SERVICO;
const ENVIO = 'https://fcm.googleapis.com/v1';

/** O envio não pode ficar pendurado: a fila reenfileira, o processo segue. */
const TIMEOUT_MS = 10_000;
/** Margem antes do vencimento do token, igual à do adaptador de segredos. */
const MARGEM_DO_TOKEN_MS = 60_000;

export interface FcmConfig {
  /** Projeto do Firebase para onde o envio vai. */
  readonly projeto: string;
}

/** `fetch` entra por parâmetro para que o teste prove o mapeamento sem rede. */
export type Buscar = typeof globalThis.fetch;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** O `errorCode` do transporte, quando ele vem. */
function errorCodeDoCorpo(corpo: unknown): string | undefined {
  const erro = ehObjeto(corpo) ? corpo['error'] : undefined;
  if (!ehObjeto(erro)) return undefined;
  const detalhes: unknown = erro['details'];
  if (Array.isArray(detalhes)) {
    for (const detalhe of detalhes as unknown[]) {
      if (ehObjeto(detalhe) && typeof detalhe['errorCode'] === 'string') {
        return detalhe['errorCode'];
      }
    }
  }
  return typeof erro['status'] === 'string' ? erro['status'] : undefined;
}

/** Traduz a falha do transporte para o que quem chamou precisa decidir. */
function motivoDoErro(
  status: number,
  errorCode: string | undefined,
  projeto: string,
): PushNaoEnviadoError | 'aparelho-sumiu' {
  if (errorCode === 'UNREGISTERED' || errorCode === 'NOT_FOUND' || status === 404) {
    return 'aparelho-sumiu';
  }

  if (errorCode === 'SENDER_ID_MISMATCH') {
    return new PushNaoEnviadoError(
      'projeto-divergente',
      false,
      `O transporte recusou o token porque ele foi emitido por OUTRO projeto ` +
        `do Firebase, e o envio saiu do projeto ${projeto}. Isto NÃO é token ` +
        `inválido e apagar o aparelho não resolve: o build instalado volta a ` +
        `registrar no mesmo projeto errado e o defeito reaparece parecendo ` +
        `intermitente. Confira se o google-services.json do APK e a ` +
        `configuração deste processo apontam para o mesmo projeto.`,
    );
  }

  if (errorCode === 'THIRD_PARTY_AUTH_ERROR') {
    return new PushNaoEnviadoError(
      'credencial-apns',
      false,
      `O transporte aceitou a nossa credencial e não conseguiu falar com a ` +
        `plataforma que entrega no aparelho. Em aparelho Apple isto é a chave ` +
        `APNs (.p8) ausente ou inválida no projeto ${projeto} — pendência da ` +
        `conta Apple, registrada em BICHUS-136. Não é defeito deste código e ` +
        `não afeta Android.`,
    );
  }

  if (errorCode === 'INVALID_ARGUMENT' || status === 400) {
    return new PushNaoEnviadoError(
      'mensagem-malformada',
      false,
      `O transporte recusou a mensagem por forma, e repeti-la vai falhar ` +
        `igual. O defeito é nosso, na montagem. O corpo do erro NÃO é ` +
        `impresso aqui: ele repete o payload recusado.`,
    );
  }

  if (status === 401 || status === 403) {
    return new PushNaoEnviadoError(
      'credencial',
      false,
      `O transporte respondeu ${String(status)}: a credencial da instância foi ` +
        `recusada. Não é sobre este aparelho nem sobre esta mensagem — é a ` +
        `conta de serviço da máquina. Ela precisa da permissão ` +
        `cloudmessaging.messages.create no projeto ${projeto}.`,
    );
  }

  if (status === 429 || errorCode === 'QUOTA_EXCEEDED') {
    return new PushNaoEnviadoError(
      'cota',
      true,
      'Cota do transporte estourada. Vale tentar de novo com espera.',
    );
  }

  if (status >= 500 || errorCode === 'UNAVAILABLE' || errorCode === 'INTERNAL') {
    return new PushNaoEnviadoError(
      'transporte-indisponivel',
      true,
      `O transporte respondeu ${String(status)}. É dele e passa; vale tentar de novo.`,
    );
  }

  return new PushNaoEnviadoError(
    'desconhecido',
    false,
    `O transporte respondeu ${String(status)}${
      errorCode === undefined ? '' : ` (${errorCode})`
    }, que este adaptador não sabe ler. Precisa de olho humano.`,
  );
}

export function criarPushSenderFcm(
  config: FcmConfig,
  buscar: Buscar = globalThis.fetch,
): PushSender {
  let token: { valor: string; venceEm: number } | undefined;

  async function tokenDaInstancia(): Promise<string> {
    const agora = Date.now();
    if (token !== undefined && token.venceEm > agora) return token.valor;

    const resposta = await buscar(METADADOS, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) {
      throw new PushNaoEnviadoError(
        'credencial',
        false,
        `O servidor de metadados da instância respondeu ` +
          `${String(resposta.status)}. A máquina provavelmente subiu sem conta ` +
          `de serviço anexada, ou sem o escopo cloud-platform. Isso não é ` +
          `consertável por variável de ambiente, e NÃO adianta tentar de novo.`,
      );
    }
    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo) || typeof corpo['access_token'] !== 'string') {
      throw new PushNaoEnviadoError(
        'credencial',
        false,
        'O servidor de metadados respondeu sem `access_token`.',
      );
    }
    const expiraEm = typeof corpo['expires_in'] === 'number' ? corpo['expires_in'] : 0;
    token = {
      valor: corpo['access_token'],
      venceEm: agora + Math.max(expiraEm * 1000 - MARGEM_DO_TOKEN_MS, 0),
    };
    return token.valor;
  }

  return {
    transporte: `FCM HTTP v1 (projeto ${config.projeto})`,

    async enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio> {
      assegurarSuperficiePublica(mensagem);

      const corpoDoEnvio = {
        message: {
          token: mensagem.token,
          notification: { title: mensagem.titulo, body: mensagem.corpo },
          data: { ...mensagem.dados },
          android: {
            priority: mensagem.prioridade === 'alta' ? 'HIGH' : 'NORMAL',
            ttl: `${String(mensagem.validadeEmSegundos)}s`,
            collapse_key: mensagem.chaveDeAgrupamento,
            ...(mensagem.imagemUrl === undefined
              ? {}
              : { notification: { image: mensagem.imagemUrl } }),
          },
        },
      };

      const alvo = `${ENVIO}/projects/${config.projeto}/messages:send`;

      let resposta: Response;
      try {
        resposta = await buscar(alvo, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await tokenDaInstancia()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(corpoDoEnvio),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (erro) {
        if (erro instanceof PushNaoEnviadoError) throw erro;
        throw new PushNaoEnviadoError(
          'rede',
          true,
          `Não foi possível falar com o transporte: ` +
            `${erro instanceof Error ? erro.message : 'erro desconhecido'}. ` +
            `O token do aparelho NÃO entra nesta mensagem.`,
        );
      }

      if (resposta.ok) return 'aceito';

      let errorCode: string | undefined;
      try {
        errorCode = errorCodeDoCorpo(await resposta.json());
      } catch {
        errorCode = undefined;
      }

      const traduzido = motivoDoErro(resposta.status, errorCode, config.projeto);
      if (traduzido === 'aparelho-sumiu') return 'aparelho-sumiu';
      throw traduzido;
    },
  };
}
