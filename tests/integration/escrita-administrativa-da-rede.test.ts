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
 * - **apagar a conta do administrador que enviou a imagem nao trava**, e a
 *   imagem fica no encontro (`ON DELETE SET NULL`, decisao de 28/09);
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
import type { Instant, UserId } from '../../src/shared/types/brands.js';
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

const DIA = 86_400_000;
const relogio: Clock = { now: () => Date.now() as Instant };
const ids = criarIdGenerator(() => relogio.now());

let banco: { db: Db; close: () => Promise<void> };
let config: ReturnType<typeof loadAppConfig>;
let autor: Autor;
let tutor: string;
const avisos: string[] = [];
const contas: string[] = [];
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

async function trilhaDe(resourceId: string): Promise<{ action: string; before: unknown; after: unknown; metadata: unknown }[]> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select(['action', 'before', 'after', 'metadata'])
    .where('resource_id', '=', resourceId)
    .orderBy('occurred_at', 'asc')
    .execute();
  return linhas;
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
    userId: dono,
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
  const userId = await novaConta({ displayName: 'Operacao' });
  await banco.db.insertInto('user_roles').values({ user_id: userId, role: 'admin' }).execute();
  autor = { userId: userId as UserId, sessao: 'a1b2c3d4e5f60718', ip: '203.0.113.7', correlationId: randomUUID() };
  tutor = await novaConta({ displayName: null });
  r = rede(criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey }));
});

after(async () => {
  if (banco === undefined) return;
  for (const slug of slugs) await banco.db.deleteFrom('network_events').where('slug', '=', slug).execute();
  await sql`delete from jobs where kind = 'network.join_request_approved'`.execute(banco.db);
  for (const id of contas) await banco.db.deleteFrom('users').where('id', '=', id).execute();
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
    assert.ok(!JSON.stringify(trilha).includes('-23.561'), 'a coordenada foi para a trilha');
    const peloSlug = await banco.db.selectFrom('audit.events').select('id').where('resource_id', '=', criado.recurso.slug).execute();
    assert.equal(peloSlug.length, 0);
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
    const upload = await envio('network_event', autor.userId);
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
    const upload = await envio('store_item', autor.userId);
    const erro = await r.criarEncontro(autor, corpo({ images: [{ upload_id: upload, alt_text: 'Produto' }] }) as never).catch((e: unknown) => e);
    assert.equal(codigo(erro), 'upload_not_usable');
  });

  void it('apagar a conta do administrador que enviou a imagem NAO trava, e a imagem fica no encontro', async () => {
    const outro = await novaConta({ displayName: 'Outro admin' });
    const upload = await envio('network_event', outro);
    const criado = await criar({ images: [{ upload_id: upload, alt_text: 'Capa do encontro' }] });
    await banco.db.deleteFrom('users').where('id', '=', outro).execute();
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
      .where('actor_user_id', '=', autor.userId)
      .orderBy('occurred_at', 'desc')
      .executeTakeFirst();
    assert.ok(linha !== undefined, 'a leitura da fila nao foi gravada na trilha (D55)');
    const metadata = linha.metadata as Record<string, unknown>;
    assert.equal(metadata['rows_returned'], 1);
    assert.ok(!JSON.stringify(metadata).includes('rede-adm-'), 'a trilha da leitura levou dado de pessoa');
  });

  void it('D56: com 300 linhas na hora somadas da trilha, a leitura responde 429', async () => {
    const outro = await novaConta({ displayName: 'Admin do teto' });
    const autorDoTeto: Autor = { ...autor, userId: outro as UserId };
    const trilha = criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey });
    await banco.db.transaction().execute((trx) =>
      trilha.recordIn(trx, {
        actorKind: 'user',
        actorUserId: outro as UserId,
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
    const linha = await sql<{ decided_by_user_id: string; status: string }>`
      select decided_by_user_id, status from network_event_join_requests where ref = ${ref}`.execute(banco.db);
    assert.equal(linha.rows[0]?.decided_by_user_id, autor.userId);
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
