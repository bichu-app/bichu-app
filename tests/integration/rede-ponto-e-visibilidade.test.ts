/**
 * A Rede emendada contra um Postgres de verdade: quem aparece, com que rotulo,
 * e onde o ponto sai (ADR-0027 secao 12, BICHUS-251 / BICHUS-271).
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO PROVA
 * ===========================================================================
 * 1. **A visibilidade mora no `WHERE`, e e a mesma nas tres leituras.** Um
 *    encontro publicado, um cancelado ainda por acontecer, um cancelado que ja
 *    terminou, um da comunidade esperando revisao e um retirado -- os dois
 *    ultimos COM ponto, de proposito. A agenda, o detalhe e o `location` so
 *    enxergam os tres primeiros.
 * 2. **O cancelado segue a decisao do cliente de 23/09**: antes do fim previsto
 *    ele aparece na agenda de `upcoming` com `status` `cancelled`; depois do fim
 *    aparece em `past` com `status` `ended`, a regra do encerrado.
 * 3. **O ponto so sai por `buscarLocalDoEncontro`.** Os corpos publicos da
 *    agenda e do detalhe, montados como `network-routes.ts` os monta, nao tem
 *    `lat`, `lon`, `point` nem UUID nenhum -- varridos no JSON serializado, e
 *    nao campo a campo.
 * 4. **O que o banco garante da regra "lugar publico" (ADR-0027 secao 13)**:
 *    `pending_review` so existe para `origin = 'community'`, e ponto sem
 *    origem `map_pin` e recusado. O resto da regra e processo, e este arquivo
 *    nao finge testa-lo.
 *
 * O 401 do `location` sem token e a prova do `network-routes.test.ts`, sobre um
 * Fastify de verdade; aqui o assunto e o que a consulta devolve.
 *
 * **A isca foi medida, e nao afirmada** (23/09, Node 22, pilha efemera de
 * `npm run test:integration`): com `VISIVEL` alargado para os quatro estados
 * em `kysely-network-repository.ts`, a suite saiu 1 com 390 de 393 e reprovou
 * os tres casos de "a visibilidade e a mesma nas tres leituras" pelo nome;
 * restaurado, 393 de 393.
 *
 * **Verificacao que nao consegue verificar REPROVA.** Sem `DATABASE_URL` o
 * `before` levanta, e o bloco "o cenario existe" confere que as linhas estao
 * gravadas antes de afirmar que elas nao aparecem.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type DbHandle } from '../../src/shared/db/pool.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import {
  projetarEncontro,
  projetarLocalizacao,
} from '../../src/modules/network/domain/encontro-da-rede.js';
import type { NetworkRepository } from '../../src/modules/network/ports/network-repository.js';
import type { Instant } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** Prefixo proprio: a limpeza apaga so o que este arquivo criou. */
const PREFIXO = 'isca-ponto-';

const PUBLICADO_COM_PONTO = `${PREFIXO}publicado`;
const PUBLICADO_SEM_PONTO = `${PREFIXO}sem-ponto`;
const CANCELADO_POR_VIR = `${PREFIXO}cancelado-por-vir`;
const CANCELADO_ENCERRADO = `${PREFIXO}cancelado-passado`;
const ESPERANDO_REVISAO = `${PREFIXO}em-revisao`;
const RETIRADO = `${PREFIXO}retirado`;

/** Pontos de lugar publico, e distintivos: a varredura procura os numeros. */
const PONTO_PUBLICADO = { lat: -23.5634, lon: -46.6821 };
const PONTO_CANCELADO = { lat: -23.5466, lon: -46.7236 };
const PONTO_ESCONDIDO = { lat: -23.5445, lon: -46.6579 };

const QUALQUER_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let banco: DbHandle;
let cliente: pg.Client;
let repo: NetworkRepository;
let agora = 0 as Instant;

interface Linha {
  readonly slug: string;
  readonly comecaEmHoras: number;
  readonly duracaoEmHoras: number;
  readonly ponto: { lat: number; lon: number } | null;
  readonly origem: 'admin' | 'community';
  readonly publicacao: 'published' | 'cancelled' | 'pending_review' | 'removed';
}

const LINHAS: readonly Linha[] = [
  { slug: PUBLICADO_COM_PONTO, comecaEmHoras: 24, duracaoEmHoras: 2, ponto: PONTO_PUBLICADO, origem: 'admin', publicacao: 'published' },
  { slug: PUBLICADO_SEM_PONTO, comecaEmHoras: 30, duracaoEmHoras: 2, ponto: null, origem: 'admin', publicacao: 'published' },
  { slug: CANCELADO_POR_VIR, comecaEmHoras: 48, duracaoEmHoras: 2, ponto: PONTO_CANCELADO, origem: 'admin', publicacao: 'cancelled' },
  { slug: CANCELADO_ENCERRADO, comecaEmHoras: -48, duracaoEmHoras: 2, ponto: PONTO_CANCELADO, origem: 'admin', publicacao: 'cancelled' },
  { slug: ESPERANDO_REVISAO, comecaEmHoras: 26, duracaoEmHoras: 2, ponto: PONTO_ESCONDIDO, origem: 'community', publicacao: 'pending_review' },
  { slug: RETIRADO, comecaEmHoras: 28, duracaoEmHoras: 2, ponto: PONTO_ESCONDIDO, origem: 'admin', publicacao: 'removed' },
];

async function inserir(linha: Linha): Promise<void> {
  const visivelOuRetirado = linha.publicacao !== 'pending_review';
  await cliente.query(
    `INSERT INTO network_events (
       id, slug, title, summary, place_name, neighborhood, city, state,
       geo, geo_source, starts_at, ends_at, time_zone,
       origin, publication_status, published_at, cancelled_at, cancellation_note)
     VALUES ($1, $2, 'Encontro da isca do ponto', 'Um caso da emenda da Rede.',
             'Praca da Isca', 'Bairro da Isca', 'Cidade da Isca', 'SP',
             CASE WHEN $3::float8 IS NULL THEN NULL
                  ELSE ST_SetSRID(ST_MakePoint($4::float8, $3::float8), 4326)::geography END,
             CASE WHEN $3::float8 IS NULL THEN NULL ELSE 'map_pin' END,
             now() + make_interval(hours => $5::int),
             now() + make_interval(hours => $5::int + $6::int),
             'America/Sao_Paulo', $7, $8,
             CASE WHEN $9::boolean THEN now() - interval '7 days' END,
             CASE WHEN $8::text = 'cancelled' THEN now() - interval '1 day' END,
             CASE WHEN $8::text = 'cancelled' THEN 'Chuva forte prevista.' END)`,
    [
      randomUUID(),
      linha.slug,
      linha.ponto?.lat ?? null,
      linha.ponto?.lon ?? null,
      linha.comecaEmHoras,
      linha.duracaoEmHoras,
      linha.origem,
      linha.publicacao,
      visivelOuRetirado,
    ],
  );
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova a visibilidade e o ponto da Rede ' +
        'contra o banco, e sem banco ele nao prova nada. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  repo = criarNetworkRepository(banco.db);

  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
  for (const linha of LINHAS) await inserir(linha);

  const relogio = await cliente.query<{ agora: string }>(
    'select (extract(epoch from now()) * 1000)::bigint::text as agora',
  );
  agora = Number(relogio.rows[0]?.agora ?? 0) as Instant;
});

after(async () => {
  if (cliente !== undefined) {
    await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
});

async function agenda(when: 'upcoming' | 'past' | 'all') {
  const pagina = await repo.listarAgenda({
    q: 'isca do ponto',
    when,
    sort: 'proximos',
    agora,
    page: 1,
    limit: 20,
  });
  return pagina.itens.map((encontro) => projetarEncontro(encontro, agora));
}

void describe('o cenario existe: as seis linhas estao gravadas, duas delas escondidas COM ponto', () => {
  void it('as seis linhas estao no banco, com a publicacao e o ponto declarados', async () => {
    const r = await cliente.query<{ slug: string; publication_status: string; tem_ponto: boolean }>(
      `SELECT slug, publication_status, geo IS NOT NULL AS tem_ponto
         FROM network_events WHERE slug LIKE $1 ORDER BY slug`,
      [`${PREFIXO}%`],
    );
    assert.equal(r.rows.length, LINHAS.length);
    const escondidas = r.rows.filter((l) => l.slug === ESPERANDO_REVISAO || l.slug === RETIRADO);
    assert.equal(escondidas.length, 2);
    assert.ok(
      escondidas.every((l) => l.tem_ponto),
      'as linhas escondidas precisam TER ponto, ou provar que ele nao sai nao prova nada',
    );
  });
});

void describe('a visibilidade e a mesma nas tres leituras', () => {
  void it('a agenda (`all`) mostra publicados e cancelados, e nunca revisao nem retirado', async () => {
    const slugs = (await agenda('all')).map((e) => e.slug).sort();
    assert.deepEqual(
      slugs,
      [CANCELADO_ENCERRADO, CANCELADO_POR_VIR, PUBLICADO_COM_PONTO, PUBLICADO_SEM_PONTO].sort(),
    );
  });

  void it('o detalhe de revisao, de retirado e de inexistente e `undefined` -- o mesmo 404', async () => {
    assert.equal(await repo.buscarEncontro(ESPERANDO_REVISAO), undefined);
    assert.equal(await repo.buscarEncontro(RETIRADO), undefined);
    assert.equal(await repo.buscarEncontro(`${PREFIXO}nunca-existiu`), undefined);
    assert.notEqual(await repo.buscarEncontro(PUBLICADO_COM_PONTO), undefined);
    assert.notEqual(await repo.buscarEncontro(CANCELADO_POR_VIR), undefined);
  });

  void it('ISCA -- o `location` de revisao e de retirado e `undefined`, mesmo havendo ponto gravado', async () => {
    // A regra do ADR-0027 13.5 como estado do banco: o ponto do encontro da
    // comunidade so sai depois de revisao humana. E o do retirado nao sai
    // nunca.
    assert.equal(await repo.buscarLocalDoEncontro(ESPERANDO_REVISAO), undefined);
    assert.equal(await repo.buscarLocalDoEncontro(RETIRADO), undefined);
    assert.equal(await repo.buscarLocalDoEncontro(`${PREFIXO}nunca-existiu`), undefined);
  });
});

void describe('o ponto, so pelo `location`', () => {
  void it('o publicado com ponto devolve o ponto gravado, em graus, na ordem lat/lon', async () => {
    const local = await repo.buscarLocalDoEncontro(PUBLICADO_COM_PONTO);
    assert.ok(local !== undefined);
    const corpo = projetarLocalizacao(local.ponto);
    assert.ok(corpo.point !== null);
    // A troca lat/lon e o erro mais comum com ponto: `ST_MakePoint` e (x, y).
    assert.ok(Math.abs(corpo.point.lat - PONTO_PUBLICADO.lat) < 1e-9, `lat ${String(corpo.point.lat)}`);
    assert.ok(Math.abs(corpo.point.lon - PONTO_PUBLICADO.lon) < 1e-9, `lon ${String(corpo.point.lon)}`);
  });

  void it('o publicado sem ponto devolve `{ point: null }`, e nao 404', async () => {
    const local = await repo.buscarLocalDoEncontro(PUBLICADO_SEM_PONTO);
    assert.ok(local !== undefined, 'encontro visivel sem ponto nao e 404');
    assert.deepEqual(projetarLocalizacao(local.ponto), { point: null });
  });

  void it('o cancelado ainda visivel devolve o ponto: ele continua na agenda', async () => {
    const local = await repo.buscarLocalDoEncontro(CANCELADO_POR_VIR);
    assert.ok(local?.ponto !== null && local?.ponto !== undefined);
  });

  void it('ISCA -- a agenda e o detalhe, serializados, nao tem ponto nem UUID', async () => {
    const corpos = [JSON.stringify(await agenda('all'))];
    for (const slug of [PUBLICADO_COM_PONTO, CANCELADO_POR_VIR]) {
      const encontro = await repo.buscarEncontro(slug);
      assert.ok(encontro !== undefined, `o detalhe de ${slug} nao voltou: nao ha o que varrer`);
      corpos.push(JSON.stringify(projetarEncontro(encontro, agora)));
    }
    for (const corpo of corpos) {
      assert.ok(corpo.length > 50, 'corpo vazio ou trivial: a varredura nao teria o que varrer');
      for (const proibido of ['"lat"', '"lon"', '"point"', '"geo', String(PONTO_PUBLICADO.lat), String(PONTO_CANCELADO.lon)]) {
        assert.equal(corpo.includes(proibido), false, `${proibido} num corpo publico da Rede`);
      }
      assert.equal(QUALQUER_UUID.test(corpo), false, 'UUID num corpo publico da Rede');
    }
  });
});

void describe('o cancelado: aparece antes do fim e segue a regra do encerrado depois (decisao de 23/09)', () => {
  void it('antes do fim previsto, esta em `upcoming` com `status` `cancelled`', async () => {
    const proximos = await agenda('upcoming');
    const cancelado = proximos.find((e) => e.slug === CANCELADO_POR_VIR);
    assert.ok(cancelado !== undefined, 'o cancelado por vir sumiu da agenda de proximos');
    assert.equal(cancelado.status, 'cancelled');
  });

  void it('depois do fim, esta em `past` com `status` `ended`, e nao em `upcoming`', async () => {
    const passados = await agenda('past');
    const encerrado = passados.find((e) => e.slug === CANCELADO_ENCERRADO);
    assert.ok(encerrado !== undefined, 'o cancelado que ja terminou sumiu da agenda do passado');
    assert.equal(encerrado.status, 'ended');
    assert.equal(
      (await agenda('upcoming')).some((e) => e.slug === CANCELADO_ENCERRADO),
      false,
      'o cancelado que ja terminou continua em `upcoming`',
    );
  });

  void it('A ISCA NEGATIVA: o publicado por vir continua `upcoming`', async () => {
    const proximos = await agenda('upcoming');
    assert.equal(proximos.find((e) => e.slug === PUBLICADO_COM_PONTO)?.status, 'upcoming');
  });
});

void describe('o que o banco garante da regra "lugar publico" (ADR-0027 secao 13)', () => {
  async function recusa(sqlDeTeste: string, restricao: string): Promise<void> {
    await assert.rejects(
      cliente.query(sqlDeTeste, [randomUUID()]),
      (erro: { code?: string; constraint?: string }) =>
        erro.code === '23514' && erro.constraint === restricao,
      `o banco aceitou o que ${restricao} existe para recusar`,
    );
  }

  const BASE = `INSERT INTO network_events (id, slug, title, summary, place_name, neighborhood,
                  city, state, starts_at, origin, publication_status, published_at, geo, geo_source)
                VALUES ($1, '${PREFIXO}recusado', 'Titulo', 'Resumo', 'Praca', 'Bairro', 'Cidade', 'SP',
                        now() + interval '1 day'`;

  void it('`pending_review` so existe para o encontro da comunidade', async () => {
    await recusa(
      `${BASE}, 'admin', 'pending_review', NULL, NULL, NULL)`,
      'network_events_revisao_so_da_comunidade',
    );
  });

  void it('ponto sem origem e recusado', async () => {
    await recusa(
      `${BASE}, 'admin', 'published', now(), ST_SetSRID(ST_MakePoint(-46.6, -23.5), 4326)::geography, NULL)`,
      'network_events_ponto_anda_com_origem',
    );
  });

  void it('origem diferente de `map_pin` e recusada: nao ha geocodificacao', async () => {
    await recusa(
      `${BASE}, 'admin', 'published', now(), ST_SetSRID(ST_MakePoint(-46.6, -23.5), 4326)::geography, 'geocoded')`,
      'network_events_origem_do_ponto',
    );
  });

  void it('publicado sem `published_at` e recusado', async () => {
    await recusa(
      `${BASE}, 'admin', 'published', NULL, NULL, NULL)`,
      'network_events_visivel_foi_publicado',
    );
  });
});
