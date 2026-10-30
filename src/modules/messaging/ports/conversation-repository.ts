/** A porta de persistência da conversa mediada. */
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
  /** UUIDv7 da conversa nova. */
  readonly id: ConversationId;
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  /** A conta de quem achou, quando ela existe. */
  readonly achadorComConta: UserId | null;
}

/** A conversa como as duas rotas autenticadas a leem. */
export interface ConversaDoChamador {
  readonly id: ConversationId;
  /** O AVISO que abriu esta conversa. */
  readonly foundReportId: FoundReportId;
  readonly caseId: CaseId | null;
  readonly petDisplayName: string;
  /** Quando ela nasceu. */
  readonly abertaEm: Date;
  /** De que lado está quem chamou. */
  readonly papelDoChamador: Exclude<Papel, 'system'>;
  readonly encerradaEm: Date | null;
  readonly motivoDoEncerramento: MotivoDeEncerramento | null;
  readonly bloqueadaEm: Date | null;
  /** O caso ligado deixou de estar aberto. */
  readonly casoEncerrado: boolean;
  readonly nomeDoTutor: string | null;
  readonly nomeDoAchador: string | null;
  /** O achador tem conta (`conversations.finder_user_id IS NOT NULL`). */
  readonly achadorTemConta: boolean;
  /** As duas pontas desabilitaram a conta? */
  readonly tutorDesabilitado: boolean;
  readonly achadorDesabilitado: boolean;
  /** Há mensagem que ESTE lado ainda não leu (BICHUS-278). */
  readonly naoLida: boolean;
  /** O corpo da última mensagem, **como está no banco** — isto é, já redigido. */
  readonly corpoDaUltima: string | null;
  readonly ultimaMensagemEm: Date | null;
  /**
   * **O APELIDO DO OUTRO LADO, e so quando ele e CONEXAO ACEITA de quem chama**
   * (emenda 3 do ADR-0010, decisao do cliente de 19/10/2026).
   */
  readonly apelidoDoOutro: string | null;
  /**
   * **A CHAVE da derivada `thumb` (176 x 176) da foto do OUTRO LADO**, pela mesma
   * regra e no mesmo `WHERE` de [apelidoDoOutro].
   */
  readonly chaveDaFotoDoOutro: string | null;
}

export interface MensagemGravada {
  readonly id: string;
  readonly senderRole: Papel;
  /** Já redigido: é o que está no banco. */
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
  /** Chave de objeto da foto do achado, quando houver. */
  readonly photoObjectKey: string | null;
  readonly createdAt: Date;
}

export interface NovaMensagem {
  readonly id: string;
  readonly conversationId: ConversationId;
  readonly senderRole: Papel;
  readonly senderUserId: UserId | null;
  /** Já redigido pelo serviço. */
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
  /** A CHAVE HIGIENIZADA da foto do achado, ou `null`. */
  readonly photoObjectKey?: string | null;
}

/** As três espécies de mensagem do Bichu (BICHUS-278). */
export type EspecieDoSistema = 'scan_notice' | 'found_notice' | 'redaction_warning';

/** A conversa como o achador SEM CONTA a lê, resolvida pelo token (BICHUS-41). */
export interface ConversaDoAchador {
  readonly id: ConversationId;
  readonly petDisplayName: string;
  readonly encerradaEm: Date | null;
  readonly bloqueadaEm: Date | null;
  readonly nomeDoTutor: string | null;
  readonly nomeDoAchador: string | null;
  /** Ver `ConversaDoChamador`: as duas pontas desabilitadas (17/10). */
  readonly tutorDesabilitado: boolean;
  readonly achadorDesabilitado: boolean;
  /** O resumo GRAVADO do token do aviso. */
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

/** A janela da LISTA de conversas: a de [Pagina], mais o recorte da busca. */
export interface PaginaDaLista extends Pagina {
  /** O termo da busca, já sem espaço nas pontas, ou `undefined`. */
  readonly termo: string | undefined;
}

export interface ConversationRepository {
  /** Abre a conversa do aviso, uma vez. */
  abrirPorAviso(abertura: AberturaPorAviso): Promise<void>;

  /** A conversa daquele aviso, para anexar o segundo escaneamento do mesmo achador. */
  porAviso(foundReportId: FoundReportId): Promise<ConversationId | undefined>;

  listarDoChamador(
    chamador: UserId,
    pagina: PaginaDaLista,
  ): Promise<readonly ConversaDoChamador[]>;

  /** Quantas conversas o recorte tem, **sem `limit`** (`ConversationPage.total`). */
  contarDoChamador(chamador: UserId, termo: string | undefined): Promise<number>;

  buscarDoChamador(
    conversa: ConversationId,
    chamador: UserId,
  ): Promise<ConversaDoChamador | undefined>;

  /** As mensagens, com o chamador no `WHERE` da própria consulta. */
  mensagens(
    conversa: ConversationId,
    chamador: UserId,
    pagina: Pagina,
  ): Promise<readonly MensagemGravada[]>;

  gravarMensagem(mensagem: NovaMensagem): Promise<MensagemGravada>;

  /** Mensagem do Bichu. Sem remetente humano, e por isso sem chamador. */
  gravarMensagemDeSistema(
    mensagem: Omit<NovaMensagem, 'senderRole' | 'senderUserId'> & {
      readonly especie: EspecieDoSistema;
    },
  ): Promise<MensagemGravada>;

  /** Quantas mensagens este papel mandou nesta conversa desde o instante dado. */
  contarMensagensDoParticipante(
    conversa: ConversationId,
    papel: Papel,
    desde: Instant,
  ): Promise<number>;

  /** Em quantos CASOS DISTINTOS esta conta escreveu **como achadora**. */
  contarCasosDistintosDaConta(conta: UserId, desde: Instant): Promise<number>;

  /** O chamador COM CONTA bloqueia a outra parte (BICHUS-40). */
  bloquearPeloChamador(
    conversa: ConversationId,
    chamador: UserId,
    agora: Instant,
  ): Promise<void>;

  /** Marca a conversa para revisão humana. */
  reterParaRevisao(
    conversa: ConversationId,
    motivo: MotivoDeRetencao,
    agora: Instant,
  ): Promise<void>;

  /**
   * A conversa do aviso cujo token tem este resumo, ou a do aviso ao qual ele foi
   * agrupado.
   */
  buscarPeloTokenDoAchador(resumo: Uint8Array): Promise<ConversaDoAchador | undefined>;

  /** As mensagens, com o resumo do token no `WHERE` da própria consulta. */
  mensagensPeloTokenDoAchador(
    resumo: Uint8Array,
    pagina: PaginaDoAchador,
  ): Promise<readonly MensagemGravada[]>;

  /** O achador bloqueia o tutor. */
  bloquearPeloAchador(resumo: Uint8Array, agora: Instant): Promise<void>;

  /**
   * Põe a denúncia na fila, ou soma à que o mesmo lado já tem aberta nesta conversa
   * (`accept_and_deduplicate`).
   */
  registrarDenuncia(denuncia: NovaDenuncia): Promise<void>;

  /** Quantas conversas entram no contador do sino AGORA. */
  contarParaOSino(chamador: UserId): Promise<number>;

  /** A CONTA viu a área de mensagens. */
  marcarListaVista(chamador: UserId, agora: Instant): Promise<void>;

  /** ESTE LADO abriu a conversa: marca o item como lido até `agora`. */
  marcarConversaLida(
    conversa: ConversationId,
    chamador: UserId,
    agora: Instant,
  ): Promise<void>;
}
