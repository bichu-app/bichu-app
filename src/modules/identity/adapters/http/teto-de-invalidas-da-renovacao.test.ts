/**
 * O teto de tentativa inválida de `POST /v1/auth/refresh`, que **não responde
 * 429** — e é por isso que ele precisava de um caso diferente de todos os outros.
 *
 * ## Por que aqui não se mede status
 *
 * As outras entradas `applies_to: invalid_attempts` do produto são `deny_429`, e
 * a prova delas é a posição da recusa. Esta é `log_and_alert`, por decisão
 * registrada na própria rota: quem chama a renovação é o app em segundo plano, e
 * não há quem responda a um desafio. O comentário de `rotaDeRenovacao` diz o
 * efeito real de recusar aqui — «a sessão morrer em silêncio, e o usuário
 * descobre no dia em que abre o app com o pet sumido».
 *
 * Então esta entrada tem DOIS deveres, e um caso para cada:
 *
 * 1. **Ela precisa acusar.** `log_and_alert` que não registra nada é a mesma
 *    coisa que não existir: `aplicarNaEntrada` consulta o balde com `peek` e a
 *    única saída observável é a linha `teto de tentativas invalidas atingido`.
 *    Apagar a entrada da rota faz essa linha nunca nascer, e nada mais muda —
 *    nenhum status, nenhum cabeçalho, nenhum corpo. Sem este caso, é uma
 *    proteção que se apaga sem deixar marca.
 * 2. **Ela não pode trancar.** Trocar `log_and_alert` por `deny_429` aqui
 *    passaria por uma revisão distraída como «endurecimento», e o efeito seria
 *    derrubar a sessão de quem tem o aparelho atrás do mesmo NAT de um atacante.
 *    O segundo caso afirma que as 501 respostas são 401, e nenhuma é 429.
 *
 * ## Por que a POSIÇÃO também aqui
 *
 * A rota declara outra entrada `log_and_alert`, `['ip']` de 2000 por hora, que
 * conta TODA requisição e registra a mensagem `teto de chamada atingido`. Medir
 * "alguma coisa foi registrada" não distingue as duas. O caso exige a linha na
 * 501ª e a ausência dela nas 500 antes, e confere a mensagem, a dimensão e o
 * `on_exceed` do evento.
 *
 * ## O relógio é congelado, pelo mesmo motivo do arquivo das plaquinhas
 *
 * As janelas são fixas e alinhadas ao epoch (`inicioDaJanela`), não deslizantes.
 * 501 requisições com `Date.now()` podem atravessar a virada da hora, o balde
 * zerar no meio e a linha não nascer onde o caso a espera.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { problemas } from '../../../../shared/http/errors.js';
import { registrarRota, zerarInventario } from '../../../../shared/http/registrar-rota.js';
import { rotaDeRenovacao } from './routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type { RateLimitEntry } from '../../../../shared/http/route-definition.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

/** O endereço de onde vem a enxurrada. O mesmo nas 501: o teto é por IP. */
const ENDERECO = '203.0.113.44';

/**
 * O número que `api/openapi.yaml` declara em `refreshSession`, repetido aqui de
 * propósito: lê-lo de `rotaDeRenovacao.rateLimit` seria comparar a declaração
 * consigo mesma. O último caso deste arquivo é o que cruza os dois lugares.
 */
const TETO_DE_INVALIDAS = 500;

/** A outra entrada `log_and_alert` da MESMA rota, que torna a medição por presença inútil. */
const TETO_GERAL_DE_CHAMADAS = 2000;

/** A mensagem exata que `aplicarNaEntrada` registra para a entrada de invalidas. */
const MENSAGEM_DE_INVALIDAS = 'teto de tentativas invalidas atingido';

/** Instante fixo: 22/09/2026 12:05:00 UTC, com folga dentro da janela de 1 h. */
const AGORA = Date.UTC(2026, 8, 22, 12, 5, 0);

interface EventoRegistrado {
  readonly evento: Record<string, unknown>;
  readonly mensagem: string;
}

/**
 * A bancada. O `log` é espião porque neste teto ele é a ÚNICA saída observável.
 */
function bancada(contador: RateLimitStore): {
  app: ReturnType<typeof criarServidor>;
  registrados: EventoRegistrado[];
} {
  const registrados: EventoRegistrado[] = [];
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador, (evento, mensagem) => {
      registrados.push({ evento, mensagem });
    }),
    bodyLimitBytes: 1_048_576,
  });

  registrarRota(
    app,
    rotaDeRenovacao,
    {
      resolvedores: {
        // O resolvedor DE PRODUÇÃO pergunta a família ao serviço
        // (`deps.auth.familiaDoRefresh`). Um token forjado ou já revogado não
        // tem família no armazém, e o serviço devolve `undefined` — a entrada
        // `['token_family']` de 10/min é PULADA, que é o que permite a este caso
        // chegar à 501ª. Se ela contasse, a 11ª seria 429 e o teto por IP nunca
        // seria alcançado: é justamente por isso que a defesa contra enxurrada
        // de token roubado tem de ser por endereço, e não por família.
        token_family: () => Promise.resolve(undefined),
      },
    },
    () =>
      // O que `deps.auth.renovar` lança para um token que não serve.
      // `invalid-credentials` está em `TIPOS_DE_TENTATIVA_INVALIDA`, e é isso
      // que faz `onResponse` contar a tentativa.
      Promise.reject(problemas.credencialRecusada()),
  );

  return { app, registrados };
}

async function renovarComTokenForjado(
  app: ReturnType<typeof criarServidor>,
  tentativa: number,
): Promise<number> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ENDERECO },
    payload: { refresh_token: `forjado-${String(tentativa)}` },
  });
  return resposta.statusCode;
}

/**
 * EM SÉRIE, de propósito: a contagem da inválida acontece em `onResponse`,
 * depois de a resposta sair. Em paralelo a 501ª poderia alcançar o `peek` antes
 * de a 500ª ter sido contada, e a posição medida seria outra.
 */
async function enxurrada(
  app: ReturnType<typeof criarServidor>,
  quantas: number,
): Promise<number[]> {
  const status: number[] = [];
  for (let i = 0; i < quantas; i += 1) status.push(await renovarComTokenForjado(app, i));
  return status;
}

function invalidasRegistradas(registrados: readonly EventoRegistrado[]): EventoRegistrado[] {
  return registrados.filter((r) => r.mensagem === MENSAGEM_DE_INVALIDAS);
}

void describe('POST /auth/refresh — o teto de invalidas acusa, e acusa na posição certa', () => {
  void it(`a ${String(TETO_DE_INVALIDAS + 1)}ª tentativa forjada registra o alerta; as ${String(TETO_DE_INVALIDAS)} antes, nenhum`, async () => {
    zerarInventario();
    const { app, registrados } = bancada(criarContadorEmMemoria(() => AGORA));
    try {
      await enxurrada(app, TETO_DE_INVALIDAS);
      assert.deepEqual(
        invalidasRegistradas(registrados),
        [],
        `alguma das ${String(TETO_DE_INVALIDAS)} primeiras tentativas já disparou o alerta de ` +
          'invalidas. Alertar antes do teto é alarme falso, e alarme falso repetido é o que ' +
          'faz o alerta de verdade ser ignorado no dia em que vier.',
      );

      await renovarComTokenForjado(app, TETO_DE_INVALIDAS);
      const alertas = invalidasRegistradas(registrados);

      assert.equal(
        alertas.length,
        1,
        `a ${String(TETO_DE_INVALIDAS + 1)}ª tentativa forjada registrou ` +
          `${String(alertas.length)} alerta(s) de invalidas, e devia registrar exatamente 1.\n\n` +
          'É A ÚNICA SAÍDA OBSERVÁVEL DESTA ENTRADA, e é isso que a torna apagável sem marca: ' +
          '`log_and_alert` não muda status, nem cabeçalho, nem corpo. Apagar a entrada ' +
          '`applies_to: invalid_attempts` de `refreshSession` deixa 501 respostas 401 ' +
          'idênticas às de agora, e a enxurrada de token roubado vinda de um IP passa a não ' +
          'ser notada por ninguém. O que sobra é a entrada irmã de ' +
          `${String(TETO_GERAL_DE_CHAMADAS)}/h, que conta TODA requisição — inclusive a ` +
          'renovação legítima — e é quatro vezes mais folgada do que a política escreveu.',
      );

      const alerta = alertas[0];
      assert.ok(alerta !== undefined);
      assert.deepEqual(
        {
          operation_id: alerta.evento['operation_id'],
          dimension: alerta.evento['dimension'],
          on_exceed: alerta.evento['on_exceed'],
        },
        { operation_id: 'refreshSession', dimension: ['ip'], on_exceed: 'log_and_alert' },
        'o alerta saiu com outro `operation_id`, outra dimensão ou outro `on_exceed`: ' +
          `${JSON.stringify(alerta.evento)}.\n\n` +
          'A rota declara DUAS entradas `log_and_alert`. A outra é `[ip]` de ' +
          `${String(TETO_GERAL_DE_CHAMADAS)}/h, que conta toda requisição e registra a ` +
          'mensagem `teto de chamada atingido`. Sem conferir o evento, um caso que só ' +
          'contasse linhas de log não distinguiria uma da outra.',
      );
    } finally {
      await app.close();
    }
  });
});

void describe('POST /auth/refresh — o teto de invalidas NÃO pode trancar a renovação', () => {
  void it(`as ${String(TETO_DE_INVALIDAS + 1)}ª respostas são 401, e nenhuma é 429`, async () => {
    // O OUTRO DEVER DESTA ENTRADA, e o motivo de ela não ser `deny_429`: quem
    // chama é o app em segundo plano, e não há quem responda a um desafio. Se
    // esta entrada passar a recusar, o aparelho que está atrás do mesmo NAT de
    // um atacante perde a sessão sem nada na tela — e o tutor descobre no dia em
    // que abre o app com o pet sumido. Está escrito assim no comentário de
    // `rotaDeRenovacao`, e sem este caso é só um comentário.
    zerarInventario();
    const { app, registrados } = bancada(criarContadorEmMemoria(() => AGORA));
    try {
      const status = await enxurrada(app, TETO_DE_INVALIDAS + 1);
      const recusadasPorTeto = status.filter((codigo) => codigo === 429);

      assert.deepEqual(
        recusadasPorTeto,
        [],
        `${String(recusadasPorTeto.length)} das ${String(TETO_DE_INVALIDAS + 1)} tentativas ` +
          'responderam 429. A entrada de invalidas de `refreshSession` é `log_and_alert` por ' +
          'decisão registrada, e não `deny_429`: recusar aqui mata em silêncio a sessão de ' +
          'quem divide o endereço com o atacante. Se alguém trocou o `on_exceed` achando que ' +
          'endurecia, este é o efeito.',
      );
      assert.ok(
        status.every((codigo) => codigo === 401),
        `alguma resposta não foi 401: ${JSON.stringify([...new Set(status)])}. O token ` +
          'forjado tem UMA resposta, e ela não muda por causa do teto.',
      );
      // E o alerta continua nascendo: não trancar não pode virar não acusar.
      assert.equal(
        invalidasRegistradas(registrados).length,
        1,
        'as 501 saíram 401, mas o alerta da 501ª não nasceu. Os dois deveres desta entrada ' +
          'são independentes, e este caso protege o de acusar contra um conserto que a ' +
          'silencie para «parar de recusar».',
      );
    } finally {
      await app.close();
    }
  });
});

void describe('POST /auth/refresh — a rota declara o teto que o contrato declara', () => {
  void it('a entrada de invalidas está lá, com dimensão, número, janela e efeito', () => {
    // O OUTRO LADO DA PINÇA, independente dos casos acima de propósito. Eles
    // provam que o alerta nasce onde deve; este prova que o número e o EFEITO
    // não mudaram. O `onExceed` entra aqui porque é ele que decide se esta rota
    // tranca ou não — trocá-lo é mudança de comportamento, não de forma.
    const declaradas: readonly RateLimitEntry[] = rotaDeRenovacao.rateLimit ?? [];
    const invalidas = declaradas.filter((entrada) => entrada.appliesTo === 'invalid_attempts');

    assert.equal(
      invalidas.length,
      1,
      'POST /auth/refresh deixou de declarar exatamente uma entrada ' +
        '`applies_to: invalid_attempts`. O contrato declara uma (`api/openapi.yaml`, ' +
        '`refreshSession`), e ela é a única coisa que nota uma enxurrada de token roubado ' +
        'abaixo de 2000 por hora.',
    );

    const entrada = invalidas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      },
      { dimension: ['ip'], limit: TETO_DE_INVALIDAS, window: '1h', onExceed: 'log_and_alert' },
      'o teto de invalidas de POST /auth/refresh divergiu do contrato ' +
        '(`api/openapi.yaml`, `refreshSession`: dimension [ip], limit 500, window 1h, ' +
        'on_exceed log_and_alert). Mudança de teto é decisão de segurança, não de ' +
        'refatoração — e aqui trocar o `on_exceed` para `deny_429` derrubaria sessão de ' +
        'gente inocente que divide o endereço.',
    );
  });
});

void describe('POST /auth/refresh — a isca do alerta', () => {
  void it('ISCA — com o contador DESLIGADO o alerta nunca nasce, e este arquivo reprova', async () => {
    // Sem esta isca, o caso de posição passaria num sistema que registrasse a
    // linha por qualquer outro motivo: é preciso afirmar que o contador é quem
    // decide. Com ele desligado, `peek` sempre permite e não há o que acusar.
    zerarInventario();
    const { app, registrados } = bancada(criarContadorDesligado());
    try {
      await enxurrada(app, TETO_DE_INVALIDAS + 1);
      assert.deepEqual(
        invalidasRegistradas(registrados),
        [],
        'o contador desligado disparou o alerta de invalidas: a linha não vem do balde, e o ' +
          'caso de posição acima deixou de provar que o teto conta.',
      );
    } finally {
      await app.close();
    }
  });
});
