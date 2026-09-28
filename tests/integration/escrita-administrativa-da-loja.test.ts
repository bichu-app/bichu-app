/**
 * **A escrita administrativa da `Loja` contra Postgres de verdade** (BICHUS-266
 * e BICHUS-267; ADR-0027 itens 8 e 14).
 *
 * O caso de uso roda com o repositorio Kysely e a trilha transacional reais. O
 * que so o banco responde, e que o dublê de `catalogo-administrativo.test.ts`
 * so imita:
 *
 * - **a linha de trilha e gravada na mesma transacao**, com o `id` interno,
 *   e some junto quando a escrita e desfeita;
 * - **a versao no `WHERE`**: duas edicoes com o mesmo `If-Match` em paralelo, e
 *   exatamente uma passa;
 * - **o `slug` ocupado vem do indice unico** e vira 409;
 * - **`published_at` nao e reescrito** (`coalesce` no `UPDATE`);
 * - **o rascunho nao aparece na vitrine publica**, e o publicado aparece;
 * - **o preco consultado ha 31 dias NAO aparece em `GET /v1/store/items`**, e
 *   aparece no painel com `valid_until`. Esta e a isca do briefing, pela rota
 *   publica de verdade.
 *
 * As rotas `/v1/admin/store/...` (guarda, CSRF, reautenticacao, corpo fechado)
 * sao provadas em `escrita-da-loja-pelo-http.test.ts`, que depende da sessao
 * administrativa.
 *
 * ## Este arquivo REPROVA quando nao consegue verificar
 *
 * Sem banco, falha ruidosa. Sem nenhuma linha de trilha encontrada onde se
 * esperava uma, falha nomeando a operacao.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { AbsoluteUrl, Instant, UserId } from '../../src/shared/types/brands.js';
import { chaveDoOriginalDeCatalogo } from '../../src/modules/media/domain/chave-de-objeto.js';
import type { Clock } from '../../src/shared/time/clock.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { escoparRotas, type RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarTrilhaTransacional } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { TrilhaTransacional } from '../../src/modules/audit/ports/audit-log.js';
import { registroDeImagemDeCatalogo } from '../../src/modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import type { PreparadorDeEnvioDeCatalogo } from '../../src/modules/media/ports/imagem-de-catalogo.js';
import { criarCatalogoAdministrativoRepository } from '../../src/modules/store/adapters/persistence/kysely-catalogo-administrativo.js';
import { criarStoreRepository } from '../../src/modules/store/adapters/persistence/kysely-store-repository.js';
import { registrarRotasDaVitrine } from '../../src/modules/store/adapters/http/store-routes.js';
import {
  CatalogoAdministrativo,
  type Autor,
} from '../../src/modules/store/application/catalogo-administrativo.js';
import { AppError } from '../../src/shared/http/errors.js';

const DIA = 86_400_000;

/** O relogio desta suite: hoje, e movel para frente nos casos de vencimento. */
let deslocamento = 0;
const relogio: Clock = { now: () => (Date.now() + deslocamento) as Instant };

let banco: { db: Db; close: () => Promise<void> };
let app: RegistradorDeRotas;
let base: string;
let autor: Autor;
const parceirosCriados: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8);
}

function catalogo(trilha: TrilhaTransacional): CatalogoAdministrativo {
  const ids = criarIdGenerator(() => relogio.now());
  // A assinatura e do armazenamento, que esta suite nao sobe: a politica volta
  // fixa, e a chave e a de verdade (128 bits, prefixo do catalogo).
  const preparador: PreparadorDeEnvioDeCatalogo = {
    preparar: (contentType) =>
      Promise.resolve({
        uploadId: ids.uuidv7(),
        chave: chaveDoOriginalDeCatalogo(ids.random128()),
        contentType,
        maxBytes: 10 * 1024 * 1024,
        autorizacao: {
          metodo: 'POST',
          url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
          campos: {},
          expiraEm: new Date(relogio.now() + 600_000),
          maxBytes: 10 * 1024 * 1024,
        },
      }),
  };
  return new CatalogoAdministrativo({
    repositorio: criarCatalogoAdministrativoRepository({
      db: banco.db,
      trilha,
      imagens: registroDeImagemDeCatalogo,
    }),
    envios: preparador,
    ids,
    clock: relogio,
    urlDeMidia: (chave) => `https://midia.exemplo.invalid/${chave}`,
  });
}

let loja: CatalogoAdministrativo;

async function trilhaDe(resourceId: string): Promise<{ action: string; metadata: unknown }[]> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select(['action', 'metadata'])
    .where('resource_id', '=', resourceId)
    .orderBy('occurred_at', 'asc')
    .execute();
  return linhas.map((l) => ({ action: l.action, metadata: l.metadata }));
}

async function idDoItem(slug: string): Promise<string> {
  const l = await banco.db.selectFrom('store_items').select('id').where('slug', '=', slug).executeTakeFirstOrThrow();
  return l.id;
}

async function idDoParceiro(slug: string): Promise<string> {
  const l = await banco.db
    .selectFrom('store_partners')
    .select('id')
    .where('slug', '=', slug)
    .executeTakeFirstOrThrow();
  return l.id;
}

async function novoParceiro(): Promise<{ slug: string; host: string; etag: string }> {
  const slug = `bo-p-${sufixo()}`;
  const host = `${slug}.exemplo.com.br`;
  const criado = await loja.criarParceiro(autor, { slug, name: `Parceiro ${slug}`, host });
  parceirosCriados.push(slug);
  return { slug, host, etag: criado.etag };
}

interface ItemPublico {
  slug: string;
  price_amount: number | null;
  price_status: string;
  image_url: string | null;
  image_alt_text: string | null;
  species: string[];
  tags: { slug: string; label: string }[];
}

async function vitrinePublica(q: string, extra = ''): Promise<ItemPublico[]> {
  const resposta = await fetch(`${base}/v1/store/items?q=${encodeURIComponent(q)}&limit=20${extra}`);
  assert.equal(resposta.status, 200, await resposta.clone().text());
  const corpo = (await resposta.json()) as { items: ItemPublico[] };
  return corpo.items;
}

async function detalhePublico(slug: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${base}/v1/store/items/${slug}`);
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function envioDeItem(): Promise<string> {
  const r = await loja.autorizarEnvioDeCatalogo(autor, {
    purpose: 'store_item',
    content_type: 'image/webp',
    byte_size: 1000,
  });
  return r.uploadId;
}

/** O que o worker faria: a derivada no bucket publico e `ready`. Aqui, so o estado. */
async function marcarPronta(uploadId: string, chave: string): Promise<void> {
  await sql`
    update catalog_images set status = 'ready', public_key = ${chave}
     where upload_intent_id = ${uploadId}::uuid
  `.execute(banco.db);
}

before(async () => {
  const config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  const ids = criarIdGenerator(() => relogio.now());

  const userId = randomUUID() as UserId;
  await sql`
    insert into users (id, email, display_name, email_verified_at, created_at, updated_at)
    values (${userId}::uuid, ${`bo-loja-${sufixo()}@exemplo.invalid`}, 'Operacao', now(), now(), now())
  `.execute(banco.db);
  autor = { userId, sessao: 'a1b2c3d4e5f60718', ip: '203.0.113.7', correlationId: randomUUID() };

  loja = catalogo(criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey }));

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
  });
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDaVitrine(escopo, {
      vitrine: criarStoreRepository(banco.db, (chave) => `https://midia.exemplo.invalid/${chave}`),
      clock: relogio,
    });
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    for (const slug of parceirosCriados) {
      const id = await banco.db.selectFrom('store_partners').select('id').where('slug', '=', slug).executeTakeFirst();
      if (id === undefined) continue;
      await banco.db.deleteFrom('store_items').where('partner_id', '=', id.id).execute();
      await banco.db.deleteFrom('store_partners').where('id', '=', id.id).execute();
    }
    // `catalog_images.upload_intent_id` e SET NULL desde 28/09, entao a conta
    // ja sairia antes das imagens; as imagens de teste sao apagadas mesmo assim,
    // para nao sobrarem linhas orfas na pilha.
    await sql`
      delete from catalog_images
       where upload_intent_id in (select id from upload_intents where user_id = ${autor.userId}::uuid)
    `.execute(banco.db);
    await banco.db.deleteFrom('upload_intents').where('user_id', '=', autor.userId).execute();
    await banco.db.deleteFrom('store_tags').where('label', 'like', 'Tg %').execute();
    await banco.db.deleteFrom('users').where('id', '=', autor.userId).execute();
    await banco.close();
  }
});

void describe('a escrita administrativa da Loja, contra Postgres', () => {
  void it('ISCA: cada escrita grava UMA linha de trilha, pelo id interno, com a sessao', async () => {
    const p = await novoParceiro();
    const slug = `bo-i-${sufixo()}`;
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: 'Racao para cao adulto',
      summary: 'Racao seca, porte medio.',
      category: 'food',
      species: ['dog'],
      target_url: `https://${p.host}/racao`,
    });
    const editado = await loja.alterarItem(autor, slug, criado.etag, { summary: 'Racao seca, 10 kg.' });
    const publicado = await loja.publicarItem(autor, slug, editado.etag);
    await loja.retirarItem(autor, slug, publicado.etag);

    const doItem = await trilhaDe(await idDoItem(slug));
    assert.deepEqual(
      doItem.map((e) => e.action),
      ['admin.store_item.created', 'admin.store_item.updated', 'admin.store_item.published', 'admin.store_item.retired'],
    );
    for (const e of doItem) assert.deepEqual(e.metadata, { surface: 'admin', session: autor.sessao });

    const doParceiro = await trilhaDe(await idDoParceiro(p.slug));
    assert.deepEqual(doParceiro.map((e) => e.action), ['admin.store_partner.created']);

    // O `slug` nunca e a chave da trilha: nenhuma linha aponta para ele.
    const peloSlug = await banco.db.selectFrom('audit.events').select('id').where('resource_id', '=', slug).execute();
    assert.equal(peloSlug.length, 0);
  });

  void it('ISCA: com a trilha falhando, o parceiro NAO e gravado', async () => {
    const quebrada: TrilhaTransacional = {
      recordIn: () => Promise.reject(new Error('trilha fora do ar')),
    };
    const slug = `bo-p-${sufixo()}`;
    await assert.rejects(
      () => catalogo(quebrada).criarParceiro(autor, { slug, name: 'Sem trilha', host: 'semtrilha.com.br' }),
      /trilha fora do ar/,
    );
    const linha = await banco.db.selectFrom('store_partners').select('id').where('slug', '=', slug).executeTakeFirst();
    assert.equal(linha, undefined, 'o parceiro ficou gravado sem linha de trilha');
  });

  void it('duas edicoes com o mesmo If-Match em paralelo: exatamente uma passa, a outra e 412', async () => {
    const p = await novoParceiro();
    const resultados = await Promise.allSettled([
      loja.alterarParceiro(autor, p.slug, p.etag, { name: 'Primeira edicao' }),
      loja.alterarParceiro(autor, p.slug, p.etag, { name: 'Segunda edicao' }),
    ]);
    const passaram = resultados.filter((r) => r.status === 'fulfilled');
    const recusadas = resultados.filter(
      (r) => r.status === 'rejected' && r.reason instanceof AppError && r.reason.problemType === 'precondition-failed',
    );
    assert.equal(passaram.length, 1);
    assert.equal(recusadas.length, 1);
    assert.equal((await trilhaDe(await idDoParceiro(p.slug))).length, 2, 'criado + UMA edicao');
  });

  void it('slug ocupado vem do indice unico e vira 409', async () => {
    const p = await novoParceiro();
    const erro = await loja
      .criarParceiro(autor, { slug: p.slug, name: 'Outro', host: 'outro.com.br' })
      .catch((e: unknown) => e);
    assert.ok(erro instanceof AppError && erro.problemType === 'slug-taken', String(erro));
  });

  void it('rascunho fica fora da vitrine publica; publicado aparece; published_at nao e reescrito', async () => {
    const p = await novoParceiro();
    const slug = `bo-i-${sufixo()}`;
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: `Brinquedo ${slug}`,
      summary: 'Bola de borracha.',
      category: 'toy',
      species: ['dog'],
      target_url: `https://${p.host}/bola`,
    });
    assert.deepEqual(await vitrinePublica(slug), [], 'o rascunho apareceu no app');

    const pub = await loja.publicarItem(autor, slug, criado.etag);
    assert.deepEqual((await vitrinePublica(slug)).map((i) => i.slug), [slug]);

    const ret = await loja.retirarItem(autor, slug, pub.etag);
    assert.deepEqual(await vitrinePublica(slug), [], 'o retirado continuou no app');
    const repub = await loja.publicarItem(autor, slug, ret.etag);
    assert.equal(repub.recurso.published_at, pub.recurso.published_at);
  });

  void it('ISCA: preco consultado ha 31 dias NAO aparece em GET /v1/store/items; o painel o ve', async () => {
    const p = await novoParceiro();
    const slug = `bo-i-${sufixo()}`;
    const hoje = new Date(relogio.now()).toISOString().slice(0, 10);
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: `Racao ${slug}`,
      summary: 'Racao seca.',
      category: 'food',
      species: ['dog'],
      target_url: `https://${p.host}/racao`,
      price: { amount: 18990, currency: 'BRL', checked_at: hoje },
    });
    await loja.publicarItem(autor, slug, criado.etag);

    // A isca negativa primeiro: consultado hoje, o valor APARECE. Sem ela, uma
    // vitrine que nunca mostrasse preco passaria no caso de baixo.
    const vigente = await vitrinePublica(slug);
    assert.equal(vigente[0]?.price_amount, 18990);
    assert.equal(vigente[0]?.price_status, 'vigente');

    // 31 dias depois, pela mesma rota publica.
    deslocamento = 31 * DIA;
    try {
      const vencido = await vitrinePublica(slug);
      assert.equal(vencido[0]?.price_status, 'vencido');
      assert.equal(vencido[0]?.price_amount, null, 'a rota publica entregou o valor vencido');

      const painel = await loja.lerItem(slug);
      assert.equal(painel.recurso.price_status, 'vencido');
      assert.equal(painel.recurso.price?.amount, 18990, 'o painel precisa do numero antigo');
      assert.equal(painel.recurso.price?.checked_at, hoje);

      const filtrado = await loja.listarItens({
        partnerSlug: p.slug,
        priceStatus: 'vencido',
        sort: 'validade',
        page: 1,
        limit: 50,
      });
      assert.deepEqual(filtrado.items.map((i) => i.slug), [slug]);
    } finally {
      deslocamento = 0;
    }
  });

  void it('o painel lista rascunho, publicado e retirado, e filtra por estado', async () => {
    const p = await novoParceiro();
    const mk = async (rotulo: string): Promise<{ slug: string; etag: string }> => {
      const slug = `bo-${rotulo}-${sufixo()}`;
      const r = await loja.criarItem(autor, {
        slug,
        partner_slug: p.slug,
        title: `Item ${rotulo}`,
        summary: 'Resumo.',
        category: 'bed',
        species: ['dog'],
        target_url: `https://${p.host}/${rotulo}`,
      });
      return { slug, etag: r.etag };
    };
    const rascunho = await mk('d');
    const publicado = await mk('p');
    const retirado = await mk('r');
    await loja.publicarItem(autor, publicado.slug, publicado.etag);
    const x = await loja.publicarItem(autor, retirado.slug, retirado.etag);
    await loja.retirarItem(autor, retirado.slug, x.etag);

    const estados = async (estado: 'draft' | 'published' | 'retired'): Promise<string[]> =>
      (
        await loja.listarItens({ partnerSlug: p.slug, publicationState: estado, sort: 'nome', page: 1, limit: 50 })
      ).items.map((i) => i.slug);
    assert.deepEqual(await estados('draft'), [rascunho.slug]);
    assert.deepEqual(await estados('published'), [publicado.slug]);
    assert.deepEqual(await estados('retired'), [retirado.slug]);

    const parceiro = await loja.lerParceiro(p.slug);
    assert.equal(parceiro.recurso.item_count, 3);
  });

  void it('ISCA: o detalhe publico responde o MESMO 404 para rascunho, retirado e inexistente', async () => {
    const p = await novoParceiro();
    const slug = `bo-d-${sufixo()}`;
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: 'Cama para gato',
      summary: 'Cama redonda.',
      category: 'bed',
      species: ['cat'],
      target_url: `https://${p.host}/cama`,
    });
    const rascunho = await detalhePublico(slug);
    const pub = await loja.publicarItem(autor, slug, criado.etag);
    assert.equal((await detalhePublico(slug)).status, 200);
    await loja.retirarItem(autor, slug, pub.etag);
    const retirado = await detalhePublico(slug);
    const inexistente = await detalhePublico(`bo-x-${sufixo()}`);
    for (const r of [rascunho, retirado, inexistente]) assert.equal(r.status, 404);
    assert.equal(rascunho.corpo['type'], inexistente.corpo['type']);
    assert.equal(retirado.corpo['title'], inexistente.corpo['title']);
  });

  void it('galeria contra o banco: reordenar com unicidade DIFERIDA, e so imagem pronta chega ao app', async () => {
    const p = await novoParceiro();
    const slug = `bo-g-${sufixo()}`;
    const a = await envioDeItem();
    const b = await envioDeItem();
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: `Racao ${slug}`,
      summary: 'Racao seca.',
      category: 'food',
      species: ['dog', 'cat'],
      target_url: `https://${p.host}/racao`,
      images: [
        { upload_id: a, alt_text: 'Saco de racao em pe' },
        { upload_id: b, alt_text: 'Tabela nutricional' },
      ],
    });
    const trabalhos = await banco.db
      .selectFrom('jobs')
      .select('payload')
      .where('kind', '=', 'media.process_catalog_image')
      .execute();
    assert.ok(trabalhos.length >= 2, 'a confirmacao nao enfileirou o processamento');

    // Reordenar troca as posicoes 0 e 1 na mesma transacao. Sem o DEFERRABLE,
    // o banco recusaria no meio (23505 em store_item_images_ordem_unica).
    const reordenado = await loja.alterarItem(autor, slug, criado.etag, {
      images: [
        { upload_id: b, alt_text: 'Tabela nutricional' },
        { upload_id: a, alt_text: 'Saco de racao em pe' },
      ],
    });
    assert.deepEqual(reordenado.recurso.images.map((i) => i.upload_id), [b, a]);
    await loja.publicarItem(autor, slug, reordenado.etag);

    // Nada pronto: a vitrine nao mostra imagem nenhuma.
    let [naLista] = await vitrinePublica(slug);
    assert.equal(naLista?.image_url, null, 'imagem em processamento chegou ao app');
    assert.deepEqual((await detalhePublico(slug)).corpo['images'], []);

    // So a de posicao 1 fica pronta: ela e a unica que aparece, e vira a principal.
    await marcarPronta(a, 'card/imagem-a.webp');
    [naLista] = await vitrinePublica(slug);
    assert.equal(naLista?.image_url, 'https://midia.exemplo.invalid/card/imagem-a.webp');
    assert.equal(naLista?.image_alt_text, 'Saco de racao em pe');
    assert.deepEqual(naLista?.species, ['dog', 'cat']);
    assert.deepEqual((await detalhePublico(slug)).corpo['images'], [
      { url: 'https://midia.exemplo.invalid/card/imagem-a.webp', alt_text: 'Saco de racao em pe' },
    ]);

    await marcarPronta(b, 'card/imagem-b.webp');
    const detalhe = await detalhePublico(slug);
    assert.deepEqual(
      (detalhe.corpo['images'] as { url: string }[]).map((i) => i.url),
      ['https://midia.exemplo.invalid/card/imagem-b.webp', 'https://midia.exemplo.invalid/card/imagem-a.webp'],
    );
  });

  void it('ISCA T9 contra o banco: envio de capa de encontro nao vira imagem de produto', async () => {
    const p = await novoParceiro();
    const capa = await loja.autorizarEnvioDeCatalogo(autor, {
      purpose: 'network_event',
      content_type: 'image/jpeg',
      byte_size: 1000,
    });
    const slug = `bo-t9-${sufixo()}`;
    const erro = await loja
      .criarItem(autor, {
        slug,
        partner_slug: p.slug,
        title: 'Item com capa errada',
        summary: 'Nao deve nascer.',
        category: 'toy',
        species: ['dog'],
        target_url: `https://${p.host}/x`,
        images: [{ upload_id: capa.uploadId, alt_text: 'Capa de encontro' }],
      })
      .catch((e: unknown) => e);
    assert.ok(erro instanceof AppError && erro.problemType === 'validation-failed', String(erro));
    const linha = await banco.db.selectFrom('store_items').select('id').where('slug', '=', slug).executeTakeFirst();
    assert.equal(linha, undefined);
    const imagens = await banco.db
      .selectFrom('catalog_images')
      .select('id')
      .where('upload_intent_id', '=', capa.uploadId)
      .execute();
    assert.equal(imagens.length, 0, 'a capa virou imagem de catalogo mesmo recusada');
  });

  void it('tags e especie filtram a vitrine publica; tag inativa some do item e do vocabulario', async () => {
    const p = await novoParceiro();
    const rotulo = `Tg ${sufixo()}`;
    const tag = await loja.criarTag(autor, { label: rotulo });
    const slug = `bo-tg-${sufixo()}`;
    const criado = await loja.criarItem(autor, {
      slug,
      partner_slug: p.slug,
      title: `Brinquedo ${slug}`,
      summary: 'Bola.',
      category: 'toy',
      species: ['cat'],
      tag_slugs: [tag.recurso.slug],
      target_url: `https://${p.host}/bola`,
    });

    const tagsAntes = await (await fetch(`${base}/v1/store/tags`)).json() as { items: { slug: string }[] };
    assert.equal(tagsAntes.items.some((t) => t.slug === tag.recurso.slug), false, 'tag sem item publicado apareceu');

    await loja.publicarItem(autor, slug, criado.etag);
    assert.deepEqual((await vitrinePublica(slug, `&tag=${tag.recurso.slug}`)).map((i) => i.slug), [slug]);
    assert.deepEqual((await vitrinePublica(slug, '&species=cat')).map((i) => i.slug), [slug]);
    assert.deepEqual(await vitrinePublica(slug, '&species=dog'), []);
    const tagsDepois = await (await fetch(`${base}/v1/store/tags`)).json() as { items: { slug: string }[] };
    assert.equal(tagsDepois.items.some((t) => t.slug === tag.recurso.slug), true);

    await loja.alterarTag(autor, tag.recurso.slug, tag.etag, { active: false });
    const [item] = await vitrinePublica(slug);
    assert.deepEqual(item?.tags, [], 'tag inativa continuou no app');
    assert.deepEqual(await vitrinePublica(slug, `&tag=${tag.recurso.slug}`), [], 'tag inativa continuou filtrando');
    const painel = await loja.lerItem(slug);
    assert.equal(painel.recurso.tags[0]?.active, false, 'o painel precisa ver a tag inativa ligada');
  });
});
