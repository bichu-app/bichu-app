/** Persistencia da secao `Rede`. */
import { randomBytes } from 'node:crypto';
import { sql, type Expression, type SqlBool } from 'kysely';
import type { Db, DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type {
  EstruturaDoLocal,
  IdadeDosCaes,
  ItemParaLevar,
  OrigemDoEncontro,
} from '../../../../shared/db/schema.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { EncontroDaRede, PublicacaoVisivel } from '../../domain/encontro-da-rede.js';
import { slugDoTitulo, sufixoCurto, urlDoInstagram } from '../../domain/escrita-do-encontro.js';
import type { NovoEncontroDaComunidade } from '../../domain/encontro-da-comunidade.js';
import { SlugDoEncontroOcupado } from '../../ports/rede-administrativa.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../../../media/ports/imagem-de-catalogo.js';
import type {
  DesfechoDaDesistencia,
  DesfechoDoPedido,
  CapaDoMeuEncontro,
  EstadoDaContaParaCriar,
  LocalDoEncontro,
  MeuEncontro,
  NetworkRepository,
  PaginaDaAgenda,
  PaginaDosMeusEncontros,
  PaginaDosMeusPedidos,
  PaginaPorDistancia,
  PedidoDaConta,
  RecorteDaAgenda,
  RecorteDaAgendaPorDistancia,
  RecorteDosMeusEncontros,
  RecorteDosMeusPedidos,
  TransacaoDaComunidade,
} from '../../ports/network-repository.js';
import type { FamiliaDeSessao } from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { Instant } from '../../../../shared/types/brands.js';

/** Os estados de publicacao que as leituras enxergam. */
export const VISIVEL: readonly PublicacaoVisivel[] = ['published', 'cancelled'];

/** A ordem das listas fechadas, a mesma dos `enum` do contrato. */
const ORDEM_DA_ESTRUTURA = [
  'level_ground_or_ramp',
  'accessible_restroom',
  'public_restroom_nearby',
  'shade',
  'benches',
  'dog_water_fountain',
  'parking_nearby',
];
const ORDEM_DO_QUE_LEVAR = [
  'water',
  'water_bowl',
  'leash',
  'poop_bags',
  'treats',
  'towel',
  'vaccination_card',
  'toy',
];

interface LinhaDoEncontro {
  slug: string;
  title: string;
  summary: string;
  place_name: string;
  neighborhood: string;
  city: string;
  state: string;
  starts_at: Date;
  ends_at: Date | null;
  time_zone: string;
  publication_status: PublicacaoVisivel;
  visibility: 'public' | 'private';
  origin: OrigemDoEncontro;
  admission_kind: 'free' | 'paid';
  admission_amount: number | null;
  admission_currency: 'BRL' | null;
  admission_unit: 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people' | null;
  dog_age: string;
  vaccination_required: boolean;
  fenced_off_leash_area: boolean;
  street_address: string | null;
  ticket_url: string | null;
  instagram_handle: string | null;
  notes: string | null;
  local_date: string;
  accepted_sizes: string[];
  amenities: string[];
  bring_items: string[];
  /**
   * `k` = `public_key` (1024), `t` = `thumb_key` (480), `b` = `banner_key` (1280),
   * `a` = `alt_text`.
   */
  images: { k: string; t: string | null; b: string | null; a: string | null }[] | null;
}

/** As colunas do encontro, nomeadas uma a uma, mais as tres listas. */
function colunasDoEncontro() {
  return [
    'e.slug as slug',
    'e.title as title',
    'e.summary as summary',
    'e.place_name as place_name',
    'e.neighborhood as neighborhood',
    'e.city as city',
    'e.state as state',
    'e.starts_at as starts_at',
    'e.ends_at as ends_at',
    'e.time_zone as time_zone',
    'e.publication_status as publication_status',
    'e.visibility as visibility',
    'e.origin as origin',
    'e.admission_kind as admission_kind',
    'e.admission_amount as admission_amount',
    'e.admission_currency as admission_currency',
    'e.admission_unit as admission_unit',
    'e.dog_age as dog_age',
    'e.vaccination_required as vaccination_required',
    'e.fenced_off_leash_area as fenced_off_leash_area',
    'e.notes as notes',
    'e.street_address as street_address',
    'e.ticket_url as ticket_url',
    'e.instagram_handle as instagram_handle',
    sql<string>`to_char(e.starts_at AT TIME ZONE e.time_zone, 'YYYY-MM-DD')`.as('local_date'),
    sql<string[]>`array(
      SELECT s.size FROM network_event_sizes s JOIN ref_sizes r ON r.code = s.size
       WHERE s.event_id = e.id ORDER BY r.sort_order)`.as('accepted_sizes'),
    sql<string[]>`array(
      SELECT a.amenity FROM network_event_amenities a
       WHERE a.event_id = e.id
       ORDER BY array_position(${sql.val(ORDEM_DA_ESTRUTURA)}::text[], a.amenity))`.as('amenities'),
    sql<string[]>`array(
      SELECT b.item FROM network_event_bring_items b
       WHERE b.event_id = e.id
       ORDER BY array_position(${sql.val(ORDEM_DO_QUE_LEVAR)}::text[], b.item))`.as('bring_items'),
    sql<{ k: string; t: string | null; b: string | null; a: string | null }[] | null>`(
      SELECT json_agg(json_build_object(
               'k', c.public_key, 't', c.thumb_key, 'b', c.banner_key, 'a', i.alt_text)
             ORDER BY i.position)
        FROM network_event_images i JOIN catalog_images c ON c.id = i.image_id
       WHERE i.event_id = e.id AND c.status = 'ready' AND c.public_key IS NOT NULL)`.as('images'),
  ] as const;
}

/** A capa **com o estado dela**, para a lista do DONO (19/10/2026). */
function capaDoDono() {
  return sql<{ s: 'processing' | 'ready' | 'rejected'; k: string | null; r: string | null } | null>`(
    SELECT json_build_object('s', c.status, 'k', c.public_key, 'r', c.rejection_reason)
      FROM network_event_images i JOIN catalog_images c ON c.id = i.image_id
     WHERE i.event_id = e.id
     ORDER BY i.position
     LIMIT 1)`.as('capa_do_dono');
}

type LinhaDaCapaDoDono = {
  readonly capa_do_dono: { s: 'processing' | 'ready' | 'rejected'; k: string | null; r: string | null } | null;
};

/** A linha da capa do dono na forma da porta. */
function comoCapaDoDono(
  linha: LinhaDaCapaDoDono,
  urlDeMidia: (chave: string) => string,
): CapaDoMeuEncontro | null {
  const capa = linha.capa_do_dono;
  if (capa === null || capa === undefined) return null;
  return {
    estado: capa.s,
    url: capa.s === 'ready' && capa.k !== null ? urlDeMidia(capa.k) : null,
    motivoDaRecusa: capa.s === 'rejected' ? capa.r : null,
  };
}

/** Escapa os curingas do `LIKE` para que o termo seja procurado como texto. */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/** Aprovacao da propria conta, para a clausula `WHERE`. */
function aprovado(chamador: string): Expression<SqlBool> {
  return sql<SqlBool>`EXISTS (
    SELECT 1 FROM network_event_join_requests j
     WHERE j.event_id = e.id AND j.user_id = ${chamador}::uuid AND j.status = 'approved')`;
}

type Consulta = ReturnType<typeof consultaBase>;

/** O PONTO UNICO DA REDE, e desde 17/10 ele carrega o autor. */
function consultaBase(db: DbExecutor) {
  return db
    .selectFrom('network_events as e')
    .where('e.publication_status', 'in', VISIVEL)
    .where(sql<SqlBool>`encontro_com_autor_ativo(e.id)`);
}

/** 23:59:59 do dia local do encontro, no fuso dele, como instante. */
const FIM_DO_DIA_DO_CANCELADO = sql`(((e.starts_at AT TIME ZONE e.time_zone)::date + time '23:59:59') AT TIME ZONE e.time_zone)`;

/** Ate quando o cancelado AINDA SE CHAMA cancelado, em SQL. */
const FIM_DO_CANCELADO = sql`COALESCE(e.ends_at, ${FIM_DO_DIA_DO_CANCELADO})`;

/** O encontro esta ROTULADO `cancelled` agora -- e nao "foi cancelado um dia". */
function rotuladoCancelado(agora: Date) {
  return sql<SqlBool>`(e.publication_status = 'cancelled'
    AND ${agora}::timestamptz <= ${FIM_DO_CANCELADO})`;
}

/** A SITUACAO CALCULADA, em SQL: a traducao fiel de `statusDoEncontro`. */
function situacaoCalculada(agora: Date) {
  return sql<string>`(CASE
    WHEN ${rotuladoCancelado(agora)} THEN 'cancelled'
    WHEN ${agora}::timestamptz < e.starts_at THEN 'upcoming'
    WHEN e.ends_at IS NULL THEN 'ended'
    WHEN ${agora}::timestamptz <= e.ends_at THEN 'happening'
    ELSE 'ended'
  END)`;
}

/** A chave de ordem que DESCE o cancelado para depois do ativo. */
function chaveDoCancelado(agora: Date) {
  return sql`(CASE WHEN ${rotuladoCancelado(agora)} THEN 1 ELSE 0 END)`;
}

/** O sabado do fim de semana corrente ou proximo, no fuso do encontro. */
function sabadoDoFimDeSemana(agora: Date) {
  const hoje = sql`(${agora}::timestamptz AT TIME ZONE e.time_zone)::date`;
  return sql`(${hoje} + (CASE WHEN extract(isodow FROM ${hoje}) = 7 THEN -1
                              ELSE 6 - extract(isodow FROM ${hoje})::int END))`;
}

/**
 * O recorte no tempo. Os tres originais sao o complemento exato do rotulo temporal
 * do dominio; os tres novos (ADR-0027 12.14) sao calculados no fuso de cada
 * encontro, pelo banco.
 */
function recorteNoTempo(consulta: Consulta, when: RecorteDaAgenda['when'], agora: Date): Consulta {
  switch (when) {
    case 'upcoming':
      return consulta.where((eb) =>
        eb.or([
          eb.and([eb('e.ends_at', 'is', null), eb('e.starts_at', '>', agora)]),
          eb.and([eb('e.ends_at', 'is not', null), eb('e.ends_at', '>=', agora)]),
          sql<SqlBool>`(e.publication_status = 'cancelled' AND e.ends_at IS NULL
            AND ${agora}::timestamptz <= ${FIM_DO_DIA_DO_CANCELADO})`,
        ]),
      );
    case 'past':
      return consulta.where((eb) =>
        eb.or([
          eb.and([
            eb('e.ends_at', 'is', null),
            eb('e.starts_at', '<=', agora),
            sql<SqlBool>`NOT (e.publication_status = 'cancelled'
              AND ${agora}::timestamptz <= ${FIM_DO_DIA_DO_CANCELADO})`,
          ]),
          eb.and([eb('e.ends_at', 'is not', null), eb('e.ends_at', '<', agora)]),
        ]),
      );
    case 'today':
      return consulta.where(
        sql<SqlBool>`(e.starts_at AT TIME ZONE e.time_zone)::date
                     = (${agora}::timestamptz AT TIME ZONE e.time_zone)::date`,
      );
    case 'weekend':
      return consulta.where(
        sql<SqlBool>`(e.starts_at AT TIME ZONE e.time_zone)::date
          BETWEEN ${sabadoDoFimDeSemana(agora)} AND ${sabadoDoFimDeSemana(agora)} + 1`,
      );
    case 'next_30_days':
      return consulta
        .where('e.starts_at', '>=', agora)
        .where(sql<SqlBool>`e.starts_at < ${agora}::timestamptz + interval '30 days'`);
    case 'all':
      return consulta;
  }
}

/** Os recortes que tocam campo oculto do privado, TODOS aqui (P19 item 4). */
function recorteOculto(consulta: Consulta, recorte: Omit<RecorteDaAgenda, 'sort' | 'when' | 'agora' | 'page' | 'limit'>): Consulta {
  let c = consulta;
  const termo = recorte.q?.trim();
  if (termo !== undefined && termo !== '') {
    const padrao = `%${escaparCuringas(termo)}%`;
    c = c.where(
      sql<SqlBool>`(e.title ILIKE ${padrao}
        OR (e.visibility = 'public' AND (e.place_name ILIKE ${padrao} OR e.neighborhood ILIKE ${padrao})))`,
    );
  }
  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    c = c.where(sql<SqlBool>`(e.visibility = 'public' AND lower(e.city) = lower(${cidade}))`);
  }
  if (recorte.admission !== undefined) {
    c = c.where(sql<SqlBool>`(e.visibility = 'public' AND e.admission_kind = ${recorte.admission})`);
  }
  if (recorte.size !== undefined) {
    c = c.where(sql<SqlBool>`(e.visibility = 'public' AND EXISTS (
      SELECT 1 FROM network_event_sizes s WHERE s.event_id = e.id AND s.size = ${recorte.size}))`);
  }
  return c;
}

/**
 * O construtor da agenda, separado para poder ser compilado e lido por um teste
 * sem subir banco.
 */
export function construtorDaAgenda(db: DbExecutor, recorte: RecorteDaAgenda) {
  const agora = comoData(recorte.agora);
  let consulta = recorteNoTempo(consultaBase(db), recorte.when, agora);
  if (recorte.visibility !== undefined) {
    consulta = consulta.where('e.visibility', '=', recorte.visibility);
  }
  if (recorte.status !== undefined) {
    consulta = consulta.where(sql<SqlBool>`${situacaoCalculada(agora)} = ${recorte.status}`);
  }
  return recorteOculto(consulta, recorte);
}

/**
 * A agenda **com a ordem**, separada para o mesmo motivo de `construtorDaAgenda`:
 * um teste a compila e le o `ORDER BY` sem subir banco.
 */
export function agendaOrdenada(db: DbExecutor, recorte: RecorteDaAgenda) {
  const base = construtorDaAgenda(db, recorte);
  if (recorte.sort === 'recentes') {
    return base.orderBy('e.starts_at', 'desc').orderBy('e.slug', 'desc');
  }
  return base
    .orderBy(chaveDoCancelado(comoData(recorte.agora)), 'asc')
    .orderBy('e.starts_at', 'asc')
    .orderBy('e.slug', 'asc');
}

/** `listMyNetworkEvents`: os encontros desta conta (19/10/2026). */
export function construtorDosMeusEncontros(db: DbExecutor, recorte: RecorteDosMeusEncontros) {
  const consulta = consultaBase(db).where(
    sql<SqlBool>`e.id IN (SELECT id FROM network_events_da_conta(${recorte.chamador}::uuid))`,
  );
  if (recorte.status === undefined) return consulta;
  return consulta.where(
    sql<SqlBool>`${situacaoCalculada(comoData(recorte.agora))} = ${recorte.status}`,
  );
}

/** A ordem de `Meus eventos`, e desde 27/10/2026 ela tem TRES GRUPOS. */
export function meusEncontrosOrdenados(db: DbExecutor, recorte: RecorteDosMeusEncontros) {
  const agora = comoData(recorte.agora);
  const cancelado = rotuladoCancelado(agora);
  const naoTerminou = sql<SqlBool>`COALESCE(e.ends_at, e.starts_at) > ${agora}::timestamptz`;
  const grupo = sql`(CASE WHEN ${cancelado} THEN 1
                          WHEN ${naoTerminou} THEN 0
                          ELSE 2 END)`;
  return construtorDosMeusEncontros(db, recorte)
    .orderBy(grupo, 'asc')
    .orderBy(sql`(CASE WHEN ${cancelado} OR ${naoTerminou} THEN e.starts_at END)`, 'asc')
    .orderBy('e.starts_at', 'desc')
    .orderBy('e.slug', 'asc');
}

/** A leitura do ponto: publico, ou privado com aprovacao da conta. */
export function construtorDoLocal(db: DbExecutor, slug: string, chamador: string) {
  return consultaBase(db)
    .where('e.slug', '=', slug)
    .where((eb) => eb.or([eb('e.visibility', '=', 'public'), aprovado(chamador)]))
    .select([
      sql<number | null>`ST_Y(e.geo::geometry)`.as('lat'),
      sql<number | null>`ST_X(e.geo::geometry)`.as('lon'),
      'e.street_address as street_address',
    ]);
}

/** A regiao de referencia VALIDA **deste aparelho** de quem chama, como em `Perto`. */
function regiaoDaConta(chamador: string, familia: FamiliaDeSessao, agora: Date) {
  return sql`(SELECT u.reference_point FROM user_reference_locations u
               WHERE u.user_id = ${chamador}::uuid
                 AND u.session_family_id = ${familia}::uuid
                 AND u.expires_at > ${agora}::timestamptz)`;
}

/** A regiao que vale para esta chamada: a do aparelho, ou nenhuma. */
function regiaoDoAparelho(chamador: string, familia: FamiliaDeSessao | undefined, agora: Date) {
  return familia === undefined
    ? sql`null::geography`
    : regiaoDaConta(chamador, familia, agora);
}

interface LinhaDoPedido extends LinhaDoEncontro {
  decisao: 'pending' | 'approved' | 'declined';
  pedido_em: Date;
}

export class KyselyNetworkRepository implements NetworkRepository {
  constructor(
    private readonly db: Db,
    private readonly ids: { uuidv7(): string },
    /** A URL publica da derivada. */
    private readonly urlDeMidia: (chave: string) => string,
    /** `INSTAGRAM_PROFILE_BASE_URL`, da configuracao. */
    private readonly baseDoInstagram: string | null = null,
  ) {}

  async listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda> {
    const base = construtorDaAgenda(this.db, recorte);
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    const linhas = (await agendaOrdenada(this.db, recorte)
      .select(colunasDoEncontro())
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoEncontro[];

    return { itens: linhas.map((l) => comoEncontro(l, this.urlDeMidia, this.baseDoInstagram)), total };
  }

  async listarPorDistancia(recorte: RecorteDaAgendaPorDistancia): Promise<PaginaPorDistancia> {
    const agora = comoData(recorte.agora);
    const regiao =
      recorte.familia === undefined
        ? undefined
        : await this.db
            .selectFrom('user_reference_locations')
            .select('user_id')
            .where('user_id', '=', recorte.chamador)
            .where('session_family_id', '=', recorte.familia)
            .where('expires_at', '>', agora)
            .executeTakeFirst();
    const temRegiao = regiao !== undefined;

    let base = construtorDaAgenda(this.db, { ...recorte, sort: 'proximos' }).where(
      'e.visibility',
      '=',
      'public',
    );
    if (temRegiao && recorte.maxKm !== undefined) {
      base = base
        .where(sql<SqlBool>`e.geo IS NOT NULL`)
        .where(
          sql<SqlBool>`ST_DWithin(e.geo, ${regiaoDoAparelho(recorte.chamador, recorte.familia, agora)}, ${recorte.maxKm * 1000})`,
        );
    }

    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    const distancia = temRegiao
      ? sql<number | null>`ST_Distance(e.geo, ${regiaoDoAparelho(recorte.chamador, recorte.familia, agora)})`
      : sql<number | null>`NULL::float8`;

    let ordenada = base.select([...colunasDoEncontro(), distancia.as('distancia_m')]);
    if (temRegiao && recorte.sort === 'distancia') {
      ordenada = ordenada.orderBy(sql`distancia_m`, sql`asc nulls last`);
    }
    const linhas = (await ordenada
      .orderBy('e.starts_at', 'asc')
      .orderBy('e.slug', 'asc')
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as (LinhaDoEncontro & { distancia_m: number | null })[];

    return {
      itens: linhas.map((linha) => ({
        encontro: comoEncontro(linha, this.urlDeMidia, this.baseDoInstagram),
        distanciaM: linha.distancia_m === null ? null : Number(linha.distancia_m),
      })),
      total,
      temRegiao,
    };
  }

  async buscarEncontro(slug: string): Promise<EncontroDaRede | undefined> {
    const linha = (await consultaBase(this.db)
      .where('e.slug', '=', slug)
      .select(colunasDoEncontro())
      .executeTakeFirst()) as unknown as LinhaDoEncontro | undefined;
    return linha === undefined ? undefined : comoEncontro(linha, this.urlDeMidia, this.baseDoInstagram);
  }

  async buscarLocalDoEncontro(slug: string, chamador: string): Promise<LocalDoEncontro | undefined> {
    const linha = (await construtorDoLocal(this.db, slug, chamador).executeTakeFirst()) as
      | { lat: number | null; lon: number | null; street_address: string | null }
      | undefined;
    if (linha === undefined) return undefined;
    const endereco = linha.street_address;
    if (linha.lat === null || linha.lon === null) return { ponto: null, endereco };
    return { ponto: { lat: Number(linha.lat), lon: Number(linha.lon) }, endereco };
  }

  async buscarDetalhesPrivados(slug: string, chamador: string): Promise<EncontroDaRede | undefined> {
    const linha = (await consultaBase(this.db)
      .where('e.slug', '=', slug)
      .where('e.visibility', '=', 'private')
      .where(aprovado(chamador))
      .select(colunasDoEncontro())
      .executeTakeFirst()) as unknown as LinhaDoEncontro | undefined;
    return linha === undefined ? undefined : comoEncontro(linha, this.urlDeMidia, this.baseDoInstagram);
  }

  async pedirParaParticipar(slug: string, chamador: string, agora: Instant): Promise<DesfechoDoPedido> {
    const quando = comoData(agora);
    return this.db.transaction().execute(async (trx) => {
      const alvo = await consultaBase(trx)
        .where('e.slug', '=', slug)
        .where('e.visibility', '=', 'private')
        .select([
          'e.id as id',
          sql<boolean>`(CASE WHEN e.ends_at IS NULL THEN e.starts_at <= ${quando}::timestamptz
                             ELSE e.ends_at < ${quando}::timestamptz END)`.as('encerrado'),
        ])
        .executeTakeFirst();
      if (alvo === undefined) return { tipo: 'nao_encontrado' } as const;
      if (alvo.encerrado) return { tipo: 'encerrado' } as const;

      await sql`
        INSERT INTO network_event_join_requests (id, ref, event_id, user_id)
        VALUES (${this.ids.uuidv7()}::uuid, ${randomBytes(16).toString('base64url')},
                ${alvo.id}::uuid, ${chamador}::uuid)
        ON CONFLICT (event_id, user_id) DO UPDATE SET withdrawn_at = NULL
      `.execute(trx);

      const pedido = await lerPedido(trx, slug, chamador, this.urlDeMidia);
      if (pedido === undefined) return { tipo: 'nao_encontrado' } as const;
      return { tipo: 'ok', pedido } as const;
    });
  }

  lerMeuPedido(slug: string, chamador: string): Promise<PedidoDaConta | undefined> {
    return lerPedido(this.db, slug, chamador, this.urlDeMidia);
  }

  async desistirDoPedido(
    slug: string,
    chamador: string,
    agora: Instant,
  ): Promise<DesfechoDaDesistencia> {
    const quando = comoData(agora);
    return this.db.transaction().execute(async (trx) => {
      const linha = await sql<{
        id: string;
        status: 'pending' | 'approved' | 'declined';
        requested_at: Date;
        encerrado: boolean;
      }>`
        SELECT j.id, j.status, j.requested_at,
               (CASE WHEN e.ends_at IS NULL THEN e.starts_at <= ${quando}::timestamptz
                     ELSE e.ends_at < ${quando}::timestamptz END) AS encerrado
          FROM network_event_join_requests j
          JOIN network_events e ON e.id = j.event_id
         WHERE e.slug = ${slug}
           AND e.visibility = 'private'
           AND e.publication_status IN ('published', 'cancelled')
           AND j.user_id = ${chamador}::uuid
           AND j.withdrawn_at IS NULL
         FOR UPDATE OF j
      `.execute(trx);
      const pedido = linha.rows[0];
      if (pedido === undefined) return { tipo: 'nao_encontrado' } as const;
      if (pedido.status === 'approved' || pedido.encerrado) return { tipo: 'final' } as const;

      if (pedido.status === 'pending') {
        await sql`DELETE FROM network_event_join_requests WHERE id = ${pedido.id}::uuid`.execute(trx);
      } else {
        await sql`UPDATE network_event_join_requests SET withdrawn_at = ${quando}::timestamptz
                   WHERE id = ${pedido.id}::uuid`.execute(trx);
      }
      return { tipo: 'ok', pedidoEm: pedido.requested_at.getTime() as Instant } as const;
    });
  }

  async listarMeusPedidos(recorte: RecorteDosMeusPedidos): Promise<PaginaDosMeusPedidos> {
    const agora = comoData(recorte.agora);
    const encerrado = sql<SqlBool>`(CASE WHEN e.ends_at IS NULL THEN e.starts_at <= ${agora}::timestamptz
                                         ELSE e.ends_at < ${agora}::timestamptz END)`;
    let base = consultaBase(this.db)
      .innerJoin('network_event_join_requests as j', 'j.event_id', 'e.id')
      .where('e.visibility', '=', 'private')
      .where('j.user_id', '=', recorte.chamador)
      .where('j.withdrawn_at', 'is', null);

    const termo = recorte.q?.trim();
    if (termo !== undefined && termo !== '') {
      base = base.where(sql<SqlBool>`e.title ILIKE ${`%${escaparCuringas(termo)}%`}`);
    }
    switch (recorte.estado) {
      case 'approved':
        base = base.where('j.status', '=', 'approved');
        break;
      case 'requested':
        base = base.where('j.status', 'in', ['pending', 'declined']).where(sql<SqlBool>`NOT ${encerrado}`);
        break;
      case 'expired':
        base = base.where('j.status', 'in', ['pending', 'declined']).where(encerrado);
        break;
      case 'withdrawn':
        base = base.where(sql<SqlBool>`false`);
        break;
      case undefined:
        break;
    }

    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const linhas = (await base
      .select([...colunasDoEncontro(), 'j.status as decisao', 'j.requested_at as pedido_em'])
      .orderBy('e.starts_at', 'asc')
      .orderBy('e.slug', 'asc')
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoPedido[];

    return { itens: linhas.map((l) => comoPedido(l, this.urlDeMidia)), total: Number(contagem?.total ?? 0) };
  }

  /**
   * `listMyNetworkEvents`. O recorte mora em `construtorDosMeusEncontros` e a ordem
   * em `meusEncontrosOrdenados`, as duas no nivel do modulo: e de la que o caso de
   * isca as compila e le, sem subir banco.
   */
  async listarMeusEncontros(recorte: RecorteDosMeusEncontros): Promise<PaginaDosMeusEncontros> {
    const contagem = await construtorDosMeusEncontros(this.db, recorte)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const linhas = (await meusEncontrosOrdenados(this.db, recorte)
      .select([...colunasDoEncontro(), capaDoDono()])
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as (LinhaDoEncontro & LinhaDaCapaDoDono)[];

    return {
      itens: linhas.map((l) => ({
        encontro: comoEncontro(l, this.urlDeMidia, this.baseDoInstagram),
        capa: comoCapaDoDono(l, this.urlDeMidia),
      })),
      total: Number(contagem?.total ?? 0),
    };
  }

  /** `getMyNetworkEvent`: o encontro desta conta COM A VERSAO. */
  async buscarMeuEncontro(slug: string, chamador: string): Promise<MeuEncontro | undefined> {
    const linha = (await consultaBase(this.db)
      .where(
        sql<SqlBool>`e.id IN (SELECT id FROM network_events_do_autor(${slug}, ${chamador}::uuid))`,
      )
      .select([...colunasDoEncontro(), capaDoDono(), 'e.version as version'])
      .executeTakeFirst()) as unknown as
      | (LinhaDoEncontro & LinhaDaCapaDoDono & { version: number })
      | undefined;
    if (linha === undefined) return undefined;
    return {
      encontro: comoEncontro(linha, this.urlDeMidia, this.baseDoInstagram),
      capa: comoCapaDoDono(linha, this.urlDeMidia),
      versao: Number(linha.version),
    };
  }

  /** O estado da conta para criar encontro, numa consulta so. */
  async estadoParaCriarEncontro(chamador: string, agora: Instant): Promise<EstadoDaContaParaCriar> {
    const quando = comoData(agora);
    const linha = await sql<{ tem_canal: boolean; ativos: number }>`
      SELECT
        EXISTS (
          SELECT 1 FROM users u
           WHERE u.id = ${chamador}::uuid
             AND ${canalDeContatoConfirmadoNoSql('u')}
        ) AS tem_canal,
        network_events_ativos_do_autor(${chamador}::uuid, ${quando}::timestamptz) AS ativos
    `.execute(this.db);
    const r = linha.rows[0];
    return {
      temCanalVerificado: r?.tem_canal ?? false,
      encontrosAtivos: Number(r?.ativos ?? 0),
    };
  }

  emTransacao<T>(trabalho: (tx: TransacaoDaComunidade) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((trx) => trabalho(transacaoDaComunidade(trx, this.ids)));
  }
}

/** A transacao das escritas da comunidade. */
function transacaoDaComunidade(trx: DbTransaction, ids: { uuidv7(): string }): TransacaoDaComunidade {
  return {
    async encontroDoAutor(slug, chamador) {
      const r = await sql<{
        id: string;
        version: number;
        publication_status: 'published' | 'cancelled';
        starts_at: Date;
        ends_at: Date | null;
      }>`
        SELECT a.id, a.version, a.publication_status, a.starts_at, a.ends_at
          FROM network_events_do_autor(${slug}, ${chamador}::uuid) a
          JOIN network_events e ON e.id = a.id
         FOR UPDATE OF e
      `.execute(trx);
      const linha = r.rows[0];
      if (linha === undefined) return undefined;
      return {
        id: linha.id,
        versao: Number(linha.version),
        publicacao: linha.publication_status,
        startsAt: linha.starts_at.getTime() as Instant,
        endsAt: linha.ends_at === null ? null : (linha.ends_at.getTime() as Instant),
      };
    },

    async inserirEncontro(novo) {
      const quando = comoData(novo.agora);
      const slug = await inserirComSlugLivre(trx, novo, quando);
      await sql`SELECT network_events_gravar_autoria(${novo.id}::uuid, ${novo.autor}::uuid, NULL)`.execute(trx);
      if (novo.portes.length > 0) {
        await trx
          .insertInto('network_event_sizes')
          .values(novo.portes.map((size) => ({ event_id: novo.id, size })))
          .execute();
      }
      if (novo.estrutura.length > 0) {
        await trx
          .insertInto('network_event_amenities')
          .values(novo.estrutura.map((amenity) => ({ event_id: novo.id, amenity: amenity as EstruturaDoLocal })))
          .execute();
      }
      if (novo.paraLevar.length > 0) {
        await trx
          .insertInto('network_event_bring_items')
          .values(novo.paraLevar.map((item) => ({ event_id: novo.id, item: item as ItemParaLevar })))
          .execute();
      }
      return slug;
    },

    async alterarEncontro(id, versaoLida, m, agora) {
      const r = await trx
        .updateTable('network_events')
        .set({
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
          ...(m.idadeDosCaes === undefined ? {} : { dog_age: m.idadeDosCaes as IdadeDosCaes }),
          ...(m.vacinacaoExigida === undefined ? {} : { vaccination_required: m.vacinacaoExigida }),
          ...(m.areaCercada === undefined ? {} : { fenced_off_leash_area: m.areaCercada }),
          ...(m.observacoes === undefined ? {} : { notes: m.observacoes }),
          updated_at: comoData(agora),
          version: versaoLida + 1,
        })
        .where('id', '=', id)
        .where('version', '=', versaoLida)
        .executeTakeFirst();
      return Number(r.numUpdatedRows) === 0 ? null : versaoLida + 1;
    },

    async cancelarEncontro(id, versaoLida, nota, agora) {
      const r = await trx
        .updateTable('network_events')
        .set({
          publication_status: 'cancelled',
          cancelled_at: comoData(agora),
          cancellation_note: nota,
          updated_at: comoData(agora),
          version: versaoLida + 1,
        })
        .where('id', '=', id)
        .where('version', '=', versaoLida)
        .executeTakeFirst();
      return Number(r.numUpdatedRows) === 0 ? null : versaoLida + 1;
    },

    async substituirPortes(eventoId, portes) {
      await trx.deleteFrom('network_event_sizes').where('event_id', '=', eventoId).execute();
      if (portes.length > 0) {
        await trx
          .insertInto('network_event_sizes')
          .values(portes.map((size) => ({ event_id: eventoId, size })))
          .execute();
      }
    },

    async substituirEstrutura(eventoId, estrutura) {
      await trx.deleteFrom('network_event_amenities').where('event_id', '=', eventoId).execute();
      if (estrutura.length > 0) {
        await trx
          .insertInto('network_event_amenities')
          .values(estrutura.map((amenity) => ({ event_id: eventoId, amenity: amenity as EstruturaDoLocal })))
          .execute();
      }
    },

    async substituirParaLevar(eventoId, itens) {
      await trx.deleteFrom('network_event_bring_items').where('event_id', '=', eventoId).execute();
      if (itens.length > 0) {
        await trx
          .insertInto('network_event_bring_items')
          .values(itens.map((item) => ({ event_id: eventoId, item: item as ItemParaLevar })))
          .execute();
      }
    },

    /**
     * Confirma o envio da capa, na MESMA transacao da escrita do encontro (ADR-0027
     * item 10): uma imagem confirmada para um encontro que depois nao foi gravado
     * ficaria `processing` para sempre.
     */
    async capaDoEnvio(entrada) {
      const r = await sql<{
        id: string;
        expires_at: Date;
        confirmed_at: Date | null;
        catalog_image_id: string | null;
        evento_da_imagem: string | null;
      }>`
        SELECT u.id, u.expires_at, u.confirmed_at, c.id AS catalog_image_id,
               (SELECT i.event_id FROM network_event_images i WHERE i.image_id = c.id) AS evento_da_imagem
          FROM catalog_upload_intents u
          LEFT JOIN catalog_images c ON c.upload_intent_id = u.id
         WHERE u.id = ${entrada.uploadId}::uuid
           AND u.user_id = ${entrada.chamador}::uuid
           AND u.purpose = 'network_event'
         FOR UPDATE OF u
      `.execute(trx);
      const envio = r.rows[0];
      if (envio === undefined) return undefined;
      if (envio.confirmed_at !== null) {
        if (envio.catalog_image_id === null) return undefined;
        if (envio.evento_da_imagem !== null && envio.evento_da_imagem !== entrada.eventoId) return undefined;
        return envio.catalog_image_id;
      }
      if (envio.expires_at.getTime() <= entrada.agora) return undefined;
      const imagemId = ids.uuidv7();
      await trx
        .updateTable('catalog_upload_intents')
        .set({ confirmed_at: comoData(entrada.agora) })
        .where('id', '=', envio.id)
        .where('confirmed_at', 'is', null)
        .execute();
      await trx
        .insertInto('catalog_images')
        .values({
          id: imagemId,
          upload_intent_id: envio.id,
          purpose: 'network_event',
          public_key: null,
          rejection_reason: null,
        })
        .execute();
      await trx
        .insertInto('jobs')
        .values({
          id: ids.uuidv7(),
          kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
          payload: JSON.stringify({ catalog_image_id: imagemId }),
        })
        .execute();
      return imagemId;
    },

    /**
     * Apaga e reescreve as imagens do encontro, **na ordem do array**: o indice e
     * a `position`, e a `0` e a capa. UMA instrucao de `INSERT` para as quatro, e
     * nao uma por imagem.
     *
     * O `DELETE` antes continua sendo o desenho (e o mesmo de
     * `substituirImagens` da entrada do diretorio): a lista e a verdade inteira, e
     * nao um delta. `network_event_images_ordem_unica` e DIFERIDA, entao a
     * reescrita passa pelos estados intermediarios sem colidir.
     */
    async definirImagens(eventoId, imagens) {
      await trx.deleteFrom('network_event_images').where('event_id', '=', eventoId).execute();
      if (imagens.length === 0) return;
      await trx
        .insertInto('network_event_images')
        .values(
          imagens.map((imagem, position) => ({
            event_id: eventoId,
            image_id: imagem.imagemId,
            position,
            alt_text: imagem.altText,
          })),
        )
        .execute();
    },
  };
}

/** O pedido NAO desistido da conta, num privado visivel. */
async function lerPedido(
  db: DbExecutor,
  slug: string,
  chamador: string,
  urlDeMidia: (chave: string) => string,
): Promise<PedidoDaConta | undefined> {
  const linha = (await consultaBase(db)
    .innerJoin('network_event_join_requests as j', 'j.event_id', 'e.id')
    .where('e.slug', '=', slug)
    .where('e.visibility', '=', 'private')
    .where('j.user_id', '=', chamador)
    .where('j.withdrawn_at', 'is', null)
    .select([...colunasDoEncontro(), 'j.status as decisao', 'j.requested_at as pedido_em'])
    .executeTakeFirst()) as unknown as LinhaDoPedido | undefined;
  return linha === undefined ? undefined : comoPedido(linha, urlDeMidia);
}

function comoPedido(linha: LinhaDoPedido, urlDeMidia: (chave: string) => string): PedidoDaConta {
  return {
    decisao: linha.decisao,
    pedidoEm: linha.pedido_em.getTime() as Instant,
    encontro: comoEncontro(linha, urlDeMidia),
  };
}

/** A linha do banco na forma do dominio. */
function comoEncontro(
  linha: LinhaDoEncontro,
  urlDeMidia: (chave: string) => string,
  baseDoInstagram: string | null = null,
): EncontroDaRede {
  return {
    slug: linha.slug,
    title: linha.title,
    summary: linha.summary,
    placeName: linha.place_name,
    neighborhood: linha.neighborhood,
    city: linha.city,
    state: linha.state,
    startsAt: linha.starts_at.getTime() as Instant,
    endsAt: linha.ends_at === null ? null : (linha.ends_at.getTime() as Instant),
    timeZone: linha.time_zone,
    publicacao: linha.publication_status,
    origem: linha.origin,
    dataLocal: linha.local_date,
    visibilidade: linha.visibility,
    entrada:
      linha.admission_kind === 'paid' &&
      linha.admission_amount !== null &&
      linha.admission_unit !== null
        ? {
            tipo: 'paid',
            centavos: Number(linha.admission_amount),
            moeda: 'BRL',
            unidade: linha.admission_unit,
          }
        : { tipo: 'free' },
    portesAceitos: linha.accepted_sizes,
    idadeDosCaes: linha.dog_age,
    vacinacaoExigida: linha.vaccination_required,
    areaCercada: linha.fenced_off_leash_area,
    estrutura: linha.amenities,
    paraLevar: linha.bring_items,
    observacoes: linha.notes,
    endereco: linha.street_address,
    linkDeIngresso: linha.ticket_url,
    instagram: linha.instagram_handle,
    instagramUrl: urlDoInstagram(linha.instagram_handle, baseDoInstagram),
    imagens: (linha.images ?? []).map((i) => ({
      url: urlDeMidia(i.k),
      urlDaMiniatura: i.t === null ? null : urlDeMidia(i.t),
      urlDoBanner: i.b === null ? null : urlDeMidia(i.b),
      textoAlternativo: i.a,
    })),
  };
}

export function criarNetworkRepository(
  db: Db,
  ids: { uuidv7(): string },
  urlDeMidia: (chave: string) => string,
  baseDoInstagram: string | null = null,
): NetworkRepository {
  return new KyselyNetworkRepository(db, ids, urlDeMidia, baseDoInstagram);
}

/**
 * O `slug` do encontro da comunidade: o derivado do titulo, depois o derivado com
 * sufixo curto, e dez tentativas no total.
 */
async function inserirComSlugLivre(
  trx: DbTransaction,
  novo: NovoEncontroDaComunidade,
  quando: Date,
): Promise<string> {
  const candidatos = [
    slugDoTitulo(novo.title),
    ...Array.from({ length: 9 }, () => slugDoTitulo(novo.title, sufixoCurto(randomBytes(3)))),
  ].filter((s): s is string => s !== undefined);
  for (const slug of candidatos) {
    if (await inserirLinhaDoEncontro(trx, novo, slug, quando)) return slug;
  }
  throw new SlugDoEncontroOcupado();
}

/** `false` quando o `slug` ja estava ocupado: nada e gravado, e nada levanta. */
async function inserirLinhaDoEncontro(
  trx: DbTransaction,
  novo: NovoEncontroDaComunidade,
  slug: string,
  quando: Date,
): Promise<boolean> {
  const gravada = await trx
    .insertInto('network_events')
    .values({
      id: novo.id,
      slug,
      title: novo.title,
      summary: novo.summary,
      place_name: novo.lugar.placeName,
      neighborhood: novo.lugar.neighborhood,
      city: novo.lugar.city,
      state: novo.lugar.state,
      geo_source: null,
      street_address: null,
      starts_at: novo.startsAt,
      ends_at: novo.endsAt,
      time_zone: novo.timeZone,
      visibility: 'public',
      admission_kind: 'free',
      admission_amount: null,
      admission_currency: null,
      admission_unit: null,
      dog_age: novo.idadeDosCaes as IdadeDosCaes,
      vaccination_required: novo.vacinacaoExigida,
      fenced_off_leash_area: novo.areaCercada,
      notes: novo.observacoes,
      ticket_url: null,
      instagram_handle: null,
      origin: 'community',
      publication_status: 'published',
      published_at: quando,
      cancelled_at: null,
      cancellation_note: null,
      created_at: quando,
      updated_at: quando,
      version: 1,
    })
    .onConflict((oc) => oc.column('slug').doNothing())
    .returning('slug')
    .executeTakeFirst();
  return gravada !== undefined;
}
