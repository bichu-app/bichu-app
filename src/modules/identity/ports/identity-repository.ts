/**
 * O que o módulo `identity` exige da persistência.
 *
 * A porta é declarada por quem a **exige**, nunca por quem a implementa (§6 e
 * §11.3 de docs/03-arquitetura.md). Por isso as assinaturas falam da linguagem
 * do domínio — conta, credencial, família de sessão — e não de tabela.
 */
import type { Instant, TokenHash, UserId } from '../../../shared/types/brands.js';

export interface Conta {
  readonly id: UserId;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly displayName: string | null;
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

export interface CamposDoPerfil {
  readonly displayName?: string | null | undefined;
  readonly phoneE164?: string | null | undefined;
  readonly referencePostalCode?: string | null | undefined;
  readonly referenceNeighborhood?: string | null | undefined;
  readonly referenceCity?: string | null | undefined;
  readonly referenceState?: string | null | undefined;
}

export type PropositoDoToken = 'email_verify' | 'password_reset' | 'email_change';

export interface NovoTokenDeVerificacao {
  readonly id: string;
  readonly userId: UserId;
  readonly proposito: PropositoDoToken;
  /** SHA-256 de 256 bits de CSPRNG. O valor em claro não é guardado. */
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
  | 'account_deleted';

export interface RefreshArmazenado {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  /**
   * Quando esta linha nasceu. É o que `renovar()` compara com
   * `users.sessions_invalid_before` (SEC-006): refresh anterior à barreira é
   * recusado, e sem este campo a comparação não tem com o que ser feita.
   *
   * Vem do relógio da aplicação, e não do `DEFAULT now()` do banco: o outro
   * lado da comparação também é gravado pela aplicação, e misturar os dois
   * relógios faria a barreira valer alguns milissegundos a mais ou a menos sem
   * que ninguém percebesse.
   */
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
  /**
   * O instante de nascimento, pelo relógio da aplicação. Obrigatório de
   * propósito: a coluna tem `DEFAULT now()`, e deixar o banco preenchê-la
   * colocaria os dois lados da barreira do SEC-006 em relógios diferentes.
   */
  readonly issuedAt: Instant;
  readonly expiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly staySignedIn: boolean;
  readonly userAgent: string | undefined;
  readonly ipHmac: Buffer | null;
}

export interface IdentityRepository {
  /**
   * Cria conta, vínculo `provider = 'local'` e credencial numa transação só.
   * Devolve `undefined` quando o e-mail já tem conta viva — e devolver em vez de
   * lançar é de propósito: quem chama precisa decidir o que a resposta revela.
   */
  criarContaLocal(nova: NovaConta): Promise<Conta | undefined>;

  buscarContaPorId(id: UserId): Promise<Conta | undefined>;

  /**
   * Atualiza o perfil e devolve a conta já atualizada.
   *
   * **Não aceita `email`** (SEC-003), e a ausência é a regra: trocar o e-mail é
   * operação própria e assíncrona. Aceitar aqui faria a resposta revelar se um
   * endereço já tem conta — o erro de unicidade viraria um oráculo de
   * existência, consultável por qualquer pessoa logada.
   *
   * `undefined` em um campo significa "não mexer"; `null` significa "apagar".
   * São coisas diferentes e o `PATCH` precisa das duas.
   */
  atualizarPerfil(id: UserId, campos: CamposDoPerfil, agora: Instant): Promise<Conta | undefined>;
  buscarContaPorEmail(email: string): Promise<Conta | undefined>;
  buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined>;

  /** Regrava o hash com os parâmetros vigentes (rehash transparente). */
  regravarCredencial(identityId: string, passwordPhc: string, agora: Instant): Promise<void>;
  registrarLogin(identityId: string, agora: Instant): Promise<void>;

  gravarRefresh(novo: NovoRefresh): Promise<void>;
  buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined>;

  /**
   * Consome o token apresentado e grava o sucessor **na mesma transação**.
   * Devolve `false` quando o token já havia sido consumido ou revogado — ler e
   * depois atualizar em dois passos permitiria a dois pedidos simultâneos
   * rotacionarem o mesmo token.
   */
  rotacionar(tokenAtualId: string, sucessor: NovoRefresh, agora: Instant): Promise<boolean>;

  /** Revoga a família inteira. Usada no logout e na detecção de reuso. */
  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number>;

  /**
   * Revoga **todas** as famílias de refresh ainda vivas da conta, e devolve
   * quantas linhas caíram.
   *
   * É a outra metade de `invalidarSessoes`, e não um atalho dela. A barreira
   * derruba o token de **acesso** em menos de um segundo; ela não toca em
   * `refresh_tokens`. Sem esta chamada, um refresh copiado antes do gatilho
   * continua sendo uma linha viva no banco até vencer por inatividade — e o
   * único motivo de ele não renovar é a barreira que `renovar()` passou a ler
   * (BICHUS-77). Rede de proteção não substitui a revogação: quem depende só
   * dela fica a uma refatoração de distância de voltar ao defeito.
   */
  revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number>;

  /**
   * SEC-006: empurra `sessions_invalid_before` para `barreira`.
   *
   * `barreira` e `agora` são parâmetros SEPARADOS de propósito. A barreira sai
   * de `instanteDeRevogacao` e pode estar até um segundo à frente do relógio,
   * para alcançar o token que a emissão datou à frente numa revogação anterior
   * do mesmo segundo; `agora` é o relógio da requisição e é o que vai para
   * `updated_at`. Um parâmetro só convidaria a gravar o relógio e deixar o
   * defeito de volta.
   *
   * A gravação é **monotônica**: a coluna nunca anda para trás, porque duas
   * revogações simultâneas leem a mesma barreira anterior e a que escrever por
   * último não pode desfazer a que escreveu antes.
   */
  invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void>;

  // --- Tokens de verificação e de redefinição -----------------------------

  /** Grava o HASH. O valor em claro nunca chega a esta porta. */
  criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void>;

  /**
   * Consome o token em **UMA instrução**, e devolve a quem ele pertencia.
   *
   * `UPDATE ... SET consumed_at = now() WHERE token_hash = $1 AND consumed_at
   * IS NULL AND expires_at > now() RETURNING user_id`.
   *
   * Conferir e depois atualizar em dois passos permite corrida: duas aberturas
   * simultâneas do mesmo link — que é o caso REAL, porque cliente de e-mail
   * pré-carrega o link e a pessoa clica em seguida — passariam as duas pela
   * conferência antes de qualquer uma marcar. Numa redefinição de senha, isso é
   * duas trocas de senha a partir de um token de uso único.
   *
   * `undefined` cobre inexistente, expirado e já consumido. São a mesma
   * resposta (410) de propósito: distinguir contaria a um estranho se aquele
   * token existiu.
   */
  consumirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined>;

  /**
   * Só confere, sem consumir. Serve à página que o time web renderiza antes do
   * formulário, e à recusa de senha fraca **sem gastar o token** (critério 12).
   */
  conferirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined>;

  /**
   * Invalida todos os tokens pendentes de uma conta.
   *
   * Chamada em toda troca de senha, por qualquer caminho (critério 9 de
   * BICHUS-77): um link de redefinição emitido antes da troca continuaria
   * valendo depois dela, e é exatamente por ele que quem tomou a conta volta.
   */
  invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number>;

  marcarEmailVerificado(userId: UserId, agora: Instant): Promise<void>;
}
