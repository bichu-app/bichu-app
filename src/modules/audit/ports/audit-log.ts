/**
 * Porta da trilha de auditoria.
 *
 * É a única coisa que outro módulo enxerga de `audit` (§6 de
 * docs/03-arquitetura.md). Quem grava um evento não sabe, e não precisa saber,
 * que existe um esquema separado e um papel de banco sem `UPDATE` nem `DELETE`
 * do outro lado.
 *
 * **O ator é sempre o UUID interno, nunca o e-mail** (BICHUS-56, critério 3), e
 * é por isso que `actorUserId` é `UserId` e não `string`: passar um e-mail aqui
 * não compila.
 *
 * **Nunca registrar** senha, token de qualquer espécie, código de tag em claro,
 * coordenada bruta nem conteúdo de mensagem (docs/04-seguranca.md 9).
 */
import type { DbTransaction } from '../../../shared/db/pool.js';
import type { AdminAccountId, UserId } from '../../../shared/types/brands.js';

/**
 * Ações da trilha. União fechada pelo mesmo motivo de `ProblemType`: ação
 * inventada no meio do código não compila, e a lista de eventos obrigatórios
 * fica verificável em vez de depender de quem lembrou de chamar.
 */
export type AuditAction =
  // Identidade e sessão
  | 'auth.account_created'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.session_refreshed'
  | 'auth.refresh_reuse_detected'
  /** Refresh anterior a `sessions_invalid_before` (SEC-006). Tentativa negada. */
  | 'auth.refresh_rejected_revoked_session'
  | 'auth.sessions_revoked'
  | 'auth.password_changed'
  /** Tentativa de troca de senha recusada por senha atual errada (BICHUS-125). */
  | 'auth.password_change_refused'
  /**
   * BICHUS-48. A janela de reautenticacao de 5 minutos.
   *
   * Sao quatro eventos e nao dois, porque as duas metades respondem perguntas
   * diferentes numa investigacao de tomada de conta: `reauth_refused` em
   * sequencia e alguem testando senhas de dentro de uma sessao tomada;
   * `reauth_window_refused` em sequencia e alguem tentando reaproveitar,
   * mover de aparelho ou trocar o escopo de uma janela. O `metadata` carrega o
   * escopo e o motivo interno da recusa -- que nunca sai no corpo da resposta.
   */
  | 'auth.reauth_granted'
  | 'auth.reauth_refused'
  | 'auth.reauth_window_used'
  | 'auth.reauth_window_refused'
  | 'auth.password_rehashed'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  /**
   * Pediram a troca do e-mail da conta (BICHUS-42). Fica na trilha mesmo
   * quando nenhum token é emitido — o pedido para um endereço que já tem dono
   * é indistinguível na resposta, e a trilha é o único lugar onde ele aparece.
   */
  | 'auth.email_change_requested'
  /** A troca foi confirmada no endereço novo e `users.email` mudou. */
  | 'auth.email_changed'
  // Autorização
  | 'authz.denied'
  /**
   * ADR-0027 item 20.3 (D51). A conta do painel criada, com senha redefinida,
   * desativada, reativada ou com as sessoes encerradas pelo comando
   * `src/bin/conta-admin.ts`, e so por ele. Ator `system`: quem executa e o
   * comando no servidor, e quem digitou vai em `metadata.operator`. Fora de
   * `ACOES_ADMINISTRATIVAS` de proposito: aquela lista espelha o `x-audit` do
   * contrato HTTP, e nada disto e operacao HTTP (D61).
   */
  | 'admin.account.created'
  | 'admin.account.password_reset'
  | 'admin.account.disabled'
  | 'admin.account.enabled'
  | 'admin.account.sessions_closed'
  | 'profile.updated'
  // Cadastro do pet
  | 'pet.created'
  | 'pet.updated'
  | 'pet.deleted'
  // Tag, caso, conversa e moderação entram com as histórias que as criam.
  | 'tag.issued'
  | 'tag.revoked'
  | 'lost_case.opened'
  | 'lost_case.closed'
  | 'lost_case.alert_dispatched'
  | 'match.candidate_decided'
  /** BICHUS-43. A conversa nasceu de um aviso. Ator anônimo quando o achador não tem conta. */
  | 'conversation.opened'
  /**
   * BICHUS-43, critérios 10 e 11. A conversa foi retida para revisão humana.
   * O metadado carrega o MOTIVO, e nunca o texto das mensagens.
   */
  | 'conversation.held_for_review'
  | 'conversation.reported'
  | 'conversation.blocked'
  | 'moderation.decided'
  | 'privacy.account_deletion_requested'
  /**
   * BICHUS-215. O expurgo definitivo de 30 dias concluiu e a linha de `users`
   * deixou de existir.
   *
   * `audit.events` nao referencia `users` de proposito, entao este evento
   * sobrevive ao que ele registra: e a UNICA memoria de que aquela conta
   * existiu e de quando ela foi apagada, e e o que torna o prazo do ADR-0010
   * verificavel por quem audita de fora. O metadado nao carrega e-mail, nome
   * nem coordenada -- o que sobrevive a exclusao nao pode reconstituir o
   * perfil que a exclusao existe para apagar.
   */
  | 'privacy.account_purged'
  /**
   * BICHUS-215, gatilho 4 do SEC-006. Alguem respondeu "Nao fui eu" ao aviso
   * de reuso, pelo link do e-mail, sem conta. `actorKind` e `anonymous`: quem
   * apresentou o token provou ter a caixa de entrada, e nao provou ser o
   * titular.
   */
  | 'auth.session_disavowed'
  | 'privacy.data_export_requested'
  /**
   * BICHUS-92. A conta entrou (ou atualizou) a localizacao de referencia.
   * O metadado carrega a ORIGEM e a PRECISAO; a coordenada nao entra aqui,
   * pela regra do cabecalho deste arquivo e porque a trilha sobrevive a
   * exclusao da conta de proposito.
   */
  | 'privacy.reference_location_set'
  /** A conta saiu do raio de alerta por `DELETE /v1/me/location`. */
  | 'privacy.reference_location_cleared'
  // Aparelho e token de push (BICHUS-91)
  /**
   * `POST /v1/me/devices`. O metadado carrega plataforma e permissao; **o token
   * nao entra**, pela regra do cabecalho deste arquivo ("nunca registrar ...
   * token de qualquer especie") e porque a trilha sobrevive a exclusao da conta.
   */
  | 'device.registered'
  /**
   * O aparelho deixou de existir, e o metadado diz por que (`reason`). E a
   * UNICA memoria da revogacao: a linha e apagada, e a trilha nao referencia
   * `users`, entao ela responde "por que este aparelho parou de receber?"
   * inclusive depois de a conta ter sido apagada.
   */
  | 'device.revoked'
  // Transferencia de pet (BICHUS-66). Quatro eventos e nao um com `status`: a
  // pergunta que a trilha responde e "quando cada coisa aconteceu", e um evento
  // unico com estado obrigaria a reconstruir a ordem por carimbo.
  //
  // O metadado NUNCA carrega token nem endereco em claro: `pet_transfer.started`
  // grava `recipient_email_masked`, e a razao e que a trilha sobrevive a
  // exclusao da conta -- o endereco em claro ficaria ali depois de a pessoa ter
  // pedido para sumir, e ela pode nem ter tido conta.
  | 'pet_transfer.started'
  | 'pet_transfer.accepted'
  /** Ator anonimo quando o cancelamento veio pelo link do e-mail, sem conta. */
  | 'pet_transfer.cancelled'
  /**
   * A posse mudou e as tags cairam. Ator `system`: quem executa e o trabalho
   * agendado 24 h antes, e nao a pessoa que aceitou.
   */
  | 'pet_transfer.consummated'
  // Backoffice (ADR-0027, apendice A.5). O padrao e `admin.<recurso>.<verbo>`
  // (D49), e cada valor e o `x-audit.action` de uma operacao do contrato, ou um
  // dos eventos que o item 8 manda gravar sem ser escrita (login recusado,
  // recusa da guarda). A lista entra inteira de uma vez, e nao fatia a fatia:
  // `src/modules/audit/ports/acoes-administrativas.test.ts` confere que todo
  // `x-audit.action` do contrato esta aqui, e o contrato ja declara todas.
  | AcaoAdministrativa;

/**
 * As acoes da superficie administrativa, como valor e como tipo.
 *
 * Existe como lista, e nao so como uniao, porque a declaracao da rota mora em
 * `shared/http/route-definition.ts`, que nao conhece este modulo: la a acao e
 * uma cadeia `admin.*`, e e aqui que ela vira `AuditAction` (ver
 * `eventoAdministrativo`, em `trilha-administrativa.ts`).
 */
export const ACOES_ADMINISTRATIVAS = [
  'admin.session.opened',
  'admin.session.denied',
  'admin.session.closed',
  'admin.session.all_closed',
  'admin.session.reauthenticated',
  'admin.guard.denied',
  'admin.store_partner.created',
  'admin.store_partner.updated',
  'admin.store_item.created',
  'admin.store_item.updated',
  'admin.store_item.published',
  'admin.store_item.retired',
  // Emenda do item 16 do ADR-0027 (23/09): o vocabulario de tags da Loja.
  'admin.store_tag.created',
  'admin.store_tag.updated',
  'admin.network_event.created',
  'admin.network_event.updated',
  'admin.network_event.relocated',
  'admin.network_event.cancelled',
  'admin.network_event.removed',
  // Emenda do item 17 do ADR-0027 (23/09): encontro privado e fila de pedidos.
  // Entram aqui porque o contrato ja as declara em `x-audit`, e a conferencia
  // de `acoes-administrativas.test.ts` e nos dois sentidos.
  'admin.network_event.access_changed',
  'admin.network_join_request.listed',
  'admin.network_join_request.approved',
  'admin.network_join_request.declined',
  'admin.catalog_image.intent_created',
  /** D62: alguem com a caixa de entrada do administrador respondeu "nao fui eu". */
  'admin.session.disavowed',
] as const;

export type AcaoAdministrativa = (typeof ACOES_ADMINISTRATIVAS)[number];

/**
 * Quem agiu. `admin` é a conta do PAINEL (`admin_accounts`, ADR-0027 item
 * 20.2), e vai em coluna própria: a trilha nunca mistura UUIDs de duas tabelas
 * em `actor_user_id`.
 */
export type ActorKind = 'user' | 'anonymous' | 'system' | 'admin';

/**
 * O ator, como união discriminada: `user` carrega `actorUserId`, `admin`
 * carrega `actorAdminId`, e os outros dois não carregam nenhum. Trocar um
 * `AdminAccountId` por `UserId`, ou gravar ator do painel como `user`, não
 * compila (T18 de `04-seguranca.md` 22.11).
 */
export type AtorDaTrilha =
  | { readonly actorKind: 'user'; readonly actorUserId: UserId; readonly actorAdminId?: undefined }
  | { readonly actorKind: 'admin'; readonly actorAdminId: AdminAccountId; readonly actorUserId?: undefined }
  | {
      readonly actorKind: 'anonymous' | 'system';
      readonly actorUserId?: undefined;
      readonly actorAdminId?: undefined;
    };

export type AuditEvent = AtorDaTrilha & DadosDoEventoDeTrilha;

export interface DadosDoEventoDeTrilha {
  /** Endereço de origem em claro. A porta o transforma em HMAC; o domínio não. */
  readonly actorIp?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly action: AuditAction;
  readonly resourceKind: string;
  readonly resourceId?: string | undefined;
  readonly before?: Record<string, unknown> | undefined;
  readonly after?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * A trilha do app. `record` abre a PROPRIA transacao e, se falhar, avisa por
 * `onFailure` sem derrubar o pedido: um incidente no esquema de auditoria nao e
 * motivo para o tutor nao conseguir avisar que o pet sumiu.
 *
 * **Nao serve a escrita administrativa** (ADR-0027 item 8, D49): la a falha da
 * trilha desfaz a escrita. Para isso existem `TrilhaTransacional` e
 * `EscritaAuditada`, abaixo.
 */
export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

/**
 * A transacao em que a escrita e a trilha acontecem juntas.
 *
 * E a transacao do Kysely, e o nome proprio diz o papel dela aqui: quem a
 * recebe escreve **dentro** dela e nunca a confirma nem a desfaz por conta
 * propria. Quem confirma e `EscritaAuditada.executar`.
 */
export type TransacaoDeEscrita = DbTransaction;

/**
 * A forma transacional da trilha (ADR-0027 item 8).
 *
 * `recordIn` grava o evento **na transacao recebida**, assumindo
 * `bichu_audit_writer` so para o `INSERT` e devolvendo o papel anterior logo
 * depois, e **lanca** quando nao consegue. Nao ha `onFailure` aqui, e a
 * ausencia e a regra: quem chama deixa a excecao subir, e a transacao inteira
 * e desfeita, escrita incluida (D49, P17).
 */
export interface TrilhaTransacional {
  recordIn(trx: TransacaoDeEscrita, event: AuditEvent): Promise<void>;
}

/**
 * A soma de um campo numerico de `metadata` nos eventos de um ator, numa janela,
 * lida NA transacao de quem chama (D56).
 *
 * Existe para o teto por linhas devolvidas da fila de pedidos da `Rede`: o que
 * se mede e quanto dado de pessoa saiu, e a trilha ja guarda esse numero em
 * toda leitura (D55). Somar da trilha faz o teto e o registro serem a mesma
 * fonte: uma leitura sem trilha nao aconteceu, e nao conta, porque nao saiu.
 */
export interface ContagemNaTrilha {
  somarNaJanela(
    trx: TransacaoDeEscrita,
    consulta: {
      /** A leitura auditada e do painel: a conta e de `admin_accounts` (ADR-0027 item 20.2). */
      readonly actorAdminId: AdminAccountId;
      readonly action: AuditAction;
      readonly campo: string;
      readonly desde: Date;
    },
  ): Promise<{ readonly total: number; readonly maisAntigo: Date | null }>;

  /**
   * Quantos eventos de `action` sobre `resourceId`, com `metadata.reason =
   * motivo`, desde `desde`. E a contagem duravel das falhas de login do painel
   * (D44): 10 em 24 horas bloqueiam a conta, e um reinicio do processo nao
   * pode zerar isso.
   */
  contarNaJanela(
    trx: TransacaoDeEscrita,
    consulta: {
      readonly action: AuditAction;
      readonly resourceId: string;
      readonly motivo: string;
      readonly desde: Date;
    },
  ): Promise<number>;
}

/** O que o trabalho de uma escrita auditada devolve: o resultado e o evento. */
export interface ResultadoAuditado<T> {
  readonly resultado: T;
  /**
   * O evento, montado DEPOIS da escrita (ja com o `id` que ela gerou e com o
   * `after` que ela produziu). Um trabalho que nao grava evento nao e escrita
   * auditada: o tipo nao admite ausencia.
   */
  readonly evento: AuditEvent;
}

/**
 * **A interface que toda escrita administrativa usa.** Uma transacao, a
 * escrita dentro dela, o evento gravado na mesma transacao, e o `COMMIT` so
 * depois dos dois. Falha do trabalho ou da trilha: `ROLLBACK` de tudo, e a
 * excecao sobe (vira 500 na rota, com o dado intacto).
 *
 *   const item = await escrita.executar(async (trx) => {
 *     const gravado = await repositorio.criarItem(trx, dados);
 *     return {
 *       resultado: gravado,
 *       evento: eventoAdministrativo(rota.audit, ator, { resourceId: gravado.id, after: ... }),
 *     };
 *   });
 *
 * O evento e gravado por ULTIMO, depois do trabalho: nenhum comando da escrita
 * roda sob o papel da trilha.
 */
export interface EscritaAuditada {
  executar<T>(trabalho: (trx: TransacaoDeEscrita) => Promise<ResultadoAuditado<T>>): Promise<T>;
}
