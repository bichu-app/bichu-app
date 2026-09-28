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
 * As afirmacoes abaixo sao as mesmas dos `CHECK` da migracao `20260928000001`,
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
 * Entao o segundo bloco afirma a VARIEDADE: que existe encontro com e sem
 * ponto no mapa, que existe um acontecendo
 * agora e um que ja passou, que ha mais de uma cidade para o filtro filtrar, e
 * que o caso feio continua feio. Cada uma dessas linhas e um caso de desenho
 * que someria em silencio se alguem "arrumasse" a massa.
 */
import assert from 'node:assert/strict';
import { redigirCanalMediado } from '../shared/redaction/redigir.js';
import { describe, it } from 'node:test';

import {
  ENCONTROS_COM_PONTO,
  ENCONTROS_PRIVADOS,
  ENCONTROS_VISIVEIS,
  camposDe,
  FUSOS_DA_REDE,
  MASSA_DA_REDE,
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

/** Um `hoje` fixo, para as contas deste arquivo nao dependerem do relogio. */
const HOJE = new Date('2026-09-23T15:30:00.000Z');

function comprimido(texto: string): number {
  return texto.trim().length;
}

void describe('a massa da Rede cabe nos CHECK da migracao', () => {
  void it('todo slug de encontro tem o formato que o banco aceita', () => {
    for (const encontro of MASSA_DA_REDE) {
      assert.match(encontro.slug, FORMATO_DO_SLUG, `slug fora do formato: ${encontro.slug}`);
    }
  });

  void it('nenhum slug se repete', () => {
    // `network_events_slug_unico`: repetido, o `INSERT` estoura no meio da
    // massa, com parte dela gravada.
    const encontros = MASSA_DA_REDE.map((um) => um.slug);
    assert.equal(new Set(encontros).size, encontros.length, 'slug de encontro repetido');
  });

  void it('ISCA -- todo ponto cabe nos limites do Brasil do contrato (`NetworkEventPoint`)', () => {
    // Os limites de `GeoPoint` e de `AdminMapPin`: lat de -34 a 6, lon de -74 a
    // -32. Trocar lat por lon, o erro mais comum com ponto, cai fora dos dois.
    for (const encontro of MASSA_DA_REDE) {
      if (encontro.ponto === null) continue;
      const { lat, lon } = encontro.ponto;
      assert.ok(lat >= -34 && lat <= 6, `lat de "${encontro.slug}" fora do Brasil: ${String(lat)}`);
      assert.ok(lon >= -74 && lon <= -32, `lon de "${encontro.slug}" fora do Brasil: ${String(lon)}`);
    }
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
      acontecendo.every((um) => um.publicationStatus === 'published'),
      'o encontro que acontece agora nao esta publicado, entao ele nao aparece na agenda',
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
  void it('ha encontro COM ponto no mapa e encontro SEM ponto (ADR-0027 12.8)', () => {
    // A tela do encontro, com conta, desenha o mapa quando ha ponto e so os
    // rotulos quando nao ha. Os dois casos precisam estar na massa para o
    // cliente ver os dois.
    assert.ok(ENCONTROS_COM_PONTO.length >= 1, 'nenhum encontro visivel com ponto');
    assert.ok(
      ENCONTROS_VISIVEIS.some((um) => um.ponto === null),
      'todo encontro visivel tem ponto: a tela sem mapa nunca seria vista',
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
    // encostados no teto, nome de lugar encostado no teto e
    // nenhum ponto. Se alguem "arrumar" a massa, e aqui que isso aparece.
    const feios = ENCONTROS_VISIVEIS.filter(
      (um) =>
        comprimido(um.title) >= TETO_DO_TITULO - 15 &&
        comprimido(um.summary) >= TETO_DO_RESUMO - 15 &&
        comprimido(um.placeName) >= TETO_DO_LUGAR - 15 &&
        um.ponto === null,
    );
    assert.equal(
      feios.length,
      1,
      'a massa precisa de exatamente um caso feio: titulo, resumo e lugar encostados nos ' +
        'tetos, e sem ponto',
    );
  });

  void it('ISCA -- existe encontro RETIRADO, e ele e futuro e tem ponto', () => {
    // Uma massa so com encontros visiveis faria o caso "encontro retirado nao
    // aparece" passar contra uma consulta que nunca filtrou nada. Futuro de
    // proposito: no passado, `when=upcoming` sozinho o esconderia. Com ponto de
    // proposito: e o caso em que `location` precisa responder 404.
    const retirados = MASSA_DA_REDE.filter((um) => um.publicationStatus === 'removed');
    assert.ok(retirados.length >= 1, 'nenhum encontro retirado: o filtro de visibilidade nao tem alvo');
    for (const retirado of retirados) {
      assert.ok(
        retirado.quando.ancora !== 'parede' || retirado.quando.diasAPartirDeHoje > 0,
        `"${retirado.slug}" esta retirado E no passado: o filtro when=upcoming o esconderia sozinho`,
      );
      assert.notEqual(retirado.ponto, null, `"${retirado.slug}" nao tem ponto: o 404 do location fica sem alvo`);
    }
  });

  void it('ISCA -- ha encontro PRIVADO na massa (P19: zero privados reprova)', () => {
    assert.ok(ENCONTROS_PRIVADOS.length >= 1, 'nenhum encontro privado: o teaser nunca seria visto');
  });

  void it('ISCA -- o slug do privado nao carrega o lugar, o bairro nem a cidade', () => {
    // ADR-0027 12.10: o `slug` do privado sai no teaser para todo mundo.
    const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const privado of ENCONTROS_PRIVADOS) {
      for (const pedaco of [privado.placeName, privado.neighborhood, privado.city]) {
        for (const palavra of normal(pedaco).split(/[^a-z0-9]+/).filter((p) => p.length >= 4)) {
          assert.equal(normal(privado.slug).includes(palavra), false, `"${palavra}" no slug ${privado.slug}`);
        }
      }
    }
  });

  void it('pago sempre com valor e unidade, e o valor e positivo', () => {
    for (const encontro of MASSA_DA_REDE) {
      const pago = camposDe(encontro).admission;
      if (pago === null) continue;
      assert.ok(pago.centavos >= 1 && pago.centavos <= 100_000_000, `valor fora da faixa em ${encontro.slug}`);
    }
    assert.ok(MASSA_DA_REDE.some((um) => camposDe(um).admission !== null), 'nenhum encontro pago');
  });

  void it('ISCA -- as observacoes cabem em 500 e nao tem contato nem link (D59)', () => {
    for (const encontro of MASSA_DA_REDE) {
      const nota = camposDe(encontro).observacoes;
      if (nota === null) continue;
      assert.ok(nota.trim().length >= 2 && nota.trim().length <= 500, `nota fora do teto em ${encontro.slug}`);
      assert.deepEqual(redigirCanalMediado(nota).retirados, [], `contato na nota de ${encontro.slug}`);
    }
  });

  void it('todo encontro aceita pelo menos um porte, e a lista fechada e respeitada', () => {
    for (const encontro of MASSA_DA_REDE) {
      const c = camposDe(encontro);
      assert.ok(c.portes.length >= 1, `sem porte em ${encontro.slug}`);
      assert.ok(c.paraLevar.length <= 8);
    }
  });

  void it('a massa tem cerca de dez encontros visiveis', () => {
    assert.ok(
      ENCONTROS_VISIVEIS.length >= 9 && ENCONTROS_VISIVEIS.length <= 13,
      `${String(ENCONTROS_VISIVEIS.length)} encontros visiveis: a massa deixou de ter o tamanho ` +
        'que o cliente pediu para olhar',
    );
  });
});
