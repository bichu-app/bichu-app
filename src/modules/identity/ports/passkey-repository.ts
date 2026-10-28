/**
 * O que os casos de uso de passkey exigem do armazenamento.
 *
 * Porta, e não o Kysely: `application/` não conhece banco (regra
 * `domainPurity` do ESLint), e um teste de verificação WebAuthn não deve
 * precisar de Postgres para rodar.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { PropositoDoDesafio, RazaoDaRevogacao } from '../domain/passkey.js';

/** Uma credencial, do ponto de vista de quem verifica uma asserção. */
export interface CredencialDePasskey {
  readonly id: string;
  readonly userId: UserId;
  readonly credentialId: Buffer;
  readonly publicKey: Buffer;
  /**
   * `bigint` e não `number`: o contador do WebAuthn tem 32 bits SEM sinal, e o
   * `pg` entrega `bigint` do Postgres como `string`. A conversão acontece no
   * repositório, uma vez, e daqui para dentro o tipo já é exato.
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
   * Guarda o desafio. `userId` é nulo nos de ENTRADA e preenchido nos de
   * CADASTRO — imposto também pela `CHECK` da tabela, porque invariante que vive
   * só no código é invariante que a próxima escrita contorna.
   */
  guardarDesafio(desafio: {
    readonly id: string;
    readonly userId: UserId | null;
    readonly purpose: PropositoDoDesafio;
    readonly challengeHash: Buffer;
    readonly expiraEm: Instant;
  }): Promise<void>;

  /**
   * Acha o desafio PELO HASH do desafio que voltou no `clientDataJSON`.
   *
   * É a única busca possível na conclusão da ENTRADA: lá o servidor não sabe de
   * quem é a tentativa, de propósito — a operação não recebe e-mail, para não
   * virar oráculo de enumeração de conta.
   */
  acharDesafioPorHash(challengeHash: Buffer): Promise<DesafioGuardado | undefined>;

  /**
   * Consome o desafio, e devolve se ESTA chamada foi a que o consumiu.
   *
   * `false` quer dizer que alguém chegou primeiro — e aí a tentativa é recusada.
   * É isso que torna o uso único resistente a duas requisições simultâneas: a
   * decisão é do `UPDATE ... WHERE consumed_at IS NULL`, no banco, e não de um
   * `if` lido antes.
   */
  consumirDesafio(id: string, agora: Instant): Promise<boolean>;

  /** As credenciais ATIVAS da conta, mais recente primeiro. */
  ativasDaConta(userId: UserId): Promise<readonly PasskeyDaTela[]>;

  /** Os `credential_id` ativos da conta, para o `excludeCredentials`. */
  credenciaisAtivasParaExcluir(userId: UserId): Promise<readonly Buffer[]>;

  /** Quantas ATIVAS a conta tem. Para o teto. */
  contarAtivas(userId: UserId): Promise<number>;

  /**
   * Acha a credencial pelo `credential_id`, ATIVA OU REVOGADA.
   *
   * Revogada volta de propósito: quem verifica precisa distinguir "não existe"
   * de "foi revogada" para **não** recadastrar um `credential_id` descartado, e
   * o índice único é total justamente por isso. A RESPOSTA ao cliente é a mesma
   * nos dois casos — o 401 é idêntico —, mas a decisão interna não é.
   */
  acharPorCredentialId(credentialId: Buffer): Promise<CredencialDePasskey | undefined>;

  /** Grava a credencial nova. Recusa por índice único quando o `credential_id` já existe. */
  gravar(credencial: NovaCredencial, agora: Instant): Promise<PasskeyDaTela>;

  /**
   * Avança o contador e marca o uso, **condicionado ao contador guardado**.
   *
   * Devolve se avançou. `false` é corrida: duas asserções com o mesmo contador
   * chegaram juntas, e só uma pode valer. Condicionar no `WHERE` é o que impede
   * que a verificação feita em memória seja desfeita por uma escrita
   * concorrente.
   */
  avancarContador(id: string, de: bigint, para: bigint, agora: Instant): Promise<boolean>;

  /** Marca revogada. NUNCA apaga (decisão do cliente de 26/10). */
  revogar(
    id: string,
    userId: UserId,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<'revogada' | 'nao-encontrada'>;

  /**
   * Revoga por `credential_id`, sem dono conhecido. Só a detecção de contador
   * repetido usa isto: ali o servidor age sobre uma credencial cuja asserção
   * não conferiu, então não há sessão para provar posse.
   */
  revogarPorCredentialId(
    credentialId: Buffer,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<void>;
}
