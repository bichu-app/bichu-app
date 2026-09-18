/**
 * Porta de persistência da mídia.
 *
 * Mesma decisão do ADR-0021 aplicada aqui: **todo método que toca uma foto ou
 * uma intenção recebe o dono como argumento obrigatório**, e a busca é
 * vinculada. A consulta que devolveria a foto de outro tutor não existe.
 *
 * Nenhum método devolve nem aceita URL. O que trafega é `ObjectKey`; a URL é
 * montada na leitura (§11.1 proibição 9), e os tipos marcados impedem gravar uma
 * no lugar da outra em tempo de compilação.
 */
import type { Instant, ObjectKey, PetId, UserId } from '../../../shared/types/brands.js';

export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

export interface IntencaoDeEnvio {
  readonly id: string;
  readonly userId: UserId;
  readonly petId: PetId | null;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
}

export interface FotoDoPet {
  readonly id: string;
  readonly status: StatusDaFoto;
  readonly isPrimary: boolean;
  readonly originalKey: ObjectKey;
  readonly thumbKey: ObjectKey | null;
  readonly cardKey: ObjectKey | null;
  readonly createdAt: Date;
}

export interface NovaIntencao {
  readonly id: string;
  readonly userId: UserId;
  readonly petId: PetId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface MediaRepository {
  /** Confere que o pet é do chamador. Sem isso, qualquer conta pede envio para qualquer pet. */
  petEhDoTutor(pet: PetId, dono: UserId): Promise<boolean>;

  registrarIntencao(nova: NovaIntencao): Promise<void>;

  /** `null` quando não existe, não é do chamador, venceu ou já foi confirmada. */
  buscarIntencaoAberta(id: string, dono: UserId, agora: Instant): Promise<IntencaoDeEnvio | null>;

  /**
   * Cria a foto e marca a intenção como confirmada **na mesma transação**, e
   * enfileira o processamento junto.
   *
   * Os três juntos não são zelo: foto criada sem trabalho enfileirado fica
   * `processing` para sempre, e trabalho enfileirado sem foto falha em laço
   * procurando uma linha que não existe.
   */
  confirmarEnvio(entrada: {
    readonly fotoId: string;
    readonly trabalhoId: string;
    readonly intencaoId: string;
    readonly petId: PetId;
    readonly objectKey: ObjectKey;
    readonly definirComoPrincipal: boolean;
    readonly agora: Instant;
  }): Promise<FotoDoPet>;

  listarDoPet(pet: PetId, dono: UserId): Promise<readonly FotoDoPet[]>;

  /**
   * As fotos de VÁRIOS pets numa consulta só.
   *
   * Existe por causa de `listMyPets`, que devolve a lista inteira do tutor: uma
   * consulta por pet transformaria a tela inicial do app em N+1 no caminho mais
   * percorrido que existe. Não recebe dono porque quem chama já provou a posse
   * ao carregar os pets — e a lista de ids vem dessa mesma leitura.
   */
  porPets(pets: readonly PetId[]): Promise<ReadonlyMap<string, readonly FotoDoPet[]>>;

  /** `null` quando não existe ou não é do chamador. */
  buscarFoto(pet: PetId, foto: string, dono: UserId): Promise<FotoDoPet | null>;

  excluirFoto(pet: PetId, foto: string, dono: UserId, agora: Instant): Promise<boolean>;

  /**
   * A foto como o WORKER precisa dela: sem dono, porque quem chama é o processo
   * de trabalho e não uma requisição de usuário. É o único método desta porta
   * que não recebe o tutor, e a exceção é deliberada e limitada — ele devolve
   * chave de objeto e nada mais que sirva para montar uma resposta.
   */
  buscarParaProcessar(foto: string): Promise<FotoParaProcessar | null>;

  marcarPronta(entrada: {
    readonly fotoId: string;
    readonly thumbKey: ObjectKey;
    readonly cardKey: ObjectKey;
    readonly agora: Instant;
  }): Promise<void>;

  /** Estado FINAL (critério 19): não volta para a fila. */
  marcarRecusada(foto: string, motivo: string, agora: Instant): Promise<void>;
}

export interface FotoParaProcessar {
  readonly id: string;
  readonly petId: PetId;
  readonly status: StatusDaFoto;
  readonly originalKey: ObjectKey;
}
