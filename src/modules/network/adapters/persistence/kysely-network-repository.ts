/**
 * Persistencia da secao `Rede`.
 *
 * ## `active` mora na clausula `WHERE`, nas TRES operacoes
 *
 * Mesmo desenho de `kysely-store-repository.ts`, e pelo mesmo motivo: a
 * diferenca entre filtrar na consulta e filtrar depois aparece no dia em que
 * alguem esquece o `if`. Evento retirado fica na tabela -- apaga-lo levaria os
 * check-ins junto -- e a unica coisa que o mantem fora da leitura e este
 * predicado.
 *
 * Vale tambem para a ESCRITA, e ali ele faz um segundo trabalho: o check-in num
 * evento inativo nao escreve nada porque a linha de origem nao existe para a
 * consulta, e nao porque um `if` do manipulador comparou alguma coisa. E a
 * autorizacao na clausula `WHERE` da ADR-0021, aplicada a um `INSERT`.
 *
 * ## A presenca e contada, e nunca lida linha a linha
 *
 * `network_event_checkins.user_id` e a unica coluna desta secao que identifica
 * alguem, e o ADR-0024 secao 7 diz o alcance dela em uma frase: nenhuma
 * operacao do contrato a le linha a linha, e a unica leitura e `count(*)`.
 *
 * Este arquivo cumpre isso de duas formas, e as duas sao deliberadas:
 *
 * - a contagem sai de uma **subconsulta escalar** com `count(*)`, entao nao ha
 *   `join` com a tabela de presenca em consulta nenhuma -- e sem `join` nao ha
 *   coluna de pessoa no conjunto de resultado para alguem projetar por engano;
 * - `viewer_checked_in` sai de um **`EXISTS`** com `user_id = :chamador`. O
 *   `EXISTS` devolve um booleano sobre quem JA esta chamando, e nunca a
 *   identidade de terceiro. Sem chamador ele nem e montado: a resposta e
 *   `false` por decisao, e nao por uma consulta sem filtro de pessoa.
 *
 * ## A idempotencia do check-in e do BANCO
 *
 * `insert ... on conflict (event_slug, user_id) do nothing`. A chave primaria e
 * `(event_slug, user_id)`, entao o segundo check-in da mesma pessoa no mesmo
 * evento deixa de ser algo que a aplicacao precisa conferir e passa a ser um
 * estado que o banco recusa. Um `if` na aplicacao teria janela entre a leitura
 * e a escrita, e e justamente na chamada dupla -- o toque repetido do dedo, a
 * repeticao do cliente offline -- que essa janela e exercida.
 *
 * ## A busca e `ILIKE` com escape, e nao busca de texto completo
 *
 * Mesma escolha da vitrine, pela mesma razao: a agenda de uma cidade tem
 * dezenas de encontros, nao milhares. **`%`, `_` e `\` sao escapados** -- sem
 * isso, digitar `%` casa tudo e a contagem da barra passa a dizer o total da
 * agenda para um termo que a pessoa acha que filtrou.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  EncontroComGaleria,
  EncontroDaRede,
  FotoDoEncontro,
} from '../../domain/encontro-da-rede.js';
import type {
  DesfechoDoCheckIn,
  NetworkRepository,
  PaginaDaAgenda,
  PedidoDeCheckIn,
  PedidoDeEncontro,
  RecorteDaAgenda,
} from '../../ports/network-repository.js';
import type { Instant } from '../../../../shared/types/brands.js';

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
  checkin_count: string | number | null;
  photo_count: string | number | null;
}

interface LinhaDaFoto {
  slug: string;
  image_url: string;
  caption: string | null;
}

/**
 * Escapa os curingas do `LIKE` para que o termo da pessoa seja procurado como
 * texto, e nao como padrao.
 *
 * Copiado da vitrine em vez de importado de la: `moduleBoundaries` so deixa um
 * modulo enxergar `ports/` de outro, e uma funcao de escape num `ports/`
 * publico seria uma fronteira aberta para poupar sete linhas.
 *
 * A barra invertida vem primeiro: escapar `%` depois dela duplicaria a barra
 * que acabou de ser inserida.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/** O `count(*)` do driver chega como texto. Nulo nao acontece, e 0 e o fundo. */
function comoInteiro(valor: string | number | null): number {
  return valor === null ? 0 : Number(valor);
}

/**
 * O construtor da agenda, separado para poder ser **compilado e lido** por um
 * teste sem subir banco, como `construtorDaVitrine` faz na `Loja`.
 *
 * E o que permite que "o evento inativo esta fora" e "o recorte de tempo
 * concorda com o rotulo" sejam verificaveis em vez de combinados.
 */
export function construtorDaAgenda(db: DbExecutor, recorte: RecorteDaAgenda) {
  let consulta = db.selectFrom('network_events as e').where('e.active', '=', true);

  const agora = comoData(recorte.agora);

  // O recorte de tempo e o COMPLEMENTO EXATO do rotulo `status` do dominio, e a
  // igualdade importa: se os dois discordassem, a lista de `upcoming` esconderia
  // um cartao que ela mesma desenharia como `upcoming`, ou mostraria um cartao
  // escrito `Encerrado` -- e nenhuma das duas tem como ser explicada na tela.
  //
  // `happening` entra em `upcoming`, e nao em `past`: um encontro que esta
  // acontecendo agora nao passou. E e com a agenda aberta no default que o
  // cartao `Acontecendo agora` tem onde aparecer.
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
    // digitado, e quem digita `sao paulo` quer a mesma lista de quem digita
    // `São Paulo`. Nao ha coordenada nisto, e o ADR-0006 e o motivo.
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

export class KyselyNetworkRepository implements NetworkRepository {
  constructor(private readonly db: Db) {}

  async listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda> {
    const base = construtorDaAgenda(this.db, recorte);

    // O total do RECORTE. Consulta separada e nao `COUNT(*) OVER ()` porque a
    // janela some quando a pagina nao tem linha nenhuma, e e justamente ai que
    // a tela precisa do total para distinguir "filtrou e nao sobrou" de "a Rede
    // ainda nao tem encontro".
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    // O desempate por `slug` nao e enfeite: dois encontros com o mesmo
    // `starts_at` -- dois passeios de domingo as 9h sao o caso normal, e nao o
    // excepcional -- trocariam de lugar entre duas chamadas, e a paginacao
    // passaria a repetir e a pular cartoes sem nada acusar.
    const ordenada =
      recorte.sort === 'recentes'
        ? base.orderBy('e.starts_at', 'desc').orderBy('e.slug', 'desc')
        : base.orderBy('e.starts_at', 'asc').orderBy('e.slug', 'asc');

    const linhas = (await ordenada
      .select((eb) => [
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
        // SUBCONSULTA ESCALAR, e nao `join`: o conjunto de resultado desta
        // consulta nao tem nenhuma coluna da tabela de presenca, entao nao ha
        // coluna de pessoa para alguem projetar por engano. O que sai daqui e
        // um numero.
        eb
          .selectFrom('network_event_checkins as c')
          .whereRef('c.event_slug', '=', 'e.slug')
          .select(eb.fn.countAll<string>().as('total'))
          .as('checkin_count'),
        eb
          .selectFrom('network_event_photos as f')
          .whereRef('f.event_slug', '=', 'e.slug')
          .select(eb.fn.countAll<string>().as('total'))
          .as('photo_count'),
      ])
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoEncontro[];

    return { itens: linhas.map(comoEncontro), total };
  }

  async buscarEncontro(pedido: PedidoDeEncontro): Promise<EncontroComGaleria | undefined> {
    const chamador = pedido.chamador;

    const linha = (await this.db
      .selectFrom('network_events as e')
      .where('e.slug', '=', pedido.slug)
      // ADR-0021: evento inativo e evento inexistente saem pelo MESMO caminho,
      // que e a ausencia de linha. Distinguir os dois contaria a um estranho
      // que aquele `slug` existiu.
      .where('e.active', '=', true)
      .select((eb) => [
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
        eb
          .selectFrom('network_event_checkins as c')
          .whereRef('c.event_slug', '=', 'e.slug')
          .select(eb.fn.countAll<string>().as('total'))
          .as('checkin_count'),
        eb
          .selectFrom('network_event_photos as f')
          .whereRef('f.event_slug', '=', 'e.slug')
          .select(eb.fn.countAll<string>().as('total'))
          .as('photo_count'),
      ])
      .executeTakeFirst()) as unknown as LinhaDoEncontro | undefined;

    if (linha === undefined) return undefined;

    const fotos = (await this.db
      .selectFrom('network_event_photos as f')
      .where('f.event_slug', '=', pedido.slug)
      // As TRES colunas da galeria, nomeadas uma a uma. Nao ha `selectAll()`
      // aqui, e a ausencia e a decisao 3 do ADR-0024: um `selectAll` carregaria
      // quem enviou a foto para dentro do processo, e o que nao e carregado nao
      // tem como ser projetado depois por um espalhamento distraido.
      .select(['f.slug as slug', 'f.image_url as image_url', 'f.caption as caption'])
      .orderBy('f.sort_order', 'asc')
      .orderBy('f.slug', 'asc')
      .execute()) as unknown as LinhaDaFoto[];

    const galeria: FotoDoEncontro[] = fotos.map((foto) => ({
      slug: foto.slug,
      imageUrl: foto.image_url,
      caption: foto.caption,
    }));

    return {
      ...comoEncontro(linha),
      galeria,
      viewerCheckedIn: await this.jaConfirmou(pedido.slug, chamador),
    };
  }

  /**
   * `viewer_checked_in`, por `EXISTS`.
   *
   * Sem chamador a consulta **nao acontece**: quem chega sem conta recebe
   * `false`, e nao o resultado de um `EXISTS` sem filtro de pessoa -- que
   * responderia "alguem confirmou" no lugar de "voce confirmou", e seria um
   * fato sobre terceiro na resposta de quem nem tem conta.
   */
  private async jaConfirmou(slug: string, chamador: string | undefined): Promise<boolean> {
    if (chamador === undefined) return false;
    const achado = await this.db
      .selectFrom('network_event_checkins as c')
      .where('c.event_slug', '=', slug)
      .where('c.user_id', '=', chamador)
      .select(sql<number>`1`.as('presente'))
      .executeTakeFirst();
    return achado !== undefined;
  }

  async confirmarPresenca(pedido: PedidoDeCheckIn): Promise<DesfechoDoCheckIn | undefined> {
    return this.db.transaction().execute(async (trx) => {
      // O `INSERT` nasce de um `SELECT` sobre `network_events`, e e ele que
      // carrega a autorizacao: sem evento ATIVO com aquele `slug` nao ha linha
      // de origem, entao nada e escrito. Nao ha consulta previa, nao ha
      // comparacao no manipulador e nao ha 403 -- ADR-0021.
      await trx
        .insertInto('network_event_checkins')
        .columns(['event_slug', 'user_id'])
        .expression(
          trx
            .selectFrom('network_events as e')
            .where('e.slug', '=', pedido.slug)
            .where('e.active', '=', true)
            .select(['e.slug', sql<string>`${pedido.chamador}::uuid`.as('quem')]),
        )
        // A IDEMPOTENCIA, e ela e do banco. A segunda chamada da mesma pessoa
        // no mesmo evento nao escreve e nao levanta: o contrato promete 200 nas
        // duas vezes, com a mesma contagem.
        .onConflict((oc) => oc.columns(['event_slug', 'user_id']).doNothing())
        .execute();

      // A contagem JA ATUALIZADA, e o mesmo `WHERE` de novo -- e e ele que
      // produz o 404. Evento inativo ou inexistente nao devolve linha nenhuma,
      // e a borda responde "nao achei" sem nunca ter comparado nada.
      const linha = await trx
        .selectFrom('network_events as e')
        .where('e.slug', '=', pedido.slug)
        .where('e.active', '=', true)
        .select((eb) =>
          eb
            .selectFrom('network_event_checkins as c')
            .whereRef('c.event_slug', '=', 'e.slug')
            .select(eb.fn.countAll<string>().as('total'))
            .as('checkin_count'),
        )
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return { checkinCount: comoInteiro(linha.checkin_count) };
    });
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
    // `timestamptz` chega como `Date`. O dominio compara instantes, e a marca
    // `Instant` e o que impede a comparacao com qualquer outro numero.
    startsAt: linha.starts_at.getTime() as Instant,
    endsAt: linha.ends_at === null ? null : (linha.ends_at.getTime() as Instant),
    timeZone: linha.time_zone,
    coverImageUrl: linha.cover_image_url,
    checkinCount: comoInteiro(linha.checkin_count),
    photoCount: comoInteiro(linha.photo_count),
  };
}

export function criarNetworkRepository(db: Db): NetworkRepository {
  return new KyselyNetworkRepository(db);
}
