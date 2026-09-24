/**
 * Os casos de uso da escrita administrativa da `Loja`, sem banco e sem servidor.
 *
 * O dublê aqui e um repositorio em memoria que imita as duas coisas que o banco
 * garante e que o caso de uso depende: a versao lida no `WHERE` (zero linhas
 * quando mudou) e o `ROLLBACK` quando algo lanca dentro da transacao. A prova
 * contra Postgres de verdade, pela rota, e de
 * `tests/integration/escrita-administrativa-da-loja.test.ts`.
 *
 * ## As iscas deste arquivo
 *
 * - **toda escrita grava a trilha**: cada operacao que muda estado deixa
 *   exatamente uma linha, com a acao do contrato, o `id` INTERNO e a sessao;
 * - **a falha da trilha desfaz a escrita**: com a trilha lancando, nada fica;
 * - **publicar e retirar sao idempotentes sem trilha nova**;
 * - **rascunho nao se retira** (`not_published`);
 * - **sem `If-Match`, 428 antes de ler o recurso; versao velha, 412 sem gravar**;
 * - **o item nasce rascunho**.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { EnvioPreparado, NovaIntencaoDeCatalogo } from '../../media/ports/imagem-de-catalogo.js';
import type { ItemAdministrativo, ParceiroAdministrativo } from '../domain/escrita-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type NovoItem,
  type NovoParceiro,
  type TransacaoDoCatalogo,
} from '../ports/catalogo-administrativo.js';
import { CatalogoAdministrativo, type Autor } from './catalogo-administrativo.js';

const AGORA = Date.UTC(2026, 8, 23, 15, 0, 0) as Instant;
const AUTOR: Autor = {
  userId: '0192a3b4-0000-7000-8000-00000000a0a0' as UserId,
  sessao: 'a1b2c3d4e5f60718',
  ip: '203.0.113.9',
  correlationId: 'corr-1',
};

interface Estado {
  parceiros: Map<string, ParceiroAdministrativo>;
  itens: Map<string, ItemAdministrativo>;
  intencoes: NovaIntencaoDeCatalogo[];
  trilha: AuditEvent[];
}

function clonar(e: Estado): Estado {
  return {
    parceiros: new Map(e.parceiros),
    itens: new Map(e.itens),
    intencoes: [...e.intencoes],
    trilha: [...e.trilha],
  };
}

let contador = 0;
function novoId(): string {
  contador += 1;
  return `0192a3b4-0000-7000-8000-${String(contador).padStart(12, '0')}`;
}

/** Repositorio em memoria com `ROLLBACK` e versao no `WHERE`. */
function repositorioEmMemoria(opcoes: { trilhaFalha?: () => boolean } = {}) {
  let estado: Estado = { parceiros: new Map(), itens: new Map(), intencoes: [], trilha: [] };

  const porSlug = <T extends { slug: string }>(m: Map<string, T>, slug: string): T | null =>
    [...m.values()].find((v) => v.slug === slug) ?? null;

  const repo: CatalogoAdministrativoRepository = {
    async emTransacao(trabalho) {
      const rascunho = clonar(estado);
      const tx: TransacaoDoCatalogo = {
        parceiroPorSlug: (slug) => Promise.resolve(porSlug(rascunho.parceiros, slug)),
        async inserirParceiro(novo: NovoParceiro) {
          await Promise.resolve();
          if (porSlug(rascunho.parceiros, novo.slug) !== null) throw new SlugOcupado('store_partner');
          const p: ParceiroAdministrativo = {
            id: novo.id,
            slug: novo.slug,
            name: novo.name,
            host: novo.host,
            active: true,
            sortOrder: novo.sortOrder,
            itemCount: 0,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          };
          rascunho.parceiros.set(p.id, p);
          return p;
        },
        async atualizarParceiro(id, versao, m: MudancaDeParceiro, agora) {
          await Promise.resolve();
          const atual = rascunho.parceiros.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          if (m.slug !== undefined && m.slug !== atual.slug && porSlug(rascunho.parceiros, m.slug) !== null) {
            throw new SlugOcupado('store_partner');
          }
          const novo: ParceiroAdministrativo = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.name === undefined ? {} : { name: m.name }),
            ...(m.host === undefined ? {} : { host: m.host }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          rascunho.parceiros.set(id, novo);
          return novo;
        },
        destinosDosItensDoParceiro: async (partnerId) => {
          await Promise.resolve();
          const parceiro = rascunho.parceiros.get(partnerId);
          return [...rascunho.itens.values()]
            .filter((i) => i.partner.slug === parceiro?.slug)
            .map((i) => i.targetUrl);
        },
        itemPorSlug: (slug) => Promise.resolve(porSlug(rascunho.itens, slug)),
        async inserirItem(novo: NovoItem) {
          await Promise.resolve();
          if (porSlug(rascunho.itens, novo.slug) !== null) throw new SlugOcupado('store_item');
          const parceiro = rascunho.parceiros.get(novo.partnerId);
          assert.ok(parceiro);
          const i: ItemAdministrativo = {
            id: novo.id,
            slug: novo.slug,
            partner: { slug: parceiro.slug, name: parceiro.name, host: parceiro.host },
            title: novo.title,
            summary: novo.summary,
            category: novo.category,
            targetUrl: novo.targetUrl,
            imageUrl: null,
            priceAmount: novo.preco?.amount ?? null,
            priceCurrency: novo.preco?.currency ?? null,
            priceCheckedAt: novo.preco?.checkedAt ?? null,
            active: false,
            publishedAt: null,
            sortOrder: novo.sortOrder,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          };
          rascunho.itens.set(i.id, i);
          return i;
        },
        async atualizarItem(id, versao, m: MudancaDeItem, agora) {
          await Promise.resolve();
          const atual = rascunho.itens.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          const parceiro = m.partnerId === undefined ? undefined : rascunho.parceiros.get(m.partnerId);
          const novo: ItemAdministrativo = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(parceiro === undefined
              ? {}
              : { partner: { slug: parceiro.slug, name: parceiro.name, host: parceiro.host } }),
            ...(m.title === undefined ? {} : { title: m.title }),
            ...(m.summary === undefined ? {} : { summary: m.summary }),
            ...(m.category === undefined ? {} : { category: m.category }),
            ...(m.targetUrl === undefined ? {} : { targetUrl: m.targetUrl }),
            ...(m.preco === undefined
              ? {}
              : m.preco === null
                ? { priceAmount: null, priceCurrency: null, priceCheckedAt: null }
                : {
                    priceAmount: m.preco.amount,
                    priceCurrency: m.preco.currency,
                    priceCheckedAt: m.preco.checkedAt,
                  }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            ...(m.publishedAt === undefined || atual.publishedAt !== null
              ? {}
              : { publishedAt: comoData(m.publishedAt) }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          rascunho.itens.set(id, novo);
          return novo;
        },
        registrarIntencaoDeCatalogo: async (nova) => {
          await Promise.resolve();
          rascunho.intencoes.push(nova);
        },
        registrarNaTrilha: async (evento) => {
          await Promise.resolve();
          if (opcoes.trilhaFalha?.() === true) throw new Error('trilha fora do ar');
          rascunho.trilha.push(evento);
        },
      };
      // O ROLLBACK: o rascunho so vira estado se o trabalho inteiro terminar.
      const resultado = await trabalho(tx);
      estado = rascunho;
      return resultado;
    },
    listarParceiros: () =>
      Promise.resolve({ itens: [...estado.parceiros.values()], total: estado.parceiros.size }),
    parceiroPorSlug: (slug) => Promise.resolve(porSlug(estado.parceiros, slug)),
    listarItens: () => Promise.resolve({ itens: [...estado.itens.values()], total: estado.itens.size }),
    itemPorSlug: (slug) => Promise.resolve(porSlug(estado.itens, slug)),
  };
  return { repo, estado: () => estado };
}

function preparadorFalso(): { preparar: (t: string, b: number) => Promise<EnvioPreparado> } {
  return {
    preparar: (contentType) =>
      Promise.resolve({
      uploadId: novoId(),
      chave: 'catalog/original/KioqKioqKioqKioqKioqKg' as EnvioPreparado['chave'],
      contentType,
      maxBytes: 10 * 1024 * 1024,
      autorizacao: {
        metodo: 'POST',
        url: 'https://upload.exemplo.invalid/' as EnvioPreparado['autorizacao']['url'],
        campos: { key: 'catalog/original/x' },
        expiraEm: comoData((AGORA + 600_000) as Instant),
        maxBytes: 10 * 1024 * 1024,
      },
      }),
  };
}

function montar(opcoes: { trilhaFalha?: () => boolean } = {}) {
  const { repo, estado } = repositorioEmMemoria(opcoes);
  const catalogo = new CatalogoAdministrativo({
    repositorio: repo,
    envios: preparadorFalso(),
    ids: {
      uuidv7: novoId,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
      opaqueToken: () => {
        throw new Error('a escrita da Loja nao emite token');
      },
    },
    clock: { now: () => AGORA },
  });
  return { catalogo, estado };
}

function tipo(erro: unknown): string {
  assert.ok(erro instanceof AppError, `esperava AppError, veio ${String(erro)}`);
  return erro.problemType;
}

function codigos(erro: unknown): string[] {
  assert.ok(erro instanceof AppError);
  return (erro.errors ?? []).map((e) => e.code);
}

const PARCEIRO = { slug: 'loja-do-bairro', name: 'Loja do Bairro', host: 'lojadobairro.com.br' };
const ITEM = {
  slug: 'racao-adulto-10kg',
  partner_slug: 'loja-do-bairro',
  title: 'Racao para cao adulto, 10 kg',
  summary: 'Racao seca para caes adultos de porte medio.',
  category: 'food' as const,
  target_url: 'https://lojadobairro.com.br/racao-adulto-10kg',
  price: { amount: 18990, currency: 'BRL' as const, checked_at: '2026-09-22' },
};

void describe('escrita administrativa da Loja', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  void describe('ISCA: toda escrita grava UMA linha de trilha, com o id interno e a sessao', () => {
    void it('as sete escritas, uma linha cada, na ordem', async () => {
      const p = await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.alterarParceiro(AUTOR, PARCEIRO.slug, p.etag, { name: 'Loja do Bairro SA' });
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      const i2 = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, { title: 'Racao 10 kg' });
      const i3 = await m.catalogo.publicarItem(AUTOR, ITEM.slug, i2.etag);
      await m.catalogo.retirarItem(AUTOR, ITEM.slug, i3.etag);
      await m.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
        purpose: 'store_item',
        content_type: 'image/webp',
        byte_size: 1000,
      });

      const trilha = m.estado().trilha;
      assert.deepEqual(
        trilha.map((e) => e.action),
        [
          'admin.store_partner.created',
          'admin.store_partner.updated',
          'admin.store_item.created',
          'admin.store_item.updated',
          'admin.store_item.published',
          'admin.store_item.retired',
          'admin.catalog_image.intent_created',
        ],
      );
      const idDoItem = [...m.estado().itens.values()][0]?.id;
      for (const evento of trilha) {
        assert.equal(evento.actorKind, 'user');
        assert.equal(evento.actorUserId, AUTOR.userId);
        assert.deepEqual(evento.metadata, { surface: 'admin', session: AUTOR.sessao });
        assert.match(evento.resourceId ?? '', /^[0-9a-f-]{36}$/, 'resource_id e o id interno, nunca o slug');
      }
      assert.equal(trilha[2]?.resourceId, idDoItem);
      assert.deepEqual(trilha[3]?.before, { title: ITEM.title });
      assert.deepEqual(trilha[3]?.after, { title: 'Racao 10 kg' });
    });
  });

  void it('ISCA: a falha da trilha desfaz a escrita', async () => {
    const falhando = montar({ trilhaFalha: () => true });
    await assert.rejects(() => falhando.catalogo.criarParceiro(AUTOR, PARCEIRO), /trilha fora do ar/);
    assert.equal(falhando.estado().parceiros.size, 0, 'o parceiro ficou sem linha de trilha');
  });

  void it('o item nasce em rascunho', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    assert.equal(i.recurso.publication_state, 'draft');
    assert.equal(i.recurso.published_at, null);
    assert.equal(i.etag, '"1"');
  });

  void it('publicar grava a primeira publicacao e nao a reescreve ao republicar', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    const pub = await m.catalogo.publicarItem(AUTOR, ITEM.slug, i.etag);
    const primeira = pub.recurso.published_at;
    assert.equal(pub.recurso.publication_state, 'published');
    const ret = await m.catalogo.retirarItem(AUTOR, ITEM.slug, pub.etag);
    const repub = await m.catalogo.publicarItem(AUTOR, ITEM.slug, ret.etag);
    assert.equal(repub.recurso.published_at, primeira);
  });

  void it('ISCA: publicar o ja publicado responde sem nova trilha e sem mudar a versao', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    const pub = await m.catalogo.publicarItem(AUTOR, ITEM.slug, i.etag);
    const linhas = m.estado().trilha.length;
    const outra = await m.catalogo.publicarItem(AUTOR, ITEM.slug, pub.etag);
    assert.equal(outra.etag, pub.etag);
    assert.equal(m.estado().trilha.length, linhas);
  });

  void it('ISCA: rascunho nao se retira (not_published), e nada e gravado', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    const linhas = m.estado().trilha.length;
    const erro = await m.catalogo.retirarItem(AUTOR, ITEM.slug, i.etag).catch((e: unknown) => e);
    assert.equal(tipo(erro), 'validation-failed');
    assert.deepEqual(codigos(erro), ['not_published']);
    assert.equal(m.estado().trilha.length, linhas);
  });

  void it('retirar o ja retirado responde sem nova trilha', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    const pub = await m.catalogo.publicarItem(AUTOR, ITEM.slug, i.etag);
    const ret = await m.catalogo.retirarItem(AUTOR, ITEM.slug, pub.etag);
    const linhas = m.estado().trilha.length;
    const outra = await m.catalogo.retirarItem(AUTOR, ITEM.slug, ret.etag);
    assert.equal(outra.recurso.publication_state, 'retired');
    assert.equal(m.estado().trilha.length, linhas);
  });

  void describe('If-Match', () => {
    void it('ISCA: ausente e 428, antes de saber se o recurso existe', async () => {
      const erro = await m.catalogo.alterarItem(AUTOR, 'nao-existe', undefined, { title: 'xx' }).catch((e: unknown) => e);
      assert.equal(tipo(erro), 'precondition-required');
    });

    void it('ISCA: versao velha e 412, e nada e gravado', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, { title: 'Primeira edicao' });
      const linhas = m.estado().trilha.length;
      const erro = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, i.etag, { title: 'Segunda edicao' })
        .catch((e: unknown) => e);
      assert.equal(tipo(erro), 'precondition-failed');
      assert.equal([...m.estado().itens.values()][0]?.title, 'Primeira edicao');
      assert.equal(m.estado().trilha.length, linhas);
    });

    void it('forma que nao e versao (`*`) e 412', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const erro = await m.catalogo
        .alterarParceiro(AUTOR, PARCEIRO.slug, '*', { name: 'Outro nome' })
        .catch((e: unknown) => e);
      assert.equal(tipo(erro), 'precondition-failed');
    });
  });

  void describe('destino e host', () => {
    void it('destino fora do host do parceiro: host_mismatch, e nada e gravado', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const erro = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, target_url: 'https://outraloja.com.br/x' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['host_mismatch']);
      assert.equal(m.estado().itens.size, 0);
    });

    void it('trocar o parceiro sem trocar o link reconfere o link contra o parceiro novo', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarParceiro(AUTOR, { slug: 'outra-loja', name: 'Outra', host: 'outraloja.com.br' });
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      const erro = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, i.etag, { partner_slug: 'outra-loja' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['host_mismatch']);
    });

    void it('trocar o host do parceiro com item que deixaria de casar: host_mismatch_items', async () => {
      const p = await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarItem(AUTOR, ITEM);
      const erro = await m.catalogo
        .alterarParceiro(AUTOR, PARCEIRO.slug, p.etag, { host: 'outraloja.com.br' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['host_mismatch_items']);
    });

    void it('parceiro inexistente no corpo do item: 400, e nao 404', async () => {
      const erro = await m.catalogo.criarItem(AUTOR, ITEM).catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['unknown_partner']);
    });
  });

  void describe('preco', () => {
    void it('data de consulta futura: 400 future_date', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const erro = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, price: { ...ITEM.price, checked_at: '2026-09-24' } })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['future_date']);
    });

    void it('price: null tira o preco', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      const sem = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, { price: null });
      assert.equal(sem.recurso.price, null);
      assert.equal(sem.recurso.price_status, 'sem_preco');
    });
  });

  void describe('slug', () => {
    void it('slug ocupado: 409 slug-taken', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const erro = await m.catalogo.criarParceiro(AUTOR, PARCEIRO).catch((e: unknown) => e);
      assert.equal(tipo(erro), 'slug-taken');
    });
  });

  void it('recurso inexistente: 404', async () => {
    const erro = await m.catalogo.lerItem('nao-existe').catch((e: unknown) => e);
    assert.equal(tipo(erro), 'not-found');
  });

  void it('image_upload_id e recusado ate a emenda de imagens (nao aceita e ignora)', async () => {
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
    const erro = await m.catalogo
      .criarItem(AUTOR, { ...ITEM, image_upload_id: '0192a3b4-0000-7000-8000-000000000999' })
      .catch((e: unknown) => e);
    assert.deepEqual(codigos(erro), ['not_available']);
    assert.equal(m.estado().itens.size, 0);
  });

  void it('intencao de envio: grava purpose e trilha; SVG e recusado pelo preparador', async () => {
    const r = await m.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
      purpose: 'network_event',
      content_type: 'image/png',
      byte_size: 5000,
    });
    assert.equal(m.estado().intencoes[0]?.purpose, 'network_event');
    assert.equal(m.estado().intencoes[0]?.id, r.uploadId);
    assert.equal(m.estado().trilha[0]?.resourceKind, 'upload_intent');
  });
});
