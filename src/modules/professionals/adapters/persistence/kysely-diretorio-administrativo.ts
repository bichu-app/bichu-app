import { sql } from 'kysely';
import type { Db, DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { TipoDeEntidade, TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type {
  DecisaoDaVerificacao,
  TipoDeEvidencia,
} from '../../domain/nivel-de-verificacao.js';
import type {
  EntradaAdministrativa,
  ImagemDaEntrada,
  ImagemDaGaleriaDaEntrada,
  OrigemDaEntrada,
  StatusDaEntrada,
  TitularidadeDaEntrada,
} from '../../domain/escrita-do-diretorio.js';
import type { RegistroDeImagemDeCatalogo } from '../../../media/ports/imagem-de-catalogo.js';
import {
  SlugOcupado,
  type DiretorioAdministrativoRepository,
  type MudancaDaEntrada,
  type NovaEntrada,
  type Pagina,
  type RecorteDeEntradas,
  type TransacaoDoDiretorio,
} from '../../ports/diretorio-administrativo.js';

export interface DependenciasDoDiretorioAdministrativo {
  readonly db: Db;
  readonly trilha: TrilhaTransacional;
  /** O registro da imagem de catalogo (18/10/2026, com a logo e a foto da entrada). */
  readonly imagens: RegistroDeImagemDeCatalogo;
}

const VIOLACAO_DE_UNICIDADE = '23505';
const INDICE_DA_ENTRADA = 'professionals_slug_unico';

async function comSlugTraduzido<T>(escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    const e = erro as { code?: string; constraint?: string };
    if (e.code === VIOLACAO_DE_UNICIDADE && e.constraint === INDICE_DA_ENTRADA) {
      throw new SlugOcupado();
    }
    throw erro;
  }
}

const EVIDENCIAS_APROVADAS = sql<TipoDeEvidencia[] | null>`(
  select array_agg(v.evidence_kind)
    from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
)`;

interface LinhaDaEntrada {
  entity_kind: TipoDeEntidade;
  slug: string | null;
  kinds: TipoDeProfissional[];
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  phone_e164: string | null;
  site_url: string | null;
  status: StatusDaEntrada;
  source: OrigemDaEntrada;
  claim_status: TitularidadeDaEntrada;
  evidencias: TipoDeEvidencia[] | null;
  logo_status: string | null;
  logo_public_key: string | null;
  logo_rejection_reason: string | null;
  photo_status: string | null;
  photo_public_key: string | null;
  photo_rejection_reason: string | null;
  images: readonly LinhaDaImagemDaGaleria[] | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

interface LinhaDaImagemDaGaleria {
  upload_id: string | null;
  image_id: string;
  position: number | string;
  alt_text: string | null;
  status: string;
  public_key: string | null;
  rejection_reason: string | null;
}

function comoImagem(
  status: string | null,
  publicKey: string | null,
  rejectionReason: string | null,
): ImagemDaEntrada | null {
  if (status === null) return null;
  return {
    status: status as ImagemDaEntrada['status'],
    publicKey,
    rejectionReason,
  };
}

function comoEntrada(l: LinhaDaEntrada): EntradaAdministrativa {
  const aprovadas: DecisaoDaVerificacao = 'approved';
  return {
    slug: l.slug ?? '',
    kinds: l.kinds,
    entityKind: l.entity_kind,
    displayName: l.display_name,
    about: l.about,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    postalCode: l.postal_code,
    street: l.street,
    streetNumber: l.street_number,
    complement: l.complement,
    phoneE164: l.phone_e164,
    siteUrl: l.site_url,
    logo: comoImagem(l.logo_status, l.logo_public_key, l.logo_rejection_reason),
    photo: comoImagem(l.photo_status, l.photo_public_key, l.photo_rejection_reason),
    imagens: (l.images ?? []).map((i) => ({
      uploadId: i.upload_id,
      imageId: i.image_id,
      position: Number(i.position),
      altText: i.alt_text,
      status: i.status as ImagemDaGaleriaDaEntrada['status'],
      publicKey: i.public_key,
      rejectionReason: i.rejection_reason,
    })),
    status: l.status,
    source: l.source,
    claimStatus: l.claim_status,
    verificacoes: (l.evidencias ?? []).map((tipo) => ({ evidenceKind: tipo, decision: aprovadas })),
    publishedAt: l.published_at,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    version: Number(l.version),
  };
}

const COLUNAS = [
  'professionals.slug as slug',
  'professionals.kinds as kinds',
  'professionals.entity_kind as entity_kind',
  'professionals.display_name as display_name',
  'professionals.about as about',
  'professionals.city as city',
  'professionals.state as state',
  'professionals.neighborhood as neighborhood',
  'professionals.postal_code as postal_code',
  'professionals.street as street',
  'professionals.street_number as street_number',
  'professionals.complement as complement',
  'professionals.phone_e164 as phone_e164',
  'professionals.site_url as site_url',
  'professionals.status as status',
  'professionals.source as source',
  'professionals.claim_status as claim_status',
  'professionals.published_at as published_at',
  'professionals.created_at as created_at',
  'professionals.updated_at as updated_at',
  'professionals.version as version',
] as const;

function imagemDa(coluna: 'logo_image_id' | 'photo_image_id', campo: 'status' | 'public_key' | 'rejection_reason') {
  return sql<string | null>`(
  select c.${sql.raw(campo)}
    from catalog_images c
   where c.id = professionals.${sql.raw(coluna)}
)`;
}

const GALERIA_DA_ENTRADA = sql<readonly LinhaDaImagemDaGaleria[] | null>`(
  SELECT json_agg(json_build_object(
           'upload_id', c.upload_intent_id, 'image_id', c.id, 'position', i.position,
           'alt_text', i.alt_text, 'status', c.status, 'public_key', c.public_key,
           'rejection_reason', c.rejection_reason) ORDER BY i.position)
    FROM professional_images i JOIN catalog_images c ON c.id = i.image_id
   WHERE i.professional_id = professionals.id
)`;

function consultaDeEntradas(db: DbExecutor) {
  return db
    .selectFrom('professionals')
    .select([...COLUNAS])
    .select(EVIDENCIAS_APROVADAS.as('evidencias'))
    .select(GALERIA_DA_ENTRADA.as('images'))
    .select(imagemDa('logo_image_id', 'status').as('logo_status'))
    .select(imagemDa('logo_image_id', 'public_key').as('logo_public_key'))
    .select(imagemDa('logo_image_id', 'rejection_reason').as('logo_rejection_reason'))
    .select(imagemDa('photo_image_id', 'status').as('photo_status'))
    .select(imagemDa('photo_image_id', 'public_key').as('photo_public_key'))
    .select(imagemDa('photo_image_id', 'rejection_reason').as('photo_rejection_reason'));
}

function comRecorte<T extends { where: unknown }>(consulta: T, recorte: RecorteDeEntradas): T {
  let c = consulta as unknown as ReturnType<typeof consultaDeEntradas>;
  const busca = recorte.q?.trim();
  if (busca !== undefined && busca !== '') {
    c = c.where(
      sql<boolean>`texto_para_busca(professionals.display_name) LIKE padrao_de_busca(${busca})`,
    );
  }
  if (recorte.kind !== undefined) {
    c = c.where(sql<boolean>`professionals.kinds @> ARRAY[${recorte.kind}]::text[]`);
  }
  if (recorte.status !== undefined) c = c.where('professionals.status', '=', recorte.status);
  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    c = c.where(sql<boolean>`lower(professionals.city) = lower(${cidade})`);
  }
  const uf = recorte.state?.trim();
  if (uf !== undefined && uf !== '') {
    c = c.where(sql<boolean>`upper(professionals.state) = upper(${uf})`);
  }
  return c as unknown as T;
}

/** A transacao do diretorio, a partir de uma transacao do Kysely ja aberta. */
export function criarTransacaoDoDiretorio(
  trx: DbTransaction,
  deps: DependenciasDoDiretorioAdministrativo,
): TransacaoDoDiretorio {
  return transacao(trx, deps);
}

function transacao(trx: DbTransaction, deps: DependenciasDoDiretorioAdministrativo): TransacaoDoDiretorio {
  return {
    async entradaPorSlug(slug: string) {
      const linha = await consultaDeEntradas(trx)
        .where('professionals.slug', '=', slug)
        .forUpdate()
        .executeTakeFirst();
      return linha === undefined ? null : comoEntrada(linha);
    },

    async idPorSlug(slug: string) {
      const linha = await trx
        .selectFrom('professionals')
        .select('id')
        .where('slug', '=', slug)
        .executeTakeFirst();
      return linha?.id ?? null;
    },

    async recarregarEntrada(id: string) {
      const linha = await consultaDeEntradas(trx)
        .where('professionals.id', '=', id)
        .executeTakeFirstOrThrow();
      return comoEntrada(linha);
    },

    async inserirEntrada(nova: NovaEntrada) {
      const agora = new Date(nova.agora);
      await comSlugTraduzido(async () => {
        await trx
          .insertInto('professionals')
          .values({
            id: nova.id,
            slug: nova.slug,
            kinds: [...nova.kinds],
            entity_kind: nova.entityKind ?? 'professional',
            display_name: nova.displayName,
            about: nova.about,
            city: nova.city,
            state: nova.state,
            neighborhood: nova.neighborhood,
            postal_code: nova.postalCode,
            street: nova.street,
            street_number: nova.streetNumber,
            complement: nova.complement,
            phone_e164: nova.phoneE164,
            site_url: nova.siteUrl,
            logo_image_id: nova.logoImageId,
            photo_image_id: nova.photoImageId,
            status: nova.status,
            source: nova.source,
            claim_status: nova.claimStatus,
            ...(nova.gravaMarcoDePublicacao === true ? { published_at: agora } : {}),
            created_at: agora,
            updated_at: agora,
            version: 1,
          })
          .execute();
      });
      const criada = await consultaDeEntradas(trx)
        .where('professionals.id', '=', nova.id)
        .executeTakeFirstOrThrow();
      return comoEntrada(criada);
    },

    async atualizarEntrada(id: string, versaoLida: number, mudanca: MudancaDaEntrada, agora: Instant) {
      const atualizada = await comSlugTraduzido(() =>
        trx
          .updateTable('professionals')
          .set((eb) => ({
            ...(mudanca.slug === undefined ? {} : { slug: mudanca.slug }),
            ...(mudanca.kinds === undefined ? {} : { kinds: [...mudanca.kinds] }),
            ...(mudanca.entityKind === undefined ? {} : { entity_kind: mudanca.entityKind }),
            ...(mudanca.displayName === undefined ? {} : { display_name: mudanca.displayName }),
            ...(mudanca.about === undefined ? {} : { about: mudanca.about }),
            ...(mudanca.city === undefined ? {} : { city: mudanca.city }),
            ...(mudanca.state === undefined ? {} : { state: mudanca.state }),
            ...(mudanca.neighborhood === undefined ? {} : { neighborhood: mudanca.neighborhood }),
            ...(mudanca.postalCode === undefined ? {} : { postal_code: mudanca.postalCode }),
            ...(mudanca.street === undefined ? {} : { street: mudanca.street }),
            ...(mudanca.streetNumber === undefined ? {} : { street_number: mudanca.streetNumber }),
            ...(mudanca.complement === undefined ? {} : { complement: mudanca.complement }),
            ...(mudanca.phoneE164 === undefined ? {} : { phone_e164: mudanca.phoneE164 }),
            ...(mudanca.siteUrl === undefined ? {} : { site_url: mudanca.siteUrl }),
            ...(mudanca.logoImageId === undefined ? {} : { logo_image_id: mudanca.logoImageId }),
            ...(mudanca.photoImageId === undefined ? {} : { photo_image_id: mudanca.photoImageId }),
            ...(mudanca.status === undefined ? {} : { status: mudanca.status }),
            ...(mudanca.gravaMarcoDePublicacao === true ? { published_at: new Date(agora) } : {}),
            updated_at: new Date(agora),
            version: eb('version', '+', 1),
          }))
          .where('id', '=', id)
          .where('version', '=', versaoLida)
          .returning('id')
          .executeTakeFirst(),
      );
      if (atualizada === undefined) return null;
      const linha = await consultaDeEntradas(trx)
        .where('professionals.id', '=', id)
        .executeTakeFirstOrThrow();
      return comoEntrada(linha);
    },

    async removerAvaliacao(ref: string, motivo: string, agora) {
      const linha = await trx
        .updateTable('professional_reviews')
        .set({
          status: 'removed',
          moderation_reason: motivo,
          moderated_at: new Date(agora),
        })
        .where('ref', '=', ref)
        .where('status', '=', 'published')
        .returning(['id', 'rating'])
        .executeTakeFirst();
      return linha === undefined ? null : { id: linha.id, notaAntes: linha.rating };
    },

    envioDeCatalogo: (uploadId) => deps.imagens.envio(trx, uploadId),

    confirmarEnvioDeCatalogo: (entrada) => deps.imagens.confirmar(trx, entrada),

    async entradaDaImagem(imagemId: string) {
      const linha = await trx
        .selectFrom('professionals')
        .select('id')
        .where((eb) =>
          eb.or([eb('logo_image_id', '=', imagemId), eb('photo_image_id', '=', imagemId)]),
        )
        .executeTakeFirst();
      return linha?.id ?? null;
    },

    async substituirImagens(entradaId: string, imagens) {
      await trx
        .deleteFrom('professional_images')
        .where('professional_id', '=', entradaId)
        .execute();
      if (imagens.length === 0) return;
      await trx
        .insertInto('professional_images')
        .values(
          imagens.map((i) => ({
            professional_id: entradaId,
            image_id: i.imageId,
            position: i.position,
            alt_text: i.altText,
          })),
        )
        .execute();
    },

    async entradaDaImagemDaGaleria(imagemId: string) {
      const linha = await trx
        .selectFrom('professional_images')
        .select('professional_id')
        .where('image_id', '=', imagemId)
        .executeTakeFirst();
      return linha?.professional_id ?? null;
    },

    registrarNaTrilha: (evento) => deps.trilha.recordIn(trx, evento),
  };
}

export function criarDiretorioAdministrativoRepository(
  deps: DependenciasDoDiretorioAdministrativo,
): DiretorioAdministrativoRepository {
  const { db } = deps;
  return {
    emTransacao: (trabalho) => db.transaction().execute((trx) => trabalho(transacao(trx, deps))),

    async listarEntradas(recorte: RecorteDeEntradas): Promise<Pagina<EntradaAdministrativa>> {
      const contagem = await comRecorte(
        db.selectFrom('professionals').select((eb) => eb.fn.countAll<string>().as('total')),
        recorte,
      ).executeTakeFirst();

      let pagina = comRecorte(consultaDeEntradas(db), recorte);
      pagina =
        recorte.sort === 'updated'
          ? pagina.orderBy('professionals.updated_at', 'desc').orderBy('professionals.slug', 'asc')
          : pagina.orderBy('professionals.display_name', 'asc').orderBy('professionals.slug', 'asc');

      const linhas = await pagina
        .limit(recorte.limit)
        .offset((recorte.page - 1) * recorte.limit)
        .execute();

      return {
        itens: linhas.map((l) => comoEntrada(l)),
        total: Number(contagem?.total ?? 0),
      };
    },

    async entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null> {
      const linha = await consultaDeEntradas(db)
        .where('professionals.slug', '=', slug)
        .executeTakeFirst();
      return linha === undefined ? null : comoEntrada(linha);
    },
  };
}
