/**
 * Gravação da trilha no esquema `audit`.
 *
 * O detalhe que faz o critério 8 da BICHUS-56 ser verdadeiro em vez de escrito:
 * **cada gravação assume o papel `bichu_audit_writer` com `SET LOCAL ROLE`**.
 * Sem isso, a aplicação escreveria com o papel de login, que no ambiente local é
 * o dono da tabela — e **dono contorna qualquer GRANT**. A ausência de `UPDATE`
 * e `DELETE` no papel só protege alguma coisa se o papel for de fato assumido.
 *
 * `SET LOCAL` e não `SET`: o papel volta sozinho no fim da transação, inclusive
 * quando ela falha. Um `SET ROLE` sem `LOCAL` sobreviveria à devolução da
 * conexão ao pool.
 */
import { sql } from 'kysely';
import { assumirPapel, type Db } from '../../../../shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../../../shared/crypto/digest.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { Clock } from '../../../../shared/time/clock.js';
import type { AuditEvent, AuditLog } from '../../ports/audit-log.js';

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
  /**
   * Chamado quando a gravação falha. A trilha **não pode derrubar o pedido do
   * usuário**: um incidente no esquema de auditoria não é motivo para o tutor
   * não conseguir abrir o caso do pet perdido. Mas falha silenciosa também não
   * serve, então ela sai por aqui, ruidosa, para o log e o alerta.
   */
  readonly onFailure: (erro: unknown, evento: AuditEvent) => void;
}

function comoJson(valor: Record<string, unknown> | undefined): unknown {
  return valor === undefined ? null : valor;
}

export function criarTrilhaDeAuditoria(deps: DependenciasDaTrilha): AuditLog {
  return {
    async record(evento) {
      if ((evento.actorKind === 'user') !== (evento.actorUserId !== undefined)) {
        throw new Error(
          `Evento de auditoria incoerente: actor_kind=${evento.actorKind} com ` +
            `${evento.actorUserId === undefined ? 'nenhum' : 'um'} actor_user_id.`,
        );
      }

      try {
        await deps.db.transaction().execute(async (trx) => {
          await assumirPapel(trx, PAPEL_DE_ESCRITA);
          await trx
            .insertInto('audit.events')
            .values({
              id: deps.ids.uuidv7(),
              occurred_at: new Date(deps.clock.now()),
              actor_kind: evento.actorKind,
              actor_user_id: evento.actorUserId ?? null,
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
        });
      } catch (erro) {
        deps.onFailure(erro, evento);
      }
    },
  };
}

export interface ResultadoDoExpurgo {
  readonly removidos: number;
  readonly limite: Date;
}

/**
 * Expurgo da retenção de 24 meses (BICHUS-56, critério 6).
 *
 * Roda com o papel `bichu_audit_purger`, que é o único com `DELETE`. Separar os
 * dois papéis é o que impede o caminho normal da aplicação de carregar a
 * permissão de apagar trilha.
 */
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
