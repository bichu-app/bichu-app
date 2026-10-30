/** Segredo de runtime lido do Secret Manager do GCP, por HTTP, sem SDK. */
import type { NomeDeSegredo, SecretProvider } from '../../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../../ports/secret-provider.js';
import { TOKEN_DA_CONTA_DE_SERVICO } from './metadados-do-gcp.js';

/** Fonte da credencial da instância. */
const METADADOS = TOKEN_DA_CONTA_DE_SERVICO;
const GERENCIADOR = 'https://secretmanager.googleapis.com/v1';

/** A subida não pode ficar pendurada esperando rede. */
const TIMEOUT_MS = 5_000;
/** Margem antes do vencimento do token. */
const MARGEM_DO_TOKEN_MS = 60_000;

export interface GcpSecretManagerConfig {
  /** Projeto onde os segredos vivem. */
  readonly projeto: string;
  /**
   * Versão a ler. `latest` de propósito: com ela, rotacionar é criar uma versão nova
   * e reiniciar o processo — sem passar por deploy, que é o que faz rotação deixar
   * de ser feita.
   */
  readonly versao: string;
}

/**
 * `fetch` entra por parâmetro para que o teste prove o mapeamento de erro sem
 * rede.
 */
export type Buscar = typeof globalThis.fetch;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** Traduz a resposta do provedor para a exigência 2 da porta. */
function motivoDoStatus(status: number, projeto: string, versao: string): string {
  if (status === 403) {
    return (
      `O gerenciador respondeu 403. São DOIS defeitos possíveis e ele não ` +
      `distingue: (a) o segredo não existe no projeto ${projeto}, ou (b) existe ` +
      `e a conta de serviço da instância não tem ` +
      `roles/secretmanager.secretAccessor NELE. Confira a existência primeiro: ` +
      `"não existe" costuma chegar como 403 para quem não pode listar, e ler ` +
      `isto como problema de IAM é o caminho errado mais comum.`
    );
  }
  if (status === 404) {
    return (
      `O gerenciador respondeu 404: o segredo existe no projeto ${projeto}, mas ` +
      `não tem a versão "${versao}" — ou a única versão dele está desabilitada ` +
      `ou destruída.`
    );
  }
  if (status === 401) {
    return (
      `O gerenciador respondeu 401: o token da instância foi recusado. Não é ` +
      `sobre este segredo — é a conta de serviço da VM.`
    );
  }
  return `O gerenciador respondeu ${String(status)}.`;
}

export function criarSecretProviderGerenciado(
  config: GcpSecretManagerConfig,
  buscar: Buscar = globalThis.fetch,
): SecretProvider {
  let token: { valor: string; venceEm: number } | undefined;

  async function tokenDaInstancia(): Promise<string> {
    const agora = Date.now();
    if (token !== undefined && token.venceEm > agora) return token.valor;

    const resposta = await buscar(METADADOS, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) {
      throw new Error(
        `O servidor de metadados da instância respondeu ${String(resposta.status)}. ` +
          `A VM provavelmente subiu sem conta de serviço anexada, ou sem o escopo ` +
          `cloud-platform. Isso não é consertável por variável de ambiente.`,
      );
    }
    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo) || typeof corpo['access_token'] !== 'string') {
      throw new Error('O servidor de metadados respondeu sem `access_token`.');
    }
    const expiraEm = typeof corpo['expires_in'] === 'number' ? corpo['expires_in'] : 0;
    token = {
      valor: corpo['access_token'],
      venceEm: agora + Math.max(expiraEm * 1000 - MARGEM_DO_TOKEN_MS, 0),
    };
    return token.valor;
  }

  return {
    fonte: `gerenciador de segredos (projeto ${config.projeto}, versão ${config.versao})`,

    async obter(nome: NomeDeSegredo): Promise<string> {
      const alvo = `${GERENCIADOR}/projects/${config.projeto}/secrets/${nome}/versions/${config.versao}:access`;

      let resposta: Response;
      try {
        resposta = await buscar(alvo, {
          headers: { Authorization: `Bearer ${await tokenDaInstancia()}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (erro) {
        throw new SegredoIndisponivelError(
          nome,
          `Não foi possível falar com o gerenciador: ` +
            `${erro instanceof Error ? erro.message : 'erro desconhecido'}.`,
        );
      }

      if (!resposta.ok) {
        throw new SegredoIndisponivelError(
          nome,
          motivoDoStatus(resposta.status, config.projeto, config.versao),
        );
      }

      const corpo: unknown = await resposta.json();
      const payload = ehObjeto(corpo) ? corpo['payload'] : undefined;
      const dados = ehObjeto(payload) ? payload['data'] : undefined;
      if (typeof dados !== 'string') {
        throw new SegredoIndisponivelError(
          nome,
          'O gerenciador respondeu 200 sem `payload.data`. O corpo NÃO é ' +
            'impresso aqui: ele pode conter o valor.',
        );
      }

      const valor = Buffer.from(dados, 'base64').toString('utf8');
      if (valor === '') {
        throw new SegredoIndisponivelError(
          nome,
          `A versão "${config.versao}" existe no projeto ${config.projeto} e está ` +
            `VAZIA. Provável gravação com arquivo vazio; crie uma versão nova.`,
        );
      }
      return valor;
    },
  };
}
