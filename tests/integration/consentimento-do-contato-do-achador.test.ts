/**
 * O CONTATO DE QUEM ACHOU CHEGA AO TUTOR, E SÓ SOB CONSENTIMENTO GRAVADO.
 *
 * Decisão do cliente, 03/11/2026, literal: *"o achador vai enviar os dados e ter
 * um botão de 'aceito compartilhar meus dados com o tutor do pet' com o objetivo
 * exclusivamente dele conseguir entrar em contato para recuperar seu pet"*.
 *
 * ## O que só existe no banco, e por isso é medido aqui
 *
 * - **a atomicidade**: a mensagem que leva o contato e a linha de consentimento
 *   são gravadas na MESMA transação. O estado perigoso é a mensagem existir sem a
 *   linha — contato divulgado sem prova de que foi autorizado —, e só com Postgres
 *   de verdade dá para provar que uma falha no meio não o produz. Um dublê
 *   devolveria o que o teste mandasse;
 * - **os `CHECK` novos**: consentimento sem texto, com texto vazio ou com
 *   finalidade que não é a declarada é recusado pelo BANCO, e não pela disciplina
 *   de quem escreve o repositório. É o replante de `terms_acceptances`;
 * - **o `system_kind` novo**: `finder_contact` passou a ser valor aceito, e
 *   nenhum outro valor passou;
 * - **o corpo da mensagem em CLARO**: a redação (`redigirCanalMediado`) retira
 *   telefone e e-mail de toda mensagem humana, e aqui eles TÊM de atravessar.
 *   Isso se mede lendo a linha gravada, não o retorno do serviço;
 * - **a direção única**: a leitura do achador sobre a mesma conversa não traz
 *   nada do tutor.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarConversationRepository } from '../../src/modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import type { ConversationRepository } from '../../src/modules/messaging/ports/conversation-repository.js';
import {
  ESPECIE_DA_DIVULGACAO,
  FINALIDADE_DO_CONTATO_DO_ACHADOR,
  FINALIDADE_PARA_O_TUTOR,
} from '../../src/modules/messaging/domain/divulgacao-de-contato.js';
import {
  VERSAO_ATUAL_DO_CONSENTIMENTO,
  textoDoConsentimento,
} from '../../src/modules/found/domain/consentimento-de-contato.js';
import type {
  ConversationId,
  FoundReportId,
  PetId,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const ALFABETO_DA_PLAQUINHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Valores claramente falsos: nada de dado pessoal de verdade em teste. */
const DO_ACHADOR = {
  nome: 'Ana Paula de Teste',
  email: `achador@${DOMINIO_DE_TESTE}`,
  telefone: '+5511900000001',
};
/**
 * O tutor é criado POR CENÁRIO, e por isso e-mail e telefone dele são únicos:
 * `users_email_unico_ativo` recusa o segundo, e um valor fixo aqui fez os seis
 * primeiros cenários desta suíte reprovarem por colisão — e não pelo que medem.
 */
let contaDeTutor = 0;
function proximoTutor(): { readonly email: string; readonly telefone: string } {
  contaDeTutor += 1;
  return {
    email: `tutor-${String(contaDeTutor)}@${DOMINIO_DE_TESTE}`,
    telefone: `+55119220${String(10_000 + contaDeTutor)}`,
  };
}

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let conversas: ConversationRepository;
let especie: string;
let porte: string;

function token(): string {
  return randomBytes(32).toString('base64url');
}

function resumo(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

async function criarConta(nome: string, email: string, telefone: string | null): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, display_name, phone_e164, public_ref)
     VALUES ($1, $2, $3, $4,
             translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
                       '+/=', '-_'))`,
    [id, email, nome, telefone],
  );
  return id;
}

/** Um aviso de plaquinha com conversa aberta: o cenário real desta decisão. */
async function cenario(): Promise<{
  readonly aviso: FoundReportId;
  readonly conversa: ConversationId;
  readonly token: string;
  readonly doTutor: { readonly email: string; readonly telefone: string };
}> {
  const doTutor = proximoTutor();
  const tutor = await criarConta('Tutor de Teste', doTutor.email, doTutor.telefone);
  const pet = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [pet, tutor, 'Aurora', especie, porte],
  );

  const tag = randomUUID();
  const codigo = createHash('sha256').update(`tag-${tag}`).digest();
  const sufixo = [...codigo.subarray(0, 4)]
    .map((b) => ALFABETO_DA_PLAQUINHA[b % ALFABETO_DA_PLAQUINHA.length])
    .join('');
  await cliente.query(
    'INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix) VALUES ($1,$2,$3,$4)',
    [tag, pet, codigo, sufixo],
  );

  const aviso = randomUUID() as FoundReportId;
  const bruto = token();
  await cliente.query(
    `INSERT INTO found_reports
       (id, origin, tag_id, pet_id, finder_token_hash, finder_token_expires_at, found_at, created_at)
     VALUES ($1, 'tag_scan', $2, $3, $4, now() + interval '30 days', now(), now())`,
    [aviso, tag, pet, resumo(bruto)],
  );

  const conversa = randomUUID() as ConversationId;
  await conversas.abrirPorAviso({
    id: conversa,
    foundReportId: aviso,
    petId: pet,
    achadorComConta: null,
  });

  return { aviso, conversa, token: bruto, doTutor };
}

/**
 * `count(*)` volta como NÚMERO neste projeto, e não como a string que o `pg`
 * devolveria para `bigint` por padrão — há parser de `int8` configurado. Comparar
 * contra `'0'` fez três casos desta suíte reprovarem com `0 !== '0'`, medindo o
 * parser em vez do comportamento.
 */
function contagem(linhas: readonly { readonly n: string | number }[]): number {
  const bruto = linhas[0]?.n;
  assert.ok(bruto !== undefined, 'a consulta de contagem nao devolveu linha');
  return Number(bruto);
}

interface Divulgavel {
  readonly nome?: string | undefined;
  readonly email?: string | undefined;
  readonly telefone?: string | undefined;
}

async function divulgar(
  alvo: { readonly aviso: FoundReportId; readonly token: string },
  contato: Divulgavel = DO_ACHADOR,
  texto: string = textoDoConsentimento(VERSAO_ATUAL_DO_CONSENTIMENTO) ?? '',
): Promise<void> {
  const gravado = await conversas.divulgarContatoSobConsentimento(resumo(alvo.token), {
    id: randomUUID(),
    mensagemId: randomUUID(),
    foundReportId: alvo.aviso,
    finalidade: FINALIDADE_DO_CONTATO_DO_ACHADOR,
    versaoDoConsentimento: VERSAO_ATUAL_DO_CONSENTIMENTO,
    textoDoConsentimento: texto,
    contato: {
      nome: contato.nome,
      email: contato.email,
      telefone: contato.telefone,
    },
    nomeDoPet: 'Aurora',
  });
  assert.ok(gravado !== undefined, 'o resumo do token nao resolveu para conversa nenhuma');
}

void describe('o consentimento do contato do achador, contra Postgres de verdade', () => {
  before(async () => {
    assert.ok(CONEXAO !== undefined, 'DATABASE_URL ausente: esta suite precisa de banco');
    banco = createDb(CONEXAO);
    db = banco.db;
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();
    conversas = criarConversationRepository(db);

    const { rows: especies } = await cliente.query<{ code: string }>(
      'SELECT code FROM ref_species LIMIT 1',
    );
    const { rows: portes } = await cliente.query<{ code: string }>(
      'SELECT code FROM ref_sizes LIMIT 1',
    );
    especie = especies[0]?.code ?? 'dog';
    porte = portes[0]?.code ?? 'medium';
  });

  after(async () => {
    await cliente.end();
    await banco.close();
  });

  void it('CASO 2 — o contato chega ao tutor EM CLARO, como mensagem de sistema', async () => {
    const alvo = await cenario();
    await divulgar(alvo);

    const { rows } = await cliente.query<{
      body: string;
      system_kind: string | null;
      sender_role: string;
      redactions: unknown;
    }>(
      `SELECT body, system_kind, sender_role, redactions
         FROM conversation_messages
        WHERE conversation_id = $1 AND system_kind = $2`,
      [alvo.conversa, ESPECIE_DA_DIVULGACAO],
    );

    assert.equal(rows.length, 1, 'a divulgacao nao chegou a conversa do tutor');
    const mensagem = rows[0]!;
    assert.equal(mensagem.sender_role, 'system', 'mensagem humana seria REDIGIDA');

    // Os tres campos atravessam a redacao, porque foi para isso que a pessoa
    // consentiu. Se `redigirCanalMediado` tivesse passado por aqui, o telefone
    // viraria `[telefone removido]` e o e-mail `[e-mail removido]`.
    assert.ok(mensagem.body.includes(DO_ACHADOR.nome), mensagem.body);
    assert.ok(mensagem.body.includes(DO_ACHADOR.email), mensagem.body);
    assert.ok(mensagem.body.includes(DO_ACHADOR.telefone), mensagem.body);
    assert.ok(!mensagem.body.includes('removido'), `o corpo foi redigido: ${mensagem.body}`);

    // A FINALIDADE que o tutor le esta escrita na mensagem, junto do contato.
    assert.ok(
      mensagem.body.includes(FINALIDADE_PARA_O_TUTOR),
      `o tutor recebeu contato sem a finalidade escrita: ${mensagem.body}`,
    );
    assert.ok(
      mensagem.body.includes('Nao use para mais nada') ||
        mensagem.body.includes('Não use para mais nada'),
      mensagem.body,
    );
  });

  void it('CASO 3 — o registro guarda o texto lido, o instante e a finalidade', async () => {
    const alvo = await cenario();
    const antes = new Date();
    await divulgar(alvo);

    const { rows } = await cliente.query<{
      purpose: string;
      consent_version: string;
      consent_text: string;
      consented_at: Date;
    }>(
      `SELECT purpose, consent_version, consent_text, consented_at
         FROM finder_contact_consents
        WHERE found_report_id = $1`,
      [alvo.aviso],
    );

    assert.equal(rows.length, 1, 'o consentimento nao foi registrado');
    const linha = rows[0]!;
    assert.equal(linha.purpose, FINALIDADE_DO_CONTATO_DO_ACHADOR);
    assert.equal(linha.consent_version, VERSAO_ATUAL_DO_CONSENTIMENTO);
    assert.equal(
      linha.consent_text,
      textoDoConsentimento(VERSAO_ATUAL_DO_CONSENTIMENTO),
      'o texto gravado nao e o texto publicado daquela versao',
    );
    assert.ok(
      linha.consented_at.getTime() >= antes.getTime() - 5_000,
      `o instante do consentimento nao e o da gravacao: ${linha.consented_at.toISOString()}`,
    );

    // APENDA: um segundo consentimento do mesmo aviso ACRESCENTA linha, e nao
    // sobrescreve a primeira. O historico e a evidencia.
    await divulgar(alvo);
    const { rows: depois } = await cliente.query<{ n: string | number }>(
      'SELECT count(*) AS n FROM finder_contact_consents WHERE found_report_id = $1',
      [alvo.aviso],
    );
    assert.equal(contagem(depois), 2, 'o segundo consentimento sobrescreveu o primeiro');
  });

  void it('CASO 4 — a leitura do achador nao traz telefone nem e-mail do TUTOR', async () => {
    const alvo = await cenario();
    await divulgar(alvo);

    const mensagens = await conversas.mensagensPeloTokenDoAchador(resumo(alvo.token), {
      limit: 50,
      deslocamento: 0,
    });
    assert.ok(mensagens.length > 0, 'sem mensagem nao ha o que medir nesta direcao');
    assert.ok(
      mensagens.some((m) => m.body.includes(DO_ACHADOR.telefone)),
      'a divulgacao do PROPRIO achador nao esta na conversa: o caso nao mede nada',
    );

    const tudo = JSON.stringify(mensagens);
    for (const valor of [alvo.doTutor.email, alvo.doTutor.telefone]) {
      assert.ok(!tudo.includes(valor), `dado do TUTOR chegou ao achador: ${valor}`);
    }
  });

  void it('o BANCO recusa consentimento sem texto, com texto vazio e com finalidade estranha', async () => {
    const alvo = await cenario();
    const linha = (texto: string | null, finalidade: string): Promise<unknown> =>
      cliente.query(
        `INSERT INTO finder_contact_consents
           (id, found_report_id, purpose, consent_version, consent_text)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), alvo.aviso, finalidade, VERSAO_ATUAL_DO_CONSENTIMENTO, texto],
      );

    // Sem texto: `NOT NULL`.
    await assert.rejects(
      () => linha(null, FINALIDADE_DO_CONTATO_DO_ACHADOR),
      (erro: { code?: string }) => erro.code === '23502',
      'consentimento sem o texto lido foi aceito',
    );

    // Texto em branco: o `CHECK` contra vazio, que e o replante de
    // `terms_acceptances` — ali a coluna anulavel deixou 36 linhas sem versao.
    for (const branco of ['', '   ']) {
      await assert.rejects(
        () => linha(branco, FINALIDADE_DO_CONTATO_DO_ACHADOR),
        (erro: { code?: string; constraint?: string }) =>
          erro.code === '23514' &&
          erro.constraint === 'finder_contact_consents_texto_nao_vazio',
        `texto \`${branco}\` foi aceito como consentimento`,
      );
    }

    // Finalidade fora da lista: ampliar a finalidade e ampliar o consentimento
    // sem pedir de novo.
    await assert.rejects(
      () => linha('li e aceitei', 'marketing'),
      (erro: { code?: string; constraint?: string }) =>
        erro.code === '23514' &&
        erro.constraint === 'finder_contact_consents_finalidade_conhecida',
      'finalidade que ninguem declarou foi aceita',
    );
  });

  void it('divulgar e gravar o consentimento sao UMA transacao: nem metade sai', async () => {
    const alvo = await cenario();

    // Texto em branco faz `recadoDaDivulgacaoDeContato` LANCAR depois de a linha
    // de consentimento ja ter sido inserida na transacao. Lancar e o que desfaz:
    // `return` comitaria, porque o Kysely so desfaz ao lancar.
    await assert.rejects(
      () => divulgar(alvo, DO_ACHADOR, '   '),
      'texto em branco nao derrubou a divulgacao',
    );

    const { rows: consentimentos } = await cliente.query<{ n: string | number }>(
      'SELECT count(*) AS n FROM finder_contact_consents WHERE found_report_id = $1',
      [alvo.aviso],
    );
    const { rows: mensagens } = await cliente.query<{ n: string | number }>(
      'SELECT count(*) AS n FROM conversation_messages WHERE conversation_id = $1 AND system_kind = $2',
      [alvo.conversa, ESPECIE_DA_DIVULGACAO],
    );

    assert.equal(contagem(consentimentos), 0, 'a linha de consentimento ficou gravada');
    assert.equal(contagem(mensagens), 0, 'a mensagem de divulgacao ficou gravada');
  });

  void it('sem contato nenhum para divulgar, nada e gravado', async () => {
    const alvo = await cenario();
    await assert.rejects(
      () => divulgar(alvo, {}),
      'consentir em compartilhar NADA produziu registro',
    );

    const { rows } = await cliente.query<{ n: string | number }>(
      'SELECT count(*) AS n FROM finder_contact_consents WHERE found_report_id = $1',
      [alvo.aviso],
    );
    assert.equal(contagem(rows), 0);
  });

  void it('`finder_contact` e valor aceito de `system_kind`, e `contato_do_achador` nao', async () => {
    const alvo = await cenario();
    const comEspecie = (valor: string): Promise<unknown> =>
      cliente.query(
        `INSERT INTO conversation_messages
           (id, conversation_id, sender_role, body, redactions, system_kind)
         VALUES ($1, $2, 'system', 'teste', '[]'::jsonb, $3)`,
        [randomUUID(), alvo.conversa, valor],
      );

    await comEspecie(ESPECIE_DA_DIVULGACAO);
    await assert.rejects(
      () => comEspecie('contato_do_achador'),
      (erro: { code?: string; constraint?: string }) =>
        erro.code === '23514' &&
        erro.constraint === 'conversation_messages_system_kind_conhecido',
      'a lista de especies aceitou um valor que ninguem declarou',
    );
  });
});
