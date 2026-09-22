/**
 * O caso de uso do webhook de entrega: registrar o evento **uma vez** e, quando
 * ele for definitivo, marcar o endereço como não entregável.
 *
 * Fica fora do adaptador HTTP de propósito. `src/bin/api.ts` não é carregado por
 * teste nenhum (ele abre porta, banco e SMTP), e o mesmo vale para qualquer
 * decisão que só exista dentro de um handler: ela nasce em 0% de cobertura. O
 * defeito que isso produz já aconteceu neste repositório — `invalidarTodasAsSessoes`,
 * mecanismo escrito, testado e sem chamador. Aqui a decisão está num lugar que
 * um teste alcança sem subir nada.
 *
 * ## Por que o trabalho pesado NÃO acontece aqui
 *
 * O provedor de e-mail **desiste e reenvia** quando a resposta demora. Um
 * handler que faz trabalho longo não fica lento: ele fica lento E recebe o mesmo
 * evento de novo, o que multiplica o trabalho que já estava demorando. O que
 * roda no caminho da requisição são no máximo três instruções curtas e
 * indexadas: o `INSERT ... ON CONFLICT`, a busca da conta pelo endereço e o
 * `UPDATE` de uma coluna booleana.
 *
 * O aviso persistente na tela do tutor NÃO exige envio de push daqui, e é por
 * isso que ele não está nesta função: a tela lê `email_deliverable` em
 * `GET /v1/me`, que já devolve o campo. Marcar a coluna **é** acender o aviso.
 */
import { decidir, type EventoDeEntrega } from '../domain/evento-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../ports/registro-de-entregas.js';

export interface EntradaDoEvento extends EventoDeEntrega {
  readonly messageId: string;
  readonly descricao: string | undefined;
  readonly ocorridoEm: Date | undefined;
  /**
   * `Recipient` do corpo, em claro.
   *
   * **Nunca é gravado e nunca vai para log.** Ele existe dentro desta chamada
   * para casar com `users.email` e some quando ela retorna. Ver a migração
   * 20260919000001.
   */
  readonly destinatario: string | undefined;
}

export interface ResultadoDoEvento {
  /** `false` quando o provedor reenviou: nenhum efeito aconteceu. */
  readonly novo: boolean;
  /** O endereço foi marcado como não entregável nesta chamada. */
  readonly suprimiu: boolean;
  /**
   * Devolução com subtipo que não reconhecemos. Não suprimiu nada, e precisa de
   * olho humano — a rota transforma isto em `warn`.
   */
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

  // A GRAVAÇÃO VEM ANTES DA DECISÃO, e a ordem é a idempotência inteira.
  //
  // Decidir primeiro e gravar depois deixaria uma janela em que a reentrega do
  // mesmo evento também decide "suprimir" antes de a primeira ter gravado.
  // Gravando primeiro, quem perde a corrida do `ON CONFLICT` recebe `false` e
  // sai aqui — sem tocar em `users`. O efeito acontece exatamente uma vez por
  // par (mensagem, tipo), que é o que o contrato promete.
  if (!novo) {
    return { novo: false, suprimiu: false, subtipoDesconhecido: false };
  }

  const decisao = decidir(entrada);
  if (decisao !== 'suprimir') {
    return { novo: true, suprimiu: false, subtipoDesconhecido: decisao === 'desconhecido' };
  }

  // Evento definitivo SEM destinatário no corpo não tem o que suprimir, e
  // inventar um alvo aqui seria pior do que não agir: o campo é opcional no
  // contrato. O evento já ficou gravado acima, então o rastro existe.
  if (entrada.destinatario === undefined || entrada.destinatario === '') {
    return { novo: true, suprimiu: false, subtipoDesconhecido: false };
  }

  const suprimiu = await registro.marcarEnderecoNaoEntregavel(entrada.destinatario);
  return { novo: true, suprimiu, subtipoDesconhecido: false };
}
