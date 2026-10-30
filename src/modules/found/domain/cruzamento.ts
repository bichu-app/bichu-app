import type { FoundReportId, CaseId } from '../../../shared/types/brands.js';

/** Muda peso ou limiar? Muda esta versão. */
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

/** Os pesos. Somam 1,00. */
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

/** Como o produto trata "sem raça definida". */
export const PREFIXO_DE_SEM_RACA_DEFINIDA = 'srd_';
const PONTO_DE_RACA_INDEFINIDA = 0.4;

/** "Sem raça definida", como `reference-data` de fato a codifica. */
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
   * Medida pelo Postgres (`ST_Distance` sobre `geography`), ou `null` quando algum
   * dos dois lados não tem coordenada.
   */
  readonly distanciaEmMetros: number | null;
  /** O par já foi recusado por uma pessoa. */
  readonly jaRejeitadoPorHumano: boolean;
}

/**
 * Uma sugestão. **Não existe forma de esta estrutura afirmar uma
 * correspondência.**
 */
export interface Sugestao {
  readonly caseId: CaseId;
  readonly foundReportId: FoundReportId;
  readonly score: number;
  /**
   * De onde veio o vínculo. Campo explícito, e não deduzido do score: um `score ===
   * 1` produzido por atributos — mesmo porte, mesma cor, mesma raça, a 300 m, no
   * mesmo dia — é possível e não é a mesma coisa que alguém ter dito "vi este pet".
   */
  readonly linkOrigin: 'attribute_match' | 'share_token';
  readonly atributosQuePontuaram: Readonly<Partial<Record<Atributo, number>>>;
  readonly distanciaEmMetros: number | null;
  readonly versaoDaEstrategia: string;
}

/** Por que um par foi descartado. */
export type MotivoDeExclusao =
  | 'especie-diferente'
  | 'achado-antes-do-desaparecimento'
  | 'achado-tarde-demais'
  | 'longe-demais'
  | 'cidade-diferente'
  | 'rejeitado-por-humano'
  | 'abaixo-do-corte';

/** Os filtros eliminatórios. */
export function excluir(caso: LadoDoCaso, achado: LadoDoAchado): MotivoDeExclusao | null {
  if (caso.especie !== achado.especie) return 'especie-diferente';

  if (achado.jaRejeitadoPorHumano) return 'rejeitado-por-humano';

  const tolerancia = TOLERANCIA_DE_ACHADO_ANTES_EM_HORAS * MILISSEGUNDOS_POR_HORA;
  if (achado.achadoEm < caso.desaparecidoEm - tolerancia) {
    return 'achado-antes-do-desaparecimento';
  }

  if (achado.achadoEm > caso.desaparecidoEm + JANELA_MAXIMA_EM_DIAS * MILISSEGUNDOS_POR_DIA) {
    return 'achado-tarde-demais';
  }

  const osDoisTemCoordenada = caso.temCoordenada && achado.temCoordenada;

  if (osDoisTemCoordenada) {
    if (achado.distanciaEmMetros === null) {
      throw new Error(
        `Os dois lados do par (caso ${caso.caseId}, achado ${achado.foundReportId}) têm ` +
          'coordenada e a distância chegou nula. Quem mede é o Postgres; uma distância ' +
          'ausente aqui é consulta quebrada, não par sem localização.',
      );
    }
    if (achado.distanciaEmMetros > DISTANCIA_MAXIMA_EM_METROS) return 'longe-demais';
    return null;
  }

  if (caso.cidade !== null && achado.cidade !== null) {
    if (normalizarCidade(caso.cidade) !== normalizarCidade(achado.cidade)) {
      return 'cidade-diferente';
    }
  }
  return null;
}

/** A cidade como ela se compara. */
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

/** O score do par, já com a penalidade de sexo. */
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

  const somaDosPesos = atributos.reduce((total, nome) => total + PESOS[nome], 0);

  let score = 0;
  const porAtributo: Partial<Record<Atributo, number>> = {};
  for (const nome of atributos) {
    const ponto = brutos[nome];
    score += (PESOS[nome] / somaDosPesos) * ponto;
    if (ponto > 0) porAtributo[nome] = ponto;
  }

  const osDoisDeclararamSexo =
    caso.sexo !== null &&
    achado.sexo !== null &&
    caso.sexo !== 'unknown' &&
    achado.sexo !== 'unknown';
  if (osDoisDeclararamSexo && caso.sexo !== achado.sexo) {
    score *= PENALIDADE_DE_SEXO_DIVERGENTE;
  }

  return { score: Math.round(score * 1000) / 1000, porAtributo };
}

/** Um par a pontuar. */
export interface Par {
  readonly caso: LadoDoCaso;
  readonly achado: LadoDoAchado;
}

/**
 * O cruzamento completo: os pares que sobrevivem aos filtros, pontuados, ordenados
 * e cortados.
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

/** O vínculo direto do critério 10, que **não passa pelo cruzamento**. */
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
