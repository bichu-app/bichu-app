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
  /**
   * As duas pontas desabilitaram a conta? (17/10)
   *
   * `users.deleted_at !== null` de cada lado. O domínio usa isto para duas
   * coisas: despersonalizar o lado que saiu (`participantesVisiveis`) e travar
   * a conversa nos dois sentidos (`estadoDaConversa` devolve `closed`).
   *
   * Dois campos e não um: o lado que saiu é o que perde o nome, e um booleano
   * só não diria qual.
   */
  readonly tutorDesabilitado: boolean;
  readonly achadorDesabilitado: boolean;
  /**
   * Há mensagem que ESTE lado ainda não leu (BICHUS-278).
   *
   * Não conta a mensagem do próprio chamador, e **não** é afetado por ele ter
   * aberto a lista: "lido" é o item aberto. Ver a migração
   * `20261018000014_leitura-da-conversa-por-participante.sql`.
   */
  readonly naoLida: boolean;
  /**
   * O corpo da última mensagem, **como está no banco** — isto é, já redigido.
   *
   * `null` quando a conversa não tem mensagem. O corte é do domínio
   * (`previaDaMensagem`), e não da consulta: cortar no SQL faria o teto virar
   * um número escrito em dois lugares.
   */
  readonly corpoDaUltima: string | null;
  readonly ultimaMensagemEm: Date | null;
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
 * As três espécies de mensagem do Bichu (BICHUS-278).
 *
 * As duas primeiras são AVISO, e por isso não saem do contador quando a pessoa
 * abre a lista. A terceira é explicação de interface e sai pela regra geral.
 *
 * Existe para que a espécie seja ARGUMENTO de quem grava, e não deduzida depois
 * pelo texto: uma heurística sobre a microcopy quebraria no dia em que a frase
 * mudasse, e quebraria em silêncio — o aviso sumiria do contador.
 */
export type EspecieDoSistema = 'scan_notice' | 'found_notice' | 'redaction_warning';

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
  /** Ver `ConversaDoChamador`: as duas pontas desabilitadas (17/10). */
  readonly tutorDesabilitado: boolean;
  readonly achadorDesabilitado: boolean;
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

  /**
   * Mensagem do Bichu. Sem remetente humano, e por isso sem chamador.
   *
   * `especie` é obrigatória desde a BICHUS-278: é ela que decide se o aviso
   * sobrevive a uma passada de olho na lista. Obrigatória e não opcional de
   * propósito — um default silencioso faria a próxima mensagem de sistema
   * nascer fora do contador sem ninguém decidir isso.
   */
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
   * O chamador COM CONTA bloqueia a outra parte (BICHUS-40).
   *
   * **A assimetria que isto fecha**: `bloquearPeloAchador` já existia e estava no
   * ar, e o lado autenticado não tinha nada — um tutor sendo extorquido no canal
   * mediado não tinha saída. A coluna (`blocked_at`, `blocked_by_role`) já
   * existia, e o envio já respeita o bloqueio: é só a escrita que faltava.
   *
   * `chamador` entra no `WHERE` da própria escrita, como em toda consulta deste
   * arquivo. Conversa que não é dele não é bloqueada nem respondida: zero linhas,
   * e o serviço já respondeu 404 antes (a leitura vinculada vem primeiro).
   *
   * **O papel NÃO vem por argumento.** Ele é derivado da mesma consulta, pelo
   * lado em que o chamador está: recebê-lo de fora faria a escrita confiar em
   * quem chama para dizer de que lado ele é, e `blocked_by_role` é o que diz à
   * outra pessoa quem fechou a porta.
   *
   * Idempotente: `blocked_at IS NULL` no `WHERE` preserva quem bloqueou e
   * quando. Repetir não é erro — `accept_and_deduplicate` no contrato —, e
   * responder "já estava" contaria a quem bloqueia o que o outro lado fez.
   */
  bloquearPeloChamador(
    conversa: ConversationId,
    chamador: UserId,
    agora: Instant,
  ): Promise<void>;

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

  // -------------------------------------------------------------------------
  // A LEITURA, e o contador do sino (BICHUS-278)
  //
  // Três métodos e não um, porque são três fatos diferentes. Juntá-los faria
  // abrir a lista marcar tudo como lido — o defeito exato que a regra proíbe.
  // -------------------------------------------------------------------------

  /**
   * Quantas conversas entram no contador do sino AGORA.
   *
   * **Não é "quantas estão não lidas".** Abrir a lista zera este número e deixa
   * as marcas de item como estavam; o aviso de plaquinha lida e o de achado
   * (`system_kind`) **não** saem daqui ao abrir a lista — só quando a conversa
   * deles é aberta.
   *
   * Derivado na leitura, nunca materializado: duas fontes para o mesmo fato
   * divergem no primeiro caminho que esquecer de decrementar uma delas.
   */
  contarParaOSino(chamador: UserId): Promise<number>;

  /**
   * A CONTA viu a área de mensagens. Zera o contador, **sem** marcar item.
   *
   * Idempotente por `ON CONFLICT`: chamar duas vezes seguidas grava o instante
   * novo e responde igual. Não recebe lista de conversas de propósito — se
   * recebesse, alguém acabaria passando todas e marcando-as como lidas.
   */
  marcarListaVista(chamador: UserId, agora: Instant): Promise<void>;

  /**
   * ESTE LADO abriu a conversa: marca o item como lido até `agora`.
   *
   * O `chamador` entra no `WHERE` da própria escrita, como em todo método deste
   * arquivo: conversa que não é dele não é marcada. O PAPEL **não** vem por
   * argumento — ele é derivado do lado em que o chamador está, pela mesma razão
   * de `bloquearPeloChamador`.
   */
  marcarConversaLida(
    conversa: ConversationId,
    chamador: UserId,
    agora: Instant,
  ): Promise<void>;
}
