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

/** O que o serviço precisa saber ANTES de deixar abrir. */
export interface EstadoDoPetParaAbertura {
  readonly existeEhDoTutor: boolean;
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
  readonly temCanalVerificado: boolean;
}

/** O que a prévia precisa, e que a abertura não precisava. */
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
  /**
   * Falso quando o caso nasceu só com área: a tela usa para explicar a ausência de
   * alerta.
   */
  readonly hasLocation: boolean;
  readonly areaLabel: string | null;
  readonly description: string | null;
  readonly shareToken: string;
  readonly shareToPublicList: boolean;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  /** O prazo de REABERTURA do encerramento vigente, ou `null` em caso aberto. */
  readonly reopenDeadline: Date | null;
  readonly closureOutcome: DesfechoDoCaso | null;
  readonly closureChannel: CanalDoReencontro | null;
  readonly closureNote: string | null;
}

/**
 * O que o tutor corrige depois de abrir o caso: **onde** e **quando** o pet foi
 * visto pela última vez (`PATCH /v1/lost-cases/{caseId}`).
 */
export interface AtualizacaoDoCaso {
  readonly caso: CaseId;
  readonly dono: UserId;
  readonly lastSeenAt: Instant;
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
  readonly state: string | undefined;
  /** Ausente, a coluna não é tocada. */
  readonly description: string | undefined;
  /** Ausente, a coluna não é tocada. */
  readonly shareToPublicList: boolean | undefined;
}

export interface LostCaseRepository extends DecisorDeCandidatos {
  /** Tudo que decide a abertura, numa consulta só. */
  estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura>;

  /** O mesmo estado, mais a área de referência do tutor. */
  estadoParaPrevia(pet: PetId, dono: UserId): Promise<EstadoDoPetParaPrevia>;

  /** Abre o caso. */
  abrir(novo: NovoCaso): Promise<CasoGravado | null>;

  /** `null` quando não existe **ou** não é do chamador. */
  buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null>;

  /** Corrige onde e quando o pet foi visto. */
  atualizarOndeEQuando(entrada: AtualizacaoDoCaso): Promise<CasoGravado | null>;

  /** `null` com o mesmo significado. */
  encerrar(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly desfecho: DesfechoDoCaso;
    readonly canal: CanalDoReencontro | undefined;
    readonly nota: string | undefined;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;

  /** Reabre o caso encerrado por engano (`reopenLostCase`). */
  reabrir(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;
}

/** A decisão humana sobre um candidato. */
export type DecisaoDoCandidato = 'confirmed' | 'rejected';

/** O achado, como ele sai junto da decisão. */
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

/** `MatchCandidate.status` do contrato: os três, e não os dois da decisão. */
export type StatusDoCandidato = DecisaoDoCandidato | 'suggested';

/** O candidato como a listagem e a decisão o leem. */
export interface CandidatoDoCaso {
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
  readonly status: StatusDoCandidato;
  readonly criadoEm: Date;
  readonly achado: AchadoDoCandidato;
}

/** O MESMO candidato, depois de decidido, com o estado estreitado. */
export interface CandidatoDecidido extends Omit<CandidatoDoCaso, 'status'> {
  readonly status: DecisaoDoCandidato;
}

/** A janela da listagem de candidatos. */
export interface PaginaDeCandidatos {
  readonly limit: number;
  readonly depoisDe: { readonly score: number; readonly id: string } | undefined;
}

export interface DecisaoSobreCandidato {
  readonly caso: CaseId;
  readonly candidato: string;
  readonly dono: UserId;
  readonly decisao: DecisaoDoCandidato;
  readonly agora: Instant;
}

/** Registra a decisão humana do tutor sobre um candidato. */
export interface DecisorDeCandidatos {
  decidirCandidato(entrada: DecisaoSobreCandidato): Promise<CandidatoDecidido | null>;

  /** As correspondências JÁ CALCULADAS deste caso, para o tutor ver. */
  candidatosDoCaso(
    caso: CaseId,
    dono: UserId,
    pagina: PaginaDeCandidatos,
  ): Promise<readonly CandidatoDoCaso[]>;

  /** O candidato JÁ DECIDIDO deste tutor, para o reenvio da fila offline. */
  candidatoDecididoDoTutor(
    caso: CaseId,
    candidato: string,
    dono: UserId,
  ): Promise<CandidatoDecidido | null>;
}
