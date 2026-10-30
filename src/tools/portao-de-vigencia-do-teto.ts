/** Portão de **vigência** do teto de chamada. */
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
  /** Status de cada tentativa, na ordem. */
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

/** Manda `TETO + 1` requisições com assinatura errada e diz se o teto vigorou. */
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
