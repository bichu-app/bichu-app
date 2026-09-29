// O que a chamada a API devolveu, reduzido ao que a tela precisa para decidir.
// Tres casos, e so tres: resposta de sucesso, problema (RFC 9457) e falha de
// transporte (tempo esgotado ou rede). A tela decide por `slug`, que e o `type`
// do problema depois de /problems/, nunca pelo texto e nunca so pelo status.
import type { components } from '../api/generated/api.ts';
import { TIPOS_DE_PROBLEMA, type TipoDeProblema } from '../api/generated/tipos-de-problema.ts';

export type Problema = components['schemas']['Problem'];

export type Resultado<T> =
  | { tipo: 'ok'; status: number; dados: T }
  | {
      tipo: 'problema';
      status: number;
      /** Slug da lista fechada `x-problem-types`, ou null se o `type` for desconhecido. */
      slug: TipoDeProblema | null;
      problema: Problema | null;
      /** Segundos de `Retry-After`, quando a resposta trouxe. */
      esperaSegundos: number | null;
    }
  | { tipo: 'falha'; motivo: 'tempo' | 'rede' };

const PREFIXO = '/problems/';

/** `https://qualquer-dominio/problems/tag-revoked` -> `tag-revoked`, se estiver na lista fechada. */
export function slugDoTipo(tipo: unknown): TipoDeProblema | null {
  if (typeof tipo !== 'string') return null;
  const i = tipo.lastIndexOf(PREFIXO);
  if (i === -1) return null;
  const slug = tipo.slice(i + PREFIXO.length);
  return Object.prototype.hasOwnProperty.call(TIPOS_DE_PROBLEMA, slug) ? (slug as TipoDeProblema) : null;
}

/** `Retry-After` em segundos (RFC 9110 permite data HTTP; aceitamos as duas formas). */
export function lerEspera(valor: string | null, agora: number = Date.now()): number | null {
  if (!valor) return null;
  if (/^\d+$/.test(valor.trim())) return Number(valor.trim());
  const data = Date.parse(valor);
  if (Number.isNaN(data)) return null;
  return Math.max(0, Math.round((data - agora) / 1000));
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Monta o resultado de problema a partir do corpo e dos cabecalhos da resposta. */
export function resultadoDeProblema(status: number, corpo: unknown, retryAfter: string | null): Resultado<never> {
  const problema = ehObjeto(corpo) && typeof corpo.type === 'string' ? (corpo as unknown as Problema) : null;
  return {
    tipo: 'problema',
    status,
    slug: slugDoTipo(problema?.type),
    problema,
    esperaSegundos: lerEspera(retryAfter),
  };
}
