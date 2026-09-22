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
  /**
   * Identificador da **família de refresh** que emitiu este token (ADR-0002,
   * emenda 1).
   *
   * **Entra agora e fica sem uso pela barreira nesta rodada.** A razão é
   * estreita e vale o custo zero que tem: acrescentar campo a um token que já
   * está em aparelho publicado é mudança de contrato com versão antiga em campo
   * por meses, e o dia em que a revogação por sessão for necessária é o dia em
   * que ela precisa **já** estar possível. Hoje quem revoga em massa é
   * `users.sessions_invalid_before`, e `autenticar()` já lê o banco em toda
   * requisição para conferi-la — passar a conferir a sessão seria uma junção
   * naquela leitura, não uma arquitetura nova.
   *
   * **Opcional de propósito, e é aqui que mora a compatibilidade.** Todo token
   * emitido a partir desta mudança carrega `sid`; os que já circulam, não. Se
   * o campo fosse obrigatório na verificação, todo token em campo seria
   * recusado e a base inteira cairia na subida — exatamente o estrago que
   * declarar o campo cedo existe para evitar. Na EMISSÃO ele é obrigatório,
   * pelo parâmetro de `emitir`: token novo sem `sid` não compila.
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
  /**
   * `sid` é a família de refresh que está emitindo. É **parâmetro obrigatório**
   * e não opção: um emissor que pudesse esquecê-lo produziria, em silêncio,
   * tokens sem o campo que a revogação por sessão vai precisar — e a falta só
   * apareceria no dia em que alguém fosse usá-lo.
   */
  emitir(sub: UserId, agora: Instant, jti: string, sid: string): TokenEmitido;
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
