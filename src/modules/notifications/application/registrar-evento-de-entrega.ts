/**
 * O caso de uso do webhook de entrega: registrar o evento **uma vez** e, quando
 * ele for definitivo, marcar o endereço como não entregável.
 */
import { decidir, type EventoDeEntrega } from '../domain/evento-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../ports/registro-de-entregas.js';

export interface EntradaDoEvento extends EventoDeEntrega {
  readonly messageId: string;
  readonly descricao: string | undefined;
  readonly ocorridoEm: Date | undefined;
  /** `Recipient` do corpo, em claro. */
  readonly destinatario: string | undefined;
}

export interface ResultadoDoEvento {
  /** `false` quando o provedor reenviou: nenhum efeito aconteceu. */
  readonly novo: boolean;
  /** O endereço foi marcado como não entregável nesta chamada. */
  readonly suprimiu: boolean;
  /** Devolução com subtipo que não reconhecemos. */
  readonly subtipoDesconhecido: boolean;
}

export async function registrarEventoDeEntrega(
  registro: RegistroDeEntregas,
  entrada: EntradaDoEvento,
): Promise<ResultadoDoEvento> {
  const paraGravar: EventoParaGravar = {
    messageId: entrada.messageId,
    recordType: entrada.recordType,
    tipo: entrada.tipo ?? null,
    descricao: entrada.descricao ?? null,
    ocorridoEm: entrada.ocorridoEm ?? null,
  };

  const novo = await registro.registrar(paraGravar);

  if (!novo) {
    return { novo: false, suprimiu: false, subtipoDesconhecido: false };
  }

  const decisao = decidir(entrada);
  if (decisao !== 'suprimir') {
    return { novo: true, suprimiu: false, subtipoDesconhecido: decisao === 'desconhecido' };
  }

  if (entrada.destinatario === undefined || entrada.destinatario === '') {
    return { novo: true, suprimiu: false, subtipoDesconhecido: false };
  }

  const suprimiu = await registro.marcarEnderecoNaoEntregavel(entrada.destinatario);
  return { novo: true, suprimiu, subtipoDesconhecido: false };
}
