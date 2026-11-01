import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  AvisoDaCaixa,
  ComunicadoDaCaixa,
  DestinoDoAviso,
  PaginaDaCaixa,
  TipoDeAviso,
} from '../../domain/caixa.js';
import type { CaixaDeNotificacoes } from '../../ports/caixa-de-notificacoes.js';

interface LinhaDaCaixa {
  ref: string;
  item_kind: TipoDeAviso;
  subject_label: string | null;
  occurred_at: Date;
  lida: boolean;
  agrupados: number;
  destino: DestinoDoAviso | null;
  destino_ref: string | null;
  total_de_grupos: string;
}

function comoAviso(l: LinhaDaCaixa): AvisoDaCaixa {
  return {
    ref: l.ref,
    tipo: l.item_kind,
    assunto: l.subject_label,
    aconteceuEm: l.occurred_at,
    lido: l.lida,
    agrupados: l.agrupados,
    destino: l.destino,
    destinoRef: l.destino_ref,
  };
}

interface LinhaDoComunicado {
  ref: string;
  title: string;
  body: string;
  dispatched_at: Date;
}

export function criarCaixaDeNotificacoes(db: Db): CaixaDeNotificacoes {
  return {
    async listar(usuario: UserId, pagina: number, limite: number): Promise<PaginaDaCaixa> {
      const [linhas, naoLidos] = await Promise.all([
        sql<LinhaDaCaixa>`
          SELECT * FROM caixa_de_notificacoes(${usuario}, ${pagina}, ${limite})`.execute(db),
        sql<{ total: number }>`
          SELECT contagem_de_notificacoes(${usuario}) AS total`.execute(db),
      ]);

      const itens = linhas.rows.map(comoAviso);
      const total = linhas.rows.length === 0 ? 0 : Number(linhas.rows[0]!.total_de_grupos);

      return {
        itens,
        pagina,
        limite,
        total,
        naoLidos: naoLidos.rows[0]?.total ?? 0,
      };
    },

    async contar(usuario: UserId): Promise<number> {
      const r = await sql<{ total: number }>`
        SELECT contagem_de_notificacoes(${usuario}) AS total`.execute(db);
      return r.rows[0]?.total ?? 0;
    },

    async marcarLida(usuario: UserId, ref: string): Promise<boolean> {
      const r = await sql<{ marcada: boolean | null }>`
        SELECT notificacao_marcar_lida(${usuario}, ${ref}) AS marcada`.execute(db);
      return r.rows[0]?.marcada ?? false;
    },

    async marcarTodasLidas(usuario: UserId): Promise<number> {
      const r = await sql<{ marcadas: number }>`
        SELECT notificacoes_marcar_todas_lidas(${usuario}) AS marcadas`.execute(db);
      return r.rows[0]?.marcadas ?? 0;
    },

    async dispensar(usuario: UserId, ref: string): Promise<boolean> {
      const r = await sql<{ dispensada: boolean | null }>`
        SELECT notificacao_dispensar(${usuario}, ${ref}) AS dispensada`.execute(db);
      return r.rows[0]?.dispensada ?? false;
    },

    async listaVista(usuario: UserId): Promise<void> {
      await sql`SELECT notificacoes_lista_vista(${usuario})`.execute(db);
    },

    async buscarComunicado(usuario: UserId, ref: string): Promise<ComunicadoDaCaixa | undefined> {
      const r = await sql<LinhaDoComunicado>`
        SELECT b.ref, b.title, b.body, b.dispatched_at
          FROM notification_broadcasts b
         WHERE b.ref = ${ref}
           AND conta_habilitada(${usuario})
           AND EXISTS (
                 SELECT 1
                   FROM notification_items i
                  WHERE i.recipient_user_id = ${usuario}
                    AND i.item_kind = 'broadcast'
                    AND i.source_kind = 'broadcast'
                    AND i.source_id = b.id
               )`.execute(db);
      const linha = r.rows[0];
      if (linha === undefined) return undefined;
      return {
        ref: linha.ref,
        titulo: linha.title,
        corpo: linha.body,
        disparadoEm: linha.dispatched_at,
      };
    },
  };
}
