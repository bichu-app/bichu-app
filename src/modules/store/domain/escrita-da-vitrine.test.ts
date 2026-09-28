/**
 * As regras da escrita administrativa da `Loja`, sem banco e sem servidor.
 *
 * Tres iscas deste arquivo sao as do briefing da fatia e do ADR-0027 item 14:
 *
 * - o painel VE o preco vencido (e o caso negativo: o app continua sem ve-lo,
 *   pela MESMA regra de vencimento);
 * - o destino fora do host do parceiro e recusado com `host_mismatch`, inclusive
 *   o host que so termina com o texto do parceiro sem ser subdominio dele;
 * - nenhuma projecao do painel carrega o `id` interno.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  comoEtag,
  dataDeConsultaNoFuturo,
  destinosQueDeixariamDeCasar,
  errosDeTexto,
  errosDoDestino,
  estadoDePublicacao,
  lerIfMatch,
  projetarItemAdministrativo,
  projetarParceiro,
  conferirRotulo,
  slugDaTag,
  somarDias,
  validoAte,
  type ItemAdministrativo,
  type ParceiroAdministrativo,
} from './escrita-da-vitrine.js';
import { projetarItem } from './item-da-vitrine.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

const AGORA = Date.UTC(2026, 8, 23, 15, 0, 0) as Instant;
const data = (iso: string): Date => comoData(Date.parse(iso) as Instant);
const URL_DE_MIDIA = (chave: string): string => `https://midia.bichu.test/${chave}`;

function item(ajustes: Partial<ItemAdministrativo> = {}): ItemAdministrativo {
  return {
    id: '0192a3b4-0000-7000-8000-000000000001',
    slug: 'racao-adulto-10kg',
    partner: { slug: 'loja-do-bairro', name: 'Loja do Bairro', host: 'lojadobairro.test' },
    title: 'Racao para cao adulto, 10 kg',
    summary: 'Racao seca para caes adultos de porte medio.',
    category: 'food',
    targetUrl: 'https://lojadobairro.test/racao-adulto-10kg',
    imageUrl: null,
    species: ['dog'],
    tags: [{ slug: 'porte-medio', label: 'Porte medio', active: true }],
    imagens: [],
    priceAmount: 18990,
    priceCurrency: 'BRL',
    priceCheckedAt: '2026-09-22',
    active: true,
    publishedAt: data('2026-08-10T13:02:11Z'),
    sortOrder: 10,
    createdAt: data('2026-08-10T12:58:40Z'),
    updatedAt: data('2026-08-10T13:02:11Z'),
    version: 3,
    ...ajustes,
  };
}

void describe('estado de publicacao derivado', () => {
  void it('rascunho, publicado e retirado', () => {
    assert.equal(estadoDePublicacao({ active: false, publishedAt: null }), 'draft');
    assert.equal(estadoDePublicacao({ active: true, publishedAt: comoData(AGORA) }), 'published');
    assert.equal(estadoDePublicacao({ active: false, publishedAt: comoData(AGORA) }), 'retired');
  });
});

void describe('o preco no painel', () => {
  void it('valid_until e checked_at + 30, o ultimo dia em que o app ainda mostra', () => {
    assert.equal(validoAte('2026-08-10'), '2026-09-09');
    assert.equal(somarDias('2026-02-27', 2), '2026-03-01');
  });

  void it('ISCA: preco consultado ha 31 dias sai COM o valor no painel, marcado vencido', () => {
    const vencido = item({ priceCheckedAt: '2026-08-23' });
    const painel = projetarItemAdministrativo(vencido, AGORA, URL_DE_MIDIA);
    assert.equal(painel.price_status, 'vencido');
    assert.deepEqual(painel.price, {
      amount: 18990,
      currency: 'BRL',
      checked_at: '2026-08-23',
      valid_until: '2026-09-22',
    });
  });

  void it('ISCA NEGATIVA: o mesmo item, pela projecao publica, sai SEM o valor', () => {
    const vencido = item({ priceCheckedAt: '2026-08-23' });
    const publico = projetarItem(
      {
        slug: vencido.slug,
        title: vencido.title,
        summary: vencido.summary,
        category: vencido.category,
        imageUrl: null,
        imageAltText: null,
        species: ['dog'],
        tags: [],
        targetUrl: vencido.targetUrl,
        partnerSlug: vencido.partner.slug,
        partnerName: vencido.partner.name,
        partnerHost: vencido.partner.host,
        priceAmount: vencido.priceAmount,
        priceCurrency: vencido.priceCurrency,
        priceCheckedAt: vencido.priceCheckedAt,
      },
      AGORA,
    );
    assert.equal(publico.price_status, 'vencido');
    assert.equal(publico.price_amount, null);
    assert.equal(publico.price_checked_at, null);
  });

  void it('preco consultado ha 30 dias ainda e vigente no painel', () => {
    const painel = projetarItemAdministrativo(item({ priceCheckedAt: '2026-08-24' }), AGORA, URL_DE_MIDIA);
    assert.equal(painel.price_status, 'vigente');
  });

  void it('item sem preco: price nulo e sem_preco', () => {
    const painel = projetarItemAdministrativo(
      item({ priceAmount: null, priceCurrency: null, priceCheckedAt: null }),
      AGORA,
      URL_DE_MIDIA,
    );
    assert.equal(painel.price, null);
    assert.equal(painel.price_status, 'sem_preco');
  });

  void it('data de consulta no futuro e reconhecida; hoje nao e futuro', () => {
    assert.equal(dataDeConsultaNoFuturo('2026-09-24', AGORA), true);
    assert.equal(dataDeConsultaNoFuturo('2026-09-23', AGORA), false);
  });
});

void describe('o destino termina no host do parceiro', () => {
  const HOST = 'lojadobairro.test';
  const codigos = (url: string): string[] => errosDoDestino('target_url', url, HOST).map((e) => e.code);

  void it('o host e subdominios dele passam', () => {
    assert.deepEqual(codigos('https://lojadobairro.test/x'), []);
    assert.deepEqual(codigos('https://www.lojadobairro.test/x?y=1'), []);
    assert.deepEqual(codigos('https://WWW.LojaDoBairro.TEST/x'), []);
  });

  void it('ISCA: host que so termina com o TEXTO do parceiro e recusado', () => {
    assert.deepEqual(codigos('https://falsalojadobairro.test/x'), ['host_mismatch']);
    assert.deepEqual(codigos('https://lojadobairro.test.golpe.invalid/x'), ['host_mismatch']);
    assert.deepEqual(codigos('https://outraloja.test/x'), ['host_mismatch']);
  });

  void it('D47: http, javascript, data, userinfo e IP literal sao recusados', () => {
    for (const url of [
      'http://lojadobairro.test/x',
      'javascript:alert(1)',
      'data:text/html,oi',
      'https://u@lojadobairro.test/x',
      'https://u:s@lojadobairro.test/x',
      'https://203.0.113.5/x',
      'https://[::1]/x',
      `https://lojadobairro.test/${'a'.repeat(2048)}`,
      'nao e url',
    ]) {
      assert.deepEqual(codigos(url), ['invalid_url'], url);
    }
  });

  void it('troca de host: nomeia os destinos que deixariam de casar', () => {
    const destinos = ['https://lojadobairro.test/a', 'https://www.lojadobairro.test/b'];
    assert.deepEqual(destinosQueDeixariamDeCasar(destinos, 'lojadobairro.test'), []);
    assert.deepEqual(destinosQueDeixariamDeCasar(destinos, 'www.lojadobairro.test'), [
      'https://lojadobairro.test/a',
    ]);
  });
});

void describe('texto medido como o CHECK mede', () => {
  void it('espacos nas pontas nao contam', () => {
    assert.deepEqual(errosDeTexto('title', '  a  ', 2, 120).map((e) => e.code), ['length']);
    assert.deepEqual(errosDeTexto('title', ' ab ', 2, 120), []);
  });
});

void describe('ETag e If-Match', () => {
  void it('ETag e a versao entre aspas', () => {
    assert.equal(comoEtag(7), '"7"');
  });

  void it('ausente, numero e o resto', () => {
    assert.deepEqual(lerIfMatch(undefined), { tipo: 'ausente' });
    assert.deepEqual(lerIfMatch(''), { tipo: 'ausente' });
    assert.deepEqual(lerIfMatch('"7"'), { tipo: 'numero', versao: 7 });
    assert.deepEqual(lerIfMatch(' "12" '), { tipo: 'numero', versao: 12 });
    for (const lixo of ['*', 'W/"7"', '7', '"0"', '"-1"', '"99999999999"', '"7", "8"']) {
      assert.deepEqual(lerIfMatch(lixo), { tipo: 'invalida' }, lixo);
    }
  });
});

void describe('nenhum UUID interno na saida do painel', () => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  void it('ISCA: o item projetado nao carrega `id` nem valor com forma de UUID', () => {
    const projetado = projetarItemAdministrativo(item(), AGORA, URL_DE_MIDIA);
    assert.equal('id' in projetado, false);
    assert.doesNotMatch(JSON.stringify(projetado), UUID);
    assert.doesNotMatch(JSON.stringify(projetado), /000000000001/, 'o id interno do item saiu');
  });

  void it('ISCA: o parceiro projetado nao carrega `id`', () => {
    const parceiro: ParceiroAdministrativo = {
      id: '0192a3b4-0000-7000-8000-000000000002',
      slug: 'loja-do-bairro',
      name: 'Loja do Bairro',
      host: 'lojadobairro.test',
      active: true,
      sortOrder: 0,
      itemCount: 2,
      createdAt: comoData(AGORA),
      updatedAt: comoData(AGORA),
      version: 1,
    };
    const projetado = projetarParceiro(parceiro);
    assert.equal('id' in projetado, false);
    assert.doesNotMatch(JSON.stringify(projetado), UUID);
  });
});

void describe('a galeria no painel', () => {
  const imagem = (ajuste: Partial<ItemAdministrativo['imagens'][number]>): ItemAdministrativo['imagens'][number] => ({
    uploadId: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e70',
    imageId: '018f7c1e-7a2b-7c3d-9e4f-00000000beef',
    position: 0,
    altText: 'Saco de racao de 10 kg',
    status: 'ready',
    publicKey: 'card/abc.webp',
    rejectionReason: null,
    ...ajuste,
  });

  void it('pronta ganha url; processando e recusada nao', () => {
    const p = projetarItemAdministrativo(
      item({
        imagens: [
          imagem({}),
          imagem({ uploadId: 'u2', imageId: 'i2', position: 1, status: 'processing', publicKey: null }),
          imagem({ uploadId: 'u3', imageId: 'i3', position: 2, status: 'rejected', publicKey: null, rejectionReason: 'ilegivel' }),
        ],
      }),
      AGORA,
      URL_DE_MIDIA,
    );
    assert.deepEqual(
      p.images.map((i) => [i.position, i.status, i.url, i.rejection_reason]),
      [
        [0, 'ready', 'https://midia.bichu.test/card/abc.webp', null],
        [1, 'processing', null, null],
        [2, 'rejected', null, 'ilegivel'],
      ],
    );
    assert.equal(p.images[0]?.upload_id, '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e70');
    assert.equal(p.images[0]?.alt_text, 'Saco de racao de 10 kg');
  });

  void it('ISCA: o id interno da imagem (catalog_images.id) nao sai', () => {
    const p = projetarItemAdministrativo(item({ imagens: [imagem({})] }), AGORA, URL_DE_MIDIA);
    assert.doesNotMatch(JSON.stringify(p), /00000000beef/);
  });

  void it('especie e tags saem como o painel as ve, inclusive a tag inativa', () => {
    const p = projetarItemAdministrativo(
      item({ species: ['dog', 'cat'], tags: [{ slug: 'antiga', label: 'Antiga', active: false }] }),
      AGORA,
      URL_DE_MIDIA,
    );
    assert.deepEqual(p.species, ['dog', 'cat']);
    assert.deepEqual(p.tags, [{ slug: 'antiga', label: 'Antiga', active: false }]);
  });
});

void describe('o vocabulario de tags', () => {
  void it('o slug e derivado: sem acento, minusculo, espaco vira hifen', () => {
    assert.equal(slugDaTag('Ração'), 'racao');
    assert.equal(slugDaTag('  Porte   Médio '), 'porte-medio');
    assert.equal(slugDaTag('Anti - pulgas'), 'anti-pulgas');
  });

  void it('ISCA: duas grafias do mesmo rotulo dao o mesmo slug', () => {
    assert.equal(slugDaTag('Ração'), slugDaTag('racao'));
    assert.equal(slugDaTag('RACAO'), slugDaTag('ração'));
  });

  void it('rotulo aparado e com espacos juntados', () => {
    assert.deepEqual(conferirRotulo('label', '  Porte   medio ').rotulo, 'Porte medio');
  });

  void it('ISCA: URL, e-mail e simbolo sao recusados (tag_charset)', () => {
    for (const rotulo of ['http//x.test', 'a@b.io', 'promo!', 'x/y', 'oi<b>']) {
      assert.deepEqual(conferirRotulo('label', rotulo).erros.map((e) => e.code), ['tag_charset'], rotulo);
    }
  });

  void it('rotulo que nao forma slug de 3 caracteres: tag_slug_invalid', () => {
    assert.deepEqual(conferirRotulo('label', 'Pé').erros.map((e) => e.code), ['tag_slug_invalid']);
    assert.deepEqual(conferirRotulo('label', 'Gatos').erros, []);
  });
});
