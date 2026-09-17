/**
 * Serialização do `Problem` para o formato do contrato.
 *
 * Existe separado de `problem.ts` porque a forma interna e a forma do fio são
 * diferentes de propósito: dentro do processo os campos são `camelCase`, no fio
 * são `snake_case` porque é assim que `api/openapi.yaml` os declara.
 *
 * **Este arquivo é o único lugar onde um corpo de erro é montado.** Campo a mais
 * numa resposta não quebra nenhum cliente e por isso passa despercebido — e é
 * exatamente por ali que a implementação se afasta do documento sem nenhum
 * alarme. Concentrar a montagem faz a conferência campo a campo ser possível.
 */
import type { AbsoluteUrl } from '../types/brands.js';
import type { AppError } from './errors.js';
import type { ProblemType } from './problem.js';

/** Forma exata do schema `Problem` do contrato. Nada além destas chaves. */
export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlation_id?: string;
  next_action?: string;
  errors?: { field: string; code: string; message?: string }[];
}

export function uriDoProblema(base: AbsoluteUrl, tipo: ProblemType): string {
  return `${base}/${tipo}`;
}

export function montarProblema(
  erro: AppError,
  base: AbsoluteUrl,
  correlationId: string,
  instance: string | undefined,
): ProblemBody {
  const corpo: ProblemBody = {
    type: uriDoProblema(base, erro.problemType),
    title: erro.title,
    status: erro.status,
    correlation_id: correlationId,
  };
  if (erro.detail !== undefined) corpo.detail = erro.detail;
  if (instance !== undefined) corpo.instance = instance;
  if (erro.nextAction !== undefined) corpo.next_action = erro.nextAction;
  if (erro.errors !== undefined && erro.errors.length > 0) {
    corpo.errors = erro.errors.map((item) => ({
      field: item.field,
      code: item.code,
      ...(item.message === undefined ? {} : { message: item.message }),
    }));
  }
  return corpo;
}

export const TIPO_DE_CONTEUDO_DO_PROBLEMA = 'application/problem+json';
