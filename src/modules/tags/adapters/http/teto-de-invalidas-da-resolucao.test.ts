/**
 * Os DOIS tetos de tentativa inválida de `GET /v1/tags/:code`, medidos pela
 * posição da recusa.
 *
 * ## Por que dois casos, e não um
 *
 * `resolveTagCode` declara duas entradas `applies_to: invalid_attempts`, e elas
 * não são redundantes — uma é a saída da outra:
 *
 * - `['finder_identity']`, 5 por 10 min. O balde é
 *   `hmacDeIdentidadeDoAchador(request.ip, user-agent, chave)`. Quem adivinha
 *   código tem cinco palpites por identidade.
 * - `['ip']`, 20 por hora. O balde é só o endereço.
 *
 * A segunda existe porque o `User-Agent` entra na primeira, e ele é do
 * atacante. Trocar o cabeçalho a cada cinco palpites dá balde novo e escapa
 * inteiro da entrada por identidade. A entrada por IP é o que fecha essa saída,
 * e **é exatamente isso que o segundo caso deste arquivo faz**: ele varia o
 * `User-Agent` de propósito, porque a evasão é o cenário que a entrada existe
 * para cobrir. Um caso que fixasse o cabeçalho pararia na sexta tentativa e
 * nunca chegaria perto do teto por IP.
 *
 * ## Por que a POSIÇÃO, e não "alguma resposta foi 429"
 *
 * A rota declara SEIS entradas de teto. Medir presença de 429 não distingue
 * qual delas recusou, e as duas de invalidas respondem o mesmo código. A
 * posição distingue, e distingue nos dois sentidos:
 *
 * - No caso da identidade, a recusa na 6ª não pode ser a entrada por IP: ela
 *   permite 20, e na 6ª só há 5 contadas.
 * - No caso do IP, as 20 primeiras saírem 404 já **prova** que a entrada por
 *   identidade não estava contando — se estivesse, a 6ª teria sido 429.
 *
 * As outras quatro entradas não podem recusar aqui: `serve_cache` e
 * `notify_owner` não são recusa, `['ip']` 300/h e `['ip_24']` 2000/h estão
 * ordens de magnitude acima de 21, e o código varia a cada tentativa, então o
 * balde `['ip','code']` de 30/h recebe uma contagem por chave.
 *
 * ## O relógio é CONGELADO, e isso não é conveniência
 *
 * As janelas deste produto são fixas e alinhadas ao epoch
 * (`inicioDaJanela`: `floor(agora / janela) * janela`), e não deslizantes. Com
 * `Date.now()` um caso de 21 requisições pode atravessar a virada da janela, o
 * balde zerar no meio e a recusa não acontecer onde o caso a espera — verde ou
 * vermelho decidido pelo minuto em que a suíte rodou. Congelar remove essa
 * classe inteira, e tem um segundo efeito que o caso aproveita: o `Retry-After`
 * passa a ser exato, e os dois tetos têm janelas diferentes (300 s contra
 * 3300 s neste instante). Esse número é a terceira prova de QUAL entrada
 * recusou, e ela é independente da posição.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { gerarCodigoDaTag } from '../../domain/tag-code.js';
import { problemas } from '../../../../shared/http/errors.js';
import { registrarRota, zerarInventario } from '../../../../shared/http/registrar-rota.js';
import {
  resolvedoresDaTag,
  rotaDeResolucaoDaTag,
  type DependenciasDasRotasDeTag,
} from './tag-routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type { RateLimitEntry } from '../../../../shared/http/route-definition.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

/** O endereço do atacante. O MESMO nas duas medições: o teto é por IP. */
const ENDERECO = '198.51.100.7';

/**
 * Os números que `api/openapi.yaml` declara em `resolveTagCode`, repetidos aqui
 * de propósito.
 *
 * Ler o esperado de `rotaDeResolucaoDaTag.rateLimit` seria comparar a
 * declaração consigo mesma: trocar 5 por 50 na rota passaria, porque o caso
 * passaria a cobrar 50. A distância entre os dois lugares é o que transforma
 * "o número mudou" em suíte vermelha, e o último caso deste arquivo é o que
 * cruza os dois.
 */
const TETO_POR_IDENTIDADE = 5;
const TETO_POR_ENDERECO = 20;

/**
 * Instante fixo: 22/09/2026 12:05:00 UTC.
 *
 * Escolhido por caber com folga DENTRO das duas janelas alinhadas, o que torna
 * o `Retry-After` determinístico:
 * - janela de 10 min → começa 12:00:00, vence 12:10:00 → faltam 300 s
 * - janela de 1 h    → começa 12:00:00, vence 13:00:00 → faltam 3300 s
 */
const AGORA = Date.UTC(2026, 8, 22, 12, 5, 0);
const FALTAM_NA_JANELA_DE_10_MIN = 300;
const FALTAM_NA_JANELA_DE_1_HORA = 3300;

/**
 * Códigos bem formados que não existem.
 *
 * Precisam passar por `normalizarCodigoDaTag` — um código malformado é recusado
 * antes, com `tag-code-malformed`, e o balde `['ip','code']` seria pulado por
 * falta de valor. Bem formado e inexistente é o palpite do enumerador: é o que
 * custa uma consulta ao índice cego antes de virar 404.
 */
function codigoInexistente(semente: number): string {
  const bytes = new Uint8Array(10);
  bytes[0] = semente & 0xff;
  bytes[1] = (semente >> 8) & 0xff;
  bytes[2] = 0xa5;
  return gerarCodigoDaTag(bytes);
}

/**
 * As dependências que os resolvedores de produção exigem.
 *
 * `resolvedoresDaTag` toca `ipHmacKey` e mais nada; `chamadorOpcional` toca o
 * autenticador. O resto é objeto vazio com a marca de tipo, que é mais honesto
 * do que montar um serviço inteiro que este arquivo não exerce.
 */
function dependenciasDeTeste(): DependenciasDasRotasDeTag {
  return {
    tags: {
      resolver: () => Promise.reject(problemas.tagCodeNaoEncontrado()),
    } as unknown as DependenciasDasRotasDeTag['tags'],
    autenticador: { autenticar: () => Promise.reject(problemas.naoAutenticado()) },
    ipHmacKey: Buffer.alloc(32, 3),
    idempotencia: undefined as unknown as DependenciasDasRotasDeTag['idempotencia'],
    contrato: undefined as unknown as DependenciasDasRotasDeTag['contrato'],
    clock: undefined as unknown as DependenciasDasRotasDeTag['clock'],
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 4),
    baseDaApi: 'https://api.bichu.test',
  };
}

function servidor(contador: RateLimitStore) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador),
  });
  // A rota REAL, com os resolvedores REAIS. Declarar um resolvedor equivalente
  // aqui dentro deixaria a fiação de `tag-routes.ts` sem dono: trocar o balde
  // de `finder_identity` por `ip` lá não reprovaria nada aqui.
  registrarRota(
    app,
    rotaDeResolucaoDaTag,
    { resolvedores: resolvedoresDaTag(dependenciasDeTeste()) },
    // O manipulador real recusa pelo serviço; aqui o serviço já rejeita com
    // `tag-code-not-found`, que é um dos tipos que `registrarRota` conta como
    // tentativa inválida (`TIPOS_DE_TENTATIVA_INVALIDA`).
    async (request, reply) => {
      const deps = dependenciasDeTeste();
      const { code } = request.params as { code: string };
      await deps.tags.resolver(code, { tipo: 'anonimo' } as never);
      return reply.status(200).send({});
    },
  );
  return app;
}

interface Resposta {
  readonly status: number;
  readonly retryAfter: string | undefined;
  readonly tipo: string | undefined;
}

function tipoDe(corpo: string): string | undefined {
  try {
    const { type } = JSON.parse(corpo) as { type?: unknown };
    return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Um palpite. `userAgent` é parâmetro porque é ele que decide de qual dos dois
 * tetos este arquivo está falando.
 */
async function adivinhar(
  app: ReturnType<typeof servidor>,
  semente: number,
  userAgent: string,
): Promise<Resposta> {
  const resposta = await app.inject({
    method: 'GET',
    url: `/tags/${codigoInexistente(semente)}`,
    headers: { 'user-agent': userAgent, 'x-forwarded-for': ENDERECO },
  });
  const retryAfter = resposta.headers['retry-after'];
  return {
    status: resposta.statusCode,
    retryAfter: typeof retryAfter === 'string' ? retryAfter : undefined,
    tipo: tipoDe(resposta.body),
  };
}

/**
 * EM SÉRIE, de propósito: a contagem da inválida acontece em `onResponse`,
 * depois de a resposta sair. Em paralelo, a tentativa N+1 poderia alcançar o
 * `peek` antes de a N ter sido contada, e a posição medida seria outra.
 */
async function adivinharEmSerie(
  app: ReturnType<typeof servidor>,
  quantas: number,
  userAgentDe: (tentativa: number) => string,
): Promise<Resposta[]> {
  const respostas: Resposta[] = [];
  for (let i = 0; i < quantas; i += 1) {
    respostas.push(await adivinhar(app, i, userAgentDe(i)));
  }
  return respostas;
}

const MESMO_APARELHO = (): string => 'Mozilla/5.0 (o mesmo aparelho a cada palpite)';

void describe('GET /tags/:code — o teto por identidade do achador, pela posição', () => {
  void it(`a ${String(TETO_POR_IDENTIDADE + 1)}ª adivinhação do mesmo aparelho é 429; as ${String(TETO_POR_IDENTIDADE)} antes, 404`, async () => {
    zerarInventario();
    const app = servidor(criarContadorEmMemoria(() => AGORA));
    try {
      const respostas = await adivinharEmSerie(app, TETO_POR_IDENTIDADE + 1, MESMO_APARELHO);
      const status = respostas.map((r) => r.status);

      assert.deepEqual(
        status.slice(0, TETO_POR_IDENTIDADE),
        Array.from({ length: TETO_POR_IDENTIDADE }, () => 404),
        `as ${String(TETO_POR_IDENTIDADE)} primeiras adivinhações deviam ser 404 ` +
          `\`tag-code-not-found\` e saíram ${JSON.stringify(status)}. Recusar antes da quinta ` +
          'trancaria quem digitou a plaquinha errada olhando o bichinho na rua, que é quem ' +
          'esta rota existe para atender.',
      );

      const recusada = respostas[TETO_POR_IDENTIDADE];
      assert.ok(recusada !== undefined);
      assert.equal(
        recusada.status,
        429,
        `a ${String(TETO_POR_IDENTIDADE + 1)}ª adivinhação respondeu ` +
          `${String(recusada.status)}, e o conjunto foi ${JSON.stringify(status)}.\n\n` +
          'É A POSIÇÃO QUE IMPORTA: `resolveTagCode` declara DUAS entradas ' +
          '`applies_to: invalid_attempts` que respondem 429. Esta recusa na ' +
          `${String(TETO_POR_IDENTIDADE + 1)}ª só pode ser a de \`finder_identity\` — a de ` +
          `\`ip\` permite ${String(TETO_POR_ENDERECO)}, e aqui só há ` +
          `${String(TETO_POR_IDENTIDADE)} contadas. Sem este teto, cinco palpites por ` +
          'aparelho viram ilimitados, e o espaço de códigos das plaquinhas é enumerável em ' +
          'silêncio: as outras entradas desta rota não recusam.',
      );
      assert.equal(
        recusada.tipo,
        'rate-limited',
        `a recusa saiu com \`type: ${recusada.tipo ?? '(ausente)'}\` em vez de ` +
          '`rate-limited`. Um 429 de outro `type` não é este teto, e o app decide pelo ' +
          '`type` (RFC 9457).',
      );
      assert.equal(
        recusada.retryAfter,
        String(FALTAM_NA_JANELA_DE_10_MIN),
        `o \`Retry-After\` saiu ${recusada.retryAfter ?? '(ausente)'} e devia ser ` +
          `${String(FALTAM_NA_JANELA_DE_10_MIN)}: a janela desta entrada é de 10 min e o ` +
          'relógio deste caso está congelado às 12:05:00 UTC. Ver 3300 aqui significa que ' +
          'quem recusou foi a entrada de 1 h, por IP, e não esta.',
      );
    } finally {
      await app.close();
    }
  });
});

void describe('GET /tags/:code — o teto por endereço, que é a saída da evasão de User-Agent', () => {
  void it(`trocando o User-Agent a cada palpite, a ${String(TETO_POR_ENDERECO + 1)}ª é 429; as ${String(TETO_POR_ENDERECO)} antes, 404`, async () => {
    zerarInventario();
    const app = servidor(criarContadorEmMemoria(() => AGORA));
    try {
      // Um cabeçalho novo por tentativa: é o que o atacante faz, e é a razão de
      // a entrada por IP existir. `hmacDeIdentidadeDoAchador` leva o
      // `User-Agent`, então cada valor novo é um balde novo de `finder_identity`.
      const respostas = await adivinharEmSerie(
        app,
        TETO_POR_ENDERECO + 1,
        (i) => `Mozilla/5.0 (aparelho-inventado-${String(i)})`,
      );
      const status = respostas.map((r) => r.status);

      assert.deepEqual(
        status.slice(0, TETO_POR_ENDERECO),
        Array.from({ length: TETO_POR_ENDERECO }, () => 404),
        `as ${String(TETO_POR_ENDERECO)} primeiras adivinhações deviam ser 404 e saíram ` +
          `${JSON.stringify(status)}.\n\n` +
          'Estas 20 são também a prova de que a evasão FUNCIONA contra a entrada por ' +
          `identidade: com o \`User-Agent\` fixo, a ${String(TETO_POR_IDENTIDADE + 1)}ª já ` +
          'teria sido 429. Se apareceu um 429 antes da 21ª aqui, o balde de ' +
          '`finder_identity` parou de levar o `User-Agent` — e aí este caso deixou de medir ' +
          'o teto por endereço, porque nunca chega nele.',
      );

      const recusada = respostas[TETO_POR_ENDERECO];
      assert.ok(recusada !== undefined);
      assert.equal(
        recusada.status,
        429,
        `a ${String(TETO_POR_ENDERECO + 1)}ª adivinhação respondeu ` +
          `${String(recusada.status)}, e o conjunto foi ${JSON.stringify(status)}.\n\n` +
          'ESTA É A ENTRADA QUE FECHA A SAÍDA. O balde de `finder_identity` é ' +
          '`hmac(ip, user-agent)`, e o `User-Agent` é do atacante: trocá-lo a cada cinco ' +
          'palpites dá balde novo e escapa inteiro daquele teto. Sem a entrada `[ip]` de ' +
          `${String(TETO_POR_ENDERECO)} por hora, um único endereço enumera o espaço de ` +
          'códigos de plaquinha indefinidamente, e NADA no produto recusa: as outras ' +
          'entradas desta rota são `serve_cache`, `challenge` acima de 300, ' +
          '`log_and_alert` acima de 2000 e `notify_owner`.',
      );
      assert.equal(
        recusada.tipo,
        'rate-limited',
        `a recusa saiu com \`type: ${recusada.tipo ?? '(ausente)'}\` em vez de ` +
          '`rate-limited`.',
      );
      assert.equal(
        recusada.retryAfter,
        String(FALTAM_NA_JANELA_DE_1_HORA),
        `o \`Retry-After\` saiu ${recusada.retryAfter ?? '(ausente)'} e devia ser ` +
          `${String(FALTAM_NA_JANELA_DE_1_HORA)}: a janela desta entrada é de 1 h e o ` +
          'relógio está congelado às 12:05:00 UTC. Ver 300 aqui significa que quem recusou ' +
          'foi a entrada de 10 min, por identidade — e então a evasão de `User-Agent` ' +
          'deixou de ser exercida e este caso não fala mais do teto por endereço.',
      );
    } finally {
      await app.close();
    }
  });
});

void describe('GET /tags/:code — a rota declara os dois tetos que o contrato declara', () => {
  void it('as duas entradas de invalidas estão lá, com dimensão, número, janela e recusa', () => {
    // O OUTRO LADO DA PINÇA, independente dos casos acima de propósito. Eles
    // provam que o mecanismo recusa onde deve; este prova que os números não
    // mudaram. Se o esperado saísse da própria rota, trocar 5 por 50 passaria
    // nos dois, porque os dois passariam a cobrar 50.
    // O tipo de `rateLimit` aqui é a tupla literal que `defineRoute` preserva, e
    // nela `appliesTo` só existe nos membros que a declaram. Ler pelo tipo largo
    // do contrato (`RateLimitEntry`) é o que permite perguntar "quantas entradas
    // de invalidas existem?" — inclusive a resposta ZERO e a resposta UM, que
    // são os dois casos que este bloco precisa reprovar.
    const declaradas: readonly RateLimitEntry[] = rotaDeResolucaoDaTag.rateLimit ?? [];
    const invalidas = declaradas.filter((entrada) => entrada.appliesTo === 'invalid_attempts');

    assert.equal(
      invalidas.length,
      2,
      'GET /tags/:code deixou de declarar exatamente DUAS entradas ' +
        '`applies_to: invalid_attempts`. O contrato declara duas (`api/openapi.yaml`, ' +
        '`resolveTagCode`), e elas não são redundantes: a de `ip` é a saída da evasão de ' +
        '`User-Agent` contra a de `finder_identity`. Perder uma delas é perder uma classe ' +
        'inteira de enumeração de plaquinha.',
    );

    assert.deepEqual(
      invalidas.map((e) => ({
        dimension: [...e.dimension],
        limit: e.limit,
        window: e.window,
        onExceed: e.onExceed,
      })),
      [
        {
          dimension: ['finder_identity'],
          limit: TETO_POR_IDENTIDADE,
          window: '10m',
          onExceed: 'deny_429',
        },
        { dimension: ['ip'], limit: TETO_POR_ENDERECO, window: '1h', onExceed: 'deny_429' },
      ],
      'os tetos de invalidas de GET /tags/:code divergiram do contrato ' +
        '(`api/openapi.yaml`, `resolveTagCode`: [finder_identity] 5/10m deny_429 e ' +
        '[ip] 20/1h deny_429). Mudança de teto é decisão de segurança, não de refatoração.',
    );
  });
});

void describe('GET /tags/:code — as iscas dos dois casos', () => {
  void it('ISCA — com o contador DESLIGADO, a 21ª passa, e este arquivo reprova', async () => {
    // Sem esta isca, os dois casos de posição passariam num sistema sem teto
    // nenhum: um 404 na 21ª é indistinguível de "o teto não existe" se ninguém
    // afirmar que o contador desligado produz exatamente isso.
    zerarInventario();
    const app = servidor(criarContadorDesligado());
    try {
      const respostas = await adivinharEmSerie(app, TETO_POR_ENDERECO + 1, MESMO_APARELHO);
      assert.deepEqual(
        respostas.map((r) => r.status),
        Array.from({ length: TETO_POR_ENDERECO + 1 }, () => 404),
        'o contador desligado recusou alguma tentativa: a isca parou de medir o que ela ' +
          'existe para medir, e os casos de posição acima deixaram de provar que o teto vale.',
      );
    } finally {
      await app.close();
    }
  });
});
