/**
 * **A escrita administrativa da `Rede` e a fila de pedidos contra Postgres de
 * verdade** (BICHUS-273 e BICHUS-292; ADR-0027 itens 8, 12 e 17).
 *
 * O caso de uso roda com o repositorio Kysely, a trilha transacional e a
 * contagem na trilha reais. O que so o banco responde, e que o duble de
 * `admin-network-routes.test.ts` so imita:
 *
 * - **trilha que falha desfaz a escrita** (ISCA): o encontro nao existe depois;
 * - **a coordenada nunca vai para `audit.events`**, e o ponto e gravado e lido
 *   por `ST_MakePoint`/`ST_Y`/`ST_X`;
 * - **a leitura da fila grava `admin.network_join_request.listed`** (ISCA), e o
 *   teto de 300 linhas por hora e somado dessa linha, sob o papel de escrita da
 *   trilha (D56);
 * - **aprovar grava quem decidiu e enfileira o push**; recusar depois recusa
 *   (ISCA aprovado -> recusado);
 * - **a galeria nasce em `network_event_images`** e a leitura publica devolve
 *   `images` e `cover_image_url` so com imagem pronta;
 * - **apagar a intencao de envio nao leva a imagem do encontro**
 *   (`ON DELETE SET NULL`, decisao de 28/09), e a conta do painel que enviou
 *   nao se apaga por baixo da imagem (item 20.1: conta desativa, nao some);
 * - **D54**: pedido de encontro terminado ha mais de 30 dias sai do banco.
 *
 * ## Este arquivo REPROVA quando nao consegue verificar
 *
 * Sem banco, falha ruidosa. Linha de trilha que falta onde se espera uma
 * reprova nomeando a operacao.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { AdminAccountId, Instant } from '../../src/shared/types/brands.js';
import type { Clock } from '../../src/shared/time/clock.js';
import { AppError } from '../../src/shared/http/errors.js';
import {
  criarContagemNaTrilha,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { registroDeImagemDeCatalogo } from '../../src/modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import { chaveDoOriginalDeCatalogo } from '../../src/modules/media/domain/chave-de-objeto.js';
import {
  criarRedeAdministrativaRepository,
  expurgarPedidosVencidos,
} from '../../src/modules/network/adapters/persistence/kysely-rede-administrativa.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import { RedeAdministrativa, type Autor } from '../../src/modules/network/application/rede-administrativa.js';
import { criarAvisoAosAdministradores } from '../../src/modules/network/adapters/external/aviso-aos-administradores-por-email.js';

const DIA = 86_400_000;
const relogio: Clock = { now: () => Date.now() as Instant };
const ids = criarIdGenerator(() => relogio.now());

let banco: { db: Db; close: () => Promise<void> };
let config: ReturnType<typeof loadAppConfig>;
let autor: Autor;
let tutor: string;
const avisos: string[] = [];
const contas: string[] = [];
/** Contas do painel criadas pela massa, em `admin_accounts` (ADR-0027 item 20). */
const contasDoPainel: string[] = [];
const slugs: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8);
}

function rede(trilha: TrilhaTransacional): RedeAdministrativa {
  return new RedeAdministrativa({
    repositorio: criarRedeAdministrativaRepository({
      db: banco.db,
      trilha,
      contagem: criarContagemNaTrilha(),
      imagens: registroDeImagemDeCatalogo,
    }),
    avisos: {
      avisar: ({ assunto }) => {
        avisos.push(assunto);
        return Promise.resolve();
      },
    },
    ids,
    clock: relogio,
    urlDeMidia: (chave) => `https://midia.exemplo.invalid/${chave}`,
    registrarOcorrencia: () => undefined,
  });
}

let r: RedeAdministrativa;

function emDias(dias: number, hora = 12): string {
  const d = new Date(relogio.now() + dias * DIA);
  d.setUTCHours(hora, 0, 0, 0);
  return d.toISOString();
}

function corpo(ajuste: Record<string, unknown> = {}) {
  return {
    title: `Caminhada ${sufixo()}`,
    summary: 'Encontro de tutores para caminhar.',
    place: { place_name: 'Parque da Cidade', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' },
    starts_at: emDias(10, 12),
    ends_at: emDias(10, 14),
    ...ajuste,
  };
}

async function criar(ajuste: Record<string, unknown> = {}) {
  const criado = await r.criarEncontro(autor, corpo(ajuste));
  slugs.push(criado.recurso.slug);
  return criado;
}

async function idDoEncontro(slug: string): Promise<string> {
  const l = await banco.db.selectFrom('network_events').select('id').where('slug', '=', slug).executeTakeFirstOrThrow();
  return l.id;
}

async function trilhaDe(resourceId: string): Promise<
  { action: string; before: unknown; after: unknown; metadata: unknown; actor_kind: string; actor_admin_id: string | null; actor_user_id: string | null }[]
> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select(['action', 'before', 'after', 'metadata', 'actor_kind', 'actor_admin_id', 'actor_user_id'])
    .where('resource_id', '=', resourceId)
    .orderBy('occurred_at', 'asc')
    .execute();
  return linhas;
}

/** Uma conta do painel. O hash e de teste e nunca confere com senha nenhuma. */
async function novaContaDoPainel(nome: string): Promise<AdminAccountId> {
  const id = ids.uuidv7() as AdminAccountId;
  await banco.db.insertInto('admin_accounts').values({
    id,
    email: `rede-painel-${sufixo()}@exemplo.invalid`,
    display_name: nome,
    password_phc: '$pbkdf2-sha512$i=1$c2Fs$aGFzaA',
    password_updated_at: new Date(),
  }).execute();
  contasDoPainel.push(id);
  return id;
}

async function novaConta(ajuste: { displayName?: string | null; verificada?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await sql`
    insert into users (id, email, display_name, email_verified_at, created_at, updated_at)
    values (${id}::uuid, ${`rede-adm-${sufixo()}@exemplo.invalid`}, ${ajuste.displayName ?? null},
            ${ajuste.verificada === false ? null : new Date()}, '2025-03-14T10:00:00Z', now())
  `.execute(banco.db);
  contas.push(id);
  return id;
}

async function pedir(eventoId: string, userId: string, status: 'pending' | 'approved' | 'declined' = 'pending'): Promise<string> {
  const ref = randomUUID().replace(/-/g, '').slice(0, 24);
  await sql`
    insert into network_event_join_requests (id, ref, event_id, user_id, status, decided_at)
    values (${randomUUID()}::uuid, ${ref}, ${eventoId}::uuid, ${userId}::uuid, ${status},
            ${status === 'pending' ? null : new Date()})
  `.execute(banco.db);
  return ref;
}

async function envio(purpose: 'network_event' | 'store_item', dono: string): Promise<string> {
  const id = ids.uuidv7();
  await registroDeImagemDeCatalogo.registrarIntencao(banco.db, {
    id,
    adminAccountId: dono,
    purpose,
    objectKey: chaveDoOriginalDeCatalogo(ids.random128()),
    declaredType: 'image/jpeg',
    maxBytes: 5 * 1024 * 1024,
    expiresAt: new Date(relogio.now() + 600_000),
  });
  return id;
}

function codigo(erro: unknown): string | undefined {
  if (!(erro instanceof AppError)) return undefined;
  return erro.errors?.[0]?.code ?? erro.problemType;
}

before(async () => {
  config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  const adminAccountId = await novaContaDoPainel('Operacao');
  autor = { adminAccountId, sessao: 'a1b2c3d4e5f60718', ip: '203.0.113.7', correlationId: randomUUID() };
  tutor = await novaConta({ displayName: null });
  r = rede(criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey }));
});

after(async () => {
  if (banco === undefined) return;
  for (const slug of slugs) await banco.db.deleteFrom('network_events').where('slug', '=', slug).execute();
  await sql`delete from jobs where kind = 'network.join_request_approved'`.execute(banco.db);
  for (const id of contas) await banco.db.deleteFrom('users').where('id', '=', id).execute();
  await sql`delete from catalog_images where upload_intent_id in
              (select id from catalog_upload_intents where admin_account_id = any(${contasDoPainel}::uuid[]))`.execute(banco.db);
  await sql`delete from catalog_upload_intents where admin_account_id = any(${contasDoPainel}::uuid[])`.execute(banco.db);
  await sql`update network_event_join_requests set decided_by_admin_id = null
             where decided_by_admin_id = any(${contasDoPainel}::uuid[])`.execute(banco.db);
  for (const id of contasDoPainel) await banco.db.deleteFrom('admin_accounts').where('id', '=', id).execute();
  await banco.close();
});

void describe('a escrita administrativa da Rede, contra Postgres', () => {
  void it('criar publica, grava UMA linha de trilha pelo id interno, com a sessao, e sem a coordenada', async () => {
    const criado = await criar({ place: { ...corpo().place, point: { lat: -23.561, lon: -46.655 } } });
    assert.equal(criado.recurso.publication_status, 'published');
    assert.deepEqual(criado.recurso.place.point, { lat: -23.561, lon: -46.655 });
    const id = await idDoEncontro(criado.recurso.slug);
    const trilha = await trilhaDe(id);
    assert.deepEqual(trilha.map((t) => t.action), ['admin.network_event.created']);
    assert.deepEqual(trilha[0]?.metadata, { surface: 'admin', session: autor.sessao });
    // ADR-0027 20.7 fatia 7: a trilha do painel e `actor_kind = 'admin'`, com o
    // id em `actor_admin_id`, e nunca em `actor_user_id`.
    assert.equal(trilha[0]?.actor_kind, 'admin');
    assert.equal(trilha[0]?.actor_admin_id, autor.adminAccountId);
    assert.equal(trilha[0]?.actor_user_id, null);
    assert.ok(!JSON.stringify(trilha).includes('-23.561'), 'a coordenada foi para a trilha');
    const peloSlug = await banco.db.selectFrom('audit.events').select('id').where('resource_id', '=', criado.recurso.slug).execute();
    assert.equal(peloSlug.length, 0);
  });

  void it('fatia 7: autor do painel so em encontro admin, autor do app so em encontro community (CHECK)', async () => {
    const criado = await criar();
    const id = await idDoEncontro(criado.recurso.slug);
    // O autor do painel cabe no encontro do painel.
    await sql`update network_events set created_by_admin_id = ${autor.adminAccountId}::uuid where id = ${id}::uuid`.execute(banco.db);
    // ISCA: encontro `community` com autor do painel viola o CHECK.
    const doPainelNaComunidade = await sql`update network_events set origin = 'community' where id = ${id}::uuid`
      .execute(banco.db)
      .catch((e: unknown) => e);
    assert.equal((doPainelNaComunidade as { constraint?: string }).constraint, 'network_events_autor_do_painel');
    // ISCA: encontro `admin` com autor do app viola o outro CHECK.
    const doAppNoPainel = await sql`update network_events set created_by_user_id = ${tutor}::uuid where id = ${id}::uuid`
      .execute(banco.db)
      .catch((e: unknown) => e);
    assert.equal((doAppNoPainel as { constraint?: string }).constraint, 'network_events_autor_da_comunidade');
    await sql`update network_events set created_by_admin_id = null where id = ${id}::uuid`.execute(banco.db);
  });

  void it('ISCA: com a trilha falhando, o encontro NAO e gravado', async () => {
    const quebrada: TrilhaTransacional = { recordIn: () => Promise.reject(new Error('trilha fora do ar')) };
    const titulo = `Sem trilha ${sufixo()}`;
    await assert.rejects(() => rede(quebrada).criarEncontro(autor, corpo({ title: titulo })), /trilha fora do ar/);
    const linha = await banco.db.selectFrom('network_events').select('id').where('title', '=', titulo).executeTakeFirst();
    assert.equal(linha, undefined, 'o encontro ficou gravado sem linha de trilha');
  });

  void it('duas edicoes com o mesmo If-Match em paralelo: exatamente uma passa', async () => {
    const criado = await criar();
    const resultados = await Promise.allSettled([
      r.alterarEncontro(autor, criado.recurso.slug, criado.etag, { title: 'Titulo A' }),
      r.alterarEncontro(autor, criado.recurso.slug, criado.etag, { title: 'Titulo B' }),
    ]);
    assert.equal(resultados.filter((x) => x.status === 'fulfilled').length, 1);
  });

  void it('mover troca o ponto no banco e grava point_changed, nunca a coordenada', async () => {
    const criado = await criar({ place: { ...corpo().place, point: { lat: -23.5, lon: -46.6 } } });
    const movido = await r.moverEncontro(autor, criado.recurso.slug, criado.etag, {
      place: { ...corpo().place, place_name: 'Praca Nova', point: { lat: -23.4, lon: -46.5 } },
      reason: 'Reforma no parque.',
    });
    assert.deepEqual(movido.recurso.place.point, { lat: -23.4, lon: -46.5 });
    const trilha = await trilhaDe(await idDoEncontro(criado.recurso.slug));
    const evento = trilha.find((t) => t.action === 'admin.network_event.relocated');
    assert.equal((evento?.after as Record<string, unknown>)['point_changed'], true);
    assert.ok(!JSON.stringify(trilha).includes('-23.4'), 'a coordenada foi para a trilha');
  });

  void it('publico que vira privado ganha slug novo e o antigo some da leitura publica', async () => {
    const criado = await criar();
    const antigo = criado.recurso.slug;
    const mudado = await r.mudarAcesso(autor, antigo, criado.etag, { visibility: 'private', reason: 'Fechado.' });
    slugs.push(mudado.recurso.slug);
    assert.notEqual(mudado.recurso.slug, antigo);
    const publica = criarNetworkRepository(banco.db, ids, (c) => c);
    assert.equal(await publica.buscarEncontro(antigo), undefined);
  });
});

void describe('a galeria do encontro e a conta do administrador', () => {
  void it('galeria em network_event_images; a leitura publica so mostra imagem pronta, e a capa e a posicao 0', async () => {
    const upload = await envio('network_event', autor.adminAccountId);
    const criado = await criar({ images: [{ upload_id: upload, alt_text: 'Caes correndo no gramado' }] });
    const id = await idDoEncontro(criado.recurso.slug);
    const galeria = await banco.db.selectFrom('network_event_images').selectAll().where('event_id', '=', id).execute();
    assert.equal(galeria.length, 1);
    assert.equal(criado.recurso.images[0]?.status, 'processing');

    const publica = criarNetworkRepository(banco.db, ids, (c) => `https://midia.exemplo.invalid/${c}`);
    assert.deepEqual((await publica.buscarEncontro(criado.recurso.slug))?.imagens, [], 'imagem em processamento saiu');

    await sql`update catalog_images set status = 'ready', public_key = 'card/capa-1.webp' where id = ${galeria[0]?.image_id ?? ''}::uuid`.execute(banco.db);
    const pronta = await publica.buscarEncontro(criado.recurso.slug);
    assert.deepEqual(pronta?.imagens, [{ url: 'https://midia.exemplo.invalid/card/capa-1.webp', textoAlternativo: 'Caes correndo no gramado' }]);
  });

  void it('T9: envio de imagem de produto nao serve para encontro', async () => {
    const upload = await envio('store_item', autor.adminAccountId);
    const erro = await r.criarEncontro(autor, corpo({ images: [{ upload_id: upload, alt_text: 'Produto' }] }) as never).catch((e: unknown) => e);
    assert.equal(codigo(erro), 'upload_not_usable');
  });

  void it('apagar a intencao de envio NAO leva a imagem do encontro; a conta do painel que enviou nao se apaga', async () => {
    const outro = await novaContaDoPainel('Outro admin');
    const upload = await envio('network_event', outro);
    const criado = await criar({ images: [{ upload_id: upload, alt_text: 'Capa do encontro' }] });
    const apagarConta = await banco.db.deleteFrom('admin_accounts').where('id', '=', outro).execute().catch((e: unknown) => e);
    assert.equal((apagarConta as { code?: string }).code, '23503', 'a conta do painel sumiu por baixo do envio');
    await banco.db.deleteFrom('catalog_upload_intents').where('id', '=', upload).execute();
    const imagem = await sql<{ upload_intent_id: string | null }>`
      select c.upload_intent_id from network_event_images i join catalog_images c on c.id = i.image_id
       where i.event_id = ${await idDoEncontro(criado.recurso.slug)}::uuid`.execute(banco.db);
    assert.equal(imagem.rows.length, 1, 'a imagem saiu do encontro com a conta');
    assert.equal(imagem.rows[0]?.upload_intent_id, null);
  });
});

void describe('a fila de pedidos, contra Postgres (D53 a D56)', () => {
  void it('ISCA: a leitura grava admin.network_join_request.listed com a quantidade e sem nomes; D53 na projecao', async () => {
    const privado = await criar({ visibility: 'private' });
    const evento = await idDoEncontro(privado.recurso.slug);
    await pedir(evento, tutor);
    const pagina = await r.listarFila(autor, { eventoSlug: privado.recurso.slug, page: 1, limit: 50 });
    assert.equal(pagina.items.length, 1);
    assert.deepEqual(pagina.items[0]?.requester, { display_name: null, member_since: '2025-03', email_verified: true });
    const linha = await banco.db
      .selectFrom('audit.events')
      .select(['metadata'])
      .where('action', '=', 'admin.network_join_request.listed')
      .where('actor_admin_id', '=', autor.adminAccountId)
      .orderBy('occurred_at', 'desc')
      .executeTakeFirst();
    assert.ok(linha !== undefined, 'a leitura da fila nao foi gravada na trilha (D55)');
    const metadata = linha.metadata as Record<string, unknown>;
    assert.equal(metadata['rows_returned'], 1);
    assert.ok(!JSON.stringify(metadata).includes('rede-adm-'), 'a trilha da leitura levou dado de pessoa');
  });

  void it('D56: com 300 linhas na hora somadas da trilha, a leitura responde 429', async () => {
    const outro = await novaContaDoPainel('Admin do teto');
    const autorDoTeto: Autor = { ...autor, adminAccountId: outro };
    const trilha = criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey });
    await banco.db.transaction().execute((trx) =>
      trilha.recordIn(trx, {
        actorKind: 'admin',
        actorAdminId: outro,
        action: 'admin.network_join_request.listed',
        resourceKind: 'network_join_request',
        metadata: { rows_returned: 300 },
      }),
    );
    const erro = await r.listarFila(autorDoTeto, { page: 1, limit: 50 }).catch((e: unknown) => e);
    assert.ok(erro instanceof AppError, String(erro));
    assert.equal(erro.status, 429);
  });

  void it('aprovar grava quem decidiu e enfileira o push; ISCA: aprovado -> recusado e recusado', async () => {
    const privado = await criar({ visibility: 'private' });
    const evento = await idDoEncontro(privado.recurso.slug);
    const ref = await pedir(evento, tutor);
    const aprovado = await r.aprovarPedido(autor, ref);
    assert.equal(aprovado.status, 'approved');
    const linha = await sql<{ decided_by_admin_id: string; status: string }>`
      select decided_by_admin_id, status from network_event_join_requests where ref = ${ref}`.execute(banco.db);
    assert.equal(linha.rows[0]?.decided_by_admin_id, autor.adminAccountId);
    const trabalhos = await sql<{ n: string }>`
      select count(*) as n from jobs where kind = 'network.join_request_approved'
         and payload ->> 'join_request_id' = (select id::text from network_event_join_requests where ref = ${ref})`.execute(banco.db);
    assert.equal(Number(trabalhos.rows[0]?.n), 1);

    const erro = await r.recusarPedido(autor, ref).catch((e: unknown) => e);
    assert.equal(codigo(erro), 'request_not_pending');
    assert.equal((await sql<{ status: string }>`select status from network_event_join_requests where ref = ${ref}`.execute(banco.db)).rows[0]?.status, 'approved');

    const publica = criarNetworkRepository(banco.db, ids, (c) => c);
    assert.ok((await publica.buscarDetalhesPrivados(privado.recurso.slug, tutor)) !== undefined, 'o aprovado nao ve o encontro');
  });

  void it('recusar nao enfileira nada, e o recusado pode ser revertido para aprovado', async () => {
    const privado = await criar({ visibility: 'private' });
    const evento = await idDoEncontro(privado.recurso.slug);
    const conta = await novaConta();
    const ref = await pedir(evento, conta);
    await r.recusarPedido(autor, ref);
    const antes = await sql<{ n: string }>`select count(*) as n from jobs where kind = 'network.join_request_approved'
      and payload ->> 'join_request_id' = (select id::text from network_event_join_requests where ref = ${ref})`.execute(banco.db);
    assert.equal(Number(antes.rows[0]?.n), 0);
    assert.equal((await r.aprovarPedido(autor, ref)).status, 'approved');
  });

  void it('ISCA (QA 28/09): pedido de encontro cancelado ou removido responde 409, e nao 404 nem aprovacao', async () => {
    for (const estado of ['cancelled', 'removed'] as const) {
      const privado = await criar({ visibility: 'private' });
      const evento = await idDoEncontro(privado.recurso.slug);
      const ref = await pedir(evento, await novaConta());
      await sql`update network_events set publication_status = ${estado}, cancelled_at = now() where id = ${evento}::uuid`.execute(banco.db);
      const erro = await r.aprovarPedido(autor, ref).catch((e: unknown) => e);
      assert.ok(erro instanceof AppError, String(erro));
      assert.equal(erro.problemType, 'event-not-open', estado);
      assert.equal(erro.status, 409);
      const linha = await sql<{ status: string }>`select status from network_event_join_requests where ref = ${ref}`.execute(banco.db);
      assert.equal(linha.rows[0]?.status, 'pending');
    }
  });

  void it('member_since sai no mes de Sao Paulo: conta criada 01/04 02h UTC e de marco', async () => {
    const privado = await criar({ visibility: 'private' });
    const evento = await idDoEncontro(privado.recurso.slug);
    const conta = await novaConta();
    await sql`update users set created_at = '2026-04-01T02:00:00Z' where id = ${conta}::uuid`.execute(banco.db);
    await pedir(evento, conta);
    const pagina = await r.listarFila(autor, { eventoSlug: privado.recurso.slug, page: 1, limit: 50 });
    assert.equal(pagina.items[0]?.requester.member_since, '2026-03');
  });

  void it('D54: pedido de encontro que terminou ha mais de 30 dias sai; o recente fica', async () => {
    const velho = await criar();
    const recente = await criar({ visibility: 'private' });
    const idVelho = await idDoEncontro(velho.recurso.slug);
    const idRecente = await idDoEncontro(recente.recurso.slug);
    await sql`update network_events set visibility = 'private', starts_at = now() - interval '40 days',
              ends_at = now() - interval '40 days' + interval '2 hours' where id = ${idVelho}::uuid`.execute(banco.db);
    const conta = await novaConta();
    const refVelho = await pedir(idVelho, conta, 'approved');
    const refRecente = await pedir(idRecente, conta, 'declined');
    await expurgarPedidosVencidos(banco.db, new Date(relogio.now()), 30);
    const sobraram = await sql<{ ref: string }>`select ref from network_event_join_requests where ref in (${refVelho}, ${refRecente})`.execute(banco.db);
    assert.deepEqual(sobraram.rows.map((x) => x.ref), [refRecente]);
  });
});

void describe('o aviso a todos os administradores (D52, D60), contra Postgres', () => {
  void it('vai para toda conta ativa do painel, e nunca para conta do app nem para conta desativada', async () => {
    const desativada = await novaContaDoPainel('Desativada');
    await banco.db
      .updateTable('admin_accounts')
      .set({ status: 'disabled', disabled_at: new Date() })
      .where('id', '=', desativada)
      .execute();
    const enviados: { para: string; assunto: string }[] = [];
    const aviso = criarAvisoAosAdministradores({
      db: banco.db,
      mailer: {
        enviar: (m) => {
          enviados.push({ para: m.para, assunto: m.assunto });
          return Promise.resolve();
        },
      },
      registrarOcorrencia: () => undefined,
    });
    await aviso.avisar({ assunto: 'Encontro criado: teste', linhas: ['linha'] });
    const doAutor = await banco.db.selectFrom('admin_accounts').select('email').where('id', '=', autor.adminAccountId).executeTakeFirstOrThrow();
    const doTutor = await banco.db.selectFrom('users').select('email').where('id', '=', tutor).executeTakeFirstOrThrow();
    const doDesativado = await banco.db.selectFrom('admin_accounts').select('email').where('id', '=', desativada).executeTakeFirstOrThrow();
    assert.ok(enviados.some((e) => e.para === doAutor.email), 'o administrador nao recebeu o aviso');
    assert.ok(!enviados.some((e) => e.para === doTutor.email), 'a conta do app recebeu o aviso do painel');
    assert.ok(!enviados.some((e) => e.para === doDesativado.email), 'a conta desativada do painel recebeu o aviso');
    assert.match(enviados[0]?.assunto ?? '', /^\[Bichu painel\] Encontro criado/);
  });

  void it('se nenhum envio sai, o aviso falha alto (o caso de uso registra, e a escrita fica)', async () => {
    const ocorrencias: unknown[] = [];
    const aviso = criarAvisoAosAdministradores({
      db: banco.db,
      mailer: { enviar: () => Promise.reject(new Error('smtp fora do ar')) },
      registrarOcorrencia: (dados) => {
        ocorrencias.push(dados);
      },
    });
    await assert.rejects(() => aviso.avisar({ assunto: 'x', linhas: [] }), /nenhum administrador recebeu/);
    assert.ok(ocorrencias.length > 0);
  });
});

void describe('o cancelado sem ends_at na agenda publica (decisao de 28/09)', () => {
  void it('ISCA (regra antiga): segue no recorte upcoming ate 23:59:59 do dia no fuso dele, e so depois vai para past', async () => {
    const criado = await criar({ ends_at: undefined });
    const id = await idDoEncontro(criado.recurso.slug);
    await sql`update network_events set starts_at = '2026-10-10T15:00:00Z', ends_at = null,
              publication_status = 'cancelled', cancelled_at = now(), time_zone = 'America/Sao_Paulo'
              where id = ${id}::uuid`.execute(banco.db);
    const publica = criarNetworkRepository(banco.db, ids, (c) => c);
    const recorte = (when: 'upcoming' | 'past', agora: string) =>
      publica.listarAgenda({ q: criado.recurso.title, when, sort: 'proximos', agora: Date.parse(agora) as Instant, page: 1, limit: 20 });
    // 17h em Sao Paulo, horas depois do inicio: a regra antiga ja dava `ended`.
    assert.equal((await recorte('upcoming', '2026-10-10T20:00:00Z')).total, 1);
    assert.equal((await recorte('past', '2026-10-10T20:00:00Z')).total, 0);
    // 23:59:59 local ainda e o dia; 00:00:01 local do dia seguinte ja nao e.
    assert.equal((await recorte('upcoming', '2026-10-11T02:59:59Z')).total, 1);
    assert.equal((await recorte('upcoming', '2026-10-11T03:00:01Z')).total, 0);
    assert.equal((await recorte('past', '2026-10-11T03:00:01Z')).total, 1);
  });
});
