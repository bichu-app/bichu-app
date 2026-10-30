/** O ENDERECO DE ENTREGA GUARDADO NA CONTA. */
import type { UserId } from '../../../shared/types/brands.js';
import type { EnderecoDeEntrega } from './pedido-de-plaquinha.js';

export interface EnderecoGuardadoRepository {
  /** O endereco guardado do CHAMADOR, ou `null` quando ele nao tem nenhum. */
  doChamador(chamador: UserId): Promise<EnderecoDeEntrega | null>;

  /** Guarda ou troca o endereco do CHAMADOR, e devolve como ele ficou. */
  guardar(chamador: UserId, endereco: EnderecoDeEntrega): Promise<EnderecoDeEntrega>;
}
