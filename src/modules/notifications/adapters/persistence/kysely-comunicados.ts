/**
 * `RepositorioDeComunicados` sobre `notification_broadcasts` e a funcao
 * `comunicado_disparar` (migracao `20261018000020`).
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import { TETO_DIARIO_DE_COMUNICADOS } from '../../domain/comunicado.js';
import type {
  Comunicado,
  PaginaDeComunicados,
  JanelaDeDisparo,
  RascunhoDeComunicado,
} from '../../domain/comunicado.js';
import type {
  ComunicadoGravado,
  RepositorioDeComunicados,
  TransacaoDoComunicado,
} from '../../ports/comunicados.js';

interface LinhaDoComunicado {
  id: string;
  ref: string;
  title: string;
  body: string;
  dispatched_at: Date;
  dispatched_by: string;
  recipients_total: number;
}

function comoComunicado(l: LinhaDoComunicado): Comunicado {
  return {
    ref: l.ref,
    titulo: l.title,
    corpo: l.body,
    disparadoEm: l.dispatched_at,
    disparadoPor: l.dispatched_by,
    destinatarios: l.recipients_total,
  };
}

/** As colunas que saem, por nome. */
const COLUNAS = sql`
  b.id, b.ref, b.title, b.body, b.dispatched_at, b.recipients_total,
  (SELECT a.display_name FROM admin_accounts a WHERE a.id = b.dispatched_by_admin)
    AS dispatched_by`;

export function criarRepositorioDeComunicados(db: Db): RepositorioDeComunicados {
  return {
    async listar(pagina: number, limite: number): Promise<PaginaDeComunicados> {
      const deslocamento = (pagina - 1) * limite;
      const [linhas, contagem] = await Promise.all([
        sql<LinhaDoComunicado>`
          SELECT ${COLUNAS}
            FROM notification_broadcasts b
           ORDER BY b.dispatched_at DESC
           LIMIT ${limite} OFFSET ${deslocamento}`.execute(db),
        sql<{ total: string }>`SELECT count(*) AS total FROM notification_broadcasts`.execute(db),
      ]);

      return {
        itens: linhas.rows.map(comoComunicado),
        pagina,
        limite,
        total: Number(contagem.rows[0]?.total ?? '0'),
      };
    },

    async janelaDeDisparo(): Promise<JanelaDeDisparo> {
      const r = await sql<{ alcancaria: string; hoje: string }>`
        SELECT (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL) AS alcancaria,
               (SELECT count(*) FROM notification_broadcasts b
                 WHERE b.dispatched_at >= date_trunc('day', now()))      AS hoje`.execute(db);

      const alcancaria = Number(r.rows[0]?.alcancaria ?? '0');
      const hoje = Number(r.rows[0]?.hoje ?? '0');

      return {
        alcancaria,
        restamHoje: Math.max(0, TETO_DIARIO_DE_COMUNICADOS - hoje),
        tetoDiario: TETO_DIARIO_DE_COMUNICADOS,
      };
    },

    async disparar(
      trx: TransacaoDoComunicado,
      adminId: string,
      rascunho: RascunhoDeComunicado,
    ): Promise<ComunicadoGravado | undefined> {
      const disparo = await sql<{ ref: string; destinatarios: number }>`
        SELECT ref, destinatarios
          FROM comunicado_disparar(${adminId}, ${rascunho.titulo}, ${rascunho.corpo})`.execute(trx);

      const linha = disparo.rows[0];
      if (linha === undefined) return undefined;

      const lido = await sql<LinhaDoComunicado>`
        SELECT ${COLUNAS}
          FROM notification_broadcasts b
         WHERE b.ref = ${linha.ref}`.execute(trx);

      const gravado = lido.rows[0];
      if (gravado === undefined) {
        throw new Error('comunicado_disparar gravou mas a linha nao foi lida na mesma transacao');
      }
      return { id: gravado.id, comunicado: comoComunicado(gravado) };
    },
  };
}
