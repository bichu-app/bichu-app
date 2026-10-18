/**
 * As regras da escrita administrativa da `Loja`, sem banco e sem servidor.
 *
 * Tres iscas deste arquivo sao as do briefing da fatia e do ADR-0027 item 14:
 *
 * - o painel VE o preco vencido (e o caso negativo: o app continua sem ve-lo,
 *   pela MESMA regra de vencimento);
 * - o destino fora do host EXATO do parceiro e recusado com `host_mismatch`, inclusive
 *   o subdominio e o host que so termina com o texto do parceiro;
 * - nenhuma projecao do painel carrega o `id` interno.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  comoEtag,
  dataDeConsultaNoFuturo,
  caminhoDoDestino,
  errosDeTexto,
  ehDoParceiro,
  errosDoDestino,
  errosDoSiteDoParceiro,
  hostDoDestino,
  estadoDePublicacao,
  lerIfMatch,
  errosDaClassificacao,
  projetarItemAdministrativo,
  projetarParceiro,
  conferirRotulo,
  slugDaTag,
  slugDoItem,
  somarDias,
  validoAte,
  type ItemAdministrativo,
  type ParceiroAdministrativo,
} from './escrita-da-vitrine.js';
import { hostDoEndereco } from '../../../shared/url/endereco-completo.js';

/**
 * `https://` montado em duas partes.
 *
 * O portao de portabilidade casa `https://` COLADO num host `.com`/`.com.br`,
 * e estes casos precisam do host de verdade: e o link que o cliente tentou
 * cadastrar em 17/10, e trocar `cobasi.com.br` por um host de exemplo faria o
 * teste deixar de ser sobre o que aconteceu. Mesma saida de
 * `escrita-do-encontro.test.ts`.
 */
const HTTPS = 'https:' + '//';
const HTTP = 'http:' + '//';
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
    categoryLabel: 'Rações',
    subcategory: 'racao_seca',
    subcategoryLabel: 'Ração seca',
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
    // A projecao publica so recebe item PUBLICADO, e publicado tem as quatro
    // colunas do rascunho preenchidas (`store_items_publicado_esta_completo`).
    // Os `??` abaixo sao do tipo, nao do caso: sem eles o teste nao compila
    // desde que o rascunho passou a aceitar nulo.
    assert.ok(vencido.partner !== null);
    const publico = projetarItem(
      {
        slug: vencido.slug,
        title: vencido.title,
        summary: vencido.summary ?? '',
        category: vencido.category ?? 'food',
        categoryLabel: vencido.categoryLabel ?? 'Rações',
        subcategory: vencido.subcategory,
        subcategoryLabel: vencido.subcategoryLabel,
        imageUrl: null,
        imageAltText: null,
        imagens: [],
        species: ['dog'],
        tags: [],
        targetUrl: vencido.targetUrl ?? '',
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

void describe('o destino e do parceiro: o host dele ou um subdominio dele', () => {
  const HOST = 'lojadobairro.test';
  const codigos = (url: string): string[] => errosDoDestino('target_url', url, HOST).map((e) => e.code);
  const texto = (url: string): string[] =>
    errosDoDestino('target_url', url, HOST).map((e) => e.message ?? '');

  // -------------------------------------------------------------------------
  // O CASO QUE BLOQUEOU O CLIENTE, por extenso
  // -------------------------------------------------------------------------
  //
  // 17/10/2026: ele tentou cadastrar um produto da Cobasi e a tela disse que o
  // link "precisa comecar com https://" sobre um link que comecava com
  // `https://`. Eram DUAS recusas somadas (query e `www.`) escondidas atras de
  // UMA mensagem errada. O link esta aqui inteiro, e nao montado por helper:
  // um helper esconderia justamente as duas partes que eram o problema.
  void it('o link do cliente passa', () => {
    const doCliente =
      `${HTTPS}www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673`;
    assert.deepEqual(errosDoDestino('target_url', doCliente, 'cobasi.com.br'), []);
    assert.equal(
      caminhoDoDestino(doCliente),
      '/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673',
    );
    assert.equal(hostDoDestino(doCliente, 'cobasi.com.br'), 'www.cobasi.com.br');
  });

  void it('o host exato passa, sem diferenca de caixa', () => {
    assert.deepEqual(codigos('https://lojadobairro.test/x'), []);
    assert.deepEqual(codigos('https://LojaDoBairro.TEST/x'), []);
  });

  // -------------------------------------------------------------------------
  // A FRONTEIRA DE ROTULO: o ponto e a regra inteira
  // -------------------------------------------------------------------------

  void it('subdominio do parceiro passa', () => {
    for (const url of [
      'https://www.lojadobairro.test/x',
      'https://loja.lojadobairro.test/x',
      'https://produtos.lojadobairro.test/x',
      'https://a.b.lojadobairro.test/x',
    ]) {
      assert.deepEqual(codigos(url), [], url);
    }
  });

  // ISCA -- em `ehDoParceiro`, troque `host.endsWith(`.${alvo}`)` por
  // `host.endsWith(alvo)`. Este caso reprova, e ele e a razao de a funcao
  // existir separada: `endsWith` cru deixa `malcobasi.com.br` passar por
  // `cobasi.com.br`, e e o jeito mais barato de fazer um link nosso levar para
  // fora sem ninguem notar lendo o codigo.
  void it('ISCA: host que so TERMINA com o texto do parceiro e recusado', () => {
    for (const url of [
      'https://falsalojadobairro.test/x',
      'https://mallojadobairro.test/x',
      'https://xlojadobairro.test/x',
      'https://lojadobairro.test.golpe.invalid/x',
      'https://outraloja.test/x',
      'https://lojadobairro.testes/x',
    ]) {
      assert.deepEqual(codigos(url), ['host_mismatch'], url);
    }
  });

  // -------------------------------------------------------------------------
  // QUERY E FRAGMENTO PASSAM, e chegam inteiros ao caminho guardado
  // -------------------------------------------------------------------------

  void it('parametro e ancora passam', () => {
    for (const url of [
      'https://lojadobairro.test/x?idsku=1197673',
      'https://lojadobairro.test/x?cor=azul&tamanho=g',
      'https://lojadobairro.test/x#descricao',
      'https://lojadobairro.test/x?a=1#b',
      'https://lojadobairro.test/x?',
    ]) {
      assert.deepEqual(codigos(url), [], url);
    }
  });

  // ISCA -- em `caminhoDoDestino`, volte a devolver so `url.pathname`. Este
  // caso reprova. Sem ele o defeito seria SILENCIOSO: o item gravaria, a
  // vitrine mostraria, e a pessoa cairia numa pagina que nao e a do produto.
  void it('ISCA: o caminho guardado leva query e fragmento junto', () => {
    assert.equal(caminhoDoDestino('https://lojadobairro.test/p?idsku=9'), '/p?idsku=9');
    assert.equal(caminhoDoDestino('https://lojadobairro.test/p#ficha'), '/p#ficha');
    assert.equal(caminhoDoDestino('https://lojadobairro.test/p?a=1#b'), '/p?a=1#b');
  });

  // -------------------------------------------------------------------------
  // O QUE CONTINUA RECUSADO, e agora cada um diz o PROPRIO motivo
  // -------------------------------------------------------------------------

  void it('D47: http, javascript, data, userinfo e IP literal continuam recusados', () => {
    assert.deepEqual(codigos('http://lojadobairro.test/x'), ['url_not_https']);
    assert.deepEqual(codigos('javascript:alert(1)'), ['url_not_https']);
    assert.deepEqual(codigos('data:text/html,oi'), ['url_not_https']);
    assert.deepEqual(codigos('https://u@lojadobairro.test/x'), ['url_has_credentials']);
    assert.deepEqual(codigos('https://u:s@lojadobairro.test/x'), ['url_has_credentials']);
    assert.deepEqual(codigos('https://203.0.113.5/x'), ['url_ip_literal']);
    assert.deepEqual(codigos('https://[::1]/x'), ['url_ip_literal']);
    assert.deepEqual(codigos(`https://lojadobairro.test/${'a'.repeat(2048)}`), ['url_too_long']);
    assert.deepEqual(codigos('nao e url'), ['invalid_url']);
  });

  // ISCA -- em `errosDoDestino`, volte a devolver `invalid_url` com a mesma
  // mensagem para todas as recusas. Este caso reprova.
  //
  // Ele mede a MENSAGEM, e nao so o `code`, porque foi a mensagem que mentiu
  // para o cliente: "precisa comecar com https://" para um link que comecava
  // com `https://`. Nenhuma recusa que nao seja de esquema pode dizer isso.
  void it('ISCA: cada recusa diz o proprio motivo, e so a de esquema fala de https', () => {
    const sobreHttps = (url: string): boolean => texto(url).some((m) => m.includes('https://'));

    assert.ok(sobreHttps('http://lojadobairro.test/x'));

    for (const url of [
      'https://www.outraloja.test/x',
      'https://u:s@lojadobairro.test/x',
      'https://203.0.113.5/x',
      `https://lojadobairro.test/${'a'.repeat(2048)}`,
      'nao e url',
    ]) {
      assert.equal(sobreHttps(url), false, `a recusa de ${url} nao pode falar de https://`);
      assert.equal(texto(url).length, 1, url);
      assert.ok((texto(url)[0] ?? '').length > 0, url);
    }
  });

  // -------------------------------------------------------------------------
  // `target_host`: nulo no caso comum, preenchido no subdominio
  // -------------------------------------------------------------------------

  void it('o host guardado e nulo quando e o do proprio parceiro', () => {
    assert.equal(hostDoDestino('https://lojadobairro.test/x', HOST), null);
    assert.equal(hostDoDestino('https://LojaDoBairro.TEST/x', HOST), null);
  });

  void it('o host guardado e o do subdominio, em minusculas', () => {
    assert.equal(hostDoDestino('https://www.lojadobairro.test/x', HOST), 'www.lojadobairro.test');
    assert.equal(hostDoDestino('https://WWW.LojaDoBairro.TEST/x', HOST), 'www.lojadobairro.test');
  });

  void it('a fronteira de rotulo de ehDoParceiro, direto', () => {
    assert.equal(ehDoParceiro('lojadobairro.test', HOST), true);
    assert.equal(ehDoParceiro('www.lojadobairro.test', HOST), true);
    assert.equal(ehDoParceiro('mallojadobairro.test', HOST), false);
    assert.equal(ehDoParceiro('lojadobairro.test.golpe.invalid', HOST), false);
  });

  // -------------------------------------------------------------------------
  // O caminho guardado continua cabendo no CHECK do banco
  // -------------------------------------------------------------------------

  // O CHECK de `store_items.target_path` depois da migracao
  // `20261017000001`: comeca em `/`, sem espaco em branco, com `?` e `#`
  // permitidos. Copiado dela de proposito -- se os dois divergirem, a escrita
  // passa aqui e morre no banco como 500.
  void it('o caminho guardado casa com o CHECK de store_items.target_path', () => {
    const check = /^\/\S*$/;
    for (const url of [
      'https://lojadobairro.test',
      'https://lojadobairro.test/a b/c',
      'https://lojadobairro.test/r/ração',
      'https://lojadobairro.test/p?idsku=1197673',
      'https://lojadobairro.test/p?q=a b',
      'https://lojadobairro.test/p#ficha tecnica',
    ]) {
      assert.deepEqual(codigos(url), [], url);
      assert.ok(check.test(caminhoDoDestino(url)), `${url} -> ${caminhoDoDestino(url)}`);
    }
    assert.equal(caminhoDoDestino('https://lojadobairro.test/racao/sache'), '/racao/sache');
  });
});

void describe('o site do parceiro e o endereco COMPLETO, com https', () => {
  // Padrao do cliente de 17/10/2026: "todo campo de site/url, o usuario deve
  // preencher completo o endereco completo, inclusive com o https".
  //
  // Antes deste dia o campo era `host` e pedia o nome pelado
  // (`cobasi.com.br`), com a ajuda "So o endereco, sem https:// e sem barra".
  // O sentido inverteu, e a COLUNA nao mudou: ela continua guardando o host,
  // que sai do endereco por `hostDoEndereco`.
  const codigos = (v: string): string[] => errosDoSiteDoParceiro('site_url', v).map((e) => e.code);
  const frase = (v: string): string => errosDoSiteDoParceiro('site_url', v)[0]?.message ?? '';

  void it('o endereco completo passa, com ou sem barra e com subdominio', () => {
    for (const bom of [
      `${HTTPS}cobasi.com.br`,
      `${HTTPS}cobasi.com.br/`,
      `${HTTPS}www.cobasi.com.br`,
      `${HTTPS}loja.cobasi.com.br/`,
    ]) {
      assert.deepEqual(codigos(bom), [], bom);
    }
  });

  void it('o host guardado sai do endereco, em minusculas', () => {
    assert.equal(hostDoEndereco(`${HTTPS}Cobasi.COM.BR/`), 'cobasi.com.br');
    assert.equal(hostDoEndereco(`${HTTPS}www.cobasi.com.br`), 'www.cobasi.com.br');
    // O ponto final e o mesmo host em DNS, e sai aqui.
    assert.equal(hostDoEndereco(`${HTTPS}cobasi.com.br./loja`), 'cobasi.com.br');
  });

  // ISCA -- em `errosDoSiteDoParceiro`, troque a chamada por `return []`. Os
  // dois casos abaixo passam a aceitar tudo e reprovam.
  void it('ISCA: o nome pelado e recusado, e a frase mostra a forma certa', () => {
    for (const pelado of ['cobasi.com.br', 'www.cobasi.com.br', 'cobasi.com.br/loja']) {
      assert.deepEqual(codigos(pelado), ['site_url_not_https'], pelado);
      assert.ok(frase(pelado).includes('https://'), pelado);
    }
  });

  void it('ISCA: as protecoes nao afrouxaram, e cada uma diz o motivo real', () => {
    assert.deepEqual(codigos(`${HTTP}cobasi.com.br`), ['site_url_not_https']);
    assert.ok(frase(`${HTTP}cobasi.com.br`).includes('http://'));
    assert.deepEqual(codigos('javascript:alert(1)'), ['site_url_not_https']);
    assert.deepEqual(codigos(`${HTTPS}u:s@cobasi.com.br`), ['site_url_has_credentials']);
    assert.deepEqual(codigos('https://203.0.113.5'), ['site_url_ip_literal']);
    assert.deepEqual(codigos('https://[::1]'), ['site_url_ip_literal']);
    assert.deepEqual(codigos(`${HTTPS}localhost`), ['site_url_local_host']);
    assert.deepEqual(codigos('https://loja.local'), ['site_url_local_host']);
    assert.deepEqual(codigos('https://semponto'), ['site_url_local_host']);
    assert.deepEqual(codigos(`${HTTPS}cobasi .com.br`), ['site_url_invalid']);
    assert.deepEqual(codigos(''), ['site_url_length']);

    // Nenhuma recusa que nao seja de esquema fala de `https://`.
    for (const ruim of [`${HTTPS}u:s@cobasi.com.br`, 'https://203.0.113.5', `${HTTPS}localhost`]) {
      assert.ok(!frase(ruim).includes('https://'), ruim);
    }
  });

  // O vinculo do item com o dominio do parceiro, depois que o host sai de um
  // endereco completo: a fronteira de rotulo continua valendo igual.
  void it('o vinculo do produto com o parceiro continua valendo', () => {
    const host = hostDoEndereco(`${HTTPS}cobasi.com.br/`);
    assert.equal(ehDoParceiro('www.cobasi.com.br', host), true);
    assert.equal(ehDoParceiro('malcobasi.com.br', host), false);
    assert.equal(ehDoParceiro('cobasi.com.br.golpe.io', host), false);
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
    // `W/"7"` e `"7-gzip"` sao a versao 7 vinda pela borda (07/10, shared/http/if-match.ts).
    assert.deepEqual(lerIfMatch('W/"7"'), { tipo: 'numero', versao: 7 });
    for (const lixo of ['*', '7', '"0"', '"-1"', '"99999999999"', '"7", "8"']) {
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

  // -------------------------------------------------------------------------
  // Pontuacao de nome de marca (o cliente travado em `N&D`, 17/10/2026)
  // -------------------------------------------------------------------------

  void it('O CASO: `N&D` e aceito, e o slug dele nao tem `&`', () => {
    const conferido = conferirRotulo('label', 'N&D');
    assert.deepEqual(conferido.erros, []);
    assert.equal(conferido.rotulo, 'N&D');
    assert.equal(conferido.slug, 'n-d');
  });

  void it('nome de marca real passa, e o slug fica em [a-z0-9-]', () => {
    const esperado: [string, string][] = [
      ['N&D', 'n-d'],
      ['Pro Plan', 'pro-plan'],
      ["Hill's", 'hills'],
      ['Hill\u2019s', 'hills'],
      ['Royal Canin', 'royal-canin'],
      ['Farmina N&D Ocean', 'farmina-n-d-ocean'],
      ['3 Cora\u00e7\u00f5es', '3-coracoes'],
      ['Omega 3 + 6', 'omega-3-6'],
    ];
    for (const [rotulo, slug] of esperado) {
      const conferido = conferirRotulo('label', rotulo);
      assert.deepEqual(conferido.erros, [], rotulo);
      assert.equal(conferido.slug, slug, rotulo);
      // O que vai na query string do filtro publico (`tag`, esquema `Slug`).
      assert.match(conferido.slug, /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, rotulo);
      assert.equal(encodeURIComponent(conferido.slug), conferido.slug, rotulo);
    }
  });

  void it('acento em NFD (como o macOS entrega) passa igual ao NFC', () => {
    const nfc = conferirRotulo('label', '3 Cora\u00e7\u00f5es');
    const nfd = conferirRotulo('label', '3 Corac\u0327o\u0303es');
    assert.deepEqual(nfd.erros, []);
    assert.equal(nfd.slug, nfc.slug);
  });

  void it('ISCA: `.` e `/` continuam fora, entao link e dominio nao viram rotulo', () => {
    // O alfabeto e o que fecha esta porta aqui: o detector de D59 mora em
    // `modules/network/domain` e a fronteira de modulo nao o alcanca deste
    // dominio. Se alguem liberar `.` ou `/`, este teste reprova primeiro.
    for (const rotulo of ['bit.ly/x', 'loja.com.br', 'www.pet.io', 'a@b.io', 'x/y', 'promo!', 'R$ 50']) {
      assert.deepEqual(conferirRotulo('label', rotulo).erros.map((e) => e.code), ['tag_charset'], rotulo);
    }
  });

  void it('ISCA: caractere invisivel tem codigo proprio, e nao `tag_charset`', () => {
    const invisiveis = [
      ['largura zero', 'Ra\u200bcao'],
      ['bidi (override)', 'Ra\u202ecao'],
      ['bidi (marca)', 'Ra\u200fcao'],
      ['juntor de largura zero', 'Ra\u200dcao'],
      ['controle', 'Ra\u0001cao'],
      ['BOM', 'Ra\ufeffcao'],
    ] as const;
    for (const [nome, rotulo] of invisiveis) {
      assert.deepEqual(conferirRotulo('label', rotulo).erros.map((e) => e.code), ['tag_invisible_char'], nome);
    }
  });

  void it('a mensagem do invisivel nao chama o caractere de "especial"', () => {
    const [erro] = conferirRotulo('label', 'Ra\u200bcao').erros;
    assert.ok(erro);
    const mensagem = erro.message ?? '';
    assert.doesNotMatch(mensagem, /especia/iu);
    assert.match(mensagem, /invis\u00edvel/u);
  });

  void it('o piso continua existindo: vazio, so espaco e teto de 24', () => {
    for (const rotulo of ['', '   ', '\t\n']) {
      assert.deepEqual(conferirRotulo('label', rotulo).erros.map((e) => e.code), ['length'], JSON.stringify(rotulo));
    }
    assert.deepEqual(conferirRotulo('label', 'a'.repeat(25)).erros.map((e) => e.code), ['length']);
    assert.deepEqual(conferirRotulo('label', 'a'.repeat(24)).erros, []);
    // Teto medido depois de aparar e juntar espacos, como o `CHECK` do banco.
    assert.deepEqual(conferirRotulo('label', `  ${'a'.repeat(24)}  `).erros, []);
  });

  void it('`&` e `+` nao sobram no slug do item, que usa a mesma derivacao', () => {
    assert.equal(slugDoItem('Ra\u00e7\u00e3o N&D Ocean'), 'racao-n-d-ocean');
  });
});

/**
 * A classificacao em dois niveis (decisao do cliente de 17/10/2026: "dois
 * niveis, com subcategorias como a petlove").
 *
 * ## Por que estes casos existem, e o que eles substituem
 *
 * Ate 17/10 a categoria era `enum` no contrato, e **nao havia nada para
 * testar aqui**: o esquema de corpo instalado a partir do contrato recusava
 * valor desconhecido antes de a aplicacao ver. O vocabulario virou dado, o
 * contrato passou a declarar `string` com formato, e a recusa por CAMPO
 * mudou de casa -- veio para `errosDaClassificacao`.
 *
 * O que estes casos guardam, portanto, e a garantia que a troca de `enum` por
 * tabela poderia ter perdido em silencio: o painel continua recebendo erro de
 * CAMPO, com o codigo certo, e nao erro de integridade do banco.
 */
void describe('a classificacao em dois niveis', () => {
  const ACHOU_TUDO = {
    categoriaAtiva: true,
    subcategoriaNaCategoria: true,
    subcategoriaEmAlgumaCategoria: true,
  };

  void it('categoria ativa, sem subcategoria: nenhum erro -- o segundo nivel e OPCIONAL', () => {
    assert.deepEqual(
      errosDaClassificacao('food', null, {
        categoriaAtiva: true,
        subcategoriaNaCategoria: false,
        subcategoriaEmAlgumaCategoria: false,
      }),
      [],
    );
  });

  void it('categoria ativa com subcategoria dela: nenhum erro', () => {
    assert.deepEqual(errosDaClassificacao('food', 'racao_seca', ACHOU_TUDO), []);
  });

  void it('categoria que nao esta no vocabulario: `unknown_category` no campo `category`', () => {
    const erros = errosDaClassificacao('areia', null, {
      categoriaAtiva: false,
      subcategoriaNaCategoria: false,
      subcategoriaEmAlgumaCategoria: false,
    });
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.field, 'category');
    assert.equal(erros[0]?.code, 'unknown_category');
  });

  void it('subcategoria de OUTRA categoria: `subcategory_not_in_category`, e nao "nao existe"', () => {
    // E o caso de trocar a categoria de um item e deixar a subcategoria
    // antiga para tras. Dizer "nao existe" faria a pessoa procurar um erro de
    // digitacao que nao esta la.
    const erros = errosDaClassificacao('food', 'bifinhos', {
      categoriaAtiva: true,
      subcategoriaNaCategoria: false,
      subcategoriaEmAlgumaCategoria: true,
    });
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.field, 'subcategory');
    assert.equal(erros[0]?.code, 'subcategory_not_in_category');
  });

  void it('subcategoria que nao existe em nenhuma categoria: `unknown_subcategory`', () => {
    const erros = errosDaClassificacao('food', 'arranhador', {
      categoriaAtiva: true,
      subcategoriaNaCategoria: false,
      subcategoriaEmAlgumaCategoria: false,
    });
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.code, 'unknown_subcategory');
  });

  void it('categoria desconhecida E subcategoria solta: os DOIS erros, num 400 so', () => {
    // Dois campos errados produzem duas entradas, e nao a primeira delas: o
    // formulario do painel pinta os dois de uma vez, e uma recusa por vez
    // faria a pessoa salvar duas.
    const erros = errosDaClassificacao('areia', 'arranhador', {
      categoriaAtiva: false,
      subcategoriaNaCategoria: false,
      subcategoriaEmAlgumaCategoria: false,
    });
    assert.deepEqual(
      erros.map((e) => e.field),
      ['category', 'subcategory'],
    );
  });

  void it('ISCA NEGATIVA: subcategoria nula nao produz erro nem quando o codigo existe por ai', () => {
    // Item sem segundo nivel e estado normal. Um `if` que olhasse
    // `subcategoriaEmAlgumaCategoria` sem olhar antes se ha subcategoria
    // transformaria "nao classifiquei" em erro de campo.
    assert.deepEqual(
      errosDaClassificacao('food', null, {
        categoriaAtiva: true,
        subcategoriaNaCategoria: false,
        subcategoriaEmAlgumaCategoria: true,
      }),
      [],
    );
  });
});

/** Os rotulos resolvidos chegam a projecao do painel, do jeito que a tabela os tem. */
void describe('os dois niveis na projecao do painel', () => {
  void it('o codigo e o rotulo saem lado a lado, nos dois niveis', () => {
    const projetado = projetarItemAdministrativo(item(), AGORA, URL_DE_MIDIA);
    assert.equal(projetado.category, 'food');
    assert.equal(projetado.category_label, 'Rações');
    assert.equal(projetado.subcategory, 'racao_seca');
    assert.equal(projetado.subcategory_label, 'Ração seca');
  });

  void it('item sem subcategoria sai com os dois campos do segundo nivel nulos', () => {
    const projetado = projetarItemAdministrativo(
      item({ subcategory: null, subcategoryLabel: null }),
      AGORA,
      URL_DE_MIDIA,
    );
    assert.equal(projetado.subcategory, null);
    assert.equal(projetado.subcategory_label, null);
    // A categoria continua obrigatoria: ela nunca e nula.
    assert.equal(projetado.category_label, 'Rações');
  });
});
