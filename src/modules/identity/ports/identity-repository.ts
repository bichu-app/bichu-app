/**
 * O que o módulo `identity` exige da persistência.
 *
 * A porta é declarada por quem a **exige**, nunca por quem a implementa (§6 e
 * §11.3 de docs/03-arquitetura.md). Por isso as assinaturas falam da linguagem
 * do domínio — conta, credencial, família de sessão — e não de tabela.
 */
import type { Instant, TokenHash, UserId } from '../../../shared/types/brands.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';
import type { MotivoDaRecusa } from '../domain/reautenticacao.js';

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

export type PropositoDoToken =
  | 'email_verify'
  | 'password_reset'
  | 'email_change'
  /**
   * O "Nao fui eu" do aviso de reuso (BICHUS-215). Unico proposito que nao
   * leva a pessoa a digitar nada: o link derruba as sessoes e acaba.
   */
  | 'session_disavow';

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
  | 'account_deleted'
  /**
   * A resposta HUMANA a deteccao de reuso, e o quinto gatilho do SEC-006.
   * Distinto de `reuse_detected`, que e automatico e vale para UMA familia, e
   * de `logout_all`, que e o titular arrumando a casa: aqui alguem esta
   * declarando que a conta esta com outra pessoa.
   */
  | 'not_me';

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

/** O que a exclusão lógica deixou para trás, para a trilha poder dizer o tamanho. */
export interface ConsequenciasDaExclusao {
  readonly tagsRevogadas: number;
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

  // --- Janela de reautenticacao (BICHUS-48) -------------------------------

  /** Grava o HASH. O valor em claro so existe na resposta de `POST /auth/reauth`. */
  criarJanelaDeReautenticacao(nova: NovaJanelaDeReautenticacao): Promise<void>;

  /**
   * Consome a janela em **UMA instrução**, com as cinco amarras na cláusula
   * `WHERE` (ADR-0021: a autorização vai na cláusula, nunca num `if` depois de
   * ler a linha).
   *
   * `UPDATE reauth_tokens SET consumed_at = $agora WHERE token_hash = $1 AND
   * user_id = $2 AND scope = $3 AND access_jti = $4 AND consumed_at IS NULL AND
   * expires_at > $agora AND issued_at >= $barreira RETURNING id`.
   *
   * Conferir e depois consumir em dois passos permite corrida, e aqui a corrida
   * é o ataque: duas chamadas simultâneas de `DELETE /me` com a mesma janela
   * passariam as duas pela conferência antes de qualquer uma marcar, e o uso
   * único deixaria de ser único.
   *
   * O `motivo` da recusa sai de uma leitura SEPARADA, e só no caminho de recusa:
   * ele existe para a trilha, nunca para o corpo da resposta — as seis recusas
   * viram o mesmo 401 na borda.
   */
  consumirJanelaDeReautenticacao(
    consumo: ConsumoDeJanela,
  ): Promise<ResultadoDoConsumoDaJanela>;
  /**
   * A EXCLUSÃO LÓGICA, e o que ela leva junto na mesma transação.
   *
   * O contrato de `deleteMyAccount` diz o que esta operação é: *"Exclusão
   * lógica imediata, expurgo definitivo em 30 dias"*. Ela não apaga linha
   * nenhuma — quem apaga é {@link expurgarConta}, 30 dias depois. Aqui a conta
   * passa a `deletion_requested`, ganha `deleted_at`, e com isso sai do índice
   * `users_email_unico_ativo`: o endereço fica livre para uma conta nova no
   * mesmo instante, que é o que faz a exclusão valer para quem a pediu.
   *
   * **As tags caem junto, e é por isso que isto é uma transação e não três
   * chamadas.** O ADR-0010 diz *"casos encerrados e tags revogadas na hora"*, e
   * a tag é a única coisa deste produto que continua funcionando sozinha depois
   * que a pessoa some: ela está numa coleira, na rua, e resolve para a página
   * do achador sem ninguém autenticar. Trinta dias de QR vivo apontando para o
   * pet de uma conta excluída é o buraco que a exclusão existe para fechar.
   * Revogação é estado completo (`pet_tags_revogacao_e_completa`) e apaga o
   * texto cifrado do código (`pet_tags_revogada_nao_guarda_o_codigo`).
   *
   * Idempotente: chamada sobre uma conta já marcada, devolve `undefined`.
   */
  registrarPedidoDeExclusao(
    userId: UserId,
    agora: Instant,
  ): Promise<ConsequenciasDaExclusao | undefined>;

  /**
   * As contas cujo prazo de expurgo venceu, para a varredura do worker.
   *
   * `limite` existe para a varredura ser um passo e não um evento: uma rodada
   * que tentasse apagar dez mil contas numa transação só seguraria o banco e,
   * ao falhar numa, desfaria as nove mil e novecentas que já tinham dado certo.
   */
  contasAExpurgar(ate: Instant, limite: number): Promise<readonly UserId[]>;

  /**
   * O `DELETE FROM users` de verdade, e o ponto em que as cascatas disparam.
   *
   * **Esta é a operação que precisa CONCLUIR**, e a classe de defeito que já
   * apareceu cinco vezes em 22/09 mora exatamente aqui: contradição entre a
   * ação de deleção de uma chave estrangeira e uma restrição da mesma tabela
   * (`23514`), ou `SET NULL` de neto revalidando contra um pai que a cascata do
   * mesmo comando acabou de levar (`23503`). Nenhuma das duas aparece em teste
   * unitário, e nenhuma aparece em uso normal.
   *
   * Devolve `false` quando não havia o que apagar. O worker trata isso como
   * sucesso: outra rodada pode ter chegado antes.
   */
  expurgarConta(userId: UserId): Promise<boolean>;
  // --- Troca de e-mail ----------------------------------------------------

  /**
   * Guarda o endereço que a pessoa QUER, sem tocar no que a conta USA.
   *
   * Os dois endereços coexistem de propósito, e é essa coexistência que faz a
   * troca valer só depois da confirmação: `users.email` continua sendo o
   * endereço que entra, que recupera senha e que recebe aviso, e
   * `pending_email` é só uma intenção declarada. Enquanto a confirmação não
   * chega, quem tomou a sessão não ganhou canal nenhum.
   *
   * `pending_email` **não** tem índice único, e a ausência é decisão: duas
   * contas podem querer o mesmo endereço ao mesmo tempo, e quem o leva é quem
   * confirmar primeiro. Reservar o endereço no pedido deixaria qualquer pessoa
   * logada bloquear o cadastro alheio escrevendo o endereço de outro.
   */
  registrarPedidoDeTrocaDeEmail(userId: UserId, novoEmail: string, agora: Instant): Promise<void>;

  /**
   * Efetiva a troca, e devolve `undefined` se o endereço deixou de estar livre.
   *
   * A conferência de unicidade é o índice `users_email_unico_ativo`, e não um
   * `SELECT` antes do `UPDATE`: entre ler e escrever cabe o cadastro de outra
   * pessoa, e o caso REAL é justamente esse, porque o link fica 24 horas
   * parado numa caixa de entrada. Quem chama traduz `undefined` em 410 — o
   * mesmo 410 do token vencido, porque distinguir os dois contaria a quem tem
   * o link que aquele endereço passou a ter dono.
   *
   * Na mesma instrução o e-mail passa a valer como verificado e
   * `email_deliverable` volta a `true`: a pessoa acabou de PROVAR que alcança
   * o endereço, e uma devolução registrada contra o endereço ANTIGO não pode
   * seguir marcando a conta como inalcançável depois disso.
   */
  concluirTrocaDeEmail(
    userId: UserId,
    novoEmail: string,
    agora: Instant,
  ): Promise<Conta | undefined>;

  /**
   * Apaga a intenção de troca, sem tocar no e-mail que a conta usa.
   *
   * É a outra metade do critério 9: trocar a senha por qualquer caminho
   * invalida os pedidos de troca de e-mail pendentes. `invalidarTokensPendentes`
   * mata o TOKEN, e isso já impede a troca de se concluir — mas `pending_email`
   * sobreviveria, e a tela continuaria mostrando uma troca pendente que nenhum
   * link consegue mais concluir. Aviso que não corresponde a nada é o que ensina
   * a pessoa a ignorar aviso.
   */
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
