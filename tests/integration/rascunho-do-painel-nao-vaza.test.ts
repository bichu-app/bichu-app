/**
 * O RASCUNHO DO PAINEL NAO APARECE PARA NINGUEM FORA DO PAINEL.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * Em 15/11/2026 o cliente pediu que *"novos eventos cadastrados sejam sempre
 * salvos como Rascunho, para depois eu aprovar manualmente depois"* (ADR-0027
 * item 25). Isso criou o primeiro estado de `network_events` que **existe e nao
 * aparece**: `draft`.
 *
 * `removed` tambem nao aparece, e por isso a arquitetura ja estava do lado
 * certo: `consultaBase` filtra `e.publication_status IN (...)` por uma lista
 * POSITIVA (`VISIVEL`), e nao por uma negativa. Um estado novo fica de fora
 * sozinho. **E justamente por isso este arquivo e necessario**: quando a
 * protecao e estrutural, ninguem a exercita, e a primeira consulta escrita sem
 * ela nao reprova em lugar nenhum. O que se mede aqui nao e se o rascunho vaza
 * hoje -- e se ele vazaria caso alguem esquecesse o `WHERE`.
 *
 * ===========================================================================
 * A ISCA, E POR QUE ELA E MECANICA
 * ===========================================================================
 * Um teste que so afirma "o rascunho nao esta na lista" fica verde tambem
 * quando a lista esta vazia pelo motivo errado -- massa que nao entrou, cidade
 * que nao casa, relogio fora da janela. Entao cada afirmacao negativa tem um
 * CONTROLE POSITIVO ao lado: o encontro publicado irmao, criado na mesma
 * cidade, na mesma janela, pela mesma funcao, TEM de aparecer.
 *
 * E a isca propriamente dita (`a isca da isca`, no fim) nao olha o resultado:
 * ela toma o SQL que a propria `listarAgenda` compila, **retira dele o
 * predicado de publicacao** e roda o resto. Se o rascunho nao aparecer nem
 * assim, o predicado nao e o que o esconde, e todas as outras afirmacoes deste
 * arquivo estao verdes por acidente.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type DbHandle } from '../../src/shared/db/pool.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import { criarContagemDeEventosNovos } from '../../src/modules/network/adapters/persistence/kysely-contagem-de-eventos-novos.js';
import type { NetworkRepository } from '../../src/modules/network/ports/network-repository.js';
import type { ContagemDeEventosNovos } from '../../src/modules/network/ports/contagem-de-eventos-novos.js';
import type { Instant } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'];
const PREFIXO = 'isca-rascunho-';
const RASCUNHO = `${PREFIXO}rascunho-publico`;
const RASCUNHO_PRIVADO = `${PREFIXO}rascunho-privado`;
const PUBLICADO = `${PREFIXO}publicado`;
const CIDADE = 'Cidade Do Rascunho';
/** Uma conta qualquer, para as leituras que exigem chamador autenticado. */
const CHAMADOR = randomUUID();

let banco: DbHandle;
let cliente: pg.Client;
let repo: NetworkRepository;
let contagem: ContagemDeEventosNovos;
let agora: Instant;

/**
 * As tres linhas sao IDENTICAS no que a agenda recorta -- cidade, janela de
 * tempo, ponto, porte -- e diferem SO em `publication_status` e `visibility`.
 * E essa identidade que faz a comparacao significar alguma coisa: se o
 * publicado aparece e o rascunho nao, o que os separa e o estado, e nada mais.
 */
async function semear(): Promise<void> {
  const linhas = [
    { slug: PUBLICADO, publicacao: 'published', visibilidade: 'public', publishedAt: true },
    { slug: RASCUNHO, publicacao: 'draft', visibilidade: 'public', publishedAt: false },
    { slug: RASCUNHO_PRIVADO, publicacao: 'draft', visibilidade: 'private', publishedAt: false },
  ];
  for (const l of linhas) {
    await cliente.query(
      `INSERT INTO network_events (
         id, slug, title, summary, place_name, neighborhood, city, state,
         geo, geo_source, starts_at, ends_at, time_zone,
         origin, publication_status, visibility, published_at)
       VALUES ($1, $2, 'Encontro da isca do rascunho', 'Um caso do item 25 do ADR-0027.',
               'Praca da Isca', 'Bairro da Isca', $3, 'SP',
               ST_SetSRID(ST_MakePoint(-46.63, -23.55), 4326)::geography, 'map_pin',
               now() + interval '24 hours', now() + interval '26 hours',
               'America/Sao_Paulo', 'admin', $4, $5,
               CASE WHEN $6::boolean THEN now() - interval '1 hour' END)`,
      [randomUUID(), l.slug, CIDADE, l.publicacao, l.visibilidade, l.publishedAt],
    );
  }
  // Portes, para que o recorte `size` alcance as tres linhas igualmente.
  await cliente.query(
    `INSERT INTO network_event_sizes (event_id, size)
     SELECT e.id, s.size FROM network_events e
       CROSS JOIN (VALUES ('P'), ('M'), ('G'), ('GG')) AS s(size)
      WHERE e.slug LIKE $1`,
    [`${PREFIXO}%`],
  );
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova contra o BANCO que o rascunho do ' +
        'painel nao sai nas leituras publicas, e sem banco ele nao prova nada. Rode ' +
        '`npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  repo = criarNetworkRepository(banco.db, { uuidv7: () => randomUUID() }, (chave) => `https://midia.exemplo.invalid/${chave}`);
  contagem = criarContagemDeEventosNovos(banco.db);

  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
  await semear();

  const relogio = await cliente.query<{ agora: string }>(
    'select (extract(epoch from now()) * 1000)::bigint::text as agora',
  );
  agora = Number(relogio.rows[0]?.agora ?? 0) as Instant;
});

after(async () => {
  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
  await cliente.end();
  await banco.close();
});

void describe('o rascunho do painel nao vaza para o app nem para o publico (ADR-0027 item 25)', () => {
  /** Os slugs da isca que a pagina devolveu, na ordem em que vieram. */
  function slugsDaIsca(itens: readonly { slug: string }[]): string[] {
    return itens.map((i) => i.slug).filter((s) => s.startsWith(PREFIXO));
  }

  void it('o banco tem as tres linhas: o controle positivo de TODO este arquivo', async () => {
    // Sem este caso, um `DELETE` errado no `before` deixaria o arquivo inteiro
    // verde sem medir nada.
    const r = await cliente.query<{ publication_status: string; total: string }>(
      `SELECT publication_status, count(*)::text AS total FROM network_events
        WHERE slug LIKE $1 GROUP BY publication_status ORDER BY publication_status`,
      [`${PREFIXO}%`],
    );
    assert.deepEqual(
      r.rows.map((l) => [l.publication_status, l.total]),
      [
        ['draft', '2'],
        ['published', '1'],
      ],
    );
  });

  void it('a agenda nao devolve o rascunho, e devolve o publicado irmao', async () => {
    const pagina = await repo.listarAgenda({ when: 'upcoming', sort: 'proximos', agora, page: 1, limit: 50 });
    assert.deepEqual(slugsDaIsca(pagina.itens), [PUBLICADO], 'o rascunho entrou na agenda');
  });

  void it('o rascunho nao entra no `total` da agenda, e nao e so ausencia de item', async () => {
    // `total` vem de um `count` PROPRIO, e nao do tamanho da pagina: um `WHERE`
    // esquecido ali inflaria a contagem sem mostrar o item, e a pessoa veria
    // "3 eventos" numa lista de 1.
    const comCidade = await repo.listarAgenda({
      city: CIDADE,
      when: 'upcoming',
      sort: 'proximos',
      agora,
      page: 1,
      limit: 50,
    });
    assert.equal(comCidade.total, 1, 'o `total` da agenda contou rascunho');
    assert.deepEqual(slugsDaIsca(comCidade.itens), [PUBLICADO]);
  });

  void it('nenhum recorte da agenda traz o rascunho: cidade, busca, porte, acesso, visibilidade, situacao e tempo', async () => {
    const recortes = [
      { nome: 'cidade', extra: { city: CIDADE } },
      { nome: 'busca pelo titulo', extra: { q: 'isca do rascunho' } },
      { nome: 'porte', extra: { size: 'M' } },
      { nome: 'acesso gratuito', extra: { admission: 'free' as const } },
      { nome: 'visibilidade publica', extra: { visibility: 'public' as const } },
      { nome: 'visibilidade privada', extra: { visibility: 'private' as const } },
      { nome: 'situacao upcoming', extra: { status: 'upcoming' as const } },
    ];
    for (const r of recortes) {
      const pagina = await repo.listarAgenda({
        when: 'upcoming',
        sort: 'proximos',
        agora,
        page: 1,
        limit: 50,
        ...r.extra,
      });
      const slugs = slugsDaIsca(pagina.itens);
      assert.ok(!slugs.includes(RASCUNHO), `o recorte "${r.nome}" trouxe o rascunho publico`);
      assert.ok(!slugs.includes(RASCUNHO_PRIVADO), `o recorte "${r.nome}" trouxe o rascunho privado`);
    }
    // E o controle positivo dos sete de cima, no recorte que o publicado casa:
    // sem ele, os sete ficariam verdes com uma consulta que nao devolve nada.
    const comCidade = await repo.listarAgenda({
      city: CIDADE,
      when: 'upcoming',
      sort: 'proximos',
      agora,
      page: 1,
      limit: 50,
    });
    assert.deepEqual(slugsDaIsca(comCidade.itens), [PUBLICADO]);

    // `when: 'past'` e `'all'` tambem: o rascunho esta no futuro, e um recorte
    // de passado que o trouxesse seria o mesmo defeito por outro caminho.
    for (const when of ['past', 'all'] as const) {
      const pagina = await repo.listarAgenda({ when, sort: 'proximos', agora, page: 1, limit: 50 });
      const slugs = slugsDaIsca(pagina.itens);
      assert.ok(!slugs.includes(RASCUNHO), `when=${when} trouxe o rascunho`);
      assert.ok(!slugs.includes(RASCUNHO_PRIVADO), `when=${when} trouxe o rascunho privado`);
    }
  });

  void it('o mapa (agenda por distancia) nao devolve o rascunho, e devolve o publicado irmao', async () => {
    // As tres linhas tem o MESMO ponto, entao distancia nao as separa: so o
    // estado separa.
    const pagina = await repo.listarPorDistancia({
      chamador: CHAMADOR,
      familia: undefined,
      when: 'upcoming',
      sort: 'proximos',
      agora,
      page: 1,
      limit: 50,
    });
    assert.deepEqual(
      slugsDaIsca(pagina.itens.map((i) => i.encontro)),
      [PUBLICADO],
      'o rascunho entrou no mapa',
    );
    // SEM assercao sobre `pagina.total`: o mapa nao tem recorte de cidade, e o
    // `total` dele conta a massa dos OUTROS arquivos desta suite, que divide o
    // mesmo banco. O `total` so e afirmavel onde o recorte isola a isca -- e e
    // o que o caso da cidade faz.
  });

  void it('o `total` da agenda cresce em exatamente 1 quando o rascunho e publicado: a medida da exclusao', async () => {
    // O caso acima prova que o rascunho nao APARECE. Este prova que ele nao e
    // CONTADO, e prova por diferenca, que e a unica forma honesta num banco
    // compartilhado: a contagem absoluta inclui a massa dos outros arquivos.
    const contar = async (): Promise<number> =>
      (await repo.listarAgenda({ when: 'upcoming', sort: 'proximos', agora, page: 1, limit: 1 })).total;

    const antes = await contar();
    const novosAntes = await contagem.contar({ agora });

    await cliente.query(
      `UPDATE network_events SET publication_status = 'published', published_at = now() - interval '1 hour'
        WHERE slug = $1`,
      [RASCUNHO],
    );
    assert.equal(await contar(), antes + 1, 'publicar o rascunho nao mudou o `total`: ele ja estava sendo contado');
    assert.equal(
      await contagem.contar({ agora }),
      novosAntes + 1,
      'publicar o rascunho nao mudou a contagem de eventos novos: ele ja estava sendo contado',
    );

    // De volta a rascunho, para os casos seguintes verem o estado semeado.
    await cliente.query(
      `UPDATE network_events SET publication_status = 'draft', published_at = NULL WHERE slug = $1`,
      [RASCUNHO],
    );
    assert.equal(await contar(), antes);
    assert.equal(await contagem.contar({ agora }), novosAntes);
  });

  void it('o detalhe pelo slug responde vazio para os dois rascunhos, e responde para o publicado', async () => {
    assert.equal(await repo.buscarEncontro(RASCUNHO), undefined, 'o detalhe entregou o rascunho publico');
    assert.equal(await repo.buscarEncontro(RASCUNHO_PRIVADO), undefined, 'o detalhe entregou o rascunho privado');
    assert.notEqual(await repo.buscarEncontro(PUBLICADO), undefined, 'o detalhe nao achou o publicado irmao');
  });

  void it('o ponto no mapa (`location`) nao sai para rascunho nenhum, nem para quem esta autenticado', async () => {
    // As tres linhas TEM ponto, de proposito: a ausencia aqui e do estado, e nao
    // da coluna vazia.
    assert.equal(await repo.buscarLocalDoEncontro(RASCUNHO, CHAMADOR), undefined);
    assert.equal(await repo.buscarLocalDoEncontro(RASCUNHO_PRIVADO, CHAMADOR), undefined);
    assert.notEqual(await repo.buscarLocalDoEncontro(PUBLICADO, CHAMADOR), undefined, 'o publicado irmao perdeu o ponto');
  });

  void it('o detalhe de encontro privado nao sai para o rascunho privado', async () => {
    assert.equal(await repo.buscarDetalhesPrivados(RASCUNHO_PRIVADO, CHAMADOR), undefined);
  });

  void it('a contagem de eventos novos do app, com `desde`, nao conta rascunho: ele nao tem `published_at`', async () => {
    // O recorte `desde` le `e.published_at`, e o rascunho o tem NULO -- entao ele
    // esta fora por dois caminhos independentes: o predicado de publicacao e a
    // comparacao de data. Medido por diferenca, pelo motivo do caso acima.
    const umDiaAtras = (agora - 24 * 60 * 60 * 1000) as Instant;
    const antes = await contagem.contar({ agora, desde: umDiaAtras });

    await cliente.query(
      `UPDATE network_events SET publication_status = 'published', published_at = now() - interval '1 hour'
        WHERE slug = $1`,
      [RASCUNHO],
    );
    assert.equal(await contagem.contar({ agora, desde: umDiaAtras }), antes + 1);

    await cliente.query(
      `UPDATE network_events SET publication_status = 'draft', published_at = NULL WHERE slug = $1`,
      [RASCUNHO],
    );
    assert.equal(await contagem.contar({ agora, desde: umDiaAtras }), antes);
  });

  void it('A ISCA DA ISCA: sem o predicado de publicacao, a MESMA consulta devolve os rascunhos', async () => {
    // Nao olha resultado de produto: toma o SQL que `listarAgenda` compila,
    // apaga dele o predicado de publicacao e roda o resto. Se os rascunhos nao
    // aparecerem assim, o predicado NAO e o que os esconde, e todo este arquivo
    // esta verde por acidente.
    const { construtorDaAgenda } = await import(
      '../../src/modules/network/adapters/persistence/kysely-network-repository.js'
    );
    const compilada = construtorDaAgenda(banco.db, {
      city: CIDADE,
      when: 'upcoming',
      sort: 'proximos',
      agora,
      page: 1,
      limit: 50,
    })
      .select(['e.slug as slug'])
      .compile();

    const comPredicado = /"e"\."publication_status" in \([^)]*\)/i;
    assert.match(compilada.sql, comPredicado, 'a consulta da agenda nao tem predicado de publicacao para neutralizar');
    // NEUTRALIZA em vez de APAGAR: `(predicado OR true)` e sempre verdadeiro, e
    // mantem `$1`/`$2` citados. Apagar o trecho deixava os dois parametros sem
    // uso, e o Postgres recusa com `could not determine data type of parameter
    // $1` -- a consulta nem chegava a rodar, e o caso reprovava por erro de SQL
    // em vez de medir o que veio medir.
    const semPredicado = compilada.sql.replace(comPredicado, (achado) => `(${achado} OR true)`);
    assert.notEqual(semPredicado, compilada.sql);

    const r = await cliente.query<{ slug: string }>(semPredicado, [...compilada.parameters]);
    const slugs = r.rows.map((l) => l.slug).filter((s) => s.startsWith(PREFIXO));
    assert.ok(
      slugs.includes(RASCUNHO),
      'sem o predicado de publicacao o rascunho CONTINUOU fora: o que o esconde nao e o `WHERE`, ' +
        'e as outras afirmacoes deste arquivo nao medem o que dizem medir',
    );
    assert.ok(slugs.includes(PUBLICADO), 'o publicado irmao sumiu da consulta mutilada');
  });
});
