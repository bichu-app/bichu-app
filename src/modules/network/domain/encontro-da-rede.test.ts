/**
 * O rotulo `status` e a projecao do encontro, sem banco e sem servidor.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a mudanca foi conferida no
 * disco (`git diff --stat` nao vazio), a suite rodou e reprovou com o nome do
 * caso na saida, e o arquivo foi restaurado.
 * 23/09/2026, Node 22 (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `agora < startsAt` virando `<=` (a borda de abertura) | 1 |
 * | `agora <= endsAt` virando `<` (a borda de fechamento) | 1 |
 * | sem `endsAt`, devolver `happening` em vez de `ended` | 2 |
 * | `statusDoEncontro` devolvendo `ended` SEMPRE (a isca negativa) | 3 |
 * | `projetarFoto` trocado por `{ ...foto }` | 1 |
 *
 * **A isca negativa da quarta linha e obrigatoria.** Provar que um encontro de
 * tres semanas atras sai `ended` nao prova nada se o de amanha tambem sair.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  projetarEncontro,
  projetarEncontroComGaleria,
  projetarFoto,
  statusDoEncontro,
  type EncontroDaRede,
} from './encontro-da-rede.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Um instante fixo. Nada aqui depende do relogio de quem roda.
 *
 * E um `Instant` -- milissegundos --, e nao um `Date`, porque e isso que o
 * dominio recebe. `Date.UTC` e aritmetica de calendario e nao leitura de
 * relogio, e o `Clock` continua sendo o unico caminho do tempo real.
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
    checkinCount: 12,
    photoCount: 3,
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
    // ADR-0024 secao 6: sem `ends_at` nao existe `happening`. A alternativa
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

void describe('a projecao do encontro', () => {
  void it('devolve o lugar em tres rotulos, e nenhuma coordenada', () => {
    const projetado = projetarEncontro(encontro(), AGORA);
    assert.deepEqual(projetado.place, {
      place_name: 'Praça Benedito Calixto',
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
    });
    const chaves = Object.keys(projetado.place);
    assert.equal(chaves.includes('lat'), false);
    assert.equal(chaves.includes('lon'), false);
    assert.equal(chaves.includes('distance_m'), false);
  });

  void it('leva o fuso junto da data, e os dois sao campos distintos', () => {
    // `starts_at` sozinho diz o instante e nao diz que horas o cartaz da praca
    // dizia. Um aparelho em UTC renderizaria um encontro das 9h como 12h.
    const projetado = projetarEncontro(
      encontro({ startsAt: Date.UTC(2026, 8, 27, 12, 0, 0) as Instant, endsAt: null }),
      AGORA,
    );
    assert.equal(projetado.starts_at, '2026-09-27T12:00:00.000Z');
    assert.equal(projetado.ends_at, null);
    assert.equal(projetado.time_zone, 'America/Sao_Paulo');
  });

  void it('a presenca e um INTEIRO, e o corpo nao tem campo com pessoas', () => {
    // ADR-0024 secao 2. A varredura e sobre o JSON inteiro e nao campo a campo,
    // de proposito: uma conferencia que olha os campos que ela conhece nao
    // enxerga o campo que alguem acrescentar amanha.
    const projetado = projetarEncontro(encontro({ checkinCount: 12 }), AGORA);
    assert.equal(projetado.checkin_count, 12);
    const bruto = JSON.stringify(projetado);
    // Os nomes sao escritos por extenso, e nao derivados de constante nenhuma.
    // `place_name` existe e e legitimo, entao a lista nao tem o pedaco `name`
    // solto: ela tem as formas com que uma pessoa apareceria numa resposta.
    for (const proibido of [
      'user_id',
      'user_slug',
      'attendee',
      'attendees',
      'checkins',
      'checked_in_by',
      'display_name',
      'first_name',
      'avatar',
      'people',
    ]) {
      assert.equal(
        bruto.toLowerCase().includes(proibido),
        false,
        `ISCA: "${proibido}" no corpo reconstroi a lista de presenca que o ADR-0024 recusa.`,
      );
    }
  });

  void it('NAO devolve UUID em lugar nenhum do corpo', () => {
    const bruto = JSON.stringify(projetarEncontro(encontro(), AGORA));
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bruto),
      false,
      'O ADR-0010 item 6 nao admite identificador interno em saida, e o endereco ' +
        'de um encontro e o `slug`.',
    );
  });
});

void describe('a galeria', () => {
  void it('projeta TRES campos, e a lista deles e escrita por extenso', () => {
    const projetada = projetarFoto({
      slug: 'roda-de-cachorros-na-sombra',
      imageUrl: 'https://cdn.bichu.test/rede/roda-de-cachorros.jpg',
      caption: 'A roda das dez da manhã.',
    });
    assert.deepEqual(Object.keys(projetada).sort(), ['caption', 'image_url', 'slug']);
  });

  void it('a legenda nula sai nula, e isso e estado normal e nao lacuna', () => {
    const projetada = projetarFoto({
      slug: 'chegada-do-pessoal',
      imageUrl: 'https://cdn.bichu.test/rede/chegada.jpg',
      caption: null,
    });
    assert.equal(projetada.caption, null);
  });

  void it('quem enviou a foto NAO atravessa a projecao, nem por campo extra', () => {
    // ISCA: com `{ ...foto }` no lugar da escrita campo a campo, qualquer campo
    // que a linha ganhe depois sai junto -- e o campo que a linha tem hoje e
    // que nao pode sair e justamente o de quem enviou. O objeto abaixo carrega
    // um campo a mais de proposito, com nome que nao e o da coluna.
    const comSobra = {
      slug: 'fim-de-tarde',
      imageUrl: 'https://cdn.bichu.test/rede/fim-de-tarde.jpg',
      caption: null,
      quemEnviou: '018f3a2b-0000-7000-8000-0000000000aa',
    };
    const projetada = projetarFoto(comSobra);
    assert.deepEqual(Object.keys(projetada).sort(), ['caption', 'image_url', 'slug']);
    assert.equal(JSON.stringify(projetada).includes('018f3a2b'), false);
  });

  void it('o encontro com galeria leva `viewer_checked_in`, e nada sobre terceiro', () => {
    const projetado = projetarEncontroComGaleria(
      {
        ...encontro(),
        galeria: [
          {
            slug: 'roda-de-cachorros-na-sombra',
            imageUrl: 'https://cdn.bichu.test/rede/roda-de-cachorros.jpg',
            caption: 'A roda das dez da manhã.',
          },
        ],
        viewerCheckedIn: true,
      },
      AGORA,
    );
    assert.equal(projetado.viewer_checked_in, true);
    assert.equal(projetado.gallery.length, 1);
    assert.deepEqual(Object.keys(projetado.gallery[0] ?? {}).sort(), [
      'caption',
      'image_url',
      'slug',
    ]);
  });

  void it('quem chega sem conta recebe `viewer_checked_in` falso, com o mesmo corpo', () => {
    const comConta = projetarEncontroComGaleria(
      { ...encontro(), galeria: [], viewerCheckedIn: true },
      AGORA,
    );
    const semConta = projetarEncontroComGaleria(
      { ...encontro(), galeria: [], viewerCheckedIn: false },
      AGORA,
    );
    // ADR-0021: um corpo so, e esse corpo e o publico. `viewer_checked_in` e a
    // UNICA coisa que muda entre os dois -- ela nao destranca campo nenhum.
    assert.deepEqual(Object.keys(comConta).sort(), Object.keys(semConta).sort());
    assert.equal(semConta.viewer_checked_in, false);
  });
});
