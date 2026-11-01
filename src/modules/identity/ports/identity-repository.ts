import type { Instant, TokenHash, UserId } from '../../../shared/types/brands.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';
import type { MotivoDaRecusa } from '../domain/reautenticacao.js';

export interface Conta {
  readonly id: UserId;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly displayName: string | null;
  /** O apelido (`@`), ou `null` quando a conta não escolheu nenhum. */
  readonly handle: string | null;
  readonly phoneE164: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly referencePostalCode: string | null;
  readonly referenceNeighborhood: string | null;
  readonly referenceCity: string | null;
  readonly referenceState: string | null;
  readonly pendingEmail: string | null;
  readonly emailDeliverable: boolean;
  readonly status: 'active' | 'suspended' | 'deletion_requested';
  readonly sessionsInvalidBefore: Instant;
  readonly createdAt: Date;
}

/** A FOTO DO PROPRIO USUARIO, como o dono a ve (cliente, 18/10/2026). */
export interface FotoDoPerfil {
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/**
 * O envio que nao serve para esta conta: inexistente, de outra pessoa, de outro
 * proposito, vencido, ou de uma imagem que ja e de outra conta.
 */
export class EnvioDeFotoNaoServe extends Error {
  constructor() {
    super('envio de foto de perfil nao serve para esta conta');
    this.name = 'EnvioDeFotoNaoServe';
  }
}

export interface CamposDoPerfil {
  readonly displayName?: string | null | undefined;
  /**
   * O apelido (`@`), na edição do perfil (cliente, 18/10/2026: *"vai estar no
   * cadastro do usuário e na pagina de edição do perfil"*).
   */
  readonly handle?: string | undefined;
  readonly phoneE164?: string | null | undefined;
  readonly referencePostalCode?: string | null | undefined;
  readonly referenceNeighborhood?: string | null | undefined;
  readonly referenceCity?: string | null | undefined;
  readonly referenceState?: string | null | undefined;
}

export type PropositoDoToken =
  | 'email_verify'
  | 'password_reset'
  | 'email_change'
  /** O "Nao fui eu" do aviso de reuso (BICHUS-215). */
  | 'session_disavow';

export interface NovoTokenDeVerificacao {
  readonly id: string;
  readonly userId: UserId;
  readonly proposito: PropositoDoToken;
  /** SHA-256 de 256 bits de CSPRNG. */
  readonly tokenHash: TokenHash;
  readonly enviadoPara: string;
  readonly expiraEm: Instant;
  readonly ipHmac: Uint8Array | null;
}

export interface TokenConsumido {
  readonly userId: UserId;
  readonly enviadoPara: string;
}

export interface CredencialLocal {
  readonly identityId: string;
  readonly userId: UserId;
  readonly passwordPhc: string;
  readonly mustChange: boolean;
}

export interface NovaConta {
  readonly email: string;
  /**
   * A data de nascimento em `YYYY-MM-DD`, **já conferida** contra a idade mínima de
   * 16 anos (`shared/idade/idade-minima.ts`).
   */
  readonly birthDate: string;
  /**
   * O apelido (`@`) **normalizado e conferido**, ou `undefined` quando a pessoa não
   * escolheu nenhum.
   */
  readonly handle: string | undefined;
  readonly displayName: string | undefined;
  readonly acceptedTermsVersion: string | undefined;
  readonly passwordPhc: string;
  readonly agora: Instant;
}

export type MotivoDeRevogacao =
  | 'rotation'
  | 'reuse_detected'
  | 'logout'
  | 'logout_all'
  | 'password_changed'
  | 'account_deleted'
  /** A resposta HUMANA a deteccao de reuso, e o quinto gatilho do SEC-006. */
  | 'not_me';

export interface RefreshArmazenado {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  /** Quando esta linha nasceu. */
  readonly issuedAt: Instant;
  readonly expiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly staySignedIn: boolean;
  readonly rotatedToId: string | null;
  readonly revokedAt: Date | null;
}

export interface NovoRefresh {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  readonly tokenHash: TokenHash;
  /** O instante de nascimento, pelo relógio da aplicação. */
  readonly issuedAt: Instant;
  readonly expiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly staySignedIn: boolean;
  readonly userAgent: string | undefined;
  readonly ipHmac: Buffer | null;
}

/** O que a exclusão lógica deixou para trás, para a trilha poder dizer o tamanho. */
export interface ConsequenciasDaExclusao {
  readonly tagsRevogadas: number;
}

export interface IdentityRepository {
  /** Cria conta, vínculo `provider = 'local'` e credencial numa transação só. */
  criarContaLocal(nova: NovaConta): Promise<Conta | undefined>;

  buscarContaPorId(id: UserId): Promise<Conta | undefined>;

  /** Atualiza o perfil e devolve a conta já atualizada. */
  atualizarPerfil(id: UserId, campos: CamposDoPerfil, agora: Instant): Promise<Conta | undefined>;
  /** A foto do perfil desta conta, ou `null` quando nao ha. */
  fotoDoPerfil(id: UserId): Promise<FotoDoPerfil | null>;
  /** Troca ou TIRA a foto do perfil, numa transacao so. */
  trocarFotoDoPerfil(id: UserId, uploadId: string | null, agora: Instant): Promise<Conta | undefined>;
  buscarContaPorEmail(email: string): Promise<Conta | undefined>;
  buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined>;

  /** Regrava o hash com os parâmetros vigentes (rehash transparente). */
  regravarCredencial(identityId: string, passwordPhc: string, agora: Instant): Promise<void>;
  registrarLogin(identityId: string, agora: Instant): Promise<void>;

  gravarRefresh(novo: NovoRefresh): Promise<void>;
  buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined>;

  /** Consome o token apresentado e grava o sucessor **na mesma transação**. */
  rotacionar(tokenAtualId: string, sucessor: NovoRefresh, agora: Instant): Promise<boolean>;

  /** Revoga a família inteira. */
  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number>;

  /**
   * Revoga **todas** as famílias de refresh ainda vivas da conta, e devolve quantas
   * linhas caíram.
   */
  revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number>;

  /** SEC-006: empurra `sessions_invalid_before` para `barreira`. */
  invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void>;

  /** Grava o HASH. O valor em claro nunca chega a esta porta. */
  criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void>;

  /** Consome o token em **UMA instrução**, e devolve a quem ele pertencia. */
  consumirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined>;

  /** Só confere, sem consumir. */
  conferirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined>;

  /** Invalida todos os tokens pendentes de uma conta. */
  invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number>;

  marcarEmailVerificado(userId: UserId, agora: Instant): Promise<void>;

  /** Grava o HASH. O valor em claro so existe na resposta de `POST /auth/reauth`. */
  criarJanelaDeReautenticacao(nova: NovaJanelaDeReautenticacao): Promise<void>;

  /**
   * Consome a janela em **UMA instrução**, com as cinco amarras na cláusula `WHERE`
   * (ADR-0021: a autorização vai na cláusula, nunca num `if` depois de ler a linha).
   */
  consumirJanelaDeReautenticacao(
    consumo: ConsumoDeJanela,
  ): Promise<ResultadoDoConsumoDaJanela>;
  /** A EXCLUSÃO LÓGICA, e o que ela leva junto na mesma transação. */
  registrarPedidoDeExclusao(
    userId: UserId,
    agora: Instant,
  ): Promise<ConsequenciasDaExclusao | undefined>;

  /** As contas cujo prazo de expurgo venceu, para a varredura do worker. */
  contasAExpurgar(ate: Instant, limite: number): Promise<readonly UserId[]>;

  /** Guarda o endereço que a pessoa QUER, sem tocar no que a conta USA. */
  registrarPedidoDeTrocaDeEmail(userId: UserId, novoEmail: string, agora: Instant): Promise<void>;

  /** Efetiva a troca, e devolve `undefined` se o endereço deixou de estar livre. */
  concluirTrocaDeEmail(
    userId: UserId,
    novoEmail: string,
    agora: Instant,
  ): Promise<Conta | undefined>;

  /** Apaga a intenção de troca, sem tocar no e-mail que a conta usa. */
  cancelarTrocaDeEmailPendente(userId: UserId, agora: Instant): Promise<void>;
}

export interface NovaJanelaDeReautenticacao {
  readonly id: string;
  readonly userId: UserId;
  readonly escopo: ReauthScope;
  /** `jti` do token de acesso que pediu a janela. */
  readonly acessoJti: string;
  readonly tokenHash: TokenHash;
  readonly emitidaEm: Instant;
  readonly expiraEm: Instant;
  readonly ipHmac: Buffer | null;
}

export interface ConsumoDeJanela {
  readonly tokenHash: TokenHash;
  readonly userId: UserId;
  readonly escopoExigido: ReauthScope;
  readonly acessoJti: string;
  /** `users.sessions_invalid_before` da conta que apresenta (SEC-006). */
  readonly barreiraDaConta: Instant;
  readonly agora: Instant;
}

export type ResultadoDoConsumoDaJanela =
  | { readonly consumida: true }
  | { readonly consumida: false; readonly motivo: MotivoDaRecusa | 'inexistente' };
