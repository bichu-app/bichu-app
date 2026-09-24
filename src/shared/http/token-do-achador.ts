/**
 * O token do achador sem conta, como as seis operações de `finderToken` o
 * recebem (BICHUS-41).
 *
 * Mora em `shared/http` porque duas famílias de rota o leem (`messaging`, a
 * conversa; `found`, o "Contar mais" e a foto), e uma cópia em cada módulo
 * divergiria no primeiro ajuste: o mesmo token passaria numa rota e seria
 * recusado na outra.
 */
import type { FastifyRequest } from 'fastify';

import { problemas } from './errors.js';
import type { ResolvedorDeDimensao } from './aplicacao-de-teto.js';

/**
 * `Authorization: Bearer`, que é o que o esquema `finderToken` (`http`,
 * `bearer`) declara. A página `/c/{finderToken}` do site o repassa aqui.
 *
 * Ausente responde **403**, e não 401: é o único status de recusa de credencial
 * que estas operações declaram, e `unauthenticated` mandaria a tela ao login de
 * quem não tem conta.
 */
export function tokenDoAchador(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.semPermissao();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.semPermissao();
  return token;
}

/**
 * A dimensão `finder_token` do teto: o HMAC do token, com a chave de
 * pseudonimização da borda, e nunca o token. `bucket_key` é lida por quem opera
 * o banco, e o token em claro ali abriria a conversa de alguém. Sem token não
 * há balde, e a recusa sai do handler.
 */
export const resolvedorDoTokenDoAchador: ResolvedorDeDimensao = (request, sigilo) => {
  try {
    return sigilo.hmac(tokenDoAchador(request));
  } catch {
    return undefined;
  }
};
