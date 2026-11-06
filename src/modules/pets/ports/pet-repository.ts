import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';
import type { TrechoRedigido } from '../../../shared/redaction/redigir.js';

export type StatusDoPet = 'active' | 'lost' | 'deceased' | 'archived';
export type Especie = 'dog' | 'cat' | 'other';
export type Porte = 'P' | 'M' | 'G' | 'GG';
export type Sexo = 'male' | 'female' | 'unknown';

/** Os campos que o tutor informa. */
export interface DadosDoPet {
  readonly name: string;
  readonly species: Especie;
  readonly breedCode: string | null;
  readonly breedFreeText: string | null;
  /** A versão da lista que **o cliente** tinha em mãos. */
  readonly refDataVersion: string | null;
  readonly size: Porte;
  readonly primaryColorCode: string | null;
  readonly secondaryColorCode: string | null;
  readonly sex: Sexo | null;
  readonly neutered: boolean | null;
  readonly birthDateApprox: string | null;
  readonly distinctiveMarks: string | null;
  /** Já redigido quando chega aqui. */
  readonly careNotes: string | null;
  readonly careNotesRedactions: readonly TrechoRedigido[];
  readonly microchipNumber: string | null;
  readonly sinpatinhasId: string | null;
}

/** O pet como o dono o vê. */
export interface PetGravado extends DadosDoPet {
  readonly id: PetId;
  readonly breedLabel: string | null;
  readonly status: StatusDoPet;
  readonly slug: string | null;
  readonly publicProfileEnabled: boolean;
  readonly activeTagCount: number;
  /** Caso de perdido em aberto, quando houver. */
  readonly openCaseId: string | null;
  /**
   * A chave da derivada `banner` 1280 x 720 da FOTO DE CAPA (cliente,
   * 06/11/2026), **só quando a imagem está `ready`**. Nula é o estado normal:
   * sem capa, em processamento ou recusada, as três dão nulo, e a ficha mostra
   * o banner da marca nas três.
   *
   * É CHAVE e não URL: a base de mídia é domínio separado da origem da
   * aplicação (ADR-0007), e quem a monta é a borda HTTP — o mesmo arranjo de
   * `FotoDoPet.thumbKey`/`cardKey`.
   */
  readonly coverBannerKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** O que existe na lista de referência, para recusar código inválido na borda. */
export interface CodigosConhecidos {
  readonly especieExiste: boolean;
  readonly porteExiste: boolean;
  readonly racaExisteNaEspecie: boolean;
  readonly corPrimariaExiste: boolean;
  readonly corSecundariaExiste: boolean;
  readonly versaoExiste: boolean;
}

export interface PetRepository {
  /** Quantos pets vivos a conta tem. */
  contarDoTutor(dono: UserId): Promise<number>;

  /** Confere os códigos contra as tabelas de referência **antes** da escrita. */
  conferirCodigos(dados: DadosDoPet): Promise<CodigosConhecidos>;

  criar(id: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado>;

  listarDoTutor(dono: UserId): Promise<readonly PetGravado[]>;

  /** `null` quando não existe **ou** não é do chamador. */
  buscarDoTutor(pet: PetId, dono: UserId): Promise<PetGravado | null>;

  /** `null` com o mesmo significado de `buscarDoTutor`. */
  atualizar(pet: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado | null>;

  /** Exclusão lógica. `false` quando não existe ou não é do chamador. */
  excluir(pet: PetId, dono: UserId, quando: Instant): Promise<boolean>;

  /**
   * Confirma o envio da FOTO DE CAPA e a aponta no pet (cliente, 06/11/2026).
   *
   * `'pet_inexistente'` quando o pet não existe **ou** não é do chamador — são
   * um desfecho só de propósito: pet de outra pessoa não existe (ADR-0021).
   * `'envio_inservivel'` cobre, numa resposta só, o `upload_id` de outra conta,
   * de outro propósito, vencido e já gasto — **sem dizer qual** foi, a mesma
   * reticência de `createNetworkEvent`.
   *
   * Reconfirmar o MESMO `upload_id` no MESMO pet devolve o pet sem criar
   * trabalho novo: é idempotente, e é isso que faz o toque repetido do app não
   * gerar duas derivadas.
   */
  definirCapa(
    pet: PetId,
    dono: UserId,
    uploadId: string,
    agora: Instant,
  ): Promise<PetGravado | 'pet_inexistente' | 'envio_inservivel'>;
}
