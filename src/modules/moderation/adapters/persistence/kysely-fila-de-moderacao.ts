/**
 * Persistencia da FILA DE MODERACAO do painel.
 *
 * ## O FILTRO DE CONTA DESABILITADA ESTA EM TRES LUGARES NESTE ARQUIVO
 *
 * Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
 * nenhuma pagina ou funcionalidade". Aqui isso custa TRES clausulas `WHERE`, e
 * nao uma:
 *
 *   1. **LUGAR 1 -- a LISTAGEM** (`listar`, a consulta das linhas e o
 *      `count(*)` do recorte);
 *   2. **LUGAR 2 -- a LEITURA de um item** (`lerItem`, usada fora e dentro da
 *      transacao pela mesma funcao, com e sem trava);
 *   3. **LUGAR 3 -- a CONTAGEM DO AVISO DO MENU** (`listar`, o `pendentes`).
 *
 * O terceiro e o que a fila da Rede ensinou a nao esquecer: la o filtro entrou
 * primeiro so na listagem, e o painel passou a dizer "1 pendente" sobre uma
 * fila vazia -- quem abria procurava um pedido que a listagem nao mostrava
 * mais. A `20261017000014` registra o episodio e a
 * `20261017000016` o repete por extenso.
 *
 * `conta-desabilitada-sai-da-fila-de-moderacao.test.ts` le o SQL COMPILADO das
 * tres e reprova se qualquer uma perder o predicado.
 *
 * ## O predicado e FUNCAO, e nenhum nome de coluna de autoria esta escrito aqui
 *
 * `reporter_active`, coluna da visao `fila_de_moderacao`, vem de
 * `denuncia_de_avaliacao_com_denunciante_ativo(uuid)` e
 * `denuncia_de_conversa_com_denunciante_ativo(uuid)` (migracao
 * `20261018000009`), que delegam a `conta_habilitada(uuid)`
 * (`20261017000013`), o ponto unico da definicao.
 *
 * Duas razoes para ser funcao, e as duas valem sozinhas:
 * `src/tools/portao-colunas-que-nao-saem.ts` reprova nome literal de coluna
 * marcada em todo `.ts` de `src/`, inclusive em comentario; e a resolucao do
 * denunciante da CONVERSA e por PAPEL, com dois ramos sobre `reporter_role`,
 * que em TypeScript viraria um `CASE` escrito a mao em cada uma das tres
 * consultas -- tres copias sao tres lugares onde uma correcao pode faltar.
 *
 * ## A AGREGACAO E POR ALVO, E E O QUE A FILA MOSTRA
 *
 * A visao devolve uma linha por DENUNCIA; estas consultas agrupam por
 * `(origin, target_ref)`. E o modelo do despacho: "contagem de repeticao e o
 * sinal que separa briga de problema real". Tres pessoas denunciando a mesma
 * avaliacao viram UM item com `report_count = 3`, e nao tres itens iguais.
 *
 * `target_*` sao constantes dentro do grupo (vem do `JOIN` com o alvo), e
 * `min()`/`bool_or()` sobre eles e o jeito de passa-los pelo `GROUP BY` sem
 * repeti-los na clausula -- repeti-los la nao mudaria o resultado e faria a
 * clausula crescer a cada campo novo do alvo.
 *
 * ## `SELECT` por nome de coluna, e nunca `select('*')`
 *
 * A visao nao tem coluna de autoria (`reporter_active` e booleano, de
 * proposito), mas a regra vale igual: um `*` traria para a memoria do processo
 * qualquer coluna que a visao ganhe depois, inclusive em `log` de objeto.
 *
 * ## NAO HA `DELETE` EM CAMINHO NENHUM DESTE ARQUIVO
 *
 * As duas escritas sao `UPDATE`. A remocao e logica; a decisao e gravada sobre
 * a linha da denuncia, que fica.
 */
import { sql } from 'kysely';

import type { Db, DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  DecisaoDaModeracao,
  ItemDaFila,
  OrigemDaDenuncia,
} from '../../domain/fila-de-moderacao.js';
import type {
  AlvoRemovido,
  FilaDeModeracaoRepository,
  PaginaDaFila,
  RecorteDaFila,
  TransacaoDaModeracao,
} from '../../ports/fila-de-moderacao.js';

export interface DependenciasDaFilaDeModeracao {
  readonly db: Db;
  readonly trilha: TrilhaTransacional;
}

/**
 * O PREDICADO, como expressao reusada nas TRES consultas.
 *
 * Uma constante e nao tres copias: tres copias sao tres lugares onde uma
 * correcao pode faltar, e a correcao que falta num deles e justamente o defeito
 * que este arquivo existe para nao repetir.
 */
const DENUNCIANTE_ATIVO = sql<boolean>`f.reporter_active`;

/**
 * As colunas do item AGREGADO, por nome.
 *
 * `reasons` sai como `array_agg(DISTINCT ...)` -- os motivos distintos, para a
 * triagem -- e `reason`/`detail` saem da denuncia MAIS ANTIGA do grupo, que e a
 * que abriu o item de fila. `array_agg(... ORDER BY ...)` e nao `min()`: `min`
 * sobre texto daria o motivo alfabeticamente menor, que nao quer dizer nada.
 */
const COLUNAS = sql`
  f.origin,
  f.target_ref,
  min(f.target_subject)                                       AS subject,
  min(f.target_body)                                          AS content,
  min(f.target_rating)                                        AS rating,
  (array_agg(f.reason ORDER BY f.created_at, f.report_id))[1]  AS reason,
  array_agg(DISTINCT f.reason)                                 AS reasons,
  (array_agg(f.detail  ORDER BY f.created_at, f.report_id))[1] AS detail,
  count(*)::int                                                AS report_count,
  sum(f.repeat_count)::int                                     AS repeat_total,
  min(f.created_at)                                            AS first_reported_at,
  max(f.last_reported_at)                                      AS last_reported_at,
  bool_or(f.target_removed)                                    AS content_removed,
  (array_agg(f.resolution        ORDER BY f.resolved_at DESC NULLS LAST))[1] AS resolution,
  (array_agg(f.resolution_reason ORDER BY f.resolved_at DESC NULLS LAST))[1] AS resolution_reason,
  max(f.resolved_at)                                           AS resolved_at`;

interface LinhaDoItem {
  origin: string;
  target_ref: string;
  subject: string;
  content: string | null;
  rating: number | null;
  reason: string;
  reasons: string[];
  detail: string | null;
  report_count: number;
  repeat_total: number;
  first_reported_at: Date;
  last_reported_at: Date;
  content_removed: boolean;
  resolution: DecisaoDaModeracao | null;
  resolution_reason: string | null;
  resolved_at: Date | null;
}

function comoItem(l: LinhaDoItem): ItemDaFila {
  return {
    origem: l.origin as OrigemDaDenuncia,
    targetRef: l.target_ref,
    assunto: l.subject,
    conteudo: l.content,
    nota: l.rating,
    motivo: l.reason,
    motivos: l.reasons,
    detalhe: l.detail,
    reportCount: l.report_count,
    repeatTotal: l.repeat_total,
    primeiraEm: l.first_reported_at,
    ultimaEm: l.last_reported_at,
    conteudoRemovido: l.content_removed,
    decisao: l.resolution,
    motivoDaDecisao: l.resolution_reason,
    decididaEm: l.resolved_at,
  };
}

/**
 * LUGAR 2 do filtro: a LEITURA de um item.
 *
 * Sem o predicado aqui, o item que a listagem esconde volta a ser alcancavel
 * por quem tiver o `target_ref` -- e, pior, DECIDIVEL, porque e por esta mesma
 * funcao que a escrita le o item antes de gravar.
 *
 * `travar` liga `FOR UPDATE`: a decisao le e grava na mesma transacao, e sem a
 * trava dois operadores clicando juntos passariam os dois pela conferencia de
 * "ainda esta aberta". **A trava e sobre as DENUNCIAS**
 * (`professional_review_reports` / `conversation_reports`), e nao sobre o alvo:
 * travar `professional_reviews` faria uma decisao de fila bloquear a edicao da
 * avaliacao pelo autor dela.
 *
 * `FOR UPDATE` nao combina com agregacao na mesma consulta, entao a trava e um
 * passo proprio ANTES da leitura agregada: ela tranca as linhas de denuncia
 * abertas do alvo, e so depois o item e montado.
 */
async function lerItem(
  db: DbExecutor,
  origem: OrigemDaDenuncia,
  targetRef: string,
  travar: boolean,
  apenasAbertas: boolean,
): Promise<ItemDaFila | null> {
  if (travar) await travarDenuncias(db, origem, targetRef);

  const r = await sql<LinhaDoItem>`
    SELECT ${COLUNAS}
      FROM fila_de_moderacao f
     WHERE f.origin = ${origem}
       AND f.target_ref = ${targetRef}
       AND ${DENUNCIANTE_ATIVO}
       ${apenasAbertas ? sql`AND f.resolved_at IS NULL` : sql``}
     GROUP BY f.origin, f.target_ref`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoItem(linha);
}

/**
 * A trava das denuncias ABERTAS do alvo, por origem.
 *
 * Nenhuma coluna de autoria aqui: o que se trava e a linha da denuncia, por
 * `id` do alvo. O predicado do denunciante NAO entra nesta consulta de
 * proposito -- ela nao decide nada e nao devolve nada; quem decide e a leitura
 * agregada logo depois, que tem o predicado. Travar uma linha a mais nao
 * autoriza ninguem a nada.
 */
async function travarDenuncias(
  db: DbExecutor,
  origem: OrigemDaDenuncia,
  targetRef: string,
): Promise<void> {
  if (origem === 'review') {
    await sql`
      SELECT d.id
        FROM professional_review_reports d
        JOIN professional_reviews r ON r.id = d.review_id
       WHERE r.ref = ${targetRef} AND d.resolved_at IS NULL
         FOR UPDATE OF d`.execute(db);
    return;
  }
  await sql`
    SELECT d.id
      FROM conversation_reports d
     WHERE d.conversation_id = ${targetRef}::uuid AND d.resolved_at IS NULL
       FOR UPDATE OF d`.execute(db);
}

/**
 * Esconde o conteudo. **Exclusao logica, e nunca `DELETE`.**
 *
 * As duas pernas tem a mesma forma e a mesma guarda: o `WHERE` exige que o
 * conteudo ainda esteja no ar, e zero linhas devolve `null`. Sobrescrever o
 * motivo de uma remocao que ja valeu apagaria a decisao de quem decidiu
 * primeiro.
 */
async function removerConteudo(
  trx: DbTransaction,
  origem: OrigemDaDenuncia,
  targetRef: string,
  motivo: string,
  agora: Instant,
): Promise<AlvoRemovido | null> {
  if (origem === 'review') {
    // O MESMO par de colunas de `removeAdminDirectoryReview`, e o mesmo
    // `CHECK` cruzado da `20261017000017` o cobra: `status <> 'published'`
    // exige `moderation_reason` e `moderated_at`.
    const linha = await trx
      .updateTable('professional_reviews')
      .set({ status: 'removed', moderation_reason: motivo, moderated_at: new Date(agora) })
      .where('ref', '=', targetRef)
      .where('status', '=', 'published')
      .returning(['id', 'rating'])
      .executeTakeFirst();
    return linha === undefined ? null : { id: linha.id, notaAntes: linha.rating };
  }

  const linha = await trx
    .updateTable('conversations')
    .set({ moderation_removed_at: new Date(agora), moderation_reason: motivo })
    .where('id', '=', targetRef)
    .where('moderation_removed_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  // A conversa nao tem nota: `notaAntes` nulo, e nao zero. Zero seria uma nota.
  return linha === undefined ? null : { id: linha.id, notaAntes: null };
}

/**
 * Marca a decisao em TODAS as denuncias abertas do alvo, e devolve quantas.
 *
 * `WHERE resolved_at IS NULL` e o que faz a mesma denuncia nao se resolver duas
 * vezes: o segundo operador encontra zero linhas, e a rota responde `404` em
 * vez de sobrescrever o motivo da decisao que valeu.
 *
 * **Nao apaga nada.** A linha da denuncia fica, com `resolution` e
 * `resolution_reason`, e o `down` da `20261018000009` recusa a propria descida
 * enquanto houver decisao gravada.
 */
async function resolverDenuncias(
  trx: DbTransaction,
  origem: OrigemDaDenuncia,
  targetRef: string,
  decisao: DecisaoDaModeracao,
  motivo: string,
  agora: Instant,
): Promise<{ quantidade: number; decididaEm: Date }> {
  const quando = new Date(agora);
  if (origem === 'review') {
    const r = await sql<{ id: string }>`
      UPDATE professional_review_reports d
         SET resolved_at = ${quando},
             resolution = ${decisao},
             resolution_reason = ${motivo}
       WHERE d.resolved_at IS NULL
         AND d.review_id = (SELECT r.id FROM professional_reviews r WHERE r.ref = ${targetRef})
      RETURNING d.id`.execute(trx);
    return { quantidade: r.rows.length, decididaEm: quando };
  }
  const r = await sql<{ id: string }>`
    UPDATE conversation_reports d
       SET resolved_at = ${quando},
           resolution = ${decisao},
           resolution_reason = ${motivo}
     WHERE d.resolved_at IS NULL
       AND d.conversation_id = ${targetRef}::uuid
    RETURNING d.id`.execute(trx);
  return { quantidade: r.rows.length, decididaEm: quando };
}

export function criarFilaDeModeracaoRepository(
  deps: DependenciasDaFilaDeModeracao,
): FilaDeModeracaoRepository {
  const { db } = deps;

  return {
    emTransacao: (trabalho) =>
      db.transaction().execute((trx) => {
        const transacao: TransacaoDaModeracao = {
          itemPorAlvo: (origem, ref) => lerItem(trx, origem, ref, true, true),
          removerConteudo: (origem, ref, motivo, agora) =>
            removerConteudo(trx, origem, ref, motivo, agora),
          resolverDenuncias: (origem, ref, decisao, motivo, agora) =>
            resolverDenuncias(trx, origem, ref, decisao, motivo, agora),
          registrarNaTrilha: (evento) => deps.trilha.recordIn(trx, evento),
        };
        return trabalho(transacao);
      }),

    async listar(recorte: RecorteDaFila): Promise<PaginaDaFila> {
      // Sem filtro, a fila ABERTA: e a pergunta que o painel faz ao abrir, e e
      // a ordem do indice parcial das duas tabelas de denuncia
      // (`..._fila`, `WHERE resolved_at IS NULL`).
      const aberta = (recorte.estado ?? 'open') === 'open';
      const estado = aberta ? sql`f.resolved_at IS NULL` : sql`f.resolved_at IS NOT NULL`;
      const origem =
        recorte.origem === undefined ? sql`` : sql`AND f.origin = ${recorte.origem}`;

      // LUGAR 1: as linhas e a contagem do recorte. A contagem conta GRUPOS, e
      // nao denuncias: o que a tela pagina sao alvos.
      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total FROM (
          SELECT 1
            FROM fila_de_moderacao f
           WHERE ${estado} AND ${DENUNCIANTE_ATIVO} ${origem}
           GROUP BY f.origin, f.target_ref) g`.execute(db);

      const linhas = await sql<LinhaDoItem>`
        SELECT ${COLUNAS}
          FROM fila_de_moderacao f
         WHERE ${estado} AND ${DENUNCIANTE_ATIVO} ${origem}
         GROUP BY f.origin, f.target_ref
         ORDER BY min(f.created_at) ASC, f.target_ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(db);

      // LUGAR 3: a CONTAGEM DO AVISO DO MENU. Ela ignora o recorte -- o numero
      // do item da navegacao responde "quanto trabalho esta esperando" -- e
      // passa pelo MESMO predicado. Sem ele, o painel diria "1 pendente" sobre
      // uma fila que a listagem mostra vazia.
      const pendentes = await sql<{ total: string }>`
        SELECT count(*) AS total FROM (
          SELECT 1
            FROM fila_de_moderacao f
           WHERE f.resolved_at IS NULL AND ${DENUNCIANTE_ATIVO}
           GROUP BY f.origin, f.target_ref) g`.execute(db);

      return {
        itens: linhas.rows.map(comoItem),
        total: Number(contagem.rows[0]?.total ?? 0),
        pendentes: Number(pendentes.rows[0]?.total ?? 0),
      };
    },

    // A leitura de fora da transacao traz o item em QUALQUER estado: a tela de
    // decisao precisa poder abrir uma denuncia ja resolvida para ler o motivo.
    itemPorAlvo: (origem, ref) => lerItem(db, origem, ref, false, false),
  };
}
