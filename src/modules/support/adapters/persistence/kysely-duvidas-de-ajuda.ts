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

/**
 * **A transacao nao mudou nada, e por isso ela VOLTA ATRAS.**
 *
 * ===========================================================================
 * POR QUE UM `throw` E NAO UM `return`
 * ===========================================================================
 * `EscritaAuditada.executar` exige um evento de TODO trabalho, e isso e a
 * trava: ela existe para que nao haja escrita administrativa sem linha em
 * `audit.events`, e afrouxar `ResultadoAuditado` para aceitar `evento:
 * undefined` abriria a porta que ela fecha -- o contrato diz, em texto, que
 * "`EscritaAuditada` no servidor nao admite escrita sem evento".
 *
 * A saida e a outra ponta: a transacao que nao mudou nada **nao e uma
 * escrita**, e desfaze-la inteira deixa o banco exatamente onde estava. No
 * Kysely so `throw` desfaz; `return` COMITA. Era por `return` que a segunda
 * marcacao gravava a linha, e por `return` que o 404 gravava a dele.
 *
 * O sinal carrega a duvida LIDA dentro da transacao, para a rota responder
 * `200` com a linha como ela esta -- idempotencia de verdade, e nao `409`, que
 * o contrato recusa em texto ("obrigaria o painel a recarregar para descobrir
 * que o trabalho ja estava feito").
 */
class NadaMudou extends Error {
  constructor(readonly duvida: DuvidaNaFila | undefined) {
    super('a marcacao de atendida nao mudou nada; a transacao volta atras');
    this.name = 'NadaMudou';
  }
}

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

    /**
     * **SO MARCA O QUE ESTAVA ABERTO, e so grava trilha quando marcou.**
     *
     * O `UPDATE` tem `attended_at IS NULL` no `WHERE`, entao a segunda chamada
     * nao troca quem marcou nem quando -- e o que o contrato promete. O que
     * nao se media era a TRILHA: a segunda chamada respondia `200` e gravava
     * uma linha com `before.status: 'attended'` e `after.status: 'attended'`,
     * e o `ref` inexistente respondia `404` e gravava a dele, com um
     * `resource_id` que nao existe. As duas poluiam `audit.events`, que e a
     * unica prova de quem fez o que no painel.
     */
    async marcarAtendida(
      ator: AtorAdministrativo,
      ref: string,
      agora: Instant,
    ): Promise<DuvidaNaFila | undefined> {
      try {
        return await escrita.executar(async (trx) => {
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
          const duvida = linha === undefined ? undefined : comoDuvida(linha);

          // Zero linha atualizada quer dizer uma de duas coisas, e nenhuma
          // delas e uma mudanca: o `ref` nao existe (a rota traduz `undefined`
          // para 404) ou ela JA estava atendida (a rota responde 200 com a
          // linha como esta).
          if (Number(marcadas.numUpdatedRows) === 0) throw new NadaMudou(duvida);

          return {
            resultado: duvida,
            evento: eventoAdministrativo(TRILHA, ator, {
              resourceId: ref,
              // `open` sem condicional: a linha so nasce quando a transicao
              // ACONTECEU, e antes dela a duvida estava aberta. O ternario
              // anterior era o proprio defeito escrito -- ele admitia que a
              // linha podia nascer de uma chamada que nao mudou nada.
              before: { status: 'open' },
              after: { status: 'attended' },
            }),
          };
        });
      } catch (erro) {
        if (erro instanceof NadaMudou) return erro.duvida;
        throw erro;
      }
    },
  };
}
