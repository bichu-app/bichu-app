/** A persistência do disparo: `alert_dispatches` e `alert_recipients`. */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { EstadoDoDisparo } from '../../domain/disparo-do-alerta.js';
import type {
  ConclusaoDoDisparo,
  ContextoDoCaso,
  DisparoGravado,
  NovoDisparo,
  RegistroDeDisparos,
} from '../../ports/registro-de-disparos.js';
import type { CaseId, Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoDisparo {
  id: string;
  case_id: string;
  reach_status: EstadoDoDisparo;
  recipients_total: number | null;
  radius_m: number;
  cap_reached: boolean;
  requested_at: Date;
  dispatched_at: Date | null;
}

function comoDisparo(linha: LinhaDoDisparo): DisparoGravado {
  return {
    id: linha.id,
    caso: linha.case_id as CaseId,
    estado: linha.reach_status,
    destinatarios: linha.recipients_total,
    raioEmMetros: linha.radius_m,
    tetoAtingido: linha.cap_reached,
    pedidoEm: linha.requested_at,
    enviadoEm: linha.dispatched_at,
  };
}

interface LinhaDoContexto {
  case_id: string;
  owner_user_id: string;
  lat: number | null;
  lon: number | null;
  last_seen_neighborhood: string | null;
  share_token: string;
  status: string;
  pet_name: string;
  species_code: string;
  card_key: string | null;
}

export function criarRegistroDeDisparos(db: Db): RegistroDeDisparos {
  return {
    async abrir(entrada: NovoDisparo): Promise<DisparoGravado> {
      const linha = await db
        .insertInto('alert_dispatches')
        .values({
          id: entrada.id,
          case_id: entrada.caso,
          radius_m: entrada.raioEmMetros,
          reach_status: entrada.estado,
          recipients_total: null,
          requested_at: comoData(entrada.pedidoEm),
          dispatched_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return comoDisparo(linha);
    },

    async ultimoDoCaso(caso: CaseId): Promise<DisparoGravado | null> {
      const linha = await db
        .selectFrom('alert_dispatches')
        .selectAll()
        .where('case_id', '=', caso)
        .orderBy('requested_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      return linha === undefined ? null : comoDisparo(linha);
    },

    async ultimoEnvioDoCaso(caso: CaseId): Promise<Instant | null> {
      const linha = await db
        .selectFrom('alert_dispatches')
        .select('dispatched_at')
        .where('case_id', '=', caso)
        .where('dispatched_at', 'is not', null)
        .orderBy('dispatched_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (linha?.dispatched_at == null) return null;
      return linha.dispatched_at.getTime() as Instant;
    },

    async contextoDoCaso(caso: CaseId): Promise<ContextoDoCaso | null> {
      const resultado = await sql<LinhaDoContexto>`
        SELECT
          c.id                     AS case_id,
          c.owner_user_id          AS owner_user_id,
          ST_Y(c.last_seen_point::geometry) AS lat,
          ST_X(c.last_seen_point::geometry) AS lon,
          c.last_seen_neighborhood AS last_seen_neighborhood,
          c.share_token            AS share_token,
          c.status                 AS status,
          p.name                   AS pet_name,
          p.species_code           AS species_code,
          (
            SELECT f.card_key
              FROM pet_photos f
             WHERE f.pet_id = p.id
               AND f.status = 'ready'
               AND f.deleted_at IS NULL
             ORDER BY f.is_primary DESC, f.created_at ASC
             LIMIT 1
          ) AS card_key
          FROM lost_cases c
          JOIN pets p ON p.id = c.pet_id
         WHERE c.id = ${caso}
      `.execute(db);

      const linha = resultado.rows[0];
      if (linha === undefined) return null;

      return {
        caso: linha.case_id as CaseId,
        tutor: linha.owner_user_id as UserId,
        centro:
          linha.lat === null || linha.lon === null
            ? undefined
            : { lat: linha.lat, lon: linha.lon },
        bairro: linha.last_seen_neighborhood,
        nomeDoPet: linha.pet_name,
        especie: linha.species_code,
        tokenPublico: linha.share_token,
        fotoKey: linha.card_key,
        aberto: linha.status === 'open',
      };
    },

    async concluir(entrada: ConclusaoDoDisparo): Promise<void> {
      const enviadoEm = comoData(entrada.enviadoEm);

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('alert_dispatches')
          .set({
            reach_status: entrada.estado,
            recipients_total: entrada.estado === 'computed' ? entrada.avisados.length : null,
            cap_reached: entrada.tetoAtingido,
            dispatched_at: enviadoEm,
          })
          .where('id', '=', entrada.id)
          .execute();

        if (entrada.avisados.length === 0) return;

        await trx
          .insertInto('alert_recipients')
          .values(
            entrada.avisados.map((usuario) => ({
              dispatch_id: entrada.id,
              user_id: usuario,
              notified_at: enviadoEm,
            })),
          )
          .onConflict((oc) => oc.columns(['dispatch_id', 'user_id']).doNothing())
          .execute();
      });
    },
  };
}
