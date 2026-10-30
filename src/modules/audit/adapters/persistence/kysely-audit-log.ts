/** Gravação da trilha no esquema `audit`. */
import { sql } from 'kysely';
import { assumirPapel, type Db, type DbTransaction } from '../../../../shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../../../shared/crypto/digest.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { Clock } from '../../../../shared/time/clock.js';
import type {
  AuditEvent,
  AuditLog,
  ContagemNaTrilha,
  EscritaAuditada,
  TrilhaTransacional,
} from '../../ports/audit-log.js';

export const PAPEL_DE_ESCRITA = 'bichu_audit_writer';
export const PAPEL_DE_EXPURGO = 'bichu_audit_purger';

/** Retenção de 24 meses (docs/03-arquitetura.md 4.8). */
export const RETENCAO_EM_MESES = 24;

export interface DependenciasDaTrilha {
  readonly db: Db;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Chave do HMAC de IP. Hash sem chave não anonimiza nada (SEC-010). */
  readonly ipHmacKey: Buffer;
  /** Chamado quando a gravação falha. */
  readonly onFailure: (erro: unknown, evento: AuditEvent) => void;
}

function comoJson(valor: Record<string, unknown> | undefined): unknown {
  return valor === undefined ? null : valor;
}

/**
 * O tipo ja impede o evento incoerente; esta conferencia existe para o que chega
 * por conversao (`as`) ou por JavaScript sem tipo, e ela antecipa o que os dois
 * `CHECK` de `audit.events` recusariam, com uma mensagem que diz qual ator estava
 * errado.
 */
function exigirAtorCoerente(evento: AuditEvent): void {
  const temUsuario = evento.actorUserId !== undefined;
  const temAdmin = evento.actorAdminId !== undefined;
  if ((evento.actorKind === 'user') !== temUsuario || (evento.actorKind === 'admin') !== temAdmin) {
    throw new Error(
      `Evento de auditoria incoerente: actor_kind=${evento.actorKind} com ` +
        `${temUsuario ? 'um' : 'nenhum'} actor_user_id e ${temAdmin ? 'um' : 'nenhum'} actor_admin_id.`,
    );
  }
}

type DependenciasDaGravacao = Pick<DependenciasDaTrilha, 'ids' | 'clock' | 'ipHmacKey'>;

/** O `INSERT`, sob o papel que ja foi assumido por quem chama. */
async function inserirEvento(
  trx: DbTransaction,
  deps: DependenciasDaGravacao,
  evento: AuditEvent,
): Promise<void> {
  await trx
    .insertInto('audit.events')
    .values({
      id: deps.ids.uuidv7(),
      occurred_at: new Date(deps.clock.now()),
      actor_kind: evento.actorKind,
      actor_user_id: evento.actorUserId ?? null,
      actor_admin_id: evento.actorAdminId ?? null,
      actor_ip_hmac: hmacDeEnderecoIp(evento.actorIp, deps.ipHmacKey),
      correlation_id: evento.correlationId ?? null,
      action: evento.action,
      resource_kind: evento.resourceKind,
      resource_id: evento.resourceId ?? null,
      before: comoJson(evento.before),
      after: comoJson(evento.after),
      metadata: comoJson(evento.metadata),
    })
    .execute();
}

export function criarTrilhaDeAuditoria(deps: DependenciasDaTrilha): AuditLog {
  return {
    async record(evento) {
      exigirAtorCoerente(evento);

      try {
        await deps.db.transaction().execute(async (trx) => {
          await assumirPapel(trx, PAPEL_DE_ESCRITA);
          await inserirEvento(trx, deps, evento);
        });
      } catch (erro) {
        deps.onFailure(erro, evento);
      }
    },
  };
}

/** A trilha que grava DENTRO da transacao de quem chama (ADR-0027 item 8, D49). */
export function criarTrilhaTransacional(deps: DependenciasDaGravacao): TrilhaTransacional {
  return {
    async recordIn(trx, evento) {
      exigirAtorCoerente(evento);
      const atual = await sql<{ papel: string }>`select current_user as papel`.execute(trx);
      const papelAnterior = atual.rows[0]?.papel;
      if (papelAnterior === undefined) {
        throw new Error('O banco nao respondeu current_user; a trilha nao sabe que papel repor.');
      }
      await assumirPapel(trx, PAPEL_DE_ESCRITA);
      await inserirEvento(trx, deps, evento);
      await assumirPapel(trx, papelAnterior);
    },
  };
}

/**
 * A soma na trilha, sob `bichu_audit_writer` (que tem `SELECT` em `audit.events`)
 * e com o papel anterior reposto logo depois, pelo mesmo motivo de `recordIn`.
 */
export function criarContagemNaTrilha(): ContagemNaTrilha {
  return {
    async somarNaJanela(trx, consulta) {
      const atual = await sql<{ papel: string }>`select current_user as papel`.execute(trx);
      const papelAnterior = atual.rows[0]?.papel;
      if (papelAnterior === undefined) {
        throw new Error('O banco nao respondeu current_user; a contagem nao sabe que papel repor.');
      }
      await assumirPapel(trx, PAPEL_DE_ESCRITA);
      const linha = await sql<{ total: string | null; mais_antigo: Date | null }>`
        select coalesce(sum((metadata ->> ${consulta.campo})::int), 0) as total,
               min(occurred_at) as mais_antigo
          from audit.events
         where actor_admin_id = ${consulta.actorAdminId}::uuid
           and action = ${consulta.action}
           and occurred_at > ${consulta.desde}::timestamptz`.execute(trx);
      await assumirPapel(trx, papelAnterior);
      const r = linha.rows[0];
      return { total: Number(r?.total ?? 0), maisAntigo: r?.mais_antigo ?? null };
    },

    async contarNaJanela(trx, consulta) {
      const atual = await sql<{ papel: string }>`select current_user as papel`.execute(trx);
      const papelAnterior = atual.rows[0]?.papel;
      if (papelAnterior === undefined) {
        throw new Error('O banco nao respondeu current_user; a contagem nao sabe que papel repor.');
      }
      await assumirPapel(trx, PAPEL_DE_ESCRITA);
      const linha = await sql<{ total: string }>`
        select count(*) as total
          from audit.events
         where action = ${consulta.action}
           and resource_id = ${consulta.resourceId}
           and metadata ->> 'reason' = ${consulta.motivo}
           and occurred_at > ${consulta.desde}::timestamptz`.execute(trx);
      await assumirPapel(trx, papelAnterior);
      return Number(linha.rows[0]?.total ?? 0);
    },
  };
}

/** A unidade de trabalho de toda escrita administrativa. */
export function criarEscritaAuditada(deps: {
  readonly db: Db;
  readonly trilha: TrilhaTransacional;
}): EscritaAuditada {
  return {
    executar: (trabalho) =>
      deps.db.transaction().execute(async (trx) => {
        const { resultado, evento } = await trabalho(trx);
        await deps.trilha.recordIn(trx, evento);
        return resultado;
      }),
  };
}

export interface ResultadoDoExpurgo {
  readonly removidos: number;
  readonly limite: Date;
}

/** Expurgo da retenção de 24 meses (BICHUS-56, critério 6). */
export async function expurgarEventosVencidos(
  db: Db,
  agoraEmMilissegundos: number,
  retencaoEmMeses = RETENCAO_EM_MESES,
): Promise<ResultadoDoExpurgo> {
  const limite = new Date(agoraEmMilissegundos);
  limite.setMonth(limite.getMonth() - retencaoEmMeses);

  return db.transaction().execute(async (trx) => {
    await assumirPapel(trx, PAPEL_DE_EXPURGO);
    const removidos = await sql<{ id: string }>`
      delete from audit.events where occurred_at < ${limite} returning id
    `.execute(trx);
    return { removidos: removidos.rows.length, limite };
  });
}
