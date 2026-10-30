/** O aparelho registrado para push, e a única regra de negócio que ele carrega. */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';

/** As duas do contrato (`Device.platform`). */
export type PlataformaDoAparelho = 'android' | 'ios';

/** O que a pessoa respondeu à antessala da BICHUS-24. */
export type PermissaoDePush = 'granted' | 'denied' | 'not_asked';

/** Por que um aparelho deixou de existir. */
export type MotivoDaRevogacao =
  /** O tutor removeu pelo Perfil, ou o app removeu ao sair da conta (critério 3). */
  | 'user_removed'
  /**
   * O FCM recusou o token como inexistente: `UNREGISTERED` ou `NOT_FOUND` (critério
   * 4).
   */
  | 'token_rejected'
  /** Outra conta registrou o mesmo token do FCM. */
  | 'reclaimed_by_other_account';

/** O aparelho como o domínio o conhece. */
export interface Aparelho {
  readonly id: string;
  readonly dono: UserId;
  readonly plataforma: PlataformaDoAparelho;
  readonly pushToken: TokenDeAparelho | null;
  readonly permissao: PermissaoDePush;
  readonly versaoDoApp: string | null;
  readonly versaoDoSistema: string | null;
  readonly registradoEm: Instant;
  readonly vistoEm: Instant;
}

/** O que chega de `POST /v1/me/devices`, já validado pelo schema do contrato. */
export interface RegistroDeAparelho {
  readonly plataforma: PlataformaDoAparelho;
  readonly pushToken: TokenDeAparelho | null;
  readonly permissao: PermissaoDePush;
  readonly versaoDoApp: string | null;
  readonly versaoDoSistema: string | null;
}

/** **Os critérios 1 e 4 do ADR-0006, e nada mais que isso.** */
export function podeReceberPush(aparelho: Aparelho): boolean {
  return aparelho.permissao === 'granted' && aparelho.pushToken !== null;
}

/** A conta tem como ser avisada por push? */
export function contaEAlcancavelPorPush(aparelhos: readonly Aparelho[]): boolean {
  return aparelhos.some(podeReceberPush);
}
