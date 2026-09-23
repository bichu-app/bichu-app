/**
 * As regras que a massa da `Rede` precisa respeitar, afirmadas sem subir banco.
 *
 * ## Por que este arquivo existe, e o que ele ja evitou
 *
 * Na `Loja` a massa foi escrita e inserida num Postgres de verdade antes do
 * teste equivalente existir, e o `CHECK` `store_items_resumo_tem_tamanho`
 * **reprovou**: o resumo do "caso feio" tinha 183 caracteres contra um teto de
 * 180. Isso ia chegar ao `make seed` de quem fosse rodar depois, com a massa
 * parcialmente gravada.
 *
 * As afirmacoes abaixo sao as mesmas dos `CHECK` da migracao `20260923000001`,
 * escritas aqui para reprovarem em SEGUNDOS e sem Postgres. Elas **nao
 * substituem o banco** -- o banco continua sendo a autoridade, e o gatilho
 * `network_events_fuso_existe` conhece um catalogo de fusos que o Node nao tem
 * -- mas mudam o momento em que se descobre.
 *
 * ## Os tetos estao COPIADOS, e nao importados
 *
 * Mesma decisao de `massa-da-vitrine.test.ts`: duas copias divergem, e e a
 * divergencia que este arquivo existe para acusar. Importar o numero da
 * migracao seria comparar a massa com ela mesma.
 *
 * ## A segunda metade, e ela nao e sobre `CHECK`
 *
 * Os `CHECK` dizem o que o banco ACEITA. Eles nao dizem se a massa presta para
 * o que ela existe: ser OLHADA. Onze cartoes que passassem em todos os tetos e
 * fossem iguais entre si atenderiam o banco e nao mostrariam nada.
 *
 * Entao o segundo bloco afirma a VARIEDADE: que existe encontro sem capa, que
 * existe galeria vazia, que existe contagem zero, que existe um acontecendo
 * agora e um que ja passou, que ha mais de uma cidade para o filtro filtrar, e
 * que o caso feio continua feio. Cada uma dessas linhas e um caso de desenho
 * que someria em silencio se alguem "arrumasse" a massa.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ENCONTROS_VISIVEIS,
  FOTOS_DA_REDE,
  FUSOS_DA_REDE,
  MASSA_DA_REDE,
  PRESENCAS_DA_REDE,
  TUTORES_DA_REDE,
  dataCivilDoEncontro,
  momentoDoEncontro,
} from './massa-da-rede.js';

/** Copiado do `CHECK`, e nao importado. Ver o cabecalho. */
const FORMATO_DO_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
/** `network_events_uf_tem_duas_letras`. */
const FORMATO_DA_UF = /^[A-Z]{2}$/;
/** `network_events_fuso_tem_forma_iana`. O gatilho confere a EXISTENCIA. */
const FORMA_IANA = /^[A-Za-z]+\/[A-Za-z_]+$/;

const TETO_DO_TITULO = 120;
const TETO_DO_RESUMO = 180;
const TETO_DO_LUGAR = 80;
const TETO_DO_BAIRRO = 60;
const TETO_DA_CIDADE = 60;
const TETO_DA_LEGENDA = 140;

/** Um `hoje` fixo, para as contas deste arquivo nao dependerem do relogio. */
const HOJE = new Date('2026-09-23T15:30:00.000Z');

function comprimido(texto: string): number {
  return texto.trim().length;
}

function fotosDe(eventSlug: string): readonly { readonly slug: string }[] {
  return FOTOS_DA_REDE.filter((foto) => foto.eventSlug === eventSlug);
}

function presencasDe(eventSlug: string): number {
  return PRESENCAS_DA_REDE.filter((presenca) => presenca.eventSlug === eventSlug).length;
}

void describe('a massa da Rede cabe nos CHECK da migracao', () => {
  void it('todo slug de encontro e de foto tem o formato que o banco aceita', () => {
    for (const encontro of MASSA_DA_REDE) {
      assert.match(encontro.slug, FORMATO_DO_SLUG, `slug fora do formato: ${encontro.slug}`);
    }
    for (const foto of FOTOS_DA_REDE) {
      assert.match(foto.slug, FORMATO_DO_SLUG, `slug de foto fora do formato: ${foto.slug}`);
    }
  });

  void it('nenhum slug se repete, nem entre encontros nem entre fotos', () => {
    // `slug` e a chave primaria das duas tabelas: repetido, o `INSERT` estoura
    // no meio da massa, com parte dela gravada.
    const encontros = MASSA_DA_REDE.map((um) => um.slug);
    assert.equal(new Set(encontros).size, encontros.length, 'slug de encontro repetido');
    const fotos = FOTOS_DA_REDE.map((uma) => uma.slug);
    assert.equal(new Set(fotos).size, fotos.length, 'slug de foto repetido');
  });

  void it('ISCA -- o titulo cabe em 120 e o resumo em 180', () => {
    // Foi exatamente aqui que a `Loja` reprovou, contra um Postgres de verdade
    // e depois de a massa ja estar escrita.
    for (const encontro of MASSA_DA_REDE) {
      const titulo = comprimido(encontro.title);
      const resumo = comprimido(encontro.summary);
      assert.ok(
        titulo >= 2 && titulo <= TETO_DO_TITULO,
        `titulo de "${encontro.slug}" tem ${String(titulo)} caracteres, e o teto e ${String(TETO_DO_TITULO)}`,
      );
      assert.ok(
        resumo >= 2 && resumo <= TETO_DO_RESUMO,
        `resumo de "${encontro.slug}" tem ${String(resumo)} caracteres, e o teto e ${String(TETO_DO_RESUMO)}`,
      );
    }
  });

  void it('ISCA -- lugar cabe em 80, bairro e cidade em 60, e a UF tem duas maiusculas', () => {
    for (const encontro of MASSA_DA_REDE) {
      const lugar = comprimido(encontro.placeName);
      const bairro = comprimido(encontro.neighborhood);
      const cidade = comprimido(encontro.city);
      assert.ok(
        lugar >= 2 && lugar <= TETO_DO_LUGAR,
        `lugar de "${encontro.slug}" tem ${String(lugar)} caracteres, e o teto e ${String(TETO_DO_LUGAR)}`,
      );
      assert.ok(
        bairro >= 2 && bairro <= TETO_DO_BAIRRO,
        `bairro de "${encontro.slug}" tem ${String(bairro)} caracteres, e o teto e ${String(TETO_DO_BAIRRO)}`,
      );
      assert.ok(
        cidade >= 2 && cidade <= TETO_DA_CIDADE,
        `cidade de "${encontro.slug}" tem ${String(cidade)} caracteres, e o teto e ${String(TETO_DA_CIDADE)}`,
      );
      assert.match(encontro.state, FORMATO_DA_UF, `UF de "${encontro.slug}" nao tem duas maiusculas`);
    }
  });

  void it('ISCA -- a legenda cabe em 140, quando existe', () => {
    for (const foto of FOTOS_DA_REDE) {
      if (foto.caption === null) continue;
      const legenda = comprimido(foto.caption);
      assert.ok(
        legenda >= 2 && legenda <= TETO_DA_LEGENDA,
        `legenda de "${foto.slug}" tem ${String(legenda)} caracteres, e o teto e ${String(TETO_DA_LEGENDA)}`,
      );
    }
  });

  void it('toda imagem e toda capa sao https', () => {
    for (const encontro of MASSA_DA_REDE) {
      if (encontro.coverImageUrl === null) continue;
      assert.equal(
        new URL(encontro.coverImageUrl).protocol,
        'https:',
        `capa de "${encontro.slug}" nao e https`,
      );
    }
    for (const foto of FOTOS_DA_REDE) {
      assert.equal(new URL(foto.imageUrl).protocol, 'https:', `foto "${foto.slug}" nao e https`);
    }
  });

  void it('todo fuso tem forma IANA, esta na lista declarada, e o Node o conhece', () => {
    // O `CHECK` confere o FORMATO e o gatilho confere a EXISTENCIA, consultando
    // `pg_timezone_names`. Aqui nao ha aquele catalogo, entao a melhor prova
    // barata e o catalogo do proprio Node: `America/Sao_Pualo` passa na forma e
    // reprova aqui, que e exatamente o erro de digitacao que renderiza a hora
    // errada para sempre sem nada acusar.
    for (const encontro of MASSA_DA_REDE) {
      assert.match(encontro.timeZone, FORMA_IANA, `fuso de "${encontro.slug}" nao tem forma IANA`);
      assert.ok(
        (FUSOS_DA_REDE as readonly string[]).includes(encontro.timeZone),
        `fuso de "${encontro.slug}" fora da lista declarada em FUSOS_DA_REDE`,
      );
      assert.doesNotThrow(
        () => new Intl.DateTimeFormat('pt-BR', { timeZone: encontro.timeZone }),
        `fuso de "${encontro.slug}" nao existe no catalogo do Node`,
      );
    }
  });

  void it('ISCA -- o fim e sempre DEPOIS do comeco, e nunca igual', () => {
    // `network_events_fim_depois_do_comeco` e `>` e nao `>=`: duracao zero e um
    // encontro que termina antes de comecar a existir.
    for (const encontro of MASSA_DA_REDE) {
      const duracao = encontro.quando.duracaoEmMinutos;
      if (duracao === null) continue;
      assert.ok(
        duracao > 0,
        `"${encontro.slug}" tem duracao de ${String(duracao)} minutos, e o CHECK exige fim > comeco`,
      );
      const momento = momentoDoEncontro(encontro, HOJE);
      assert.ok(momento.fimLocal !== null, `"${encontro.slug}" tem duracao e nao produziu fim`);
      assert.ok(
        momento.fimLocal > momento.inicioLocal,
        `"${encontro.slug}" produziu fim "${momento.fimLocal}" que nao e maior que o comeco ` +
          `"${momento.inicioLocal}"`,
      );
    }
  });

  void it('encontro sem duracao declarada nao produz fim nenhum', () => {
    for (const encontro of MASSA_DA_REDE) {
      if (encontro.quando.duracaoEmMinutos !== null) continue;
      assert.equal(
        momentoDoEncontro(encontro, HOJE).fimLocal,
        null,
        `"${encontro.slug}" nao declara duracao e ainda assim produziu um fim`,
      );
    }
  });
});

void describe('a massa e integra: nada aponta para o que nao existe', () => {
  void it('toda foto pertence a um encontro da massa', () => {
    const encontros = new Set(MASSA_DA_REDE.map((um) => um.slug));
    for (const foto of FOTOS_DA_REDE) {
      assert.ok(
        encontros.has(foto.eventSlug),
        `foto "${foto.slug}" aponta para o encontro "${foto.eventSlug}", que a massa nao tem`,
      );
    }
  });

  void it('toda presenca e de um tutor e de um encontro da massa', () => {
    const encontros = new Set(MASSA_DA_REDE.map((um) => um.slug));
    const tutores = new Set(TUTORES_DA_REDE.map((um) => um.id));
    for (const presenca of PRESENCAS_DA_REDE) {
      assert.ok(
        encontros.has(presenca.eventSlug),
        `presenca num encontro que a massa nao tem: ${presenca.eventSlug}`,
      );
      assert.ok(
        tutores.has(presenca.tutorId),
        `presenca de um tutor que a massa nao tem: ${presenca.tutorId}`,
      );
    }
  });

  void it('ISCA -- ninguem confirma presenca duas vezes no mesmo encontro', () => {
    // A chave primaria de `network_event_checkins` e `(event_id, user_id)`. O
    // par repetido estoura o `INSERT` no meio da massa.
    const pares = PRESENCAS_DA_REDE.map((uma) => `${uma.eventSlug}|${uma.tutorId}`);
    const repetidos = pares.filter((par, indice) => pares.indexOf(par) !== indice);
    assert.deepEqual(repetidos, [], 'o mesmo tutor confirma presenca duas vezes no mesmo encontro');
  });

  void it('o e-mail de todo tutor e de dominio reservado, e nenhum se repete', () => {
    // `.invalid` e reservado por RFC 2606: a massa nao consegue mandar e-mail
    // para ninguem de verdade nem por engano.
    for (const tutor of TUTORES_DA_REDE) {
      assert.ok(
        tutor.email.endsWith('.invalid'),
        `o e-mail de "${tutor.displayName}" nao e de dominio reservado`,
      );
    }
    const emails = TUTORES_DA_REDE.map((um) => um.email);
    assert.equal(new Set(emails).size, emails.length, 'e-mail de tutor repetido');
    const ids = TUTORES_DA_REDE.map((um) => um.id);
    assert.equal(new Set(ids).size, ids.length, 'id de tutor repetido');
  });

  void it('NENHUMA foto da massa carrega quem a enviou, e isso e a decisao', () => {
    // A galeria desta fatia e CURADA (ADR-0025 decisao 4): exibida e nao
    // enviada. Foto curada nao tem remetente, e inventar um seria inventar um
    // envio que nao aconteceu.
    //
    // Quem prova que o campo nao SAI na resposta estando preenchido e a isca
    // `tests/integration/rede-nao-liga-dois-pets.test.ts`, que monta a propria
    // foto com remetente. Este caso guarda a outra metade: que a massa nao
    // adquira o campo de volta por conveniencia.
    const chaves = new Set(FOTOS_DA_REDE.flatMap((uma) => Object.keys(uma)));
    assert.deepEqual(
      [...chaves].sort(),
      ['caption', 'eventSlug', 'imageUrl', 'slug', 'sortOrder'],
      'o conjunto de campos de uma foto da massa mudou. Se apareceu quem enviou, '
        + 'a galeria curada passou a fingir um envio -- e o portao de colunas '
        + 'reprova o nome dessa coluna em qualquer lugar de `src/`.',
    );
  });
});

void describe('as datas sao calculadas, e a RELACAO entre elas e o que a massa preserva', () => {
  void it('a data civil anda com o `hoje` injetado, e nao com o relogio', () => {
    assert.equal(dataCivilDoEncontro(0, new Date('2026-09-23T23:59:59.000Z')), '2026-09-23');
    assert.equal(dataCivilDoEncontro(4, new Date('2026-09-23T00:00:00.000Z')), '2026-09-27');
    assert.equal(dataCivilDoEncontro(-9, new Date('2026-09-23T12:00:00.000Z')), '2026-09-14');
    // Virada de mes e de ano, que e onde a soma ingenua de dias erra.
    assert.equal(dataCivilDoEncontro(10, new Date('2026-12-27T12:00:00.000Z')), '2027-01-06');
  });

  void it('a hora de parede sai literal, e a zona de leitura e a do encontro', () => {
    // O instante NAO e montado aqui: a massa produz o texto da hora de parede e
    // o nome da zona, e o Postgres resolve com `::timestamp AT TIME ZONE`.
    // Fazer a conta em JavaScript seria reimplementar horario de verao.
    const benedito = MASSA_DA_REDE.find((um) => um.slug === 'benedito-calixto-de-manha');
    assert.ok(benedito);
    const momento = momentoDoEncontro(benedito, HOJE);
    assert.equal(momento.inicioLocal, '2026-09-27 09:00:00');
    assert.equal(momento.fimLocal, '2026-09-27 12:00:00');
    assert.equal(momento.zonaDeLeitura, 'America/Sao_Paulo');
  });

  void it('o encontro ancorado no instante e lido em UTC, e nao na zona do lugar', () => {
    // O texto ja E o instante absoluto. Le-lo na zona do encontro o deslocaria
    // de tres horas, e o encontro "acontecendo agora" deixaria de acontecer
    // agora -- que e a unica coisa que ele existe para fazer.
    const agora = MASSA_DA_REDE.find((um) => um.slug === 'agora-na-praca-da-liberdade');
    assert.ok(agora);
    const momento = momentoDoEncontro(agora, HOJE);
    assert.equal(momento.zonaDeLeitura, 'UTC');
    assert.equal(momento.inicioLocal, '2026-09-23 14:45:00');
    assert.equal(momento.fimLocal, '2026-09-23 17:45:00');
  });

  void it('nenhum deslocamento e literal: dois `hoje` diferentes dao dois instantes diferentes', () => {
    // Esta e a regra que impede a massa de virar passado sozinha. Com datas
    // literais a tela de QA passaria a mostrar so `Encerrado` nos onze cartoes,
    // sem ninguem ter mexido em nada.
    const outroDia = new Date('2026-11-05T15:30:00.000Z');
    for (const encontro of MASSA_DA_REDE) {
      assert.notEqual(
        momentoDoEncontro(encontro, HOJE).inicioLocal,
        momentoDoEncontro(encontro, outroDia).inicioLocal,
        `"${encontro.slug}" produz o mesmo instante para dois dias diferentes: a data e literal`,
      );
    }
  });

  void it('ISCA -- existe um encontro ACONTECENDO AGORA, com janela aberta dos dois lados', () => {
    // Sem ele o estado `happening` nao tem o que mostrar, e o unico rotulo que
    // o servidor calcula nunca seria visto por olho humano.
    const acontecendo = MASSA_DA_REDE.filter((um) => {
      if (um.quando.ancora !== 'instante') return false;
      if (um.quando.duracaoEmMinutos === null) return false;
      return (
        um.quando.comecaEmMinutos < 0 &&
        um.quando.comecaEmMinutos + um.quando.duracaoEmMinutos > 0
      );
    });
    assert.ok(
      acontecendo.length >= 1,
      'nenhum encontro da massa cai entre `starts_at` e `ends_at` no instante da semeadura',
    );
    assert.ok(
      acontecendo.every((um) => um.active),
      'o encontro que acontece agora esta inativo, entao ele nao aparece na agenda',
    );
  });

  void it('ha passado, ha hoje e ha semana que vem', () => {
    const paredes = MASSA_DA_REDE.filter((um) => um.quando.ancora === 'parede');
    assert.ok(
      paredes.some((um) => um.quando.ancora === 'parede' && um.quando.diasAPartirDeHoje < 0),
      'nenhum encontro ja passou: o estado `ended` fica sem o que mostrar',
    );
    assert.ok(
      paredes.some((um) => um.quando.ancora === 'parede' && um.quando.diasAPartirDeHoje >= 7),
      'nenhum encontro esta a uma semana ou mais: a agenda nao tem profundidade',
    );
    assert.ok(
      MASSA_DA_REDE.some(
        (um) =>
          um.quando.ancora === 'instante' &&
          um.quando.comecaEmMinutos > 0 &&
          um.quando.comecaEmMinutos < 24 * 60,
      ),
      'nenhum encontro e hoje mais tarde, que e a linha com que a agenda abre',
    );
  });
});

void describe('a massa presta para ser OLHADA, que e para o que ela existe', () => {
  void it('ha encontro com capa e encontro SEM capa', () => {
    assert.ok(
      ENCONTROS_VISIVEIS.some((um) => um.coverImageUrl !== null),
      'nenhum encontro visivel tem capa',
    );
    assert.ok(
      ENCONTROS_VISIVEIS.some((um) => um.coverImageUrl === null),
      'todo encontro tem capa: o cartao sem foto nunca seria visto, e a ausencia de capa e ' +
        'estado normal e nao lacuna',
    );
  });

  void it('ha galeria cheia, galeria de uma foto so, e galeria VAZIA', () => {
    const tamanhos = ENCONTROS_VISIVEIS.map((um) => fotosDe(um.slug).length);
    assert.ok(tamanhos.some((n) => n >= 3), 'nenhuma galeria cheia');
    assert.ok(
      tamanhos.some((n) => n === 1),
      'nenhuma galeria de uma foto so, que e o caso em que a grade de tres colunas fica com ' +
        'dois buracos',
    );
    assert.ok(tamanhos.some((n) => n === 0), 'nenhuma galeria vazia');
  });

  void it('ha muitas presencas, ha UMA, e ha NENHUMA', () => {
    const contagens = ENCONTROS_VISIVEIS.map((um) => presencasDe(um.slug));
    assert.ok(Math.max(...contagens) >= 5, 'a maior contagem da massa e pequena demais para medir nada');
    assert.ok(contagens.some((n) => n === 1), 'nenhum encontro com exatamente uma presenca');
    assert.ok(
      contagens.some((n) => n === 0),
      'todo encontro tem presenca: o zero e o caso que ninguem desenha, e e o estado em que ' +
        'todo encontro novo nasce',
    );
  });

  void it('ha mais de uma cidade e mais de um fuso, para o filtro ter o que filtrar', () => {
    const cidades = new Set(ENCONTROS_VISIVEIS.map((um) => um.city));
    assert.ok(cidades.size >= 3, `so ${String(cidades.size)} cidade(s) visiveis na massa`);
    const fusos = new Set(ENCONTROS_VISIVEIS.map((um) => um.timeZone));
    assert.ok(
      fusos.size >= 2,
      'um fuso so: a hora renderizada com o relogio do aparelho em vez do fuso do encontro ' +
        'nunca apareceria errada, e e para isso que `time_zone` existe',
    );
  });

  void it('ha titulo curto e titulo que quebra em mais de uma linha', () => {
    const titulos = ENCONTROS_VISIVEIS.map((um) => um.title.length);
    assert.ok(Math.min(...titulos) <= 40, 'nenhum titulo curto');
    assert.ok(Math.max(...titulos) >= 80, 'nenhum titulo comprido o bastante para quebrar');
  });

  void it('ha acento e cedilha em titulo, lugar e cidade', () => {
    const comAcento = /[áàâãéêíóôõúüç]/i;
    assert.ok(MASSA_DA_REDE.some((um) => comAcento.test(um.title)), 'nenhum titulo com acento');
    assert.ok(MASSA_DA_REDE.some((um) => comAcento.test(um.placeName)), 'nenhum lugar com acento');
    assert.ok(
      MASSA_DA_REDE.some((um) => /ç/i.test(`${um.title} ${um.placeName} ${um.summary}`)),
      'nenhum cedilha em lugar nenhum da massa, e e nele que fonte e quebra de linha falham',
    );
  });

  void it('ISCA -- o caso feio continua feio', () => {
    // Ele e o pior cartao que a secao consegue produzir: titulo e resumo
    // encostados no teto, nome de lugar encostado no teto, nenhuma capa,
    // galeria vazia e nenhuma presenca. Se alguem "arrumar" a massa, e aqui que
    // isso aparece -- e um cartao feio que ninguem ve e um cartao feio que vai
    // para producao.
    const feios = ENCONTROS_VISIVEIS.filter(
      (um) =>
        comprimido(um.title) >= TETO_DO_TITULO - 15 &&
        comprimido(um.summary) >= TETO_DO_RESUMO - 15 &&
        comprimido(um.placeName) >= TETO_DO_LUGAR - 15 &&
        um.coverImageUrl === null &&
        fotosDe(um.slug).length === 0 &&
        presencasDe(um.slug) === 0,
    );
    assert.equal(
      feios.length,
      1,
      'a massa precisa de exatamente um caso feio: titulo, resumo e lugar encostados nos ' +
        'tetos, sem capa, sem galeria e sem presenca',
    );
  });

  void it('ISCA -- existe encontro INATIVO, e ele e futuro', () => {
    // Uma massa so com encontros visiveis faria o caso "encontro retirado nao
    // aparece" passar contra uma consulta que nunca filtrou nada. Futuro de
    // proposito: no passado, `when=upcoming` sozinho o esconderia e o `active`
    // continuaria sem ser exercido.
    const inativos = MASSA_DA_REDE.filter((um) => !um.active);
    assert.ok(inativos.length >= 1, 'nenhum encontro inativo: o filtro de `active` nao tem alvo');
    for (const inativo of inativos) {
      assert.ok(
        inativo.quando.ancora !== 'parede' || inativo.quando.diasAPartirDeHoje > 0,
        `"${inativo.slug}" esta inativo E no passado: o filtro when=upcoming o esconderia sozinho`,
      );
    }
  });

  void it('a massa tem cerca de dez encontros visiveis', () => {
    assert.ok(
      ENCONTROS_VISIVEIS.length >= 9 && ENCONTROS_VISIVEIS.length <= 12,
      `${String(ENCONTROS_VISIVEIS.length)} encontros visiveis: a massa deixou de ter o tamanho ` +
        'que o cliente pediu para olhar',
    );
  });
});
