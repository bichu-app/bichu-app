/** O ENDERECO DE ENTREGA GUARDADO NO PET. */
import type { PetId, UserId } from '../../../shared/types/brands.js';
import type { EnderecoDeEntrega } from './pedido-de-plaquinha.js';

export interface EnderecoDoPetRepository {
  /** O endereco guardado DESTE pet, quando o pet e do chamador. */
  doPetDoChamador(pet: PetId, chamador: UserId): Promise<EnderecoDeEntrega | null | undefined>;

  /** Guarda ou troca o endereco DESTE pet, e devolve como ele ficou. */
  guardarNoPet(
    pet: PetId,
    chamador: UserId,
    endereco: EnderecoDeEntrega,
  ): Promise<EnderecoDeEntrega | undefined>;
}
