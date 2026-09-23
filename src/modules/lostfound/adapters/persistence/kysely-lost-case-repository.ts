/**
 * Persistência do caso de perdido.
 *
 * Três pontos que não são detalhe de implementação:
 *
 * **A autorização mora na cláusula `WHERE`.** Toda leitura e toda escrita
 * carregam `owner_user_id = :dono`; a consulta que devolveria o caso de outro
 * tutor não existe neste arquivo. Caso alheio responde 404, e aqui isso vale
 * duas vezes: um 403 confirmaria que aquele pet está perdido.
 *
 * **A abertura pode perder uma corrida, e isso é tratado, não evitado.** O
 * índice único parcial `lost_cases_um_aberto_por_pet` é quem garante um caso
 * aberto por pet. Conferir antes e inserir depois deixaria a janela aberta
 * entre as duas operações — e a fila offline do app reenvia exatamente assim,
 * em rajada, quando o sinal volta. O `ON CONFLICT DO NOTHING` transforma a
 * corrida perdida em `null`, que o serviço lê como "já existe".
 *
 * **O ponto entra por SQL e nunca sai.** `ST_MakePoint` grava; nenhuma leitura
 * deste arquivo seleciona `last_seen_point`. O que sai é `has_location`, um
 * booleano — a coordenada não tem por que atravessar a aplicação, e o jeito mais
 * barato de garantir que ela não vaze é ela não estar disponível.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { rotuloDaArea } from '../../domain/abertura-do-caso.js';
import type {
  CanalDoReencontro,
  CandidatoDecidido,
  CasoGravado,
  DecisaoDoCandidato,
  DecisaoSobreCandidato,
  DesfechoDoCaso,
  EstadoDoPetParaAbertura,
  EstadoDoPetParaPrevia,
  LostCaseRepository,
  NovoCaso,
  StatusDoCaso,
} from '../../ports/lost-case-repository.js';
import type { CaseId, FoundReportId, PetId, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoCaso {
  id: string;
  pet_id: string;
  status: StatusDoCaso;
  last_seen_at: Date;
  tem_ponto: boolean;
  last_seen_city: string | null;
  last_seen_neighborhood: string | null;
  description: string | null;
  share_token: string;
  share_to_public_list: boolean;
  opened_at: Date;
  closed_at: Date | null;
  closure_outcome: DesfechoDoCaso | null;
  closure_channel: CanalDoReencontro | null;
  closure_note: string | null;
}

function comoCaso(l: LinhaDoCaso): CasoGravado {
  return {
    id: l.id as CaseId,
    petId: l.pet_id as PetId,
    status: l.status,
    lastSeenAt: l.last_seen_at,
    hasLocation: l.tem_ponto,
    areaLabel: rotuloDaArea({
      city: l.last_seen_city ?? undefined,
      neighborhood: l.last_seen_neighborhood ?? undefined,
    }),
    description: l.description,
    shareToken: l.share_token,
    shareToPublicList: l.share_to_public_list,
    openedAt: l.opened_at,
    closedAt: l.closed_at,
    closureOutcome: l.closure_outcome,
    closureChannel: l.closure_channel,
    closureNote: l.closure_note,
  };
}

/**
 * As colunas da leitura do dono.
 *
 * `last_seen_point` **não está aqui**, e a ausência é a regra: o que sai é
 * `tem_ponto`, um booleano calculado no banco. A coordenada fica onde foi
 * gravada.
 */
const COLUNAS = sql<LinhaDoCaso>`
  id, pet_id, status, last_seen_at,
  (last_seen_point IS NOT NULL) AS tem_ponto,
  last_seen_city, last_seen_neighborhood, description,
  share_token, share_to_public_list, opened_at,
  closed_at, closure_outcome, closure_channel, closure_note
`;

export function criarLostCaseRepository(db: Db): LostCaseRepository {
  return {
    async estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura> {
      // UMA consulta para as cinco perguntas. Quem está do outro lado tem 11%
      // de bateria e um animal desaparecido; cinco idas ao banco aqui é latência
      // que dá para não gastar.
      const linha = await sql<{
        existe: boolean;
        tem_foto_pronta: boolean;
        pet_ja_perdido: boolean;
        abertos_da_conta: number;
        tem_canal: boolean;
      }>`
        SELECT
          EXISTS (
            SELECT 1 FROM pets p
             WHERE p.id = ${pet} AND p.owner_user_id = ${dono} AND p.deleted_at IS NULL
          ) AS existe,
          EXISTS (
            SELECT 1 FROM pet_photos f
             WHERE f.pet_id = ${pet} AND f.status = 'ready' AND f.deleted_at IS NULL
          ) AS tem_foto_pronta,
          EXISTS (
            SELECT 1 FROM lost_cases c WHERE c.pet_id = ${pet} AND c.status = 'open'
          ) AS pet_ja_perdido,
          (
            SELECT count(*) FROM lost_cases c
             WHERE c.owner_user_id = ${dono} AND c.status = 'open'
          )::int AS abertos_da_conta,
          -- E-mail OU telefone. Preenchido e não verificado não conta: contato
          -- não verificado é contato que não sabemos se alcança alguém.
          EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = ${dono}
               AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL)
          ) AS tem_canal
      `.execute(db);

      const r = linha.rows[0]!;
      return {
        existeEhDoTutor: r.existe,
        temFotoPronta: r.tem_foto_pronta,
        petJaTemCasoAberto: r.pet_ja_perdido,
        casosAbertosDaConta: Number(r.abertos_da_conta),
        temCanalVerificado: r.tem_canal,
      };
    },

    async estadoParaPrevia(pet: PetId, dono: UserId): Promise<EstadoDoPetParaPrevia> {
      // As cinco perguntas da abertura mais a área de referência do tutor, numa
      // consulta só e pelo mesmo motivo: o toque que dispara esta rota é o toque
      // ANTES de "Avisar agora", e a pessoa está esperando na tela.
      //
      // **A autorização está na cláusula WHERE, e não num `if` depois.** O
      // `EXISTS` de `existe` carrega `owner_user_id = ${dono}`; tirá-lo daqui
      // para conferir o dono no serviço faria a consulta passar a responder
      // sobre pet alheio, que é exatamente o arranjo que o ADR-0021 elimina.
      const linha = await sql<{
        existe: boolean;
        tem_foto_pronta: boolean;
        pet_ja_perdido: boolean;
        abertos_da_conta: number;
        tem_canal: boolean;
        ref_city: string | null;
        ref_neighborhood: string | null;
      }>`
        SELECT
          EXISTS (
            SELECT 1 FROM pets p
             WHERE p.id = ${pet} AND p.owner_user_id = ${dono} AND p.deleted_at IS NULL
          ) AS existe,
          EXISTS (
            SELECT 1 FROM pet_photos f
             WHERE f.pet_id = ${pet} AND f.status = 'ready' AND f.deleted_at IS NULL
          ) AS tem_foto_pronta,
          EXISTS (
            SELECT 1 FROM lost_cases c WHERE c.pet_id = ${pet} AND c.status = 'open'
          ) AS pet_ja_perdido,
          (
            SELECT count(*) FROM lost_cases c
             WHERE c.owner_user_id = ${dono} AND c.status = 'open'
          )::int AS abertos_da_conta,
          EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = ${dono}
               AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL)
          ) AS tem_canal,
          -- A area de referencia do PROPRIO chamador, em texto. Nada aqui
          -- atravessa contas, e nada aqui enumera os outros pets dele: a
          -- contagem de casos abertos e um numero, e numero nao agrupa
          -- (ADR-0010, item 7). Ela tambem nao sai na resposta.
          (SELECT u.reference_city FROM users u WHERE u.id = ${dono}) AS ref_city,
          (SELECT u.reference_neighborhood FROM users u WHERE u.id = ${dono}) AS ref_neighborhood
      `.execute(db);

      const r = linha.rows[0]!;
      return {
        existeEhDoTutor: r.existe,
        temFotoPronta: r.tem_foto_pronta,
        petJaTemCasoAberto: r.pet_ja_perdido,
        casosAbertosDaConta: Number(r.abertos_da_conta),
        temCanalVerificado: r.tem_canal,
        areaDeReferenciaDoTutor: {
          city: r.ref_city ?? undefined,
          neighborhood: r.ref_neighborhood ?? undefined,
        },
      };
    },

    async abrir(novo: NovoCaso): Promise<CasoGravado | null> {
      const ponto =
        novo.lat === undefined || novo.lon === undefined
          ? sql`NULL`
          : sql`ST_SetSRID(ST_MakePoint(${novo.lon}, ${novo.lat}), 4326)::geography`;

      // `ON CONFLICT DO NOTHING` sobre o índice parcial: a corrida perdida sai
      // como zero linhas, e não como exceção. Exceção aqui viraria 500 para um
      // caso que o produto sabe explicar.
      const r = await sql<LinhaDoCaso>`
        INSERT INTO lost_cases (
          id, pet_id, owner_user_id, last_seen_at, last_seen_point,
          last_seen_city, last_seen_neighborhood, last_seen_state,
          description, share_to_public_list, share_token
        ) VALUES (
          ${novo.id}, ${novo.petId}, ${novo.ownerUserId}, ${new Date(Number(novo.lastSeenAt))}, ${ponto},
          ${novo.city ?? null}, ${novo.neighborhood ?? null}, ${novo.state ?? null},
          ${novo.description ?? null}, ${novo.shareToPublicList}, ${novo.shareToken}
        )
        ON CONFLICT DO NOTHING
        RETURNING ${COLUNAS}
      `.execute(db);

      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null> {
      const r = await sql<LinhaDoCaso>`
        SELECT ${COLUNAS} FROM lost_cases
         WHERE id = ${caso} AND owner_user_id = ${dono}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async encerrar(entrada): Promise<CasoGravado | null> {
      // `status = 'open'` no `WHERE` e não num `if` antes: encerrar duas vezes é
      // o que a fila offline produz, e o segundo encerramento sobrescreveria o
      // desfecho do primeiro — trocando "reencontrado" por "não encontrado" na
      // métrica que mede o produto.
      const r = await sql<LinhaDoCaso>`
        UPDATE lost_cases
           SET status = ${`closed_${entrada.desfecho}`},
               closed_at = ${new Date(Number(entrada.agora))},
               closure_outcome = ${entrada.desfecho},
               closure_channel = ${entrada.canal ?? null},
               closure_note = ${entrada.nota ?? null},
               -- 7 DIAS, e nao 30. O comentario que estava aqui defendia 30 com
               -- um argumento razoavel -- o animal que "voltou" e sumiu de novo
               -- na mesma semana e caso comum. So que o contrato promete 7
               -- (openapi.yaml: "Encerrar e reversivel por 7 dias", e o 410 de
               -- reopenLostCase diz "Passou dos 7 dias"), a tela promete 7, e a
               -- historia BICHUS-78 se chama "Reabrir o caso por 7 dias".
               --
               -- O banco guardando 30 nao e ser generoso: e a tela dizer uma
               -- coisa e o sistema fazer outra, nos dois sentidos. Quem leu
               -- "7 dias" e perdeu o prazo nao tenta no oitavo, e a generosidade
               -- nao serve para ninguem; quem tentasse no vigesimo receberia um
               -- 410 que o banco nao sustenta. Numero de produto se muda na
               -- historia, com quem promete, nao num comentario de adaptador.
               --
               -- (Sem crase neste bloco de proposito: ele vive dentro de um
               -- template literal, e uma crase aqui fecha a string.)
               reopen_deadline = ${new Date(Number(entrada.agora) + 7 * 24 * 3600 * 1000)}
         WHERE id = ${entrada.caso}
           AND owner_user_id = ${entrada.dono}
           AND status = 'open'
        RETURNING ${COLUNAS}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async decidirCandidato(entrada): Promise<CandidatoDecidido | null> {
      const linha = await construtorDaDecisaoDoCandidato(db, entrada).executeTakeFirst();
      return linha === undefined ? null : comoCandidato(linha);
    },

    async candidatoDecididoDoTutor(caso, candidato, dono): Promise<CandidatoDecidido | null> {
      const linha = await construtorDoCandidatoDecidido(
        db,
        caso,
        candidato,
        dono,
      ).executeTakeFirst();
      return linha === undefined ? null : comoCandidato(linha);
    },
  };
}

// ----------------------------------------------------------------------
// A decisão humana sobre um candidato (BICHUS-86, critérios 4, 5 e 12)
// ----------------------------------------------------------------------

/** As colunas do achado que viajam junto do candidato. */
const COLUNAS_DO_ACHADO = [
  'found_reports.id as achado_id',
  'found_reports.origin as achado_origin',
  'found_reports.status as achado_status',
  'found_reports.species as achado_species',
  'found_reports.size as achado_size',
  'found_reports.found_city as achado_city',
  'found_reports.found_neighborhood as achado_neighborhood',
  'found_reports.found_at as achado_found_at',
  'found_reports.notes as achado_notes',
  'found_reports.created_at as achado_created_at',
] as const;

const COLUNAS_DO_CANDIDATO = [
  'match_candidates.id',
  'match_candidates.case_id',
  'match_candidates.found_report_id',
  'match_candidates.score',
  'match_candidates.matched_attributes',
  'match_candidates.distance_m',
  'match_candidates.link_origin',
  'match_candidates.strategy_version',
  'match_candidates.status',
  'match_candidates.created_at',
] as const;

interface LinhaDoCandidato {
  id: string;
  case_id: string;
  found_report_id: string;
  score: string;
  matched_attributes: Record<string, number> | string;
  distance_m: number | null;
  link_origin: 'attribute_match' | 'share_token';
  strategy_version: string;
  status: 'suggested' | 'confirmed' | 'rejected';
  created_at: Date;
  pet_id: string;
  pet_name: string;
  relator_user_id: string | null;
  achado_id: string;
  achado_origin: 'tag_scan' | 'stray_report';
  achado_status: 'open' | 'matched' | 'closed';
  achado_species: string | null;
  achado_size: string | null;
  achado_city: string | null;
  achado_neighborhood: string | null;
  achado_found_at: Date;
  achado_notes: string | null;
  achado_created_at: Date;
}

/**
 * `matched_attributes` é `jsonb` e o driver pode entregá-lo como objeto ou como
 * texto. O contrato declara `matched_attributes` como **lista de strings**: o
 * que vai para a tela é *o que bateu*, e não quanto cada coisa pesou. O peso é
 * a metade do `score`, e o critério 2 da BICHUS-86 tira o `score` da tela.
 */
function atributosQuePontuaram(bruto: Record<string, number> | string): readonly string[] {
  const objeto = typeof bruto === 'string' ? (JSON.parse(bruto) as Record<string, number>) : bruto;
  return Object.keys(objeto).filter((chave) => (objeto[chave] ?? 0) > 0);
}

function comoCandidato(l: LinhaDoCandidato): CandidatoDecidido {
  return {
    id: l.id,
    caseId: l.case_id as CaseId,
    foundReportId: l.found_report_id as FoundReportId,
    petId: l.pet_id as PetId,
    nomeDoPet: l.pet_name,
    relatorUserId: l.relator_user_id === null ? null : (l.relator_user_id as UserId),
    score: Number(l.score),
    atributosQuePontuaram: atributosQuePontuaram(l.matched_attributes),
    distanciaEmMetros: l.distance_m === null ? null : Number(l.distance_m),
    linkOrigin: l.link_origin,
    versaoDaEstrategia: l.strategy_version,
    // O `WHERE` da escrita já recusou tudo que não sai de `suggested`, então a
    // linha devolvida nunca está em `suggested`. O estreitamento é asserção, e
    // não conveniência: `DecisaoDoCandidato` não tem o terceiro valor.
    status: l.status as DecisaoDoCandidato,
    criadoEm: l.created_at,
    achado: {
      id: l.achado_id as FoundReportId,
      origin: l.achado_origin,
      status: l.achado_status,
      especie: l.achado_species,
      porte: l.achado_size,
      cidade: l.achado_city,
      bairro: l.achado_neighborhood,
      achadoEm: l.achado_found_at,
      observacao: l.achado_notes,
      criadoEm: l.achado_created_at,
    },
  };
}

/**
 * A escrita da decisão, como consulta ainda não executada.
 *
 * ## A autorização é `lost_cases.owner_user_id = :dono`, e ela está AQUI
 *
 * Não num `if` antes, e não no banco. A migração
 * `20260922000003_achado-avulso-e-correspondencia.sql` escreve na prosa que
 * *"quem decide é o tutor"*, mas o CHECK que ela cria
 * (`match_candidates_decisao_tem_autor`) cobra apenas **uma pessoa e um
 * instante** — qualquer `users.id` o satisfaz. Medido contra o Postgres: sem o
 * predicado abaixo, uma terceira conta decide a correspondência do caso de
 * outra pessoa e o banco aprova.
 *
 * `match_candidates` não tem coluna de dono, e por desenho: o dono do candidato
 * é o dono do CASO. Por isso a autorização entra por `from('lost_cases')` com a
 * correlação `lost_cases.id = match_candidates.case_id` — sem essa correlação o
 * mesmo SQL, com o mesmo dono ligado, passaria a perguntar *"esta conta tem
 * algum caso?"*, que é a armadilha do produto cartesiano.
 *
 * ## Os outros três predicados
 *
 * - **`match_candidates.case_id = :caso`**: o `candidateId` sozinho já é único,
 *   e o `caseId` do caminho é filtro **a mais**, nunca no lugar do dono. Sem
 *   ele, um candidato de outro caso do mesmo tutor seria decidido pelo endereço
 *   errado, e a trilha registraria a decisão no caso errado.
 * - **`match_candidates.status = 'suggested'`**: está no `WHERE` e não num `if`
 *   antes porque duas confirmações simultâneas — que é o que a fila offline
 *   produz quando o sinal volta — passariam as duas pela conferência antes de
 *   qualquer uma gravar. E é ele que faz *"rejeitado não volta"* (seção 4.10)
 *   ser uma propriedade da escrita, e não uma promessa.
 * - **`lost_cases.status = 'open'`**: decidir correspondência de caso encerrado
 *   abriria conversa sobre um caso que acabou.
 */
export function construtorDaDecisaoDoCandidato(
  db: DbExecutor,
  entrada: DecisaoSobreCandidato,
) {
  return db
    .updateTable('match_candidates')
    .from(['lost_cases', 'found_reports', 'pets'])
    .set({
      status: entrada.decisao,
      decided_by_user_id: entrada.dono,
      decided_at: new Date(Number(entrada.agora)),
    })
    .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
    .whereRef('found_reports.id', '=', 'match_candidates.found_report_id')
    .whereRef('pets.id', '=', 'lost_cases.pet_id')
    .where('pets.deleted_at', 'is', null)
    .where('match_candidates.id', '=', entrada.candidato)
    .where('match_candidates.case_id', '=', entrada.caso)
    .where('match_candidates.status', '=', 'suggested')
    .where('lost_cases.owner_user_id', '=', entrada.dono)
    .where('lost_cases.status', '=', 'open')
    .returning([
      ...COLUNAS_DO_CANDIDATO,
      'lost_cases.pet_id as pet_id',
      'pets.name as pet_name',
      'found_reports.reporter_user_id as relator_user_id',
      ...COLUNAS_DO_ACHADO,
    ]);
}

/**
 * A leitura do candidato JÁ DECIDIDO, com o mesmo predicado do dono.
 *
 * Ela existe para o reenvio da fila offline (critério 7) e **não** relaxa nada:
 * a autorização é a mesma cláusula, na mesma posição lógica. O que muda é só o
 * predicado de status, que aqui é o complementar.
 */
export function construtorDoCandidatoDecidido(
  db: DbExecutor,
  caso: CaseId,
  candidato: string,
  dono: UserId,
) {
  return db
    .selectFrom('match_candidates')
    .innerJoin('lost_cases', (join) =>
      join.onRef('lost_cases.id', '=', 'match_candidates.case_id'),
    )
    .innerJoin('found_reports', (join) =>
      join.onRef('found_reports.id', '=', 'match_candidates.found_report_id'),
    )
    .innerJoin('pets', (join) => join.onRef('pets.id', '=', 'lost_cases.pet_id'))
    .select([
      ...COLUNAS_DO_CANDIDATO,
      'lost_cases.pet_id as pet_id',
      'pets.name as pet_name',
      'found_reports.reporter_user_id as relator_user_id',
      ...COLUNAS_DO_ACHADO,
    ])
    .where('match_candidates.id', '=', candidato)
    .where('match_candidates.case_id', '=', caso)
    .where('match_candidates.status', '<>', 'suggested')
    .where('lost_cases.owner_user_id', '=', dono);
}
