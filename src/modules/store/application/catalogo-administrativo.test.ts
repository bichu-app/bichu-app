/** Os casos de uso da escrita administrativa da `Loja`, sem banco e sem servidor. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import {
  novoId,
  preparadorFalso,
  repositorioEmMemoria,
  type EnvioSemeado,
} from '../adapters/persistence/catalogo-em-memoria-de-teste.js';
import { comoData } from '../../../shared/time/clock.js';

import { CatalogoAdministrativo, type Autor } from './catalogo-administrativo.js';

const AGORA = Date.UTC(2026, 8, 23, 15, 0, 0) as Instant;
const AUTOR: Autor = {
  adminAccountId: '0192a3b4-0000-7000-8000-00000000a0a0' as AdminAccountId,
  sessao: 'a1b2c3d4e5f60718',
  ip: '203.0.113.9',
  correlationId: 'corr-1',
};

function montar(opcoes: { trilhaFalha?: () => boolean; envios?: readonly EnvioSemeado[] } = {}) {
  const { repo, estado } = repositorioEmMemoria(opcoes);
  const catalogo = new CatalogoAdministrativo({
    repositorio: repo,
    envios: preparadorFalso(AGORA),
    ids: {
      uuidv7: novoId,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
      opaqueToken: () => {
        throw new Error('a escrita da Loja nao emite token');
      },
    },
    clock: { now: () => AGORA },
    urlDeMidia: (chave) => `https://midia.bichu.test/${chave}`,
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

const PARCEIRO = { slug: 'loja-do-bairro', name: 'Loja do Bairro', site_url: 'https://lojadobairro.test' };
const ITEM = {
  slug: 'racao-adulto-10kg',
  partner_slug: 'loja-do-bairro',
  title: 'Racao para cao adulto, 10 kg',
  summary: 'Racao seca para caes adultos de porte medio.',
  category: 'food' as const,
  species: ['dog' as const],
  target_url: 'https://lojadobairro.test/racao-adulto-10kg',
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
        assert.equal(evento.actorKind, 'admin');
        assert.equal(evento.actorAdminId, AUTOR.adminAccountId);
        assert.equal(evento.actorUserId, undefined, 'a trilha do painel nunca poe o id do admin em actor_user_id');
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
        .criarItem(AUTOR, { ...ITEM, target_url: 'https://outraloja.test/x' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['host_mismatch']);
      assert.equal(m.estado().itens.size, 0);
    });

    void it('trocar o parceiro sem trocar o link reconfere o link contra o parceiro novo', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarParceiro(AUTOR, { slug: 'outra-loja', name: 'Outra', site_url: 'https://outraloja.test' });
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      const erro = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, i.etag, { partner_slug: 'outra-loja' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['host_mismatch']);
    });

    void it('trocar o host do parceiro leva os itens junto: o item guarda so o caminho', async () => {
      const p = await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarItem(AUTOR, ITEM);
      await m.catalogo.alterarParceiro(AUTOR, PARCEIRO.slug, p.etag, { site_url: 'https://outraloja.test' });
      const lido = await m.catalogo.lerItem(ITEM.slug);
      assert.equal(lido.recurso.target_url, 'https://outraloja.test/racao-adulto-10kg');
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

  void describe('dimensao declarada no pedido de envio (01/10)', () => {
    void it('ISCA: encontro abaixo de 600 x 600 e 422 image-too-small, com os dois campos, sem intencao nem trilha', async () => {
      const erro = await m.catalogo
        .autorizarEnvioDeCatalogo(AUTOR, {
          purpose: 'network_event',
          content_type: 'image/jpeg',
          byte_size: 5000,
          width: 599,
          height: 300,
        })
        .catch((e: unknown) => e);
      assert.equal(tipo(erro), 'image-too-small');
      assert.ok(erro instanceof AppError);
      assert.equal(erro.status, 422);
      assert.deepEqual(
        (erro.errors ?? []).map((e) => e.field),
        ['width', 'height'],
      );
      assert.deepEqual(codigos(erro), ['minimum', 'minimum']);
      assert.equal(m.estado().intencoes.length, 0);
      assert.equal(m.estado().trilha.length, 0);
    });

    void it('ISCA: o minimo e por proposito -- 700 x 700 serve ao encontro e nao ao produto (800 x 800)', async () => {
      const encontro = await m.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
        purpose: 'network_event',
        content_type: 'image/jpeg',
        byte_size: 5000,
        width: 700,
        height: 700,
      });
      assert.equal(typeof encontro.uploadId, 'string');
      const produto = await m.catalogo
        .autorizarEnvioDeCatalogo(AUTOR, {
          purpose: 'store_item',
          content_type: 'image/jpeg',
          byte_size: 5000,
          width: 700,
          height: 700,
        })
        .catch((e: unknown) => e);
      assert.equal(tipo(produto), 'image-too-small');
    });

    void it('sem dimensao declarada o pedido passa: quem decide e o worker, nos bytes', async () => {
      await m.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
        purpose: 'network_event',
        content_type: 'image/png',
        byte_size: 5000,
      });
      assert.equal(m.estado().intencoes.length, 1);
    });

    void it('a trilha grava a dimensao declarada quando ela vem', async () => {
      await m.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
        purpose: 'network_event',
        content_type: 'image/png',
        byte_size: 5000,
        width: 1200,
        height: 900,
      });
      assert.match(JSON.stringify(m.estado().trilha[0]), /"width":1200,"height":900/);
    });
  });

  void describe('especie, tags e galeria (ADR-0027 item 16)', () => {
    const FOTO_DE_PET = '0192a3b4-0000-7000-8000-00000000f0f0';
    const CAPA_DE_ENCONTRO = '0192a3b4-0000-7000-8000-00000000c0c0';
    const VENCIDO = '0192a3b4-0000-7000-8000-00000000d0d0';

    function comEnvios() {
      return montar({
        envios: [
          { id: FOTO_DE_PET, kind: 'pet_photo', purpose: null, expiresAt: comoData((AGORA + 60_000) as Instant) },
          { id: CAPA_DE_ENCONTRO, kind: 'catalog_image', purpose: 'network_event', expiresAt: comoData((AGORA + 60_000) as Instant) },
          { id: VENCIDO, kind: 'catalog_image', purpose: 'store_item', expiresAt: comoData((AGORA - 1) as Instant) },
        ],
      });
    }

    async function envio(c: ReturnType<typeof montar>): Promise<string> {
      const r = await c.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
        purpose: 'store_item',
        content_type: 'image/webp',
        byte_size: 1000,
      });
      return r.uploadId;
    }

    void it('especie vazia, repetida ou desconhecida: 400 species_invalid', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      for (const species of [[], ['dog', 'dog'], ['peixe']]) {
        const erro = await m.catalogo
          .criarItem(AUTOR, { ...ITEM, species: species as never })
          .catch((e: unknown) => e);
        assert.deepEqual(codigos(erro), ['species_invalid'], JSON.stringify(species));
      }
    });

    void it('ISCA: publicar item sem especie (o da massa) e 400 species_required', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const i = await m.catalogo.criarItem(AUTOR, ITEM);
      const [id] = [...m.estado().especies.keys()];
      m.estado().especies.set(id ?? '', []);
      const erro = await m.catalogo.publicarItem(AUTOR, ITEM.slug, i.etag).catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['species_required']);
    });

    void it('tag: nasce uma vez, pelo slug; a segunda grafia e 409', async () => {
      const t = await m.catalogo.criarTag(AUTOR, { label: 'Ração' });
      assert.equal(t.recurso.slug, 'racao');
      const erro = await m.catalogo.criarTag(AUTOR, { label: 'racao' }).catch((e: unknown) => e);
      assert.equal(tipo(erro), 'slug-taken');
      assert.deepEqual(
        m.estado().trilha.map((e) => e.action),
        ['admin.store_tag.created'],
      );
    });

    void it('ISCA: a 41a tag ativa e recusada (tag_vocabulary_full); reativar acima do teto tambem', async () => {
      for (let n = 0; n < 40; n += 1) await m.catalogo.criarTag(AUTOR, { label: `Tag numero ${String(n)}` });
      const erro = await m.catalogo.criarTag(AUTOR, { label: 'Mais uma' }).catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['tag_vocabulary_full']);

      const desativada = await m.catalogo.alterarTag(AUTOR, 'tag-numero-0', '"1"', { active: false });
      await m.catalogo.criarTag(AUTOR, { label: 'Mais uma' });
      const reativar = await m.catalogo
        .alterarTag(AUTOR, 'tag-numero-0', desativada.etag, { active: true })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(reativar), ['tag_vocabulary_full']);
    });

    void it('item referencia tag existente (ativa ou nao); tag desconhecida e 400; mais de 5 e 400', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarTag(AUTOR, { label: 'Porte medio' });
      const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, tag_slugs: ['porte-medio'] });
      assert.deepEqual(i.recurso.tags, [{ slug: 'porte-medio', label: 'Porte medio', active: true }]);

      const desconhecida = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, i.etag, { tag_slugs: ['nao-existe'] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(desconhecida), ['unknown_tag']);
      const demais = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, i.etag, { tag_slugs: ['a1a', 'b2b', 'c3c', 'd4d', 'e5e', 'f6f'] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(demais), ['too_many_tags']);
    });

    void it('galeria: o envio vira imagem em processamento, com trabalho enfileirado, e a ordem e a do corpo', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const a = await envio(m);
      const b = await envio(m);
      const i = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [
          { upload_id: a, alt_text: 'Saco de racao em pe' },
          { upload_id: b, alt_text: 'Tabela nutricional' },
        ],
      });
      assert.deepEqual(
        i.recurso.images.map((x) => [x.upload_id, x.position, x.alt_text, x.status, x.url]),
        [
          [a, 0, 'Saco de racao em pe', 'processing', null],
          [b, 1, 'Tabela nutricional', 'processing', null],
        ],
      );
      assert.equal(m.estado().trabalhos.length, 2);

      const reordenado = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, {
        images: [
          { upload_id: b, alt_text: 'Tabela nutricional' },
          { upload_id: a, alt_text: 'Saco de racao em pe' },
        ],
      });
      assert.deepEqual(reordenado.recurso.images.map((x) => x.upload_id), [b, a]);
      assert.equal(m.estado().trabalhos.length, 2);

      const vazia = await m.catalogo.alterarItem(AUTOR, ITEM.slug, reordenado.etag, { images: [] });
      assert.deepEqual(vazia.recurso.images, []);
      const ultima = m.estado().trilha.at(-1);
      assert.deepEqual(ultima?.after, { images: [] });
    });

    void it('ISCA T9: foto de pet, capa de encontro e envio vencido sao recusados (upload_not_usable), e nada e gravado', async () => {
      const c = comEnvios();
      await c.catalogo.criarParceiro(AUTOR, PARCEIRO);
      for (const upload of [FOTO_DE_PET, CAPA_DE_ENCONTRO, VENCIDO, '0192a3b4-0000-7000-8000-0000000000ff']) {
        const erro = await c.catalogo
          .criarItem(AUTOR, { ...ITEM, images: [{ upload_id: upload, alt_text: 'Qualquer coisa' }] })
          .catch((e: unknown) => e);
        assert.deepEqual(codigos(erro), ['upload_not_usable'], upload);
      }
      assert.equal(c.estado().itens.size, 0);
      assert.equal(c.estado().trabalhos.length, 0);
    });

    void it('ISCA: a imagem de um item nao pode ser anexada a outro', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const a = await envio(m);
      await m.catalogo.criarItem(AUTOR, { ...ITEM, images: [{ upload_id: a, alt_text: 'Saco de racao' }] });
      const erro = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, slug: 'outro-item', images: [{ upload_id: a, alt_text: 'Saco de racao' }] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['upload_not_usable']);
    });

    void it('upload repetido, texto alternativo curto e mais de 8 imagens: 400 antes de abrir transacao', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const a = await envio(m);
      const repetido = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, images: [{ upload_id: a, alt_text: 'U' }, { upload_id: a, alt_text: 'Dois ok' }] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(repetido).sort(), ['duplicate_upload', 'length']);
      const nove = Array.from({ length: 9 }, (_, n) => ({ upload_id: `0192a3b4-0000-7000-8000-00000000090${String(n)}`, alt_text: 'Imagem' }));
      const demais = await m.catalogo.criarItem(AUTOR, { ...ITEM, images: nove }).catch((e: unknown) => e);
      assert.deepEqual(codigos(demais), ['too_many_images']);
    });

    void it('a trilha do item grava especie, tags e galeria na forma que o painel mandou', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      await m.catalogo.criarTag(AUTOR, { label: 'Porte medio' });
      const a = await envio(m);
      await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        species: ['cat', 'dog'],
        tag_slugs: ['porte-medio'],
        images: [{ upload_id: a, alt_text: 'Saco de racao' }],
      });
      const criado = m.estado().trilha.find((e) => e.action === 'admin.store_item.created');
      assert.deepEqual(criado?.after?.['species'], ['dog', 'cat']);
      assert.deepEqual(criado?.after?.['tag_slugs'], ['porte-medio']);
      assert.deepEqual(criado?.after?.['images'], [{ upload_id: a, alt_text: 'Saco de racao' }]);
    });
  });

  void describe('emenda de 23/09: tag desativada e slug derivado', () => {
    void it('ISCA: ligar DE NOVO uma tag desativada e 400 inactive_tag; manter a ja ligada e permitido', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const t = await m.catalogo.criarTag(AUTOR, { label: 'Porte medio' });
      const outra = await m.catalogo.criarTag(AUTOR, { label: 'Filhote' });
      const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, tag_slugs: ['porte-medio'] });
      await m.catalogo.alterarTag(AUTOR, 'porte-medio', t.etag, { active: false });
      await m.catalogo.alterarTag(AUTOR, 'filhote', outra.etag, { active: false });

      const mantida = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, {
        tag_slugs: ['porte-medio'],
        title: 'Racao 10 kg',
      });
      assert.deepEqual(mantida.recurso.tags, [{ slug: 'porte-medio', label: 'Porte medio', active: false }]);

      const religada = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, mantida.etag, { tag_slugs: ['porte-medio', 'filhote'] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(religada), ['inactive_tag']);
      const nova = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, slug: 'outro-item', tag_slugs: ['porte-medio'] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(nova), ['inactive_tag']);
    });

    void it('o teto de 5 conta as desativadas: seis slugs, mesmo com uma desativada, e 400', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const erro = await m.catalogo
        .criarItem(AUTOR, { ...ITEM, tag_slugs: ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['too_many_tags']);
    });

    void it('sem slug, ele vem do titulo; o segundo item com o mesmo titulo ganha sufixo', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const semSlug = {
        partner_slug: ITEM.partner_slug,
        summary: ITEM.summary,
        category: ITEM.category,
        species: ITEM.species,
        target_url: ITEM.target_url,
      };
      const a = await m.catalogo.criarItem(AUTOR, { ...semSlug, title: 'Ração úmida sachê' });
      const b = await m.catalogo.criarItem(AUTOR, { ...semSlug, title: 'Ração úmida sachê' });
      assert.equal(a.recurso.slug, 'racao-umida-sache');
      assert.match(b.recurso.slug, /^racao-umida-sache-[0-9a-z]{4}$/);
      const curto = await m.catalogo.criarItem(AUTOR, { ...semSlug, title: 'Pé' });
      assert.match(curto.recurso.slug, /^pe-[0-9a-z]{4}$/);
    });
  });

  void describe('capa e ordem da galeria', () => {
    async function tresEnvios(c: ReturnType<typeof montar>): Promise<[string, string, string]> {
      const ids: string[] = [];
      for (let n = 0; n < 3; n += 1) {
        const r = await c.catalogo.autorizarEnvioDeCatalogo(AUTOR, {
          purpose: 'store_item',
          content_type: 'image/webp',
          byte_size: 1000,
        });
        ids.push(r.uploadId);
      }
      return [ids[0] ?? '', ids[1] ?? '', ids[2] ?? ''];
    }

    void it('a ordem da lista E a ordem das imagens: position vem do indice, e a capa e a posicao 0', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const [a, b, c] = await tresEnvios(m);
      const criado = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [
          { upload_id: a, alt_text: 'Saco de racao de frente' },
          { upload_id: b, alt_text: 'Tabela nutricional' },
          { upload_id: c, alt_text: 'Detalhe do grao' },
        ],
      });
      assert.deepEqual(
        criado.recurso.images.map((i) => [i.position, i.alt_text]),
        [
          [0, 'Saco de racao de frente'],
          [1, 'Tabela nutricional'],
          [2, 'Detalhe do grao'],
        ],
      );
    });

    void it('ESCOLHER A CAPA E REORDENAR: a terceira em primeiro lugar vira position 0, sem coluna de capa', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const [a, b, c] = await tresEnvios(m);
      const criado = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [
          { upload_id: a, alt_text: 'Primeira' },
          { upload_id: b, alt_text: 'Segunda' },
          { upload_id: c, alt_text: 'Terceira' },
        ],
      });
      const depois = await m.catalogo.alterarItem(AUTOR, ITEM.slug, criado.etag, {
        images: [
          { upload_id: c, alt_text: 'Terceira' },
          { upload_id: a, alt_text: 'Primeira' },
          { upload_id: b, alt_text: 'Segunda' },
        ],
      });
      assert.deepEqual(
        depois.recurso.images.map((i) => [i.position, i.alt_text]),
        [
          [0, 'Terceira'],
          [1, 'Primeira'],
          [2, 'Segunda'],
        ],
      );
      assert.equal(depois.recurso.images[0]?.upload_id, c, 'a capa e a imagem que o painel pos em primeiro lugar');
    });

    void it('REMOVER A CAPA: a seguinte assume a posicao 0, e a ordem nao fica com buraco', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const [a, b, c] = await tresEnvios(m);
      const criado = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [
          { upload_id: a, alt_text: 'Capa' },
          { upload_id: b, alt_text: 'Segunda' },
          { upload_id: c, alt_text: 'Terceira' },
        ],
      });
      const depois = await m.catalogo.alterarItem(AUTOR, ITEM.slug, criado.etag, {
        images: [
          { upload_id: b, alt_text: 'Segunda' },
          { upload_id: c, alt_text: 'Terceira' },
        ],
      });
      assert.deepEqual(
        depois.recurso.images.map((i) => i.position),
        [0, 1],
        'as posicoes sao recontadas do zero: nenhum buraco onde a capa estava',
      );
      assert.equal(depois.recurso.images[0]?.upload_id, b, 'o produto NAO fica sem capa: a seguinte assume');
    });

    void it('REORDENAR com If-Match que a borda sufixou ("2-gzip") e aceito; a versao velha continua 412', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const [a, b] = await tresEnvios(m);
      const criado = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [
          { upload_id: a, alt_text: 'Primeira' },
          { upload_id: b, alt_text: 'Segunda' },
        ],
      });
      assert.equal(criado.etag, '"1"');
      const trocado = [
        { upload_id: b, alt_text: 'Segunda' },
        { upload_id: a, alt_text: 'Primeira' },
      ];
      const comSufixo = await m.catalogo.alterarItem(AUTOR, ITEM.slug, 'W/"1-zstd"', { images: trocado });
      assert.equal(trocado[0]?.upload_id, comSufixo.recurso.images[0]?.upload_id);
      assert.equal(comSufixo.etag, '"2"');

      const erro = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, '"1-gzip"', { images: trocado })
        .catch((e: unknown) => e);
      assert.equal(tipo(erro), 'precondition-failed');
    });

    void it('TEXTO ALTERNATIVO OPCIONAL: sem alt_text a imagem grava nulo; com uma letra, 400', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const [a, b] = await tresEnvios(m);
      const criado = await m.catalogo.criarItem(AUTOR, {
        ...ITEM,
        images: [{ upload_id: a }, { upload_id: b, alt_text: 'Com descricao' }],
      });
      assert.deepEqual(
        criado.recurso.images.map((i) => i.alt_text),
        [null, 'Com descricao'],
        'ausente grava nulo, e e isso que faz o app cair no nome do produto',
      );

      const erro = await m.catalogo
        .alterarItem(AUTOR, ITEM.slug, criado.etag, { images: [{ upload_id: a, alt_text: 'a' }] })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['length'], 'presente e curto continua erro de campo, nao rascunho');
    });
  });

  void describe('rascunho incompleto e a regua da publicacao', () => {
    void it('RASCUNHO SO COM O NOME: cria sem parceiro, descricao, categoria, especie nem link', async () => {
      const criado = await m.catalogo.criarItem(AUTOR, { title: 'Produto que ainda estou pesquisando' });
      assert.equal(criado.recurso.publication_state, 'draft');
      assert.equal(criado.recurso.partner, null);
      assert.equal(criado.recurso.summary, null);
      assert.equal(criado.recurso.category, null);
      assert.equal(criado.recurso.target_url, null);
      assert.deepEqual(criado.recurso.species, []);
      assert.match(criado.recurso.slug, /^produto-que-ainda-estou-p/);
    });

    void it('ISCA: AFROUXAR O RASCUNHO NAO AFROUXOU A PUBLICACAO -- 400 com um erro POR CAMPO que falta', async () => {
      const criado = await m.catalogo.criarItem(AUTOR, { title: 'Produto que ainda estou pesquisando' });
      const erro = await m.catalogo.publicarItem(AUTOR, criado.recurso.slug, criado.etag).catch((e: unknown) => e);
      assert.equal(tipo(erro), 'validation-failed');
      assert.ok(erro instanceof AppError);
      assert.deepEqual(
        (erro.errors ?? []).map((e) => [e.field, e.code]),
        [
          ['summary', 'summary_required'],
          ['category', 'category_required'],
          ['species', 'species_required'],
          ['partner_slug', 'partner_required'],
          ['target_url', 'target_url_required'],
        ],
        'a ordem e a dos campos da tela, e cada falta tem o seu proprio campo e codigo',
      );
      const depois = await m.catalogo.lerItem(criado.recurso.slug);
      assert.equal(depois.recurso.publication_state, 'draft');
      assert.deepEqual(
        m.estado().trilha.map((e) => e.action),
        ['admin.store_item.created'],
        'publicacao recusada nao deixa linha de trilha de publicacao',
      );
    });

    void it('missing_to_publish diz o que falta em TODA leitura, e esvazia quando o rascunho fica completo', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const criado = await m.catalogo.criarItem(AUTOR, { title: 'Racao em pesquisa' });
      assert.deepEqual(criado.recurso.missing_to_publish, [
        'summary',
        'category',
        'species',
        'partner_slug',
        'target_url',
      ]);

      const completo = await m.catalogo.alterarItem(AUTOR, criado.recurso.slug, criado.etag, {
        partner_slug: PARCEIRO.slug,
        summary: ITEM.summary,
        category: ITEM.category,
        species: ITEM.species,
        target_url: ITEM.target_url,
      });
      assert.deepEqual(completo.recurso.missing_to_publish, []);
      const publicado = await m.catalogo.publicarItem(AUTOR, criado.recurso.slug, completo.etag);
      assert.equal(publicado.recurso.publication_state, 'published');
    });

    void it('`null` LIMPA no rascunho, e tirar o parceiro tira o destino junto', async () => {
      await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
      const criado = await m.catalogo.criarItem(AUTOR, ITEM);
      const limpo = await m.catalogo.alterarItem(AUTOR, ITEM.slug, criado.etag, {
        summary: null,
        category: null,
        partner_slug: null,
      });
      assert.equal(limpo.recurso.summary, null);
      assert.equal(limpo.recurso.category, null);
      assert.equal(limpo.recurso.partner, null);
      assert.equal(
        limpo.recurso.target_url,
        null,
        'o banco guarda so o caminho: destino sem host do parceiro nao tem endereco',
      );
    });

    void it('ISCA: destino sem parceiro e recusado (partner_required), na criacao e na alteracao', async () => {
      const naCriacao = await m.catalogo
        .criarItem(AUTOR, { title: 'Sem parceiro', target_url: 'https://lojadobairro.test/x' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(naCriacao), ['partner_required']);

      const rascunho = await m.catalogo.criarItem(AUTOR, { title: 'Ainda sem parceiro' });
      const naAlteracao = await m.catalogo
        .alterarItem(AUTOR, rascunho.recurso.slug, rascunho.etag, { target_url: 'https://lojadobairro.test/x' })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(naAlteracao), ['partner_required']);
    });

    void it('o que a pessoa JA escreveu continua conferido: descricao de uma letra e 400 no rascunho', async () => {
      const erro = await m.catalogo.criarItem(AUTOR, { title: 'Produto', summary: 'a' }).catch((e: unknown) => e);
      assert.deepEqual(codigos(erro), ['length']);
    });

    void it('a descricao aceita quebra de linha, e ela volta igual na leitura', async () => {
      const comParagrafo = 'Primeira linha.\nSegunda linha.';
      const criado = await m.catalogo.criarItem(AUTOR, { title: 'Com paragrafos', summary: comParagrafo });
      assert.equal(criado.recurso.summary, comParagrafo, 'o \\n sobrevive a escrita e volta na leitura');
    });

    void it('A DESCRICAO VAI ATE 3000: 3000 passa, 3001 e 400, e a quebra conta no teto', async () => {
      const com3000 = await m.catalogo.criarItem(AUTOR, { title: 'Descricao cheia', summary: 'a'.repeat(3000) });
      assert.equal(com3000.recurso.summary?.length, 3000);

      const com3001 = await m.catalogo
        .criarItem(AUTOR, { title: 'Um a mais', summary: 'a'.repeat(3001) })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(com3001), ['length']);

      const noLimite = await m.catalogo.criarItem(AUTOR, {
        title: 'No limite com quebra',
        summary: `${'a'.repeat(2998)}\na`,
      });
      assert.equal(noLimite.recurso.summary?.length, 3000);

      const passou = await m.catalogo
        .criarItem(AUTOR, { title: 'Passou pela quebra', summary: `${'a'.repeat(3000)}\nb` })
        .catch((e: unknown) => e);
      assert.deepEqual(codigos(passou), ['length'], 'a quebra ocupa um caractere do teto');
    });
  });
});

/**
 * Os DOIS NIVEIS da categoria (decisao do cliente de 17/10/2026: "dois niveis, com
 * subcategorias como a petlove").
 */
void describe('categoria e subcategoria, os dois niveis', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(async () => {
    m = montar();
    await m.catalogo.criarParceiro(AUTOR, PARCEIRO);
  });

  void it('cria sem subcategoria: estado valido, e o campo sai nulo', async () => {
    const i = await m.catalogo.criarItem(AUTOR, ITEM);
    assert.equal(i.recurso.category, 'food');
    assert.equal(i.recurso.category_label, 'Rações');
    assert.equal(i.recurso.subcategory, null);
    assert.equal(i.recurso.subcategory_label, null);
  });

  void it('cria com subcategoria da categoria: os dois niveis gravados, com rotulo', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    assert.equal(i.recurso.subcategory, 'racao_seca');
    assert.equal(i.recurso.subcategory_label, 'Ração seca');
  });

  void it('categoria fora do vocabulario: 400 `unknown_category`, e nada e gravado', async () => {
    await assert.rejects(
      () => m.catalogo.criarItem(AUTOR, { ...ITEM, category: 'areia' }),
      (erro: unknown) => {
        assert.equal(tipo(erro), 'validation-failed');
        assert.deepEqual(codigos(erro), ['unknown_category']);
        return true;
      },
    );
    assert.equal(m.estado().itens.size, 0);
  });

  void it('subcategoria de OUTRA categoria: 400 `subcategory_not_in_category`', async () => {
    await assert.rejects(
      () => m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'bifinhos' }),
      (erro: unknown) => {
        assert.deepEqual(codigos(erro), ['subcategory_not_in_category']);
        return true;
      },
    );
    assert.equal(m.estado().itens.size, 0);
  });

  void it('subcategoria inexistente: 400 `unknown_subcategory`', async () => {
    await assert.rejects(
      () => m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'arranhador' }),
      (erro: unknown) => {
        assert.deepEqual(codigos(erro), ['unknown_subcategory']);
        return true;
      },
    );
  });

  void it('alterar manda `null`: a subcategoria sai, e a categoria fica', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    const limpo = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, { subcategory: null });
    assert.equal(limpo.recurso.subcategory, null);
    assert.equal(limpo.recurso.category, 'food');
  });

  void it('alterar SEM mandar subcategoria preserva a gravada', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    const editado = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, {
      title: 'Racao 10 kg',
    });
    assert.equal(editado.recurso.subcategory, 'racao_seca');
  });

  void it('ISCA: trocar a CATEGORIA sem mandar a subcategoria e 400, nao gravacao incoerente', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    await assert.rejects(
      () => m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, { category: 'treats' }),
      (erro: unknown) => {
        assert.deepEqual(codigos(erro), ['subcategory_not_in_category']);
        return true;
      },
    );
    const atual = await m.catalogo.lerItem(ITEM.slug);
    assert.equal(atual.recurso.category, 'food');
    assert.equal(atual.recurso.subcategory, 'racao_seca');
    assert.equal(atual.recurso.version, i.recurso.version);
  });

  void it('trocar categoria E subcategoria juntas, para um par coerente: passa', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    const trocado = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, {
      category: 'treats',
      subcategory: 'bifinhos',
    });
    assert.equal(trocado.recurso.category, 'treats');
    assert.equal(trocado.recurso.subcategory, 'bifinhos');
    assert.equal(trocado.recurso.subcategory_label, 'Bifinhos');
  });

  void it('trocar para categoria SEM arvore levantada, limpando a subcategoria: passa', async () => {
    const i = await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    const trocado = await m.catalogo.alterarItem(AUTOR, ITEM.slug, i.etag, {
      category: 'bed',
      subcategory: null,
    });
    assert.equal(trocado.recurso.category, 'bed');
    assert.equal(trocado.recurso.subcategory, null);
  });

  void it('o retrato da trilha carrega os dois niveis', async () => {
    await m.catalogo.criarItem(AUTOR, { ...ITEM, subcategory: 'racao_seca' });
    const depois = m.estado().trilha.at(-1)?.after;
    assert.equal(depois?.['category'], 'food');
    assert.equal(depois?.['subcategory'], 'racao_seca');
  });
});
