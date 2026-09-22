/**
 * `RegistroDeEntregas` sobre a tabela `notification_deliveries`
 * (migração 20260919000001).
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

export function criarRegistroDeEntregas(db: Db, ids: IdGenerator): RegistroDeEntregas {
  return {
    async registrar(evento: EventoParaGravar): Promise<boolean> {
      // `ON CONFLICT DO NOTHING` sobre o índice único (message_id, record_type),
      // com `RETURNING`: a linha só volta quando a inserção ACONTECEU.
      //
      // Não há `SELECT` antes, e a ausência é a decisão. Um `SELECT` que não
      // acha nada, seguido de `INSERT`, tem uma janela entre os dois — e o
      // provedor reenvia justamente quando estamos lentos, que é quando a
      // janela é mais larga. As duas reentregas passariam pelo `SELECT` e as
      // duas marcariam o endereço. O banco é o único lugar da corrida que tem
      // árbitro, então é ele quem decide quem foi o primeiro.
      //
      // `DO NOTHING` e não `DO UPDATE`: evento já registrado é fato consumado e
      // não se reescreve. Sobrescrever com a reentrega apagaria o `received_at`
      // original, que é justamente o campo pelo qual se investiga reentrega.
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
      // `users.email` é `citext`, então a comparação já ignora caixa: o
      // provedor devolve o endereço com a grafia que o remetente usou, e o
      // tutor pode ter cadastrado com outra.
      //
      // `WHERE email_deliverable` no filtro, e não só na coluna atribuída:
      // conta já marcada devolve zero linhas, e o chamador consegue distinguir
      // "marquei agora" de "já estava marcada". Sem isso, o log diria que
      // suprimiu um endereço toda vez que um evento repetido escapasse — e a
      // trilha passaria a contar supressões que não existiram.
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
