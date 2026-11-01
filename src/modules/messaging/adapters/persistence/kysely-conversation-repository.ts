import { sql, type RawBuilder } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import { JANELA_DE_AGRUPAMENTO_EM_MS } from '../../../tags/ports/tag-repository.js';
import type { Papel } from '../../domain/conversa-mediada.js';
import type { MotivoDeRetencao } from '../../domain/retencao-para-revisao.js';
import type {
  AberturaPorAviso,
  ConversaDoAchador,
  ConversaDoChamador,
  ConversationRepository,
  MensagemGravada,
  MotivoDeEncerramento,
  NovaDenuncia,
  NovaMensagem,
  Pagina,
  PaginaDaLista,
  PaginaDoAchador,
  EspecieDoSistema,
} from '../../ports/conversation-repository.js';
import type {
  CaseId,
  ConversationId,
  FoundReportId,
  Instant,
  UserId,
} from '../../../../shared/types/brands.js';

interface LinhaDaConversa {
  id: string;
  found_report_id: string;
  finder_user_id: string | null;
  case_id: string | null;
  pet_display_name: string;
  opened_at: Date;
  papel_do_chamador: string;
  closed_at: Date | null;
  closure_reason: MotivoDeEncerramento | null;
  blocked_at: Date | null;
  case_status: string | null;
  tutor_display_name: string | null;
  finder_display_name: string | null;
  tutor_deleted_at: Date | null;
  achador_deleted_at: Date | null;
  nao_lida: boolean;
  corpo_da_ultima: string | null;
  ultima_mensagem_em: Date | null;
  apelido_do_outro: string | null;
  chave_da_foto_do_outro: string | null;
}

interface LinhaDaMensagem {
  id: string;
  sender_role: Papel;
  body: string;
  redactions: unknown;
  photo_object_key: string | null;
  created_at: Date;
}

function comoConversa(linha: LinhaDaConversa): ConversaDoChamador {
  return {
    id: linha.id as ConversationId,
    foundReportId: linha.found_report_id as FoundReportId,
    caseId: linha.case_id === null ? null : (linha.case_id as CaseId),
    petDisplayName: linha.pet_display_name,
    abertaEm: linha.opened_at,
    papelDoChamador: linha.papel_do_chamador === 'tutor' ? 'tutor' : 'finder',
    encerradaEm: linha.closed_at,
    motivoDoEncerramento: linha.closure_reason,
    bloqueadaEm: linha.blocked_at,
    casoEncerrado: linha.case_status !== null && linha.case_status !== 'open',
    nomeDoTutor: linha.tutor_display_name,
    nomeDoAchador: linha.finder_display_name,
    achadorTemConta: linha.finder_user_id !== null,
    tutorDesabilitado: linha.tutor_deleted_at !== null,
    achadorDesabilitado: linha.achador_deleted_at !== null,
    naoLida: linha.nao_lida,
    corpoDaUltima: linha.corpo_da_ultima,
    ultimaMensagemEm: linha.ultima_mensagem_em,
    apelidoDoOutro: linha.apelido_do_outro,
    chaveDaFotoDoOutro: linha.chave_da_foto_do_outro,
  };
}

function comoMensagem(linha: LinhaDaMensagem): MensagemGravada {
  return {
    id: linha.id,
    senderRole: linha.sender_role,
    body: linha.body,
    redactions: Array.isArray(linha.redactions) ? linha.redactions : [],
    photoObjectKey: linha.photo_object_key,
    createdAt: linha.created_at,
  };
}

const ULTIMA_MENSAGEM = (coluna: 'body' | 'created_at') => sql`(
        SELECT msg.${sql.raw(coluna)} FROM conversation_messages msg
        WHERE msg.conversation_id = conversations.id
        ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
      )`;

const CHAVE_DA_ORDEM = sql`coalesce(${ULTIMA_MENSAGEM('created_at')}, conversations.opened_at)`;

function comoLike(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const CONTA_DO_OUTRO_LADO = (chamador: UserId) => sql`(CASE
        WHEN conversations.tutor_user_id = ${chamador}
        THEN conversations.finder_user_id
        ELSE conversations.tutor_user_id
      END)`;

const CONEXAO_ACEITA_ENTRE = (chamador: UserId, outro: RawBuilder<unknown>) =>
  sql<boolean>`EXISTS (
        SELECT 1 FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND ((uc.requester_user_id = ${chamador}::uuid AND uc.addressee_user_id = ${outro})
             OR (uc.requester_user_id = ${outro} AND uc.addressee_user_id = ${chamador}::uuid))
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))
      AND NOT bloqueio_entre(${chamador}::uuid, ${outro})`;

/** A leitura comum às duas rotas de conversa, com o chamador no `WHERE`. */
export function construtorDaLeituraDoChamador(db: Db, chamador: UserId) {
  return db
    .selectFrom('conversations')
    .innerJoin('pets', 'pets.id', 'conversations.pet_id')
    .innerJoin('users as tutor', 'tutor.id', 'conversations.tutor_user_id')
    .innerJoin('found_reports', 'found_reports.id', 'conversations.found_report_id')
    .leftJoin('lost_cases', 'lost_cases.id', 'conversations.case_id')
    .leftJoin('users as achador', 'achador.id', 'conversations.finder_user_id')
    .leftJoin('conversation_reads as leitura', (join) =>
      join.on((eb) =>
        eb.and([
          eb('leitura.conversation_id', '=', eb.ref('conversations.id')),
          eb.or([
            eb.and([
              eb('leitura.role', '=', 'tutor'),
              eb('conversations.tutor_user_id', '=', chamador),
            ]),
            eb.and([
              eb('leitura.role', '=', 'finder'),
              eb('conversations.finder_user_id', '=', chamador),
            ]),
          ]),
        ]),
      ),
    )
    .select((eb) => [
      'conversations.id',
      'conversations.found_report_id',
      'conversations.case_id',
      'pets.name as pet_display_name',
      'conversations.opened_at',
      'conversations.closed_at',
      'conversations.closure_reason',
      'conversations.blocked_at',
      'lost_cases.status as case_status',
      'tutor.display_name as tutor_display_name',
      sql<string | null>`coalesce("found_reports"."finder_display_name", "achador"."display_name")`.as(
        'finder_display_name',
      ),
      'tutor.deleted_at as tutor_deleted_at',
      'achador.deleted_at as achador_deleted_at',
      'conversations.finder_user_id',
      eb
        .case()
        .when('conversations.tutor_user_id', '=', chamador)
        .then('tutor')
        .else('finder')
        .end()
        .as('papel_do_chamador'),
      sql<boolean>`EXISTS (
        SELECT 1 FROM conversation_messages msg
        WHERE msg.conversation_id = conversations.id
          AND msg.sender_role <> (CASE WHEN conversations.tutor_user_id = ${chamador}
                                       THEN 'tutor' ELSE 'finder' END)
          AND (leitura.last_read_at IS NULL OR msg.created_at > leitura.last_read_at)
      )`.as('nao_lida'),
      sql<string | null>`${ULTIMA_MENSAGEM('body')}`.as('corpo_da_ultima'),
      sql<Date | null>`${ULTIMA_MENSAGEM('created_at')}`.as('ultima_mensagem_em'),
      sql<string | null>`(
        SELECT h.handle FROM handles h
         WHERE h.user_id = ${CONTA_DO_OUTRO_LADO(chamador)}
           AND h.kind = 'pessoa'
           AND ${CONEXAO_ACEITA_ENTRE(chamador, sql`h.user_id`)}
      )`.as('apelido_do_outro'),
      sql<string | null>`(
        SELECT foto.thumb_key FROM users outro
         INNER JOIN catalog_images foto ON foto.id = outro.photo_image_id
         WHERE outro.id = ${CONTA_DO_OUTRO_LADO(chamador)}
           AND foto.purpose = 'user_photo'
           AND foto.status = 'ready'
           AND foto.thumb_key IS NOT NULL
           AND ${CONEXAO_ACEITA_ENTRE(chamador, sql`outro.id`)}
      )`.as('chave_da_foto_do_outro'),
    ])
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    )
    .where('conversations.moderation_removed_at', 'is', null);
}

/** `GET /v1/conversations`. */
export function construtorDaListaDoChamador(db: Db, chamador: UserId, pagina: PaginaDaLista) {
  let base = construtorDaLeituraDoChamador(db, chamador)
    .orderBy(CHAVE_DA_ORDEM, 'desc')
    .orderBy('conversations.id', 'desc')
    .limit(pagina.limit);
  const termo = pagina.termo;
  if (termo !== undefined && termo !== '') base = base.where(recorteDoTermo(termo));
  const depois = pagina.depoisDe;
  if (depois === undefined) return base;
  return base.where(
    sql<boolean>`(${CHAVE_DA_ORDEM}, conversations.id) < (${depois.criadaEm}, ${depois.id})`,
  );
}

/** `ConversationPage.total`: quantas conversas o recorte tem, sem `limit`. */
export function construtorDaContagemDoChamador(
  db: Db,
  chamador: UserId,
  termo: string | undefined,
) {
  const base = construtorDaLeituraDoChamador(db, chamador);
  const comTermo =
    termo === undefined || termo === '' ? base : base.where(recorteDoTermo(termo));
  return comTermo.clearSelect().clearOrderBy().select(sql<number | string>`count(*)`.as('n'));
}

function recorteDoTermo(termo: string) {
  const alvo = comoLike(termo);
  return sql<boolean>`(
    "pets"."name" ILIKE ${alvo}
    OR "tutor"."display_name" ILIKE ${alvo}
    OR coalesce("found_reports"."finder_display_name", "achador"."display_name") ILIKE ${alvo}
  )`;
}

/** `GET /v1/conversations/{id}`. */
export function construtorDaBuscaDoChamador(db: Db, conversa: ConversationId, chamador: UserId) {
  return construtorDaLeituraDoChamador(db, chamador).where('conversations.id', '=', conversa);
}

/** As mensagens, com o dono no `WHERE` da PRÓPRIA consulta. */
export function construtorDasMensagens(
  db: Db,
  conversa: ConversationId,
  chamador: UserId,
  pagina: Pagina,
) {
  const base = db
    .selectFrom('conversation_messages')
    .innerJoin('conversations', 'conversations.id', 'conversation_messages.conversation_id')
    .select([
      'conversation_messages.id',
      'conversation_messages.sender_role',
      'conversation_messages.body',
      'conversation_messages.redactions',
      'conversation_messages.photo_object_key',
      'conversation_messages.created_at',
    ])
    .where('conversation_messages.conversation_id', '=', conversa)
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    )
    .where('conversations.moderation_removed_at', 'is', null)
    .orderBy('conversation_messages.created_at', 'asc')
    .orderBy('conversation_messages.id', 'asc')
    .limit(pagina.limit);
  const depois = pagina.depoisDe;
  if (depois === undefined) return base;
  return base.where(
    sql<boolean>`(conversation_messages.created_at, conversation_messages.id) > (${depois.criadaEm}, ${depois.id})`,
  );
}

/** Quantas mensagens este papel mandou nesta conversa na janela. */
export function construtorDaContagemDoParticipante(
  db: Db,
  conversa: ConversationId,
  papel: Papel,
  desde: Instant,
) {
  return db
    .selectFrom('conversation_messages')
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('conversation_id', '=', conversa)
    .where('sender_role', '=', papel)
    .where('created_at', '>=', new Date(desde));
}

/** Em quantos CASOS DISTINTOS esta conta escreveu **como achadora** na janela. */
export function construtorDosCasosDistintosDaConta(db: Db, conta: UserId, desde: Instant) {
  return db
    .selectFrom('conversation_messages')
    .innerJoin('conversations', 'conversations.id', 'conversation_messages.conversation_id')
    .select(
      sql<string>`count(distinct coalesce(conversations.case_id, conversations.id))`.as('n'),
    )
    .where('conversation_messages.sender_user_id', '=', conta)
    .where('conversations.finder_user_id', '=', conta)
    .where('conversation_messages.created_at', '>=', new Date(desde));
}

/** O bloqueio pelo chamador COM CONTA (`POST /v1/conversations/{id}/block`). */
export function construtorDoBloqueioDoChamador(
  db: Db,
  conversa: ConversationId,
  chamador: UserId,
  agora: Instant,
) {
  return db
    .updateTable('conversations')
    .set({
      blocked_at: new Date(agora),
      blocked_by_role: sql<'tutor' | 'finder'>`CASE WHEN "tutor_user_id" = ${chamador} THEN 'tutor' ELSE 'finder' END`,
    })
    .where('id', '=', conversa)
    .where((eb) =>
      eb.or([eb('tutor_user_id', '=', chamador), eb('finder_user_id', '=', chamador)]),
    )
    .where('blocked_at', 'is', null);
}

/** Marca a conversa para revisão. */
export function construtorDaRetencao(
  db: Db,
  conversa: ConversationId,
  motivo: MotivoDeRetencao,
  agora: Instant,
) {
  return db
    .updateTable('conversations')
    .set({ held_for_review_at: new Date(agora), held_reason: motivo })
    .where('id', '=', conversa)
    .where('held_for_review_at', 'is', null);
}

function idDaConversaDoToken(resumo: Uint8Array) {
  const janelaEmSegundos = JANELA_DE_AGRUPAMENTO_EM_MS / 1000;
  return sql<string>`(
    SELECT c.id
      FROM found_reports proprio
      JOIN found_reports origem
        ON origem.id = proprio.id
        OR (proprio.finder_identity_hash IS NOT NULL
            AND origem.tag_id = proprio.tag_id
            AND origem.finder_identity_hash = proprio.finder_identity_hash
            AND origem.created_at <= proprio.created_at
            AND origem.created_at >= proprio.created_at - make_interval(secs => ${janelaEmSegundos}))
      JOIN conversations c ON c.found_report_id = origem.id
     WHERE proprio.finder_token_hash = ${Buffer.from(resumo)}
       AND proprio.origin = 'tag_scan'
     ORDER BY (origem.id = proprio.id) DESC, origem.created_at DESC
     LIMIT 1
  )`;
}

interface LinhaDaConversaDoAchador {
  id: string;
  pet_display_name: string;
  closed_at: Date | null;
  blocked_at: Date | null;
  tutor_display_name: string | null;
  finder_display_name: string | null;
  finder_token_hash: Buffer | null;
  finder_token_expires_at: Date | null;
  case_status: string | null;
  case_closed_at: Date | null;
  tutor_deleted_at: Date | null;
  achador_deleted_at: Date | null;
}

/** A leitura da conversa pelo token. */
export function construtorDaLeituraDoAchador(db: Db, resumo: Uint8Array) {
  return db
    .selectFrom('conversations')
    .innerJoin('pets', 'pets.id', 'conversations.pet_id')
    .innerJoin('users as tutor', 'tutor.id', 'conversations.tutor_user_id')
    .innerJoin('found_reports', 'found_reports.id', 'conversations.found_report_id')
    .innerJoin('found_reports as proprio', (juncao) =>
      juncao.on('proprio.finder_token_hash', '=', Buffer.from(resumo)),
    )
    .leftJoin('lost_cases', 'lost_cases.id', 'conversations.case_id')
    .leftJoin('users as achador', 'achador.id', 'conversations.finder_user_id')
    .select([
      'conversations.id',
      'pets.name as pet_display_name',
      'conversations.closed_at',
      'conversations.blocked_at',
      'tutor.display_name as tutor_display_name',
      sql<string | null>`coalesce("found_reports"."finder_display_name", "achador"."display_name")`.as(
        'finder_display_name',
      ),
      'tutor.deleted_at as tutor_deleted_at',
      'achador.deleted_at as achador_deleted_at',
      'proprio.finder_token_hash',
      'proprio.finder_token_expires_at',
      'lost_cases.status as case_status',
      'lost_cases.closed_at as case_closed_at',
    ])
    .where('conversations.id', '=', idDaConversaDoToken(resumo))
    .where('conversations.moderation_removed_at', 'is', null);
}

/** As mensagens pelo token, na ordem da conversa, pela posição. */
export function construtorDasMensagensDoAchador(
  db: Db,
  resumo: Uint8Array,
  pagina: PaginaDoAchador,
) {
  return db
    .selectFrom('conversation_messages')
    .select(['id', 'sender_role', 'body', 'redactions', 'photo_object_key', 'created_at'])
    .where('conversation_id', '=', idDaConversaDoToken(resumo))
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('conversations')
          .select('conversations.id')
          .whereRef('conversations.id', '=', 'conversation_messages.conversation_id')
          .where('conversations.moderation_removed_at', 'is', null),
      ),
    )
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .offset(pagina.deslocamento)
    .limit(pagina.limit);
}

/** O bloqueio pelo achador. */
export function construtorDoBloqueioDoAchador(db: Db, resumo: Uint8Array, agora: Instant) {
  return db
    .updateTable('conversations')
    .set({ blocked_at: new Date(agora), blocked_by_role: 'finder' })
    .where('id', '=', idDaConversaDoToken(resumo))
    .where('blocked_at', 'is', null);
}

function comoConversaDoAchador(linha: LinhaDaConversaDoAchador): ConversaDoAchador | undefined {
  if (linha.finder_token_hash === null || linha.finder_token_expires_at === null) return undefined;
  return {
    id: linha.id as ConversationId,
    petDisplayName: linha.pet_display_name,
    encerradaEm: linha.closed_at,
    bloqueadaEm: linha.blocked_at,
    nomeDoTutor: linha.tutor_display_name,
    nomeDoAchador: linha.finder_display_name,
    tutorDesabilitado: linha.tutor_deleted_at !== null,
    achadorDesabilitado: linha.achador_deleted_at !== null,
    resumoDoToken: new Uint8Array(linha.finder_token_hash),
    tokenExpiraEm: linha.finder_token_expires_at,
    caso:
      linha.case_status === null
        ? null
        : {
            aberto: linha.case_status === 'open',
            encerradoEm: linha.case_closed_at,
          },
  };
}

export function criarConversationRepository(db: Db): ConversationRepository {
  return {
    async abrirPorAviso(abertura: AberturaPorAviso): Promise<void> {
      await sql`
        INSERT INTO conversations (id, found_report_id, pet_id, case_id, tutor_user_id, finder_user_id)
        SELECT
          ${abertura.id},
          ${abertura.foundReportId},
          pets.id,
          (SELECT lc.id FROM lost_cases lc
            WHERE lc.pet_id = pets.id AND lc.status = 'open'
            ORDER BY lc.opened_at DESC LIMIT 1),
          pets.owner_user_id,
          ${abertura.achadorComConta}
        FROM pets
        WHERE pets.id = ${abertura.petId}
          AND pets.deleted_at IS NULL
          AND pets.owner_user_id IS DISTINCT FROM ${abertura.achadorComConta}
        ON CONFLICT (found_report_id) DO NOTHING
      `.execute(db);
    },

    async porAviso(foundReportId: FoundReportId): Promise<ConversationId | undefined> {
      const linha = await db
        .selectFrom('conversations')
        .select('id')
        .where('found_report_id', '=', foundReportId)
        .executeTakeFirst();
      return linha === undefined ? undefined : (linha.id as ConversationId);
    },

    async listarDoChamador(chamador, pagina): Promise<readonly ConversaDoChamador[]> {
      const linhas = await construtorDaListaDoChamador(db, chamador, pagina).execute();
      return (linhas as unknown as LinhaDaConversa[]).map(comoConversa);
    },

    async contarDoChamador(chamador, termo): Promise<number> {
      const linha = await construtorDaContagemDoChamador(
        db,
        chamador,
        termo,
      ).executeTakeFirstOrThrow();
      return Number(linha.n);
    },

    async buscarDoChamador(conversa, chamador): Promise<ConversaDoChamador | undefined> {
      const linha = await construtorDaBuscaDoChamador(db, conversa, chamador).executeTakeFirst();
      return linha === undefined ? undefined : comoConversa(linha);
    },

    async mensagens(conversa, chamador, pagina): Promise<readonly MensagemGravada[]> {
      const linhas = await construtorDasMensagens(db, conversa, chamador, pagina).execute();
      return (linhas as unknown as LinhaDaMensagem[]).map(comoMensagem);
    },

    gravarMensagem: (mensagem: NovaMensagem) => inserir(db, mensagem),

    gravarMensagemDeSistema: (mensagem) =>
      inserir(
        db,
        { ...mensagem, senderRole: 'system', senderUserId: null },
        mensagem.especie,
      ),

    async contarMensagensDoParticipante(conversa, papel, desde): Promise<number> {
      const linha = await construtorDaContagemDoParticipante(
        db,
        conversa,
        papel,
        desde,
      ).executeTakeFirstOrThrow();
      return Number(linha.n);
    },

    async contarCasosDistintosDaConta(conta, desde): Promise<number> {
      const linha = await construtorDosCasosDistintosDaConta(
        db,
        conta,
        desde,
      ).executeTakeFirstOrThrow();
      return Number(linha.n);
    },

    async reterParaRevisao(conversa, motivo, agora): Promise<void> {
      await construtorDaRetencao(db, conversa, motivo, agora).execute();
    },

    async bloquearPeloChamador(conversa, chamador, agora): Promise<void> {
      await construtorDoBloqueioDoChamador(db, conversa, chamador, agora).execute();
    },

    async buscarPeloTokenDoAchador(resumo): Promise<ConversaDoAchador | undefined> {
      const linha = await construtorDaLeituraDoAchador(db, resumo).executeTakeFirst();
      return linha === undefined ? undefined : comoConversaDoAchador(linha);
    },

    async mensagensPeloTokenDoAchador(resumo, pagina): Promise<readonly MensagemGravada[]> {
      const linhas = await construtorDasMensagensDoAchador(db, resumo, pagina).execute();
      return (linhas as unknown as LinhaDaMensagem[]).map(comoMensagem);
    },

    async bloquearPeloAchador(resumo, agora): Promise<void> {
      await construtorDoBloqueioDoAchador(db, resumo, agora).execute();
    },

    async contarParaOSino(chamador): Promise<number> {
      const linha = await sql<{ n: number | string }>`
        SELECT count(*) AS n
        FROM conversations c
        LEFT JOIN conversation_reads leitura
          ON leitura.conversation_id = c.id
         AND ((leitura.role = 'tutor'  AND c.tutor_user_id  = ${chamador})
           OR (leitura.role = 'finder' AND c.finder_user_id = ${chamador}))
        LEFT JOIN conversation_list_views vista ON vista.user_id = ${chamador}
        WHERE (c.tutor_user_id = ${chamador} OR c.finder_user_id = ${chamador})
          AND EXISTS (
            SELECT 1 FROM conversation_messages msg
            WHERE msg.conversation_id = c.id
              AND msg.sender_role <> (CASE WHEN c.tutor_user_id = ${chamador}
                                           THEN 'tutor' ELSE 'finder' END)
              AND (leitura.last_read_at IS NULL OR msg.created_at > leitura.last_read_at)
              AND (msg.system_kind IN ('scan_notice', 'found_notice')
                   OR vista.seen_at IS NULL
                   OR msg.created_at > vista.seen_at)
          )
      `.execute(db);
      const n = linha.rows[0]?.n ?? 0;
      return Number(n);
    },

    async marcarListaVista(chamador, agora): Promise<void> {
      await sql`
        INSERT INTO conversation_list_views (user_id, seen_at)
        VALUES (${chamador}, ${new Date(agora)})
        ON CONFLICT (user_id) DO UPDATE SET seen_at = EXCLUDED.seen_at
      `.execute(db);
    },

    async marcarConversaLida(conversa, chamador, agora): Promise<void> {
      await sql`
        INSERT INTO conversation_reads (conversation_id, role, last_read_at)
        SELECT c.id,
               (CASE WHEN c.tutor_user_id = ${chamador} THEN 'tutor' ELSE 'finder' END),
               ${new Date(agora)}
        FROM conversations c
        WHERE c.id = ${conversa}
          AND (c.tutor_user_id = ${chamador} OR c.finder_user_id = ${chamador})
        ON CONFLICT (conversation_id, role)
          DO UPDATE SET last_read_at = GREATEST(
            conversation_reads.last_read_at, EXCLUDED.last_read_at
          )
      `.execute(db);
    },

    async registrarDenuncia(denuncia: NovaDenuncia): Promise<void> {
      const quando = new Date(denuncia.agora);
      await sql`
        INSERT INTO conversation_reports
          (id, conversation_id, reporter_role, reason, detail, created_at, last_reported_at)
        VALUES
          (${denuncia.id}, ${denuncia.conversationId}, ${denuncia.papel}, ${denuncia.motivo},
           ${denuncia.detalhe}, ${quando}, ${quando})
        ON CONFLICT (conversation_id, reporter_role) WHERE resolved_at IS NULL
        DO UPDATE SET repeat_count = conversation_reports.repeat_count + 1,
                      last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);
    },
  };
}

/**
 * `especie` só é passada pela mensagem do Bichu, e por isso é o último parâmetro e
 * não entra em `NovaMensagem`: o `CHECK`
 * `conversation_messages_especie_so_do_sistema` recusa espécie em linha humana, e
 * deixar o campo disponível para `gravarMensagem` convidaria ao erro que o banco
 * então rejeitaria em produção.
 */
export function construtorDaInsercaoDeMensagem(
  db: Db,
  mensagem: NovaMensagem,
  especie: EspecieDoSistema | null = null,
) {
  return db
    .insertInto('conversation_messages')
    .values({
      id: mensagem.id,
      conversation_id: mensagem.conversationId,
      sender_role: mensagem.senderRole,
      sender_user_id: mensagem.senderUserId,
      body: mensagem.body,
      redactions: JSON.stringify(mensagem.redactions),
      photo_object_key: mensagem.photoObjectKey ?? null,
      system_kind: especie,
    })
    .returning([
      'id',
      'sender_role',
      'body',
      'redactions',
      'photo_object_key',
      'created_at',
    ]);
}

async function inserir(
  db: Db,
  mensagem: NovaMensagem,
  especie: EspecieDoSistema | null = null,
): Promise<MensagemGravada> {
  const linha = await construtorDaInsercaoDeMensagem(
    db,
    mensagem,
    especie,
  ).executeTakeFirstOrThrow();
  return comoMensagem(linha);
}
