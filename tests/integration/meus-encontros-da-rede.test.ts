/**
 * `Perfil` > `Meus eventos` contra um Postgres de verdade: a autoria mora na
 * clausula `WHERE`, e o encontro de outra pessoa NAO ENTRA.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE, e por que a prova NAO podia morar na rota
 * ===========================================================================
 *
 * `network-routes.test.ts` sobe um Fastify de verdade sobre um DOBRE do
 * repositorio -- e, no dobre, quem decide de quem e o encontro e o proprio
 * dobre. Afirmar ali que "o encontro de outra pessoa nao entra" seria medir
 * uma constante escrita no arquivo de teste: vacuidade, que e o defeito
 * recorrente deste repositorio. La ficou o que a rota decide (a conta vem do
 * token, a projecao tem sete propriedades, o `ETag` sai no cabecalho); aqui
 * fica o que a CONSULTA decide.
 *
 * ===========================================================================
 * O QUE ELE PROVA
 * ===========================================================================
 * 1. **`listarMeusEncontros` devolve so os encontros da conta que pediu.** O
 *    cenario tem quatro linhas: dois encontros da conta A (um futuro e um
 *    passado), um da conta B e um do PAINEL carimbado com a conta A como
 *    autora -- este ultimo e o caso que uma condicao sem `origin` deixaria
 *    passar.
 * 2. **O retirado (`removed`) nao entra**, e o **cancelado entra**: quem
 *    cancelou precisa ver que cancelou.
 * 3. **A ordem e a declarada**: o que ainda nao terminou primeiro, do mais
 *    proximo para o mais distante; o passado depois, do mais recente para o
 *    mais antigo.
 * 4. **`buscarMeuEncontro` devolve a VERSAO** -- a fonte do `ETag` -- e
 *    devolve `undefined` para o encontro de outra pessoa e para o do painel,
 *    pela mesma funcao de banco que a escrita usa (`network_events_do_autor`).
 * 5. **O estado da capa chega ao dono, com o motivo da recusa**, e a leitura
 *    publica da mesma linha nao o carrega.
 *
 * **Verificacao que nao consegue verificar REPROVA.** Sem `DATABASE_URL` o
 * `before` levanta, e o primeiro bloco confere que as linhas estao gravadas
 * antes de qualquer afirmacao sobre o que nao aparece.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type DbHandle } from '../../src/shared/db/pool.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { criarContadorDesligado } from '../../src/shared/http/rate-limit.js';
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import { problemas } from '../../src/shared/http/errors.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { EncontroDaComunidade } from '../../src/modules/network/application/encontro-da-comunidade.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import { registrarRotasDaRede } from '../../src/modules/network/adapters/http/network-routes.js';
import { paginaNenhumaPublicada } from '../../src/modules/lostfound/ports/disponibilidade-da-pagina.js';
import { projetarEncontro, projetarMeuEncontro } from '../../src/modules/network/domain/encontro-da-rede.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { NetworkRepository } from '../../src/modules/network/ports/network-repository.js';
import type { AbsoluteUrl, Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** Prefixo proprio: a limpeza apaga so o que este arquivo criou. */
const PREFIXO = 'isca-meus-';

const MEU_FUTURO = `${PREFIXO}meu-futuro`;
const MEU_MAIS_LONGE = `${PREFIXO}meu-mais-longe`;
const MEU_PASSADO = `${PREFIXO}meu-passado`;
const MEU_CANCELADO = `${PREFIXO}meu-cancelado`;
const MEU_RETIRADO = `${PREFIXO}meu-retirado`;
const DE_OUTRA_PESSOA = `${PREFIXO}de-outra-pessoa`;
/** Carimbado com a MINHA conta como autora, e `origin = 'admin'`. */
const DO_PAINEL = `${PREFIXO}do-painel`;

/** O motivo que o processador grava, e que a lista do dono tem de mostrar. */
const MOTIVO_DA_RECUSA = 'A imagem precisa ter pelo menos 600 x 600 pixels.';

let banco: DbHandle;
let cliente: pg.Client;
let repo: NetworkRepository;
let agora = 0 as Instant;
let eu = '';
let outra = '';
/**
 * Um Fastify de VERDADE sobre este MESMO Postgres.
 *
 * Existe porque o caminho que esta entrega fecha so e observavel inteiro com os
 * dois no caminho: a tela LE a versao por `getMyNetworkEvent` (cabecalho
 * `ETag`, da borda) e a manda em `If-Match` do cancelamento, que compara na
 * clausula `WHERE` do `UPDATE` (do banco). Nem o teste de rota sobre dobre nem
 * o de repositorio sem HTTP medem a junta dos dois. Mesmo arranjo de
 * `rede-p19-privado.test.ts`.
 */
let app: RegistradorDeRotas;

interface Resposta {
  readonly status: number;
  readonly etag: string | undefined;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function chamar(
  metodo: 'GET' | 'POST',
  url: string,
  opcoes: { conta?: string; ifMatch?: string; corpo?: Record<string, unknown> } = {},
): Promise<Resposta> {
  const r = await app.inject({
    method: metodo,
    url: `/v1${url}`,
    headers: {
      ...(opcoes.conta === undefined ? {} : { authorization: `Bearer ${opcoes.conta}` }),
      ...(opcoes.ifMatch === undefined ? {} : { 'if-match': opcoes.ifMatch }),
    },
    ...(opcoes.corpo === undefined ? {} : { payload: opcoes.corpo }),
  });
  const etag = r.headers['etag'];
  return {
    status: r.statusCode,
    etag: typeof etag === 'string' ? etag : undefined,
    corpo: r.body === '' ? {} : (JSON.parse(r.body) as Record<string, unknown>),
    bruto: r.body,
  };
}

interface Linha {
  readonly slug: string;
  readonly autor: 'eu' | 'outra' | 'ninguem';
  readonly origem: 'admin' | 'community';
  readonly publicacao: 'published' | 'cancelled' | 'removed';
  readonly comecaEmHoras: number;
}

const LINHAS: readonly Linha[] = [
  { slug: MEU_FUTURO, autor: 'eu', origem: 'community', publicacao: 'published', comecaEmHoras: 24 },
  { slug: MEU_MAIS_LONGE, autor: 'eu', origem: 'community', publicacao: 'published', comecaEmHoras: 72 },
  { slug: MEU_PASSADO, autor: 'eu', origem: 'community', publicacao: 'published', comecaEmHoras: -72 },
  { slug: MEU_CANCELADO, autor: 'eu', origem: 'community', publicacao: 'cancelled', comecaEmHoras: 48 },
  { slug: MEU_RETIRADO, autor: 'eu', origem: 'community', publicacao: 'removed', comecaEmHoras: 30 },
  { slug: DE_OUTRA_PESSOA, autor: 'outra', origem: 'community', publicacao: 'published', comecaEmHoras: 28 },
  // O ENCONTRO DO PAINEL, como o painel de fato o grava: SEM autor de `users`.
  //
  // ACHADO DESTA ENTREGA, e ele mudou este cenario. A linha nasceu aqui como
  // "encontro do painel COM a minha autoria" -- o caso que uma condicao sem
  // `origin = 'community'` deixaria passar. **Ela nao pode existir**: o
  // `CHECK network_events_autor_da_comunidade` (migracao `20260928000005`)
  // recusa `created_by_user_id` em encontro de `origin = 'admin'`, e o
  // `INSERT` morreu no preparo com `23514`.
  //
  // Ou seja: o banco JA garante que todo encontro com autor de `users` e
  // `community`. A clausula `origin = 'community'` de `network_events_da_conta`
  // continua escrita -- ela e o que faz o predicado do indice parcial casar, e
  // uma segunda tranca na mesma porta nao custa nada --, mas quem a sustenta e
  // o `CHECK`, e nao ela. O caso de baixo afirma o `CHECK` em vez de fingir um
  // cenario impossivel.
  { slug: DO_PAINEL, autor: 'ninguem', origem: 'admin', publicacao: 'published', comecaEmHoras: 26 },
];

async function criarConta(): Promise<string> {
  const id = randomUUID();
  // O e-mail leva o PREFIXO deste arquivo, e nao so o dominio `.invalid`: a
  // limpeza apaga por ele, e `%@exemplo-de-teste.invalid` alcancaria conta de
  // outro arquivo da suite.
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `${PREFIXO}${id}@exemplo-de-teste.invalid`],
  );
  return id;
}

async function inserir(linha: Linha): Promise<string> {
  const id = randomUUID();
  const autor = linha.autor === 'eu' ? eu : linha.autor === 'outra' ? outra : null;
  await cliente.query(
    `INSERT INTO network_events (
       id, slug, title, summary, place_name, neighborhood, city, state,
       starts_at, ends_at, time_zone, origin, publication_status,
       created_by_user_id, published_at, cancelled_at, cancellation_note)
     VALUES ($1, $2, 'Encontro da isca dos meus', 'Um caso da lista do dono.',
             'Praca da Isca', 'Bairro da Isca', 'Cidade da Isca', 'SP',
             now() + make_interval(hours => $3::int),
             now() + make_interval(hours => $3::int + 2),
             'America/Sao_Paulo', $4, $5, $6,
             now() - interval '7 days',
             CASE WHEN $5::text = 'cancelled' THEN now() - interval '1 day' END,
             CASE WHEN $5::text = 'cancelled' THEN 'Chuva forte prevista.' END)`,
    [id, linha.slug, linha.comecaEmHoras, linha.origem, linha.publicacao, autor],
  );
  return id;
}

/** Uma capa RECUSADA no encontro, como o processador a deixa. */
async function capaRecusada(eventoId: string): Promise<void> {
  const imagemId = randomUUID();
  await cliente.query(
    `INSERT INTO catalog_images (id, purpose, status, rejection_reason)
     VALUES ($1, 'network_event', 'rejected', $2)`,
    [imagemId, MOTIVO_DA_RECUSA],
  );
  await cliente.query(
    `INSERT INTO network_event_images (event_id, image_id, position, alt_text)
     VALUES ($1, $2, 0, 'A praca onde o encontro acontece')`,
    [eventoId, imagemId],
  );
}

/**
 * A limpeza, **na ordem que as chaves estrangeiras permitem**.
 *
 * `network_event_images.image_id` referencia `catalog_images` SEM cascata (so
 * `event_id` tem `ON DELETE CASCADE`, para `network_events`). Apagar
 * `catalog_images` primeiro viola `network_event_images_image_id_fkey` -- foi o
 * que esta funcao fazia, e o `before` morria no proprio preparo levando todos
 * os casos do arquivo com ele (`cancelledByParent`), que e a forma mais
 * confusa de um arquivo de teste falhar: nenhum caso mediu nada e todos
 * apareceram vermelhos.
 *
 * A ordem certa: guardar os `id` das imagens ENQUANTO a ligacao existe, apagar
 * os encontros (a cascata leva `network_event_images`) e so depois apagar as
 * imagens, agora orfas.
 */
async function limpar(): Promise<void> {
  const imagens = await cliente.query<{ id: string }>(
    `SELECT i.image_id AS id
       FROM network_event_images i
       JOIN network_events e ON e.id = i.event_id
      WHERE e.slug LIKE $1`,
    [`${PREFIXO}%`],
  );
  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
  if (imagens.rows.length > 0) {
    await cliente.query('DELETE FROM catalog_images WHERE id = ANY($1::uuid[])', [
      imagens.rows.map((l) => l.id),
    ]);
  }
  await cliente.query('DELETE FROM users WHERE email LIKE $1', [`${PREFIXO}%@exemplo-de-teste.invalid`]);
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova que a autoria da lista do dono mora na ' +
        'clausula WHERE, e sem banco ele nao prova nada. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  repo = criarNetworkRepository(banco.db, { uuidv7: () => randomUUID() }, (chave) => `https://midia.exemplo.invalid/${chave}`);

  await limpar();
  eu = await criarConta();
  outra = await criarConta();
  for (const linha of LINHAS) {
    const id = await inserir(linha);
    if (linha.slug === MEU_FUTURO) await capaRecusada(id);
  }

  const relogio = await cliente.query<{ agora: string }>(
    'select (extract(epoch from now()) * 1000)::bigint::text as agora',
  );
  agora = Number(relogio.rows[0]?.agora ?? 0) as Instant;

  const contrato = carregarContrato('api/openapi.yaml');
  app = criarServidor({
    problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  const conferir = vigiarParametrosDasRotas(app, contrato, '/v1');
  const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  void app.register(
    (escopo, _opcoes, pronto) => {
      const rede = criarNetworkRepository(
        banco.db,
        { uuidv7: () => randomUUID() },
        (chave) => `https://midia.exemplo.invalid/${chave}`,
      );
      registrarRotasDaRede(escopo, {
        rede,
        autenticador: {
          autenticar: (token: string) =>
            FORMA_DE_UUID.test(token)
              ? Promise.resolve({ userId: token as UserId })
              : Promise.reject(problemas.naoAutenticado()),
        },
        clock: systemClock,
        escritas: new EncontroDaComunidade({
          rede,
          trilha: { record: () => Promise.resolve() },
          ids: criarIdGenerator(() => Date.now()),
          clock: systemClock,
        }),
        // A pagina publica do encontro nao esta publicada nestes testes: eles
        // nao falam de compartilhamento, e `paginaNenhumaPublicada` e o dobre
        // que NUNCA acende -- entao nenhuma expectativa daqui muda por causa de
        // `share_url` (migracao `20261020000017`).
        baseDaWeb: 'https://site.exemplo.invalid' as AbsoluteUrl,
        paginas: paginaNenhumaPublicada,
        contrato,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  await app.ready();
  // A mesma conferencia da subida: operacao com parametro que pode recusar e
  // nao declara 400 derruba AQUI, e nao no contêiner.
  conferir();
});

after(async () => {
  if (cliente !== undefined) {
    await limpar();
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
});

async function minha(chamador: string = eu) {
  const pagina = await repo.listarMeusEncontros({ chamador, agora, page: 1, limit: 20 });
  return pagina;
}

void describe('o cenario existe: sete linhas, duas contas, e uma capa recusada', () => {
  void it('as sete linhas estao no banco, com autor e origem declarados', async () => {
    const r = await cliente.query<{ slug: string; origin: string; publication_status: string; meu: boolean }>(
      // `COALESCE(... = $2, false)` e nao `... = $2`: em coluna NULA a
      // comparacao devolve NULO, e `assert.equal(null, false)` reprova com
      // `null !== false` -- um caso vermelho por tres valores logicos, e nao
      // pelo que ele mede. O encontro do painel TEM a coluna nula, e e
      // justamente ele que este caso olha.
      `SELECT slug, origin, publication_status, COALESCE(created_by_user_id = $2, false) AS meu
         FROM network_events WHERE slug LIKE $1 ORDER BY slug`,
      [`${PREFIXO}%`, eu],
    );
    assert.equal(r.rows.length, LINHAS.length);
    const doPainel = r.rows.find((l) => l.slug === DO_PAINEL);
    assert.equal(doPainel?.origin, 'admin');
    // O encontro do painel nao tem autor de `users` -- nao por escolha deste
    // arquivo, mas porque o banco nao deixa. Ver o caso do `CHECK`, abaixo.
    assert.equal(doPainel?.meu, false);
    // E a de outra pessoa precisa ser de outra pessoa, ou o caso da autoria e vazio.
    assert.equal(r.rows.find((l) => l.slug === DE_OUTRA_PESSOA)?.meu, false);
  });

  void it('ACHADO: o banco RECUSA encontro do painel com autor de `users`', async () => {
    // Esta e a prova que substituiu o cenario impossivel. `network_events_da_conta`
    // filtra por `origin = 'community'`, e a pergunta natural e "e se alguem
    // carimbar autoria de usuario num encontro do painel?". A resposta e que
    // NAO DA: o `CHECK network_events_autor_da_comunidade` recusa, com `23514`.
    //
    // Afirmar isso e mais forte que inserir a linha e conferir que ela nao
    // aparece na lista -- a linha nao existe em banco nenhum.
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO network_events (
             id, slug, title, summary, place_name, neighborhood, city, state,
             starts_at, ends_at, time_zone, origin, publication_status,
             created_by_user_id, published_at)
           VALUES ($1, $2, 'Isca do CHECK de autoria', 'Nao deve entrar.',
                   'Praca da Isca', 'Bairro da Isca', 'Cidade da Isca', 'SP',
                   now() + interval '1 day', now() + interval '1 day 2 hours',
                   'America/Sao_Paulo', 'admin', 'published', $3, now())`,
          [randomUUID(), `${PREFIXO}check-de-autoria`, eu],
        ),
      (erro: unknown) =>
        (erro as { constraint?: string }).constraint === 'network_events_autor_da_comunidade',
    );
  });

  void it('a capa recusada esta gravada com motivo, como o banco exige', async () => {
    const r = await cliente.query<{ status: string; rejection_reason: string }>(
      `SELECT c.status, c.rejection_reason
         FROM catalog_images c
         JOIN network_event_images i ON i.image_id = c.id
         JOIN network_events e ON e.id = i.event_id
        WHERE e.slug = $1`,
      [MEU_FUTURO],
    );
    assert.equal(r.rows[0]?.status, 'rejected');
    assert.equal(r.rows[0]?.rejection_reason, MOTIVO_DA_RECUSA);
  });
});

void describe('ISCA -- a lista traz SO os meus, e o de outra pessoa nao entra', () => {
  void it('a minha lista tem os quatro meus visiveis, e nenhum dos tres outros', async () => {
    const slugs = (await minha()).itens.map((i) => i.encontro.slug).sort();
    assert.deepEqual(slugs, [MEU_CANCELADO, MEU_FUTURO, MEU_MAIS_LONGE, MEU_PASSADO].sort());
    // As tres ausencias, nomeadas: cada uma tem um motivo diferente.
    assert.equal(slugs.includes(DE_OUTRA_PESSOA), false, 'o encontro de outra pessoa entrou na minha lista');
    assert.equal(slugs.includes(DO_PAINEL), false, 'o encontro do painel entrou, e ele se administra pelo painel');
    assert.equal(slugs.includes(MEU_RETIRADO), false, 'o retirado entrou, e `removed` e terminal');
  });

  void it('a lista da OUTRA conta traz so o encontro dela -- a condicao e por conta', async () => {
    // O complemento exato do caso de cima. Sem ele, um `WHERE` que devolvesse
    // "os encontros da comunidade de qualquer conta menos as linhas acima"
    // passaria.
    const slugs = (await minha(outra)).itens.map((i) => i.encontro.slug);
    assert.deepEqual(slugs, [DE_OUTRA_PESSOA]);
  });

  void it('conta que nunca criou encontro recebe lista vazia, e nao erro', async () => {
    const pagina = await minha(randomUUID());
    assert.deepEqual(pagina.itens, []);
    assert.equal(pagina.total, 0);
  });

  void it('`total` e o da conta, e nao o da tabela', async () => {
    assert.equal((await minha()).total, 4);
    assert.equal((await minha(outra)).total, 1);
  });
});

void describe('a ordem: o que da para cancelar primeiro', () => {
  void it('nao terminados em ordem crescente, e o passado por ultimo', async () => {
    const slugs = (await minha()).itens.map((i) => i.encontro.slug);
    // 24 h, 48 h e 72 h a frente, e depois o de 72 h atras.
    assert.deepEqual(slugs, [MEU_FUTURO, MEU_CANCELADO, MEU_MAIS_LONGE, MEU_PASSADO]);
  });
});

void describe('ISCA -- `buscarMeuEncontro` e a FONTE da versao', () => {
  void it('devolve a versao do encontro, que e o que vai no `ETag`', async () => {
    const meu = await repo.buscarMeuEncontro(MEU_FUTURO, eu);
    assert.notEqual(meu, undefined);
    assert.equal(meu?.versao, 1);
    assert.equal(meu?.encontro.slug, MEU_FUTURO);
  });

  void it('encontro de outra pessoa, do painel, retirado e inexistente: `undefined` nos quatro', async () => {
    assert.equal(await repo.buscarMeuEncontro(DE_OUTRA_PESSOA, eu), undefined);
    assert.equal(await repo.buscarMeuEncontro(DO_PAINEL, eu), undefined);
    assert.equal(await repo.buscarMeuEncontro(MEU_RETIRADO, eu), undefined);
    assert.equal(await repo.buscarMeuEncontro(`${PREFIXO}nunca-existiu`, eu), undefined);
    // E o da outra conta e dela: a mesma linha, resposta diferente por conta.
    assert.notEqual(await repo.buscarMeuEncontro(DE_OUTRA_PESSOA, outra), undefined);
  });

  void it('a versao ANDA quando a linha e alterada, e o `ETag` anda com ela', async () => {
    // Sem este caso, uma versao fixa em 1 passaria -- e o 412 nunca
    // aconteceria, porque a precondicao casaria sempre.
    await cliente.query('UPDATE network_events SET version = version + 1 WHERE slug = $1', [MEU_CANCELADO]);
    assert.equal((await repo.buscarMeuEncontro(MEU_CANCELADO, eu))?.versao, 2);
    await cliente.query('UPDATE network_events SET version = version - 1 WHERE slug = $1', [MEU_CANCELADO]);
  });
});

void describe('ISCA -- o estado da capa chega ao dono, e nao ao visitante', () => {
  void it('a capa recusada sai na lista do dono com o motivo do servidor', async () => {
    const item = (await minha()).itens.find((i) => i.encontro.slug === MEU_FUTURO);
    assert.equal(item?.capa?.estado, 'rejected');
    assert.equal(item?.capa?.motivoDaRecusa, MOTIVO_DA_RECUSA);
    // Sem url: a derivada publica nao existe, e prometer o endereco dela seria
    // uma promessa que a tela descobre quebrada.
    assert.equal(item?.capa?.url, null);
  });

  void it('encontro sem imagem nenhuma sai com capa NULA, e nao `processing`', async () => {
    const item = (await minha()).itens.find((i) => i.encontro.slug === MEU_MAIS_LONGE);
    assert.equal(item?.capa, null);
  });

  void it('a leitura PUBLICA da mesma linha nao carrega estado nem motivo', async () => {
    // A outra metade da decisao: estado de processamento de imagem e assunto
    // entre quem enviou e o servidor. Varrido no JSON serializado, e nao campo
    // a campo -- e assim que um campo novo escapa.
    const publico = await repo.buscarEncontro(MEU_FUTURO);
    assert.notEqual(publico, undefined);
    const corpo = JSON.stringify(projetarEncontro(publico!, agora));
    for (const proibido of ['rejection_reason', 'rejected', '600 x 600']) {
      assert.equal(corpo.includes(proibido), false, `${proibido} na leitura publica`);
    }
    // E a imagem recusada nao vira capa publica nenhuma.
    assert.match(corpo, /"cover_image_url":null/);
  });

  void it('a projecao do dono tem SETE propriedades, e nenhuma do corpo publico', async () => {
    const item = (await minha()).itens.find((i) => i.encontro.slug === MEU_FUTURO);
    const corpo = projetarMeuEncontro(item!.encontro, item!.capa, agora);
    assert.deepEqual(Object.keys(corpo).sort(), [
      'cover',
      'ends_at',
      'slug',
      'starts_at',
      'status',
      'time_zone',
      'title',
    ]);
  });
});

void describe('o cancelado segue a regra da agenda, na lista do dono tambem', () => {
  void it('o cancelado que ainda nao terminou sai com `status` `cancelled`', async () => {
    const item = (await minha()).itens.find((i) => i.encontro.slug === MEU_CANCELADO);
    assert.equal(projetarMeuEncontro(item!.encontro, item!.capa, agora).status, 'cancelled');
  });

  void it('o meu passado sai com `status` `ended`: nao da para cancelar', async () => {
    const item = (await minha()).itens.find((i) => i.encontro.slug === MEU_PASSADO);
    assert.equal(projetarMeuEncontro(item!.encontro, item!.capa, agora).status, 'ended');
  });
});

void describe('ISCA -- o caminho inteiro sobre HTTP e Postgres de verdade', () => {
  // ESTES SAO OS DOIS CAMINHOS QUE A BRANCH BASE NAO CONSEGUIU MEDIR (sucesso e
  // 412 com `ETag` velho). Em homologacao eles exigem um encontro da propria
  // conta, e criar encontro exige e-mail confirmado -- `409
  // contact-channel-unverified`, medido la em 19/10/2026 e reproduzido nesta
  // entrega. E as DUAS operacoes de leitura do dono nao existem em homologacao,
  // que roda `development`: `GET /v1/network/my-events` responde 404 la.
  //
  // Aqui eles sao medidos com Fastify de verdade sobre este mesmo Postgres, com
  // a migracao `20261019000010` aplicada -- o que cobre a junta que nenhum dos
  // outros dois niveis cobre: o `ETag` que a BORDA emite contra o `WHERE
  // version = :lida` que o BANCO compara.

  void it('a lista do dono responde 200 sobre HTTP, com a projecao de sete campos', async () => {
    const r = await chamar('GET', '/network/my-events', { conta: eu });
    assert.equal(r.status, 200, r.bruto);
    assert.equal(r.corpo['total'], 4);
    const itens = r.corpo['items'] as Record<string, unknown>[];
    assert.deepEqual(Object.keys(itens[0] ?? {}).sort(), [
      'cover',
      'ends_at',
      'slug',
      'starts_at',
      'status',
      'time_zone',
      'title',
    ]);
    // E sem `ETag`: a versao de uma pagina nao autoriza a escrita de um item.
    assert.equal(r.etag, undefined);
  });

  void it('a lista do dono sem conta responde 401, antes de qualquer consulta', async () => {
    const r = await chamar('GET', '/network/my-events');
    assert.equal(r.status, 401);
    assert.equal(r.bruto.includes(PREFIXO), false, 'o 401 nao conta que ha encontro nenhum');
  });

  void it('a leitura do dono responde 200 COM `ETag`, e as publicas sem', async () => {
    const minha = await chamar('GET', `/network/my-events/${MEU_FUTURO}`, { conta: eu });
    assert.equal(minha.status, 200, minha.bruto);
    assert.equal(minha.etag, '"1"');
    assert.equal((await chamar('GET', '/network/events')).etag, undefined);
    assert.equal((await chamar('GET', `/network/events/${MEU_FUTURO}`)).etag, undefined);
  });

  void it('a leitura do dono do encontro de outra pessoa responde 404, nunca 403', async () => {
    const r = await chamar('GET', `/network/my-events/${DE_OUTRA_PESSOA}`, { conta: eu });
    assert.equal(r.status, 404);
    assert.equal(r.etag, undefined);
  });

  void it('SUCESSO: o `ETag` da leitura autoriza o cancelamento, e a linha vira `cancelled`', async () => {
    const leitura = await chamar('GET', `/network/my-events/${MEU_MAIS_LONGE}`, { conta: eu });
    assert.equal(leitura.status, 200, leitura.bruto);
    assert.equal(leitura.etag, '"1"');

    const cancelamento = await chamar('POST', `/network/events/${MEU_MAIS_LONGE}/cancellation`, {
      conta: eu,
      ifMatch: leitura.etag,
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    assert.equal(cancelamento.status, 200, cancelamento.bruto);
    assert.equal(cancelamento.corpo['status'], 'cancelled');
    assert.equal(cancelamento.etag, '"2"');
    // A nota fica SO na trilha: ela nao sai na resposta publica.
    assert.equal(cancelamento.bruto.includes('organizador'), false);

    // E no BANCO, que e o que importa: estado, instante e versao.
    const linha = await cliente.query<{ publication_status: string; version: number; cancelled_at: string | null }>(
      'SELECT publication_status, version, cancelled_at FROM network_events WHERE slug = $1',
      [MEU_MAIS_LONGE],
    );
    assert.equal(linha.rows[0]?.publication_status, 'cancelled');
    assert.equal(linha.rows[0]?.version, 2);
    assert.notEqual(linha.rows[0]?.cancelled_at, null);

    // CANCELAR NAO APAGA: o encontro continua na lista do dono e na agenda.
    const lista = await chamar('GET', '/network/my-events', { conta: eu });
    const cancelado = (lista.corpo['items'] as Record<string, unknown>[]).find(
      (i) => i['slug'] === MEU_MAIS_LONGE,
    );
    assert.equal(cancelado?.['status'], 'cancelled');
  });

  void it('412: o `ETag` VELHO e recusado, e nada e gravado', async () => {
    // A versao do `MEU_FUTURO` e 1; mandar `"1"` DEPOIS de alguem salvar e o
    // caso real. Aqui o "alguem salvou" e um `UPDATE` direto, que e o que
    // acontece quando outra sessao edita entre a leitura e a confirmacao.
    const leitura = await chamar('GET', `/network/my-events/${MEU_FUTURO}`, { conta: eu });
    assert.equal(leitura.etag, '"1"');
    await cliente.query('UPDATE network_events SET version = version + 1 WHERE slug = $1', [MEU_FUTURO]);

    const r = await chamar('POST', `/network/events/${MEU_FUTURO}/cancellation`, {
      conta: eu,
      ifMatch: leitura.etag,
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    assert.equal(r.status, 412, r.bruto);
    assert.equal(r.corpo['type'], 'https://api.bichu.test/problems/precondition-failed');

    // NADA FOI GRAVADO: sem esta afirmacao, uma implementacao que cancelasse e
    // depois respondesse 412 passaria.
    const linha = await cliente.query<{ publication_status: string }>(
      'SELECT publication_status FROM network_events WHERE slug = $1',
      [MEU_FUTURO],
    );
    assert.equal(linha.rows[0]?.publication_status, 'published');

    // E a leitura seguinte entrega a versao NOVA, que e o caminho de saida que
    // o texto do 412 promete ("recarregue para ver como ele esta agora").
    assert.equal((await chamar('GET', `/network/my-events/${MEU_FUTURO}`, { conta: eu })).etag, '"2"');
  });

  void it('428: sem `If-Match` o cancelamento recusa, e ANTES de olhar a autoria', async () => {
    // Medido tambem em homologacao: o 428 sai igual para encontro de outra
    // pessoa, e isso e bom -- ele nao conta de quem o encontro e.
    const meu = await chamar('POST', `/network/events/${MEU_CANCELADO}/cancellation`, {
      conta: eu,
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    const alheio = await chamar('POST', `/network/events/${DE_OUTRA_PESSOA}/cancellation`, {
      conta: eu,
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    assert.equal(meu.status, 428);
    assert.equal(alheio.status, 428);
    assert.equal(meu.corpo['type'], 'https://api.bichu.test/problems/precondition-required');
    assert.equal(alheio.corpo['type'], meu.corpo['type']);
  });

  void it('404: cancelar o encontro de outra pessoa, com `If-Match` certo', async () => {
    const r = await chamar('POST', `/network/events/${DE_OUTRA_PESSOA}/cancellation`, {
      conta: eu,
      ifMatch: '"1"',
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    assert.equal(r.status, 404);
  });

  void it('401: cancelar sem conta nenhuma', async () => {
    const r = await chamar('POST', `/network/events/${MEU_CANCELADO}/cancellation`, {
      ifMatch: '"1"',
      corpo: { note: 'Cancelado pelo organizador no aplicativo.' },
    });
    assert.equal(r.status, 401);
  });
});
