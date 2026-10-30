/**
 * `RegistroDeEntregas` sobre a tabela `notification_deliveries` (migração
 * 20260919000001).
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

export function criarRegistroDeEntregas(db: Db, ids: IdGenerator): RegistroDeEntregas {
  return {
    async registrar(evento: EventoParaGravar): Promise<boolean> {
      const inserida = await db
        .insertInto('notification_deliveries')
        .values({
          id: ids.uuidv7(),
          message_id: evento.messageId,
          record_type: evento.recordType,
          event_type: evento.tipo,
          description: evento.descricao,
          occurred_at: evento.ocorridoEm,
        })
        .onConflict((oc) => oc.columns(['message_id', 'record_type']).doNothing())
        .returning('id')
        .executeTakeFirst();

      return inserida !== undefined;
    },

    async marcarEnderecoNaoEntregavel(endereco: string): Promise<boolean> {
      const alteradas = await db
        .updateTable('users')
        .set({ email_deliverable: false })
        .where('email', '=', endereco)
        .where('email_deliverable', '=', true)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      return Number(alteradas.numUpdatedRows) > 0;
    },
  };
}
