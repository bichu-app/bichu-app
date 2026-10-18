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
    // `!== null` e não um `if` de tela: quem decide o que isto SIGNIFICA é
    // `estadoDaConversa` e `participantesVisiveis`, no domínio.
    tutorDesabilitado: linha.tutor_deleted_at !== null,
    achadorDesabilitado: linha.achador_deleted_at !== null,
    // A LEITURA (BICHUS-278). `nao_lida` sai do `EXISTS` da consulta e nao de
    // uma comparacao aqui: comparar na aplicacao exigiria trazer as mensagens
    // de cada linha da lista, que e o N+1 que a lista existe para evitar.
    naoLida: linha.nao_lida,
    corpoDaUltima: linha.corpo_da_ultima,
    ultimaMensagemEm: linha.ultima_mensagem_em,
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
 *
 * ## Por que o nome do achador sai de DUAS colunas (BICHUS-86)
 *
 * `found_reports.finder_display_name` é o campo do formulário de quem **não tem
 * conta**: o achador anônimo que escaneia a plaquinha digita o nome ali. O
 * achado avulso não tem esse formulário — `POST /v1/found-reports` exige conta,
 * e o `INSERT` de `criarFoundReportRepository` não escreve a coluna, de propósito.
 *
 * Enquanto nada abria conversa a partir de um achado avulso isso não quebrava
 * nada. A decisão humana do tutor passou a abrir, e sem o `coalesce` o tutor
 * veria `Quem achou` (o rótulo de `primeiroNomeOuApelido` para `null`) na
 * conversa de uma pessoa que tem conta e nome preenchido — justamente no
 * momento em que ele precisa saber com quem está falando sobre o pet dele.
 *
 * **A ordem do `coalesce` é o que mantém a resposta de hoje igual.** O nome do
 * formulário vem primeiro: no caminho da plaquinha ele já é o que a rota
 * devolve, e invertê-lo trocaria, para quem tem conta E preencheu o formulário,
 * o nome que a pessoa escolheu dar naquele aviso pelo nome do cadastro dela. O
 * `LEFT JOIN` preenche só o que era nulo.
 *
 * Isto **não** alarga o que sai: `participantesVisiveis` passa o valor por
 * `primeiroNomeOuApelido`, que corta no primeiro nome — que é o que o contrato
 * promete em `Conversation.participants.display_name` ("Primeiro nome ou
 * apelido. **Nunca** sobrenome completo").
 */
export function construtorDaLeituraDoChamador(db: Db, chamador: UserId) {
  return db
    .selectFrom('conversations')
    .innerJoin('pets', 'pets.id', 'conversations.pet_id')
    .innerJoin('users as tutor', 'tutor.id', 'conversations.tutor_user_id')
    .innerJoin('found_reports', 'found_reports.id', 'conversations.found_report_id')
    .leftJoin('lost_cases', 'lost_cases.id', 'conversations.case_id')
    // LEFT e não INNER: o achador da plaquinha costuma não ter conta, e um
    // INNER aqui faria a conversa dele **desaparecer** da lista do tutor.
    .leftJoin('users as achador', 'achador.id', 'conversations.finder_user_id')
    // A LEITURA DESTE LADO. `LEFT` e nao `INNER`, e a diferenca e o estado
    // inicial: a linha so existe depois de a pessoa abrir a conversa uma vez, e
    // um `INNER` faria toda conversa nunca aberta DESAPARECER da lista -- isto
    // e, exatamente as que tem recado para ler.
    //
    // O papel entra no `ON` por igualdade com a coluna do lado, e nao por um
    // `CASE`: `role = 'tutor' AND tutor_user_id = :eu` casa uma linha so, e
    // deixa o predicado legivel para quem audita o SQL compilado.
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
      // AS DUAS PONTAS DESABILITADAS (17/10). Sai `deleted_at` e não um booleano
      // montado em SQL: o domínio decide o significado, e a consulta só traz o
      // fato. `achador.deleted_at` é nulo também quando NÃO HÁ achador com conta
      // -- o `LEFT JOIN` não casou -- e os dois nulos querem a mesma resposta
      // ("não está desabilitado"), então a ambiguidade é inofensiva aqui.
      'tutor.deleted_at as tutor_deleted_at',
      'achador.deleted_at as achador_deleted_at',
      eb
        .case()
        .when('conversations.tutor_user_id', '=', chamador)
        .then('tutor')
        .else('finder')
        .end()
        .as('papel_do_chamador'),
      // -------------------------------------------------------------------
      // A LEITURA DESTE LADO (BICHUS-278)
      //
      // `papel_do_chamador` acima nao serve aqui: ele e um ALIAS do SELECT, e
      // o Postgres nao o enxerga dentro de outra expressao do mesmo SELECT. O
      // `CASE` e repetido de proposito -- e a MESMA expressao, e nao uma
      // segunda regra, e `teto-da-leitura.test.ts` le o SQL compilado para
      // garantir que as duas continuem iguais.
      //
      // `sender_role <> <meu papel>` e o que impede a propria mensagem de
      // voltar como nao lida: sem ele, responder a alguem deixaria a conversa
      // acesa no sino de quem respondeu.
      //
      // NAO HA `conversation_list_views` nesta expressao, e a ausencia e a
      // regra: abrir a lista NAO marca item. Ver `contarParaOSino`, que e a
      // unica consulta em que a lista vista entra.
      sql<boolean>`EXISTS (
        SELECT 1 FROM conversation_messages msg
        WHERE msg.conversation_id = conversations.id
          AND msg.sender_role <> (CASE WHEN conversations.tutor_user_id = ${chamador}
                                       THEN 'tutor' ELSE 'finder' END)
          AND (leitura.last_read_at IS NULL OR msg.created_at > leitura.last_read_at)
      )`.as('nao_lida'),
      // A PREVIA sai de `conversation_messages.body`, que esta JA REDIGIDO no
      // banco -- e nunca de `found_reports.notes`, que guarda o recado do
      // achador EM CLARO. Uma previa tirada de lá publicaria na lista o
      // telefone que a conversa existe para nao deixar passar. O corte em 140
      // e do dominio (`previaDaMensagem`), nao daqui.
      sql<string | null>`(
        SELECT msg.body FROM conversation_messages msg
        WHERE msg.conversation_id = conversations.id
        ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
      )`.as('corpo_da_ultima'),
      sql<Date | null>`(
        SELECT msg.created_at FROM conversation_messages msg
        WHERE msg.conversation_id = conversations.id
        ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
      )`.as('ultima_mensagem_em'),
    ])
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    )
    // LEITURA PUBLICA 1 de 4: a conversa REMOVIDA pela moderacao do painel sai
    // das duas vistas do chamador (a lista e a leitura de uma), porque as duas
    // passam por este construtor. Migracao `20261018000009`.
    //
    // **Exclusao LOGICA**: `conversation_messages` continua inteira e
    // `moderation_reason` continua gravado para quem auditar. O que esta
    // clausula faz e tirar a conversa da tela dos dois lados.
    //
    // Sai pelo `WHERE`, e nao por um descarte na montagem da resposta: um
    // `filter` depois da leitura traria a conversa para a memoria do processo e
    // deixaria o caminho novo que esquecesse o `filter` publicando-a de volta.
    //
    // **O denunciado NAO e avisado** (avisar e retaliacao, decisao de desenho
    // ja tomada): a conversa simplesmente deixa de estar la, e nenhum campo da
    // resposta diz por que. `moderation_reason` nao e projetado em lugar
    // nenhum desta vista.
    .where('conversations.moderation_removed_at', 'is', null);
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
    // LEITURA PUBLICA 2 de 4. Sem esta clausula, a conversa sairia da LISTA e
    // as mensagens dela continuariam legiveis por quem tivesse o `id` -- e o
    // `id` esta no contrato, nas maos dos dois lados.
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

/**
 * Em quantos CASOS DISTINTOS esta conta escreveu **como achadora** na janela.
 *
 * Três decisões, e as três mudam o que o critério 17 mede.
 *
 * **`COUNT(DISTINCT ...)` e não `COUNT(*)`.** O que se conta é caso, nunca
 * mensagem: trinta mensagens num caso só valem `1`. Contar a coisa errada aqui
 * inverte a contramedida — a conta que conversa muito com UM tutor seria retida,
 * e a que aborda três tutores diferentes passaria.
 *
 * **`COALESCE(case_id, conversation_id)`.** A conversa sem caso conta como um
 * caso próprio. Deixá-la de fora daria ao falso achador em série o caminho
 * grátis de abordar tutores cujos pets não estão marcados como perdidos — que é
 * exatamente a plaquinha escaneada na rua, o caminho mais comum de todos.
 *
 * **`finder_user_id = :conta`, e é aqui que este arquivo lê o critério 11 pela
 * nota e não pela dimensão.** O contrato diz `dimension: [account]`, e a leitura
 * literal contaria também o TUTOR: quem tem três animais perdidos ao mesmo tempo
 * escreve em três casos distintos em 24 h fazendo exatamente o que o produto
 * existe para ele fazer, e seria retido para revisão humana **sem ser avisado**,
 * porque o critério manda não avisar. A nota do próprio contrato nomeia o alvo
 * com todas as letras: *"falso achador em série: uma conta que aborda tutores de
 * casos diferentes"*. Quem aborda é o achador. O predicado é o que faz a
 * contramedida pegar o padrão que ela nomeia, e só ele.
 */
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

/**
 * O bloqueio pelo chamador COM CONTA (`POST /v1/conversations/{id}/block`).
 *
 * Três decisões, e as três são o mesmo princípio deste arquivo.
 *
 * **O chamador está no `WHERE`**, com o mesmo `OR` das leituras. A escrita não
 * confia em quem a chamou ter lido a conversa antes: um caminho novo que
 * esquecesse a leitura bloquearia a conversa de outra pessoa.
 *
 * **O papel é derivado no SQL**, pelo lado em que o chamador está — o mesmo
 * `CASE` de `papel_do_chamador` na leitura. Recebê-lo por argumento faria a
 * escrita acreditar em quem chama, e `blocked_by_role` é exatamente o campo que
 * diz à outra pessoa quem fechou a porta: trocado, ele acusaria a vítima.
 *
 * **`blocked_at IS NULL`** preserva o primeiro bloqueio, como no lado do
 * achador. Repetir não reescreve quem bloqueou nem quando, e é isso que torna a
 * operação idempotente sem um `SELECT` antes do `UPDATE`.
 */
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

// ===========================================================================
// O achador sem conta (BICHUS-41)
// ===========================================================================

/**
 * O id da conversa do token, como SUBCONSULTA, e nunca como valor que a
 * aplicação leu antes.
 *
 * É o equivalente, para quem não tem conta, do
 * `(tutor_user_id = :chamador OR finder_user_id = :chamador)` do lado com conta:
 * o resumo do token entra em toda consulta que responde ao achador, inclusive a
 * de mensagens, que não confia em a conversa ter sido lida antes.
 *
 * ## Por que dois caminhos até a conversa
 *
 * O aviso agrupado (segundo escaneamento do mesmo achador em 6 h,
 * `JANELA_DE_AGRUPAMENTO_EM_MS`) ganha token próprio e **não** ganha conversa:
 * `ConversationService.abrirPorAviso` anexa o escaneamento à conversa do aviso
 * anterior, porque o tutor não pode ver duas linhas para a mesma pessoa. Sem o
 * segundo caminho, o `conversation_url` desse aviso abriria uma conversa que
 * não existe.
 *
 * O segundo caminho repete o critério do agrupamento, e só ele: mesma tag, mesma
 * identidade derivada (nunca nula), aviso anterior dentro da janela. Entre os
 * dois, o próprio ganha, e entre anteriores ganha o mais recente, que é o que
 * `avisoRecenteDoMesmoAchador` escolheu na hora de agrupar.
 */
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

/**
 * A leitura da conversa pelo token. Exportado para a bancada que lê o SQL.
 *
 * `proprio` é o aviso DONO do token, e é de lá que saem o resumo gravado e a
 * validade: no aviso agrupado, a conversa é a do anterior, e o token é o dele.
 */
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
      // As duas pontas desabilitadas (17/10). Este é o caminho SEM LOGIN, e é
      // por isso que a despersonalização não pode morar na montagem da
      // resposta: são duas vistas, e esta é a que não pede token de acesso.
      'tutor.deleted_at as tutor_deleted_at',
      'achador.deleted_at as achador_deleted_at',
      'proprio.finder_token_hash',
      'proprio.finder_token_expires_at',
      'lost_cases.status as case_status',
      'lost_cases.closed_at as case_closed_at',
    ])
    .where('conversations.id', '=', idDaConversaDoToken(resumo))
    // LEITURA PUBLICA 3 de 4, e e a que nao pede token de acesso: o caminho do
    // achador SEM CONTA. Esquecer esta clausula deixaria a conversa removida
    // visivel justamente para quem o produto nem autentica.
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
    // LEITURA PUBLICA 4 de 4. `conversation_messages` nao tem a coluna da
    // remocao -- ela e da conversa --, entao o predicado vem por subconsulta
    // em vez de `JOIN`: esta consulta nao junta nada hoje, e um `JOIN` novo
    // mudaria o plano dela por causa de um booleano.
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

/**
 * O bloqueio pelo achador. `blocked_at IS NULL` no `WHERE`: o primeiro bloqueio
 * é o que vale, e repetir não reescreve quem bloqueou nem quando.
 */
export function construtorDoBloqueioDoAchador(db: Db, resumo: Uint8Array, agora: Instant) {
  return db
    .updateTable('conversations')
    .set({ blocked_at: new Date(agora), blocked_by_role: 'finder' })
    .where('id', '=', idDaConversaDoToken(resumo))
    .where('blocked_at', 'is', null);
}

function comoConversaDoAchador(linha: LinhaDaConversaDoAchador): ConversaDoAchador | undefined {
  // A junção com `proprio` é por igualdade do resumo, então as duas colunas só
  // chegam nulas se o aviso não tiver token: o achado avulso, que não tem
  // conversa por token. Sem elas não há o que comparar nem prazo a conferir.
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

    /**
     * O CONTADOR DO SINO (BICHUS-278).
     *
     * **É a única consulta deste arquivo em que `conversation_list_views`
     * entra**, e isso é a regra inteira em uma frase: abrir a lista zera o
     * NÚMERO e não toca na marca de item. A marca sai de `nao_lida`, na leitura
     * comum, que não conhece esta tabela.
     *
     * A EXCEÇÃO NOMEADA está no `OR msg.system_kind IN (...)`: o aviso de
     * plaquinha lida e o de achado continuam contando depois de a pessoa abrir a
     * lista, e saem só quando a conversa deles é aberta (`last_read_at`). Eles
     * são a coisa mais importante que o produto tem para dizer — alguém está com
     * o animal na mão agora.
     *
     * **`system_kind` NULO cai na regra geral**, de propósito: são as mensagens
     * de sistema gravadas antes da coluna existir, e não dá para classificá-las
     * retroativamente. Tratá-las como aviso poria no sino para sempre linhas que
     * talvez não sejam aviso, sem caminho para saírem.
     */
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

    /**
     * A conta viu a área. **Não marca item nenhum**, e não recebe conversa.
     *
     * `ON CONFLICT ... DO UPDATE` e não um `SELECT` antes do `INSERT`: duas
     * aberturas simultâneas (trocar de aba e voltar) perderiam a corrida.
     */
    async marcarListaVista(chamador, agora): Promise<void> {
      await sql`
        INSERT INTO conversation_list_views (user_id, seen_at)
        VALUES (${chamador}, ${new Date(agora)})
        ON CONFLICT (user_id) DO UPDATE SET seen_at = EXCLUDED.seen_at
      `.execute(db);
    },

    /**
     * Este lado ABRIU a conversa.
     *
     * O chamador está no `WHERE` da própria escrita (`SELECT ... WHERE` que
     * alimenta o `INSERT`), e o PAPEL é derivado do lado em que ele está —
     * nunca recebido por argumento. Conversa que não é dele seleciona zero
     * linhas e nada é gravado; a recusa dele é o 404 que o serviço já deu antes.
     *
     * `GREATEST` no `DO UPDATE`: duas telas abertas na mesma conta podem gravar
     * fora de ordem, e um instante MENOR sobrescrevendo um maior faria
     * mensagens já lidas voltarem a não lidas.
     */
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

    /**
     * `ON CONFLICT` sobre o índice parcial de denúncia aberta: a repetição do
     * mesmo lado soma ao item de fila que já existe, em vez de abrir outro.
     * O índice decide, e não um `SELECT` antes do `INSERT`.
     */
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
 * `especie` só é passada pela mensagem do Bichu, e por isso é o último
 * parâmetro e não entra em `NovaMensagem`: o `CHECK`
 * `conversation_messages_especie_so_do_sistema` recusa espécie em linha humana,
 * e deixar o campo disponível para `gravarMensagem` convidaria ao erro que o
 * banco então rejeitaria em produção.
 */
async function inserir(
  db: Db,
  mensagem: NovaMensagem,
  especie: EspecieDoSistema | null = null,
): Promise<MensagemGravada> {
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
      system_kind: especie,
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
