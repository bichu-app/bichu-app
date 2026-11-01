import type { Instant, UserId } from '../../../shared/types/brands.js';

export interface ClaimsDoAcesso {
  readonly sub: UserId;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  /**
   * Identificador da **família de refresh** que emitiu este token (ADR-0002, emenda
   * 1).
   */
  readonly sid?: string;
}

export interface TokenEmitido {
  readonly token: string;
  readonly expiresInSeconds: number;
  readonly issuedAt: number;
  readonly jti: string;
}

export interface ChavePublicaJwk {
  readonly kty: 'RSA';
  readonly kid: string;
  readonly use: 'sig';
  readonly alg: 'RS256';
  readonly n: string;
  readonly e: string;
}

export type FalhaDeVerificacao =
  | 'malformado'
  | 'algoritmo_nao_permitido'
  | 'kid_desconhecido'
  | 'assinatura_invalida'
  | 'emissor_nao_confiavel'
  | 'audiencia_incorreta'
  | 'expirado'
  | 'emitido_no_futuro';

export type ResultadoDaVerificacao =
  | { readonly ok: true; readonly claims: ClaimsDoAcesso }
  | { readonly ok: false; readonly motivo: FalhaDeVerificacao };

export interface TokenSigner {
  /** `sid` é a família de refresh que está emitindo. */
  emitir(sub: UserId, agora: Instant, jti: string, sid: string): TokenEmitido;
  /** Verifica assinatura, `alg`, `kid`, `iss`, `aud`, `exp` e `iat`. */
  verificar(token: string, agora: Instant): ResultadoDaVerificacao;
  /** Material público das duas chaves, na ordem: ativa, depois a de rotação. */
  jwks(): readonly ChavePublicaJwk[];
}
