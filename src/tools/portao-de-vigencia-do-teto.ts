/**
 * Portão de **vigência** do teto de chamada.
 *
 * ## Por que ele existe, e por que o portão que já existia não basta
 *
 * `infra/verificacao/verificar-limite-de-chamada.mjs` lê `api/openapi.yaml` e
 * prova que o teto está **declarado**. Ele nunca abre `src/`, e passou com
 * "80 operacoes, 0 achados" durante todo o período em que nenhuma rota aplicava
 * nada. Ele continua existindo e continua útil — o que ele não pode é seguir
 * sendo lido como prova de que o teto vale.
 *
 * Este aqui responde a outra pergunta, e responde exercendo o serviço: sobe a
 * borda de verdade, registra a rota de verdade e manda requisição até estourar.
 *
 * ## A rota escolhida, e por que é ela
 *
 * `POST /webhooks/postmark`. Pela Emenda 1 do ADR-0016, é a única rota do
 * produto sem freio em nenhuma camada: internet aberta, sem `basic_auth` na
 * borda por decisão registrada, autenticada só pelo segredo, e com conferência
 * de assinatura **em tempo constante**, que é deliberadamente cara. O teto de 20
 * inválidas por hora é descrito no próprio arquivo como a única defesa contra
 * transformar a rota num moedor de CPU.
 *
 * ## O que a 21ª resposta prova
 *
 * A 21ª tentativa inválida precisa sair **429 com `type: rate-limited`**, e não
 * 401. A distinção não é cosmética, é a prova de que a assinatura não chegou a
 * ser conferida: `registrarRota` empilha o gancho do teto antes do gancho da
 * rota, e um gancho que lança aborta a cadeia. Sair `rate-limited` só é possível
 * se o teto lançou primeiro; se a conferência tivesse acontecido, ela teria
 * lançado `unauthenticated` e a resposta seria 401.
 *
 * ## Verificação que não consegue verificar REPROVA
 *
 * Contrato ilegível, rota que não responde, menos respostas do que chamadas:
 * todos terminam em veredito reprovado com o motivo. Nenhum deles aprova por
 * falta do que checar — foi assim que o portão anterior ficou verde por semanas.
 */
import { carregarContrato } from '../shared/http/contract.js';
import { criarServidor } from '../shared/http/server.js';
import { dependenciasDoTeto } from '../shared/http/aplicacao-de-teto.js';
import { registrarRotaDoWebhookDeEntrega } from '../modules/notifications/adapters/http/webhook-de-entrega.js';
import type { RateLimitStore } from '../shared/ports/rate-limit-store.js';
import type { AbsoluteUrl } from '../shared/types/brands.js';

/** O teto declarado na rota: 20 inválidas por hora, por IP, com `deny_429`. */
export const TETO_DE_INVALIDAS_DO_WEBHOOK = 20;

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CHAVE_DE_HMAC = Buffer.alloc(32, 11);

export interface VeredictoDeVigencia {
  readonly aprovado: boolean;
  readonly motivo: string;
  /** Status de cada tentativa, na ordem. Fica no relato para leitura humana. */
  readonly status: readonly number[];
  readonly tipoDaUltima: string | undefined;
}

interface CorpoDeProblema {
  readonly type?: unknown;
}

function slugDoTipo(corpo: string): string | undefined {
  try {
    const { type } = JSON.parse(corpo) as CorpoDeProblema;
    if (typeof type !== 'string') return undefined;
    return type.slice(type.lastIndexOf('/') + 1);
  } catch {
    return undefined;
  }
}

/**
 * Manda `TETO + 1` requisições com assinatura errada e diz se o teto vigorou.
 *
 * O contador é parâmetro, e é o que torna a isca possível: o mesmo caminho
 * rodado com `criarContadorDesligado()` **precisa** reprovar.
 */
export async function exercerTetoDoWebhook(
  contador: RateLimitStore,
  caminhoDoContrato = 'api/openapi.yaml',
): Promise<VeredictoDeVigencia> {
  const contrato = carregarContrato(caminhoDoContrato);

  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: dependenciasDoTeto({ contador, chaveDeHmac: CHAVE_DE_HMAC, log: () => {} }),
  });

  registrarRotaDoWebhookDeEntrega(app, {
    registro: {
      registrar: () => Promise.resolve(true),
      marcarEnderecoNaoEntregavel: () => Promise.resolve(true),
    },
    segredo: Buffer.from('segredo-que-o-atacante-nao-tem!!', 'utf8'),
    contrato,
  });

  const status: number[] = [];
  let tipoDaUltima: string | undefined;

  try {
    for (let tentativa = 1; tentativa <= TETO_DE_INVALIDAS_DO_WEBHOOK + 1; tentativa += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/webhooks/postmark',
        headers: {
          'content-type': 'application/json',
          'x-postmark-signature': 'assinatura-errada',
          // Mesmo endereço nas 21: o teto é por IP, e variar o endereço
          // espalharia as tentativas por 21 baldes e nunca estouraria nenhum.
          'x-forwarded-for': '203.0.113.9',
        },
        payload: { RecordType: 'Bounce', MessageID: `m-${String(tentativa)}` },
      });
      status.push(resposta.statusCode);
      tipoDaUltima = slugDoTipo(resposta.body);
    }
  } finally {
    await app.close();
  }

  const esperadas = TETO_DE_INVALIDAS_DO_WEBHOOK + 1;
  if (status.length !== esperadas) {
    return {
      aprovado: false,
      motivo: `esperava ${String(esperadas)} respostas e vieram ${String(status.length)}: o portão não conseguiu exercer a rota`,
      status,
      tipoDaUltima,
    };
  }

  const antesDoTeto = status.slice(0, TETO_DE_INVALIDAS_DO_WEBHOOK);
  if (!antesDoTeto.every((codigo) => codigo === 401)) {
    return {
      aprovado: false,
      motivo: `as ${String(TETO_DE_INVALIDAS_DO_WEBHOOK)} primeiras tentativas inválidas deveriam sair 401 e saíram ${antesDoTeto.join(',')}`,
      status,
      tipoDaUltima,
    };
  }

  const ultima = status[TETO_DE_INVALIDAS_DO_WEBHOOK];
  if (ultima !== 429) {
    return {
      aprovado: false,
      motivo:
        `a ${String(esperadas)}ª tentativa inválida saiu ${String(ultima)} e deveria sair 429. ` +
        'O teto declarado em `x-rate-limit` não está sendo aplicado: é o defeito da BICHUS-178.',
      status,
      tipoDaUltima,
    };
  }

  if (tipoDaUltima !== 'rate-limited') {
    return {
      aprovado: false,
      motivo:
        `a recusa saiu 429 com \`type: ${tipoDaUltima ?? '(ausente)'}\` em vez de \`rate-limited\`. ` +
        'Sem esse tipo não dá para afirmar que a assinatura deixou de ser conferida.',
      status,
      tipoDaUltima,
    };
  }

  return {
    aprovado: true,
    motivo: `teto vigente: ${String(TETO_DE_INVALIDAS_DO_WEBHOOK)} recusas de assinatura e a seguinte recusada por teto, antes da conferência`,
    status,
    tipoDaUltima,
  };
}
