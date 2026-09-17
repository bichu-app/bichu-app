/**
 * Projeção da sessão e da conta para a resposta.
 *
 * A forma é a do schema `SessionResponse` de `api/openapi.yaml`, campo a campo.
 * Um campo a mais aqui não quebraria nenhum cliente, e por isso passaria
 * despercebido — é exatamente por ali que implementação e contrato se afastam.
 * Quando este arquivo mudar, a conferência é contra o documento, não contra o
 * diff.
 */
import type { Instant } from '../../../shared/types/brands.js';
import type { Conta } from '../ports/identity-repository.js';

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
  created_at: string;
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

export function projetarConta(conta: Conta): MeView {
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
    // Falso quando nenhum canal de contato está verificado: os tutores por perto
    // vão receber a foto, e é pelo e-mail do tutor que alguém consegue avisá-lo.
    can_open_lost_case: conta.emailVerifiedAt !== null || conta.phoneVerifiedAt !== null,
    created_at: conta.createdAt.toISOString(),
  };
}

export interface ParDeTokens {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Instant;
}

export function projetarSessao(conta: Conta, par: ParDeTokens, agora: Instant): SessionView {
  return {
    access_token: par.accessToken,
    token_type: 'Bearer',
    expires_in: par.expiresInSeconds,
    refresh_token: par.refreshToken,
    refresh_expires_in: Math.max(0, Math.floor((par.refreshExpiresAt - agora) / 1000)),
    user: projetarConta(conta),
  };
}
