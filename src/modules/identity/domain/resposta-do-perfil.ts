/** A resposta `Me`, montada numa FUNÇÃO PURA. */
import type { Conta, FotoDoPerfil } from '../ports/identity-repository.js';
import { canalDeContatoConfirmado } from '../../../shared/db/canal-de-contato-confirmado.js';
import { camposPendentesDoPerfil, podeAbrirCasoDePerdido } from './completude-do-perfil.js';

/** `MyPhoto` do contrato. */
export interface FotoProjetada {
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

/** A foto, com a URL montada na LEITURA. */
export function projetarFotoDoPerfil(
  foto: FotoDoPerfil | null,
  urlDeMidia: (chave: string) => string,
): FotoProjetada | null {
  if (foto === null) return null;
  return {
    status: foto.status,
    url: foto.status === 'ready' && foto.publicKey !== null ? urlDeMidia(foto.publicKey) : null,
    rejection_reason: foto.status === 'rejected' ? foto.rejectionReason : null,
  };
}

/** O perfil como o contrato o declara, campo a campo. */
export function projetarMeuPerfil(
  conta: Conta,
  foto: FotoDoPerfil | null,
  urlDeMidia: (chave: string) => string,
): Record<string, unknown> {
  const temArea =
    conta.referencePostalCode !== null ||
    conta.referenceNeighborhood !== null ||
    conta.referenceCity !== null ||
    conta.referenceState !== null;

  return {
    id: conta.id,
    email: conta.email,
    email_verified: conta.emailVerifiedAt !== null,
    pending_email: conta.pendingEmail,
    email_deliverable: conta.emailDeliverable,
    display_name: conta.displayName,
    handle: conta.handle,
    photo: projetarFotoDoPerfil(foto, urlDeMidia),
    phone_e164: conta.phoneE164,
    phone_verified: conta.phoneVerifiedAt !== null,
    reference_area: temArea
      ? {
          postal_code: conta.referencePostalCode,
          neighborhood: conta.referenceNeighborhood,
          city: conta.referenceCity,
          state: conta.referenceState,
        }
      : null,
    pending_profile_fields: camposPendentesDoPerfil(conta),
    can_open_lost_case: podeAbrirCasoDePerdido(conta),
    contact_channel_verified: canalDeContatoConfirmado(conta),
    created_at: conta.createdAt.toISOString(),
  };
}
