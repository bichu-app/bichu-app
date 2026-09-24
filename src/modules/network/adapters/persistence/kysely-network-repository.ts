/**
 * Persistencia da secao `Rede`.
 *
 * ## A visibilidade mora na clausula `WHERE`, nas TRES leituras
 *
 * `publication_status IN ('published', 'cancelled')`, e o mesmo predicado dos
 * indices parciais da migracao. Mesmo desenho de `kysely-store-repository.ts`,
 * e pelo mesmo motivo: a diferenca entre filtrar na consulta e filtrar depois
 * aparece no dia em que alguem esquece o `if`. `pending_review` (o encontro da
 * comunidade antes da revisao humana, ADR-0027 13.5) e `removed` ficam na
 * tabela e fora de toda leitura, e a unica coisa que os mantem fora e o
 * predicado [VISIVEL], escrito uma vez e aplicado nas tres consultas.
 *
 * O cancelado e visivel de proposito: continua na agenda, e o dominio o rotula
 * `cancelled` ate o fim previsto e `ended` depois (decisao do cliente de
 * 23/09/2026).
 *
 * ## O ponto so e lido por `buscarLocalDoEncontro`
 *
 * A agenda e o detalhe sao alcancaveis sem conta, e nenhuma das duas consultas
 * seleciona `geo`. O ponto tem consulta propria, que a borda so executa com
 * `bearerAuth` valido (ADR-0027 12.5). Juntar as duas numa consulta so, com a
 * decisao de mostrar o ponto num `if`, seria a resposta que muda conforme o
 * chamador -- o que o ADR-0021 recusa.
 *
 * ## O `id` nunca e selecionado para leitura
 *
 * `network_events.id` e a identidade interna (ADR-0024), alvo das chaves
 * estrangeiras futuras. Nenhuma consulta daqui o seleciona: o que sai e o
 * `slug`, e o desempate da ordenacao usa o `slug` tambem, que e unico.
 *
 * ## A busca e `ILIKE` com escape, e nao busca de texto completo
 *
 * Mesma escolha da vitrine: a agenda de uma cidade tem dezenas de encontros,
 * nao milhares. **`%`, `_` e `\` sao escapados** -- sem isso, digitar `%` casa
 * tudo e a contagem da barra passa a dizer o total da agenda para um termo que
 * a pessoa acha que filtrou.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { EncontroDaRede, PublicacaoVisivel } from '../../domain/encontro-da-rede.js';
import type {
  LocalDoEncontro,
  NetworkRepository,
  PaginaDaAgenda,
  RecorteDaAgenda,
} from '../../ports/network-repository.js';
import type { Instant } from '../../../../shared/types/brands.js';

/**
 * Os estados de publicacao que as leituras enxergam. Uma lista so, para as tres
 * consultas: duas copias do predicado de visibilidade divergem na primeira vez
 * que alguem acrescentar um estado.
 */
export const VISIVEL: readonly PublicacaoVisivel[] = ['published', 'cancelled'];

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
  cover_image_url: string | null;
  publication_status: PublicacaoVisivel;
}

interface LinhaDoPonto {
  lat: number | null;
  lon: number | null;
}

/**
 * As colunas do cartao, nomeadas uma a uma. Nao ha `selectAll()` nesta secao:
 * um `selectAll` traria `id`, `geo` e a coluna de autoria para dentro do
 * processo, e o que nao e carregado nao tem como ser projetado depois por um
 * espalhamento distraido.
 */
const COLUNAS_DO_CARTAO = [
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
  'e.cover_image_url as cover_image_url',
  'e.publication_status as publication_status',
] as const;

/**
 * Escapa os curingas do `LIKE` para que o termo da pessoa seja procurado como
 * texto, e nao como padrao. Copiado da vitrine em vez de importado de la:
 * `moduleBoundaries` so deixa um modulo enxergar `ports/` de outro.
 *
 * A barra invertida vem primeiro: escapar `%` depois dela duplicaria a barra
 * que acabou de ser inserida.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/**
 * O construtor da agenda, separado para poder ser **compilado e lido** por um
 * teste sem subir banco, como `construtorDaVitrine` faz na `Loja`.
 */
export function construtorDaAgenda(db: DbExecutor, recorte: RecorteDaAgenda) {
  let consulta = db
    .selectFrom('network_events as e')
    .where('e.publication_status', 'in', VISIVEL);

  const agora = comoData(recorte.agora);

  // O recorte de tempo e o COMPLEMENTO EXATO do rotulo temporal do dominio. O
  // cancelado entra aqui como qualquer encontro: antes do fim ele esta em
  // `upcoming` (rotulado `cancelled`), e depois do fim esta em `past`
  // (rotulado `ended`). Decisao do cliente de 23/09/2026.
  if (recorte.when === 'upcoming') {
    consulta = consulta.where((eb) =>
      eb.or([
        eb.and([eb('e.ends_at', 'is', null), eb('e.starts_at', '>', agora)]),
        eb.and([eb('e.ends_at', 'is not', null), eb('e.ends_at', '>=', agora)]),
      ]),
    );
  } else if (recorte.when === 'past') {
    consulta = consulta.where((eb) =>
      eb.or([
        eb.and([eb('e.ends_at', 'is', null), eb('e.starts_at', '<=', agora)]),
        eb.and([eb('e.ends_at', 'is not', null), eb('e.ends_at', '<', agora)]),
      ]),
    );
  }

  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    // `lower(...) = lower(...)`, como o diretorio faz: a cidade e um rotulo
    // digitado. Nao ha coordenada nisto (ADR-0006).
    consulta = consulta.where(sql<boolean>`lower(e.city) = lower(${cidade})`);
  }

  const termo = recorte.q?.trim();
  if (termo !== undefined && termo !== '') {
    const padrao = `%${escaparCuringas(termo)}%`;
    consulta = consulta.where((eb) =>
      eb.or([
        eb(sql`e.title`, 'ilike', sql`${padrao}`),
        eb(sql`e.summary`, 'ilike', sql`${padrao}`),
      ]),
    );
  }

  return consulta;
}

/**
 * A leitura do ponto, como consulta ainda nao executada, para um teste poder
 * compila-la e ler o `WHERE` sem banco.
 *
 * `::geometry` antes de `ST_Y`/`ST_X` porque as duas nao aceitam `geography`.
 * A conversao nao move o ponto: troca so a interpretacao do mesmo par.
 */
export function construtorDoLocal(db: DbExecutor, slug: string) {
  return db
    .selectFrom('network_events as e')
    .where('e.slug', '=', slug)
    .where('e.publication_status', 'in', VISIVEL)
    .select([
      sql<number | null>`ST_Y(e.geo::geometry)`.as('lat'),
      sql<number | null>`ST_X(e.geo::geometry)`.as('lon'),
    ]);
}

export class KyselyNetworkRepository implements NetworkRepository {
  constructor(private readonly db: Db) {}

  async listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda> {
    const base = construtorDaAgenda(this.db, recorte);

    // O total do RECORTE. Consulta separada e nao `COUNT(*) OVER ()` porque a
    // janela some quando a pagina nao tem linha nenhuma, e e justamente ai que
    // a tela precisa do total.
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    // O desempate por `slug` nao e enfeite: dois encontros com o mesmo
    // `starts_at` trocariam de lugar entre duas chamadas, e a paginacao
    // passaria a repetir e a pular cartoes sem nada acusar.
    const ordenada =
      recorte.sort === 'recentes'
        ? base.orderBy('e.starts_at', 'desc').orderBy('e.slug', 'desc')
        : base.orderBy('e.starts_at', 'asc').orderBy('e.slug', 'asc');

    const linhas = (await ordenada
      .select(COLUNAS_DO_CARTAO)
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as LinhaDoEncontro[];

    return { itens: linhas.map(comoEncontro), total };
  }

  async buscarEncontro(slug: string): Promise<EncontroDaRede | undefined> {
    const linha = (await this.db
      .selectFrom('network_events as e')
      .where('e.slug', '=', slug)
      // ADR-0021: invisivel e inexistente saem pelo MESMO caminho, que e a
      // ausencia de linha.
      .where('e.publication_status', 'in', VISIVEL)
      .select(COLUNAS_DO_CARTAO)
      .executeTakeFirst()) as LinhaDoEncontro | undefined;

    return linha === undefined ? undefined : comoEncontro(linha);
  }

  async buscarLocalDoEncontro(slug: string): Promise<LocalDoEncontro | undefined> {
    const linha = (await construtorDoLocal(this.db, slug).executeTakeFirst()) as
      | LinhaDoPonto
      | undefined;
    if (linha === undefined) return undefined;
    // `geo` e `geo_source` andam juntos por `CHECK`, entao ou os dois
    // componentes existem ou nenhum. Conferir os dois aqui custa uma linha e
    // impede um `{ lat: null }` de atravessar a borda se o `CHECK` um dia sumir.
    if (linha.lat === null || linha.lon === null) return { ponto: null };
    return { ponto: { lat: Number(linha.lat), lon: Number(linha.lon) } };
  }
}

/** A linha do banco na forma do dominio. As datas viram instante, e nada mais. */
function comoEncontro(linha: LinhaDoEncontro): EncontroDaRede {
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
    coverImageUrl: linha.cover_image_url,
    publicacao: linha.publication_status,
  };
}

export function criarNetworkRepository(db: Db): NetworkRepository {
  return new KyselyNetworkRepository(db);
}
