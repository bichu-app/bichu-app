import type { TipoDeEventoDeEntrega } from '../domain/evento-de-entrega.js';

export interface EventoParaGravar {
  readonly messageId: string;
  readonly recordType: TipoDeEventoDeEntrega;
  readonly tipo: string | null;
  readonly descricao: string | null;
  readonly ocorridoEm: Date | null;
}

export interface RegistroDeEntregas {
  /** Grava o evento e diz se ele é **novo**. */
  registrar(evento: EventoParaGravar): Promise<boolean>;

  /**
   * Marca o endereço como não entregável e devolve `true` quando alguma conta foi de
   * fato alterada.
   */
  marcarEnderecoNaoEntregavel(endereco: string): Promise<boolean>;
}
