import { canalDeContatoConfirmado } from '../../../shared/db/canal-de-contato-confirmado.js';

export type CampoPendente = 'email_verification' | 'phone' | 'display_name' | 'reference_area';

export interface PerfilParaConferir {
  readonly emailVerifiedAt: Date | null;
  readonly phoneE164: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly displayName: string | null;
  readonly referencePostalCode: string | null;
  readonly referenceCity: string | null;
}

/**
 * Na ordem em que a tela deve cobrá-los, e essa ordem não é alfabética: é a da
 * consequência.
 */
export function camposPendentesDoPerfil(perfil: PerfilParaConferir): CampoPendente[] {
  const pendentes: CampoPendente[] = [];
  if (perfil.emailVerifiedAt === null) pendentes.push('email_verification');
  if (perfil.displayName === null || perfil.displayName.trim() === '') pendentes.push('display_name');
  if (perfil.referencePostalCode === null && perfil.referenceCity === null) {
    pendentes.push('reference_area');
  }
  if (perfil.phoneE164 === null) pendentes.push('phone');
  return pendentes;
}

/** Verdadeiro quando **algum** canal de contato está verificado. */
export function podeAbrirCasoDePerdido(perfil: PerfilParaConferir): boolean {
  return canalDeContatoConfirmado(perfil);
}
