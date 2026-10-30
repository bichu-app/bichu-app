/**
 * `DeliveryAddress` do contrato para [EnderecoDeEntrega] do dominio, e de volta --
 * **uma traducao so, nas duas direcoes**.
 */
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

/** `DeliveryAddress` como o schema do contrato ja o validou. */
export interface DeliveryAddressDoContrato {
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly postal_code: string;
  readonly street: string;
  readonly street_number: string;
  readonly complement?: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

/** O corpo para o dominio. */
export function comoEnderecoDeEntrega(endereco: DeliveryAddressDoContrato): EnderecoDeEntrega {
  return {
    destinatario: endereco.recipient_name.trim(),
    telefone: endereco.recipient_phone.trim(),
    cep: endereco.postal_code.replace(/\D/gu, ''),
    logradouro: endereco.street.trim(),
    numero: endereco.street_number.trim(),
    complemento:
      endereco.complement === undefined || endereco.complement.trim() === ''
        ? null
        : endereco.complement.trim(),
    bairro: endereco.neighborhood.trim(),
    cidade: endereco.city.trim(),
    uf: endereco.state.trim().toUpperCase(),
  };
}

/** O dominio para o corpo de resposta. */
export function comoDeliveryAddress(endereco: EnderecoDeEntrega): Record<string, unknown> {
  return {
    recipient_name: endereco.destinatario,
    recipient_phone: endereco.telefone,
    postal_code: endereco.cep,
    street: endereco.logradouro,
    street_number: endereco.numero,
    complement: endereco.complemento,
    neighborhood: endereco.bairro,
    city: endereco.cidade,
    state: endereco.uf,
  };
}
