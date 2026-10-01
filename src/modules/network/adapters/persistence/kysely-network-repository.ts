/**
 * Persistencia da secao `Rede`.
 *
 * ## A visibilidade mora na clausula `WHERE`, em toda leitura
 *
 * `publication_status IN ('published', 'cancelled')`, o mesmo predicado dos
 * indices parciais da migracao, escrito uma vez em `VISIVEL`. `pending_review`
 * e `removed` ficam na tabela e fora de toda leitura.
 *
 * ## O encontro privado (ADR-0027 12.10 a 12.12)
 *
 * - **A autorizacao do conteudo oculto e um `EXISTS` na clausula `WHERE`**:
 *   `buscarDetalhesPrivados` e o ponto do privado so devolvem linha quando a
 *   propria conta tem pedido `approved`. Sem isso, nao ha linha, e a borda
 *   responde o mesmo 404 de "nao existe".
 * - **Recorte por valor oculto exclui o privado.** `city`, `admission` e
 *   `size` so casam encontro publico, e `q` casa o privado so pelo titulo:
 *   aparecer num recorte que so casa pelo bairro entregaria o bairro (P19,
 *   item 4). As condicoes estao em `recorteOculto`, uma funcao so, para que
 *   filtro novo sobre campo oculto passe por ela.
 * - **A agenda por distancia nao tem privado nenhum.** A posicao dele numa
 *   lista por distancia ja e localizacao.
 *
 * ## O pedido para participar
 *
 * A decisao guardada (`pending`, `approved`, `declined`) sai daqui; o estado
 * que o app ve e derivado no dominio. **Pedido desistido nunca e lido**: o
 * pendente desistido e apagado (D54) e o recusado desistido fica so para nao
 * lavar a recusa; se ele fosse lido, a desistencia separaria o recusado do
 * pendente.
 *
 * ## O `id` nunca e selecionado para leitura
 *
 * O que sai e o `slug`. As listas do encontro (portes, estrutura, o que levar)
 * vem por subconsulta escalar com `array(...)`, e nao por `join`: uma consulta
 * por pagina, sem N+1.
 *
 * ## Imagens
 *
 * A galeria (`network_event_images`, migracao `20260928000004`) vem na mesma
 * consulta, por subconsulta escalar em JSON, so com imagem PRONTA
 * (`catalog_images.status = 'ready'`): a derivada nunca e servida antes
 * (ADR-0027 item 10). O banco guarda a chave; a URL e composta aqui, e a capa
 * (`cover_image_url`) e a de posicao 0, no dominio.
 */
import { randomBytes } from 'node:crypto';
import { sql, type Expression, type SqlBool } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { EncontroDaRede, PublicacaoVisivel } from '../../domain/encontro-da-rede.js';
import type {
  DesfechoDaDesistencia,
  DesfechoDoPedido,
  LocalDoEncontro,
  NetworkRepository,
  PaginaDaAgenda,
  PaginaDosMeusPedidos,
  PaginaPorDistancia,
  PedidoDaConta,
  RecorteDaAgenda,
  RecorteDaAgendaPorDistancia,
  RecorteDosMeusPedidos,
} from '../../ports/network-repository.js';
import type { Instant } from '../../../../shared/types/brands.js';

/** Os estados de publicacao que as leituras enxergam. Uma lista so. */
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
  admission_kind: 'free' | 'paid';
  admission_amount: number | null;
  admission_currency: 'BRL' | null;
  admission_unit: 'per_dog' | 'per_person' | 'per_pair' | null;
  dog_age: string;
  vaccination_required: boolean;
  fenced_off_leash_area: boolean;
  street_address: string | null;
  notes: string | null;
  local_date: string;
  accepted_sizes: string[];
  amenities: string[];
  bring_items: string[];
  images: { k: string; a: string }[] | null;
}

/**
 * As colunas do encontro, nomeadas uma a uma, mais as tres listas. Nao ha
 * `selectAll()`: ele traria `id`, `geo` e a coluna de autoria para dentro do
 * processo.
 */
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
    'e.admission_kind as admission_kind',
    'e.admission_amount as admission_amount',
    'e.admission_currency as admission_currency',
    'e.admission_unit as admission_unit',
    'e.dog_age as dog_age',
    'e.vaccination_required as vaccination_required',
    'e.fenced_off_leash_area as fenced_off_leash_area',
    'e.notes as notes',
    'e.street_address as street_address',
    // A data local no fuso do PROPRIO encontro, pelo catalogo do banco.
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
    sql<{ k: string; a: string }[] | null>`(
      SELECT json_agg(json_build_object('k', c.public_key, 'a', i.alt_text) ORDER BY i.position)
        FROM network_event_images i JOIN catalog_images c ON c.id = i.image_id
       WHERE i.event_id = e.id AND c.status = 'ready' AND c.public_key IS NOT NULL)`.as('images'),
  ] as const;
}

/**
 * Escapa os curingas do `LIKE` para que o termo seja procurado como texto. A
 * barra invertida vem primeiro.
 */
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

function consultaBase(db: DbExecutor) {
  return db.selectFrom('network_events as e').where('e.publication_status', 'in', VISIVEL);
}

/** 23:59:59 do dia local do encontro, no fuso dele, como instante. */
const FIM_DO_DIA_DO_CANCELADO = sql`(((e.starts_at AT TIME ZONE e.time_zone)::date + time '23:59:59') AT TIME ZONE e.time_zone)`;

/** O sabado do fim de semana corrente ou proximo, no fuso do encontro. */
function sabadoDoFimDeSemana(agora: Date) {
  const hoje = sql`(${agora}::timestamptz AT TIME ZONE e.time_zone)::date`;
  return sql`(${hoje} + (CASE WHEN extract(isodow FROM ${hoje}) = 7 THEN -1
                              ELSE 6 - extract(isodow FROM ${hoje})::int END))`;
}

/**
 * O recorte no tempo. Os tres originais sao o complemento exato do rotulo
 * temporal do dominio; os tres novos (ADR-0027 12.14) sao calculados no fuso de
 * cada encontro, pelo banco.
 */
function recorteNoTempo(consulta: Consulta, when: RecorteDaAgenda['when'], agora: Date): Consulta {
  switch (when) {
    case 'upcoming':
      return consulta.where((eb) =>
        eb.or([
          eb.and([eb('e.ends_at', 'is', null), eb('e.starts_at', '>', agora)]),
          eb.and([eb('e.ends_at', 'is not', null), eb('e.ends_at', '>=', agora)]),
          // O cancelado sem fim segue visivel COMO cancelado ate 23:59:59 do
          // dia dele, no fuso dele (`fimDoCancelado`, decisao de 28/09).
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
      // O sabado corrente (ou o proximo) no fuso do encontro; no domingo, o
      // sabado de ontem, para o domingo ainda ser "este fim de semana".
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

/**
 * Os recortes que tocam campo oculto do privado, TODOS aqui (P19 item 4).
 * `q` casa o privado so pelo titulo; `city`, `admission` e `size` o excluem.
 */
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
 * O construtor da agenda, separado para poder ser compilado e lido por um
 * teste sem subir banco.
 */
export function construtorDaAgenda(db: DbExecutor, recorte: RecorteDaAgenda) {
  const agora = comoData(recorte.agora);
  let consulta = recorteNoTempo(consultaBase(db), recorte.when, agora);
  if (recorte.visibility !== undefined) {
    consulta = consulta.where('e.visibility', '=', recorte.visibility);
  }
  return recorteOculto(consulta, recorte);
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

/** A regiao de referencia VALIDA da conta, como em `Perto`. */
function regiaoDaConta(chamador: string, agora: Date) {
  return sql`(SELECT u.reference_point FROM user_reference_locations u
               WHERE u.user_id = ${chamador}::uuid AND u.expires_at > ${agora}::timestamptz)`;
}

interface LinhaDoPedido extends LinhaDoEncontro {
  decisao: 'pending' | 'approved' | 'declined';
  pedido_em: Date;
}

export class KyselyNetworkRepository implements NetworkRepository {
  constructor(
    private readonly db: Db,
    private readonly ids: { uuidv7(): string },
    /** A URL publica da derivada. O banco guarda so a chave. */
    private readonly urlDeMidia: (chave: string) => string,
  ) {}

  async listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda> {
    const base = construtorDaAgenda(this.db, recorte);
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    // Desempate por `slug`, que e unico: sem ele a paginacao repete e pula.
    const ordenada =
      recorte.sort === 'recentes'
        ? base.orderBy('e.starts_at', 'desc').orderBy('e.slug', 'desc')
        : base.orderBy('e.starts_at', 'asc').orderBy('e.slug', 'asc');

    const linhas = (await ordenada
      .select(colunasDoEncontro())
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoEncontro[];

    return { itens: linhas.map((l) => comoEncontro(l, this.urlDeMidia)), total };
  }

  async listarPorDistancia(recorte: RecorteDaAgendaPorDistancia): Promise<PaginaPorDistancia> {
    const agora = comoData(recorte.agora);
    const regiao = await this.db
      .selectFrom('user_reference_locations')
      .select('user_id')
      .where('user_id', '=', recorte.chamador)
      .where('expires_at', '>', agora)
      .executeTakeFirst();
    const temRegiao = regiao !== undefined;

    // O privado NUNCA entra, aprovado ou nao: a posicao dele numa lista por
    // distancia ja e localizacao.
    let base = construtorDaAgenda(this.db, { ...recorte, sort: 'proximos' }).where(
      'e.visibility',
      '=',
      'public',
    );
    if (temRegiao && recorte.maxKm !== undefined) {
      base = base
        .where(sql<SqlBool>`e.geo IS NOT NULL`)
        .where(
          sql<SqlBool>`ST_DWithin(e.geo, ${regiaoDaConta(recorte.chamador, agora)}, ${recorte.maxKm * 1000})`,
        );
    }

    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    const distancia = temRegiao
      ? sql<number | null>`ST_Distance(e.geo, ${regiaoDaConta(recorte.chamador, agora)})`
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
        encontro: comoEncontro(linha, this.urlDeMidia),
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
    return linha === undefined ? undefined : comoEncontro(linha, this.urlDeMidia);
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
    return linha === undefined ? undefined : comoEncontro(linha, this.urlDeMidia);
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
      // O mesmo 400 para o pendente e para o recusado: a checagem vem antes de
      // olhar o pedido.
      if (alvo.encerrado) return { tipo: 'encerrado' } as const;

      // Idempotente, e a recusa nao se lava: sobre linha existente o unico
      // efeito e limpar a desistencia (que so existe no recusado). A decisao
      // nao muda.
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
        // D54: nada a guardar, entao a linha sai na hora.
        await sql`DELETE FROM network_event_join_requests WHERE id = ${pedido.id}::uuid`.execute(trx);
      } else {
        // Recusado: a linha fica, marcada, para que pedir de novo nao nasca
        // pendente e lave a recusa.
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
    // O filtro por estado segue a MESMA derivacao do dominio: `pending` e
    // `declined` juntos, sempre. `withdrawn` nao tem linha legivel.
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
function comoEncontro(linha: LinhaDoEncontro, urlDeMidia: (chave: string) => string): EncontroDaRede {
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
    imagens: (linha.images ?? []).map((i) => ({ url: urlDeMidia(i.k), textoAlternativo: i.a })),
  };
}

export function criarNetworkRepository(
  db: Db,
  ids: { uuidv7(): string },
  urlDeMidia: (chave: string) => string,
): NetworkRepository {
  return new KyselyNetworkRepository(db, ids, urlDeMidia);
}
