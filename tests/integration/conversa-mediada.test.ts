/**
 * A conversa mediada contra Postgres de verdade (BICHUS-43).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * O autor da BICHUS-91 transformou `revogarDoDono` num `no-op` e a suíte
 * unitária inteira ficou verde: o dublê apaga do `Map` de qualquer jeito. Só a
 * integração reprovou. A mesma armadilha é maior aqui, porque a conversa tem
 * **dois** participantes e a autorização não é "isto é meu", é "eu sou parte
 * disto".
 *
 * Nada do que está abaixo existe fora do banco:
 *
 * - **o `INSERT ... SELECT`** que deriva o tutor e o caso aberto a partir do
 *   pet. Um dublê aceitaria qualquer `tutor_user_id` que o chamador passasse —
 *   e o chamador é o caminho público do aviso;
 * - **`ON CONFLICT (found_report_id) DO NOTHING`**, que é a idempotência da
 *   abertura. Um `SELECT` antes do `INSERT` perde a corrida entre duas
 *   requisições da fila offline do mesmo cliente, e nenhum teste unitário
 *   consegue ter duas;
 * - **a cláusula `WHERE` do chamador exercida sobre linhas reais**. O caso do
 *   terceiro abaixo é o que `autorizacao-na-clausula-where.test.ts` não alcança:
 *   ele lê o SQL, este executa;
 * - **`count(distinct coalesce(case_id, id))`**, que é a diferença entre contar
 *   casos e contar mensagens — o critério 17 inteiro;
 * - **os `CHECK`**, inclusive o de 4000 caracteres do corpo. A redação CRESCE o
 *   texto, e uma coluna dimensionada pelo limite de entrada transformaria a
 *   mensagem mais evasiva de todas num 500;
 * - **`ON DELETE CASCADE`** a partir do pet.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose sai do caminho do worktree e o banco
 * é derrubado com `-v` no fim. Nada aqui toca a pilha de desenvolvimento.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarConversationRepository } from '../../src/modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import type { ConversationRepository } from '../../src/modules/messaging/ports/conversation-repository.js';
import type {
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

const AGORA = 1_790_000_000_000 as Instant;
const UM_DIA = 24 * 60 * 60 * 1000;
const PAGINA = { limit: 20, depoisDe: undefined };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: ConversationRepository;
let especie: string;
let porte: string;
const contasCriadas: UserId[] = [];

async function criarConta(nome: string | null = null): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)', [
    id,
    `bichus43-${id}@${DOMINIO_DE_TESTE}`,
    nome,
  ]);
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId, nome = 'Aurora'): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [id, dono, nome, especie, porte],
  );
  return id;
}

/** Aviso avulso: `stray_report` não exige tag, e a conversa não depende dela. */
async function criarAviso(nomeDoAchador: string | null = null): Promise<FoundReportId> {
  const id = randomUUID() as FoundReportId;
  await cliente.query(
    `INSERT INTO found_reports
       (id, origin, finder_display_name, finder_token_hash, finder_token_expires_at, found_at)
     VALUES ($1, 'stray_report', $2, $3, now() + interval '30 days', now())`,
    [id, nomeDoAchador, Buffer.alloc(32, 0x5e)],
  );
  return id;
}

async function abrirConversa(
  pet: PetId,
  achador: UserId | null = null,
  nomeDoAchador: string | null = null,
): Promise<{ conversa: ConversationId; aviso: FoundReportId }> {
  const aviso = await criarAviso(nomeDoAchador);
  await repo.abrirPorAviso({
    id: randomUUID() as ConversationId,
    foundReportId: aviso,
    petId: pet,
    achadorComConta: achador,
  });
  const conversa = await repo.porAviso(aviso);
  assert.ok(conversa !== undefined, 'a conversa não foi aberta');
  return { conversa, aviso };
}

before(async () => {
  assert.ok(
    CONEXAO !== undefined && CONEXAO !== '',
    'DATABASE_URL não está definida. Esta suíte REPROVA sem banco em vez de se pular: ' +
      'um arquivo de integração que se pula sozinho termina verde e ocupa o lugar de um ' +
      'que funcionaria.',
  );
  banco = createDb(CONEXAO);
  db = banco.db;
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  repo = criarConversationRepository(db);

  const especies = await cliente.query<{ code: string }>('SELECT code FROM ref_species LIMIT 1');
  const portes = await cliente.query<{ code: string }>('SELECT code FROM ref_sizes LIMIT 1');
  assert.ok(
    especies.rows[0] !== undefined && portes.rows[0] !== undefined,
    'os dados de referência não estão na base: sem eles nenhum pet pode ser criado, e ' +
      'todos os casos abaixo passariam por não ter olhado para nada',
  );
  especie = especies.rows[0].code;
  porte = portes.rows[0].code;
});

after(async () => {
  if (contasCriadas.length > 0) {
    // `ON DELETE CASCADE` leva pets, conversas e mensagens junto — e isso é,
    // ele próprio, um dos casos abaixo.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.query('DELETE FROM found_reports WHERE finder_token_hash = $1', [
    Buffer.alloc(32, 0x5e),
  ]);
  await cliente.end();
  await banco.close();
});

void describe('a abertura deriva o tutor do pet, e não de quem chamou', () => {
  void it('o tutor gravado é o dono do pet, sem ninguém passá-lo', async () => {
    const tutor = await criarConta('Leandro Panegassi');
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);

    const linha = await cliente.query<{ tutor_user_id: string; pet_id: string }>(
      'SELECT tutor_user_id, pet_id FROM conversations WHERE id = $1',
      [conversa],
    );
    assert.equal(linha.rows[0]?.tutor_user_id, tutor);
    assert.equal(linha.rows[0]?.pet_id, pet);
  });

  void it('o caso ABERTO do pet entra sozinho, e o encerrado não', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const caso = randomUUID();
    await cliente.query(
      `INSERT INTO lost_cases (id, pet_id, owner_user_id, status, last_seen_at, last_seen_city, share_token)
       VALUES ($1,$2,$3,'open', now(), 'São Paulo', $4)`,
      [caso, pet, tutor, `tok-${caso}`],
    );
    const { conversa } = await abrirConversa(pet);
    const linha = await cliente.query<{ case_id: string | null }>(
      'SELECT case_id FROM conversations WHERE id = $1',
      [conversa],
    );
    assert.equal(linha.rows[0]?.case_id, caso);
  });

  void it('pet excluído logicamente NÃO abre conversa', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    await cliente.query('UPDATE pets SET deleted_at = now() WHERE id = $1', [pet]);
    const aviso = await criarAviso();
    await repo.abrirPorAviso({
      id: randomUUID() as ConversationId,
      foundReportId: aviso,
      petId: pet,
      achadorComConta: null,
    });
    assert.equal(await repo.porAviso(aviso), undefined);
  });

  void it('o tutor escaneando a própria plaquinha NÃO abre conversa consigo mesmo', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const aviso = await criarAviso();
    await repo.abrirPorAviso({
      id: randomUUID() as ConversationId,
      foundReportId: aviso,
      petId: pet,
      achadorComConta: tutor,
    });
    assert.equal(await repo.porAviso(aviso), undefined);
  });

  void it('abrir duas vezes o MESMO aviso não cria a segunda conversa', async () => {
    // A idempotência é do índice único, e não de um `SELECT` antes do `INSERT`:
    // o reenvio da fila offline de um cliente sem rede chega duas vezes.
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const aviso = await criarAviso();
    for (let i = 0; i < 2; i += 1) {
      await repo.abrirPorAviso({
        id: randomUUID() as ConversationId,
        foundReportId: aviso,
        petId: pet,
        achadorComConta: null,
      });
    }
    const contagem = await cliente.query<{ n: string }>(
      'SELECT count(*) AS n FROM conversations WHERE found_report_id = $1',
      [aviso],
    );
    assert.equal(contagem.rows[0]?.n, '1');
  });
});

void describe('a autorização filtra de verdade, contra linhas que existem', () => {
  void it('o tutor lê a própria conversa e sabe o lado dele', async () => {
    const tutor = await criarConta('Leandro Panegassi');
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet, null, 'Ana Paula Ribeiro');

    const lida = await repo.buscarDoChamador(conversa, tutor);
    assert.ok(lida !== undefined, 'o tutor não enxergou a própria conversa');
    assert.equal(lida.papelDoChamador, 'tutor');
    assert.equal(lida.nomeDoTutor, 'Leandro Panegassi');
    assert.equal(lida.nomeDoAchador, 'Ana Paula Ribeiro');
  });

  void it('o achador COM conta lê a mesma conversa, e sabe o lado dele', async () => {
    const tutor = await criarConta('Leandro');
    const achador = await criarConta('Ana');
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet, achador);

    const lida = await repo.buscarDoChamador(conversa, achador);
    assert.ok(lida !== undefined, 'o achador com conta não enxergou a conversa dele');
    assert.equal(lida.papelDoChamador, 'finder');
  });

  void it('UM TERCEIRO não lê nada — e é isto que só o banco prova', async () => {
    // Um repositório que ignorasse o chamador continuaria verde na suíte
    // unitária inteira: lá quem recusa é o dublê. Aqui a linha existe, o
    // terceiro pede, e a consulta é quem decide.
    const tutor = await criarConta();
    const terceiro = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);

    assert.equal(await repo.buscarDoChamador(conversa, terceiro), undefined);
    assert.deepEqual(await repo.listarDoChamador(terceiro, PAGINA), []);
    assert.deepEqual(await repo.mensagens(conversa, terceiro, PAGINA), []);
  });

  void it('o terceiro não lê as MENSAGENS nem sabendo o id da conversa', async () => {
    const tutor = await criarConta();
    const terceiro = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await repo.gravarMensagemDeSistema({
      id: randomUUID(),
      conversationId: conversa,
      body: 'Alguém escaneou a tag da Aurora hoje às 15:30.',
      redactions: [],
    });

    assert.equal((await repo.mensagens(conversa, tutor, PAGINA)).length, 1);
    assert.deepEqual(await repo.mensagens(conversa, terceiro, PAGINA), []);
  });
});

void describe('o corpo cabe DEPOIS da redação, não antes', () => {
  void it('uma mensagem que cresce muito com as marcas ainda grava', async () => {
    // O contrato limita a ENTRADA a 1000 caracteres, e `[telefone removido]`
    // tem 19 para 11 dígitos. Uma coluna de 1000 transformaria a mensagem mais
    // evasiva de todas — a que é quase só telefone — num 500 por CHECK.
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);

    const marcada = '[telefone removido] '.repeat(120);
    assert.ok(marcada.length > 2000, 'a fixture precisa mesmo estourar 1000 caracteres');
    const gravada = await repo.gravarMensagem({
      id: randomUUID(),
      conversationId: conversa,
      senderRole: 'tutor',
      senderUserId: tutor,
      body: marcada,
      redactions: [{ kind: 'phone', hint: 'um número de telefone' }],
    });
    assert.equal(gravada.body.length, marcada.length);
    assert.deepEqual(
      gravada.redactions.map((r) => r.kind),
      ['phone'],
    );
  });
});

void describe('critério 17 — a contagem é de CASOS, e é o banco que conta', () => {
  void it('trinta mensagens num caso só contam 1', async () => {
    const tutor = await criarConta();
    const achador = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet, achador);

    for (let i = 0; i < 30; i += 1) {
      await repo.gravarMensagem({
        id: randomUUID(),
        conversationId: conversa,
        senderRole: 'finder',
        senderUserId: achador,
        body: `mensagem ${String(i)}`,
        redactions: [],
      });
    }
    assert.equal(
      await repo.contarCasosDistintosDaConta(achador, (AGORA - UM_DIA) as Instant),
      1,
      'trinta mensagens num caso só disparariam o gatilho do falso achador em série',
    );
  });

  void it('uma mensagem em três conversas de tutores diferentes conta 3', async () => {
    const achador = await criarConta();
    for (let i = 0; i < 3; i += 1) {
      const tutor = await criarConta();
      const pet = await criarPet(tutor);
      const { conversa } = await abrirConversa(pet, achador);
      await repo.gravarMensagem({
        id: randomUUID(),
        conversationId: conversa,
        senderRole: 'finder',
        senderUserId: achador,
        body: 'oi',
        redactions: [],
      });
    }
    assert.equal(await repo.contarCasosDistintosDaConta(achador, (AGORA - UM_DIA) as Instant), 3);
  });

  void it('a contagem por participante separa os dois lados', async () => {
    const tutor = await criarConta();
    const achador = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet, achador);

    await repo.gravarMensagem({
      id: randomUUID(),
      conversationId: conversa,
      senderRole: 'tutor',
      senderUserId: tutor,
      body: 'oi',
      redactions: [],
    });
    for (let i = 0; i < 3; i += 1) {
      await repo.gravarMensagem({
        id: randomUUID(),
        conversationId: conversa,
        senderRole: 'finder',
        senderUserId: achador,
        body: 'oi',
        redactions: [],
      });
    }
    const desde = (AGORA - UM_DIA) as Instant;
    assert.equal(await repo.contarMensagensDoParticipante(conversa, 'tutor', desde), 1);
    assert.equal(await repo.contarMensagensDoParticipante(conversa, 'finder', desde), 3);
  });
});

void describe('a retenção guarda a PRIMEIRA, e não notifica ninguém', () => {
  void it('a segunda retenção não sobrescreve o motivo nem o instante', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);

    await repo.reterParaRevisao(conversa, 'serial_finder', AGORA);
    await repo.reterParaRevisao(conversa, 'message_volume', (AGORA + 60_000) as Instant);

    const linha = await cliente.query<{ held_reason: string; held_for_review_at: Date }>(
      'SELECT held_reason, held_for_review_at FROM conversations WHERE id = $1',
      [conversa],
    );
    assert.equal(
      linha.rows[0]?.held_reason,
      'serial_finder',
      'a segunda retenção apagou há quanto tempo a primeira esperava, que é o único ' +
        'número pelo qual a fila de moderação se organiza',
    );
  });

  void it('a conversa retida continua respondendo aberta para o participante', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await repo.reterParaRevisao(conversa, 'serial_finder', AGORA);

    const lida = await repo.buscarDoChamador(conversa, tutor);
    assert.ok(lida !== undefined);
    assert.equal(lida.encerradaEm, null);
    assert.equal(lida.bloqueadaEm, null);
    assert.doesNotMatch(
      JSON.stringify(lida),
      /held|review/i,
      'a marca de retenção atravessou a borda do repositório: avisar o golpista de ' +
        'que ele foi marcado é ajudar o golpe a se corrigir (critérios 10 e 11)',
    );
  });
});

void describe('o banco recusa estado impossível', () => {
  void it('mensagem de sistema com remetente humano é recusada', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO conversation_messages (id, conversation_id, sender_role, sender_user_id, body)
           VALUES ($1, $2, 'system', $3, 'aviso')`,
          [randomUUID(), conversa, tutor],
        ),
      /conversation_messages_sistema_sem_remetente/,
      'um `sender_user_id` numa linha `system` faria o aviso do Bichu parecer escrito ' +
        'pelo tutor',
    );
  });

  void it('bloqueio pela metade é recusado', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await assert.rejects(
      () => cliente.query('UPDATE conversations SET blocked_at = now() WHERE id = $1', [conversa]),
      /conversations_bloqueio_completo/,
    );
  });

  void it('papel de remetente fora do vocabulário é recusado', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO conversation_messages (id, conversation_id, sender_role, body)
           VALUES ($1, $2, 'moderator', 'oi')`,
          [randomUUID(), conversa],
        ),
      /conversation_messages_sender_role_conhecido/,
    );
  });
});

void describe('a exclusão do pet leva a conversa junto', () => {
  void it('apagar o pet apaga a conversa e as mensagens', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor);
    const { conversa } = await abrirConversa(pet);
    await repo.gravarMensagemDeSistema({
      id: randomUUID(),
      conversationId: conversa,
      body: 'abertura',
      redactions: [],
    });

    await cliente.query('DELETE FROM pets WHERE id = $1', [pet]);
    const sobrou = await cliente.query<{ n: string }>(
      'SELECT count(*) AS n FROM conversation_messages WHERE conversation_id = $1',
      [conversa],
    );
    assert.equal(sobrou.rows[0]?.n, '0');
  });
});
