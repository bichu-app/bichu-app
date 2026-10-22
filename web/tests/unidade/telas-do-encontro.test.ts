// A decisao de tela de `/encontro/{slug}`, sem navegador (src/dominio).
//
// A pagina e a nona rota publica do site (emenda 4 do ADR-0017, decisao do
// cliente de 21/10/2026), e ela e aberta por quem nao tem conta. As iscas aqui
// cobrem as duas coisas que ela nao pode fazer: contar qual das seis situacoes
// aconteceu, e desenhar encontro que nao esta de pe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadoDeProblema, type Resultado } from '../../src/dominio/resultado.ts';
import {
  telaDoEncontro,
  linhaDoLugar,
  regiaoDoLugar,
  dataLonga,
  faixaDeHorario,
  textoDaEntrada,
  type EncontroDaRede,
  type EncontroPublico,
} from '../../src/dominio/telas-do-encontro.ts';
import { HOME } from '../../src/conteudo/home.ts';
import { COMUNIDADE } from '../../src/conteudo/comunidade.ts';
import {
  COMO_FUNCIONA,
  PARA_PROFISSIONAIS,
  SOBRE,
  CONTATO_PAGINA,
} from '../../src/conteudo/institucional.ts';
import { tipoDeProblema as tipo } from './hosts.ts';

const problema = (status: number, slug: string, extra: Record<string, unknown> = {}, retry: string | null = null) =>
  resultadoDeProblema(status, { type: tipo(slug), title: 'qualquer texto', status, ...extra }, retry);

const LUGAR = {
  place_name: 'Praça Benedito Calixto',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  state: 'SP',
};

function publico(ajustes: Partial<EncontroPublico> = {}): EncontroPublico {
  return {
    slug: 'passeio-matinal',
    title: 'Passeio matinal na Benedito Calixto',
    summary: 'Cães de todos os portes, sombra e água fresca.',
    place: LUGAR,
    starts_at: '2026-10-25T12:00:00Z',
    ends_at: '2026-10-25T14:00:00Z',
    time_zone: 'America/Sao_Paulo',
    status: 'upcoming',
    visibility: 'public',
    cover_image_url: null,
    cover_banner_url: null,
    images: [],
    admission: { kind: 'free', price: null },
    accepted_sizes: ['P', 'M', 'G', 'GG'],
    dog_age: 'any',
    vaccination_required: true,
    fenced_off_leash_area: false,
    amenities: [],
    bring_items: [],
    notes: null,
    ticket_url: null,
    instagram_handle: null,
    instagram_url: null,
    ...ajustes,
  } as EncontroPublico;
}

const ok = (dados: EncontroDaRede): Resultado<EncontroDaRede> => ({ tipo: 'ok', status: 200, dados });

// ---------------------------------------------------------------------------
// CONTROLE POSITIVO
// ---------------------------------------------------------------------------

test('CONTROLE POSITIVO -- o encontro publico e futuro DESENHA a pagina', () => {
  const tela = telaDoEncontro(ok(publico()));
  assert.equal(tela.tela, 'encontro');
  assert.equal(tela.http, 200);
  // Sem este caso, todas as iscas abaixo passariam com `telaDoEncontro`
  // devolvendo `indisponivel` sempre -- e a pagina nunca mostraria encontro.
  assert.equal(tela.tela === 'encontro' && tela.encontro.title, 'Passeio matinal na Benedito Calixto');
});

test('`happening` DESENHA: o encontro esta acontecendo agora', () => {
  assert.equal(telaDoEncontro(ok(publico({ status: 'happening' }))).tela, 'encontro');
});

// ---------------------------------------------------------------------------
// ISCA (c) -- SEIS SITUACOES, UMA RESPOSTA
// ---------------------------------------------------------------------------

test('ISCA DE VAZAMENTO -- encontro PRIVADO nao ganha pagina', () => {
  // O teaser do privado: cinco propriedades, sem lugar e sem horario.
  const teaser = {
    slug: 'k3j9x2m1q8z7v4b6n0t5r1y3w',
    title: 'Encontro fechado',
    local_date: '2026-10-25',
    visibility: 'private',
    status: 'upcoming',
  } as unknown as EncontroDaRede;
  const tela = telaDoEncontro(ok(teaser));
  assert.equal(
    tela.tela,
    'indisponivel',
    'REPROVA: um encontro PRIVADO ganhou pagina publica. Ele sai como teaser para ' +
      'qualquer chamador (ADR-0027 12.10), e desenhar pagina com ele entregaria a ' +
      'estranhos um encontro fechado.',
  );
  assert.equal(tela.http, 410);
});

test('ISCA -- encontro CANCELADO nao ganha pagina', () => {
  const tela = telaDoEncontro(ok(publico({ status: 'cancelled' })));
  assert.equal(
    tela.tela,
    'indisponivel',
    'REPROVA: a pagina convidou gente para um encontro CANCELADO. Quem abre este link ' +
      'nao tem conta e nao tem como descobrir sozinho que aquilo nao vai acontecer.',
  );
  assert.equal(tela.http, 410);
});

test('ISCA -- encontro ENCERRADO nao ganha pagina', () => {
  const tela = telaDoEncontro(ok(publico({ status: 'ended' })));
  assert.equal(
    tela.tela,
    'indisponivel',
    'REPROVA: a pagina de um encontro que JA TERMINOU continua convidando.',
  );
  assert.equal(tela.http, 410);
});

test('ISCA -- as SEIS situacoes dao exatamente a MESMA tela e o MESMO status', () => {
  // Esta e a isca que ancora a regra, e nao as individuais: ela reprova no dia
  // em que alguem acrescentar uma tela "este encontro foi cancelado" ou
  // "este encontro e fechado" -- distinguir conta a um estranho o que a
  // moderacao fez, ou que aquele `slug` existiu (regua do `lost-case-closed`).
  const teaser = {
    slug: 'k3j9x2m1q8z7v4b6n0t5r1y3w',
    title: 'Encontro fechado',
    local_date: '2026-10-25',
    visibility: 'private',
    status: 'upcoming',
  } as unknown as EncontroDaRede;
  const seis = [
    // 1, 2, 3: `slug` inexistente, `pending_review` e `removed` -- o contrato
    // ja os colapsa num 404 unico, e e esse 404 que chega aqui.
    telaDoEncontro(problema(404, 'not-found') as Resultado<EncontroDaRede>),
    telaDoEncontro(problema(404, 'not-found') as Resultado<EncontroDaRede>),
    telaDoEncontro(problema(404, 'not-found') as Resultado<EncontroDaRede>),
    // 4, 5, 6: privado, cancelado e encerrado -- decisao desta pagina.
    telaDoEncontro(ok(teaser)),
    telaDoEncontro(ok(publico({ status: 'cancelled' }))),
    telaDoEncontro(ok(publico({ status: 'ended' }))),
  ];
  assert.deepEqual(
    seis,
    Array.from({ length: 6 }, () => ({ tela: 'indisponivel', http: 410 })),
    'REPROVA: as seis situacoes deixaram de ser indistinguiveis. Qualquer diferenca ' +
      'entre elas -- tela, status ou campo a mais -- conta a um estranho o que ' +
      'aconteceu, ou se aquele `slug` existiu.',
  );
});

test('o `slug` malformado tambem cai na tela unica', () => {
  // `eventSlug` tem forma declarada (3 a 30), e parametro fora da forma da 400.
  const tela = telaDoEncontro(problema(400, 'validation-failed') as Resultado<EncontroDaRede>);
  assert.equal(tela.tela, 'indisponivel');
  assert.equal(tela.http, 410);
});

test('teto de chamada, erro interno e transporte tem telas proprias', () => {
  // Estes NAO entram na tela unica: eles nao dizem nada sobre o encontro, e
  // dizem algo que a pessoa pode usar -- esperar, ou tentar de novo.
  const espere = telaDoEncontro(problema(429, 'rate-limited', {}, '30') as Resultado<EncontroDaRede>);
  assert.equal(espere.tela, 'espere');
  assert.equal(espere.tela === 'espere' && espere.esperaSegundos, 30);
  assert.equal(telaDoEncontro(problema(500, 'internal') as Resultado<EncontroDaRede>).tela, 'fora-do-ar');
  assert.equal(telaDoEncontro({ tipo: 'falha', motivo: 'tempo' }).tela, 'fora-do-ar');
  const erro = telaDoEncontro(problema(418, 'desconhecido', { correlation_id: 'abc' }) as Resultado<EncontroDaRede>);
  assert.equal(erro.tela, 'erro');
});

// ---------------------------------------------------------------------------
// ISCA (a) -- O LUGAR, SEM LOGRADOURO
// ---------------------------------------------------------------------------

test('ISCA DE VAZAMENTO -- a linha do lugar leva os QUATRO rotulos publicos e nada mais', () => {
  assert.equal(
    linhaDoLugar(LUGAR),
    'Praça Benedito Calixto, Pinheiros, São Paulo - SP',
    'REPROVA: a linha do lugar mudou de forma. Ela e nome do lugar, bairro, cidade e ' +
      'UF -- os quatro rotulos de `NetworkEventPlace` -- e nada mais fino.',
  );
  assert.equal(regiaoDoLugar(LUGAR), 'Pinheiros, São Paulo - SP');
});

test('ISCA DE VAZAMENTO -- logradouro no corpo NAO chega a nenhuma linha da pagina', () => {
  // O caso injeta `street_address` no objeto do lugar e no do encontro, como se
  // o servidor tivesse passado a mandar -- que e o cenario em que o freio tem
  // de existir no site tambem, e nao so no contrato. Sem a injecao nao haveria
  // o que vazar, e a isca nao seria isca.
  const comEndereco = {
    ...LUGAR,
    street_address: 'R. Teodoro Sampaio, 1020',
  } as unknown as EncontroPublico['place'];
  const linha = linhaDoLugar(comEndereco);
  assert.ok(
    !linha.includes('Teodoro') && !linha.includes('1020'),
    `REPROVA: o endereco por extenso entrou na linha do lugar (${linha}). Ele sai so ` +
      'em `getNetworkEventLocation`, com conta (ADR-0027 item 21.2), e esta pagina e ' +
      'lida sem conta.',
  );
  assert.ok(!regiaoDoLugar(comEndereco).includes('Teodoro'));
});

// ---------------------------------------------------------------------------
// Data e hora no fuso DO ENCONTRO
// ---------------------------------------------------------------------------

test('a data e a hora saem no fuso do ENCONTRO, e nao no de quem le', () => {
  // 12:00Z e 9h em Sao Paulo (UTC-3). Se a funcao usasse o fuso do processo,
  // este caso mudaria de resultado em cada maquina.
  assert.equal(faixaDeHorario('2026-10-25T12:00:00Z', '2026-10-25T14:00:00Z', 'America/Sao_Paulo'), 'Das 9h às 11h');
  assert.equal(dataLonga('2026-10-25T12:00:00Z', 'America/Sao_Paulo'), 'domingo, 25 de outubro');
  // O MESMO instante, em Lisboa: a hora de parede e outra, e e a do evento que manda.
  assert.equal(faixaDeHorario('2026-10-25T12:00:00Z', null, 'Europe/Lisbon'), 'A partir das 12h');
});

test('sem `ends_at` a frase NAO inventa fim', () => {
  assert.equal(faixaDeHorario('2026-10-25T12:00:00Z', null, 'America/Sao_Paulo'), 'A partir das 9h');
  assert.equal(faixaDeHorario('2026-10-25T12:30:00Z', undefined, 'America/Sao_Paulo'), 'A partir das 9h30');
});

test('fuso ou data invalidos nao derrubam a pagina', () => {
  assert.equal(dataLonga('2026-10-25T12:00:00Z', 'Marte/Olympus'), null);
  assert.equal(dataLonga('nao-e-data', 'America/Sao_Paulo'), null);
  assert.equal(faixaDeHorario('nao-e-data', null, 'America/Sao_Paulo'), null);
});

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

test('a entrada: gratuito, pago com unidade, e unidade desconhecida', () => {
  assert.equal(textoDaEntrada({ kind: 'free', price: null }), 'Gratuito');
  const pago = {
    kind: 'paid',
    price: { amount: 3000, currency: 'BRL', unit: 'per_person' },
  } as unknown as EncontroPublico['admission'];
  assert.match(textoDaEntrada(pago), /30,00/);
  assert.match(textoDaEntrada(pago), /por pessoa/);
  // `per_dog` e legado e aparece como "por pet" (ADR-0027 item 22.2).
  const legado = {
    kind: 'paid',
    price: { amount: 1500, currency: 'BRL', unit: 'per_dog' },
  } as unknown as EncontroPublico['admission'];
  assert.match(textoDaEntrada(legado), /por pet/);
  // Unidade que o site nao conhece mostra SO o valor, como o aplicativo faz.
  const futuro = {
    kind: 'paid',
    price: { amount: 1000, currency: 'BRL', unit: 'per_whatever' },
  } as unknown as EncontroPublico['admission'];
  assert.doesNotMatch(textoDaEntrada(futuro), /whatever/);
  assert.match(textoDaEntrada(futuro), /10,00/);
});

// ---------------------------------------------------------------------------
// ISCA -- AS PAGINAS INSTITUCIONAIS NAO PROMETEM O QUE NAO EXISTE
// ---------------------------------------------------------------------------
//
// Mesmo mecanismo da isca da pagina do encontro (varredura achatada, NFD, sem
// caixa), aqui apontado para os textos de /, /comunidade, /como-funciona,
// /para-profissionais, /sobre e /contato.
//
// NOTA DE MESCLA: quando a branch `conserto/frase-falsa-endereco-encontro`
// entrar, este arquivo tera DUAS varreduras equivalentes (`textosDaPagina` /
// `semAcento` la, `textosDoConteudo` / `semSinais` aqui). Elas devem virar UMA,
// com a lista de modulos como parametro. Os nomes aqui sao distintos de
// proposito, para a mescla nao redeclarar identificador.

/**
 * Todo texto que estes modulos de conteudo podem escrever, achatado numa lista.
 *
 * Varre os objetos INTEIROS, e nao chaves escolhidas a mao, porque a promessa
 * falsa pode voltar em qualquer rotulo, e uma isca que olha uma chave so nao
 * vigia a pagina: vigia aquela chave.
 */
function textosDoConteudo(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === 'string') saida.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textosDoConteudo(v, saida);
  else if (typeof valor === 'function') saida.push('\u0000FUNCAO');
  else if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor)) textosDoConteudo(v, saida);
  }
  return saida;
}

/** Sem acento e em minuscula: `presença` e `presenca` sao a mesma palavra aqui. */
const semSinais = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * O ato NAO EXISTE nesta versao. Check-in, contagem de presentes e galeria da
 * comunidade sairam da migracao E DO CONTRATO por decisao do cliente (ADR-0027
 * item 12.4): `network_event_checkins`, `checkInNetworkEvent` e `checkin_count`
 * nao estao em `api/openapi.yaml`, nenhuma das 23 operacoes `*NetworkEvent*` e
 * de presenca, nenhuma das 10 rotas `/network/...` tem check-in, e
 * `NetworkEventPublic` nao tem campo de presenca nenhum.
 */
const PROIBIDO = /confirm|presenc|check[ -]?in/;

/** "12 pessoas vao", "8 pessoas confirmadas": contagem de presentes que o contrato nao da. */
const CONTAGEM_DE_GENTE = /\d+\s*pessoas?\s*(vao|vai|confirmad|presente)/;

const MODULOS = {
  HOME,
  COMUNIDADE,
  COMO_FUNCIONA,
  PARA_PROFISSIONAIS,
  SOBRE,
  CONTATO_PAGINA,
};

test('ISCA -- as paginas institucionais nao prometem check-in nem lista de presenca', () => {
  const textos = textosDoConteudo(MODULOS);

  // ---- CONTROLES POSITIVOS -------------------------------------------------
  // Sem eles, uma varredura que devolvesse lista vazia -- export renomeado,
  // `import` trocado, achatamento quebrado -- passaria para sempre, e a isca
  // nao estaria vigiando nada.
  assert.ok(textos.length >= 120, `REPROVA (controle): a varredura achou so ${textos.length} textos.`);

  // Uma frase conhecida de CADA modulo varrido: prova que nenhum deles caiu
  // fora do alcance da varredura.
  for (const [modulo, frase] of [
    ['home.ts', 'Pets conectam pessoas.'],
    ['comunidade.ts', 'O que ninguém vê num evento'],
    ['institucional.ts (COMO_FUNCIONA)', 'A identidade do seu pet'],
    ['institucional.ts (PARA_PROFISSIONAIS)', 'Para profissionais'],
    ['institucional.ts (SOBRE)', 'Sobre'],
    ['institucional.ts (CONTATO_PAGINA)', 'Contato'],
  ] as const) {
    assert.ok(
      textos.some((t) => t.includes(frase)),
      `REPROVA (controle): a varredura nao enxerga "${frase}", de ${modulo}.`,
    );
  }

  // Valor que virou funcao sairia da varredura em silencio: acusa em vez disso.
  assert.ok(
    !textos.includes('\u0000FUNCAO'),
    'REPROVA (controle): um texto de conteudo virou funcao. A varredura nao a executa, ' +
      'entao o texto dela NAO esta sendo vigiado -- ensine a varredura a chama-la.',
  );

  // Os detectores precisam detectar: sem isto, um `PROIBIDO` quebrado deixaria
  // a varredura verde com a promessa falsa de volta na pagina.
  assert.match(semSinais('Você faz check-in quando chega'), PROIBIDO);
  assert.match(semSinais('A lista de presença mostra quem foi'), PROIBIDO);
  assert.match(semSinais('para quem confirma presença'), PROIBIDO);
  assert.match(semSinais('12 pessoas vão'), CONTAGEM_DE_GENTE);
  assert.doesNotMatch(semSinais('Eventos em praças e parques'), PROIBIDO);

  // ---- A ISCA --------------------------------------------------------------
  const promessas = textos.filter((t) => PROIBIDO.test(semSinais(t)));
  assert.deepEqual(
    promessas,
    [],
    'REPROVA: uma pagina publica voltou a anunciar check-in ou confirmacao de presenca ' +
      `(${JSON.stringify(promessas)}). O ato NAO EXISTE: check-in e lista de presenca ` +
      'sairam da migracao e do contrato por decisao do cliente (ADR-0027 item 12.4), ' +
      '`checkInNetworkEvent` nao esta em api/openapi.yaml e `NetworkEventPublic` nao tem ' +
      'campo de presenca. Anunciar o que nao existe e o defeito; a pagina mais curta ganha.',
  );

  const contagens = textos.filter((t) => CONTAGEM_DE_GENTE.test(semSinais(t)));
  assert.deepEqual(
    contagens,
    [],
    'REPROVA: uma pagina publica voltou a mostrar contagem de pessoas no evento ' +
      `(${JSON.stringify(contagens)}). Nao existe campo de presenca em ` +
      '`NetworkEventPublic`: o numero nao tem de onde sair.',
  );
});
