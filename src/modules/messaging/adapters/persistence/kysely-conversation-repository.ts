/**
 * Persistência da conversa mediada.
 *
 * **A autorização mora na cláusula `WHERE`**, e não num `if` depois da busca.
 * Toda consulta que responde a uma pessoa carrega
 * `(tutor_user_id = :chamador OR finder_user_id = :chamador)` dentro da própria
 * consulta — inclusive a de mensagens, que **não** confia em quem a chamou ter
 * lido a conversa antes. A consulta que devolveria a conversa de outra pessoa
 * não existe neste arquivo, e a consequência é que conversa de terceiro responde
 * 404, nunca 403 (ADR-0021).
 *
 * Os construtores estão exportados por um motivo só: `autorizacao-na-clausula-
 * where.test.ts` compila cada um deles com `DummyDriver`, sem banco, e lê o
 * predicado do SQL. É a única conferência do repositório que consegue
 * distinguir "a consulta filtra" de "um dublê recusou" — as duas respondem
 * igual pelo lado de fora, até o dia em que alguém mexe no `if`, e aí não há
 * teste que acuse porque o `if` era o teste.
 *
 * `status` **não** é coluna e não é lido: ele é derivado em
 * `domain/conversa-mediada.ts` a partir de `closed_at`, de `blocked_at` e do
 * estado do caso ligado, que sai do `LEFT JOIN` abaixo.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Papel } from '../../domain/conversa-mediada.js';
import type { MotivoDeRetencao } from '../../domain/retencao-para-revisao.js';
import type {
  AberturaPorAviso,
  ConversaDoChamador,
  ConversationRepository,
  MensagemGravada,
  MotivoDeEncerramento,
  NovaMensagem,
  Pagina,
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
    caseId: linha.case_id === null ? null : (linha.case_id as CaseId),
    petDisplayName: linha.pet_display_name,
    abertaEm: linha.opened_at,
    // A consulta já decidiu o lado. Decidir aqui exigiria o id do chamador de
    // volta na aplicação, e um `if` que pode discordar do `WHERE`.
    papelDoChamador: linha.papel_do_chamador === 'tutor' ? 'tutor' : 'finder',
    encerradaEm: linha.closed_at,
    motivoDoEncerramento: linha.closure_reason,
    bloqueadaEm: linha.blocked_at,
    // Sem caso ligado, não há caso encerrado. `null` é ausência, não `closed`.
    casoEncerrado: linha.case_status !== null && linha.case_status !== 'open',
    nomeDoTutor: linha.tutor_display_name,
    nomeDoAchador: linha.finder_display_name,
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

/**
 * A leitura comum às duas rotas de conversa, com o chamador no `WHERE`.
 *
 * Exportado para a bancada que lê o SQL compilado. O `OR` é o que permite a uma
 * conversa só servir aos dois lados sem uma segunda consulta: cada lado casa um
 * dos dois predicados, e nenhum terceiro casa nenhum.
 */
export function construtorDaLeituraDoChamador(db: Db, chamador: UserId) {
  return db
    .selectFrom('conversations')
    .innerJoin('pets', 'pets.id', 'conversations.pet_id')
    .innerJoin('users as tutor', 'tutor.id', 'conversations.tutor_user_id')
    .innerJoin('found_reports', 'found_reports.id', 'conversations.found_report_id')
    .leftJoin('lost_cases', 'lost_cases.id', 'conversations.case_id')
    .select((eb) => [
      'conversations.id',
      'conversations.case_id',
      'pets.name as pet_display_name',
      'conversations.opened_at',
      'conversations.closed_at',
      'conversations.closure_reason',
      'conversations.blocked_at',
      'lost_cases.status as case_status',
      'tutor.display_name as tutor_display_name',
      'found_reports.finder_display_name',
      eb
        .case()
        .when('conversations.tutor_user_id', '=', chamador)
        .then('tutor')
        .else('finder')
        .end()
        .as('papel_do_chamador'),
    ])
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    );
}

/** `GET /v1/conversations`. A mesma leitura, paginada por `opened_at`. */
export function construtorDaListaDoChamador(db: Db, chamador: UserId, pagina: Pagina) {
  const base = construtorDaLeituraDoChamador(db, chamador)
    .orderBy('conversations.opened_at', 'desc')
    .orderBy('conversations.id', 'desc')
    .limit(pagina.limit);
  const depois = pagina.depoisDe;
  if (depois === undefined) return base;
  // Tupla e não `AND` de duas comparações: `(a, b) < (x, y)` é a comparação
  // lexicográfica que o Postgres resolve com o índice, e a versão escrita à mão
  // com `OR` erra no empate de milissegundo, que é justamente quando ela importa.
  return base.where(
    sql<boolean>`(conversations.opened_at, conversations.id) < (${depois.criadaEm}, ${depois.id})`,
  );
}

/** `GET /v1/conversations/{id}`. O id é filtro A MAIS, nunca no lugar do dono. */
export function construtorDaBuscaDoChamador(db: Db, conversa: ConversationId, chamador: UserId) {
  return construtorDaLeituraDoChamador(db, chamador).where('conversations.id', '=', conversa);
}

/**
 * As mensagens, com o dono no `WHERE` da PRÓPRIA consulta.
 *
 * O `INNER JOIN` com `conversations` existe só para carregar o predicado do
 * chamador. Sem ele, a autorização passaria a depender de quem chama ter lido a
 * conversa antes — e o caminho novo que esquecesse a leitura publicaria a
 * conversa inteira sem que nenhum teste de comportamento acusasse.
 */
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

/**
 * Em quantos CASOS DISTINTOS esta conta escreveu na janela (critério 17).
 *
 * `COUNT(DISTINCT ...)` sobre `COALESCE(case_id, conversation_id)`: a conversa
 * sem caso conta como um caso próprio. Deixá-la de fora daria ao falso achador
 * em série o caminho grátis de abordar tutores cujos pets não estão marcados
 * como perdidos — que é exatamente a plaquinha escaneada na rua.
 *
 * E o que se conta é caso, nunca mensagem: trinta mensagens num caso só valem
 * `1`. Contar a coisa errada aqui inverte a contramedida.
 */
export function construtorDosCasosDistintosDaConta(db: Db, conta: UserId, desde: Instant) {
  return db
    .selectFrom('conversation_messages')
    .innerJoin('conversations', 'conversations.id', 'conversation_messages.conversation_id')
    .select(
      sql<string>`count(distinct coalesce(conversations.case_id, conversations.id))`.as('n'),
    )
    .where('conversation_messages.sender_user_id', '=', conta)
    .where('conversation_messages.created_at', '>=', new Date(desde));
}

/**
 * Marca a conversa para revisão. **Só a primeira retenção conta.**
 *
 * `held_for_review_at IS NULL` no `WHERE` preserva o instante e o motivo da
 * primeira vez: sobrescrever faria a fila de moderação perder há quanto tempo
 * aquilo está esperando, que é o único número pelo qual ela se organiza.
 */
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

export function criarConversationRepository(db: Db): ConversationRepository {
  return {
    /**
     * `INSERT ... SELECT` a partir do pet: o tutor e o caso aberto são
     * derivados dentro da própria escrita.
     *
     * Recebê-los por argumento faria a abertura confiar em quem chama para
     * dizer de quem é o pet, e quem chama é o caminho público do aviso.
     *
     * `ON CONFLICT DO NOTHING` sobre `found_report_id`: a idempotência é do
     * índice, e não de um `SELECT` antes do `INSERT`, que perde a corrida entre
     * duas requisições simultâneas do mesmo cliente.
     */
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
      inserir(db, { ...mensagem, senderRole: 'system', senderUserId: null }),

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
  };
}

async function inserir(db: Db, mensagem: NovaMensagem): Promise<MensagemGravada> {
  const linha = await db
    .insertInto('conversation_messages')
    .values({
      id: mensagem.id,
      conversation_id: mensagem.conversationId,
      sender_role: mensagem.senderRole,
      sender_user_id: mensagem.senderUserId,
      body: mensagem.body,
      redactions: JSON.stringify(mensagem.redactions),
      photo_object_key: null,
    })
    .returning([
      'id',
      'sender_role',
      'body',
      'redactions',
      'photo_object_key',
      'created_at',
    ])
    .executeTakeFirstOrThrow();
  return comoMensagem(linha);
}
