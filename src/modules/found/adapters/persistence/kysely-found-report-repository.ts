import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { AchadoGravado } from '../../domain/registro-de-achado.js';
import type { Especie, Par, Porte, Sexo } from '../../domain/cruzamento.js';
import {
  DISTANCIA_MAXIMA_EM_METROS,
  JANELA_MAXIMA_EM_DIAS,
  TOLERANCIA_DE_ACHADO_ANTES_EM_HORAS,
} from '../../domain/cruzamento.js';
import type {
  AvisoDoAchador,
  Enriquecimento,
  EnriquecimentoDoAchador,
  FoundReportRepository,
  NovaIntencaoDeFotoDoAchado,
  NovaIntencaoDeFotoDoAchadorSemConta,
  NovoAchado,
  Pagina,
} from '../../ports/found-report-repository.js';
import type { CaseId, FoundReportId, Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoAchado {
  id: string;
  origin: 'tag_scan' | 'stray_report';
  status: 'open' | 'matched' | 'closed';
  species: Especie | null;
  size: Porte | null;
  found_city: string | null;
  found_neighborhood: string | null;
  found_at: Date;
  tem_foto: boolean;
  notes: string | null;
  created_at: Date;
  pet_nome: string | null;
  pet_chave_da_foto: string | null;
}

function comoAchado(l: LinhaDoAchado): AchadoGravado {
  return {
    id: l.id,
    origin: l.origin,
    status: l.status,
    especie: l.species,
    porte: l.size,
    cidade: l.found_city,
    bairro: l.found_neighborhood,
    achadoEm: l.found_at,
    temFoto: l.tem_foto,
    observacao: l.notes,
    criadoEm: l.created_at,
    petCorrespondente:
      l.pet_nome === null ? null : { nome: l.pet_nome, chaveDaFoto: l.pet_chave_da_foto },
  };
}

const PET_ALVO = sql`COALESCE(
  found_reports.pet_id,
  (SELECT lc.pet_id FROM lost_cases lc WHERE lc.id = found_reports.case_id)
)`;

const PET_NOME = sql<string | null>`(
  SELECT p.name FROM pets p WHERE p.id = ${PET_ALVO} AND p.deleted_at IS NULL
)`;

const PET_CHAVE_DA_FOTO = sql<string | null>`(
  SELECT f.card_key FROM pet_photos f
   WHERE f.pet_id = ${PET_ALVO}
     AND f.is_primary AND f.status = 'ready' AND f.deleted_at IS NULL
   LIMIT 1
)`;

const COLUNAS = sql<LinhaDoAchado>`
  id, origin, status, species, size,
  found_city, found_neighborhood, found_at,
  (photo_upload_id IS NOT NULL) AS tem_foto,
  notes, created_at,
  ${PET_NOME} AS pet_nome,
  ${PET_CHAVE_DA_FOTO} AS pet_chave_da_foto
`;

/** A leitura de UM achado do relator, como consulta ainda não executada. */
export function construtorDaLeitura(db: DbExecutor, achado: FoundReportId, dono: UserId) {
  return db
    .selectFrom('found_reports')
    .select([
      'id',
      'origin',
      'status',
      'species',
      'size',
      'found_city',
      'found_neighborhood',
      'found_at',
      sql<boolean>`(photo_upload_id IS NOT NULL)`.as('tem_foto'),
      'notes',
      'created_at',
      PET_NOME.as('pet_nome'),
      PET_CHAVE_DA_FOTO.as('pet_chave_da_foto'),
    ])
    .where('id', '=', achado)
    .where('reporter_user_id', '=', dono);
}

/** A lista do relator, paginada por cursor. */
export function construtorDaLista(
  db: DbExecutor,
  dono: UserId,
  limite: number,
  cursor: Date | null,
) {
  let consulta = db
    .selectFrom('found_reports')
    .select([
      'id',
      'origin',
      'status',
      'species',
      'size',
      'found_city',
      'found_neighborhood',
      'found_at',
      sql<boolean>`(photo_upload_id IS NOT NULL)`.as('tem_foto'),
      'notes',
      'created_at',
      PET_NOME.as('pet_nome'),
      PET_CHAVE_DA_FOTO.as('pet_chave_da_foto'),
    ])
    .where('reporter_user_id', '=', dono)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limite + 1);
  if (cursor !== null) consulta = consulta.where('created_at', '<', cursor);
  return consulta;
}

/** O enriquecimento, como consulta ainda não executada. */
export function construtorDoEnriquecimento(
  db: DbExecutor,
  achado: FoundReportId,
  dono: UserId,
  mudanca: Enriquecimento,
  agora: Instant,
) {
  const temCoordenada = typeof mudanca.lat === 'number' && typeof mudanca.lon === 'number';
  return db
    .updateTable('found_reports')
    .set({
      ...(mudanca.observacao === undefined ? {} : { notes: mudanca.observacao }),
      ...(temCoordenada
        ? {
            found_point: sql`ST_SetSRID(ST_MakePoint(${mudanca.lon}, ${mudanca.lat}), 4326)::geography`,
          }
        : {}),
      retention_until: comoData((Number(agora) + JANELA_MAXIMA_EM_DIAS * 86_400_000) as Instant),
    } as never)
    .where('id', '=', achado)
    .where('reporter_user_id', '=', dono)
    .where('status', '<>', 'closed');
}

/** A contagem de intenções de foto de UM aviso do relator. */
export function construtorDaContagemDeFotos(db: DbExecutor, achado: FoundReportId, dono: UserId) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', (join) =>
      join.onRef('found_reports.id', '=', 'upload_intents.found_report_id'),
    )
    .leftJoin('pets', 'pets.id', 'found_reports.pet_id')
    .select(({ fn }) => fn.countAll<number>().as('total'))
    .where('found_reports.id', '=', achado)
    .where((eb) =>
      eb.or([
        eb('found_reports.reporter_user_id', '=', dono),
        eb('pets.owner_user_id', '=', dono),
      ]),
    );
}

/** O AVISO, para quem pode ANEXAR FOTO A ELE: o relator **ou** o tutor do pet. */
export function construtorDoAvisoParaFoto(
  db: DbExecutor,
  achado: FoundReportId,
  chamador: UserId,
) {
  return db
    .selectFrom('found_reports')
    .leftJoin('pets', 'pets.id', 'found_reports.pet_id')
    .select([
      'found_reports.id',
      'found_reports.origin',
      'found_reports.status',
      'found_reports.species',
      'found_reports.size',
      'found_reports.found_city',
      'found_reports.found_neighborhood',
      'found_reports.found_at',
      sql<boolean>`(found_reports.photo_upload_id IS NOT NULL)`.as('tem_foto'),
      'found_reports.notes',
      'found_reports.created_at',
      PET_NOME.as('pet_nome'),
      PET_CHAVE_DA_FOTO.as('pet_chave_da_foto'),
    ])
    .where('found_reports.id', '=', achado)
    .where((eb) =>
      eb.or([
        eb('found_reports.reporter_user_id', '=', chamador),
        eb('pets.owner_user_id', '=', chamador),
      ]),
    );
}

interface LinhaDoAvisoDoAchador {
  id: string;
  status: 'open' | 'matched' | 'closed';
  found_at: Date;
  tem_foto: boolean;
  tem_ponto: boolean;
  notes: string | null;
  pet_name: string | null;
  finder_token_hash: Buffer | null;
}

/** A leitura do aviso pelo token. */
export function construtorDoAvisoDoAchador(db: DbExecutor, resumo: Uint8Array) {
  return db
    .selectFrom('found_reports')
    .leftJoin('pets', 'pets.id', 'found_reports.pet_id')
    .select([
      'found_reports.id',
      'found_reports.status',
      'found_reports.found_at',
      sql<boolean>`(found_reports.photo_upload_id IS NOT NULL)`.as('tem_foto'),
      sql<boolean>`(found_reports.found_point IS NOT NULL)`.as('tem_ponto'),
      'found_reports.notes',
      'pets.name as pet_name',
      'found_reports.finder_token_hash',
    ])
    .where('found_reports.finder_token_hash', '=', Buffer.from(resumo))
    .where('found_reports.origin', '=', 'tag_scan');
}

/** O "Contar mais" do achador. */
export function construtorDoEnriquecimentoDoAchador(
  db: DbExecutor,
  resumo: Uint8Array,
  mudanca: EnriquecimentoDoAchador,
) {
  const temCoordenada = typeof mudanca.lat === 'number' && typeof mudanca.lon === 'number';
  return db
    .updateTable('found_reports')
    .set({
      ...(temCoordenada
        ? {
            found_point: sql`ST_SetSRID(ST_MakePoint(${mudanca.lon}, ${mudanca.lat}), 4326)::geography`,
          }
        : {}),
      ...(mudanca.nome === undefined ? {} : { finder_display_name: mudanca.nome }),
      ...(mudanca.email === undefined ? {} : { finder_email: mudanca.email }),
      ...(mudanca.fotoUploadId === undefined ? {} : { photo_upload_id: mudanca.fotoUploadId }),
    } as never)
    .where('finder_token_hash', '=', Buffer.from(resumo))
    .where('origin', '=', 'tag_scan')
    .where('status', '<>', 'closed');
}

/** O upload da referência, e só se ele pertence ao aviso DESTE token. */
export function construtorDaIntencaoPelaReferencia(
  db: DbExecutor,
  resumo: Uint8Array,
  uploadRef: string,
) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', 'found_reports.id', 'upload_intents.found_report_id')
    .select('upload_intents.id')
    .where('upload_intents.upload_ref', '=', uploadRef)
    .where('upload_intents.kind', '=', 'finder_photo')
    .where('found_reports.finder_token_hash', '=', Buffer.from(resumo));
}

/** O teto vitalício de três fotos por aviso (SEC-009), contado pelo aviso do token. */
export function construtorDaContagemDeFotosDoAchador(db: DbExecutor, resumo: Uint8Array) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', 'found_reports.id', 'upload_intents.found_report_id')
    .select(({ fn }) => fn.countAll<number>().as('total'))
    .where('found_reports.finder_token_hash', '=', Buffer.from(resumo));
}

function comoAvisoDoAchador(linha: LinhaDoAvisoDoAchador): AvisoDoAchador | undefined {
  if (linha.finder_token_hash === null) return undefined;
  return {
    id: linha.id as FoundReportId,
    status: linha.status,
    achadoEm: linha.found_at,
    temFoto: linha.tem_foto,
    temPonto: linha.tem_ponto,
    recado: linha.notes,
    nomeDoPet: linha.pet_name,
    resumoDoToken: new Uint8Array(linha.finder_token_hash),
  };
}

export function criarFoundReportRepository(db: Db): FoundReportRepository {
  return {
    async casoAbertoPorShareToken(token: string): Promise<CaseId | null> {
      const linha = await db
        .selectFrom('lost_cases')
        .innerJoin('pets', 'pets.id', 'lost_cases.pet_id')
        .select('lost_cases.id as id')
        .where('lost_cases.share_token', '=', token)
        .where('lost_cases.status', '=', 'open')
        .where('pets.deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? null : (linha.id as CaseId);
    },

    async criar(novo: NovoAchado): Promise<AchadoGravado> {
      const ponto =
        novo.lat === undefined || novo.lon === undefined
          ? sql`NULL`
          : sql`ST_SetSRID(ST_MakePoint(${novo.lon}, ${novo.lat}), 4326)::geography`;

      const r = await sql<LinhaDoAchado>`
        INSERT INTO found_reports (
          id, origin, reporter_user_id, case_id,
          species, size, sex, breed_code, breed_free_text, ref_data_version,
          primary_color_code, found_at, found_point,
          found_city, found_neighborhood, found_state,
          notes, status, retention_until
        ) VALUES (
          ${novo.id}, 'stray_report', ${novo.reporterUserId}, ${novo.caseId},
          ${novo.especie}, ${novo.porte}, ${novo.sexo}, ${novo.racaCodigo},
          ${novo.racaTextoLivre}, ${novo.versaoDosDadosDeReferencia},
          ${novo.corPrimariaCodigo}, ${comoData(novo.achadoEm)}, ${ponto},
          ${novo.cidade}, ${novo.bairro}, ${novo.uf},
          ${novo.observacao}, 'open', ${comoData(novo.retencaoAte)}
        )
        RETURNING ${COLUNAS}
      `.execute(db);

      const linha = r.rows[0];
      if (linha === undefined) {
        throw new Error('O INSERT do achado não devolveu linha, o que só acontece se ele não inseriu.');
      }
      return comoAchado(linha);
    },

    async buscarDoRelator(achado: FoundReportId, dono: UserId): Promise<AchadoGravado | null> {
      const linha = (await construtorDaLeitura(db, achado, dono).executeTakeFirst()) as
        | LinhaDoAchado
        | undefined;
      return linha === undefined ? null : comoAchado(linha);
    },

    async avisoParaAnexarFoto(
      achado: FoundReportId,
      chamador: UserId,
    ): Promise<AchadoGravado | null> {
      const linha = (await construtorDoAvisoParaFoto(db, achado, chamador).executeTakeFirst()) as
        | LinhaDoAchado
        | undefined;
      return linha === undefined ? null : comoAchado(linha);
    },

    async statusDoRelator(achado: FoundReportId, dono: UserId) {
      const linha = (await construtorDaLeitura(db, achado, dono).executeTakeFirst()) as
        | LinhaDoAchado
        | undefined;
      return linha === undefined ? null : linha.status;
    },

    async listarDoRelator(
      dono: UserId,
      limite: number,
      cursor: string | null,
    ): Promise<Pagina<AchadoGravado>> {
      const linhas = (await construtorDaLista(
        db,
        dono,
        limite,
        decodificarCursor(cursor),
      ).execute()) as LinhaDoAchado[];

      const temMais = linhas.length > limite;
      const pagina = temMais ? linhas.slice(0, limite) : linhas;
      const ultima = pagina[pagina.length - 1];
      return {
        itens: pagina.map(comoAchado),
        proximoCursor: temMais && ultima !== undefined ? codificarCursor(ultima.created_at) : null,
      };
    },

    async enriquecer(achado, dono, mudanca, agora): Promise<AchadoGravado | null> {
      const resultado = await construtorDoEnriquecimento(db, achado, dono, mudanca, agora)
        .returning([
          'id',
          'origin',
          'status',
          'species',
          'size',
          'found_city',
          'found_neighborhood',
          'found_at',
          sql<boolean>`(photo_upload_id IS NOT NULL)`.as('tem_foto'),
          'notes',
          'created_at',
          PET_NOME.as('pet_nome'),
          PET_CHAVE_DA_FOTO.as('pet_chave_da_foto'),
        ])
        .executeTakeFirst();
      return resultado === undefined ? null : comoAchado(resultado);
    },

    async contarIntencoesDeFoto(achado: FoundReportId, dono: UserId): Promise<number> {
      const linha = await construtorDaContagemDeFotos(db, achado, dono).executeTakeFirst();
      return Number(linha?.total ?? 0);
    },

    async registrarIntencaoDeFoto(nova: NovaIntencaoDeFotoDoAchado): Promise<void> {
      await db
        .insertInto('upload_intents')
        .values({
          id: nova.id,
          user_id: nova.userId,
          pet_id: null,
          found_report_id: nova.foundReportId,
          kind: 'found_report_photo',
          object_key: nova.objectKey,
          declared_type: nova.declaredType,
          max_bytes: nova.maxBytes,
          expires_at: nova.expiresAt,
          confirmed_at: null,
        })
        .execute();
    },

    async avisoPeloTokenDoAchador(resumo): Promise<AvisoDoAchador | undefined> {
      const linha = await construtorDoAvisoDoAchador(db, resumo).executeTakeFirst();
      return linha === undefined ? undefined : comoAvisoDoAchador(linha);
    },

    async enriquecerPeloTokenDoAchador(resumo, mudanca): Promise<AvisoDoAchador | undefined> {
      const resultado = await construtorDoEnriquecimentoDoAchador(db, resumo, mudanca).executeTakeFirst();
      if (Number(resultado.numUpdatedRows) === 0) return undefined;
      const linha = await construtorDoAvisoDoAchador(db, resumo).executeTakeFirst();
      return linha === undefined ? undefined : comoAvisoDoAchador(linha);
    },

    async intencaoDeFotoDoAchadorPelaReferencia(resumo, uploadRef): Promise<string | undefined> {
      const linha = await construtorDaIntencaoPelaReferencia(db, resumo, uploadRef).executeTakeFirst();
      return linha?.id;
    },

    async contarIntencoesDeFotoPeloTokenDoAchador(resumo): Promise<number> {
      const linha = await construtorDaContagemDeFotosDoAchador(db, resumo).executeTakeFirst();
      return Number(linha?.total ?? 0);
    },

    async registrarIntencaoDeFotoDoAchadorSemConta(
      nova: NovaIntencaoDeFotoDoAchadorSemConta,
    ): Promise<void> {
      await db
        .insertInto('upload_intents')
        .values({
          id: nova.id,
          user_id: null,
          pet_id: null,
          found_report_id: nova.foundReportId,
          kind: 'finder_photo',
          object_key: nova.objectKey,
          declared_type: nova.declaredType,
          max_bytes: nova.maxBytes,
          expires_at: nova.expiresAt,
          confirmed_at: null,
          upload_ref: nova.uploadRef,
        })
        .execute();
    },

    async paresParaCruzar(achado: FoundReportId): Promise<readonly Par[]> {
      const linhas = await sql<{
        case_id: string;
        caso_species: Especie;
        caso_size: Porte | null;
        caso_color: string | null;
        caso_breed: string | null;
        caso_sex: Sexo | null;
        caso_last_seen: Date;
        caso_city: string | null;
        caso_tem_ponto: boolean;
        achado_species: Especie;
        achado_size: Porte | null;
        achado_color: string | null;
        achado_breed: string | null;
        achado_sex: Sexo | null;
        achado_found_at: Date;
        achado_city: string | null;
        achado_tem_ponto: boolean;
        distancia_m: number | null;
        ja_rejeitado: boolean;
      }>`
        SELECT
          c.id                              AS case_id,
          p.species_code                    AS caso_species,
          p.size_code                       AS caso_size,
          p.primary_color_code              AS caso_color,
          p.breed_code                      AS caso_breed,
          p.sex                             AS caso_sex,
          c.last_seen_at                    AS caso_last_seen,
          c.last_seen_city                  AS caso_city,
          (c.last_seen_point IS NOT NULL)   AS caso_tem_ponto,
          f.species                         AS achado_species,
          f.size                            AS achado_size,
          f.primary_color_code              AS achado_color,
          f.breed_code                      AS achado_breed,
          f.sex                             AS achado_sex,
          f.found_at                        AS achado_found_at,
          f.found_city                      AS achado_city,
          (f.found_point IS NOT NULL)       AS achado_tem_ponto,
          -- A distancia E DO PAR, e quem a mede e o Postgres: ST_Distance
          -- sobre geography responde em metros no elipsoide, e acerta em
          -- Manaus e em Porto Alegre sem ninguem escolher zona nenhuma. Sai
          -- nula quando algum dos dois lados nao tem ponto, que e o caso em que
          -- a secao 4.10 manda redistribuir o peso da proximidade.
          -- (Sem crase neste bloco: ele vive num template literal.)
          CASE
            WHEN f.found_point IS NOT NULL AND c.last_seen_point IS NOT NULL
            THEN ROUND(ST_Distance(f.found_point, c.last_seen_point))::int
          END                               AS distancia_m,
          EXISTS (
            SELECT 1 FROM match_candidates m
             WHERE m.case_id = c.id AND m.found_report_id = f.id
               AND m.status = 'rejected'
          )                                 AS ja_rejeitado
        FROM found_reports f
        JOIN lost_cases c ON c.status = 'open'
        JOIN pets p ON p.id = c.pet_id AND p.deleted_at IS NULL
        WHERE f.id = ${achado}
          -- Filtro 1: especie. Eliminatorio, e e ele que o indice
          -- found_reports_abertos_por_especie serve do outro lado.
          AND p.species_code = f.species
          -- Filtros 2 e 3: a janela de tempo.
          AND f.found_at >= c.last_seen_at - ${`${String(TOLERANCIA_DE_ACHADO_ANTES_EM_HORAS)} hours`}::interval
          AND f.found_at <= c.last_seen_at + ${`${String(JANELA_MAXIMA_EM_DIAS)} days`}::interval
          -- Filtro 4: distancia, e SO quando os dois lados tem coordenada.
          -- ST_DWithin e nao ST_Distance <= x: e a forma que usa o indice.
          AND (
            f.found_point IS NULL
            OR c.last_seen_point IS NULL
            OR ST_DWithin(f.found_point, c.last_seen_point, ${DISTANCIA_MAXIMA_EM_METROS})
          )
      `.execute(db);

      return linhas.rows.map((l) => ({
        caso: {
          caseId: l.case_id as CaseId,
          especie: l.caso_species,
          porte: l.caso_size,
          corPrimaria: l.caso_color,
          racaCodigo: l.caso_breed,
          sexo: l.caso_sex,
          desaparecidoEm: l.caso_last_seen.getTime(),
          cidade: l.caso_city,
          temCoordenada: l.caso_tem_ponto,
        },
        achado: {
          foundReportId: achado,
          especie: l.achado_species,
          porte: l.achado_size,
          corPrimaria: l.achado_color,
          racaCodigo: l.achado_breed,
          sexo: l.achado_sex,
          achadoEm: l.achado_found_at.getTime(),
          cidade: l.achado_city,
          temCoordenada: l.achado_tem_ponto,
          distanciaEmMetros: l.distancia_m === null ? null : Number(l.distancia_m),
          jaRejeitadoPorHumano: l.ja_rejeitado,
        },
      }));
    },

    async sugerirCorrespondencias(sugestoes): Promise<number> {
      if (sugestoes.length === 0) return 0;

      let gravadas = 0;
      for (const s of sugestoes) {
        const r = await sql`
          INSERT INTO match_candidates (
            id, case_id, found_report_id, score, matched_attributes,
            distance_m, link_origin, strategy_version, status
          ) VALUES (
            gen_random_uuid(), ${s.caseId}, ${s.foundReportId}, ${s.score},
            ${JSON.stringify(s.atributosQuePontuaram)}::jsonb,
            ${s.distanciaEmMetros},
            ${s.linkOrigin},
            ${s.versaoDaEstrategia}, 'suggested'
          )
          -- Reprocessar nao duplica (secao 4.10). E o UPDATE so alcanca o que
          -- AINDA esta em suggested: recalcular atualiza o score de quem
          -- ninguem olhou e NAO TOCA no que ja foi decidido. Sem o predicado,
          -- um recalculo desfaria a rejeicao de uma pessoa.
          -- (Sem crase neste bloco: ele vive num template literal.)
          ON CONFLICT (case_id, found_report_id) DO UPDATE
            SET score = EXCLUDED.score,
                matched_attributes = EXCLUDED.matched_attributes,
                distance_m = EXCLUDED.distance_m,
                strategy_version = EXCLUDED.strategy_version
            WHERE match_candidates.status = 'suggested'
        `.execute(db);
        gravadas += Number(r.numAffectedRows ?? 0n);
      }
      return gravadas;
    },
  };
}

function codificarCursor(criadoEm: Date): string {
  return Buffer.from(String(criadoEm.getTime()), 'utf8').toString('base64url');
}

function decodificarCursor(cursor: string | null): Date | null {
  if (cursor === null || cursor === '') return null;
  const texto = Buffer.from(cursor, 'base64url').toString('utf8');
  const ms = Number(texto);
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  return new Date(ms);
}
