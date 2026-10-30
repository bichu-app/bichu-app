/**
 * O rotulo `status`, a projecao do encontro e a do ponto, sem banco e sem
 * servidor.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  distanciaArredondada,
  estadoDoPedidoNoApp,
  projetarDetalhesPrivados,
  projetarEncontro,
  projetarLocalizacao,
  linkPublicoDoEncontro,
  enderecoNaLeituraAberta,
  REGRA_DO_ENDERECO,
  fimDoDiaLocal,
  statusDoEncontro,
  type EncontroDaRede,
  type EncontroPublicoProjetado,
} from './encontro-da-rede.js';
import type { AbsoluteUrl, Instant } from '../../../shared/types/brands.js';

/** Um instante fixo. Nada aqui depende do relogio de quem roda. */
const AGORA = Date.UTC(2026, 8, 23, 12, 0, 0) as Instant;
const UMA_HORA = 3_600_000;

function encontro(ajustes: Partial<EncontroDaRede> = {}): EncontroDaRede {
  return {
    slug: 'encontro-de-domingo-na-benedito',
    title: 'Encontro de domingo na Benedito Calixto',
    summary: 'Cachorros de todos os portes, sombra e agua fresca.',
    placeName: 'Praça Benedito Calixto',
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    state: 'SP',
    origem: 'admin',
    startsAt: (AGORA + UMA_HORA) as Instant,
    endsAt: (AGORA + 3 * UMA_HORA) as Instant,
    timeZone: 'America/Sao_Paulo',
    publicacao: 'published',
    dataLocal: '2026-09-23',
    visibilidade: 'public',
    entrada: { tipo: 'free' },
    portesAceitos: ['P', 'M', 'G', 'GG'],
    idadeDosCaes: 'any',
    vacinacaoExigida: true,
    areaCercada: false,
    estrutura: [],
    paraLevar: [],
    observacoes: null,
    endereco: null,
    linkDeIngresso: null,
    instagram: null,
    instagramUrl: null,
    imagens: [],
    ...ajustes,
  };
}

void describe('o rotulo do encontro, e as bordas dele', () => {
  void it('antes do comeco e `upcoming`', () => {
    assert.equal(statusDoEncontro(encontro(), AGORA), 'upcoming');
  });

  void it('EXATAMENTE no comeco ja e `happening`, e nao `upcoming`', () => {
    const agora = AGORA;
    const marcado = encontro({ startsAt: agora, endsAt: (agora + UMA_HORA) as Instant });
    assert.equal(statusDoEncontro(marcado, agora), 'happening');
  });

  void it('entre o comeco e o fim e `happening`', () => {
    const emCurso = encontro({
      startsAt: (AGORA - UMA_HORA) as Instant,
      endsAt: (AGORA + UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(emCurso, AGORA), 'happening');
  });

  void it('EXATAMENTE no fim ainda e `happening`', () => {
    const agora = AGORA;
    const terminando = encontro({ startsAt: (agora - UMA_HORA) as Instant, endsAt: agora });
    assert.equal(statusDoEncontro(terminando, agora), 'happening');
  });

  void it('um milissegundo depois do fim e `ended`', () => {
    const acabado = encontro({
      startsAt: (AGORA - 3 * UMA_HORA) as Instant,
      endsAt: (AGORA - 1) as Instant,
    });
    assert.equal(statusDoEncontro(acabado, AGORA), 'ended');
  });

  void it('tres semanas atras e `ended`', () => {
    const antigo = encontro({
      startsAt: (AGORA - 21 * 24 * UMA_HORA) as Instant,
      endsAt: (AGORA - 21 * 24 * UMA_HORA + 2 * UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(antigo, AGORA), 'ended');
  });

  void it('A ISCA NEGATIVA: um encontro de amanha NAO e `ended`', () => {
    const amanha = encontro({
      startsAt: (AGORA + 24 * UMA_HORA) as Instant,
      endsAt: (AGORA + 26 * UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(amanha, AGORA), 'upcoming');
  });
});

void describe('o encontro SEM fim declarado', () => {
  void it('antes do comeco continua `upcoming`', () => {
    const semFim = encontro({ startsAt: (AGORA + UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(semFim, AGORA), 'upcoming');
  });

  void it('EXATAMENTE no comeco ja e `ended`, e NUNCA `happening`', () => {
    const agora = AGORA;
    const semFim = encontro({ startsAt: agora, endsAt: null });
    assert.equal(statusDoEncontro(semFim, agora), 'ended');
  });

  void it('depois do comeco e `ended`', () => {
    const semFim = encontro({ startsAt: (AGORA - UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(semFim, AGORA), 'ended');
  });
});

void describe('o encontro CANCELADO (ADR-0027 12.6, decisao do cliente de 23/09)', () => {
  void it('antes do comeco e `cancelled`, e nao `upcoming`', () => {
    assert.equal(statusDoEncontro(encontro({ publicacao: 'cancelled' }), AGORA), 'cancelled');
  });

  void it('durante a janela prevista e `cancelled`, e nao `happening`', () => {
    const naJanela = encontro({
      publicacao: 'cancelled',
      startsAt: (AGORA - UMA_HORA) as Instant,
      endsAt: (AGORA + UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(naJanela, AGORA), 'cancelled');
  });

  void it('EXATAMENTE no fim previsto ainda e `cancelled`', () => {
    const noFim = encontro({
      publicacao: 'cancelled',
      startsAt: (AGORA - UMA_HORA) as Instant,
      endsAt: AGORA,
    });
    assert.equal(statusDoEncontro(noFim, AGORA), 'cancelled');
  });

  void it('DEPOIS do fim segue a regra do encerrado: `ended`', () => {
    const passado = encontro({
      publicacao: 'cancelled',
      startsAt: (AGORA - 3 * UMA_HORA) as Instant,
      endsAt: (AGORA - 1) as Instant,
    });
    assert.equal(statusDoEncontro(passado, AGORA), 'ended');
  });

  void it('ISCA (regra antiga): sem fim declarado, o cancelado NAO vira `ended` no comeco', () => {
    const noComeco = encontro({ publicacao: 'cancelled', startsAt: AGORA, endsAt: null });
    assert.equal(statusDoEncontro(noComeco, AGORA), 'cancelled');
    const horasDepois = encontro({ publicacao: 'cancelled', startsAt: (AGORA - 5 * UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(horasDepois, AGORA), 'cancelled');
  });

  void it('sem fim declarado, e `cancelled` ate 23:59:59 do dia no fuso do encontro, e `ended` depois', () => {
    const fim = Date.UTC(2026, 8, 24, 2, 59, 59) as Instant;
    assert.equal(fimDoDiaLocal('2026-09-23', 'America/Sao_Paulo'), fim);
    const semFim = encontro({ publicacao: 'cancelled', startsAt: (AGORA - UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(semFim, fim), 'cancelled');
    assert.equal(statusDoEncontro(semFim, (fim + 1000) as Instant), 'ended');
    assert.equal(fimDoDiaLocal('2026-09-23', 'America/Manaus'), (fim + UMA_HORA) as Instant);
  });

  void it('o publicado sem fim continua `ended` a partir do comeco (a regra nova e so do cancelado)', () => {
    const publicado = encontro({ startsAt: (AGORA - UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(publicado, AGORA), 'ended');
  });

  void it('A ISCA NEGATIVA: o PUBLICADO de amanha continua `upcoming`', () => {
    assert.equal(statusDoEncontro(encontro({ publicacao: 'published' }), AGORA), 'upcoming');
  });
});

void describe('a projecao do encontro', () => {
  void it('devolve o lugar em tres rotulos, e nenhuma coordenada', () => {
    const projetado = (projetarEncontro(encontro(), AGORA) as EncontroPublicoProjetado);
    assert.deepEqual(projetado.place, {
      place_name: 'Praça Benedito Calixto',
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
    });
    const bruto = JSON.stringify(projetado);
    for (const proibido of ['"lat"', '"lon"', '"point"', '"geo"', 'distance_m']) {
      assert.equal(
        bruto.includes(proibido),
        false,
        `ISCA: ${proibido} no corpo publico. O ponto so sai em getNetworkEventLocation, com conta.`,
      );
    }
  });

  void it('as chaves do corpo publico sao EXATAMENTE as de `NetworkEventPublic`', () => {
    assert.deepEqual(Object.keys(projetarEncontro(encontro(), AGORA)).sort(), [
      'accepted_sizes',
      'admission',
      'amenities',
      'bring_items',
      'cover_banner_url',
      'cover_image_url',
      'dog_age',
      'ends_at',
      'fenced_off_leash_area',
      'images',
      'instagram_handle',
      'instagram_url',
      'notes',
      'origin',
      'place',
      'slug',
      'starts_at',
      'status',
      'summary',
      'ticket_url',
      'time_zone',
      'title',
      'vaccination_required',
      'visibility',
    ]);
  });

  void it('pago sai com valor, moeda e unidade; gratuito sai com `price` nulo', () => {
    const pago = projetarEncontro(
      encontro({ entrada: { tipo: 'paid', centavos: 1500, moeda: 'BRL', unidade: 'per_dog' } }),
      AGORA,
    ) as EncontroPublicoProjetado;
    assert.deepEqual(pago.admission, {
      kind: 'paid',
      price: { amount: 1500, currency: 'BRL', unit: 'per_dog' },
    });
    const gratis = projetarEncontro(encontro(), AGORA) as EncontroPublicoProjetado;
    assert.deepEqual(gratis.admission, { kind: 'free', price: null });
  });

  void it('`cover_image_url` e a URL da imagem de posicao 0, derivada', () => {
    const comImagem = projetarEncontro(
      encontro({
        imagens: [
          {
            url: 'https://midia.exemplo.invalid/a.jpg',
            urlDaMiniatura: 'https://midia.exemplo.invalid/a-thumb.jpg',
            urlDoBanner: 'https://midia.exemplo.invalid/a-banner.jpg',
            textoAlternativo: 'A roda na sombra',
          },
          {
            url: 'https://midia.exemplo.invalid/b.jpg',
            urlDaMiniatura: 'https://midia.exemplo.invalid/b-thumb.jpg',
            urlDoBanner: 'https://midia.exemplo.invalid/b-banner.jpg',
            textoAlternativo: 'O bebedouro',
          },
        ],
      }),
      AGORA,
    ) as EncontroPublicoProjetado;
    assert.equal(comImagem.cover_image_url, 'https://midia.exemplo.invalid/a.jpg');
    assert.equal(comImagem.images.length, 2);
    const semImagem = projetarEncontro(encontro(), AGORA) as EncontroPublicoProjetado;
    assert.equal(semImagem.cover_image_url, null);
  });

  void it('leva o fuso junto da data, e os dois sao campos distintos', () => {
    const projetado = projetarEncontro(
      encontro({ startsAt: Date.UTC(2026, 8, 27, 12, 0, 0) as Instant, endsAt: null }),
      AGORA,
    ) as EncontroPublicoProjetado;
    assert.equal(projetado.starts_at, '2026-09-27T12:00:00.000Z');
    assert.equal(projetado.ends_at, null);
    assert.equal(projetado.time_zone, 'America/Sao_Paulo');
  });

  void it('NAO devolve UUID nem campo com pessoas', () => {
    const bruto = JSON.stringify(projetarEncontro(encontro(), AGORA)).toLowerCase();
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bruto), false);
    for (const proibido of ['user_id', 'checkin', 'attendee', 'display_name', 'avatar', 'pet_']) {
      assert.equal(bruto.includes(proibido), false, `"${proibido}" no corpo da Rede.`);
    }
  });

  void it('o cancelado sai com `status` `cancelled` na projecao', () => {
    assert.equal(projetarEncontro(encontro({ publicacao: 'cancelled' }), AGORA).status, 'cancelled');
  });
});

void describe('a projecao do ponto (getNetworkEventLocation)', () => {
  void it('com ponto, devolve `{ point: { lat, lon } }` e mais nada', () => {
    const projetado = projetarLocalizacao({ lat: -23.5617, lon: -46.6823 });
    assert.deepEqual(projetado, { point: { lat: -23.5617, lon: -46.6823 }, street_address: null });
  });

  void it('sem ponto marcado, `point` e nulo -- estado normal, e nao erro', () => {
    assert.deepEqual(projetarLocalizacao(null), { point: null, street_address: null });
  });

  void it('campo a campo: o que vier a mais no ponto nao atravessa', () => {
    const comSobra = { lat: -23.5, lon: -46.6, origem: 'map_pin', autor: 'x' };
    assert.deepEqual(Object.keys(projetarLocalizacao(comSobra).point ?? {}).sort(), ['lat', 'lon']);
  });
});

/** Um privado com TODO campo oculto preenchido por sentinela. */
function privadoComSentinelas(): EncontroDaRede {
  return encontro({
    slug: 'p-q8w3n5z1ty',
    title: 'Encontro fechado',
    visibilidade: 'private',
    placeName: 'ISCA-LUGAR',
    neighborhood: 'ISCA-BAIRRO',
    city: 'ISCA-CIDADE',
    state: 'ZZ',
    summary: 'ISCA-RESUMO',
    timeZone: 'America/Porto_Velho',
    entrada: { tipo: 'paid', centavos: 987654, moeda: 'BRL', unidade: 'per_pair' },
    portesAceitos: ['P', 'M', 'G', 'GG'],
    estrutura: ['shade'],
    paraLevar: ['towel'],
    observacoes: 'ISCA-NOTA',
    imagens: [
      {
        url: 'https://midia.exemplo.invalid/ISCA-CHAVE.jpg',
        urlDaMiniatura: 'https://midia.exemplo.invalid/ISCA-CHAVE-thumb.jpg',
        urlDoBanner: 'https://midia.exemplo.invalid/ISCA-CHAVE-banner.jpg',
        textoAlternativo: 'ISCA-ALT',
      },
    ],
  });
}

const SENTINELAS = [
  'ISCA-LUGAR',
  'ISCA-BAIRRO',
  'ISCA-CIDADE',
  'ISCA-RESUMO',
  'ISCA-NOTA',
  'ISCA-ALT',
  'ISCA-CHAVE',
  '987654',
  'Porto_Velho',
  'towel',
  'shade',
];

void describe('o endereco do encontro (01/10): so em location, com conta', () => {
  const ENDERECO = 'Rua ISCA-ENDERECO, 1234 - Pinheiros, 05416-001';
  const publico = encontro({ endereco: ENDERECO });
  const privado = { ...privadoComSentinelas(), endereco: ENDERECO };

  void it('a regra de hoje e `so_com_conta`', () => {
    assert.equal(REGRA_DO_ENDERECO, 'so_com_conta');
  });

  void it('ISCA -- o endereco NAO sai na agenda, no detalhe publico, no teaser nem nos detalhes do privado', () => {
    for (const [onde, corpo] of [
      ['publico', projetarEncontro(publico, AGORA)],
      ['teaser', projetarEncontro(privado, AGORA)],
      ['detalhes do privado', projetarDetalhesPrivados(privado, AGORA)],
    ] as const) {
      const bruto = JSON.stringify(corpo);
      assert.equal(bruto.includes('ISCA-ENDERECO'), false, `endereco em ${onde}`);
      assert.equal(bruto.includes('street_address'), false, `chave street_address em ${onde}`);
    }
  });

  void it('location leva o endereco junto do ponto, e com ponto nulo tambem', () => {
    assert.deepEqual(projetarLocalizacao(null, ENDERECO), { point: null, street_address: ENDERECO });
  });

  void it('a troca da regra e num ponto so: com `publico`, a leitura aberta passa a levar o endereco', () => {
    assert.deepEqual(enderecoNaLeituraAberta(ENDERECO, 'publico'), { street_address: ENDERECO });
    assert.deepEqual(enderecoNaLeituraAberta(ENDERECO, 'so_com_conta'), {});
  });
});

void describe('links do encontro (01/10): publicos na agenda e no detalhe, fora do teaser', () => {
  const comLinks = {
    linkDeIngresso: 'https://ingressos.exemplo.br/evento/1',
    instagram: 'bichu.app',
    instagramUrl: 'https://perfil.exemplo.test/bichu.app/',
  };

  void it('o publico e os detalhes do privado levam ticket_url, instagram_handle e instagram_url', () => {
    const publico = projetarEncontro(encontro(comLinks), AGORA) as unknown as Record<string, unknown>;
    assert.equal(publico['ticket_url'], 'https://ingressos.exemplo.br/evento/1');
    assert.equal(publico['instagram_handle'], 'bichu.app');
    assert.equal(publico['instagram_url'], 'https://perfil.exemplo.test/bichu.app/');
    const detalhes = projetarDetalhesPrivados(encontro({ ...comLinks, visibilidade: 'private' }), AGORA) as unknown as Record<string, unknown>;
    assert.equal(detalhes['ticket_url'], 'https://ingressos.exemplo.br/evento/1');
  });

  void it('ISCA: o teaser do privado continua sem link (P19)', () => {
    const bruto = JSON.stringify(projetarEncontro(encontro({ ...comLinks, visibilidade: 'private' }), AGORA));
    assert.ok(!bruto.includes('exemplo') && !bruto.includes('instagram'), bruto);
  });

  void it('sem link, os tres saem nulos', () => {
    const publico = projetarEncontro(encontro(), AGORA) as unknown as Record<string, unknown>;
    assert.deepEqual([publico['ticket_url'], publico['instagram_handle'], publico['instagram_url']], [null, null, null]);
  });
});

void describe('o encontro PRIVADO na leitura publica (ADR-0027 12.10)', () => {
  void it('sai como teaser, com EXATAMENTE cinco propriedades', () => {
    assert.deepEqual(Object.keys(projetarEncontro(privadoComSentinelas(), AGORA)).sort(), [
      'local_date',
      'slug',
      'status',
      'title',
      'visibility',
    ]);
  });

  void it('ISCA -- nenhuma sentinela do lado oculto aparece no teaser', () => {
    const bruto = JSON.stringify(projetarEncontro(privadoComSentinelas(), AGORA));
    for (const sentinela of SENTINELAS) {
      assert.equal(bruto.includes(sentinela), false, `${sentinela} no teaser do privado`);
    }
  });

  void it('controle positivo: os detalhes privados trazem TODAS as sentinelas', () => {
    const bruto = JSON.stringify(projetarDetalhesPrivados(privadoComSentinelas(), AGORA));
    for (const sentinela of SENTINELAS) {
      assert.equal(bruto.includes(sentinela), true, `${sentinela} faltou nos detalhes do aprovado`);
    }
  });

  void it('o teaser leva a data local, e nao o instante nem o fuso', () => {
    const teaser = projetarEncontro(privadoComSentinelas(), AGORA) as unknown as Record<string, unknown>;
    assert.equal(teaser['local_date'], '2026-09-23');
    assert.equal(teaser['starts_at'], undefined);
    assert.equal(teaser['time_zone'], undefined);
  });
});

void describe('o estado do pedido que o app ve (ADR-0027 12.11)', () => {
  const porVir = encontro();
  const passado = encontro({
    startsAt: (AGORA - 3 * UMA_HORA) as Instant,
    endsAt: (AGORA - UMA_HORA) as Instant,
  });

  void it('ISCA -- recusado e pendente dao o MESMO estado, antes e depois do fim', () => {
    assert.equal(estadoDoPedidoNoApp('declined', porVir, AGORA), 'requested');
    assert.equal(estadoDoPedidoNoApp('pending', porVir, AGORA), 'requested');
    assert.equal(estadoDoPedidoNoApp('declined', passado, AGORA), 'expired');
    assert.equal(estadoDoPedidoNoApp('pending', passado, AGORA), 'expired');
  });

  void it('aprovado e aprovado, inclusive depois do fim', () => {
    assert.equal(estadoDoPedidoNoApp('approved', porVir, AGORA), 'approved');
    assert.equal(estadoDoPedidoNoApp('approved', passado, AGORA), 'approved');
  });
});

void describe('a distancia da agenda por distancia', () => {
  void it('arredonda a 100 m, e nula continua nula', () => {
    assert.equal(distanciaArredondada(1249), 1200);
    assert.equal(distanciaArredondada(1250), 1300);
    assert.equal(distanciaArredondada(null), null);
  });
});

/**
 * `WEB_BASE_URL` do teste, **com barra no fim de proposito**: o montador tem de
 * apara-la, e uma base limpa nunca mostraria `//encontro/`.
 */
const BASE_DA_WEB = 'https://site.exemplo.invalid/' as AbsoluteUrl;
const PAGINA_ACESA = { baseDaWeb: BASE_DA_WEB, publicada: true };
const PAGINA_APAGADA = { baseDaWeb: BASE_DA_WEB, publicada: false };
const ENDERECO_ESPERADO = 'https://site.exemplo.invalid/encontro/encontro-de-domingo-na-benedito';

void describe('o link da pagina publica do encontro (cliente, 21/10/2026)', () => {
  void it('CONTROLE POSITIVO -- com a pagina acesa, o encontro publico futuro TEM link', () => {
    assert.equal(linkPublicoDoEncontro(encontro(), AGORA, PAGINA_ACESA), ENDERECO_ESPERADO);
  });

  void it('a barra do fim da base e aparada, e nao duplicada', () => {
    const link = linkPublicoDoEncontro(encontro(), AGORA, PAGINA_ACESA);
    assert.ok(
      link !== null && !link.includes('//encontro/'),
      `REPROVA: duas barras no endereco (${String(link)}). \`WEB_BASE_URL\` com barra no ` +
        'fim e configuracao legitima, e o link quebrado so apareceria em producao.',
    );
  });

  void it('`happening` TEM link: convidar para o que esta acontecendo agora e o melhor momento', () => {
    const agora = encontro({
      startsAt: (AGORA - UMA_HORA) as Instant,
      endsAt: (AGORA + UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(agora, AGORA), 'happening');
    assert.equal(linkPublicoDoEncontro(agora, AGORA, PAGINA_ACESA), ENDERECO_ESPERADO);
  });

  void it('ISCA -- interruptor APAGADO nao da link', () => {
    assert.equal(
      linkPublicoDoEncontro(encontro(), AGORA, PAGINA_APAGADA),
      null,
      'REPROVA: o endereco saiu com `site_page_availability` dizendo que a pagina nao ' +
        'esta publicada. O produto acabou de por um link morto num grupo de bairro, e ' +
        'aquela mensagem nao se desfaz com um `UPDATE`.',
    );
  });

  void it('ISCA -- pagina NAO PASSADA nao da link (e o caso da agenda)', () => {
    assert.equal(
      linkPublicoDoEncontro(encontro(), AGORA, undefined),
      null,
      'REPROVA: `share_url` passou a sair onde ninguem pediu a pagina. A agenda e a ' +
        'busca por distancia chamam a projecao sem ela de proposito.',
    );
  });

  void it('ISCA DE VAZAMENTO -- encontro PRIVADO nao ganha pagina publica, nem com a pagina acesa', () => {
    assert.equal(
      linkPublicoDoEncontro(encontro({ visibilidade: 'private' }), AGORA, PAGINA_ACESA),
      null,
      'REPROVA: um encontro PRIVADO ganhou endereco publico. Ele sai como teaser para ' +
        'qualquer chamador (ADR-0027 12.10) e nao tem pagina: um link para ele ' +
        'entregaria a estranhos o encontro que o produto esconde deles.',
    );
  });

  void it('ISCA -- encontro CANCELADO nao ganha link', () => {
    assert.equal(
      linkPublicoDoEncontro(encontro({ publicacao: 'cancelled' }), AGORA, PAGINA_ACESA),
      null,
      'REPROVA: o link convidou gente para um encontro CANCELADO. Quem abre nao tem ' +
        'conta, nao tem a agenda e nao tem como descobrir sozinho que aquilo nao vai ' +
        'acontecer -- ele vai ao lugar na hora marcada e nao encontra ninguem.',
    );
  });

  void it('ISCA -- encontro ENCERRADO nao ganha link', () => {
    const acabou = encontro({
      startsAt: (AGORA - 5 * UMA_HORA) as Instant,
      endsAt: (AGORA - 2 * UMA_HORA) as Instant,
    });
    assert.equal(statusDoEncontro(acabou, AGORA), 'ended');
    assert.equal(
      linkPublicoDoEncontro(acabou, AGORA, PAGINA_ACESA),
      null,
      'REPROVA: o link de um encontro que JA TERMINOU continua ativo.',
    );
  });

  void it('a projecao publica leva `share_url` com a pagina acesa', () => {
    const projetado = projetarEncontro(encontro(), AGORA, PAGINA_ACESA) as EncontroPublicoProjetado;
    assert.equal(projetado.share_url, ENDERECO_ESPERADO);
  });

  void it('ISCA -- a projecao OMITE a chave (e nao manda `undefined`) com a pagina apagada', () => {
    const projetado = projetarEncontro(encontro(), AGORA, PAGINA_APAGADA);
    assert.ok(
      !Object.keys(projetado).includes('share_url'),
      'REPROVA: a chave `share_url` foi para o objeto com valor `undefined`. ' +
        '`JSON.stringify` a omitiria, mas o teste de lista permitida varre ' +
        '`Object.keys`, e uma chave fantasma ali e um achado falso eterno.',
    );
  });

  void it('ISCA -- o teaser do privado nao ganha a chave em hipotese nenhuma', () => {
    const projetado = projetarEncontro(encontro({ visibilidade: 'private' }), AGORA, PAGINA_ACESA);
    assert.deepEqual(
      Object.keys(projetado).sort(),
      ['local_date', 'slug', 'status', 'title', 'visibility'],
      'REPROVA: o teaser do privado mudou de forma ao receber a pagina. Ele e ' +
        'construido com cinco propriedades e nao deriva da projecao publica ' +
        'justamente para que campo novo nao chegue nele.',
    );
  });

  void it('ISCA -- o link NAO carrega logradouro nem coordenada, nem com endereco gravado', () => {
    const comEndereco = encontro({ endereco: 'R. Teodoro Sampaio, 1020' });
    const link = linkPublicoDoEncontro(comEndereco, AGORA, PAGINA_ACESA);
    assert.equal(link, ENDERECO_ESPERADO);
    assert.ok(
      link !== null && !link.includes('Teodoro') && !link.includes('1020'),
      'REPROVA: o endereco por extenso entrou no ENDERECO da pagina publica.',
    );
  });
});
