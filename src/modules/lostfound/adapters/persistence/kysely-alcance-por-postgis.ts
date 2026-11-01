import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import {
  JANELA_DE_24H_EM_MS,
  TETO_DE_DESTINATARIOS,
  TETO_DE_FADIGA,
} from '../../domain/disparo-do-alerta.js';
import type {
  AlcanceCalculado,
  AlcanceDoAlerta,
  ConsultaDeAlcance,
  Destinatario,
} from '../../ports/alcance-do-alerta.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

export interface LinhaDoAlcance {
  user_id: string;
  device_ids: string[];
}

const LIMITE_DA_CONSULTA = TETO_DE_DESTINATARIOS + 1;

/** A consulta de alcance, como consulta ainda não executada. */
export function construtorDoAlcance(consulta: ConsultaDeAlcance) {
  const { lat, lon } = consulta.centro;
  const inicioDaJanelaDeFadiga = comoData(
    (Number(consulta.agora) - JANELA_DE_24H_EM_MS) as Instant,
  );

  return sql<LinhaDoAlcance>`
    SELECT
      url.user_id AS user_id,
      ARRAY(
        SELECT d.id
          FROM user_devices d
         WHERE d.user_id = url.user_id
           AND d.push_permission = 'granted'
           AND d.push_token IS NOT NULL
         ORDER BY d.last_seen_at DESC, d.id DESC
      ) AS device_ids
      FROM user_reference_locations url
      JOIN users u ON u.id = url.user_id
     WHERE url.expires_at > ${comoData(consulta.agora)}
       AND ST_DWithin(
             url.reference_point,
             ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
             ${consulta.raioEmMetros}
           )
       AND url.user_id <> ${consulta.excluir}
       AND EXISTS (
             SELECT 1
               FROM user_devices d
              WHERE d.user_id = url.user_id
                AND d.push_permission = 'granted'
                AND d.push_token IS NOT NULL
           )
       AND (
             SELECT count(*)
               FROM alert_recipients ar
              WHERE ar.user_id = url.user_id
                AND ar.notified_at > ${inicioDaJanelaDeFadiga}
           ) < ${TETO_DE_FADIGA}
       AND u.deleted_at IS NULL
     GROUP BY url.user_id
     ORDER BY MIN(ST_Distance(
                url.reference_point,
                ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
              )) ASC,
              url.user_id ASC
     LIMIT ${LIMITE_DA_CONSULTA}
  `;
}

export function criarAlcancePorPostGIS(db: Db): AlcanceDoAlerta {
  return {
    async alcancaveis(consulta: ConsultaDeAlcance): Promise<AlcanceCalculado | null> {
      const resultado = await construtorDoAlcance(consulta).execute(db);

      const tetoAtingido = resultado.rows.length > TETO_DE_DESTINATARIOS;
      const destinatarios: Destinatario[] = resultado.rows
        .slice(0, TETO_DE_DESTINATARIOS)
        .map((linha) => ({ usuario: linha.user_id as UserId, aparelhos: linha.device_ids }));

      return { destinatarios, tetoAtingido };
    },
  };
}
