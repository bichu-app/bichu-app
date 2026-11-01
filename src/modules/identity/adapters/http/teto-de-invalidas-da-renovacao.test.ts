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

const ENDERECO = '203.0.113.44';

const TETO_DE_INVALIDAS = 500;

const TETO_GERAL_DE_CHAMADAS = 2000;

const MENSAGEM_DE_INVALIDAS = 'teto de tentativas invalidas atingido';

const AGORA = Date.UTC(2026, 8, 22, 12, 5, 0);

interface EventoRegistrado {
  readonly evento: Record<string, unknown>;
  readonly mensagem: string;
}

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
        token_family: () => Promise.resolve(undefined),
      },
    },
    () =>
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
