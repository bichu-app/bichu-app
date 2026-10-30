/** O que os casos de uso de passkey exigem do armazenamento. */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { PropositoDoDesafio, RazaoDaRevogacao } from '../domain/passkey.js';

/** Uma credencial, do ponto de vista de quem verifica uma asserção. */
export interface CredencialDePasskey {
  readonly id: string;
  readonly userId: UserId;
  readonly credentialId: Buffer;
  readonly publicKey: Buffer;
  /**
   * `bigint` e não `number`: o contador do WebAuthn tem 32 bits SEM sinal, e o `pg`
   * entrega `bigint` do Postgres como `string`.
   */
  readonly signCount: bigint;
  readonly revogadaEm: Instant | null;
}

/** Uma credencial ativa, do ponto de vista da TELA. */
export interface PasskeyDaTela {
  readonly id: string;
  readonly label: string | null;
  readonly criadaEm: Instant;
  readonly usadaEm: Instant | null;
}

export interface DesafioGuardado {
  readonly id: string;
  readonly userId: UserId | null;
  readonly purpose: PropositoDoDesafio;
  readonly expiraEm: Instant;
  readonly consumidoEm: Instant | null;
}

export interface NovaCredencial {
  readonly id: string;
  readonly userId: UserId;
  readonly credentialId: Buffer;
  readonly publicKey: Buffer;
  readonly signCount: bigint;
  readonly label: string | null;
  readonly transports: readonly string[] | null;
}

export interface PasskeyRepository {
  /**
   * Guarda o desafio. `userId` é nulo nos de ENTRADA e preenchido nos de CADASTRO —
   * imposto também pela `CHECK` da tabela, porque invariante que vive só no código é
   * invariante que a próxima escrita contorna.
   */
  guardarDesafio(desafio: {
    readonly id: string;
    readonly userId: UserId | null;
    readonly purpose: PropositoDoDesafio;
    readonly challengeHash: Buffer;
    readonly expiraEm: Instant;
  }): Promise<void>;

  /** Acha o desafio PELO HASH do desafio que voltou no `clientDataJSON`. */
  acharDesafioPorHash(challengeHash: Buffer): Promise<DesafioGuardado | undefined>;

  /** Consome o desafio, e devolve se ESTA chamada foi a que o consumiu. */
  consumirDesafio(id: string, agora: Instant): Promise<boolean>;

  /** As credenciais ATIVAS da conta, mais recente primeiro. */
  ativasDaConta(userId: UserId): Promise<readonly PasskeyDaTela[]>;

  /** Os `credential_id` ativos da conta, para o `excludeCredentials`. */
  credenciaisAtivasParaExcluir(userId: UserId): Promise<readonly Buffer[]>;

  /** Quantas ATIVAS a conta tem. */
  contarAtivas(userId: UserId): Promise<number>;

  /** Acha a credencial pelo `credential_id`, ATIVA OU REVOGADA. */
  acharPorCredentialId(credentialId: Buffer): Promise<CredencialDePasskey | undefined>;

  /** Grava a credencial nova. */
  gravar(credencial: NovaCredencial, agora: Instant): Promise<PasskeyDaTela>;

  /** Avança o contador e marca o uso, **condicionado ao contador guardado**. */
  avancarContador(id: string, de: bigint, para: bigint, agora: Instant): Promise<boolean>;

  /** Marca revogada. NUNCA apaga (decisão do cliente de 26/10). */
  revogar(
    id: string,
    userId: UserId,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<'revogada' | 'nao-encontrada'>;

  /** Revoga por `credential_id`, sem dono conhecido. */
  revogarPorCredentialId(
    credentialId: Buffer,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<void>;
}
