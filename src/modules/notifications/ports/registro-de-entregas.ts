/**
 * A porta que o webhook de entrega enxerga do banco.
 *
 * Dois métodos, e a estreiteza é o ponto: o handler de um webhook público não
 * pode ter alcance para nada além do que o contrato promete. Uma porta larga
 * aqui seria a superfície que um evento forjado usa quando a assinatura falhar
 * por outro motivo qualquer.
 */
import type { TipoDeEventoDeEntrega } from '../domain/evento-de-entrega.js';

export interface EventoParaGravar {
  readonly messageId: string;
  readonly recordType: TipoDeEventoDeEntrega;
  readonly tipo: string | null;
  readonly descricao: string | null;
  readonly ocorridoEm: Date | null;
}

export interface RegistroDeEntregas {
  /**
   * Grava o evento e diz se ele é **novo**.
   *
   * `true` = primeira vez que este par (mensagem, tipo) chega. `false` = o
   * provedor reenviou, e nada mais pode acontecer a partir daqui.
   *
   * É esta resposta, e não um `SELECT` antes do `INSERT`, que sustenta a
   * idempotência: duas reentregas simultâneas do mesmo evento passariam as duas
   * por um `SELECT` que não achou nada. O `INSERT ... ON CONFLICT DO NOTHING`
   * decide no banco, que é o único lugar onde a corrida tem árbitro.
   */
  registrar(evento: EventoParaGravar): Promise<boolean>;

  /**
   * Marca o endereço como não entregável e devolve `true` quando alguma conta
   * foi de fato alterada.
   *
   * Recebe o endereço em claro e **não o guarda**: ele existe só durante esta
   * chamada, o tempo de casar com `users.email`. Ver o comentário da migração
   * 20260919000001 sobre por que não há coluna de destinatário.
   */
  marcarEnderecoNaoEntregavel(endereco: string): Promise<boolean>;
}
