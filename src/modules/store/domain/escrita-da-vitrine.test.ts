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

function item(ajustes: Partial<ItemAdministrativo> = {}): ItemAdministrativo {
  return {
    id: '0192a3b4-0000-7000-8000-000000000001',
    slug: 'racao-adulto-10kg',
    partner: { slug: 'loja-do-bairro', name: 'Loja do Bairro', host: 'lojadobairro.com.br' },
    title: 'Racao para cao adulto, 10 kg',
    summary: 'Racao seca para caes adultos de porte medio.',
    category: 'food',
    targetUrl: 'https://lojadobairro.com.br/racao-adulto-10kg',
    imageUrl: null,
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
    const painel = projetarItemAdministrativo(vencido, AGORA);
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
    const painel = projetarItemAdministrativo(item({ priceCheckedAt: '2026-08-24' }), AGORA);
    assert.equal(painel.price_status, 'vigente');
  });

  void it('item sem preco: price nulo e sem_preco', () => {
    const painel = projetarItemAdministrativo(
      item({ priceAmount: null, priceCurrency: null, priceCheckedAt: null }),
      AGORA,
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
  const HOST = 'lojadobairro.com.br';
  const codigos = (url: string): string[] => errosDoDestino('target_url', url, HOST).map((e) => e.code);

  void it('o host e subdominios dele passam', () => {
    assert.deepEqual(codigos('https://lojadobairro.com.br/x'), []);
    assert.deepEqual(codigos('https://www.lojadobairro.com.br/x?y=1'), []);
    assert.deepEqual(codigos('https://WWW.LojaDoBairro.com.br/x'), []);
  });

  void it('ISCA: host que so termina com o TEXTO do parceiro e recusado', () => {
    assert.deepEqual(codigos('https://falsalojadobairro.com.br/x'), ['host_mismatch']);
    assert.deepEqual(codigos('https://lojadobairro.com.br.golpe.io/x'), ['host_mismatch']);
    assert.deepEqual(codigos('https://outraloja.com.br/x'), ['host_mismatch']);
  });

  void it('D47: http, javascript, data, userinfo e IP literal sao recusados', () => {
    for (const url of [
      'http://lojadobairro.com.br/x',
      'javascript:alert(1)',
      'data:text/html,oi',
      'https://u@lojadobairro.com.br/x',
      'https://u:s@lojadobairro.com.br/x',
      'https://10.0.0.1/x',
      'https://[::1]/x',
      `https://lojadobairro.com.br/${'a'.repeat(2048)}`,
      'nao e url',
    ]) {
      assert.deepEqual(codigos(url), ['invalid_url'], url);
    }
  });

  void it('troca de host: nomeia os destinos que deixariam de casar', () => {
    const destinos = ['https://lojadobairro.com.br/a', 'https://www.lojadobairro.com.br/b'];
    assert.deepEqual(destinosQueDeixariamDeCasar(destinos, 'lojadobairro.com.br'), []);
    assert.deepEqual(destinosQueDeixariamDeCasar(destinos, 'www.lojadobairro.com.br'), [
      'https://lojadobairro.com.br/a',
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
    const projetado = projetarItemAdministrativo(item(), AGORA);
    assert.equal('id' in projetado, false);
    assert.doesNotMatch(JSON.stringify(projetado), UUID);
  });

  void it('ISCA: o parceiro projetado nao carrega `id`', () => {
    const parceiro: ParceiroAdministrativo = {
      id: '0192a3b4-0000-7000-8000-000000000002',
      slug: 'loja-do-bairro',
      name: 'Loja do Bairro',
      host: 'lojadobairro.com.br',
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

void describe('a imagem no painel', () => {
  void it('sem imagem: null', () => {
    assert.equal(projetarItemAdministrativo(item(), AGORA).image, null);
  });

  void it('URL do parceiro (massa): external, sempre ready', () => {
    const p = projetarItemAdministrativo(item({ imageUrl: 'https://cdn.parceiro.com/x.jpg' }), AGORA);
    assert.deepEqual(p.image, {
      source: 'external',
      status: 'ready',
      url: 'https://cdn.parceiro.com/x.jpg',
      rejection_reason: null,
    });
  });
});
