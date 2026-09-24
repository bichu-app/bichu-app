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
 * | 23/09, emenda: o cancelado ignorado (sempre temporal) | 3 |
 * | 23/09, emenda: o cancelado sempre `cancelled`, mesmo depois do fim | 2 |
 *
 * **A isca negativa da quarta linha e obrigatoria.** Provar que um encontro de
 * tres semanas atras sai `ended` nao prova nada se o de amanha tambem sair.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  projetarEncontro,
  projetarLocalizacao,
  statusDoEncontro,
  type EncontroDaRede,
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
    coverImageUrl: null,
    publicacao: 'published',
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

  void it('sem fim declarado, e `cancelled` ate o comeco e `ended` a partir dele', () => {
    // Sem `ends_at` o "fim previsto" e o comeco, pela mesma regra que decide
    // `ended` no publicado (ADR-0025 secao 6).
    const antes = encontro({ publicacao: 'cancelled', endsAt: null });
    assert.equal(statusDoEncontro(antes, AGORA), 'cancelled');
    const noComeco = encontro({ publicacao: 'cancelled', startsAt: AGORA, endsAt: null });
    assert.equal(statusDoEncontro(noComeco, AGORA), 'ended');
  });

  void it('A ISCA NEGATIVA: o PUBLICADO de amanha continua `upcoming`', () => {
    // Sem este caso, um dominio que rotulasse tudo `cancelled` passaria nos
    // casos acima.
    assert.equal(statusDoEncontro(encontro({ publicacao: 'published' }), AGORA), 'upcoming');
  });
});

void describe('a projecao do encontro', () => {
  void it('devolve o lugar em tres rotulos, e nenhuma coordenada', () => {
    const projetado = projetarEncontro(encontro(), AGORA);
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

  void it('as chaves do corpo sao EXATAMENTE as do contrato, escritas por extenso', () => {
    // Por campo A MAIS e que uma resposta se afasta do documento sem alarme: o
    // comparador de contrato so reprova o que some. Esta lista e a de
    // `NetworkEventSummary` depois da emenda, sem contagem, galeria nem sinal
    // de quem chama.
    assert.deepEqual(Object.keys(projetarEncontro(encontro(), AGORA)).sort(), [
      'cover_image_url',
      'ends_at',
      'place',
      'slug',
      'starts_at',
      'status',
      'summary',
      'time_zone',
      'title',
    ]);
  });

  void it('leva o fuso junto da data, e os dois sao campos distintos', () => {
    const projetado = projetarEncontro(
      encontro({ startsAt: Date.UTC(2026, 8, 27, 12, 0, 0) as Instant, endsAt: null }),
      AGORA,
    );
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
    assert.deepEqual(projetado, { point: { lat: -23.5617, lon: -46.6823 } });
  });

  void it('sem ponto marcado, `point` e nulo -- estado normal, e nao erro', () => {
    assert.deepEqual(projetarLocalizacao(null), { point: null });
  });

  void it('campo a campo: o que vier a mais no ponto nao atravessa', () => {
    const comSobra = { lat: -23.5, lon: -46.6, origem: 'map_pin', autor: 'x' };
    assert.deepEqual(Object.keys(projetarLocalizacao(comSobra).point ?? {}).sort(), ['lat', 'lon']);
  });
});
