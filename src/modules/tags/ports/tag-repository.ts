/** Porta de persistência das tags. */
import type { Instant, PetId, TagCodeCanonical, TagId, UserId } from '../../../shared/types/brands.js';

/**
 * Janela do agrupamento: dois avisos do mesmo achador para a mesma tag em 6 h são
 * uma conversa só.
 */
export const JANELA_DE_AGRUPAMENTO_EM_MS = 6 * 3600 * 1000;

export type StatusDaTag = 'active' | 'revoked';

export type MotivoDeRevogacao =
  | 'lost_tag'
  | 'suspected_clone'
  | 'owner_request'
  | 'pet_transferred'
  | 'pet_deceased'
  | 'pet_deleted';

/** A tag como o tutor a vê. */
export interface TagDoTutor {
  readonly id: TagId;
  readonly status: StatusDaTag;
  readonly codeSuffix: string;
  readonly label: string | null;
  readonly scanCount: number;
  readonly lastScannedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revocationReason: MotivoDeRevogacao | null;
  readonly createdAt: Date;
}

/** O que a resolução pública precisa saber, e nada além. */
export interface TagResolvida {
  readonly tagId: TagId;
  readonly petId: PetId;
  readonly ownerUserId: UserId;
  readonly status: StatusDaTag;
  /** Verdadeiro quando o pet foi excluído, morreu ou saiu de cena. */
  readonly petIndisponivel: boolean;
  readonly pet: PetPublico;
}

/** A visão pública mínima do pet. */
export interface PetPublico {
  readonly displayName: string;
  readonly species: string;
  readonly breedLabel: string | null;
  readonly size: string;
  readonly primaryColor: string | null;
  readonly distinctiveMarks: string | null;
  readonly careNotes: string | null;
  readonly isLost: boolean;
  /** A chave do objeto da foto de capa, ou nulo quando o pet nao tem uma pronta. */
  readonly photoKey: string | null;
}

export interface ContextoDoDono {
  readonly petId: PetId;
  readonly tagId: TagId;
}

/** O que a reimpressão do QR precisa, e **só** o que ela precisa. */
export interface TagParaReimpressao {
  readonly status: StatusDaTag;
  /** Nulo quando a revogação já o apagou, que é o que ela faz por restrição do ADR. */
  readonly codeCiphertext: Uint8Array | null;
}

export interface NovaTag {
  readonly id: TagId;
  readonly petId: PetId;
  readonly codeHash: Uint8Array;
  readonly codeCiphertext: Uint8Array;
  readonly codeSuffix: string;
  readonly label: string | null;
}

export interface NovoScan {
  readonly id: string;
  readonly tagId: TagId;
  readonly ipHmac: Uint8Array | null;
  readonly userAgentHash: Uint8Array | null;
  readonly resultouEmAviso: boolean;
}

export interface NovoAviso {
  readonly id: string;
  readonly tagId: TagId;
  readonly petId: PetId;
  readonly reporterUserId: UserId | null;
  readonly finderIdentityHash: Uint8Array | null;
  readonly finderTokenHash: Uint8Array;
  readonly finderTokenExpiresAt: Instant;
  readonly foundAt: Instant;
  readonly notes: string | null;
}

/** O aviso anterior que faz o novo ser agrupado em vez de tocar o telefone de novo. */
export interface AvisoRecente {
  readonly id: string;
  readonly criadoEm: Date;
}

export interface TagRepository {
  /** Resolve o código para a rota pública. */
  resolverPorCodigo(codeHash: Uint8Array): Promise<TagResolvida | undefined>;

  /**
   * **A busca vinculada.** Uma consulta, com o dono na cláusula `WHERE` junto do
   * código.
   */
  buscarContextoDoDono(codeHash: Uint8Array, dono: UserId): Promise<ContextoDoDono | undefined>;

  /** Lista as tags de um pet **deste** tutor. */
  listarTagsDoPet(petId: PetId, dono: UserId): Promise<readonly TagDoTutor[] | undefined>;

  /**
   * **A segunda busca vinculada.** O cifrado da tag, para reimprimir o QR, com
   * `pets.owner_user_id` na mesma cláusula `WHERE` que `pet_tags.id` e
   * `pet_tags.pet_id`.
   */
  buscarParaReimpressao(
    petId: PetId,
    tagId: TagId,
    dono: UserId,
  ): Promise<TagParaReimpressao | undefined>;

  /** Emite, contando os tetos na mesma transação em que insere. */
  emitir(nova: NovaTag, dono: UserId, agora: Instant): Promise<ResultadoDaEmissao>;

  registrarScan(scan: NovoScan): Promise<void>;

  /** O aviso do achador, mais a marca no scan que o originou. */
  registrarAviso(aviso: NovoAviso): Promise<void>;

  /** O aviso anterior do **mesmo achador** para a **mesma tag** dentro da janela. */
  avisoRecenteDoMesmoAchador(
    tagId: TagId,
    finderIdentityHash: Uint8Array | null,
    desde: Instant,
  ): Promise<AvisoRecente | undefined>;

  /** Se este mesmo aparelho já avisou nas últimas 24 h. */
  jaAvisouRecentemente(
    tagId: TagId,
    finderIdentityHash: Uint8Array | null,
    desde: Instant,
  ): Promise<boolean>;
}

export type ResultadoDaEmissao =
  | { readonly tipo: 'emitida'; readonly tag: TagDoTutor }
  /** O pet não existe, foi excluído, ou é de outro tutor. */
  | { readonly tipo: 'pet_nao_e_deste_tutor' }
  /** Teto de 5 tags ativas por pet. */
  | { readonly tipo: 'teto_de_ativas' }
  /** Teto de 10 emissões por pet em 24 h. */
  | { readonly tipo: 'teto_diario'; readonly retryAfterSeconds: number };

/** Só para deixar o tipo do código canônico visível nesta porta. */
export type { TagCodeCanonical };
