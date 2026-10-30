/** Persistencia do diretorio de `Perto`, em PostGIS. */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  EnderecoComercial,
  EntradaDoDiretorio,
  TipoDeEntidade,
  TipoDeProfissional,
} from '../../domain/entrada-do-diretorio.js';
import type {
  DecisaoDaVerificacao,
  TipoDeEvidencia,
} from '../../domain/nivel-de-verificacao.js';
import type {
  AvaliacaoGravada,
  DirectoryRepository,
  LocalDoDiretorio,
  PaginaDeAvaliacoes,
  PaginaDoDiretorio,
  RecorteDasAvaliacoes,
  RecorteDoDiretorio,
} from '../../ports/directory-repository.js';
import type {
  AvaliacaoDoLocal,
  EntradaDaAvaliacao,
  MotivoDaDenuncia,
  PontuacaoDoLocal,
} from '../../domain/avaliacao-do-local.js';
import { PONTUACAO_VAZIA } from '../../domain/avaliacao-do-local.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { FamiliaDeSessao } from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDaEntrada {
  slug: string;
  kinds: TipoDeProfissional[];
  entity_kind: TipoDeEntidade;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  phone_e164: string | null;
  site_url: string | null;
  evidencias: TipoDeEvidencia[] | null;
  distancia_em_metros: number | null;
  logo_public_key: string | null;
}

/** As quatro colunas de endereco, **so na linha do DETALHE**. */
interface LinhaDoEnderecoComercial {
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
}

function comoEnderecoComercial(l: LinhaDoEnderecoComercial): EnderecoComercial {
  return {
    postalCode: l.postal_code,
    street: l.street,
    streetNumber: l.street_number,
    complement: l.complement,
  };
}

/** O ponto de referencia DESTE APARELHO de quem chama, valido, como subconsulta. */
function pontoDeReferencia(chamador: UserId, familia: FamiliaDeSessao, agora: Instant) {
  return sql`(
    select reference_point
      from user_reference_locations
     where user_id = ${chamador}
       and session_family_id = ${familia}
       and expires_at > ${comoData(agora)}
  )`;
}

/** O ponto de quem chama SEM aparelho conhecido: nenhum. */
const SEM_PONTO = sql`null::geography`;

/** O ponto que vale para esta chamada: o do aparelho, ou nenhum. */
function pontoDoAparelho(
  chamador: UserId | undefined,
  familia: FamiliaDeSessao | undefined,
  agora: Instant,
) {
  return chamador === undefined || familia === undefined
    ? SEM_PONTO
    : pontoDeReferencia(chamador, familia, agora);
}

/** As provas APROVADAS da entidade, como subconsulta agregada. */
const EVIDENCIAS_APROVADAS = sql<TipoDeEvidencia[] | null>`(
  select array_agg(v.evidence_kind)
    from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
)`;

/**
 * A CHAVE DA DERIVADA de uma imagem da entrada, **so quando ela esta PRONTA**
 * (18/10/2026, com a liberacao das imagens do profissional no aplicativo).
 */
function CHAVE_DA_DERIVADA(coluna: 'logo_image_id' | 'photo_image_id') {
  return sql<string | null>`(
  select c.public_key
    from catalog_images c
   where c.id = professionals.${sql.raw(coluna)}
     and c.status = 'ready'
)`;
}

/** `EXISTS` de prova aprovada de documento. */
const TEM_DOCUMENTO = sql<boolean>`EXISTS (
  select 1 from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
     and v.evidence_kind IN ('crmv', 'cnpj', 'document')
)`;

/** `EXISTS` de qualquer prova aprovada. */
const TEM_ALGUMA_PROVA = sql<boolean>`EXISTS (
  select 1 from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
)`;

/**
 * A linha vira entrada. **A pontuacao entra por PARAMETRO e nao pela linha**, e a
 * separacao e deliberada: a lista a le na MESMA consulta da pagina (lateral sobre
 * `pontuacao_do_local`), e o detalhe a le na consulta propria que ja existia.
 */
function comoEntrada(l: LinhaDaEntrada, pontuacao: PontuacaoDoLocal): EntradaDoDiretorio {
  const aprovadas: DecisaoDaVerificacao = 'approved';
  return {
    slug: l.slug,
    kinds: l.kinds,
    entityKind: l.entity_kind,
    displayName: l.display_name,
    about: l.about,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    phoneE164: l.phone_e164,
    siteUrl: l.site_url,
    verificacoes: (l.evidencias ?? []).map((tipo) => ({
      evidenceKind: tipo,
      decision: aprovadas,
    })),
    distanciaEmMetros: l.distancia_em_metros,
    logoPublicKey: l.logo_public_key,
    pontuacao,
  };
}

/** O recorte, com `status = 'published'` dentro da consulta. */
export function construtorDaListagem(db: DbExecutor, recorte: RecorteDoDiretorio) {
  let consulta = db
    .selectFrom('professionals')
    .where('status', '=', 'published')
    .where(sql<boolean>`conta_habilitada(professionals.claimed_by_user_id)`);

  const busca = recorte.q?.trim();
  if (busca !== undefined && busca !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.display_name) LIKE padrao_de_busca(${busca})`,
    );
  }

  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.city) = texto_para_busca(${cidade})`,
    );
  }
  const uf = recorte.state?.trim();
  if (uf !== undefined && uf !== '') {
    consulta = consulta.where(sql<boolean>`upper(state) = upper(${uf})`);
  }
  const bairro = recorte.neighborhood?.trim();
  if (bairro !== undefined && bairro !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.neighborhood) = texto_para_busca(${bairro})`,
    );
  }
  if (recorte.kind !== undefined) {
    consulta = consulta.where(sql<boolean>`professionals.kinds @> ARRAY[${recorte.kind}]::text[]`);
  }
  if (recorte.verificationLevel === 'document_verified') {
    consulta = consulta.where(TEM_DOCUMENTO);
  } else if (recorte.verificationLevel === 'contact_verified') {
    consulta = consulta.where(TEM_ALGUMA_PROVA);
  }
  return consulta;
}

/** O recorte das avaliacoes que SAEM, num lugar so. */
const AVALIACAO_VISIVEL = sql<boolean>`(
  professional_reviews.status = 'published'
  AND conta_habilitada(professional_reviews.author_user_id)
)`;

/** O estado da conta para AVALIAR, pela mesma regua de criar encontro. */
const TEM_CANAL_VERIFICADO = (chamador: UserId) => sql<boolean>`EXISTS (
  SELECT 1 FROM users u
   WHERE u.id = ${chamador}::uuid
     AND ${canalDeContatoConfirmadoNoSql('u')}
)`;

interface LinhaDaPontuacao {
  media: string | null;
  quantidade: string;
  n1: string;
  n2: string;
  n3: string;
  n4: string;
  n5: string;
}

/**
 * `pontuacao_do_local` devolve `numeric` e `bigint`, que o driver entrega como
 * STRING.
 */
function comoPontuacao(l: LinhaDaPontuacao | undefined): PontuacaoDoLocal {
  if (l === undefined) return PONTUACAO_VAZIA;
  const quantidade = Number(l.quantidade);
  return {
    media: l.media === null ? null : Number(l.media),
    quantidade,
    histograma: {
      1: Number(l.n1),
      2: Number(l.n2),
      3: Number(l.n3),
      4: Number(l.n4),
      5: Number(l.n5),
    },
  };
}

interface LinhaDaAvaliacao {
  ref: string;
  rating: number;
  body: string | null;
  author_display_name: string | null;
  created_at: Date;
  edited_at: Date | null;
  minha: boolean;
}

function comoAvaliacao(l: LinhaDaAvaliacao): AvaliacaoDoLocal {
  return {
    ref: l.ref,
    nota: l.rating,
    texto: l.body,
    nomeDeExibicaoDoAutor: l.author_display_name,
    criadaEm: l.created_at,
    editadaEm: l.edited_at,
    minha: l.minha,
  };
}

/** O `id` interno da entrada PUBLICADA com este slug, ou `undefined`. */
async function idDoLocalPublicado(db: DbExecutor, slug: string): Promise<string | undefined> {
  const linha = await db
    .selectFrom('professionals')
    .select('id')
    .where('slug', '=', slug)
    .where('status', '=', 'published')
    .executeTakeFirst();
  return linha?.id;
}

function pontuacaoDe(db: DbExecutor, idDoLocal: string) {
  return sql<LinhaDaPontuacao>`SELECT * FROM pontuacao_do_local(${idDoLocal}::uuid)`.execute(db);
}

/** O nome da coluna interna que o lateral consome, e **so** ele. */
const ID_PARA_O_LATERAL = 'id_do_lateral';

/** A PONTUACAO DE CADA CARTAO, **na mesma consulta da pagina e DEPOIS do `LIMIT`**. */
const PONTUACAO_DO_CARTAO = sql<LinhaDaPontuacao>`pontuacao_do_local(pagina.${sql.raw(
  ID_PARA_O_LATERAL,
)})`.as('pontuacao');

export function criarDirectoryRepository(db: Db, ids: IdGenerator): DirectoryRepository {
  /**
   * O `ref` publico da avaliacao: 128 bits de CSPRNG em base64url, 22 caracteres,
   * exatamente o `CHECK` da migracao.
   */
  const novoRef = (): string => Buffer.from(ids.random128()).toString('base64url');

  return {
    async listarPublicados(recorte: RecorteDoDiretorio): Promise<PaginaDoDiretorio> {
      const localizacao =
        recorte.chamador === undefined || recorte.familia === undefined
          ? undefined
          : await db
              .selectFrom('user_reference_locations')
              .select('user_id')
              .where('user_id', '=', recorte.chamador)
              .where('session_family_id', '=', recorte.familia)
              .where('expires_at', '>', comoData(recorte.agora))
              .executeTakeFirst();

      const distanciaDisponivel = localizacao !== undefined && recorte.sort === 'distance';

      const ponto = pontoDoAparelho(recorte.chamador, recorte.familia, recorte.agora);
      const distancia = sql<number | null>`ST_Distance(professionals.geo, ${ponto})`;
      let pagina = construtorDaListagem(db, recorte).select([
        sql<string>`professionals.id`.as(ID_PARA_O_LATERAL),
        'slug',
        'kinds',
        'entity_kind',
        'display_name',
        'about',
        'city',
        'state',
        'neighborhood',
        'phone_e164',
        'site_url',
        EVIDENCIAS_APROVADAS.as('evidencias'),
        distancia.as('distancia_em_metros'),
        CHAVE_DA_DERIVADA('logo_image_id').as('logo_public_key'),
      ]);

      pagina = distanciaDisponivel
        ? pagina.orderBy(sql`${distancia} asc nulls last`)
        : pagina;

      const comPontuacao = db
        .selectFrom(
          pagina
            .orderBy('display_name')
            .limit(recorte.limit)
            .offset((recorte.page - 1) * recorte.limit)
            .as('pagina'),
        )
        .crossJoinLateral(PONTUACAO_DO_CARTAO)
        .select([
          'pagina.slug',
          'pagina.kinds',
          'pagina.entity_kind',
          'pagina.display_name',
          'pagina.about',
          'pagina.city',
          'pagina.state',
          'pagina.neighborhood',
          'pagina.phone_e164',
          'pagina.site_url',
          'pagina.evidencias',
          'pagina.distancia_em_metros',
          'pagina.logo_public_key',
          'pontuacao.media',
          'pontuacao.quantidade',
          'pontuacao.n1',
          'pontuacao.n2',
          'pontuacao.n3',
          'pontuacao.n4',
          'pontuacao.n5',
        ]);

      const ordenada = distanciaDisponivel
        ? comPontuacao.orderBy(sql`"pagina"."distancia_em_metros" asc nulls last`)
        : comPontuacao;

      const itens = await ordenada.orderBy('pagina.display_name').execute();

      const contagem = await construtorDaListagem(db, recorte)
        .select(sql<string>`count(*)`.as('total'))
        .executeTakeFirstOrThrow();

      return {
        itens: (itens as unknown as (LinhaDaEntrada & LinhaDaPontuacao)[]).map((l) =>
          comoEntrada(l, comoPontuacao(l)),
        ),
        total: Number(contagem.total),
        distanciaDisponivel,
      };
    },

    async lerLocalPublicado(
      slug: string,
      chamador: UserId,
      familia: FamiliaDeSessao | undefined,
      agora: Instant,
    ): Promise<LocalDoDiretorio | undefined> {
      const ponto = pontoDoAparelho(chamador, familia, agora);
      const linha = await db
        .selectFrom('professionals')
        .select([
          'id',
          'slug',
          'kinds',
          'entity_kind',
          'display_name',
          'about',
          'city',
          'state',
          'neighborhood',
          'phone_e164',
          'site_url',
          EVIDENCIAS_APROVADAS.as('evidencias'),
          sql<number | null>`ST_Distance(professionals.geo, ${ponto})`.as('distancia_em_metros'),
          CHAVE_DA_DERIVADA('logo_image_id').as('logo_public_key'),
          CHAVE_DA_DERIVADA('photo_image_id').as('photo_public_key'),
          'postal_code',
          'street',
          'street_number',
          'complement',
        ])
        .where('slug', '=', slug)
        .where('status', '=', 'published')
        .executeTakeFirst();

      if (linha === undefined) return undefined;

      const { rows } = await pontuacaoDe(db, linha.id);
      const pontuacao = comoPontuacao(rows[0]);

      const minha = await db
        .selectFrom('professional_reviews')
        .select('ref')
        .where('professional_id', '=', linha.id)
        .where('author_user_id', '=', chamador)
        .where('status', '=', 'published')
        .executeTakeFirst();

      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);

      return {
        entrada: comoEntrada(linha as unknown as LinhaDaEntrada, pontuacao),
        pontuacao,
        refDaMinhaAvaliacao: minha?.ref ?? null,
        podeAvaliar: canal.rows[0]?.tem_canal ?? false,
        fotoPublicKey: linha.photo_public_key,
        enderecoComercial: comoEnderecoComercial(linha),
      };
    },

    async listarAvaliacoes(r: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined> {
      const idDoLocal = await idDoLocalPublicado(db, r.slug);
      if (idDoLocal === undefined) return undefined;

      let consulta = db
        .selectFrom('professional_reviews')
        .leftJoin('users', 'users.id', 'professional_reviews.author_user_id')
        .select([
          'professional_reviews.ref as ref',
          'professional_reviews.rating as rating',
          'professional_reviews.body as body',
          'users.display_name as author_display_name',
          'professional_reviews.created_at as created_at',
          'professional_reviews.edited_at as edited_at',
          sql<boolean>`professional_reviews.author_user_id = ${r.chamador}::uuid`.as('minha'),
        ])
        .where('professional_reviews.professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL);

      consulta =
        r.sort === 'rating_desc'
          ? consulta.orderBy('professional_reviews.rating', 'desc').orderBy('professional_reviews.created_at', 'desc')
          : r.sort === 'rating_asc'
            ? consulta.orderBy('professional_reviews.rating', 'asc').orderBy('professional_reviews.created_at', 'desc')
            : consulta.orderBy('professional_reviews.created_at', 'desc');

      const itens = await consulta
        .limit(r.limit)
        .offset((r.page - 1) * r.limit)
        .execute();

      const contagem = await db
        .selectFrom('professional_reviews')
        .select(sql<string>`count(*)`.as('total'))
        .where('professional_reviews.professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL)
        .executeTakeFirstOrThrow();

      return {
        itens: (itens as unknown as LinhaDaAvaliacao[]).map(comoAvaliacao),
        total: Number(contagem.total),
      };
    },

    async temCanalVerificadoParaAvaliar(chamador: UserId): Promise<boolean> {
      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);
      return canal.rows[0]?.tem_canal === true;
    },

    async gravarMinhaAvaliacao(
      slug: string,
      chamador: UserId,
      entrada: EntradaDaAvaliacao,
      agora: Instant,
    ): Promise<AvaliacaoGravada | 'local-ausente' | 'sem-canal-verificado'> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return 'local-ausente';

      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);
      if (canal.rows[0]?.tem_canal !== true) return 'sem-canal-verificado';

      const quando = comoData(agora);

      const gravada = await sql<{ ref: string; created_at: Date; edited_at: Date | null; criada: boolean }>`
        INSERT INTO professional_reviews
          (id, ref, professional_id, author_user_id, rating, body, created_at, status)
        VALUES
          (${ids.uuidv7()}::uuid, ${novoRef()}, ${idDoLocal}::uuid, ${chamador}::uuid,
           ${entrada.nota}, ${entrada.texto}, ${quando}::timestamptz, 'published')
        ON CONFLICT (professional_id, author_user_id) DO UPDATE SET
          rating            = EXCLUDED.rating,
          body              = EXCLUDED.body,
          edited_at         = ${quando}::timestamptz,
          -- A EDICAO PRESERVA O ESTADO DE MODERACAO, e nao devolve a linha ao
          -- ar. Reeditar nao desfaz uma remocao: se desfizesse, remover seria
          -- inutil, porque bastaria ao autor editar para voltar a aparecer.
          status            = professional_reviews.status,
          moderation_reason = professional_reviews.moderation_reason,
          moderated_at      = professional_reviews.moderated_at
        RETURNING ref, created_at, edited_at, (xmax = 0) AS criada
      `.execute(db);

      const linha = gravada.rows[0];
      if (linha === undefined) throw new Error('avaliacao nao foi gravada');

      const { rows } = await pontuacaoDe(db, idDoLocal);

      const autor = await db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', chamador)
        .executeTakeFirst();

      return {
        avaliacao: {
          ref: linha.ref,
          nota: entrada.nota,
          texto: entrada.texto,
          nomeDeExibicaoDoAutor: autor?.display_name ?? null,
          criadaEm: linha.created_at,
          editadaEm: linha.edited_at,
          minha: true,
        },
        criada: linha.criada,
        pontuacao: comoPontuacao(rows[0]),
      };
    },

    async apagarMinhaAvaliacao(slug: string, chamador: UserId): Promise<boolean> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return false;

      await db
        .deleteFrom('professional_reviews')
        .where('professional_id', '=', idDoLocal)
        .where('author_user_id', '=', chamador)
        .execute();
      return true;
    },

    async denunciarAvaliacao(
      slug: string,
      ref: string,
      chamador: UserId,
      denuncia: { motivo: MotivoDaDenuncia; detalhe: string | null },
      agora: Instant,
    ): Promise<'enfileirada' | 'ausente' | 'propria'> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return 'ausente';

      const alvo = await db
        .selectFrom('professional_reviews')
        .select(['id', 'author_user_id'])
        .where('ref', '=', ref)
        .where('professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL)
        .executeTakeFirst();

      if (alvo === undefined) return 'ausente';
      if (alvo.author_user_id === chamador) return 'propria';

      const quando = comoData(agora);

      await sql`
        INSERT INTO professional_review_reports
          (id, review_id, reporter_user_id, reason, detail, created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${alvo.id}::uuid, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.detalhe},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (review_id, reporter_user_id) DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = professional_review_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'enfileirada';
    },
  };
}
