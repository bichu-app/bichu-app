import type { Instant } from '../../../shared/types/brands.js';
import type { Conta } from '../ports/identity-repository.js';
import type { FotoProjetada } from '../domain/resposta-do-perfil.js';
import { canalDeContatoConfirmado } from '../../../shared/db/canal-de-contato-confirmado.js';

export type CampoPendente = 'email_verification' | 'phone' | 'display_name' | 'reference_area';

export interface MeView {
  id: string;
  email: string;
  email_verified: boolean;
  pending_email: string | null;
  email_deliverable: boolean;
  display_name: string | null;
  phone_e164: string | null;
  phone_verified: boolean;
  reference_area: {
    postal_code: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
  pending_profile_fields: CampoPendente[];
  can_open_lost_case: boolean;
  contact_channel_verified: boolean;
  created_at: string;
  /** A FOTO DA PRÓPRIA PESSOA, a mesma que `getMe` devolve. */
  photo: FotoProjetada | null;
}

export interface SessionView {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: MeView;
}

function temAreaDeReferencia(conta: Conta): boolean {
  return (
    conta.referencePostalCode !== null ||
    conta.referenceNeighborhood !== null ||
    conta.referenceCity !== null
  );
}

/** A conta como `Me`, campo a campo. */
export function projetarConta(conta: Conta, foto: FotoProjetada | null): MeView {
  const pendentes: CampoPendente[] = [];
  if (conta.emailVerifiedAt === null) pendentes.push('email_verification');
  if (conta.phoneE164 === null) pendentes.push('phone');
  if (conta.displayName === null) pendentes.push('display_name');
  if (!temAreaDeReferencia(conta)) pendentes.push('reference_area');

  return {
    id: conta.id,
    email: conta.email,
    email_verified: conta.emailVerifiedAt !== null,
    pending_email: conta.pendingEmail,
    email_deliverable: conta.emailDeliverable,
    display_name: conta.displayName,
    phone_e164: conta.phoneE164,
    phone_verified: conta.phoneVerifiedAt !== null,
    reference_area: temAreaDeReferencia(conta)
      ? {
          postal_code: conta.referencePostalCode,
          neighborhood: conta.referenceNeighborhood,
          city: conta.referenceCity,
          state: conta.referenceState,
        }
      : null,
    pending_profile_fields: pendentes,
    can_open_lost_case: canalDeContatoConfirmado(conta),
    contact_channel_verified: canalDeContatoConfirmado(conta),
    created_at: conta.createdAt.toISOString(),
    photo: foto,
  };
}

export interface ParDeTokens {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Instant;
}

export function projetarSessao(
  conta: Conta,
  par: ParDeTokens,
  agora: Instant,
  foto: FotoProjetada | null,
): SessionView {
  return {
    access_token: par.accessToken,
    token_type: 'Bearer',
    expires_in: par.expiresInSeconds,
    refresh_token: par.refreshToken,
    refresh_expires_in: Math.max(0, Math.floor((par.refreshExpiresAt - agora) / 1000)),
    user: projetarConta(conta, foto),
  };
}
