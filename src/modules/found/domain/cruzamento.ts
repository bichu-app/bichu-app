/**
 * O cruzamento de achado com caso aberto — seção 4.10 de `docs/03-arquitetura.md`.
 *
 * Aquela seção é **normativa**: "quem implementa segue estes números, e quem
 * testa reprova contra eles". Este arquivo é a tradução dela, e nada mais. Nenhum
 * peso, limiar ou tolerância foi escolhido aqui; todos estão citados ao lado.
 *
 * ## A regra que decide o desenho inteiro deste arquivo
 *
 * > O cruzamento **sugere**. Ele não confirma, não encerra caso, não avisa a
 * > outra parte e não abre conversa.
 *
 * Isso não é uma frase de documentação: é o tipo de retorno. `cruzar` devolve
 * `Sugestao[]`, e `Sugestao` **não tem como exprimir uma confirmação** — não há
 * campo `status`, não há `confirmado`, não há booleano de decisão. Quem grava
 * essas sugestões (`kysely-found-report-repository.ts`) escreve `suggested` numa
 * tabela cujo CHECK exige pessoa e instante para qualquer outro valor.
 *
 * O caminho de um falso positivo virar ação automática, então, não existe em três
 * camadas independentes: aqui ele não é representável, no adaptador ele não é
 * escrito, e no banco ele é recusado com 23514. A razão de serem três é que a
 * primeira sozinha some com um refatoramento, e um falso positivo aqui manda uma
 * tutora atrás do cão errado.
 *
 * ## Pureza
 *
 * Sem banco, sem rede, sem relógio. O intervalo de tempo chega como parâmetro já
 * calculado, e a distância também: quem as mede é o Postgres, que é quem sabe.
 * É o que a seção 4.10 chama de "reprodutibilidade em teste".
 */

import type { FoundReportId, CaseId } from '../../../shared/types/brands.js';

/** Muda peso ou limiar? Muda esta versão. Seção 4.10, primeiro parágrafo. */
export const VERSAO_DA_ESTRATEGIA = 'v1';

export type Especie = 'dog' | 'cat' | 'other';
export type Porte = 'P' | 'M' | 'G' | 'GG';
export type Sexo = 'male' | 'female' | 'unknown';

const MILISSEGUNDOS_POR_HORA = 3_600_000;
const MILISSEGUNDOS_POR_DIA = 24 * MILISSEGUNDOS_POR_HORA;

/** Filtro 2: o relato de "última vez que vi" é estimado, e erra para menos. */
export const TOLERANCIA_DE_ACHADO_ANTES_EM_HORAS = 6;
/** Filtro 3. */
export const JANELA_MAXIMA_EM_DIAS = 30;
/** Filtro 4. Quatro vezes o raio do alerta, de propósito: animal anda. */
export const DISTANCIA_MAXIMA_EM_METROS = 20_000;
/** Corte. Abaixo disso não vira candidato. */
export const CORTE_DE_SCORE = 0.45;
/** Teto. Trinta "possíveis correspondências" é trabalho transferido, não ajuda. */
export const TETO_DE_CANDIDATOS_POR_CASO = 10;
/** Sexo não pontua: quando os dois declaram e divergem, ele penaliza. */
export const PENALIDADE_DE_SEXO_DIVERGENTE = 0.7;

/**
 * Os pesos. Somam 1,00.
 *
 * Microchip, castração e RG Animal não estão aqui e a ausência é a regra: quem
 * está com o animal no colo não sabe nenhum dos três.
 */
export const PESOS = {
  porte: 0.3,
  cor: 0.25,
  raca: 0.2,
  proximidade: 0.15,
  tempo: 0.1,
} as const;

export type Atributo = keyof typeof PESOS;

/** Os quatro que sobrevivem quando falta coordenada e o peso é redistribuído. */
const ATRIBUTOS_SEM_PROXIMIDADE: readonly Atributo[] = ['porte', 'cor', 'raca', 'tempo'];

/**
 * Como o produto trata "sem raça definida".
 *
 * A seção 4.10 é explícita: um dos dois lados "SRD" ou ausente vale **0,4**, e
 * não 0. A maioria dos cães de rua é registrada como SRD por quem acha, e muitos
 * tutores preenchem a raça com precisão — tratar essa diferença como
 * incompatibilidade descartaria justamente o caso mais comum do Brasil.
 */
export const PREFIXO_DE_SEM_RACA_DEFINIDA = 'srd_';
const PONTO_DE_RACA_INDEFINIDA = 0.4;

/**
 * "Sem raça definida", como `reference-data` de fato a codifica.
 *
 * Os códigos são `srd_dog` e `srd_cat` — um por espécie, semeados na migração
 * `20260917000003`. Escrevi `'srd'` na primeira versão deste arquivo e estava
 * errado de um jeito silencioso: nenhum código casaria, todo par com um lado
 * SRD cairia em 0 em vez de 0,4, e a regra que existe para salvar **o caso mais
 * comum do Brasil** estaria desligada sem nada acusar.
 *
 * O teste do ponto de raça usa os códigos reais por isso.
 */
export function ehSemRacaDefinida(codigo: string | null): boolean {
  return codigo === null || codigo.startsWith(PREFIXO_DE_SEM_RACA_DEFINIDA);
}

export interface LadoDoCaso {
  readonly caseId: CaseId;
  readonly especie: Especie;
  readonly porte: Porte | null;
  readonly corPrimaria: string | null;
  readonly racaCodigo: string | null;
  readonly sexo: Sexo | null;
  /** Quando o pet foi visto pela última vez. */
  readonly desaparecidoEm: number;
  readonly cidade: string | null;
  readonly temCoordenada: boolean;
}

export interface LadoDoAchado {
  readonly foundReportId: FoundReportId;
  readonly especie: Especie;
  readonly porte: Porte | null;
  readonly corPrimaria: string | null;
  readonly racaCodigo: string | null;
  readonly sexo: Sexo | null;
  readonly achadoEm: number;
  readonly cidade: string | null;
  readonly temCoordenada: boolean;
  /**
   * Medida pelo Postgres (`ST_Distance` sobre `geography`), ou `null` quando
   * algum dos dois lados não tem coordenada. **Não é calculada aqui**: uma
   * aproximação em JavaScript sobre o elipsoide seria um segundo número, e dois
   * números para a mesma distância divergem.
   */
  readonly distanciaEmMetros: number | null;
  /** O par já foi recusado por uma pessoa. Filtro 6: rejeitado não volta. */
  readonly jaRejeitadoPorHumano: boolean;
}

/**
 * Uma sugestão. **Não existe forma de esta estrutura afirmar uma correspondência.**
 *
 * Ela não tem `status`, não tem `confirmado` e não tem `decidido_por`. O que ela
 * carrega é o score, o que pontuou e a distância — matéria para uma pessoa
 * decidir, que é o que o critério 7 exige.
 */
export interface Sugestao {
  readonly caseId: CaseId;
  readonly foundReportId: FoundReportId;
  readonly score: number;
  /**
   * De onde veio o vínculo. Campo explícito, e não deduzido do score: um
   * `score === 1` produzido por atributos — mesmo porte, mesma cor, mesma raça,
   * a 300 m, no mesmo dia — é possível e não é a mesma coisa que alguém ter dito
   * "vi este pet". Deduzir um do outro faria as duas origens se confundirem
   * exatamente no caso mais forte.
   */
  readonly linkOrigin: 'attribute_match' | 'share_token';
  readonly atributosQuePontuaram: Readonly<Partial<Record<Atributo, number>>>;
  readonly distanciaEmMetros: number | null;
  readonly versaoDaEstrategia: string;
}

/** Por que um par foi descartado. Sai no log, e é o que explica uma ausência. */
export type MotivoDeExclusao =
  | 'especie-diferente'
  | 'achado-antes-do-desaparecimento'
  | 'achado-tarde-demais'
  | 'longe-demais'
  | 'cidade-diferente'
  | 'rejeitado-por-humano'
  | 'abaixo-do-corte';

/**
 * Os filtros eliminatórios. **Não pontuam: excluem.**
 *
 * Devolve o motivo, ou `null` quando o par sobrevive. Devolver o motivo e não um
 * booleano é o que permite ao teste dizer *qual* filtro pegou — um booleano faria
 * dois filtros diferentes parecerem o mesmo caso verde.
 */
export function excluir(caso: LadoDoCaso, achado: LadoDoAchado): MotivoDeExclusao | null {
  // 1. Cão não é candidato de gato, e não há "talvez".
  if (caso.especie !== achado.especie) return 'especie-diferente';

  // 6. Rejeitado por decisão humana não volta. Vem antes dos filtros de tempo e
  // distância porque é o único que representa uma PESSOA tendo olhado: nenhum
  // recálculo pode desfazê-lo.
  if (achado.jaRejeitadoPorHumano) return 'rejeitado-por-humano';

  // 2. Achado antes do desaparecimento, com 6 h de tolerância.
  const tolerancia = TOLERANCIA_DE_ACHADO_ANTES_EM_HORAS * MILISSEGUNDOS_POR_HORA;
  if (achado.achadoEm < caso.desaparecidoEm - tolerancia) {
    return 'achado-antes-do-desaparecimento';
  }

  // 3. Mais de 30 dias depois do desaparecimento.
  if (achado.achadoEm > caso.desaparecidoEm + JANELA_MAXIMA_EM_DIAS * MILISSEGUNDOS_POR_DIA) {
    return 'achado-tarde-demais';
  }

  const osDoisTemCoordenada = caso.temCoordenada && achado.temCoordenada;

  // 4. Acima de 20 km, **quando os dois lados têm coordenada**.
  if (osDoisTemCoordenada) {
    if (achado.distanciaEmMetros === null) {
      // Os dois lados dizem ter coordenada e a distância não veio: a consulta que
      // deveria medi-la não mediu. Excluir em silêncio esconderia o defeito, e
      // aceitar deixaria passar um par de 900 km com peso redistribuído como se
      // fosse falta de permissão de localização.
      throw new Error(
        `Os dois lados do par (caso ${caso.caseId}, achado ${achado.foundReportId}) têm ` +
          'coordenada e a distância chegou nula. Quem mede é o Postgres; uma distância ' +
          'ausente aqui é consulta quebrada, não par sem localização.',
      );
    }
    if (achado.distanciaEmMetros > DISTANCIA_MAXIMA_EM_METROS) return 'longe-demais';
    return null;
  }

  // 5. Cidade diferente, quando algum dos dois lados não tem coordenada.
  // Cidade ausente dos dois lados não exclui: o achado pode ter só coordenada, e
  // o caso só cidade. O que sobra para decidir são os atributos.
  if (caso.cidade !== null && achado.cidade !== null) {
    if (normalizarCidade(caso.cidade) !== normalizarCidade(achado.cidade)) {
      return 'cidade-diferente';
    }
  }
  return null;
}

/**
 * A cidade como ela se compara.
 *
 * Minúscula, sem acento e sem espaço repetido. "São Paulo", "sao paulo" e
 * "  São  Paulo " são a mesma cidade, e quem digita numa tela de celular com o
 * animal no colo escreve dos três jeitos. Comparar o texto cru faria o filtro 5
 * descartar o par certo com frequência.
 *
 * **Não é geocodificação** (ADR-0006): nada aqui consulta serviço, resolve
 * endereço ou produz coordenada. É comparação de duas strings que a pessoa
 * digitou.
 */
export function normalizarCidade(cidade: string): string {
  return cidade
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Porte: igual 1,0 · adjacente (P↔M, M↔G, G↔GG) 0,5 · distante 0. */
export function pontuarPorte(a: Porte | null, b: Porte | null): number {
  if (a === null || b === null) return 0;
  if (a === b) return 1;
  const ordem: readonly Porte[] = ['P', 'M', 'G', 'GG'];
  return Math.abs(ordem.indexOf(a) - ordem.indexOf(b)) === 1 ? 0.5 : 0;
}

/**
 * Grupos cromáticos. "Mesmo grupo 0,5" precisa de uma definição de grupo, e a
 * seção 4.10 não a dá — então ela está aqui, derivada dos códigos de
 * `reference-data`, e é o único ponto deste arquivo que não está escrito lá.
 *
 * O agrupamento é pelo que uma pessoa confunde na rua, e não pelo espectro:
 * caramelo e marrom se confundem à luz do poste; preto e branco, não. `bege`
 * aparece em dois grupos de propósito — ele é o claro que puxa para o quente, e
 * a regra é "existe algum grupo que contém os dois", não "os dois têm o mesmo
 * grupo".
 *
 * Os treze códigos são os de `ref_colors` (migração `20260917000003`), e não
 * nomes inventados aqui: `rajado` é o que o produto chama de tigrado, e um
 * grupo com a palavra `tigrado` dentro não casaria com nada.
 */
const GRUPOS_CROMATICOS: readonly (readonly string[])[] = [
  ['preto', 'cinza'],
  ['branco', 'creme', 'bege'],
  ['caramelo', 'marrom', 'dourado', 'laranja', 'bege'],
  ['tricolor', 'malhado', 'rajado', 'mesclado'],
];

/** Cor primária: igual 1,0 · mesmo grupo cromático 0,5 · diferente 0. */
export function pontuarCor(a: string | null, b: string | null): number {
  if (a === null || b === null) return 0;
  if (a === b) return 1;
  return GRUPOS_CROMATICOS.some((grupo) => grupo.includes(a) && grupo.includes(b)) ? 0.5 : 0;
}

/** Raça: igual 1,0 · um dos dois SRD ou ausente 0,4 · diferentes 0. */
export function pontuarRaca(a: string | null, b: string | null): number {
  if (a !== null && b !== null && a === b) return 1;
  if (ehSemRacaDefinida(a) || ehSemRacaDefinida(b)) return PONTO_DE_RACA_INDEFINIDA;
  return 0;
}

/** Proximidade: ≤1 km 1,0 · ≤3 km 0,7 · ≤5 km 0,5 · ≤10 km 0,25 · >10 km 0. */
export function pontuarProximidade(distanciaEmMetros: number): number {
  if (distanciaEmMetros <= 1_000) return 1;
  if (distanciaEmMetros <= 3_000) return 0.7;
  if (distanciaEmMetros <= 5_000) return 0.5;
  if (distanciaEmMetros <= 10_000) return 0.25;
  return 0;
}

/** Tempo: até 48 h 1,0 · até 7 dias 0,6 · até 30 dias 0,3. */
export function pontuarTempo(intervaloEmMilissegundos: number): number {
  const horas = Math.abs(intervaloEmMilissegundos) / MILISSEGUNDOS_POR_HORA;
  if (horas <= 48) return 1;
  if (horas <= 7 * 24) return 0.6;
  return 0.3;
}

/**
 * O score do par, já com a penalidade de sexo.
 *
 * **Sem coordenada, o peso de 0,15 é redistribuído proporcionalmente** entre os
 * outros quatro, e não zerado. Zerar puniria quem não deu permissão de
 * localização, que é exatamente quem o desenho decidiu não punir — e é o mesmo
 * raciocínio do critério 6 da história.
 */
export function pontuar(
  caso: LadoDoCaso,
  achado: LadoDoAchado,
): { readonly score: number; readonly porAtributo: Readonly<Partial<Record<Atributo, number>>> } {
  const temDistancia = achado.distanciaEmMetros !== null;

  const brutos: Record<Atributo, number> = {
    porte: pontuarPorte(caso.porte, achado.porte),
    cor: pontuarCor(caso.corPrimaria, achado.corPrimaria),
    raca: pontuarRaca(caso.racaCodigo, achado.racaCodigo),
    proximidade: temDistancia ? pontuarProximidade(achado.distanciaEmMetros ?? 0) : 0,
    tempo: pontuarTempo(achado.achadoEm - caso.desaparecidoEm),
  };

  const atributos: readonly Atributo[] = temDistancia
    ? (Object.keys(PESOS) as Atributo[])
    : ATRIBUTOS_SEM_PROXIMIDADE;

  // A redistribuição é proporcional: cada peso dividido pela soma dos pesos que
  // sobraram. Com os cinco, o divisor é 1,00 e nada muda — é a mesma conta nos
  // dois caminhos, e não um ramo especial que pode divergir do outro.
  const somaDosPesos = atributos.reduce((total, nome) => total + PESOS[nome], 0);

  let score = 0;
  const porAtributo: Partial<Record<Atributo, number>> = {};
  for (const nome of atributos) {
    const ponto = brutos[nome];
    score += (PESOS[nome] / somaDosPesos) * ponto;
    if (ponto > 0) porAtributo[nome] = ponto;
  }

  // Sexo NÃO pontua: ele multiplica. Quem acha um animal na rua erra o sexo com
  // frequência, então isso não pode eliminar — mas também não pode ser ignorado.
  const osDoisDeclararamSexo =
    caso.sexo !== null &&
    achado.sexo !== null &&
    caso.sexo !== 'unknown' &&
    achado.sexo !== 'unknown';
  if (osDoisDeclararamSexo && caso.sexo !== achado.sexo) {
    score *= PENALIDADE_DE_SEXO_DIVERGENTE;
  }

  // Três casas, que é a precisão da coluna `numeric(4,3)`. Arredondar aqui e não
  // no adaptador é o que faz o número comparado com o corte ser o mesmo número
  // gravado: com o arredondamento no banco, um 0,4496 passaria pelo corte aqui e
  // seria gravado 0,450, e o teste que reproduzisse a conta acharia outra coisa.
  return { score: Math.round(score * 1000) / 1000, porAtributo };
}

/**
 * Um par a pontuar.
 *
 * **A distância mora no par, não no achado**, e essa é a razão de esta estrutura
 * existir em vez de `cruzar(achado, casos)`: o mesmo achado fica a 800 m de um
 * caso e a 12 km de outro, e quem mede é o Postgres, um `SELECT` por caso.
 * Pendurar a distância no achado obrigaria a reescrevê-lo a cada caso — e um
 * objeto reescrito em laço é exatamente onde um valor do par anterior sobrevive
 * para o próximo sem ninguém ver.
 */
export interface Par {
  readonly caso: LadoDoCaso;
  readonly achado: LadoDoAchado;
}

/**
 * O cruzamento completo: os pares que sobrevivem aos filtros, pontuados,
 * ordenados e cortados.
 *
 * Devolve **sugestões**. Não decide nada, não avisa ninguém e não abre conversa:
 * ver o cabeçalho do arquivo.
 *
 * A ordem é a da seção 4.10 e é determinística porque teste precisa reproduzir:
 * score decrescente; depois menor distância, com quem tem coordenada na frente de
 * quem não tem; depois achado mais recente; depois `found_reports.id` mais
 * antigo.
 */
export function cruzar(pares: readonly Par[]): readonly Sugestao[] {
  const sugestoes: { readonly sugestao: Sugestao; readonly achadoEm: number }[] = [];

  for (const { caso, achado } of pares) {
    if (excluir(caso, achado) !== null) continue;
    const { score, porAtributo } = pontuar(caso, achado);
    if (score < CORTE_DE_SCORE) continue;
    sugestoes.push({
      achadoEm: achado.achadoEm,
      sugestao: {
        caseId: caso.caseId,
        foundReportId: achado.foundReportId,
        score,
        linkOrigin: 'attribute_match',
        atributosQuePontuaram: porAtributo,
        distanciaEmMetros: achado.distanciaEmMetros,
        versaoDaEstrategia: VERSAO_DA_ESTRATEGIA,
      },
    });
  }

  return sugestoes
    .sort((a, b) => {
      if (a.sugestao.score !== b.sugestao.score) return b.sugestao.score - a.sugestao.score;
      const da = a.sugestao.distanciaEmMetros;
      const db = b.sugestao.distanciaEmMetros;
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }
      if (a.achadoEm !== b.achadoEm) return b.achadoEm - a.achadoEm;
      return comparar(a.sugestao.foundReportId, b.sugestao.foundReportId) ||
        comparar(a.sugestao.caseId, b.sugestao.caseId);
    })
    .slice(0, TETO_DE_CANDIDATOS_POR_CASO)
    .map((entrada) => entrada.sugestao);
}

function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * O vínculo direto do critério 10, que **não passa pelo cruzamento**.
 *
 * O vizinho chegou pelo push de um caso específico e tocou em "vi este pet".
 * Score 1,0, `link_origin: share_token`, sem filtro eliminatório e sem
 * pontuação: ele não está dizendo "talvez seja parecido", está dizendo "é este".
 *
 * **Continua exigindo confirmação humana do tutor**, e é por isso que esta
 * função devolve o mesmo tipo `Sugestao` das outras: não existe um caminho
 * privilegiado que confirme sozinho, nem para score 1,0. É a mesma regra que
 * protege contra o falso achador, e é justamente aqui que ela precisa não ter
 * exceção — quem chega pelo link do caso é quem mais facilmente erraria o animal
 * de boa-fé, e quem mais facilmente mentiria de má-fé.
 */
export function vinculoDireto(achado: FoundReportId, caso: CaseId): Sugestao {
  return {
    caseId: caso,
    foundReportId: achado,
    score: 1,
    linkOrigin: 'share_token',
    atributosQuePontuaram: {},
    distanciaEmMetros: null,
    versaoDaEstrategia: VERSAO_DA_ESTRATEGIA,
  };
}
