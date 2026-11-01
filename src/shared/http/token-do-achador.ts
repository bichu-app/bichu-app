import type { FastifyRequest } from 'fastify';

import { problemas } from './errors.js';
import type { ResolvedorDeDimensao } from './aplicacao-de-teto.js';

/**
 * `Authorization: Bearer`, que é o que o esquema `finderToken` (`http`, `bearer`)
 * declara.
 */
export function tokenDoAchador(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.linkDoAchadorInvalido();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.linkDoAchadorInvalido();
  return token;
}

/**
 * A dimensão `finder_token` do teto: o HMAC do token, com a chave de
 * pseudonimização da borda, e nunca o token.
 */
export const resolvedorDoTokenDoAchador: ResolvedorDeDimensao = (request, sigilo) => {
  try {
    return sigilo.hmac(tokenDoAchador(request));
  } catch {
    return undefined;
  }
};
