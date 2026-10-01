/**
 * O rotulo `status`, a projecao do encontro e a do ponto, sem banco e sem
 * servidor.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a suite rodou e reprovou com
 * o nome do caso na saida, e o arquivo foi restaurado. As linhas marcadas
 * "23/09, emenda" foram medidas na emenda da BICHUS-251 (ADR-0027 12), Node 22
 * (`/opt/homebrew/opt/node@22`); as outras vem da primeira versao.
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `agora < startsAt` virando `<=` (a borda de abertura) | 1 |
 * | `agora <= endsAt` virando `<` (a borda de fechamento) | 1 |
 * | sem `endsAt`, devolver `happening` em vez de `ended` | 2 |
 * | `statusDoEncontro` devolvendo `ended` SEMPRE (a isca negativa) | 3 |
 * | 23/09, emenda: o cancelado ignorado (sempre temporal) | 5 |
 * | 23/09, emenda: o cancelado sempre `cancelled`, mesmo depois do fim | 2 |
 * | 28/09, fatia 2: o recusado separado do pendente (`declined` vira `expired`) | 2, com o de rota |
 * | 28/09, fatia 2: o privado sai inteiro em vez de teaser | 4, com o de rota |
 *
 * **A isca negativa da quarta linha e obrigatoria.** Provar que um encontro de
 * tres semanas atras sai `ended` nao prova nada se o de amanha tambem sair.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  distanciaArredondada,
  estadoDoPedidoNoApp,
  projetarDetalhesPrivados,
  projetarEncontro,
  projetarLocalizacao,
  enderecoNaLeituraAberta,
  REGRA_DO_ENDERECO,
  fimDoDiaLocal,
  statusDoEncontro,
  type EncontroDaRede,
  type EncontroPublicoProjetado,
} from './encontro-da-rede.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Um instante fixo. Nada aqui depende do relogio de quem roda.
 *
 * E um `Instant` -- milissegundos --, e nao um `Date`, porque e isso que o
 * dominio recebe.
 */
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
    imagens: [],
    ...ajustes,
  };
}

void describe('o rotulo do encontro, e as bordas dele', () => {
  void it('antes do comeco e `upcoming`', () => {
    assert.equal(statusDoEncontro(encontro(), AGORA), 'upcoming');
  });

  void it('EXATAMENTE no comeco ja e `happening`, e nao `upcoming`', () => {
    // Quem abre a agenda na hora marcada precisa ler `Acontecendo agora`, e nao
    // a data de um encontro que comeca neste segundo. ISCA: com `<=` no lugar
    // de `<` na primeira comparacao, este caso devolve `upcoming`.
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
    // Do outro lado, pela mesma razao: o encontro que termina neste segundo
    // ainda esta acontecendo. ISCA: com `<` no lugar de `<=`, devolve `ended`.
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
    // Sem este caso, um servidor que devolvesse `ended` para tudo passaria em
    // todos os casos acima. Provar que o passado e rotulado como passado nao
    // prova nada se o futuro tambem for.
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
    // ADR-0025 secao 6: sem `ends_at` nao existe `happening`. A alternativa
    // seria inventar uma duracao padrao, que e o servidor afirmando
    // `Acontecendo agora` sobre um encontro que ele nao sabe se acabou.
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
    // O cancelado nao conta como agendado: quem se programou para ir precisa
    // ler "cancelado" antes de sair de casa.
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
    // A borda e a mesma do `happening`: o fim e fechado. Um cancelado nao pode
    // virar `ended` um instante antes do publicado equivalente.
    const noFim = encontro({
      publicacao: 'cancelled',
      startsAt: (AGORA - UMA_HORA) as Instant,
      endsAt: AGORA,
    });
    assert.equal(statusDoEncontro(noFim, AGORA), 'cancelled');
  });

  void it('DEPOIS do fim segue a regra do encerrado: `ended`', () => {
    // ISCA: com o cancelado sempre `cancelled`, este caso le `cancelled`. Um
    // encontro de ontem, cancelado ou nao, e passado.
    const passado = encontro({
      publicacao: 'cancelled',
      startsAt: (AGORA - 3 * UMA_HORA) as Instant,
      endsAt: (AGORA - 1) as Instant,
    });
    assert.equal(statusDoEncontro(passado, AGORA), 'ended');
  });

  void it('ISCA (regra antiga): sem fim declarado, o cancelado NAO vira `ended` no comeco', () => {
    // A regra ate 28/09 dava `ended` a partir do `startsAt`, e apagava o
    // "cancelado" no proprio dia do encontro. Este caso reprova essa regra.
    const noComeco = encontro({ publicacao: 'cancelled', startsAt: AGORA, endsAt: null });
    assert.equal(statusDoEncontro(noComeco, AGORA), 'cancelled');
    const horasDepois = encontro({ publicacao: 'cancelled', startsAt: (AGORA - 5 * UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(horasDepois, AGORA), 'cancelled');
  });

  void it('sem fim declarado, e `cancelled` ate 23:59:59 do dia no fuso do encontro, e `ended` depois', () => {
    // 23/09 em Sao Paulo (UTC-3): o dia acaba em 24/09 02:59:59Z.
    const fim = Date.UTC(2026, 8, 24, 2, 59, 59) as Instant;
    assert.equal(fimDoDiaLocal('2026-09-23', 'America/Sao_Paulo'), fim);
    const semFim = encontro({ publicacao: 'cancelled', startsAt: (AGORA - UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(semFim, fim), 'cancelled');
    assert.equal(statusDoEncontro(semFim, (fim + 1000) as Instant), 'ended');
    // O fuso e o do encontro: em Manaus (UTC-4) o mesmo dia acaba uma hora depois.
    assert.equal(fimDoDiaLocal('2026-09-23', 'America/Manaus'), (fim + UMA_HORA) as Instant);
  });

  void it('o publicado sem fim continua `ended` a partir do comeco (a regra nova e so do cancelado)', () => {
    const publicado = encontro({ startsAt: (AGORA - UMA_HORA) as Instant, endsAt: null });
    assert.equal(statusDoEncontro(publicado, AGORA), 'ended');
  });

  void it('A ISCA NEGATIVA: o PUBLICADO de amanha continua `upcoming`', () => {
    // Sem este caso, um dominio que rotulasse tudo `cancelled` passaria nos
    // casos acima.
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
    // Por campo A MAIS e que uma resposta se afasta do documento sem alarme.
    assert.deepEqual(Object.keys(projetarEncontro(encontro(), AGORA)).sort(), [
      'accepted_sizes',
      'admission',
      'amenities',
      'bring_items',
      'cover_image_url',
      'dog_age',
      'ends_at',
      'fenced_off_leash_area',
      'images',
      'notes',
      'place',
      'slug',
      'starts_at',
      'status',
      'summary',
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
          { url: 'https://midia.exemplo.invalid/a.jpg', textoAlternativo: 'A roda na sombra' },
          { url: 'https://midia.exemplo.invalid/b.jpg', textoAlternativo: 'O bebedouro' },
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
    imagens: [{ url: 'https://midia.exemplo.invalid/ISCA-CHAVE.jpg', textoAlternativo: 'ISCA-ALT' }],
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
    // Sem este caso, uma varredura que nao enxerga a sentinela aprovaria qualquer coisa.
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
