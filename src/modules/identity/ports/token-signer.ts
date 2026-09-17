/**
 * Emissão e verificação do token de acesso.
 *
 * Porta e não chamada direta porque no dia em que o Keycloak entrar, quem emite
 * muda e quem valida passa a aceitar **dois** emissores por um tempo. É a lista
 * de emissores confiáveis do ADR-0002, e ela é a decisão que a maioria dos
 * projetos esquece e paga depois.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';

export interface ClaimsDoAcesso {
  readonly sub: UserId;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
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
  emitir(sub: UserId, agora: Instant, jti: string): TokenEmitido;
  /**
   * Verifica assinatura, `alg`, `kid`, `iss`, `aud`, `exp` e `iat`.
   *
   * **Nunca deduz o algoritmo do cabeçalho do token.** Com o JWKS público,
   * aceitar HS256 permite assinar um token usando a chave pública como segredo
   * HMAC, e a assinatura confere. É a confusão de algoritmo, é velha, e continua
   * acontecendo porque a biblioteca aceita por padrão
   * (docs/04-seguranca.md 7.6).
   *
   * **`kid` desconhecido falha fechado.** Nunca tentar todas as chaves do JWKS.
   */
  verificar(token: string, agora: Instant): ResultadoDaVerificacao;
  /** Material público das duas chaves, na ordem: ativa, depois a de rotação. */
  jwks(): readonly ChavePublicaJwk[];
}
