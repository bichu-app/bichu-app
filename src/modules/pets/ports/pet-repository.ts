/**
 * Porta de persistência do cadastro.
 *
 * **Todo método que toca um pet específico recebe o dono como argumento
 * obrigatório**, e a busca é vinculada: `WHERE pets.id = :pet AND
 * pets.owner_user_id = :chamador`. Não existe aqui um `buscarPorId` que devolva
 * o pet para quem quiser comparar o dono depois.
 *
 * É a mesma decisão do ADR-0021 nas tags, e pelo mesmo motivo: a alternativa —
 * buscar, devolver, comparar no manipulador — funciona igual e depende de a
 * comparação estar escrita em todos os pontos, para sempre. Uma rota nova que
 * esqueça o `if` vira vazamento de dado de outro tutor. Com esta forma, o
 * arranjo perigoso não está disponível para ser esquecido.
 *
 * Consequência direta, e ela é intencional: **pet de outro tutor responde 404,
 * nunca 403** (`x-problem-types`: "Recurso de outro tutor responde 404"). Um 403
 * confirmaria a existência do registro a quem não deveria saber que ele existe.
 *
 * O que sai daqui é a forma do domínio, não a linha do banco: `breed_label` já
 * vem resolvido, e `care_notes` já vem redigido — porque a redação aconteceu na
 * escrita, e nunca na leitura.
 */
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';
import type { TrechoRedigido } from '../../../shared/redaction/redigir.js';

export type StatusDoPet = 'active' | 'lost' | 'deceased' | 'archived';
export type Especie = 'dog' | 'cat' | 'other';
export type Porte = 'P' | 'M' | 'G' | 'GG';
export type Sexo = 'male' | 'female' | 'unknown';

/** Os campos que o tutor informa. Espelha `PetInput` do contrato. */
export interface DadosDoPet {
  readonly name: string;
  readonly species: Especie;
  readonly breedCode: string | null;
  readonly breedFreeText: string | null;
  /**
   * A versão da lista que **o cliente** tinha em mãos. Não é a corrente do
   * servidor: `ref_data_versions.is_current` responde "qual é a lista de hoje"
   * e não responde "de qual lista este pet foi escolhido", e é a segunda
   * pergunta que importa quando um código sai da lista ou muda de rótulo.
   */
  readonly refDataVersion: string | null;
  readonly size: Porte;
  readonly primaryColorCode: string | null;
  readonly secondaryColorCode: string | null;
  readonly sex: Sexo | null;
  readonly neutered: boolean | null;
  readonly birthDateApprox: string | null;
  readonly distinctiveMarks: string | null;
  /** Já redigido quando chega aqui. A porta não redige nada. */
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
  /** Caso de perdido em aberto, quando houver. Visão do dono, nunca pública. */
  readonly openCaseId: string | null;
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
  /** Quantos pets vivos a conta tem. Sustenta o teto de `pet-limit-reached`. */
  contarDoTutor(dono: UserId): Promise<number>;

  /**
   * Confere os códigos contra as tabelas de referência **antes** da escrita.
   *
   * Existe porque as chaves estrangeiras também conferem, e a resposta delas é
   * violação de restrição — um 500. Quem digitou um código inválido precisa de
   * `validation-failed` com o nome do campo, e não de "erro interno".
   */
  conferirCodigos(dados: DadosDoPet): Promise<CodigosConhecidos>;

  criar(id: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado>;

  listarDoTutor(dono: UserId): Promise<readonly PetGravado[]>;

  /** `null` quando não existe **ou** não é do chamador. São a mesma resposta. */
  buscarDoTutor(pet: PetId, dono: UserId): Promise<PetGravado | null>;

  /** `null` com o mesmo significado de `buscarDoTutor`. */
  atualizar(pet: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado | null>;

  /** Exclusão lógica. `false` quando não existe ou não é do chamador. */
  excluir(pet: PetId, dono: UserId, quando: Instant): Promise<boolean>;
}
