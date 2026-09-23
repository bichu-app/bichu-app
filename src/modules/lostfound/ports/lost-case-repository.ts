/**
 * Porta de persistência do caso de perdido.
 *
 * Mesma decisão do ADR-0021 que vale nas tags, no cadastro e na mídia: **todo
 * método que toca um caso recebe o dono como argumento obrigatório**, e a busca
 * é vinculada. A consulta que devolveria o caso de outro tutor não existe aqui.
 *
 * Consequência intencional: caso de outro tutor responde **404, nunca 403**.
 * E há uma razão a mais neste módulo — um 403 confirmaria que aquele pet está
 * perdido, para quem não deveria saber.
 *
 * Nenhum método devolve coordenada para fora da visão do dono. A projeção
 * pública tem porta própria e carrega `share_token`, nunca `case_id`.
 */
import type {
  CaseId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

export type StatusDoCaso = 'open' | 'closed_reunited' | 'closed_not_found' | 'closed_false_alarm';
export type DesfechoDoCaso = 'reunited' | 'not_found' | 'false_alarm';
export type CanalDoReencontro = 'tag_scan' | 'bichu_alert' | 'poster_or_link' | 'on_my_own' | 'other';

/** O que o serviço precisa saber ANTES de deixar abrir. Uma consulta só. */
export interface EstadoDoPetParaAbertura {
  readonly existeEhDoTutor: boolean;
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
  readonly temCanalVerificado: boolean;
}

/**
 * O que a prévia precisa, e que a abertura não precisava.
 *
 * A área de referência do tutor é **texto**, e é a única área que o servidor
 * consegue nomear: não há geocodificação no MVP (ADR-0006), então uma coordenada
 * recebida na consulta não vira nome de bairro.
 */
export interface EstadoDoPetParaPrevia extends EstadoDoPetParaAbertura {
  readonly areaDeReferenciaDoTutor: {
    readonly city: string | undefined;
    readonly neighborhood: string | undefined;
  };
}

export interface NovoCaso {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly ownerUserId: UserId;
  readonly lastSeenAt: Instant;
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
  readonly state: string | undefined;
  readonly description: string | undefined;
  readonly shareToPublicList: boolean;
  /** Token opaco. A única chave do caso em superfície pública. */
  readonly shareToken: string;
}

export interface CasoGravado {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly status: StatusDoCaso;
  readonly lastSeenAt: Date;
  /** Falso quando o caso nasceu só com área: a tela usa para explicar a ausência de alerta. */
  readonly hasLocation: boolean;
  readonly areaLabel: string | null;
  readonly description: string | null;
  readonly shareToken: string;
  readonly shareToPublicList: boolean;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly closureOutcome: DesfechoDoCaso | null;
  readonly closureChannel: CanalDoReencontro | null;
  readonly closureNote: string | null;
}

export interface LostCaseRepository extends DecisorDeCandidatos {
  /**
   * Tudo que decide a abertura, numa consulta só.
   *
   * Junto e não separado porque as quatro perguntas são feitas sempre, no mesmo
   * instante, e quatro idas ao banco no caminho de alguém em pânico com 11% de
   * bateria é latência que dá para não gastar.
   */
  estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura>;

  /**
   * O mesmo estado, mais a área de referência do tutor. Uma consulta só.
   *
   * **`dono` é obrigatório aqui pelo mesmo motivo de todo o resto deste
   * arquivo**, e não por simetria: `existeEhDoTutor` sai de um `EXISTS` com
   * `owner_user_id = :dono` dentro. A consulta que responderia sobre o pet de
   * outra pessoa não existe, então a prévia de pet alheio é indistinguível da
   * prévia de pet inexistente — que é o 404 do ADR-0021, e aqui ele vale duas
   * vezes: um 403 confirmaria a existência daquele pet a quem não é dono dele.
   */
  estadoParaPrevia(pet: PetId, dono: UserId): Promise<EstadoDoPetParaPrevia>;

  /**
   * Abre o caso.
   *
   * **Pode recusar por corrida**, e é isso que o retorno `null` significa: o
   * índice único parcial do banco garante um caso aberto por pet, e duas
   * requisições simultâneas do mesmo tutor — que é exatamente o que a fila
   * offline produz quando o sinal volta — passariam as duas pela conferência
   * antes de qualquer uma gravar. Quem perde a corrida recebe `null` e vira
   * `pet-already-lost`, que é a verdade.
   */
  abrir(novo: NovoCaso): Promise<CasoGravado | null>;

  /** `null` quando não existe **ou** não é do chamador. São a mesma resposta. */
  buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null>;

  /** `null` com o mesmo significado. Só encerra caso **aberto**. */
  encerrar(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly desfecho: DesfechoDoCaso;
    readonly canal: CanalDoReencontro | undefined;
    readonly nota: string | undefined;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;
}

/**
 * A decisão humana sobre um candidato. Os dois valores do contrato, e só eles.
 *
 * `suggested` **não** está aqui de propósito: sair de `suggested` é o que esta
 * operação faz, e voltar para lá é o que `match_candidates_decisao_tem_autor`
 * recusa. Um terceiro valor neste tipo seria a porta para desfazer uma rejeição,
 * e a seção 4.10 de `docs/03-arquitetura.md` fecha isso em uma frase:
 * *"Rejeitado não volta"*.
 */
export type DecisaoDoCandidato = 'confirmed' | 'rejected';

/** O achado, como ele sai junto da decisão. Mesmas colunas de `FoundReport`. */
export interface AchadoDoCandidato {
  readonly id: FoundReportId;
  readonly origin: 'tag_scan' | 'stray_report';
  readonly status: 'open' | 'matched' | 'closed';
  readonly especie: string | null;
  readonly porte: string | null;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly achadoEm: Date;
  readonly observacao: string | null;
  readonly criadoEm: Date;
}

/**
 * O candidato depois de decidido.
 *
 * `petId` e `relatorUserId` não vão para a resposta: eles existem porque
 * **confirmar abre a conversa mediada** com quem registrou o achado, e a
 * abertura precisa dos dois. O pet vem do CASO que casou, porque o aviso avulso
 * não tem `pet_id`; o relator vem de `found_reports.reporter_user_id`.
 */
export interface CandidatoDecidido {
  readonly id: string;
  readonly caseId: CaseId;
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  readonly nomeDoPet: string;
  readonly relatorUserId: UserId | null;
  readonly score: number;
  readonly atributosQuePontuaram: readonly string[];
  readonly distanciaEmMetros: number | null;
  readonly linkOrigin: 'attribute_match' | 'share_token';
  readonly versaoDaEstrategia: string;
  readonly status: DecisaoDoCandidato;
  readonly criadoEm: Date;
  readonly achado: AchadoDoCandidato;
}

export interface DecisaoSobreCandidato {
  readonly caso: CaseId;
  readonly candidato: string;
  readonly dono: UserId;
  readonly decisao: DecisaoDoCandidato;
  readonly agora: Instant;
}

/**
 * Registra a decisão humana do tutor sobre um candidato.
 *
 * **`null` cobre quatro coisas, e cobre de propósito:** o candidato não existe,
 * ele não é de um caso deste tutor, o caso não está aberto, ou ele já foi
 * decidido. As quatro viram 404, nunca 403 (ADR-0021) — e aqui isso vale duas
 * vezes, porque um 403 confirmaria a existência de uma correspondência entre o
 * pet de outra pessoa e um achado, que é exatamente o que a decisão humana
 * existe para não afirmar sozinha.
 *
 * Quem decide é **o tutor do caso**, e esse predicado mora na cláusula `WHERE`
 * da própria escrita. O banco não o exige: `match_candidates_decisao_tem_autor`
 * cobra *uma pessoa e um instante*, e qualquer `users.id` satisfaz o CHECK.
 * `autorizacao-do-decisor-na-clausula-where.test.ts` compila este SQL e confere
 * a posição `$n` do predicado do dono.
 */
export interface DecisorDeCandidatos {
  decidirCandidato(entrada: DecisaoSobreCandidato): Promise<CandidatoDecidido | null>;

  /**
   * O candidato JÁ DECIDIDO deste tutor, para o reenvio da fila offline.
   *
   * O critério 7 da BICHUS-86 põe a confirmação numa fila quando falta conexão,
   * e fila reenvia. Sem esta leitura, o reenvio de uma confirmação que já deu
   * certo responderia 404 e a tela diria que o achado sumiu.
   */
  candidatoDecididoDoTutor(
    caso: CaseId,
    candidato: string,
    dono: UserId,
  ): Promise<CandidatoDecidido | null>;
}
