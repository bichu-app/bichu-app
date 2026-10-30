/**
 * `help_requests` -- a duvida que o tutor manda pelo botao `Ajuda`
 * (migracao `20261029000010`, 29/10/2026; o estado de atendida veio na
 * `20261030000001`, 30/10/2026).
 *
 * ## NAO HA `DELETE` EM LUGAR NENHUM DESTE ARQUIVO
 *
 * Nem fisico, nem por prazo. Atendida e **mudanca de estado**: duas colunas
 * passam a ter valor, e nada sai da tabela. "Nao apague nada" e decisao desta
 * casa, e `marcarAtendida` e um `UPDATE` com `WHERE attended_at IS NULL` --
 * que e tambem o que o torna idempotente.
 *
 * Duvida repetida tambem nao e deduplicada: quem mandou duas vezes mandou
 * duas, e quem segura rajada e o teto de chamada.
 *
 * ## NENHUMA JUNCAO COM `users`
 *
 * Nao e economia de consulta, e a regra do backoffice: o contrato afirma em
 * tres lugares que a fila de pedidos de encontro e *"a unica leitura de pessoa
 * do backoffice v1"* (D53 a D57). A juncao que existe aqui e com
 * `admin_accounts`, para o nome de quem ATENDEU -- conta do painel, nao do
 * app, e nao e leitura de pessoa no sentido daquela decisao.
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

/** A declaracao da trilha, a MESMA do `x-audit` da rota e de `ACOES_ADMINISTRATIVAS`. */
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
          // 128 bits de CSPRNG em base64url (22 simbolos), a mesma forma de
          // `users.public_ref`. E ele que sai para o painel; o `id` nunca sai.
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

      // `author_user_id` e `id` NAO entram no `select`, e nunca entram: o
      // primeiro criaria a segunda leitura de pessoa do backoffice, e o
      // segundo e UUIDv7, ordenavel no tempo (SEC-001/SEC-002).
      //
      // A juncao e com `admin_accounts`, pelo nome de quem atendeu. `left`
      // porque a linha aberta nao tem autoria nenhuma.
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

      // DUAS CONTAGENS, e elas respondem perguntas diferentes.
      //
      // `total` e do RECORTE desta chamada: e o que diz ao painel quantas
      // paginas esta aba tem. `abertas` IGNORA o filtro, porque e o numerinho
      // do menu e ele responde "quanto trabalho esta esperando" -- filtrar as
      // duas juntas faria o menu anunciar "0 pendentes" toda vez que alguem
      // abrisse a aba dos atendidos.
      //
      // Vir do banco e nao de `linhas.length`: com o tamanho da pagina o
      // painel desenharia uma pagina so e esconderia o resto da fila.
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
      // A ESCRITA E O EVENTO DA TRILHA NA MESMA TRANSACAO (ADR-0027 D49): a
      // falha da trilha desfaz a marcacao.
      //
      // Isto nao e zelo: `x-audit` no contrato e DECLARACAO, e o portao a
      // confere sem escrever nada. Medido numa pilha de pe -- com a declaracao
      // no lugar e sem esta transacao, `audit.events` ficava SEM nenhuma linha
      // de `admin.help_request.attended`, e a transicao que o cliente pediu
      // auditavel nao era.
      return escrita.executar(async (trx) => {
        // `WHERE attended_at IS NULL` e o que faz a IDEMPOTENCIA, e nao um
        // `SELECT` antes: duas operadoras tocando o botao ao mesmo tempo
        // chegam as duas aqui, e a segunda nao casa com o `WHERE` -- entao ela
        // nao sobrepoe a autoria da primeira. O caminho em dois passos
        // perderia essa corrida e apagaria quem marcou antes, que e um
        // `DELETE` disfarcado de `UPDATE`.
        const marcadas = await trx
          .updateTable('help_requests')
          .set({ attended_at: comoData(agora), attended_by_admin_id: ator.adminAccountId })
          .where('ref', '=', ref)
          .where('attended_at', 'is', null)
          .executeTakeFirst();

        // A leitura DEPOIS da escrita, e sempre: ela serve ao caminho que
        // acabou de marcar e ao que ja estava marcado, com a mesma consulta. O
        // `undefined` aqui e o `ref` que nao existe, e vira 404 na rota.
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
            // `before`/`after` dizem o que MUDOU, e a repeticao idempotente
            // registra que nada mudou -- que tambem e um fato que o diagnostico
            // vai querer. Nenhum texto da duvida entra: a trilha guarda a
            // TRANSICAO, e nao o conteudo.
            before: { status: Number(marcadas?.numUpdatedRows ?? 0) > 0 ? 'open' : 'attended' },
            after: { status: 'attended' },
          }),
        };
      });
    },
  };
}
