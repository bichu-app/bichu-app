import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  diasDeCalendario,
  DIAS_DE_VALIDADE_DO_PRECO,
  estadoDoPreco,
  projetarItem,
  type ItemDaVitrine,
} from './item-da-vitrine.js';
import type { Instant } from '../../../shared/types/brands.js';

function item(ajustes: Partial<ItemDaVitrine> = {}): ItemDaVitrine {
  return {
    slug: 'racao-umida-sache',
    title: 'Ração úmida sachê frango',
    summary: 'Caixa com doze unidades de 85 g.',
    category: 'food',
    categoryLabel: 'Rações',
    subcategory: 'racao_umida',
    subcategoryLabel: 'Ração úmida',
    imageUrl: null,
    imageAltText: null,
    imagens: [],
    species: ['dog'],
    tags: [],
    targetUrl: 'https://mundo-pet.example/racao-umida-sache-frango',
    partnerSlug: 'mundo-pet',
    partnerName: 'Mundo Pet',
    partnerHost: 'mundo-pet.example',
    priceAmount: 7200,
    priceCurrency: 'BRL',
    priceCheckedAt: '2026-09-01',
    ...ajustes,
  };
}

const AGORA = Date.UTC(2026, 8, 22, 12) as Instant;

void describe('o vencimento do preco', () => {
  void it('conta em dias de CALENDARIO, e nao em milissegundos', () => {
    assert.equal(diasDeCalendario('2026-09-22', AGORA), 0);
    assert.equal(diasDeCalendario('2026-09-21', AGORA), 1);
    assert.equal(diasDeCalendario('2026-08-23', AGORA), 30);

    for (const hora of [0, 3, 12, 23]) {
      assert.equal(
        diasDeCalendario('2026-08-23', Date.UTC(2026, 8, 22, hora, 59, 59) as Instant),
        30,
        `a hora ${String(hora)} mudou a contagem de dias`,
      );
    }
  });

  void it('ISCA -- a fronteira e o trigesimo dia INCLUSIVE', () => {
    assert.equal(DIAS_DE_VALIDADE_DO_PRECO, 30);
    assert.equal(estadoDoPreco(item({ priceCheckedAt: '2026-08-23' }), AGORA), 'vigente');
    assert.equal(estadoDoPreco(item({ priceCheckedAt: '2026-08-22' }), AGORA), 'vencido');
  });

  void it('distingue TRES estados, e nao dois', () => {
    assert.equal(estadoDoPreco(item({ priceCheckedAt: '2026-09-20' }), AGORA), 'vigente');
    assert.equal(estadoDoPreco(item({ priceCheckedAt: '2026-07-01' }), AGORA), 'vencido');
    assert.equal(
      estadoDoPreco(
        item({ priceAmount: null, priceCurrency: null, priceCheckedAt: null }),
        AGORA,
      ),
      'sem_preco',
    );
  });
});

void describe('a projecao publica', () => {
  void it('ISCA -- o valor VENCIDO nao sai, nem em campo nenhum', () => {
    const projetado = projetarItem(item({ priceCheckedAt: '2026-07-01' }), AGORA);

    assert.equal(projetado.price_status, 'vencido');
    assert.equal(projetado.price_amount, null);
    assert.equal(projetado.price_currency, null);
    assert.equal(projetado.price_checked_at, null);

    assert.ok(
      !JSON.stringify(projetado).includes('7200'),
      'o valor vencido apareceu em algum campo da resposta',
    );
  });

  void it('ISCA NEGATIVA OBRIGATORIA -- o valor DENTRO do prazo PRECISA sair', () => {
    const projetado = projetarItem(item({ priceCheckedAt: '2026-09-20' }), AGORA);

    assert.equal(projetado.price_status, 'vigente');
    assert.equal(projetado.price_amount, 7200);
    assert.equal(projetado.price_currency, 'BRL');
    assert.equal(projetado.price_checked_at, '2026-09-20');
  });

  void it('ISCA -- nenhum UUID sai na projecao', () => {
    const projetado = projetarItem(item(), AGORA);
    const chaves = Object.keys(projetado);

    assert.ok(!chaves.includes('id'), 'a projecao publica devolveu `id`');
    for (const chave of chaves) {
      assert.ok(
        !chave.endsWith('_id'),
        `a projecao publica devolveu um identificador interno: ${chave}`,
      );
    }
    assert.deepEqual(Object.keys(projetado.partner).sort(), ['host', 'name', 'slug']);

    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.ok(
      !uuid.test(JSON.stringify(projetado)),
      'a projecao publica carrega algo com forma de UUID',
    );
  });

  void it('o item sem preco projeta os tres campos nulos, e nao some', () => {
    const projetado = projetarItem(
      item({ priceAmount: null, priceCurrency: null, priceCheckedAt: null }),
      AGORA,
    );
    assert.equal(projetado.price_status, 'sem_preco');
    assert.equal(projetado.price_amount, null);
    assert.equal(projetado.slug, 'racao-umida-sache');
    assert.equal(projetado.title, 'Ração úmida sachê frango');
  });

  void it('nao ha campo de comparacao de preco em lugar nenhum', () => {
    const projetado = projetarItem(item(), AGORA);
    for (const proibido of [
      'price_from',
      'price_was',
      'old_price',
      'discount',
      'discount_percent',
      'compare_at',
      'lowest_price',
    ]) {
      assert.ok(
        !(proibido in projetado),
        `a vitrine nao compara preco, e \`${proibido}\` apareceu`,
      );
    }
  });
});

void describe('categoria e subcategoria na projecao publica', () => {
  void it('codigo e rotulo saem lado a lado, nos dois niveis', () => {
    const projetado = projetarItem(item(), AGORA);
    assert.equal(projetado.category, 'food');
    assert.equal(projetado.category_label, 'Rações');
    assert.equal(projetado.subcategory, 'racao_umida');
    assert.equal(projetado.subcategory_label, 'Ração úmida');
  });

  void it('item sem subcategoria: os dois campos do segundo nivel nulos, e isso e NORMAL', () => {
    const projetado = projetarItem(item({ subcategory: null, subcategoryLabel: null }), AGORA);
    assert.equal(projetado.subcategory, null);
    assert.equal(projetado.subcategory_label, null);
    assert.equal(projetado.category_label, 'Rações');
  });

  void it('o rotulo nao substitui o codigo: o filtro manda o CODIGO de volta', () => {
    const projetado = projetarItem(item(), AGORA);
    assert.notEqual(projetado.category, projetado.category_label);
    assert.match(projetado.category, /^[a-z][a-z0-9_]*$/);
  });

  void it('preco VENCIDO nao mexe na classificacao', () => {
    const vencido = projetarItem(item({ priceCheckedAt: '2026-01-01' }), AGORA);
    assert.equal(vencido.price_status, 'vencido');
    assert.equal(vencido.price_amount, null);
    assert.equal(vencido.category_label, 'Rações');
    assert.equal(vencido.subcategory_label, 'Ração úmida');
  });
});
