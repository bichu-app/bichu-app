/**
 * `help_requests` -- a duvida que o tutor manda pelo botao `Ajuda` (migracao
 * `20261029000010`, 29/10/2026; o estado de atendida veio na `20261030000001`,
 * 30/10/2026).
 */
import { eventoAdministrativo } from '../../../audit/ports/trilha-administrativa.js';
import type { AtorAdministrativo } from '../../../audit/ports/trilha-administrativa.js';
import type { EscritaAuditada } from '../../../audit/ports/audit-log.js';
import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  DuvidaNaFila,
  DuvidaParaRegistrar,
  DuvidasDeAjuda,
  PaginaDaFila,
  SituacaoDaDuvida,
} from '../../ports/duvidas-de-ajuda.js';

/** A forma da linha que as duas leituras projetam, e so ela. */
interface LinhaDaFila {
  ref: string;
  subject: string;
  body: string;
  created_at: Date;
  attended_at: Date | null;
  attended_by: string | null;
}

function comoDuvida(linha: LinhaDaFila): DuvidaNaFila {
  return {
    ref: linha.ref,
    assunto: linha.subject,
    texto: linha.body,
    criadaEm: linha.created_at.getTime() as Instant,
    ...(linha.attended_at === null
      ? {}
      : { atendidaEm: linha.attended_at.getTime() as Instant }),
    ...(linha.attended_by === null ? {} : { atendidaPor: linha.attended_by }),
  };
}

/**
 * A declaracao da trilha, a MESMA do `x-audit` da rota e de
 * `ACOES_ADMINISTRATIVAS`.
 */
const TRILHA = { action: 'admin.help_request.attended', resourceKind: 'help_request' } as const;

export function criarDuvidasDeAjuda(
  db: Db,
  ids: IdGenerator,
  escrita: EscritaAuditada,
): DuvidasDeAjuda {
  return {
    async registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void> {
      await db
        .insertInto('help_requests')
        .values({
          id: ids.uuidv7(),
          ref: Buffer.from(ids.random128()).toString('base64url'),
          author_user_id: duvida.autor,
          subject: duvida.assunto,
          body: duvida.texto,
          created_at: comoData(agora),
        })
        .execute();
    },

    async listarAFila(
      situacao: SituacaoDaDuvida,
      pagina: number,
      limite: number,
    ): Promise<PaginaDaFila> {
      const deslocamento = (pagina - 1) * limite;
      const aberta = situacao === 'open';

      const linhas = await db
        .selectFrom('help_requests as h')
        .leftJoin('admin_accounts as a', 'a.id', 'h.attended_by_admin_id')
        .select([
          'h.ref',
          'h.subject',
          'h.body',
          'h.created_at',
          'h.attended_at',
          'a.display_name as attended_by',
        ])
        .where('h.attended_at', aberta ? 'is' : 'is not', null)
        .orderBy('h.created_at', 'desc')
        .offset(deslocamento)
        .limit(limite)
        .execute();

      const [{ total }, { abertas }] = await Promise.all([
        db
          .selectFrom('help_requests')
          .select((eb) => eb.fn.countAll<string>().as('total'))
          .where('attended_at', aberta ? 'is' : 'is not', null)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('help_requests')
          .select((eb) => eb.fn.countAll<string>().as('abertas'))
          .where('attended_at', 'is', null)
          .executeTakeFirstOrThrow(),
      ]);

      return {
        itens: linhas.map(comoDuvida),
        total: Number(total),
        abertas: Number(abertas),
      };
    },

    marcarAtendida(
      ator: AtorAdministrativo,
      ref: string,
      agora: Instant,
    ): Promise<DuvidaNaFila | undefined> {
      return escrita.executar(async (trx) => {
        const marcadas = await trx
          .updateTable('help_requests')
          .set({ attended_at: comoData(agora), attended_by_admin_id: ator.adminAccountId })
          .where('ref', '=', ref)
          .where('attended_at', 'is', null)
          .executeTakeFirst();

        const linha = await trx
          .selectFrom('help_requests as h')
          .leftJoin('admin_accounts as a', 'a.id', 'h.attended_by_admin_id')
          .select([
            'h.ref',
            'h.subject',
            'h.body',
            'h.created_at',
            'h.attended_at',
            'a.display_name as attended_by',
          ])
          .where('h.ref', '=', ref)
          .executeTakeFirst();

        return {
          resultado: linha === undefined ? undefined : comoDuvida(linha),
          evento: eventoAdministrativo(TRILHA, ator, {
            resourceId: ref,
            before: { status: Number(marcadas?.numUpdatedRows ?? 0) > 0 ? 'open' : 'attended' },
            after: { status: 'attended' },
          }),
        };
      });
    },
  };
}
