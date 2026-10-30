/** Porta de persistência do achado. */
import type { FoundReportId, CaseId, Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { AchadoGravado } from '../domain/registro-de-achado.js';
import type { Especie, Par, Porte, Sexo, Sugestao } from '../domain/cruzamento.js';

export interface NovoAchado {
  readonly id: FoundReportId;
  readonly reporterUserId: UserId;
  readonly especie: Especie;
  readonly porte: Porte;
  readonly sexo: Sexo | null;
  readonly racaCodigo: string | null;
  readonly racaTextoLivre: string | null;
  readonly versaoDosDadosDeReferencia: string | null;
  readonly corPrimariaCodigo: string | null;
  readonly achadoEm: Instant;
  /** Ausentes juntos ou presentes juntos. */
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly uf: string | null;
  readonly observacao: string | null;
  /** Vem do `share_token` (critério 10). */
  readonly caseId: CaseId | null;
  readonly retencaoAte: Instant;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly proximoCursor: string | null;
}

export interface Enriquecimento {
  readonly observacao?: string;
  readonly lat?: number;
  readonly lon?: number;
}

export interface NovaIntencaoDeFotoDoAchado {
  readonly id: string;
  readonly userId: UserId;
  readonly foundReportId: FoundReportId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

/** O aviso como o achador SEM CONTA o alcança: pelo resumo do token (BICHUS-41). */
export interface AvisoDoAchador {
  readonly id: FoundReportId;
  readonly status: 'open' | 'matched' | 'closed';
  readonly achadoEm: Date;
  readonly temFoto: boolean;
  readonly temPonto: boolean;
  /** `found_reports.notes`, como a pessoa digitou no aviso. */
  readonly recado: string | null;
  readonly nomeDoPet: string | null;
  /** O resumo gravado, para a comparação em tempo constante no serviço. */
  readonly resumoDoToken: Uint8Array;
}

/** O que "Contar mais" grava no aviso. */
export interface EnriquecimentoDoAchador {
  readonly lat?: number;
  readonly lon?: number;
  readonly nome?: string;
  readonly email?: string;
  /** O id interno do upload, já resolvido a partir da referência opaca. */
  readonly fotoUploadId?: string;
}

export interface NovaIntencaoDeFotoDoAchadorSemConta {
  readonly id: string;
  /** A referência opaca que o achador recebe e devolve. */
  readonly uploadRef: string;
  readonly foundReportId: FoundReportId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface FoundReportRepository {
  /** `null` quando o caso do `share_token` não existe ou não está aberto. */
  casoAbertoPorShareToken(token: string): Promise<CaseId | null>;

  criar(novo: NovoAchado): Promise<AchadoGravado>;

  /** `null` quando não existe **ou não é do chamador**. */
  buscarDoRelator(achado: FoundReportId, dono: UserId): Promise<AchadoGravado | null>;

  /** O aviso, para quem pode ANEXAR FOTO a ele: o relator **ou o tutor do pet**. */
  avisoParaAnexarFoto(achado: FoundReportId, chamador: UserId): Promise<AchadoGravado | null>;

  listarDoRelator(dono: UserId, limite: number, cursor: string | null): Promise<Pagina<AchadoGravado>>;

  /**
   * `null` quando não existe, não é do chamador **ou já está encerrado** — e os três
   * são a mesma ausência aqui.
   */
  enriquecer(
    achado: FoundReportId,
    dono: UserId,
    mudanca: Enriquecimento,
    agora: Instant,
  ): Promise<AchadoGravado | null>;

  /** `open`, `matched` ou `closed`; `null` quando não existe ou não é do chamador. */
  statusDoRelator(achado: FoundReportId, dono: UserId): Promise<AchadoGravado['status'] | null>;

  /** Quantas intenções de foto este achado já teve, **na vida inteira**. */
  contarIntencoesDeFoto(achado: FoundReportId, dono: UserId): Promise<number>;

  registrarIntencaoDeFoto(nova: NovaIntencaoDeFotoDoAchado): Promise<void>;

  /**
   * Os pares que valem a pena pontuar: este achado contra cada caso aberto que o
   * filtro grosseiro deixou passar.
   */
  paresParaCruzar(achado: FoundReportId): Promise<readonly Par[]>;

  /** Grava as sugestões. **Toda linha nasce `suggested`.** */
  sugerirCorrespondencias(sugestoes: readonly Sugestao[]): Promise<number>;

  /** `undefined` quando o resumo não é de aviso nenhum. */
  avisoPeloTokenDoAchador(resumo: Uint8Array): Promise<AvisoDoAchador | undefined>;

  /** `undefined` quando o resumo não é de aviso nenhum **ou o aviso já encerrou**. */
  enriquecerPeloTokenDoAchador(
    resumo: Uint8Array,
    mudanca: EnriquecimentoDoAchador,
    agora: Instant,
  ): Promise<AvisoDoAchador | undefined>;

  /** O upload da referência opaca, e só se ele for DESTE aviso. */
  intencaoDeFotoDoAchadorPelaReferencia(
    resumo: Uint8Array,
    uploadRef: string,
  ): Promise<string | undefined>;

  /**
   * Quantas intenções de foto o aviso deste token já teve, na vida inteira
   * (SEC-009).
   */
  contarIntencoesDeFotoPeloTokenDoAchador(resumo: Uint8Array): Promise<number>;

  registrarIntencaoDeFotoDoAchadorSemConta(nova: NovaIntencaoDeFotoDoAchadorSemConta): Promise<void>;
}
