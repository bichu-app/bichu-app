/**
 * O que sobrou da sessao administrativa dentro de `identity`: a recusa da
 * "conta dedicada" na porta do app (D42 de 23/09).
 *
 * A sessao do painel mudou para `src/modules/admin-access/` (ADR-0027 item
 * 20). Estas duas definicoes ficam aqui so enquanto `auth-service.ts` as usa, e
 * saem junto com as recusas dela na fatia 3 do item 20.7: com o painel em
 * `admin_accounts`, `user_roles` so aceita `tutor` e a recusa nunca dispara.
 */

/** Os papeis que tornavam a conta do app DEDICADA ao painel (D42 de 23/09). */
export const PAPEIS_DE_CONTA_DEDICADA: readonly string[] = ['admin', 'moderator'];

export function ehContaDedicada(papeis: readonly string[]): boolean {
  return papeis.some((papel) => PAPEIS_DE_CONTA_DEDICADA.includes(papel));
}
