/**
 * Persistencia da escrita administrativa do diretorio de `Perto` (BICHUS-189).
 *
 * ## A versao lida mora na clausula `WHERE`
 *
 * `UPDATE professionals SET ..., version = version + 1 WHERE id = $1 AND
 * version = $2 RETURNING id`. Zero linhas quer dizer que outra pessoa salvou
 * depois da leitura, e o caso de uso responde 412 sem ter gravado nada. Ler,
 * comparar e gravar em tres passos deixaria dois administradores passarem juntos
 * pela comparacao.
 *
 * ## A busca por nome usa as funcoes DO BANCO, e nao pode usar outra coisa
 *
 * `texto_para_busca` e `padrao_de_busca` sao da migracao `20260928000006`, e o
 * lado esquerdo da comparacao precisa ser a MESMA expressao do indice GIN,
 * caractere a caractere, ou o planejador nao casa os dois e o indice fica de
 * enfeite. `padrao_de_busca` tambem neutraliza `%`, `_` e `\` do termo, sem o
 * que `q=%` devolve a tabela inteira numa varredura completa.
 *
 * ## O QUE ESTE ARQUIVO NAO ESCREVE, E CADA AUSENCIA E ESTRUTURAL
 *
 * - **`geo`.** A coluna e `ColumnType<never, never, never>` no esquema tipado:
 *   o construtor nem a oferece. Decisao 9.4 pendente.
 * - **`verification_level`.** Derivada de `entity_verifications`, e nenhuma
 *   escrita de perfil a toca (`COMMENT` da migracao de 21/09).
 * - **`cnpj`, `crmv_number`, `crmv_uf`.** Decisao de produto: o painel nao pede
 *   documento. As colunas continuam existindo.
 * - **A coluna de quem convidou a entidade.** Ela nao esta em
 *   `ProfessionalsTable` (ver o comentario la) e o portao
 *   `portao-colunas-que-nao-saem` varre todo `.ts` de `src/` pelo nome literal
 *   dela. O construtor tipado nao pode nem oferece-la.
 * - **`claimed_by_user_id` e `claimed_at`.** A entrada do painel nasce sem
 *   titular (`claim_status = 'unclaimed'`), e o `CHECK
 *   professionals_titularidade_tem_marco` exige justamente que os dois fiquem
 *   nulos nesse caso.
 *
 * ## A trilha e da porta de `audit`, e nao daqui
 *
 * `registrarNaTrilha` delega a `TrilhaTransacional.recordIn(trx, evento)`: o
 * evento e gravado NA transacao da escrita, e a falha dele desfaz a escrita.
 * Este adaptador nao conhece o papel `bichu_audit_writer` nem o esquema
 * `audit`.
 */
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
  /**
   * O registro da imagem de catalogo (18/10/2026, com a logo e a foto da
   * entrada). **A MESMA porta que a `Loja` e a `Rede` injetam**: nao ha segunda
   * esteira de imagem neste produto, e por isso nao ha segunda porta.
   */
  readonly imagens: RegistroDeImagemDeCatalogo;
}

/** `23505`, `unique_violation`, no indice de endereco publico do diretorio. */
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

/**
 * As provas APROVADAS da entidade, como subconsulta agregada.
 *
 * `entity_kind = 'professional'` vai junto de `entity_id`: a tabela e
 * polimorfica de proposito e nao tem chave estrangeira, entao o tipo faz parte
 * da chave. Sem ele, uma verificacao de organizacao com o mesmo UUID passaria a
 * valer como prova de um profissional. Copiada de
 * `kysely-directory-repository.ts`, porque e a mesma pergunta.
 */
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
  /**
   * A GALERIA (29/10/2026), como o `json_agg` da subconsulta a devolve, ja
   * ordenada por `position`. **Nula quando a entrada nao tem imagem**: um
   * `json_agg` sobre zero linhas devolve `NULL` e nao `[]`, e e por isso que
   * `comoEntrada` abre com `?? []` em vez de confiar no tipo.
   */
  images: readonly LinhaDaImagemDaGaleria[] | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

/** Uma linha da galeria como o `json_build_object` da subconsulta a monta. */
interface LinhaDaImagemDaGaleria {
  upload_id: string | null;
  image_id: string;
  position: number | string;
  alt_text: string | null;
  status: string;
  public_key: string | null;
  rejection_reason: string | null;
}

/**
 * A imagem, ou `null` quando a entrada nao tem.
 *
 * `status` nulo e o unico sinal de ausencia: nao existe linha de
 * `catalog_images` com `status` nulo (a coluna e `NOT NULL`), entao nulo aqui
 * so pode vir da subconsulta que nao achou nada.
 */
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
    // O painel endereca por `slug`, e toda entrada que ele cria tem um. A massa
    // de qa pode ter linha sem: `''` nunca acontece na pratica, e assumir
    // `slug` nao-nulo no tipo faria `missing_to_publish` nao ter como acusar a
    // falta. A string vazia e o que a projecao le como "sem endereco".
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
    // `?? []` porque `json_agg` sobre zero linhas devolve NULL, e nao `[]`.
    // `Number(position)` porque o `json_build_object` pode devolver o
    // `smallint` como texto dependendo do driver -- a mesma conversao que
    // `kysely-rede-administrativa.ts` faz, e pelo mesmo motivo.
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
    // Toda evidencia que chega aqui ja passou pelo `decision = 'approved'` da
    // subconsulta. O campo e repetido porque o dominio nao acredita na
    // consulta: `nivelDerivado` filtra de novo.
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
  // O endereco de rua (migracao `20261018000001`). Ele e selecionado AQUI, na
  // consulta do painel, e nao na do aplicativo: a do aplicativo esta em
  // `kysely-directory-repository.ts` e nao nomeia nenhuma destas quatro.
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

/**
 * O estado da LOGO e da FOTO, por subconsulta e nao por `JOIN` (18/10/2026).
 *
 * Subconsulta porque `entradaPorSlug` usa `FOR UPDATE`, e `FOR UPDATE` com
 * `JOIN` travaria tambem a linha de `catalog_images` -- o que faria uma
 * correcao de telefone na entrada esperar pelo worker que esta marcando a
 * imagem pronta. `FOR UPDATE` nao alcanca subconsulta, que e o mesmo motivo
 * pelo qual `EVIDENCIAS_APROVADAS` e subconsulta.
 *
 * `status` vem como `null` quando nao ha imagem, e e isso que `comoEntrada` le
 * como "sem logo".
 */
function imagemDa(coluna: 'logo_image_id' | 'photo_image_id', campo: 'status' | 'public_key' | 'rejection_reason') {
  return sql<string | null>`(
  select c.${sql.raw(campo)}
    from catalog_images c
   where c.id = professionals.${sql.raw(coluna)}
)`;
}

/**
 * A GALERIA, por subconsulta (29/10/2026) -- e nao por `JOIN`, pelas DUAS
 * razoes de `imagemDa` somadas a uma terceira que so vale aqui.
 *
 * 1. `entradaPorSlug` usa `FOR UPDATE`, e `FOR UPDATE` com `JOIN` travaria
 *    tambem as linhas de `catalog_images`. `FOR UPDATE` nao alcanca
 *    subconsulta.
 * 2. Um `JOIN` para uma relacao 1:N multiplicaria a linha da entrada por oito,
 *    e a listagem paginada passaria a contar imagens em vez de entradas.
 * 3. **A ordem mora aqui.** `ORDER BY i.position` dentro do `json_agg` e o
 *    UNICO lugar que decide a ordem da galeria: a projecao do dominio nao
 *    reordena, de proposito, porque duas definicoes de "a ordem" divergem no
 *    dia em que uma delas mudar.
 *
 * `upload_id` sai de `catalog_images.upload_intent_id`, que e `ON DELETE SET
 * NULL`: nulo quer dizer que a conta que enviou foi apagada e a imagem ficou --
 * o contrato ja declara `[string, 'null']` em `AdminCatalogGalleryImage`.
 *
 * Sem acento grave nesta prosa: ela mora dentro de um template literal de
 * TypeScript, e o acento grave o encerraria no meio.
 */
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

/**
 * O recorte da listagem do painel.
 *
 * **Sem `status = 'published'`**, e e essa a diferenca da listagem publica: quem
 * administra precisa achar o rascunho que ainda nao esta no ar. A entrada
 * `removed` tambem aparece, porque retirar nao apaga e o operador precisa poder
 * encontrar o que retirou.
 */
function comRecorte<T extends { where: unknown }>(consulta: T, recorte: RecorteDeEntradas): T {
  let c = consulta as unknown as ReturnType<typeof consultaDeEntradas>;
  const busca = recorte.q?.trim();
  if (busca !== undefined && busca !== '') {
    c = c.where(
      sql<boolean>`texto_para_busca(professionals.display_name) LIKE padrao_de_busca(${busca})`,
    );
  }
  // PERTINENCIA, nunca desdobramento -- a mesma regra, a mesma forma e o mesmo
  // motivo do filtro da listagem do app (ver `construtorDaListagem` em
  // `kysely-directory-repository.ts`, que tem o raciocinio por extenso):
  // `unnest` com `SELECT` direto faria a entrada de tres atividades sair tres
  // vezes nesta pagina e a contagem contar tres, e `@>` em vez de `= ANY` e o
  // que deixa o GIN ser usado.
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

/**
 * A transacao do diretorio, a partir de uma transacao do Kysely ja aberta.
 *
 * **Exportada de proposito, e nao por organizacao de arquivo**: a aprovacao da
 * fila de indicacoes (`kysely-fila-de-indicacoes.ts`) precisa gravar a entrada
 * do diretorio na MESMA transacao em que marca a indicacao aprovada, e ela faz
 * isso chamando `inserirEntrada` daqui. Uma segunda escrita de entrada seria a
 * segunda definicao de como uma entrada nasce -- `status`, `source`,
 * `claim_status`, `version` e os dois carimbos --, e e isso que o ADR-0023
 * secao 2 proibe. Quem compoe as duas transacoes e o adaptador da fila; este
 * arquivo continua sem saber que a fila existe.
 */
export function criarTransacaoDoDiretorio(
  trx: DbTransaction,
  deps: DependenciasDoDiretorioAdministrativo,
): TransacaoDoDiretorio {
  return transacao(trx, deps);
}

function transacao(trx: DbTransaction, deps: DependenciasDoDiretorioAdministrativo): TransacaoDoDiretorio {
  return {
    async entradaPorSlug(slug: string) {
      // `FOR UPDATE` trava SO `professionals`, e nao por escolha de clausula:
      // a unica tabela do `FROM` e ela. A subconsulta de evidencias vive na
      // lista de selecao, e `FOR UPDATE` nao alcanca subconsulta -- se
      // alcancasse, uma correcao de telefone bloquearia a fila de moderacao.
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
      // Sem `FOR UPDATE`: a transacao que chama esta leitura ja escreveu a
      // linha e portanto ja a tem travada. Pedir a trava de novo nao
      // acrescenta garantia e faria a releitura esperar por uma trava que e
      // dela mesma.
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
            // Ausente vale `professional`, o mesmo `DEFAULT` da coluna. Escrito
            // aqui, e nao deixado para o banco, para que o aceite da indicacao
            // da comunidade -- que nao coleta tipo de entidade -- grave o mesmo
            // valor que o painel grava.
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
            // `published_at` nulo porque a entrada nasce rascunho, e
            // `claimed_at`/`claimed_by_user_id` ficam de fora: o `CHECK`
            // `professionals_titularidade_tem_marco` exige que os dois sejam
            // nulos quando `claim_status = 'unclaimed'`.
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
            // `null` TIRA o ponteiro da imagem e nao apaga objeto no balde.
            ...(mudanca.logoImageId === undefined ? {} : { logo_image_id: mudanca.logoImageId }),
            ...(mudanca.photoImageId === undefined ? {} : { photo_image_id: mudanca.photoImageId }),
            ...(mudanca.status === undefined ? {} : { status: mudanca.status }),
            // So na transicao PARA publicado. Uma correcao de telefone numa
            // entrada ja publicada nao mexe no marco: ele responde "desde
            // quando esta no ar", e nao "quando alguem mexeu".
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
      // EXCLUSAO LOGICA e numa consulta so: `status`, o motivo e o instante
      // juntos, porque o `CHECK professional_reviews_moderacao_tem_motivo`
      // recusa a linha em que `status <> 'published'` sem motivo. Duas
      // atualizacoes separadas nao passariam pelo primeiro `UPDATE`.
      //
      // `status = 'published'` no `WHERE` torna a operacao IDEMPOTENTE no que
      // importa: remover duas vezes nao reescreve o motivo da primeira, e a
      // segunda chamada devolve `null` -> 404. O motivo original e de quem
      // auditar, e sobrescreve-lo apagaria a decisao que de fato tirou a
      // avaliacao do ar.
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
      // Duas colunas, uma consulta: os dois indices parciais unicos da migracao
      // `20261018000008` impedem a mesma imagem de estar em duas entradas, e
      // esta leitura e o que transforma a recusa num `400` com nome de campo em
      // vez de num erro de banco chegando na borda.
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
      // Apagar e inserir: a galeria e substituida inteira, e a unicidade de
      // posicao e DIFERIDA (`professional_images_ordem_unica`), entao a ordem
      // nova so e conferida no COMMIT. Copiado de `substituirImagens` da
      // `Rede`, que resolveu o mesmo problema do mesmo jeito.
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
      // `professional_images.image_id` e UNIQUE GLOBAL: esta leitura e o que
      // transforma a recusa num `400` com nome de campo em vez de deixar a
      // violacao de unicidade chegar na borda como `500`.
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
      // `updated` poe a ultima alteracao em cima; `name` e a ordem alfabetica.
      // O segundo criterio e sempre `slug`, para a pagina 2 nao repetir nem
      // perder linha quando duas entradas empatam no primeiro.
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
