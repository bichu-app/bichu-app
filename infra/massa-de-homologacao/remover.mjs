#!/usr/bin/env node
/* global console, process */
/**
 * Remove a massa de homologacao PELO MANIFESTO, e prova que nao tocou no resto.
 *
 *   DATABASE_URL=... node infra/massa-de-homologacao/remover.mjs \
 *     --manifesto <caminho.json> [--conferir]
 *
 * `--conferir` so mede e relata, sem apagar nada.
 *
 * ===========================================================================
 * NENHUM `LIKE`. NENHUM PADRAO DE TEXTO. SO IDENTIFICADORES.
 * ===========================================================================
 * Todo `DELETE` daqui tem a forma `where <chave> = any($1::uuid[])`, com o
 * vetor vindo do manifesto. `DELETE ... WHERE nome LIKE '%teste%'` e como se
 * apaga dado alheio sem perceber: basta um registro de verdade com a palavra
 * dentro -- e o cliente vai NAVEGAR com esta massa na tela, podendo renomear
 * e criar coisa nova enquanto olha.
 *
 * A conferencia por padrao de texto existe, e vive em `criar.mjs`
 * (`conferirCobertura`). La ela CONFERE; aqui ela nao apagaria.
 *
 * ===========================================================================
 * A ORDEM, E OS DOIS AVISOS QUE A DEFINEM
 * ===========================================================================
 * 1. **Apagar conta apaga em silencio o que terceiros montaram contra ela.**
 *    `user_blocks` tem as DUAS pontas em `ON DELETE CASCADE`
 *    (`blocker_user_id` e `blocked_user_id`), `user_connections` tambem
 *    (`requester_user_id` e `addressee_user_id`), e
 *    `profile_reports`/`photo_reports`/`publication_reports`/
 *    `professional_review_reports` tem `reporter_user_id` em CASCADE. Entao:
 *      - se o cliente BLOQUEAR um perfil da massa, a linha do bloqueio DELE
 *        morre quando a conta da massa sair;
 *      - se ele PEDIR CONEXAO a um perfil da massa, o pedido DELE morre;
 *      - se ele DENUNCIAR um perfil da massa, a denuncia sobrevive mas fica
 *        com `subject_user_id` nulo (essa ponta e `SET NULL`), e uma denuncia
 *        sem sujeito na fila de moderacao e um item que ninguem consegue
 *        resolver.
 *    A massa nao cria nenhuma dessas linhas -- mas isso protege so metade,
 *    porque ELE pode criar depois. Entao a CONFERENCIA PREVIA abaixo RECUSA a
 *    remocao inteira se achar qualquer linha dessas cruzando a fronteira do
 *    lote, e diz exatamente qual. A decisao do que fazer com ela e humana, nao
 *    minha.
 *
 * 2. **`handles` nao sai sozinha, e um `DELETE` na ordem errada da 23514.**
 *    `handles.user_id` e `ON DELETE SET NULL`, e o CHECK
 *    `handles_pessoa_tem_dono` proibe `kind = 'pessoa'` sem dono -- apagar o
 *    usuario reprovava com 23514. A migracao `20261019000004` resolveu com o
 *    gatilho `handles_orfao_reservado` (funcao `handles_orfao_vira_reservado`),
 *    que vira o apelido orfao em `kind = 'reservado'` no mesmo `UPDATE`
 *    implicito do `SET NULL`.
 *    A CONSEQUENCIA, que o gatilho resolve e nao desfaz: o apelido CONTINUA NA
 *    TABELA, como palavra reservada. Sem o passo 13 abaixo, esta remocao
 *    deixaria 30 apelidos queimados para sempre. E ele tem de vir DEPOIS dos
 *    usuarios: `users.handle` referencia `handles.handle` (sem `ON DELETE`),
 *    entao apagar o apelido antes do usuario reprova por chave estrangeira.
 *
 * E um terceiro, medido no catalogo de homologacao e nao suposto:
 * 3. **`found_reports.tag_id` e `ON DELETE RESTRICT`.** O aviso de achado sai
 *    ANTES da plaquinha, ou o `DELETE` em `pet_tags` reprova. (A migracao
 *    original escreveu `SET NULL`; o que vale e o que esta no banco.)
 *
 * ===========================================================================
 * A PROVA, E COMO ELA E FEITA
 * ===========================================================================
 * Antes e depois, em UMA transacao, a ferramenta conta em cada tabela afetada
 * as linhas que **NAO** sao da massa. Se qualquer uma dessas contagens mudar, a
 * transacao e desfeita e o programa reprova dizendo qual tabela e quanto.
 *
 * "Nao sao da massa" e definido pelo COMPLEMENTO do manifesto, e nao por
 * texto: `where id <> all($1::uuid[])`. Isso cobre inclusive o que a massa nao
 * criou e nao previu.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Client } from 'pg';

import { MARCA_DE_HOMOLOGACAO } from './criar.mjs';

/**
 * As tabelas em que esta remocao pode mexer, direta ou por cascata, e a coluna
 * que diz se a linha e da massa.
 *
 * A lista e larga de proposito: ela inclui tabelas em que a massa NAO escreve
 * (`lost_cases`, `user_blocks`, `profile_reports`, `pet_transfers`...)
 * precisamente porque a pergunta e "o `DELETE` levou algo a mais?". Tabela
 * ausente desta lista e uma tabela sobre a qual a prova nao afirma nada.
 */
const AFETADAS = [
  ['conversation_messages', 'conversation_id', 'conversas'],
  ['conversation_reads', 'conversation_id', 'conversas'],
  ['conversation_reports', 'conversation_id', 'conversas'],
  ['conversations', 'id', 'conversas'],
  ['match_candidates', 'found_report_id', 'avisos'],
  ['upload_intents', 'found_report_id', 'avisos'],
  ['found_reports', 'id', 'avisos'],
  ['tag_scans', 'tag_id', 'plaquinhas'],
  ['pet_tags', 'id', 'plaquinhas'],
  ['collar_tag_requests', 'pet_id', 'pets'],
  ['pet_photos', 'pet_id', 'pets'],
  ['pet_transfers', 'pet_id', 'pets'],
  ['lost_cases', 'pet_id', 'pets'],
  ['pets', 'id', 'pets'],
  // As cinco filhas do encontro pedem SQL proprio: a chave delas e `event_id`,
  // e o manifesto guarda SLUG. Contar a tabela inteira dizia que as linhas da
  // massa eram de fora, e a prova em homologacao acusou as tres primeiras
  // (`network_event_sizes` 56 -> 52). A pergunta atravessa `network_events`.
  ...['network_event_images', 'network_event_join_requests', 'network_event_amenities',
    'network_event_bring_items', 'network_event_sizes'].map((tabela) => [
    tabela, null, null, null,
    `select count(*)::int as n from ${tabela}
      where event_id not in (select id from network_events where slug = any($1::text[]))`,
    'encontrosSlug',
  ]),
  // Pelo SLUG, e nao pelo `id`: a rota de criacao devolve `slug` e nao devolve
  // `id` (`NetworkEventPublic` nao tem `id` na lista de obrigatorios), entao e
  // o slug que o manifesto guarda. Contar por `id` daqui contava a massa como
  // se fosse de fora, e a prova acusou: 43 -> 13.
  ['network_events', 'slug', 'encontrosSlug', 'text[]'],
  ['store_item_images', 'item_id', 'itens'],
  ['store_item_species', 'item_id', 'itens'],
  ['store_item_tags', 'item_id', 'itens'],
  ['store_items', 'id', 'itens'],
  ['store_partners', 'id', 'parceiros'],
  ['professional_reviews', 'professional_id', 'profissionais'],
  ['professionals', 'id', 'profissionais'],
  ['entity_verifications', 'claimant_user_id', 'contas'],
  ['directory_suggestions', 'suggested_by_user_id', 'contas'],
  ['user_reference_locations', 'user_id', 'contas'],
  ['verification_tokens', 'user_id', 'contas'],
  ['refresh_tokens', 'user_id', 'contas'],
  ['reauth_tokens', 'user_id', 'contas'],
  ['user_identities', 'user_id', 'contas'],
  ['user_roles', 'user_id', 'contas'],
  ['user_devices', 'user_id', 'contas'],
  ['user_showcase_images', 'user_id', 'contas'],
  ['conversation_list_views', 'user_id', 'contas'],
  ['notification_items', 'recipient_user_id', 'contas'],
  ['notification_counter_state', 'user_id', 'contas'],
  ['catalog_upload_intents', 'user_id', 'contas'],
  ['alert_recipients', 'user_id', 'contas'],
  ['user_blocks', 'blocker_user_id', 'contas'],
  ['user_connections', 'requester_user_id', 'contas'],
  ['profile_reports', 'reporter_user_id', 'contas'],
  ['photo_reports', 'reporter_user_id', 'contas'],
  ['publication_reports', 'reporter_user_id', 'contas'],
  ['professional_review_reports', 'reporter_user_id', 'contas'],
  ['users', 'id', 'contas'],
  ['handles', 'handle', 'apelidos', 'citext[]'],
  // `local_credentials` nao tem coluna de usuario: a chave e `identity_id`, e
  // ela cai por cascata de `user_identities`, que cai de `users`. Contar a
  // tabela inteira dizia que a massa era de fora, e a prova acusou (42 -> 12).
  // Entao a pergunta atravessa a identidade.
  ['local_credentials', null, null, null,
    `select count(*)::int as n from local_credentials lc
      where lc.identity_id not in (
        select i.id from user_identities i where i.user_id = any($1::uuid[]))`,
    'contas'],
  // `audit.events` e a unica que CRESCE de proposito: a linha da remocao. Ela
  // nao tem chave estrangeira para `users` (migracao 20260917000004), entao
  // nenhuma das suas linhas cai por cascata -- a tabela inteira e "de fora",
  // e o esperado e exatamente +1.
  ['audit.events', null, null],
];

function vetores(manifesto) {
  return {
    conversas: manifesto.conversations,
    avisos: manifesto.found_reports,
    plaquinhas: manifesto.pet_tags.map((t) => t.id),
    pets: manifesto.pets.map((p) => p.id),
    // So o SLUG: a rota de criacao devolve `slug` e NAO devolve `id`
    // (`NetworkEventPublic` nao o lista como obrigatorio), entao e o slug que o
    // manifesto guarda e e por ele que o encontro e achado e apagado.
    encontrosSlug: manifesto.network_events.map((e) => e.slug),
    itens: manifesto.store_items.map((i) => i.id),
    parceiros: manifesto.store_partners.map((p) => p.id),
    profissionais: manifesto.professionals.map((p) => p.id),
    contas: manifesto.users.map((u) => u.id),
    apelidos: manifesto.handles,
  };
}

/**
 * Conta, em cada tabela afetada, as linhas que NAO sao da massa.
 *
 * "Nao sao da massa" e o COMPLEMENTO do manifesto -- `<> all(...)` --, e nao
 * um padrao de texto. Por isso a contagem cobre tambem o que a massa nao criou
 * e nao previu: a pergunta e "o `DELETE` levou algo a mais?", e quem responde
 * tem de ser cego ao que a massa pretendia ser.
 *
 * `coluna is null or ...`: linha com a coluna nula nao pertence a massa. Numa
 * tabela como `found_reports`, onde `reporter_user_id` e opcional, tratar nulo
 * como "da massa" esconderia justamente a linha anonima de terceiro.
 */
async function contarDeFora(cliente, manifesto) {
  const v = vetores(manifesto);
  const fora = {};
  for (const [tabela, coluna, grupo, tipo, sqlProprio, grupoDoParametro] of AFETADAS) {
    if (sqlProprio !== undefined && sqlProprio !== null) {
      const { rows } = await cliente.query(sqlProprio, [v[grupoDoParametro]]);
      fora[tabela] = rows[0].n;
      continue;
    }
    if (coluna === null || grupo === null) {
      const { rows } = await cliente.query(`select count(*)::int as n from ${tabela}`);
      fora[tabela] = rows[0].n;
      continue;
    }
    const { rows } = await cliente.query(
      `select count(*)::int as n from ${tabela}
        where ${coluna} is null or ${coluna} <> all($1::${tipo ?? 'uuid[]'})`,
      [v[grupo]],
    );
    fora[tabela] = rows[0].n;
  }
  return fora;
}

/**
 * A conferencia previa. Procura linha de FORA ligada a linha DE DENTRO.
 *
 * Ela nao conserta nada e nao decide nada: ela RECUSA. Ver o aviso 1 do
 * cabecalho -- o que esta em jogo e o bloqueio, a conexao e a denuncia de
 * terceiro, e nenhum dos tres e meu para resolver.
 */
async function conferirFronteira(cliente, manifesto) {
  const contas = manifesto.users.map((u) => u.id);
  const profissionais = manifesto.professionals.map((p) => p.id);
  const conversas = manifesto.conversations;
  const achados = [];

  const perguntar = async (rotulo, sql, parametros) => {
    const { rows } = await cliente.query(sql, parametros);
    if (rows.length > 0) {
      achados.push(`${rotulo}: ${String(rows.length)} linha(s) -- ${JSON.stringify(rows.slice(0, 5))}`);
    }
  };

  await perguntar(
    'bloqueio de alguem DE FORA contra uma conta da massa (a linha dele morre no DELETE)',
    `select blocker_user_id, blocked_user_id from user_blocks
      where blocked_user_id = any($1::uuid[]) and blocker_user_id <> all($1::uuid[])`,
    [contas],
  );
  await perguntar(
    'bloqueio de uma conta da massa contra alguem DE FORA',
    `select blocker_user_id, blocked_user_id from user_blocks
      where blocker_user_id = any($1::uuid[]) and blocked_user_id <> all($1::uuid[])`,
    [contas],
  );
  await perguntar(
    'conexao com uma ponta DE FORA (a linha do outro lado morre no DELETE)',
    `select requester_user_id, addressee_user_id, state from user_connections
      where (requester_user_id = any($1::uuid[])) <> (addressee_user_id = any($1::uuid[]))`,
    [contas],
  );
  await perguntar(
    'denuncia de perfil envolvendo a massa e alguem DE FORA (fila de moderacao)',
    `select reporter_user_id, subject_user_id, resolved_at from profile_reports
      where (reporter_user_id = any($1::uuid[])) <> (subject_user_id = any($1::uuid[]))`,
    [contas],
  );
  await perguntar(
    'denuncia de foto envolvendo a massa e alguem DE FORA',
    `select reporter_user_id, owner_user_id, resolved_at from photo_reports
      where (reporter_user_id = any($1::uuid[])) <> (owner_user_id = any($1::uuid[]))`,
    [contas],
  );
  await perguntar(
    'denuncia de publicacao envolvendo a massa e alguem DE FORA',
    `select reporter_user_id, author_user_id, resolved_at from publication_reports
      where (reporter_user_id = any($1::uuid[])) <> (author_user_id = any($1::uuid[]))`,
    [contas],
  );
  await perguntar(
    'denuncia de conversa da massa (cai por cascata da conversa)',
    'select conversation_id, reporter_role from conversation_reports where conversation_id = any($1::uuid[])',
    [conversas],
  );
  await perguntar(
    'avaliacao DE FORA numa entrada de diretorio da massa',
    `select id, professional_id, author_user_id from professional_reviews
      where professional_id = any($1::uuid[]) and author_user_id <> all($2::uuid[])`,
    [profissionais, contas],
  );
  await perguntar(
    'avaliacao de uma conta da massa numa entrada DE FORA',
    `select id, professional_id, author_user_id from professional_reviews
      where author_user_id = any($1::uuid[]) and professional_id <> all($2::uuid[])`,
    [contas, profissionais],
  );
  await perguntar(
    'indicacao de diretorio feita por conta da massa e JA APROVADA (aponta para entrada de verdade)',
    `select id, suggested_by_user_id, approved_entry_id from directory_suggestions
      where suggested_by_user_id = any($1::uuid[]) and approved_entry_id is not null`,
    [contas],
  );
  await perguntar(
    'pedido de presenca DE FORA num encontro da massa',
    `select r.id, r.event_id, r.user_id from network_event_join_requests r
       join network_events e on e.id = r.event_id
      where e.slug = any($1::text[]) and r.user_id <> all($2::uuid[])`,
    [manifesto.network_events.map((e) => e.slug), contas],
  );
  await perguntar(
    'pedido de presenca de conta da massa num encontro DE FORA',
    `select r.id, r.event_id, r.user_id from network_event_join_requests r
       join network_events e on e.id = r.event_id
      where r.user_id = any($1::uuid[]) and e.slug <> all($2::text[])`,
    [contas, manifesto.network_events.map((e) => e.slug)],
  );
  await perguntar(
    'transferencia de pet entre a massa e alguem DE FORA',
    `select id, pet_id, from_user_id, to_user_id from pet_transfers
      where from_user_id = any($1::uuid[]) or to_user_id = any($1::uuid[])`,
    [contas],
  );
  await perguntar(
    'conversa de FORA em que uma conta da massa e o achador (a conversa dele perde o outro lado)',
    `select id, tutor_user_id, finder_user_id from conversations
      where finder_user_id = any($1::uuid[]) and id <> all($2::uuid[])`,
    [contas, conversas],
  );

  return achados;
}

async function principal() {
  const i = process.argv.indexOf('--manifesto');
  if (i === -1 || process.argv[i + 1] === undefined) {
    throw new Error('passe --manifesto <caminho.json>');
  }
  const somenteConferir = process.argv.includes('--conferir');
  const manifesto = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));

  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL ausente.');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  try {
    const { rows: catalogo } = await cliente.query(
      `select current_database() as banco,
              shobj_description(d.oid, 'pg_database') as marca
         from pg_database d where d.datname = current_database()`,
    );
    if (catalogo[0]?.marca !== MARCA_DE_HOMOLOGACAO) {
      throw new Error(
        'RECUSADO: este banco nao se declara como homologacao.\n'
        + `  marca lida: ${String(catalogo[0]?.marca)}\n`
        + `  esperada:   ${MARCA_DE_HOMOLOGACAO}\n`
        + 'REMOCAO EM PRODUCAO NAO E OPERACAO DE ROTEIRO.',
      );
    }

    // O gatilho que faz a ordem funcionar. Se ele nao estiver no banco, o
    // `DELETE` em `users` reprova com 23514, e vale dizer isso ANTES de abrir
    // transacao em vez de depois de o erro aparecer.
    const { rows: gatilho } = await cliente.query(
      `select t.tgname, p.proname from pg_trigger t
         join pg_proc p on p.oid = t.tgfoid
        where t.tgname = 'handles_orfao_reservado'`,
    );
    if (gatilho.length === 0) {
      throw new Error(
        'RECUSADO: o gatilho `handles_orfao_reservado` (funcao '
        + '`handles_orfao_vira_reservado`, migracao 20261019000004) nao esta neste '
        + 'banco. Sem ele, apagar conta com apelido reprova com 23514 pelo CHECK '
        + '`handles_pessoa_tem_dono`. Migre antes de remover.',
      );
    }
    console.error(`gatilho presente: ${gatilho[0].tgname} -> ${gatilho[0].proname}()`);

    const fronteira = await conferirFronteira(cliente, manifesto);
    if (fronteira.length > 0) {
      throw new Error(
        'RECUSADO: ha linha DE FORA ligada a massa. Apagar agora levaria dado que\n'
        + 'nao e da massa -- bloqueio, conexao ou denuncia de terceiro saem em\n'
        + 'SILENCIO por `ON DELETE CASCADE`. O que fazer com cada uma e decisao\n'
        + 'humana, nao desta ferramenta:\n  '
        + fronteira.join('\n  '),
      );
    }
    console.error('fronteira limpa: nenhuma linha de fora ligada a massa.');

    const antes = await contarDeFora(cliente, manifesto);
    if (somenteConferir) {
      console.error('\n--conferir: nada foi apagado. Linhas DE FORA por tabela:');
      console.error(JSON.stringify(antes, null, 2));
      return;
    }

    const v = vetores(manifesto);
    await cliente.query('begin');
    const apagados = {};
    const apagar = async (rotulo, sql, parametros) => {
      const r = await cliente.query(sql, parametros);
      apagados[rotulo] = r.rowCount;
    };

    // 1..4 conversa e o que pende dela.
    await apagar('conversation_messages',
      'delete from conversation_messages where conversation_id = any($1::uuid[])', [v.conversas]);
    await apagar('conversation_reads',
      'delete from conversation_reads where conversation_id = any($1::uuid[])', [v.conversas]);
    await apagar('conversations',
      'delete from conversations where id = any($1::uuid[])', [v.conversas]);
    // 5. `conversation_list_views` e por conta, nao por conversa: cai em 12.

    // 6..7 aviso de achado ANTES da plaquinha (`tag_id` e ON DELETE RESTRICT).
    await apagar('match_candidates',
      'delete from match_candidates where found_report_id = any($1::uuid[])', [v.avisos]);
    await apagar('found_reports',
      'delete from found_reports where id = any($1::uuid[])', [v.avisos]);

    // 8..9 plaquinha e as leituras dela.
    await apagar('tag_scans',
      'delete from tag_scans where tag_id = any($1::uuid[])', [v.plaquinhas]);
    await apagar('pet_tags',
      'delete from pet_tags where id = any($1::uuid[])', [v.plaquinhas]);

    // 10 pets.
    await apagar('pets', 'delete from pets where id = any($1::uuid[])', [v.pets]);

    // 11 encontros da Rede, pelo slug (que e UNIQUE e e o que a rota devolve).
    await apagar('network_events',
      'delete from network_events where slug = any($1::text[])', [v.encontrosSlug]);

    // 12..13 Loja: itens antes do parceiro (`partner_id` nao tem ON DELETE).
    await apagar('store_items',
      'delete from store_items where id = any($1::uuid[])', [v.itens]);
    await apagar('store_partners',
      'delete from store_partners where id = any($1::uuid[])', [v.parceiros]);

    // 14 diretorio.
    await apagar('professionals',
      'delete from professionals where id = any($1::uuid[])', [v.profissionais]);

    // 15 localizacao de referencia, explicitamente e nao por cascata: ela e a
    // unica coisa desta massa que guarda ONDE alguem esteve.
    await apagar('user_reference_locations',
      'delete from user_reference_locations where user_id = any($1::uuid[])', [v.contas]);

    // 16 as contas. Daqui caem por cascata `user_identities` (e com ela
    // `local_credentials`), `user_roles`, `verification_tokens`,
    // `refresh_tokens`, `reauth_tokens`, `user_devices`,
    // `conversation_list_views`, `notification_items`,
    // `notification_counter_state`, `catalog_upload_intents` e
    // `upload_intents`. A cascata e aceitavel AQUI porque a conferencia de
    // fronteira ja provou que nenhuma dessas linhas pertence a alguem de fora.
    await apagar('users', 'delete from users where id = any($1::uuid[])', [v.contas]);

    // 17 os apelidos, DEPOIS das contas. Sem este passo o lote deixa 30
    // apelidos em `kind = 'reservado'` -- ver o aviso 2 do cabecalho.
    const { rows: orfaos } = await cliente.query(
      `select handle, kind, user_id from handles where handle = any($1::citext[])`,
      [v.apelidos],
    );
    const inesperados = orfaos.filter((h) => h.user_id !== null || h.kind !== 'reservado');
    if (inesperados.length > 0) {
      throw new Error(
        'RECUSADO no meio da transacao: apos apagar as contas, estes apelidos nao\n'
        + 'ficaram orfaos e reservados como o gatilho promete. Nao apago apelido que\n'
        + `ainda tem dono:\n  ${JSON.stringify(inesperados)}`,
      );
    }
    await apagar('handles', 'delete from handles where handle = any($1::citext[])', [v.apelidos]);

    // 18 a marca da remocao na trilha. A linha da CRIACAO fica: as duas juntas
    // contam a historia inteira do lote, e nenhuma das duas tem chave
    // estrangeira para `users`, entao as duas sobrevivem ao expurgo.
    await cliente.query(
      `insert into audit.events (
         id, actor_kind, action, resource_kind, resource_id, before, metadata
       ) values ($1, 'system', 'massa_de_teste.lote_removido', 'lote_de_massa', $2, $3, $4)`,
      [
        randomUUID(), manifesto.lote, JSON.stringify(apagados),
        JSON.stringify({
          lote_criado_em: manifesto.criado_em,
          audit_event_da_criacao: manifesto.marcas?.audit_event_id ?? null,
          removido_por: 'infra/massa-de-homologacao/remover.mjs',
          criterio: 'identificadores do manifesto, nenhum padrao de texto',
        }),
      ],
    );

    // A PROVA. Conta de novo o que NAO e da massa e compara.
    const depois = await contarDeFora(cliente, manifesto);
    const divergencias = [];
    for (const tabela of Object.keys(antes)) {
      // `audit.events` cresce de proposito: a linha da remocao acabou de entrar.
      if (tabela === 'audit.events') {
        if (depois[tabela] !== antes[tabela] + 1) {
          divergencias.push(`${tabela}: ${String(antes[tabela])} -> ${String(depois[tabela])} (esperado +1)`);
        }
        continue;
      }
      if (depois[tabela] !== antes[tabela]) {
        divergencias.push(`${tabela}: ${String(antes[tabela])} -> ${String(depois[tabela])}`);
      }
    }
    if (divergencias.length > 0) {
      await cliente.query('rollback');
      throw new Error(
        'DESFEITO (ROLLBACK): o `DELETE` levou linha que NAO e da massa. Nada foi\n'
        + `apagado. Tabelas em que a contagem de fora mudou:\n  ${divergencias.join('\n  ')}`,
      );
    }

    // E a outra metade: a massa saiu MESMO?
    const restos = [];
    const sobrou = async (tabela, coluna, chaves, tipo = 'uuid[]') => {
      const { rows } = await cliente.query(
        `select count(*)::int as n from ${tabela} where ${coluna} = any($1::${tipo})`,
        [chaves],
      );
      if (rows[0].n !== 0) restos.push(`${tabela}: ${String(rows[0].n)}`);
    };
    await sobrou('users', 'id', v.contas);
    await sobrou('handles', 'handle', v.apelidos, 'citext[]');
    await sobrou('pets', 'id', v.pets);
    await sobrou('pet_tags', 'id', v.plaquinhas);
    await sobrou('found_reports', 'id', v.avisos);
    await sobrou('conversations', 'id', v.conversas);
    await sobrou('conversation_messages', 'conversation_id', v.conversas);
    await sobrou('professionals', 'id', v.profissionais);
    await sobrou('store_items', 'id', v.itens);
    await sobrou('store_partners', 'id', v.parceiros);
    await sobrou('network_events', 'slug', v.encontrosSlug, 'text[]');
    await sobrou('user_reference_locations', 'user_id', v.contas);
    if (restos.length > 0) {
      await cliente.query('rollback');
      throw new Error(`DESFEITO (ROLLBACK): sobrou massa:\n  ${restos.join('\n  ')}`);
    }

    await cliente.query('commit');
    console.error('\nAPAGADO, em uma transacao. Linhas por tabela:');
    console.error(JSON.stringify(apagados, null, 2));
    console.error('\nPROVA: a contagem de linhas que NAO sao da massa ficou IGUAL');
    console.error('em todas as tabelas afetadas (audit.events +1, a linha da remocao).');
  } finally {
    await cliente.end();
  }
}

if (process.argv[1]?.endsWith('remover.mjs')) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
