import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { errosDeModeracao } from '../../../shared/texto/moderacao.js';

/** O limite de `professional_reviews.body`, e o mesmo do contrato. */
export const TAMANHO_MAXIMO_DO_TEXTO = 1500;

export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 5;

/** As notas possiveis, que sao tambem as chaves do histograma. */
export const NOTAS = [1, 2, 3, 4, 5] as const;

export type Nota = (typeof NOTAS)[number];

export type MotivoDaDenuncia =
  | 'spam'
  | 'offensive'
  | 'false_information'
  | 'not_about_this_place'
  | 'other';

export const MOTIVOS_DA_DENUNCIA: readonly MotivoDaDenuncia[] = [
  'spam',
  'offensive',
  'false_information',
  'not_about_this_place',
  'other',
];

/**
 * A avaliacao como a persistencia a entrega: ja recortada, sem nada que nao possa
 * sair.
 */
export interface AvaliacaoDoLocal {
  readonly ref: string;
  readonly nota: number;
  readonly texto: string | null;
  readonly nomeDeExibicaoDoAutor: string | null;
  readonly criadaEm: Date;
  readonly editadaEm: Date | null;
  /** Verdadeiro na avaliacao de quem chama. */
  readonly minha: boolean;
}

/** A pontuacao agregada, como `pontuacao_do_local` a devolve. */
export interface PontuacaoDoLocal {
  /** Nulo quando `quantidade` e zero**, e nunca zero. */
  readonly media: number | null;
  readonly quantidade: number;
  readonly histograma: Readonly<Record<Nota, number>>;
}

/** A pontuacao vazia: o que um local sem nenhuma avaliacao tem. */
export const PONTUACAO_VAZIA: PontuacaoDoLocal = {
  media: null,
  quantidade: 0,
  histograma: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/** `DirectoryRating` do contrato, **como TIPO**. */
export interface PontuacaoPublica {
  readonly average: number | null;
  readonly count: number;
  readonly histogram: Readonly<Record<string, number>>;
}

/** `DirectoryRating` do contrato. */
export function projetarPontuacao(p: PontuacaoDoLocal): PontuacaoPublica {
  return {
    average: p.quantidade === 0 ? null : p.media,
    count: p.quantidade,
    histogram: {
      '1': p.histograma[1],
      '2': p.histograma[2],
      '3': p.histograma[3],
      '4': p.histograma[4],
      '5': p.histograma[5],
    },
  };
}

/** `DirectoryReview` do contrato. */
export function projetarAvaliacao(a: AvaliacaoDoLocal): {
  ref: string;
  rating: number;
  body: string | null;
  author_display_name: string | null;
  created_at: string;
  edited_at: string | null;
  mine: boolean;
} {
  return {
    ref: a.ref,
    rating: a.nota,
    body: a.texto,
    author_display_name: a.nomeDeExibicaoDoAutor,
    created_at: a.criadaEm.toISOString(),
    edited_at: a.editadaEm === null ? null : a.editadaEm.toISOString(),
    mine: a.minha,
  };
}

export interface ErroDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** O que a escrita aceita, depois de validada e normalizada. */
export interface EntradaDaAvaliacao {
  readonly nota: Nota;
  readonly texto: string | null;
}

/** Valida o corpo de `putMyDirectoryEntryReview`. */
export function validarEntradaDaAvaliacao(corpo: unknown): {
  entrada?: EntradaDaAvaliacao;
  erros: readonly ErroDeCampo[];
} {
  const erros: ErroDeCampo[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  const notaCrua = c['rating'];
  let nota: Nota | undefined;
  if (typeof notaCrua !== 'number' || !Number.isInteger(notaCrua)) {
    erros.push({
      field: 'rating',
      code: 'required',
      message: 'Dê uma nota de 1 a 5.',
    });
  } else if (notaCrua < NOTA_MINIMA || notaCrua > NOTA_MAXIMA) {
    erros.push({
      field: 'rating',
      code: 'out_of_range',
      message: 'A nota vai de 1 a 5.',
    });
  } else {
    nota = notaCrua as Nota;
  }

  const textoCru = c['body'];
  let texto: string | null = null;
  if (textoCru !== undefined && textoCru !== null) {
    if (typeof textoCru !== 'string') {
      erros.push({ field: 'body', code: 'invalid', message: 'O texto precisa ser texto.' });
    } else {
      const aparado = textoCru.trim();
      if (aparado === '') {
        texto = null;
      } else if (aparado.length > TAMANHO_MAXIMO_DO_TEXTO) {
        erros.push({
          field: 'body',
          code: 'too_long',
          message: `O texto vai até ${String(TAMANHO_MAXIMO_DO_TEXTO)} caracteres.`,
        });
      } else if (/[<>]/.test(aparado)) {
        erros.push({
          field: 'body',
          code: 'html_not_allowed',
          message: 'Escreva sem os sinais < e >.',
        });
      } else {
        texto = aparado;
      }
    }
  }

  if (erros.length > 0 || nota === undefined) return { erros };
  return { entrada: { nota, texto }, erros: [] };
}

/**
 * A MODERACAO DE PALAVRAS do texto da avaliacao: xingamento, injuria e o que
 * prejudica a imagem do aplicativo.
 */
export function errosDeModeracaoDaAvaliacao(texto: string | null): readonly ProblemFieldError[] {
  if (texto === null) return [];
  return errosDeModeracao('body', texto);
}

/** Valida o corpo de `reportDirectoryEntryReview`. */
export function validarDenuncia(corpo: unknown): {
  denuncia?: { motivo: MotivoDaDenuncia; detalhe: string | null };
  erros: readonly ErroDeCampo[];
} {
  const erros: ErroDeCampo[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  const motivoCru = c['reason'];
  let motivo: MotivoDaDenuncia | undefined;
  if (typeof motivoCru !== 'string' || !MOTIVOS_DA_DENUNCIA.includes(motivoCru as MotivoDaDenuncia)) {
    erros.push({ field: 'reason', code: 'required', message: 'Diga o motivo da denúncia.' });
  } else {
    motivo = motivoCru as MotivoDaDenuncia;
  }

  const detalheCru = c['detail'];
  let detalhe: string | null = null;
  if (detalheCru !== undefined && detalheCru !== null) {
    if (typeof detalheCru !== 'string') {
      erros.push({ field: 'detail', code: 'invalid', message: 'O detalhe precisa ser texto.' });
    } else {
      const aparado = detalheCru.trim();
      if (aparado === '') detalhe = null;
      else if (aparado.length > 1000) {
        erros.push({ field: 'detail', code: 'too_long', message: 'O detalhe vai até 1000 caracteres.' });
      } else if (/[<>]/.test(aparado)) {
        erros.push({ field: 'detail', code: 'html_not_allowed', message: 'Escreva sem os sinais < e >.' });
      } else detalhe = aparado;
    }
  }

  if (erros.length > 0 || motivo === undefined) return { erros };
  return { denuncia: { motivo, detalhe }, erros: [] };
}

export type OrdemDasAvaliacoes = 'recent' | 'rating_desc' | 'rating_asc';
