/**
 * A projecao do item da vitrine e o vencimento do preco, sem banco e sem
 * servidor.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a mudanca foi conferida no
 * disco (hash SHA-256 diferente **e** `git diff` nao vazio), a suite rodou e
 * reprovou com o nome do caso na saida **e** com codigo de saida diferente de
 * zero, e o arquivo foi restaurado com o hash conferido de volta.
 * 22/09/2026, Node 22 (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `projetarItem` deixando de omitir o valor vencido | 2 |
 * | `projetarItem` omitindo SEMPRE o valor (a isca negativa) | 2 |
 * | a fronteira do vencimento virando `>=` no lugar de `>` | 1 |
 * | `projetarItem` acrescentando `id` a saida | 1 |
 *
 * **A isca negativa da terceira linha e obrigatoria**, e o criterio 16 da
 * BICHUS-185 a exige com essas palavras: sem ela, um servidor que **nunca**
 * envia preco passaria no teste de vencimento. Provar que o valor some quando
 * vence nao prova nada se ele tambem some quando nao vence.
 */
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
    imageUrl: null,
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

/**
 * Um instante fixo. Nada aqui depende do relogio de quem roda.
 *
 * E um `Instant` -- milissegundos --, e nao um `Date`, porque e isso que o
 * dominio recebe. `Date.UTC` e aritmetica de calendario e nao leitura de
 * relogio, e o `Clock` continua sendo o unico caminho do tempo real.
 */
const AGORA = Date.UTC(2026, 8, 22, 12) as Instant;

void describe('o vencimento do preco', () => {
  void it('conta em dias de CALENDARIO, e nao em milissegundos', () => {
    assert.equal(diasDeCalendario('2026-09-22', AGORA), 0);
    assert.equal(diasDeCalendario('2026-09-21', AGORA), 1);
    assert.equal(diasDeCalendario('2026-08-23', AGORA), 30);

    // A hora de quem pergunta nao muda a resposta. Um item com data de
    // exatamente 30 dias atras vencia de manha e nao vencia de tarde quando a
    // conta passava por milissegundos.
    for (const hora of [0, 3, 12, 23]) {
      assert.equal(
        diasDeCalendario('2026-08-23', Date.UTC(2026, 8, 22, hora, 59, 59) as Instant),
        30,
        `a hora ${String(hora)} mudou a contagem de dias`,
      );
    }
  });

  void it('ISCA -- a fronteira e o trigesimo dia INCLUSIVE', () => {
    // 30 dias de validade significa que o trigesimo ainda vale. Recusar nele
    // faria a validade ser de 29, e a divergencia entre o numero escrito e o
    // aplicado e a classe de defeito que ninguem procura.
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
    // A data sai junto: mante-la sem o valor entregaria ao aplicativo tudo de
    // que ele precisa para reconstruir "o preco era de tal dia".
    assert.equal(projetado.price_checked_at, null);

    // E o numero nao viaja escondido em lugar nenhum da resposta.
    assert.ok(
      !JSON.stringify(projetado).includes('7200'),
      'o valor vencido apareceu em algum campo da resposta',
    );
  });

  void it('ISCA NEGATIVA OBRIGATORIA -- o valor DENTRO do prazo PRECISA sair', () => {
    // Sem este caso, um servidor que nunca envia preco passaria no teste de
    // vencimento. Ele e o que impede "omitir sempre" de ser uma aprovacao.
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
    // O parceiro tambem nao tem UUID: `slug` e a chave primaria da tabela.
    assert.deepEqual(Object.keys(projetado.partner).sort(), ['host', 'name', 'slug']);

    // E nenhum valor da resposta tem a FORMA de um UUID -- um `id` renomeado
    // continuaria sendo um vazamento com outro nome.
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
    // O item continua na vitrine: preco e opcional, e ausencia de preco e
    // estado normal, nao lacuna.
    assert.equal(projetado.slug, 'racao-umida-sache');
    assert.equal(projetado.title, 'Ração úmida sachê frango');
  });

  void it('nao ha campo de comparacao de preco em lugar nenhum', () => {
    const projetado = projetarItem(item(), AGORA);
    // Criterio 19: preco riscado, "de/por", desconto e "menor preco" nao tem
    // campo, e o portao reprova se algum nascer.
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
