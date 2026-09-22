/**
 * Persistência do achado avulso, em PostGIS.
 *
 * ## A autorização está na cláusula `WHERE`, e em lugar nenhum além dela
 *
 * ADR-0021. Toda consulta daqui que toca o achado de alguém traz
 * `reporter_user_id = :dono`, e nenhuma delas lê a linha para depois comparar o
 * dono num `if`. A diferença entre as duas formas aparece no dia em que alguém
 * esquece o `if`: a consulta sem `WHERE` devolve o relato de outra pessoa — e um
 * achado carrega onde um animal foi visto, com data e hora.
 *
 * `construtorD*` existe para que essa afirmação seja **verificável** em vez de
 * combinada. `autorizacao-na-clausula-where.test.ts` compila o SQL destas
 * funções, lê a posição `$n` que o predicado do dono ocupa, confere o valor
 * ligado **àquela posição** e carrega a isca que precisa reprovar.
 *
 * ## O ponto entra e sai por SQL, e a coluna nunca é selecionada crua
 *
 * `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography` grava. **A ordem é
 * (lon, lat)** — `ST_MakePoint` recebe X antes de Y, e trocar os dois é o erro
 * clássico do PostGIS: ele não falha, ele grava o Brasil no meio da Somália.
 *
 * Nenhuma leitura deste arquivo seleciona `found_point`. O que sai é
 * `tem_ponto`, um booleano calculado no banco, e — só dentro do cruzamento —
 * `ST_Distance`, que é um número de metros e não uma posição. A coordenada não
 * tem por que atravessar a aplicação, e o jeito mais barato de garantir que ela
 * não vaze é ela não estar disponível.
 *
 * **Nada aqui transforma coordenada em endereço nem o contrário** (ADR-0006).
 * O que este arquivo devolve de lugar é `found_city` e `found_neighborhood`, o
 * texto que a pessoa digitou; quem os junta em "Bairro, Cidade" é `rotuloDaArea`,
 * de `lostfound`, na borda.
 */
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
  Enriquecimento,
  FoundReportRepository,
  NovaIntencaoDeFotoDoAchado,
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
  };
}

/**
 * As colunas da leitura do relator.
 *
 * `found_point` **não está aqui**, e a ausência é a regra: o que sai é
 * `tem_ponto` quando alguém precisa dele, e nesta lista nem isso — o contrato de
 * `FoundReport` não declara nenhum campo que dependa de ter coordenada.
 */
const COLUNAS = sql<LinhaDoAchado>`
  id, origin, status, species, size,
  found_city, found_neighborhood, found_at,
  (photo_upload_id IS NOT NULL) AS tem_foto,
  notes, created_at
`;

/**
 * A leitura de UM achado do relator, como consulta ainda não executada.
 *
 * O predicado do dono e o do identificador vão juntos, e é por isso que o achado
 * de outra conta responde 404 em vez de 403: a consulta que o encontraria não
 * existe. O ADR-0021 não diz "não devolva a linha do outro"; ele diz onde a
 * decisão mora.
 */
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
    ])
    .where('id', '=', achado)
    .where('reporter_user_id', '=', dono);
}

/**
 * A lista do relator, paginada por cursor.
 *
 * O cursor é o `created_at` do último item, em milissegundos — e não um `OFFSET`.
 * `OFFSET` relê e descarta tudo que veio antes, e desloca a página inteira
 * quando uma linha nova entra no topo entre duas chamadas, que é exatamente o
 * que acontece numa lista ordenada por criação decrescente.
 *
 * O teto de linhas é do chamador e é imposto pelo serviço (`limiteDaPagina`): um
 * `limit` que chegasse do cliente sem teto é coleção sem paginação com mais
 * passos.
 */
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
    ])
    .where('reporter_user_id', '=', dono)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    // Uma linha a mais do que o pedido: é o que diz se existe próxima página sem
    // uma segunda consulta de contagem. A linha extra não sai na resposta.
    .limit(limite + 1);
  if (cursor !== null) consulta = consulta.where('created_at', '<', cursor);
  return consulta;
}

/**
 * O enriquecimento, como consulta ainda não executada.
 *
 * Três predicados no `WHERE`, e os três são regra e não zelo:
 *
 * - `id` e `reporter_user_id` são a autorização por propriedade que o contrato
 *   descreve ("autorizada por propriedade, não por posse de token");
 * - `status <> 'closed'` está aqui e **não** num `if` antes: encerrar e
 *   enriquecer podem chegar ao mesmo tempo, e conferir antes de escrever deixa a
 *   janela entre as duas operações aberta. O contrato declara 410 para o caso já
 *   encerrado, e quem descobre que foi isso que aconteceu é o serviço, olhando o
 *   status **depois** de a escrita não ter pegado.
 */
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
      // Toca a retenção para frente: quem complementa o aviso está dizendo que
      // ele ainda vale. Sem isto, um achado enriquecido no 29º dia sumiria no
      // 30º com a informação nova dentro.
      retention_until: comoData((Number(agora) + JANELA_MAXIMA_EM_DIAS * 86_400_000) as Instant),
    } as never)
    .where('id', '=', achado)
    .where('reporter_user_id', '=', dono)
    .where('status', '<>', 'closed');
}

/**
 * A contagem de intenções de foto de UM aviso do relator. Teto vitalício (SEC-009).
 *
 * ## Por que ela tem um `JOIN` e uma correlação, e não dois predicados soltos
 *
 * A forma óbvia seria `WHERE found_report_id = :achado AND user_id = :dono`, e
 * ela responde a pergunta errada de um jeito que passa despercebido: `user_id`
 * em `upload_intents` é **quem pediu a intenção**, não quem é dono do aviso. Os
 * dois coincidem hoje porque só o relator consegue pedir — mas isso é uma
 * garantia que mora em OUTRA consulta (`construtorDaLeitura`, chamada antes), e
 * uma autorização que depende de outra chamada ter acontecido é a autorização
 * num `if`, com mais passos.
 *
 * Com o `JOIN` e o `whereRef`, a pergunta vira a certa e vira sozinha: *"quantas
 * intenções existem PARA ESTE AVISO, sendo este aviso DESTA CONTA"*. Sem a
 * correlação `upload_intents.found_report_id = found_reports.id`, o mesmo SQL
 * com o mesmo dono ligado passaria a perguntar *"esta conta tem algum aviso?"* —
 * e a contagem responderia sobre o conjunto errado sem nenhum predicado faltando
 * no texto.
 */
export function construtorDaContagemDeFotos(db: DbExecutor, achado: FoundReportId, dono: UserId) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', (join) =>
      join.onRef('found_reports.id', '=', 'upload_intents.found_report_id'),
    )
    .select(({ fn }) => fn.countAll<number>().as('total'))
    .where('found_reports.id', '=', achado)
    .where('found_reports.reporter_user_id', '=', dono);
}

export function criarFoundReportRepository(db: Db): FoundReportRepository {
  return {
    async casoAbertoPorShareToken(token: string): Promise<CaseId | null> {
      // `status = 'open'` no `WHERE`: um token de caso encerrado não vincula
      // nada, e o achado da pessoa continua valendo como achado avulso.
      //
      // Esta consulta NÃO leva dono, e a ausência é o desenho: o `share_token` é
      // a única chave do caso em superfície pública, e quem chega por ele é o
      // vizinho que recebeu o push — uma pessoa qualquer, de propósito. O que
      // ela devolve é um identificador de caso e nada mais: nenhum dado do pet,
      // nenhum dado do tutor, nenhuma indicação de que o token existe (o serviço
      // trata `null` como "sem vínculo", não como erro).
      const linha = await db
        .selectFrom('lost_cases')
        .select('id')
        .where('share_token', '=', token)
        .where('status', '=', 'open')
        .executeTakeFirst();
      return linha === undefined ? null : (linha.id as CaseId);
    },

    async criar(novo: NovoAchado): Promise<AchadoGravado> {
      // SQL cru e não o construtor tipado: `geography` não é um tipo que o
      // modelo do Kysely represente, e a coluna é declarada em `schema.ts` como
      // não selecionável e não inserível de propósito — o único caminho para ela
      // é este, onde `ST_MakePoint` está à vista de quem revisa.
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

    async paresParaCruzar(achado: FoundReportId): Promise<readonly Par[]> {
      // O filtro grosseiro roda NO BANCO, porque é lá que estão o índice GiST e
      // `ST_Distance`. Trazer todos os casos abertos para pontuar em memória
      // seria a varredura que o índice existe para evitar, no caminho mais caro
      // do produto.
      //
      // Os filtros de espécie, de janela de tempo e de distância são repetidos
      // no domínio (`excluir`), e a repetição é deliberada: aqui eles são
      // desempenho, lá eles são a regra. O dia em que os dois divergirem, quem
      // decide é o domínio — ele só recebe menos linhas para decidir sobre.
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

      // **`status` NÃO é parâmetro.** Ele é o literal `'suggested'`, escrito
      // aqui, e `decided_by_user_id`/`decided_at` ficam de fora do INSERT —
      // nenhuma chamada a esta função consegue gravar uma correspondência
      // confirmada. O banco cobra o mesmo por CHECK; são duas camadas, e a
      // segunda existe porque a primeira some num refatoramento.
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

/**
 * O cursor, que é o instante do último item em base64url.
 *
 * Opaco de propósito: um cursor legível vira contrato acidental, e o cliente que
 * o construir à mão trava a paginação no formato de hoje.
 */
function codificarCursor(criadoEm: Date): string {
  return Buffer.from(String(criadoEm.getTime()), 'utf8').toString('base64url');
}

function decodificarCursor(cursor: string | null): Date | null {
  if (cursor === null || cursor === '') return null;
  const texto = Buffer.from(cursor, 'base64url').toString('utf8');
  const ms = Number(texto);
  // Cursor ilegível vira "primeira página", e não erro. Ele é opaco: o cliente
  // não tem como saber que o adulterou, e devolver 400 aqui transformaria um
  // valor guardado de uma versão anterior do app numa tela quebrada.
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  return new Date(ms);
}
