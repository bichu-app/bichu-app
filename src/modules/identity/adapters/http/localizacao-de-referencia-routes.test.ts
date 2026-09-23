/**
 * As três rotas de `/me/location` sobre um Fastify de verdade.
 *
 * O servidor sobe em vez de o handler ser chamado direto porque três coisas que
 * as rotas prometem só existem com o framework no caminho: o 429 do teto (que é
 * gancho `onRequest`, não `if` de handler), a validação do corpo a partir do
 * schema do contrato, e a **serialização real da resposta** — que é onde uma
 * coordenada mais precisa vazaria.
 *
 * ## As iscas deste arquivo, e como foram provadas
 *
 * Cada mecanismo foi desligado no código de produção, rodado e visto reprovar
 * em 22/09/2026, e depois restaurado:
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `quantizar` devolvendo a coordenada intacta | 3 casos |
 * | `comoResposta` devolvendo algo diferente do gravado | 2 casos |
 * | `deny_429` virando `log_and_alert` | 1 caso |
 * | `chamadorAutenticado` deixando passar sem `Authorization` | 3 casos |
 * | `rateLimit` removido da declaração da rota | **não compila** |
 * | dimensão `account` declarada sem resolvedor | **não compila** (TS2345) |
 * | `app.put` direto, fora de `registrarRota` | o portão de registro reprova |
 *
 * A penúltima linha é a razão de existir o caso marcado `ISCA`: o mesmo
 * caminho com `criarContadorDesligado()` precisa deixar a 61ª passar. Sem ele,
 * o caso do 429 mediria a capacidade de contar até 61, e não o limite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { AuditLog, AuditEvent } from '../../../audit/ports/audit-log.js';
import type { Clock } from '../../../../shared/ports/index.js';
import { LocalizacaoDeReferenciaService } from '../../application/localizacao-de-referencia-service.js';
import type { LocalizacaoDeReferencia } from '../../domain/localizacao-de-referencia.js';
import type { LocalizacaoDeReferenciaRepository } from '../../ports/localizacao-de-referencia-repository.js';
import { registrarRotasDeLocalizacao } from './localizacao-de-referencia-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000 as Instant;
const CAMINHO = '/me/location';

/**
 * Repositório em memória que **guarda por dono**.
 *
 * Um `Map` por conta e não uma variável só: com uma variável, a gravação de um
 * apareceria na leitura do outro e o caso que prova o critério 11 passaria por
 * acidente, medindo o dublê em vez do código.
 */
/** A chave do dublê: o mesmo par que é chave primária da tabela. */
function chave(dono: string, familia: string): string {
  return `${dono}\u0000${familia}`;
}

function repositorio(): LocalizacaoDeReferenciaRepository & {
  readonly linhas: Map<string, LocalizacaoDeReferencia>;
} {
  const linhas = new Map<string, LocalizacaoDeReferencia>();
  return {
    linhas,
    // SEC-021: a chave do dublê é o PAR, como a chave primária da tabela. Um
    // dublê chaveado só pelo dono não conseguiria reprovar o caso dos dois
    // aparelhos: ele daria a resposta certa pelo motivo errado.
    gravar: (dono, familia, localizacao) => {
      linhas.set(chave(dono, familia), localizacao);
      return Promise.resolve();
    },
    buscarValida: (dono, familia, agora) => {
      const linha = linhas.get(chave(dono, familia));
      if (linha === undefined || linha.expiraEm <= agora) return Promise.resolve(null);
      return Promise.resolve(linha);
    },
    apagar: (dono, familia) => {
      return Promise.resolve(linhas.delete(chave(dono, familia)) ? 1 : 0);
    },
    expurgarVencidas: () => Promise.resolve(0),
  };
}

interface Cenario {
  readonly contador?: RateLimitStore;
  readonly agora?: Instant;
}

function montar(cenario: Cenario = {}): {
  app: RegistradorDeRotas;
  repo: ReturnType<typeof repositorio>;
  eventos: AuditEvent[];
} {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });

  const repo = repositorio();
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => cenario.agora ?? AGORA };

  registrarRotasDeLocalizacao(app, {
    localizacao: new LocalizacaoDeReferenciaService({ repositorio: repo, clock, trilha }),
    // O token É o id da conta neste dublê: cada caso diz de quem é a sessão.
    autenticador: {
      autenticar: (token: string) => Promise.resolve({ userId: token as UserId }),
    },
    // O contrato DE VERDADE: é ele que decide o schema do corpo, e uma cópia
    // aqui deixaria de acusar mudança na especificação.
    contrato: carregarContrato('api/openapi.yaml'),
  });

  return { app, repo, eventos };
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: {
    metodo: 'GET' | 'PUT' | 'DELETE';
    como?: UserId | null;
    corpo?: unknown;
  },
): Promise<{ status: number; bruto: string; corpo: unknown }> {
  const cabecalhos: Record<string, string> =
    opcoes.como === null ? {} : { authorization: `Bearer ${opcoes.como ?? DONO}` };
  const resposta =
    opcoes.corpo === undefined
      ? await app.inject({ method: opcoes.metodo, url: CAMINHO, headers: cabecalhos })
      : await app.inject({
          method: opcoes.metodo,
          url: CAMINHO,
          headers: cabecalhos,
          payload: opcoes.corpo as Record<string, unknown>,
        });
  return {
    status: resposta.statusCode,
    bruto: resposta.body,
    corpo: resposta.body === '' ? undefined : (JSON.parse(resposta.body) as unknown),
  };
}

void describe('PUT /me/location grava a coordenada JÁ quantizada', () => {
  void it('responde 200 com os seis campos de UserLocation, e nada além', async () => {
    const { app } = montar();
    const { status, corpo } = await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.561414, lon: -46.655981, source: 'device_gps' },
    });
    await app.close();

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(corpo as Record<string, unknown>).sort(), [
      'captured_at',
      'expires_at',
      'lat',
      'lon',
      'precision_m',
      'source',
    ]);
  });

  void it('a resposta traz o QUANTIZADO, e não o eco do que foi enviado', async () => {
    const { app } = montar();
    const { corpo } = await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.561414, lon: -46.655981, source: 'device_gps' },
    });
    await app.close();

    const resposta = corpo as { lat: number; lon: number; precision_m: number };
    assert.equal(resposta.lat, -23.561);
    assert.equal(resposta.lon, -46.656);
    assert.equal(resposta.precision_m, 100);
  });

  void it('o que chega ao repositório é o quantizado: o bruto morre na borda', async () => {
    const { app, repo } = montar();
    await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.561414, lon: -46.655981, source: 'map_pin' },
    });
    await app.close();

    const gravada = repo.linhas.get(DONO);
    assert.ok(gravada !== undefined);
    assert.equal(gravada.lat, -23.561);
    assert.equal(gravada.lon, -46.656);
    assert.equal(gravada.origem, 'map_pin');
  });

  void it('a segunda gravação SUBSTITUI a primeira: uma linha por conta', async () => {
    const { app, repo } = montar();
    await pedir(app, { metodo: 'PUT', corpo: { lat: -23.5, lon: -46.6, source: 'device_gps' } });
    await pedir(app, { metodo: 'PUT', corpo: { lat: -22.9, lon: -43.2, source: 'map_pin' } });
    await app.close();

    assert.equal(repo.linhas.size, 1, 'apareceu histórico, e o critério 5 proíbe');
    assert.equal(repo.linhas.get(DONO)?.lat, -22.9);
  });

  void it('a trilha registra a mudança e NUNCA a coordenada', async () => {
    const { app, eventos } = montar();
    await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.561414, lon: -46.655981, source: 'device_gps' },
    });
    await app.close();

    assert.equal(eventos.length, 1);
    assert.equal(eventos[0]?.action, 'privacy.reference_location_set');
    const serializado = JSON.stringify(eventos[0]);
    assert.ok(!serializado.includes('23.561'), 'a coordenada entrou na trilha');
    assert.ok(!serializado.includes('46.65'), 'a coordenada entrou na trilha');
    assert.ok(serializado.includes('device_gps'), 'a origem precisa ficar registrada');
  });
});

void describe('o corpo é validado pelo schema do contrato, na borda', () => {
  void it('recusa 400 uma latitude fora da caixa do Brasil', async () => {
    const { app, repo } = montar();
    // Londres. O ponto é válido no planeta e não é válido neste produto: ele
    // entraria na consulta de raio de um caso aberto em Recife.
    const { status } = await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: 51.5, lon: -0.12, source: 'device_gps' },
    });
    await app.close();

    assert.equal(status, 400);
    assert.equal(repo.linhas.size, 0, 'gravou uma coordenada que o contrato recusa');
  });

  void it('recusa 400 uma origem fora do enum', async () => {
    const { app } = montar();
    const { status } = await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.5, lon: -46.6, source: 'ip_lookup' },
    });
    await app.close();
    assert.equal(status, 400);
  });

  void it('recusa 400 o corpo sem `source`', async () => {
    const { app } = montar();
    const { status } = await pedir(app, { metodo: 'PUT', corpo: { lat: -23.5, lon: -46.6 } });
    await app.close();
    assert.equal(status, 400);
  });
});

void describe('GET /me/location devolve null em vez de 404', () => {
  void it('responde 200 com `null` quando nunca foi informada', async () => {
    const { app } = montar();
    const { status, bruto } = await pedir(app, { metodo: 'GET' });
    await app.close();

    assert.equal(status, 200);
    assert.equal(bruto.trim(), 'null', 'recurso ausente e estado normal da conta não são a mesma coisa');
  });

  void it('responde 200 com `null` quando já expirou', async () => {
    const { app, repo } = montar();
    await pedir(app, { metodo: 'PUT', corpo: { lat: -23.5, lon: -46.6, source: 'device_gps' } });
    assert.equal(repo.linhas.size, 1);
    await app.close();

    // Trinta e um dias depois, com a MESMA linha gravada.
    const depois = montar({ agora: (AGORA + 31 * 24 * 60 * 60 * 1000) as Instant });
    const gravada = repo.linhas.get(DONO);
    assert.ok(gravada !== undefined);
    depois.repo.linhas.set(DONO, gravada);
    const { status, bruto } = await pedir(depois.app, { metodo: 'GET' });
    await depois.app.close();

    assert.equal(status, 200);
    assert.equal(bruto.trim(), 'null', 'a conta continuou na base de alerta depois de 30 dias');
  });

  void it('devolve o que o PRÓPRIO dono gravou', async () => {
    const { app } = montar();
    await pedir(app, {
      metodo: 'PUT',
      corpo: { lat: -23.561414, lon: -46.655981, source: 'device_gps' },
    });
    const { corpo } = await pedir(app, { metodo: 'GET' });
    await app.close();
    assert.equal((corpo as { lat: number }).lat, -23.561);
  });
});

void describe('nenhuma coordenada de um usuário chega a outro (critério 11)', () => {
  void it('o que o DONO gravou não aparece na leitura do OUTRO', async () => {
    const { app } = montar();
    await pedir(app, {
      metodo: 'PUT',
      como: DONO,
      corpo: { lat: -23.561414, lon: -46.655981, source: 'device_gps' },
    });
    const { status, bruto } = await pedir(app, { metodo: 'GET', como: OUTRO });
    await app.close();

    assert.equal(status, 200);
    assert.equal(bruto.trim(), 'null');
    assert.ok(!bruto.includes('23.561'), 'a coordenada de uma conta saiu na resposta de outra');
  });

  void it('o DELETE de um não apaga a linha do outro', async () => {
    const { app, repo } = montar();
    await pedir(app, {
      metodo: 'PUT',
      como: DONO,
      corpo: { lat: -23.5, lon: -46.6, source: 'device_gps' },
    });
    const { status } = await pedir(app, { metodo: 'DELETE', como: OUTRO });
    await app.close();

    assert.equal(status, 204);
    assert.ok(repo.linhas.has(DONO), 'apagar a própria localização apagou a de outra conta');
  });
});

void describe('DELETE /me/location sai do raio, e é idempotente', () => {
  void it('responde 204 e some com a linha', async () => {
    const { app, repo } = montar();
    await pedir(app, { metodo: 'PUT', corpo: { lat: -23.5, lon: -46.6, source: 'device_gps' } });
    const { status } = await pedir(app, { metodo: 'DELETE' });
    await app.close();

    assert.equal(status, 204);
    assert.equal(repo.linhas.size, 0);
  });

  void it('responde 204 mesmo quando não havia nada a apagar', async () => {
    const { app } = montar();
    const { status } = await pedir(app, { metodo: 'DELETE' });
    await app.close();
    assert.equal(status, 204, '404 aqui é o estado que a pessoa acabou de pedir');
  });

  void it('registra a saída na trilha', async () => {
    const { app, eventos } = montar();
    await pedir(app, { metodo: 'DELETE' });
    await app.close();
    assert.equal(eventos[0]?.action, 'privacy.reference_location_cleared');
  });
});

void describe('as três rotas exigem sessão', () => {
  for (const metodo of ['GET', 'PUT', 'DELETE'] as const) {
    void it(`${metodo} sem Authorization responde 401`, async () => {
      const { app } = montar();
      const { status } = await pedir(app, {
        metodo,
        como: null,
        ...(metodo === 'PUT'
          ? { corpo: { lat: -23.5, lon: -46.6, source: 'device_gps' } }
          : {}),
      });
      await app.close();
      assert.equal(status, 401);
    });
  }
});

void describe('o teto de 60 por hora recusa de verdade', () => {
  void it('a 61ª chamada de PUT na mesma conta responde 429', async () => {
    const { app } = montar();
    const corpo = { lat: -23.5, lon: -46.6, source: 'device_gps' };
    for (let i = 0; i < 60; i += 1) {
      const { status } = await pedir(app, { metodo: 'PUT', corpo });
      assert.equal(status, 200, `a ${String(i + 1)}ª chamada devia passar`);
    }
    const { status } = await pedir(app, { metodo: 'PUT', corpo });
    await app.close();
    assert.equal(status, 429);
  });

  void it('ISCA: com o contador desligado a 61ª passa, e é isso que prova que o caso acima mede limite', async () => {
    const { app } = montar({ contador: criarContadorDesligado() });
    const corpo = { lat: -23.5, lon: -46.6, source: 'device_gps' };
    for (let i = 0; i < 60; i += 1) await pedir(app, { metodo: 'PUT', corpo });
    const { status } = await pedir(app, { metodo: 'PUT', corpo });
    await app.close();
    assert.equal(
      status,
      200,
      'com o teto desligado a 61ª foi recusada assim mesmo: o caso anterior está medindo outra coisa',
    );
  });
});
