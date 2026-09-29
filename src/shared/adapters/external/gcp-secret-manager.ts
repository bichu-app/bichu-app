/**
 * Segredo de runtime lido do Secret Manager do GCP, por HTTP, sem SDK.
 *
 * **Este é o único arquivo do sistema que sabe que existe GCP**, e é por isso
 * que ele mora em `adapters/external/` — o mesmo lugar e a mesma regra que
 * fazem de `s3-object-storage.ts` o único que sabe que existe S3. Quem consome
 * enxerga `SecretProvider` (ADR-0022, ADR-0007 §11.1).
 *
 * ## Por que REST à mão, e não `@google-cloud/secret-manager`
 *
 * A pergunta foi feita de novo, com o mesmo critério do cabeçalho do
 * `s3-object-storage.ts`, e deu a mesma resposta — por três razões, e a terceira
 * só existe neste caso:
 *
 * 1. **O projeto tem quatro dependências de produção** (`fastify`, `kysely`,
 *    `pg`, `yaml`; mais `sharp`, que é de imagem). O cliente da biblioteca puxa
 *    gRPC, protobuf, a camada de autenticação do Google e o resto da árvore —
 *    dezenas de pacotes transitivos para fazer **uma** requisição `GET` na
 *    subida do processo. E o nome do provedor entraria no `package.json`, que é
 *    o lugar mais difícil de tirar depois.
 * 2. **A superfície usada é uma chamada.** `versions/latest:access` devolve
 *    JSON com o valor em base64. Não há paginação, não há streaming, não há
 *    retentativa sofisticada para herdar. São ~40 linhas de HTTP contra um
 *    acoplamento que o ADR-0012 existe para evitar.
 * 3. **A liberação de lint é por módulo, não por `src/`.** A exceção de
 *    `no-restricted-imports` em `eslint.config.mjs` cobre
 *    `src/modules/<módulo>/adapters/external/`, e esta porta é transversal:
 *    mora em `shared/`. Importar o SDK daqui reprovaria no lint, e a saída
 *    seria afrouxar a regra de confinamento de SDK para todo o `src/shared/` —
 *    pagar com a fronteira de arquitetura inteira por uma conveniência de
 *    quarenta linhas. **Sem SDK, a pergunta não se coloca.**
 *
 * A decisão se inverte no dia em que precisarmos de rotação com notificação por
 * Pub/Sub ou de CMEK — e nesse dia ela se inverte AQUI, sem tocar em mais nada.
 *
 * ## De onde vem a credencial
 *
 * Do servidor de metadados da própria instância: a VM carrega uma conta de
 * serviço, e o token sai dela. **Não há chave de conta de serviço em arquivo
 * nenhum**, e isso não é economia de configuração — é o ponto. Um JSON de conta
 * de serviço no disco seria o `.env` de volta, com a agravante de abrir o
 * gerenciador inteiro em vez de um segredo, e de ser tão copiável quanto.
 *
 * ## O que este arquivo deliberadamente não faz
 *
 * Não cria, não escreve, não apaga e não lista segredo. A porta só lê. Criação
 * e IAM são do operador, no roteiro de provisionamento, e a conta de serviço da
 * VM recebe `roles/secretmanager.secretAccessor` **por segredo** — nunca no
 * projeto.
 */
import type { NomeDeSegredo, SecretProvider } from '../../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../../ports/secret-provider.js';
import { TOKEN_DA_CONTA_DE_SERVICO } from './metadados-do-gcp.js';

/** Fonte da credencial da instância. Não é domínio público: só resolve dentro da VM. */
const METADADOS = TOKEN_DA_CONTA_DE_SERVICO;
const GERENCIADOR = 'https://secretmanager.googleapis.com/v1';

/** A subida não pode ficar pendurada esperando rede. Morre e o supervisor reinicia. */
const TIMEOUT_MS = 5_000;
/** Margem antes do vencimento do token. Resolver sete segredos leva menos que isto. */
const MARGEM_DO_TOKEN_MS = 60_000;

export interface GcpSecretManagerConfig {
  /** Projeto onde os segredos vivem. Vem de `SECRET_STORE_PROJECT`. */
  readonly projeto: string;
  /**
   * Versão a ler. `latest` de propósito: com ela, rotacionar é criar uma versão
   * nova e reiniciar o processo — sem passar por deploy, que é o que faz
   * rotação deixar de ser feita. Fixar um número aqui devolveria a rotação para
   * dentro do ciclo de entrega.
   */
  readonly versao: string;
}

/** `fetch` entra por parâmetro para que o teste prove o mapeamento de erro sem rede. */
export type Buscar = typeof globalThis.fetch;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Traduz a resposta do provedor para a exigência 2 da porta.
 *
 * **`403` é o caso que justifica esta função existir.** O Secret Manager
 * responde `PERMISSION_DENIED` tanto para "a conta não tem acesso" quanto,
 * frequentemente, para "o segredo não existe" — porque dizer "não existe" a
 * quem não pode listar já seria vazar a existência dele. Quem lê
 * `permission denied` no log de subida conclui "problema de IAM", vai mexer em
 * papel, e o defeito era um segredo que ninguém criou. As duas leituras
 * precisam estar na mensagem, junto do nome.
 */
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
      // O nome da variável É o identificador do segredo. Sem tabela de
      // tradução e sem prefixo montado aqui — exigência 1 da porta.
      const alvo = `${GERENCIADOR}/projects/${config.projeto}/secrets/${nome}/versions/${config.versao}:access`;

      let resposta: Response;
      try {
        resposta = await buscar(alvo, {
          headers: { Authorization: `Bearer ${await tokenDaInstancia()}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (erro) {
        // Rede, DNS, timeout e o metadados fora do ar caem aqui. Sem este
        // `catch` o erro subiria sem o nome do segredo dentro, que é
        // exatamente o que a exigência 2 da porta proíbe.
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

      // `data` vem em base64, e o que sai daqui são os bytes como foram
      // gravados — sem `trim`. Exigência 4 da porta: o PEM precisa da quebra
      // final e a chave hexadecimal não pode ter nenhuma, e quem sabe de qual
      // se trata é o `app-config.ts`.
      const valor = Buffer.from(dados, 'base64').toString('utf8');
      if (valor === '') {
        // Exigência 3: vazio é ausência. Um segredo criado com o arquivo
        // errado grava uma versão vazia sem reclamar, e ela passaria por
        // valor legítimo até a primeira assinatura falhar, em outro lugar.
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
