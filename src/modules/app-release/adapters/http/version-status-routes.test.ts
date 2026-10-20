/**
 * `GET /v1/app/version-status` sobre um Fastify de verdade, com o esquema de
 * parametro vindo DO CONTRATO.
 *
 * Sobe o servidor em vez de chamar o manipulador porque tres coisas que esta
 * rota promete so existem com o framework no caminho: o **400** de versao fora
 * do formato (que vem do `pattern` do contrato, por `vigiarParametrosDasRotas`,
 * e nao de um `if`), o **429** do teto (gancho `onRequest`), e a
 * **serializacao real** -- que e onde um campo a mais vazaria.
 *
 * ## As DUAS direcoes, e as duas tem caso
 *
 * Um mecanismo de bloqueio errado tranca o produto. Entao cada direcao e
 * medida por si:
 *
 * - BLOQUEIA QUANDO DEVE: versao abaixo da minima recebe `update_required`.
 * - NAO BLOQUEIA QUANDO NAO DEVE: igual, acima, politica vazia, linha ausente,
 *   minima ilegivel, versao ilegivel, banco fora. Sao SETE casos distintos, e
 *   nenhum deles e representado por outro.
 *
 * ## Como estas iscas foram provadas (19/10/2026, Node 22)
 *
 * Rodadas com `domain/versao.test.ts`, 59 casos na linha de base:
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `provadamenteAbaixo` devolvendo `true` quando o piso e nulo | **8** |
 * | `provadamenteAbaixo` usando `<=` em vez de `<` | 1 |
 * | `vereditoPara` consultando `recommended` ANTES de `minimum` | 2 |
 * | `vereditoPara` bloqueando quando `politica === undefined` | 1 |
 * | `store_url` saindo tambem em `supported` | 1 |
 * | o `pattern` de `AppVersion` tirado do contrato | 1 (o 400) |
 * | `compararLidas` por `localeCompare` (em `domain/versao.ts`) | 8 |
 *
 * A quarta linha reprova UM caso e nao dois, e vale dizer por que: o cenario
 * de banco fora responde **500 antes de chegar a `vereditoPara`**, entao ele
 * nao depende daquela linha. Quem guarda a ausencia de politica e
 * `LINHA AUSENTE libera`, sozinho.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarContadorEmMemoria, criarContadorDesligado } from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type {
  LeituraDaPoliticaDeVersao,
  PlataformaDoApp,
  PoliticaDeVersao,
} from '../../ports/politica-de-versao.js';
import { registrarRotaDoVereditoDeVersao } from './version-status-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = 1_800_000_000_000;
const LOJA = 'https://play.google.com/store/apps/details?id=app.bichu';

/** A politica vazia: as duas colunas nulas, como a migracao a semeia. */
const DESLIGADA: PoliticaDeVersao = {
  minimumVersion: null,
  recommendedVersion: null,
  storeUrl: null,
};

interface Cenario {
  /** `null` significa LINHA AUSENTE (a porta devolve `undefined`). */
  readonly politica?: PoliticaDeVersao | null;
  readonly contador?: RateLimitStore;
  /** Quando verdadeiro, a leitura LANCA -- o banco fora. */
  readonly bancoFora?: boolean;
}

function porta(cenario: Cenario): LeituraDaPoliticaDeVersao {
  return {
    politicaDe: (plataforma: PlataformaDoApp): Promise<PoliticaDeVersao | undefined> => {
      if (cenario.bancoFora === true) {
        return Promise.reject(new Error(`banco fora ao ler a politica de ${plataforma}`));
      }
      // `undefined` explicito quando o cenario diz `null`: e a linha ausente.
      // `cenario.politica` AUSENTE do objeto nao e o mesmo que `null`, e a
      // diferenca e proposital -- um `politica` esquecido cai em DESLIGADA, que
      // e o estado de hoje do banco, e nunca num bloqueio acidental.
      if (cenario.politica === null) return Promise.resolve(undefined);
      return Promise.resolve(cenario.politica ?? DESLIGADA);
    },
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
  // O PLUGIN DE VERDADE, e nao um esquema inline: e ele que instala o
  // `pattern` de `AppVersion` e o `enum` de `platform`. Sem ele aqui, o caso do
  // 400 mediria um `if` que nao existe no codigo de producao. Prefixo vazio
  // porque este arquivo registra a rota na raiz, sem `/v1`.
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, '');
  registrarRotaDoVereditoDeVersao(app, { politica: porta(cenario) });
  conferirParametros();
  return app;
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  query: { platform?: string; version?: string } = {},
): Promise<Resposta> {
  const partes: string[] = [];
  if (query.platform !== undefined) partes.push(`platform=${encodeURIComponent(query.platform)}`);
  if (query.version !== undefined) partes.push(`version=${encodeURIComponent(query.version)}`);
  const resposta = await app.inject({
    method: 'GET',
    url: `/app/version-status${partes.length === 0 ? '' : `?${partes.join('&')}`}`,
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

// ==========================================================================
// (a) BLOQUEIA QUANDO DEVE
// ==========================================================================

void describe('(a) a versao abaixo da minima recebe bloqueio', () => {
  void it('1.3.9 contra minima 1.4.0 e `update_required`', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.4.0' } }),
      { platform: 'android', version: '1.3.9' },
    );
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['verdict'], 'update_required');
  });

  void it('1.9.0 contra minima 1.10.0 TAMBEM bloqueia -- a dezena na rota', async () => {
    // A comparacao de texto diria que 1.9.0 >= 1.10.0 e LIBERARIA quem precisa
    // ser bloqueado. Este caso e a dezena medida pela rota, e nao so no dominio.
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.10.0' } }),
      { platform: 'android', version: '1.9.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_required');
  });

  void it('o bloqueio leva o endereco da loja quando ele existe', async () => {
    const resposta = await pedir(
      servidor({ politica: { minimumVersion: '1.4.0', recommendedVersion: null, storeUrl: LOJA } }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_required');
    assert.equal(resposta.corpo['store_url'], LOJA);
  });

  void it('e leva `null` quando nao ha loja -- que e o estado de hoje', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.4.0' } }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_required');
    assert.equal(resposta.corpo['store_url'], null);
  });
});

// ==========================================================================
// (b) NAO BLOQUEIA QUANDO NAO DEVE
// ==========================================================================

void describe('(b) igual ou acima da minima passa', () => {
  void it('a versao IGUAL a minima passa -- o `<` e nao o `<=`', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.4.0' } }),
      { platform: 'android', version: '1.4.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'supported');
  });

  void it('a versao ACIMA da minima passa', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.4.0' } }),
      { platform: 'android', version: '2.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'supported');
  });

  void it('1.10.0 contra minima 1.9.0 passa -- a dezena, do outro lado', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '1.9.0' } }),
      { platform: 'android', version: '1.10.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'supported');
  });

  void it('`supported` NAO leva o endereco da loja', async () => {
    const resposta = await pedir(
      servidor({ politica: { minimumVersion: '1.0.0', recommendedVersion: null, storeUrl: LOJA } }),
      { platform: 'android', version: '2.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'supported');
    assert.equal(resposta.corpo['store_url'], null);
  });
});

void describe('(b) o aviso brando NAO bloqueia, e e outro estado', () => {
  void it('abaixo da recomendada e acima da minima e `update_recommended`', async () => {
    const resposta = await pedir(
      servidor({
        politica: { minimumVersion: '1.0.0', recommendedVersion: '1.5.0', storeUrl: LOJA },
      }),
      { platform: 'android', version: '1.2.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_recommended');
    assert.notEqual(resposta.corpo['verdict'], 'update_required');
  });

  void it('so a recomendada escrita, sem minima, nunca bloqueia ninguem', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, recommendedVersion: '9.9.9' } }),
      { platform: 'android', version: '0.0.1' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_recommended');
  });

  void it('BLOQUEIO VENCE AVISO: abaixo das duas e `update_required`', async () => {
    // A ordem da consulta e o que este caso guarda. Invertida, uma versao
    // abaixo das duas sairia como bilhete dispensavel -- o bloqueio
    // desapareceria em silencio, que e a pior falha que este mecanismo tem.
    const resposta = await pedir(
      servidor({
        politica: { minimumVersion: '1.4.0', recommendedVersion: '1.5.0', storeUrl: LOJA },
      }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_required');
  });

  void it('recomendada ESCRITA ABAIXO da minima nao transforma bloqueio em aviso', async () => {
    // O erro de digitacao plausivel: trocar as duas colunas de lugar.
    const resposta = await pedir(
      servidor({
        politica: { minimumVersion: '1.5.0', recommendedVersion: '1.4.0', storeUrl: null },
      }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.equal(resposta.corpo['verdict'], 'update_required');
  });
});

// ==========================================================================
// (e) DESLIGAR O MECANISMO LIBERA TODO MUNDO
// ==========================================================================

void describe('(e) ausencia LIBERA, em toda forma que a ausencia tem', () => {
  void it('minima NULA (o estado que a migracao semeia) libera a versao mais velha', async () => {
    const resposta = await pedir(servidor({ politica: DESLIGADA }), {
      platform: 'android',
      version: '0.0.1',
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['verdict'], 'supported');
  });

  void it('LINHA AUSENTE libera -- apagar a linha e um jeito de desligar', async () => {
    const resposta = await pedir(servidor({ politica: null }), {
      platform: 'android',
      version: '0.0.1',
    });
    assert.equal(resposta.corpo['verdict'], 'supported');
  });

  void it('minima ILEGIVEL libera, e nao bloqueia por duvida', async () => {
    // O `CHECK` do banco recusa isso na escrita. Este caso cobre o dia em que
    // a coluna mudar de forma, ou em que alguem escrever por outro caminho:
    // valor que nao se entende NAO vira bloqueio.
    for (const ilegivel of ['1.4', 'v1.4.0', '', 'latest']) {
      const resposta = await pedir(
        servidor({ politica: { ...DESLIGADA, minimumVersion: ilegivel } }),
        { platform: 'android', version: '1.0.0' },
      );
      assert.equal(resposta.corpo['verdict'], 'supported', `minima "${ilegivel}" bloqueou`);
    }
  });

  void it('o mecanismo ligado para ANDROID nao bloqueia o IOS', async () => {
    // A politica e por plataforma. O iOS esta dormente e e instalado por cabo,
    // com provisionamento gratuito que vence em 7 dias: "va para a loja" la e
    // instrucao impossivel, e bloquear aquele build nao teria saida nenhuma.
    const app = servidor({
      politica: { ...DESLIGADA, minimumVersion: null },
    });
    const resposta = await pedir(app, { platform: 'ios', version: '0.0.1' });
    assert.equal(resposta.corpo['verdict'], 'supported');
  });
});

// ==========================================================================
// A ENTRADA FORA DO FORMATO NAO BLOQUEIA: 400, E NUNCA VEREDITO
// ==========================================================================

void describe('entrada fora do contrato responde 400, e nao bloqueio', () => {
  void it('versao fora do formato e 400 -- o `pattern` vem do contrato', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '9.9.9' } }),
      { platform: 'android', version: 'v1.4' },
    );
    assert.equal(resposta.status, 400);
    // E o corpo NAO carrega veredito nenhum: o aplicativo le 400 como "nao
    // consegui perguntar", e nao como "fecha".
    assert.equal(resposta.corpo['verdict'], undefined);
  });

  void it('plataforma fora do `enum` e 400, e nao bloqueio', async () => {
    const resposta = await pedir(
      servidor({ politica: { ...DESLIGADA, minimumVersion: '9.9.9' } }),
      { platform: 'web', version: '1.0.0' },
    );
    assert.equal(resposta.status, 400);
    assert.equal(resposta.corpo['verdict'], undefined);
  });

  void it('sem parametro nenhum e 400 (os dois sao `required`)', async () => {
    const resposta = await pedir(servidor({ politica: { ...DESLIGADA, minimumVersion: '9.9.9' } }));
    assert.equal(resposta.status, 400);
    assert.equal(resposta.corpo['verdict'], undefined);
  });
});

// ==========================================================================
// BANCO FORA: 500, E NUNCA BLOQUEIO
// ==========================================================================

void describe('banco fora responde 500, e o corpo nao carrega veredito', () => {
  void it('a leitura que lanca nao vira `update_required`', async () => {
    const resposta = await pedir(servidor({ bancoFora: true }), {
      platform: 'android',
      version: '1.0.0',
    });
    assert.equal(resposta.status, 500);
    assert.equal(resposta.corpo['verdict'], undefined);
  });
});

// ==========================================================================
// O QUE SAI, E NADA MAIS (ADR-0010)
// ==========================================================================

void describe('a resposta nao vaza nada alem do veredito', () => {
  void it('dois campos, e os dois sao do contrato', async () => {
    const resposta = await pedir(
      servidor({ politica: { minimumVersion: '1.4.0', recommendedVersion: '1.5.0', storeUrl: LOJA } }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.deepEqual(Object.keys(resposta.corpo).sort(), ['store_url', 'verdict']);
  });

  void it('NAO devolve a versao minima -- o app nao pode comparar', async () => {
    // O campo ausente e o desenho: dar o numero ao aplicativo seria o convite
    // para a segunda comparacao, que e o erro que este mecanismo elimina.
    const resposta = await pedir(
      servidor({ politica: { minimumVersion: '1.4.0', recommendedVersion: '1.5.0', storeUrl: LOJA } }),
      { platform: 'android', version: '1.0.0' },
    );
    assert.equal(resposta.bruto.includes('1.4.0'), false, resposta.bruto);
    assert.equal(resposta.bruto.includes('1.5.0'), false, resposta.bruto);
    assert.equal(resposta.bruto.includes('minimum'), false, resposta.bruto);
  });

  void it('`Cache-Control: no-store` -- cache serviria bloqueio ja desligado', async () => {
    const resposta = await servidor().inject({
      method: 'GET',
      url: '/app/version-status?platform=android&version=1.0.0',
    });
    assert.equal(resposta.headers['cache-control'], 'no-store');
  });
});

// ==========================================================================
// O TETO
// ==========================================================================

void describe('o teto da rota', () => {
  void it('a 601a chamada do mesmo ip e recusada com 429', async () => {
    const app = servidor({ politica: { ...DESLIGADA, minimumVersion: '1.4.0' } });
    let ultima = 0;
    for (let i = 0; i < 601; i += 1) {
      const resposta = await app.inject({
        method: 'GET',
        url: '/app/version-status?platform=android&version=1.0.0',
      });
      ultima = resposta.statusCode;
    }
    assert.equal(ultima, 429);
  });

  void it('com o contador DESLIGADO o veredito continua saindo -- o caso acima mede o teto', async () => {
    // ISCA DA ISCA: sem este par, o caso de 429 passaria tambem num mundo em
    // que a rota respondesse 429 a tudo.
    const app = servidor({
      politica: { ...DESLIGADA, minimumVersion: '1.4.0' },
      contador: criarContadorDesligado(),
    });
    const resposta = await pedir(app, { platform: 'android', version: '1.0.0' });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['verdict'], 'update_required');
  });
});
