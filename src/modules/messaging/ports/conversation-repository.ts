/**
 * A porta de persistência da conversa mediada.
 *
 * **Todo método que toca uma conversa específica recebe o chamador como
 * argumento obrigatório**, e não por simetria: é a assinatura que torna
 * inexprimível a consulta que traria a conversa de outra pessoa para a
 * aplicação decidir depois. O ADR-0021 não diz "não devolva a linha do outro",
 * ele diz onde a decisão mora — e uma porta cujo método de leitura aceitasse só
 * o id deixaria o adaptador livre para ignorar o dono sem que nada acusasse.
 *
 * A consequência visível: conversa de terceiro responde **404**, nunca 403. Um
 * 403 confirmaria que aquele id existe, que é o oráculo de enumeração que o
 * mesmo ADR fecha nas tags.
 */
import type { TrechoRedigido } from '../../../shared/redaction/redigir.js';
import type { CasoDaConversa } from '../domain/acesso-do-achador.js';
import type { Papel } from '../domain/conversa-mediada.js';
import type { MotivoDeRetencao } from '../domain/retencao-para-revisao.js';
import type {
  CaseId,
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

export type MotivoDeEncerramento = 'case_closed' | 'pet_returned' | 'retention';

/** O aviso que abre (ou reabre a conversa de) um escaneamento. */
export interface AberturaPorAviso {
  /** UUIDv7 da conversa nova. Ignorado quando o aviso é agrupado. */
  readonly id: ConversationId;
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  /** A conta de quem achou, quando ela existe. Nula no caminho principal. */
  readonly achadorComConta: UserId | null;
}

/**
 * A conversa como as duas rotas autenticadas a leem.
 *
 * Não existe aqui um identificador do outro participante, e a ausência é o
 * ponto: ver `participantesVisiveis` em `domain/conversa-mediada.ts`.
 */
export interface ConversaDoChamador {
  readonly id: ConversationId;
  readonly caseId: CaseId | null;
  readonly petDisplayName: string;
  /** Quando ela nasceu. É por aqui que a lista ordena e pagina. */
  readonly abertaEm: Date;
  /** De que lado está quem chamou. Sai da consulta, não de um `if` depois dela. */
  readonly papelDoChamador: Exclude<Papel, 'system'>;
  readonly encerradaEm: Date | null;
  readonly motivoDoEncerramento: MotivoDeEncerramento | null;
  readonly bloqueadaEm: Date | null;
  /** O caso ligado deixou de estar aberto. Falso quando não há caso. */
  readonly casoEncerrado: boolean;
  readonly nomeDoTutor: string | null;
  readonly nomeDoAchador: string | null;
}

export interface MensagemGravada {
  readonly id: string;
  readonly senderRole: Papel;
  /** Já redigido: é o que está no banco. */
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
  /**
   * Chave de objeto da foto do achado, quando houver. `string` e não
   * `ObjectKey`: a marca só é emitida por `comoObjectKey`, que mora no domínio
   * de `media`, e um módulo não enxerga o domínio de outro (§6). Quando a foto
   * entrar, ela chega marcada pela porta de `media` — e não por um `as` aqui,
   * que promete ao compilador que alguém validou quando ninguém validou.
   */
  readonly photoObjectKey: string | null;
  readonly createdAt: Date;
}

export interface NovaMensagem {
  readonly id: string;
  readonly conversationId: ConversationId;
  readonly senderRole: Papel;
  readonly senderUserId: UserId | null;
  /** Já redigido pelo serviço. A porta não redige, e não é lugar de redigir. */
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
}

/**
 * A conversa como o achador SEM CONTA a lê, resolvida pelo token (BICHUS-41).
 *
 * `id` está aqui para o serviço gravar a mensagem na conversa certa, e **não
 * sai**: `FinderConversation` não tem `id` nem `case_id` (SEC-001), e a rota
 * monta a resposta campo a campo sem ele.
 */
export interface ConversaDoAchador {
  readonly id: ConversationId;
  readonly petDisplayName: string;
  readonly encerradaEm: Date | null;
  readonly bloqueadaEm: Date | null;
  readonly nomeDoTutor: string | null;
  readonly nomeDoAchador: string | null;
  /**
   * O resumo GRAVADO do token do aviso. O serviço o compara com o resumo do
   * token apresentado em tempo constante: a igualdade do índice já achou a
   * linha, e a comparação é a segunda chave, que não depende de o banco ter
   * comparado do jeito que se espera.
   */
  readonly resumoDoToken: Uint8Array;
  readonly tokenExpiraEm: Date;
  readonly caso: CasoDaConversa | null;
}

/** Janela de leitura do achador: posição, e não id (ver `acesso-do-achador.ts`). */
export interface PaginaDoAchador {
  readonly limit: number;
  readonly deslocamento: number;
}

export type MotivoDaDenuncia = 'extortion' | 'harassment' | 'spam' | 'impersonation' | 'other';

export interface NovaDenuncia {
  readonly id: string;
  readonly conversationId: ConversationId;
  /** Quem denuncia. O alvo é o outro papel. */
  readonly papel: Exclude<Papel, 'system'>;
  readonly motivo: MotivoDaDenuncia;
  readonly detalhe: string | null;
  readonly agora: Instant;
}

/** Janela de leitura. `limit` já veio limitado pelo teto do contrato. */
export interface Pagina {
  readonly limit: number;
  /** `created_at` e `id` da última linha da página anterior. */
  readonly depoisDe: { readonly criadaEm: Date; readonly id: string } | undefined;
}

export interface ConversationRepository {
  /**
   * Abre a conversa do aviso, uma vez. Repetir com o mesmo `foundReportId` não
   * cria a segunda: o índice único faz a idempotência, e não um `SELECT` antes
   * do `INSERT`, que perde a corrida entre duas requisições simultâneas.
   *
   * O tutor e o caso **não** vêm por argumento: eles são derivados do pet
   * dentro da própria escrita. Recebê-los de fora faria a abertura confiar em
   * quem chama para dizer de quem é o pet.
   */
  abrirPorAviso(abertura: AberturaPorAviso): Promise<void>;

  /** A conversa daquele aviso, para anexar o segundo escaneamento do mesmo achador. */
  porAviso(foundReportId: FoundReportId): Promise<ConversationId | undefined>;

  listarDoChamador(chamador: UserId, pagina: Pagina): Promise<readonly ConversaDoChamador[]>;

  buscarDoChamador(
    conversa: ConversationId,
    chamador: UserId,
  ): Promise<ConversaDoChamador | undefined>;

  /**
   * As mensagens, com o chamador no `WHERE` da própria consulta.
   *
   * O id da conversa sozinho **não** é chave aqui. Fosse, a autorização
   * dependeria de quem chama ter lido a conversa antes — e um caminho novo que
   * esquecesse a leitura publicaria a conversa inteira.
   */
  mensagens(
    conversa: ConversationId,
    chamador: UserId,
    pagina: Pagina,
  ): Promise<readonly MensagemGravada[]>;

  gravarMensagem(mensagem: NovaMensagem): Promise<MensagemGravada>;

  /** Mensagem do Bichu. Sem remetente humano, e por isso sem chamador. */
  gravarMensagemDeSistema(
    mensagem: Omit<NovaMensagem, 'senderRole' | 'senderUserId'>,
  ): Promise<MensagemGravada>;

  /** Quantas mensagens este papel mandou nesta conversa desde o instante dado. */
  contarMensagensDoParticipante(
    conversa: ConversationId,
    papel: Papel,
    desde: Instant,
  ): Promise<number>;

  /**
   * Em quantos CASOS DISTINTOS esta conta escreveu **como achadora**.
   *
   * Casos, não mensagens (critério 17). Conversa sem caso conta como um caso
   * próprio: o escaneamento de uma plaquinha com o pet em casa é uma abordagem
   * a um tutor como qualquer outra, e deixá-la de fora daria ao falso achador
   * em série um caminho grátis.
   *
   * "Como achadora" é o recorte que a nota do critério 11 nomeia e que a
   * dimensão `account` sozinha não diz. Ver o adaptador: contar o tutor aqui
   * reteria, sem avisar, quem tem três animais perdidos ao mesmo tempo.
   */
  contarCasosDistintosDaConta(conta: UserId, desde: Instant): Promise<number>;

  /**
   * Marca a conversa para revisão humana. **Não notifica ninguém** (critérios
   * 10 e 11), e não muda o `status` que os dois lados leem.
   */
  reterParaRevisao(
    conversa: ConversationId,
    motivo: MotivoDeRetencao,
    agora: Instant,
  ): Promise<void>;

  // -------------------------------------------------------------------------
  // O achador sem conta (BICHUS-41). O "chamador" é o RESUMO do token, e ele
  // entra no `WHERE` de toda consulta, pela mesma razão do chamador com conta.
  // -------------------------------------------------------------------------

  /**
   * A conversa do aviso cujo token tem este resumo, ou a do aviso ao qual ele
   * foi agrupado. `undefined` quando o token não é de aviso nenhum.
   */
  buscarPeloTokenDoAchador(resumo: Uint8Array): Promise<ConversaDoAchador | undefined>;

  /** As mensagens, com o resumo do token no `WHERE` da própria consulta. */
  mensagensPeloTokenDoAchador(
    resumo: Uint8Array,
    pagina: PaginaDoAchador,
  ): Promise<readonly MensagemGravada[]>;

  /** O achador bloqueia o tutor. Só o primeiro bloqueio conta. */
  bloquearPeloAchador(resumo: Uint8Array, agora: Instant): Promise<void>;

  /**
   * Põe a denúncia na fila, ou soma à que o mesmo lado já tem aberta nesta
   * conversa (`accept_and_deduplicate`).
   */
  registrarDenuncia(denuncia: NovaDenuncia): Promise<void>;
}
