import { sql, type RawBuilder } from 'kysely';

/** Os apelidos de `users` que as consultas deste repositório usam. */
export type ApelidoDeUsuarios = 'a' | 'outro' | 'u' | 'users';

/**
 * A régua **como expressão de SQL**, sobre o apelido de `users` que a consulta já
 * tem.
 */
export function canalDeContatoConfirmadoNoSql<T = boolean>(
  apelido: ApelidoDeUsuarios,
): RawBuilder<T> {
  const t = sql.raw(apelido);
  return sql<T>`(${t}.email_verified_at IS NOT NULL OR ${t}.phone_verified_at IS NOT NULL)`;
}

/**
 * A régua **como predicado de TypeScript**, para quem já tem a conta em memória —
 * hoje, as duas projeções de `Me`.
 */
export function canalDeContatoConfirmado(conta: {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}): boolean {
  return conta.emailVerifiedAt !== null || conta.phoneVerifiedAt !== null;
}
