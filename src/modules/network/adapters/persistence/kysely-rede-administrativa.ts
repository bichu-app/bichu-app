/**
 * A escrita administrativa da `Rede` em Postgres (BICHUS-273 e BICHUS-292).
 *
 * ## O ponto
 *
 * `network_events.geo` e `ColumnType<never, never, never>` no esquema tipado,
 * de proposito: o unico caminho ate ela e SQL onde `ST_MakePoint`, `ST_Y` e
 * `ST_X` ficam a vista. Aqui o ponto e lido so para o painel (que o marcou) e
 * nunca vai para a trilha.
 *
 * ## O autor
 *
 * A coluna de autoria do encontro leva a marca "nunca sai do servidor" e o
 * portao `portao-colunas-que-nao-saem` recusa o nome dela em `src/`. Ela NAO e
 * escrita aqui: quem criou esta em `audit.events`, gravado na mesma transacao
 * (`admin.network_event.created`, com `actor_admin_id` e a sessao). A coluna de
 * quem decidiu o pedido (`decided_by_admin_id`, conta do painel) nao tem a
 * marca, e e escrita por SQL cru.
 *
 * ## A trilha
 *
 * `registrarNaTrilha` delega a `TrilhaTransacional.recordIn(trx, evento)`: o
 * evento entra na transacao da escrita, e a falha dele a desfaz (D49).
 */
import { sql, type SqlBool } from 'kysely';
import type { Db, DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { EstruturaDoLocal, IdadeDosCaes, ItemParaLevar } from '../../../../shared/db/schema.js';
import type { ContagemNaTrilha, TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { RegistroDeImagemDeCatalogo } from '../../../media/ports/imagem-de-catalogo.js';
import type {
  DecisaoDoPedido,
  EncontroAdministrativo,
  EstadoDaImagem,
  ImagemDoEncontroAdministrativa,
  PedidoNaFila,
  PublicacaoAdministrativa,
  UnidadeDoValor,
  Visibilidade,
} from '../../domain/escrita-do-encontro.js';
import {
  SlugDoEncontroOcupado,
  type MudancaDeEncontro,
  type Pagina,
  type RecorteDaFila,
  type RecorteDoPainel,
  type RedeAdministrativaRepository,
  type TransacaoDaRede,
} from '../../ports/rede-administrativa.js';
import { TRABALHO_DE_AVISO_DE_APROVACAO, type LeituraDoPedidoAprovado } from '../../ports/aviso-de-aprovacao.js';
import { escaparCuringas } from './kysely-network-repository.js';

const VIOLACAO_DE_UNICIDADE = '23505';
const INDICE_DO_SLUG = 'network_events_slug_unico';
/** Uma trava por conta, no espaco de chaves da fila: `hashtext` do texto abaixo. */
const PREFIXO_DA_TRAVA_DA_FILA = 'admin.network_join_request.listed:';

interface LinhaDoEncontro {
  id: string;
  slug: string;
  title: string;
  summary: string;
  place_name: string;
  neighborhood: string;
  city: string;
  state: string;
  lat: number | null;
  lon: number | null;
  starts_at: Date;
  ends_at: Date | null;
  time_zone: string;
  visibility: Visibilidade;
  admission_kind: 'free' | 'paid';
  admission_amount: number | null;
  admission_unit: UnidadeDoValor | null;
  dog_age: string;
  vaccination_required: boolean;
  fenced_off_leash_area: boolean;
  notes: string | null;
  street_address: string | null;
  publication_status: PublicacaoAdministrativa | 'pending_review';
  published_at: Date | null;
  cancelled_at: Date | null;
  cancellation_note: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  accepted_sizes: string[];
  amenities: string[];
  bring_items: string[];
  pending_requests: string | number;
  images: LinhaDaImagem[] | null;
}

interface LinhaDaImagem {
  upload_id: string | null;
  image_id: string;
  position: number;
  alt_text: string;
  status: EstadoDaImagem;
  public_key: string | null;
  rejection_reason: string | null;
}

/**
 * As colunas do encontro, nomeadas uma a uma. Nao ha `selectAll()`: ele traria
 * a coluna de autoria para dentro do processo.
 */
const COLUNAS = sql`
  e.id, e.slug, e.title, e.summary, e.place_name, e.neighborhood, e.city, e.state,
  ST_Y(e.geo::geometry) AS lat, ST_X(e.geo::geometry) AS lon,
  e.starts_at, e.ends_at, e.time_zone, e.visibility,
  e.admission_kind, e.admission_amount, e.admission_unit,
  e.dog_age, e.vaccination_required, e.fenced_off_leash_area, e.notes, e.street_address,
  e.publication_status, e.published_at, e.cancelled_at, e.cancellation_note,
  e.created_at, e.updated_at, e.version,
  array(SELECT s.size FROM network_event_sizes s JOIN ref_sizes r ON r.code = s.size
         WHERE s.event_id = e.id ORDER BY r.sort_order) AS accepted_sizes,
  array(SELECT a.amenity FROM network_event_amenities a WHERE a.event_id = e.id
         ORDER BY array_position(ARRAY['level_ground_or_ramp','accessible_restroom','public_restroom_nearby',
           'shade','benches','dog_water_fountain','parking_nearby'], a.amenity)) AS amenities,
  array(SELECT b.item FROM network_event_bring_items b WHERE b.event_id = e.id
         ORDER BY array_position(ARRAY['water','water_bowl','leash','poop_bags','treats','towel',
           'vaccination_card','toy'], b.item)) AS bring_items,
  (SELECT count(*) FROM network_event_join_requests j
    WHERE j.event_id = e.id AND j.status = 'pending' AND j.withdrawn_at IS NULL) AS pending_requests,
  (SELECT json_agg(json_build_object(
            'upload_id', c.upload_intent_id, 'image_id', c.id, 'position', i.position,
            'alt_text', i.alt_text, 'status', c.status, 'public_key', c.public_key,
            'rejection_reason', c.rejection_reason) ORDER BY i.position)
     FROM network_event_images i JOIN catalog_images c ON c.id = i.image_id
    WHERE i.event_id = e.id) AS images`;

function comoEncontro(l: LinhaDoEncontro): EncontroAdministrativo {
  const imagens: ImagemDoEncontroAdministrativa[] = (l.images ?? []).map((i) => ({
    uploadId: i.upload_id,
    imageId: i.image_id,
    position: Number(i.position),
    altText: i.alt_text,
    status: i.status,
    publicKey: i.public_key,
    rejectionReason: i.rejection_reason,
  }));
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    lugar: {
      placeName: l.place_name,
      neighborhood: l.neighborhood,
      city: l.city,
      state: l.state,
      ponto: l.lat === null || l.lon === null ? null : { lat: Number(l.lat), lon: Number(l.lon) },
    },
    startsAt: l.starts_at,
    endsAt: l.ends_at,
    timeZone: l.time_zone,
    visibilidade: l.visibility,
    entrada:
      l.admission_kind === 'paid' && l.admission_amount !== null && l.admission_unit !== null
        ? { tipo: 'paid', centavos: Number(l.admission_amount), unidade: l.admission_unit }
        : { tipo: 'free' },
    portes: l.accepted_sizes,
    idadeDosCaes: l.dog_age,
    vacinacaoExigida: l.vaccination_required,
    areaCercada: l.fenced_off_leash_area,
    estrutura: l.amenities,
    paraLevar: l.bring_items,
    observacoes: l.notes,
    endereco: l.street_address,
    // `pending_review` e so da comunidade e nao existe na v1; a leitura do
    // painel nao o enxerga (o `WHERE` abaixo o tira).
    publicacao: l.publication_status as PublicacaoAdministrativa,
    publishedAt: l.published_at,
    cancelledAt: l.cancelled_at,
    cancellationNote: l.cancellation_note,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    version: Number(l.version),
    pedidosPendentes: Number(l.pending_requests),
    imagens,
  };
}

const DO_PAINEL = sql<SqlBool>`e.publication_status IN ('published', 'cancelled', 'removed')`;

async function lerEncontro(
  db: DbExecutor,
  onde: ReturnType<typeof sql<SqlBool>>,
  travar: boolean,
): Promise<EncontroAdministrativo | null> {
  const r = await sql<LinhaDoEncontro>`
    SELECT ${COLUNAS} FROM network_events e
     WHERE ${DO_PAINEL} AND ${onde}
     ${travar ? sql`FOR UPDATE OF e` : sql``}`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoEncontro(linha);
}

function comSlugTraduzido<T>(escrever: () => Promise<T>): Promise<T> {
  return escrever().catch((erro: unknown) => {
    const e = erro as { code?: string; constraint?: string };
    if (e.code === VIOLACAO_DE_UNICIDADE && e.constraint === INDICE_DO_SLUG) throw new SlugDoEncontroOcupado();
    throw erro;
  });
}

async function gravarPonto(db: DbExecutor, id: string, ponto: { lat: number; lon: number } | null): Promise<void> {
  await (ponto === null
    ? sql`UPDATE network_events SET geo = NULL, geo_source = NULL WHERE id = ${id}::uuid`
    : sql`UPDATE network_events
             SET geo = ST_SetSRID(ST_MakePoint(${ponto.lon}, ${ponto.lat}), 4326)::geography,
                 geo_source = 'map_pin'
           WHERE id = ${id}::uuid`
  ).execute(db);
}

interface LinhaDoPedido {
  id: string;
  ref: string;
  status: DecisaoDoPedido;
  requested_at: Date;
  decided_at: Date | null;
  withdrawn_at: Date | null;
  event_slug: string;
  event_title: string;
  event_starts_at: Date;
  event_ends_at: Date | null;
  event_time_zone: string;
  event_publication: PublicacaoAdministrativa;
  display_name: string | null;
  account_created_at: Date;
  email_verified: boolean;
}

/** D53: so o nome de exibicao, a data de criacao da conta e o booleano do e-mail. */
const COLUNAS_DO_PEDIDO = sql`
  j.id, j.ref, j.status, j.requested_at, j.decided_at, j.withdrawn_at,
  e.slug AS event_slug, e.title AS event_title, e.starts_at AS event_starts_at,
  e.ends_at AS event_ends_at, e.time_zone AS event_time_zone, e.publication_status AS event_publication,
  u.display_name, u.created_at AS account_created_at,
  (u.email_verified_at IS NOT NULL) AS email_verified`;

function comoPedido(l: LinhaDoPedido): PedidoNaFila {
  return {
    id: l.id,
    ref: l.ref,
    decisao: l.status,
    requestedAt: l.requested_at,
    decidedAt: l.decided_at,
    withdrawnAt: l.withdrawn_at,
    encontro: {
      slug: l.event_slug,
      title: l.event_title,
      startsAt: l.event_starts_at,
      endsAt: l.event_ends_at,
      timeZone: l.event_time_zone,
      publicacao: l.event_publication,
    },
    solicitante: {
      displayName: l.display_name,
      contaCriadaEm: l.account_created_at,
      emailConfirmado: l.email_verified,
    },
  };
}

/**
 * O pedido pelo `ref` ou pelo `id`, de encontro privado em qualquer estado do
 * painel: o removido tambem e lido, para a decisao responder 409 e nao 404.
 */
async function lerPedido(db: DbExecutor, onde: ReturnType<typeof sql<SqlBool>>, travar: boolean): Promise<PedidoNaFila | null> {
  const r = await sql<LinhaDoPedido>`
    SELECT ${COLUNAS_DO_PEDIDO}
      FROM network_event_join_requests j
      JOIN network_events e ON e.id = j.event_id
      JOIN users u ON u.id = j.user_id
     WHERE e.visibility = 'private' AND e.publication_status IN ('published', 'cancelled', 'removed') AND ${onde}
     ${travar ? sql`FOR UPDATE OF j` : sql``}`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoPedido(linha);
}

export interface DependenciasDaRedeAdministrativaEmPostgres {
  readonly db: Db;
  readonly trilha: TrilhaTransacional;
  readonly contagem: ContagemNaTrilha;
  readonly imagens: RegistroDeImagemDeCatalogo;
}

function transacao(trx: DbTransaction, deps: DependenciasDaRedeAdministrativaEmPostgres): TransacaoDaRede {
  return {
    encontroPorSlug: (slug) => lerEncontro(trx, sql<SqlBool>`e.slug = ${slug}`, true),

    async recarregarEncontro(id) {
      const e = await lerEncontro(trx, sql<SqlBool>`e.id = ${id}::uuid`, false);
      if (e === null) throw new Error(`encontro ${id} sumiu dentro da propria transacao`);
      return e;
    },

    async existeSlug(slug) {
      const linha = await trx.selectFrom('network_events').select('id').where('slug', '=', slug).executeTakeFirst();
      return linha !== undefined;
    },

    async inserirEncontro(novo) {
      const agora = new Date(novo.agora);
      await comSlugTraduzido(() =>
        trx
          .insertInto('network_events')
          .values({
            id: novo.id,
            slug: novo.slug,
            title: novo.title,
            summary: novo.summary,
            place_name: novo.lugar.placeName,
            neighborhood: novo.lugar.neighborhood,
            city: novo.lugar.city,
            state: novo.lugar.state,
            geo_source: null,
            starts_at: novo.startsAt,
            ends_at: novo.endsAt,
            time_zone: novo.timeZone,
            visibility: novo.visibilidade,
            admission_kind: novo.entrada.tipo,
            admission_amount: novo.entrada.tipo === 'paid' ? novo.entrada.centavos : null,
            admission_currency: novo.entrada.tipo === 'paid' ? 'BRL' : null,
            admission_unit: novo.entrada.tipo === 'paid' ? novo.entrada.unidade : null,
            dog_age: novo.idadeDosCaes as IdadeDosCaes,
            vaccination_required: novo.vacinacaoExigida,
            fenced_off_leash_area: novo.areaCercada,
            notes: novo.observacoes,
            street_address: novo.endereco,
            origin: 'admin',
            // Criar e publicar (12.9): nao ha rascunho.
            publication_status: 'published',
            published_at: agora,
            cancelled_at: null,
            cancellation_note: null,
            created_at: agora,
            updated_at: agora,
            version: 1,
          })
          .execute(),
      );
      if (novo.lugar.ponto !== null) await gravarPonto(trx, novo.id, novo.lugar.ponto);
    },

    async atualizarEncontro(id, versaoLida, m: MudancaDeEncontro, agora) {
      const atualizado = await comSlugTraduzido(() =>
        trx
          .updateTable('network_events')
          .set((eb) => ({
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.title === undefined ? {} : { title: m.title }),
            ...(m.summary === undefined ? {} : { summary: m.summary }),
            ...(m.lugar === undefined
              ? {}
              : {
                  place_name: m.lugar.placeName,
                  neighborhood: m.lugar.neighborhood,
                  city: m.lugar.city,
                  state: m.lugar.state,
                }),
            ...(m.startsAt === undefined ? {} : { starts_at: m.startsAt }),
            ...(m.endsAt === undefined ? {} : { ends_at: m.endsAt }),
            ...(m.timeZone === undefined ? {} : { time_zone: m.timeZone }),
            ...(m.visibilidade === undefined ? {} : { visibility: m.visibilidade }),
            ...(m.entrada === undefined
              ? {}
              : {
                  admission_kind: m.entrada.tipo,
                  admission_amount: m.entrada.tipo === 'paid' ? m.entrada.centavos : null,
                  admission_currency: m.entrada.tipo === 'paid' ? ('BRL' as const) : null,
                  admission_unit: m.entrada.tipo === 'paid' ? m.entrada.unidade : null,
                }),
            ...(m.idadeDosCaes === undefined ? {} : { dog_age: m.idadeDosCaes as IdadeDosCaes }),
            ...(m.vacinacaoExigida === undefined ? {} : { vaccination_required: m.vacinacaoExigida }),
            ...(m.areaCercada === undefined ? {} : { fenced_off_leash_area: m.areaCercada }),
            ...(m.observacoes === undefined ? {} : { notes: m.observacoes }),
            ...(m.endereco === undefined ? {} : { street_address: m.endereco }),
            ...(m.publicacao === undefined ? {} : { publication_status: m.publicacao }),
            ...(m.cancelledAt === undefined ? {} : { cancelled_at: m.cancelledAt }),
            ...(m.cancellationNote === undefined ? {} : { cancellation_note: m.cancellationNote }),
            updated_at: new Date(agora),
            version: eb('version', '+', 1),
          }))
          .where('id', '=', id)
          .where('version', '=', versaoLida)
          .returning('id')
          .executeTakeFirst(),
      );
      if (atualizado === undefined) return false;
      if (m.lugar !== undefined) await gravarPonto(trx, id, m.lugar.ponto);
      return true;
    },

    async substituirPortes(eventoId, portes) {
      await trx.deleteFrom('network_event_sizes').where('event_id', '=', eventoId).execute();
      if (portes.length === 0) return;
      await trx
        .insertInto('network_event_sizes')
        .values(portes.map((size) => ({ event_id: eventoId, size })))
        .execute();
    },

    async substituirEstrutura(eventoId, estrutura) {
      await trx.deleteFrom('network_event_amenities').where('event_id', '=', eventoId).execute();
      if (estrutura.length === 0) return;
      await trx
        .insertInto('network_event_amenities')
        .values(estrutura.map((amenity) => ({ event_id: eventoId, amenity: amenity as EstruturaDoLocal })))
        .execute();
    },

    async substituirParaLevar(eventoId, itens) {
      await trx.deleteFrom('network_event_bring_items').where('event_id', '=', eventoId).execute();
      if (itens.length === 0) return;
      await trx
        .insertInto('network_event_bring_items')
        .values(itens.map((item) => ({ event_id: eventoId, item: item as ItemParaLevar })))
        .execute();
    },

    async substituirImagens(eventoId, imagens) {
      // Apagar e inserir: a galeria e substituida inteira, e a unicidade de
      // posicao e diferida, entao a ordem nova so e conferida no COMMIT.
      await trx.deleteFrom('network_event_images').where('event_id', '=', eventoId).execute();
      if (imagens.length === 0) return;
      await trx
        .insertInto('network_event_images')
        .values(
          imagens.map((i) => ({ event_id: eventoId, image_id: i.imageId, position: i.position, alt_text: i.altText })),
        )
        .execute();
    },

    async encontroDaImagem(imageId) {
      const linha = await trx
        .selectFrom('network_event_images')
        .select('event_id')
        .where('image_id', '=', imageId)
        .executeTakeFirst();
      return linha?.event_id ?? null;
    },

    envioDeCatalogo: (uploadId) => deps.imagens.envio(trx, uploadId),

    confirmarEnvioDeCatalogo: (entrada) =>
      deps.imagens.confirmar(trx, { ...entrada, purpose: 'network_event' }),

    pedidoPorRef: (ref) => lerPedido(trx, sql<SqlBool>`j.ref = ${ref}`, true),

    async decidirPedido(id, decisao, decisor, agora) {
      // `decided_by_admin_id` fica fora do tipo da tabela (nenhuma leitura o
      // projeta), e por isso o UPDATE e SQL cru. E conta do painel
      // (`admin_accounts`), nunca de `users` (ADR-0027 item 20.2).
      await sql`
        UPDATE network_event_join_requests
           SET status = ${decisao}, decided_at = ${new Date(agora)}::timestamptz,
               decided_by_admin_id = ${decisor}::uuid
         WHERE id = ${id}::uuid`.execute(trx);
      const lido = await lerPedido(trx, sql<SqlBool>`j.id = ${id}::uuid`, false);
      if (lido === null) throw new Error(`pedido ${id} sumiu dentro da propria transacao`);
      return lido;
    },

    async enfileirarAvisoDeAprovacao({ trabalhoId, pedidoId }) {
      await trx
        .insertInto('jobs')
        .values({
          id: trabalhoId,
          kind: TRABALHO_DE_AVISO_DE_APROVACAO,
          payload: JSON.stringify({ join_request_id: pedidoId }),
        })
        .execute();
    },

    async travarLeituraDaFila(conta) {
      await sql`select pg_advisory_xact_lock(hashtext(${PREFIXO_DA_TRAVA_DA_FILA + conta}))`.execute(trx);
    },

    async linhasDevolvidasDesde(conta, desde) {
      const r = await deps.contagem.somarNaJanela(trx, {
        actorAdminId: conta,
        action: 'admin.network_join_request.listed',
        campo: 'rows_returned',
        desde,
      });
      return { total: r.total, maisAntiga: r.maisAntigo };
    },

    async listarFila(recorte: RecorteDaFila): Promise<Pagina<PedidoNaFila>> {
      const decisao = recorte.decisao ?? 'pending';
      // Sem filtro, a fila de PENDENTES: desistido nao aparece e nao se decide.
      const filtro = sql<SqlBool>`j.status = ${decisao}
        ${decisao === 'pending' ? sql`AND j.withdrawn_at IS NULL` : sql``}
        ${recorte.eventoSlug === undefined ? sql`` : sql`AND e.slug = ${recorte.eventoSlug}`}`;
      const base = sql`FROM network_event_join_requests j
        JOIN network_events e ON e.id = j.event_id
        JOIN users u ON u.id = j.user_id
       WHERE e.visibility = 'private' AND e.publication_status IN ('published', 'cancelled') AND ${filtro}`;
      const contagem = await sql<{ total: string }>`SELECT count(*) AS total ${base}`.execute(trx);
      const linhas = await sql<LinhaDoPedido>`
        SELECT ${COLUNAS_DO_PEDIDO} ${base}
         ORDER BY j.requested_at ASC, j.ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(trx);
      return { itens: linhas.rows.map(comoPedido), total: Number(contagem.rows[0]?.total ?? 0) };
    },

    registrarNaTrilha: (evento) => deps.trilha.recordIn(trx, evento),
  };
}

export function criarRedeAdministrativaRepository(
  deps: DependenciasDaRedeAdministrativaEmPostgres,
): RedeAdministrativaRepository {
  const { db } = deps;
  return {
    emTransacao: (trabalho) => db.transaction().execute((trx) => trabalho(transacao(trx, deps))),

    encontroPorSlug: (slug) => lerEncontro(db, sql<SqlBool>`e.slug = ${slug}`, false),

    async listarEncontros(recorte: RecorteDoPainel): Promise<Pagina<EncontroAdministrativo>> {
      const agora = new Date(recorte.agora);
      const condicoes = [DO_PAINEL];
      const termo = recorte.q?.trim();
      if (termo !== undefined && termo !== '') {
        const padrao = `%${escaparCuringas(termo)}%`;
        condicoes.push(
          sql<SqlBool>`(e.title ILIKE ${padrao} OR e.summary ILIKE ${padrao} OR e.place_name ILIKE ${padrao})`,
        );
      }
      // Removido some da lista e so volta pelo filtro fechado (contrato de
      // listAdminNetworkEvents).
      condicoes.push(
        recorte.publicacao === undefined
          ? sql<SqlBool>`e.publication_status IN ('published', 'cancelled')`
          : sql<SqlBool>`e.publication_status = ${recorte.publicacao}`,
      );
      if (recorte.visibilidade !== undefined) condicoes.push(sql<SqlBool>`e.visibility = ${recorte.visibilidade}`);
      const cidade = recorte.city?.trim();
      if (cidade !== undefined && cidade !== '') condicoes.push(sql<SqlBool>`lower(e.city) = lower(${cidade})`);
      if (recorte.tempo === 'upcoming') condicoes.push(sql<SqlBool>`e.starts_at > ${agora}::timestamptz`);
      if (recorte.tempo === 'happening') {
        condicoes.push(sql<SqlBool>`e.starts_at <= ${agora}::timestamptz AND e.ends_at >= ${agora}::timestamptz`);
      }
      if (recorte.tempo === 'ended') {
        condicoes.push(sql<SqlBool>`e.starts_at <= ${agora}::timestamptz
          AND (e.ends_at IS NULL OR e.ends_at < ${agora}::timestamptz)`);
      }
      const onde = sql.join(condicoes, sql` AND `);
      const ordem =
        recorte.sort === 'atualizado'
          ? sql`e.updated_at DESC, e.slug ASC`
          : sql`e.starts_at ASC, e.slug ASC`;
      const contagem = await sql<{ total: string }>`SELECT count(*) AS total FROM network_events e WHERE ${onde}`.execute(db);
      const linhas = await sql<LinhaDoEncontro>`
        SELECT ${COLUNAS} FROM network_events e WHERE ${onde}
         ORDER BY ${ordem}
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(db);
      return { itens: linhas.rows.map(comoEncontro), total: Number(contagem.rows[0]?.total ?? 0) };
    },
  };
}

/**
 * D54. Pedido de encontro que acabou (fim, ou inicio sem fim), foi cancelado ou
 * removido ha mais de 30 dias sai do banco, em qualquer decisao: aprovado e
 * recusado pela regra, e o pendente que ninguem decidiu porque, para o tutor, ele
 * ja e `expired`. A trilha guarda a decisao pelo `ref` e pelo administrador, sem
 * o nome de quem pediu.
 */
export async function expurgarPedidosVencidos(db: DbExecutor, agora: Date, dias: number): Promise<number> {
  const r = await sql`
    DELETE FROM network_event_join_requests j
     USING network_events e
     WHERE e.id = j.event_id
       AND (CASE e.publication_status
              WHEN 'cancelled' THEN e.cancelled_at
              WHEN 'removed' THEN e.updated_at
              ELSE COALESCE(e.ends_at, e.starts_at)
            END) < ${agora}::timestamptz - make_interval(days => ${dias})`.execute(db);
  return Number(r.numAffectedRows ?? 0n);
}

/** O que o worker le para o push de aprovacao: de quem e o pedido e o titulo. */
export function criarLeituraDoPedidoAprovado(db: DbExecutor): LeituraDoPedidoAprovado {
  return {
    async pedidoAprovado(pedidoId) {
      const linha = await db
        .selectFrom('network_event_join_requests as j')
        .innerJoin('network_events as e', 'e.id', 'j.event_id')
        .select(['j.user_id as user_id', 'e.title as title'])
        .where('j.id', '=', pedidoId)
        .where('j.status', '=', 'approved')
        .where('e.publication_status', 'in', ['published', 'cancelled'])
        .executeTakeFirst();
      return linha === undefined ? null : { userId: linha.user_id, tituloDoEncontro: linha.title };
    },
  };
}
