/**
 * O achador sem conta contra Postgres de verdade (BICHUS-41).
 *
 * ## O que só existe no banco
 *
 * - **a resolução do token até a conversa**, inclusive a do aviso AGRUPADO: o
 *   segundo escaneamento do mesmo achador em 6 h ganha token próprio e não
 *   ganha conversa, e o token dele precisa abrir a conversa do anterior. A
 *   subconsulta que faz isso é SQL com `JOIN` duplo em `found_reports`, e um
 *   dublê devolveria o que o teste mandasse;
 * - **a fronteira entre dois achadores**: o token de um nunca abre a conversa
 *   do outro, mesmo com a mesma plaquinha;
 * - **o `ON CONFLICT` do índice parcial** que soma a denúncia repetida ao item
 *   de fila aberto (`accept_and_deduplicate`);
 * - **os `CHECK` novos de `upload_intents`**: a intenção sem dono só existe em
 *   `finder_photo`, e sempre com aviso e referência;
 * - **a referência opaca escopada pelo token**: a de outro aviso não resolve.
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
import { criarFoundReportRepository } from '../../src/modules/found/adapters/persistence/kysely-found-report-repository.js';
import type { ConversationRepository } from '../../src/modules/messaging/ports/conversation-repository.js';
import type { FoundReportRepository } from '../../src/modules/found/ports/found-report-repository.js';
import { chaveDaFotoDoAchadorSemConta } from '../../src/modules/media/ports/chaves-de-objeto.js';
import type {
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const ALFABETO_DA_PLAQUINHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let conversas: ConversationRepository;
let achados: FoundReportRepository;
let especie: string;
let porte: string;
const contasCriadas: UserId[] = [];

function token(): string {
  return randomBytes(32).toString('base64url');
}

function resumo(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

async function criarConta(nome: string): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)', [
    id,
    `bichus41-${id}@${DOMINIO_DE_TESTE}`,
    nome,
  ]);
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [id, dono, 'Aurora', especie, porte],
  );
  return id;
}

async function criarPlaquinha(pet: PetId): Promise<string> {
  const id = randomUUID();
  const codigo = createHash('sha256').update(`tag-${id}`).digest();
  const sufixo = [...codigo.subarray(0, 4)]
    .map((b) => ALFABETO_DA_PLAQUINHA[b % ALFABETO_DA_PLAQUINHA.length])
    .join('');
  await cliente.query(
    'INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix) VALUES ($1,$2,$3,$4)',
    [id, pet, codigo, sufixo],
  );
  return id;
}

interface Aviso {
  readonly id: FoundReportId;
  readonly token: string;
}

/** Um aviso da plaquinha, com o token guardado SÓ como resumo, como a produção grava. */
async function criarAviso(
  tag: string,
  pet: PetId,
  identidade: Buffer | null,
  criadoHaMinutos = 0,
): Promise<Aviso> {
  const id = randomUUID() as FoundReportId;
  const bruto = token();
  await cliente.query(
    `INSERT INTO found_reports
       (id, origin, tag_id, pet_id, finder_identity_hash, finder_token_hash,
        finder_token_expires_at, found_at, notes, created_at)
     VALUES ($1, 'tag_scan', $2, $3, $4, $5, now() + interval '30 days', now(),
             'Estou com ele, liga 11 98765-4321', now() - make_interval(mins => $6))`,
    [id, tag, pet, identidade, resumo(bruto), criadoHaMinutos],
  );
  return { id, token: bruto };
}

async function abrirConversa(aviso: Aviso, pet: PetId): Promise<ConversationId> {
  await conversas.abrirPorAviso({
    id: randomUUID() as ConversationId,
    foundReportId: aviso.id,
    petId: pet,
    achadorComConta: null,
  });
  const conversa = await conversas.porAviso(aviso.id);
  assert.ok(conversa !== undefined, 'a conversa não foi aberta');
  return conversa;
}

before(async () => {
  assert.ok(
    CONEXAO !== undefined && CONEXAO !== '',
    'DATABASE_URL não está definida. Esta suíte REPROVA sem banco em vez de se pular.',
  );
  banco = createDb(CONEXAO);
  db = banco.db;
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  conversas = criarConversationRepository(db);
  achados = criarFoundReportRepository(db);

  const especies = await cliente.query<{ code: string }>('SELECT code FROM ref_species LIMIT 1');
  const portes = await cliente.query<{ code: string }>('SELECT code FROM ref_sizes LIMIT 1');
  assert.ok(
    especies.rows[0] !== undefined && portes.rows[0] !== undefined,
    'os dados de referência não estão na base: sem eles nenhum pet pode ser criado',
  );
  especie = especies.rows[0].code;
  porte = portes.rows[0].code;
});

after(async () => {
  if (contasCriadas.length > 0) {
    // Pets, plaquinhas, avisos da plaquinha, conversas, mensagens e denúncias
    // vão junto pela cascata a partir do dono.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o token resolve a conversa, e só a dele', () => {
  void it('o token do aviso abre a conversa do aviso, com o resumo gravado e o nome do tutor', async () => {
    const tutor = await criarConta('Leandro Panegassi');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('identidade-a'));
    const conversa = await abrirConversa(aviso, pet);

    const lida = await conversas.buscarPeloTokenDoAchador(resumo(aviso.token));
    assert.ok(lida !== undefined);
    assert.equal(lida.id, conversa);
    assert.equal(lida.nomeDoTutor, 'Leandro Panegassi');
    assert.deepEqual(Buffer.from(lida.resumoDoToken), resumo(aviso.token));
    assert.equal(lida.caso, null);
  });

  void it('o token do aviso AGRUPADO abre a conversa do aviso anterior do mesmo achador', async () => {
    const tutor = await criarConta('Marina');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const identidade = resumo('identidade-agrupada');
    const primeiro = await criarAviso(tag, pet, identidade, 120);
    const conversa = await abrirConversa(primeiro, pet);
    // O segundo escaneamento em 6 h: token próprio, sem conversa própria.
    const segundo = await criarAviso(tag, pet, identidade, 0);

    const lida = await conversas.buscarPeloTokenDoAchador(resumo(segundo.token));
    assert.ok(lida !== undefined, 'o token do aviso agrupado não resolveu conversa nenhuma');
    assert.equal(lida.id, conversa, 'o token do aviso agrupado chegou a outra conversa');
    // A validade é a do token apresentado, e não a do aviso anterior.
    assert.deepEqual(Buffer.from(lida.resumoDoToken), resumo(segundo.token));
  });

  void it('o token de OUTRO achador da mesma plaquinha não abre esta conversa', async () => {
    const tutor = await criarConta('Paula');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const primeiro = await criarAviso(tag, pet, resumo('achador-1'), 60);
    await abrirConversa(primeiro, pet);
    const deOutro = await criarAviso(tag, pet, resumo('achador-2'), 0);

    assert.equal(
      await conversas.buscarPeloTokenDoAchador(resumo(deOutro.token)),
      undefined,
      'o token de um achador abriu a conversa de outro',
    );
  });

  void it('fora da janela de 6 h o anterior não é a conversa deste token', async () => {
    const tutor = await criarConta('Rita');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const identidade = resumo('achador-janela');
    const antigo = await criarAviso(tag, pet, identidade, 7 * 60);
    await abrirConversa(antigo, pet);
    const novo = await criarAviso(tag, pet, identidade, 0);

    assert.equal(await conversas.buscarPeloTokenDoAchador(resumo(novo.token)), undefined);
  });

  void it('token que não é de aviso nenhum não resolve', async () => {
    assert.equal(await conversas.buscarPeloTokenDoAchador(resumo(token())), undefined);
  });
});

void describe('mensagens, bloqueio e denúncia pelo token', () => {
  void it('as mensagens saem na ordem, pela posição, e o bloqueio vale uma vez só', async () => {
    const tutor = await criarConta('Beto');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('achador-mensagens'));
    const conversa = await abrirConversa(aviso, pet);
    for (const corpo of ['um', 'dois', 'três']) {
      await conversas.gravarMensagem({
        id: randomUUID(),
        conversationId: conversa,
        senderRole: 'finder',
        senderUserId: null,
        body: corpo,
        redactions: [],
      });
    }

    const primeira = await conversas.mensagensPeloTokenDoAchador(resumo(aviso.token), {
      limit: 2,
      deslocamento: 0,
    });
    const segunda = await conversas.mensagensPeloTokenDoAchador(resumo(aviso.token), {
      limit: 2,
      deslocamento: 2,
    });
    // Nenhuma mensagem de sistema foi gravada aqui: a conversa foi aberta pelo
    // repositório, sem o serviço, então as três são as do achador.
    assert.deepEqual(
      [...primeira, ...segunda].map((m) => m.body),
      ['um', 'dois', 'três'],
    );
    assert.deepEqual(
      await conversas.mensagensPeloTokenDoAchador(resumo(token()), { limit: 50, deslocamento: 0 }),
      [],
      'token desconhecido trouxe mensagem',
    );

    await conversas.bloquearPeloAchador(resumo(aviso.token), Date.parse('2026-09-23T10:00:00Z') as Instant);
    await conversas.bloquearPeloAchador(resumo(aviso.token), Date.parse('2026-09-23T11:00:00Z') as Instant);
    const linha = await cliente.query<{ blocked_at: Date; blocked_by_role: string }>(
      'SELECT blocked_at, blocked_by_role FROM conversations WHERE id = $1',
      [conversa],
    );
    assert.equal(linha.rows[0]?.blocked_by_role, 'finder');
    assert.equal(linha.rows[0]?.blocked_at.toISOString(), '2026-09-23T10:00:00.000Z');
  });

  void it('a denúncia repetida do mesmo lado soma ao item aberto, e não abre outro', async () => {
    const tutor = await criarConta('Caio');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('achador-denuncia'));
    const conversa = await abrirConversa(aviso, pet);
    const agora = Date.parse('2026-09-23T10:00:00Z') as Instant;

    for (let i = 0; i < 3; i += 1) {
      await conversas.registrarDenuncia({
        id: randomUUID(),
        conversationId: conversa,
        papel: 'finder',
        motivo: 'extortion',
        detalhe: 'Pediu dinheiro para devolver.',
        agora,
      });
    }
    const linhas = await cliente.query<{ repeat_count: number }>(
      'SELECT repeat_count FROM conversation_reports WHERE conversation_id = $1',
      [conversa],
    );
    assert.equal(linhas.rows.length, 1, 'a denúncia repetida abriu outro item de fila');
    assert.equal(linhas.rows[0]?.repeat_count, 3);
  });
});

void describe('o aviso pelo token: "Contar mais" e a foto sem conta', () => {
  void it('grava ponto, nome, e-mail e foto no aviso do token, e só nele', async () => {
    const tutor = await criarConta('Dora');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('achador-foto'));
    const outro = await criarAviso(tag, pet, resumo('achador-outro'));

    const antes = await achados.avisoPeloTokenDoAchador(resumo(aviso.token));
    assert.equal(antes?.temPonto, false);
    assert.equal(antes?.temFoto, false);

    const ref = randomBytes(16).toString('base64url');
    const uploadId = randomUUID();
    await achados.registrarIntencaoDeFotoDoAchadorSemConta({
      id: uploadId,
      uploadRef: ref,
      foundReportId: aviso.id,
      objectKey: chaveDaFotoDoAchadorSemConta(randomBytes(16)),
      declaredType: 'image/jpeg',
      maxBytes: 2 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 300_000),
    });
    const semDono = await cliente.query<{ user_id: string | null; kind: string }>(
      'SELECT user_id, kind FROM upload_intents WHERE id = $1',
      [uploadId],
    );
    assert.equal(semDono.rows[0]?.user_id, null);
    assert.equal(semDono.rows[0]?.kind, 'finder_photo');

    assert.equal(await achados.contarIntencoesDeFotoPeloTokenDoAchador(resumo(aviso.token)), 1);
    assert.equal(await achados.contarIntencoesDeFotoPeloTokenDoAchador(resumo(outro.token)), 0);
    assert.equal(
      await achados.intencaoDeFotoDoAchadorPelaReferencia(resumo(outro.token), ref),
      undefined,
      'a referência de um aviso resolveu pelo token de outro',
    );
    const resolvido = await achados.intencaoDeFotoDoAchadorPelaReferencia(resumo(aviso.token), ref);
    assert.equal(resolvido, uploadId);

    const depois = await achados.enriquecerPeloTokenDoAchador(
      resumo(aviso.token),
      { lat: -23.5614, lon: -46.656, nome: 'Ana', email: 'ana@exemplo.invalid', fotoUploadId: uploadId },
      Date.now() as Instant,
    );
    assert.equal(depois?.temPonto, true);
    assert.equal(depois?.temFoto, true);
    const gravado = await cliente.query<{ finder_display_name: string; finder_email: string }>(
      'SELECT finder_display_name, finder_email FROM found_reports WHERE id = $1',
      [aviso.id],
    );
    assert.equal(gravado.rows[0]?.finder_display_name, 'Ana');
    assert.equal(gravado.rows[0]?.finder_email, 'ana@exemplo.invalid');
    const intocado = await achados.avisoPeloTokenDoAchador(resumo(outro.token));
    assert.equal(intocado?.temPonto, false, 'o enriquecimento escreveu no aviso de outro token');
  });

  void it('aviso encerrado não é enriquecido', async () => {
    const tutor = await criarConta('Edu');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('achador-encerrado'));
    await cliente.query("UPDATE found_reports SET status = 'closed' WHERE id = $1", [aviso.id]);

    assert.equal(
      await achados.enriquecerPeloTokenDoAchador(resumo(aviso.token), { nome: 'Edu' }, Date.now() as Instant),
      undefined,
    );
  });

  void it('o banco recusa intenção sem dono fora de `finder_photo`, e `finder_photo` sem referência', async () => {
    const tutor = await criarConta('Fabi');
    const pet = await criarPet(tutor);
    const tag = await criarPlaquinha(pet);
    const aviso = await criarAviso(tag, pet, resumo('achador-check'));

    await assert.rejects(
      cliente.query(
        `INSERT INTO upload_intents (id, user_id, found_report_id, kind, object_key, declared_type, max_bytes, expires_at)
         VALUES ($1, NULL, $2, 'found_report_photo', $3, 'image/jpeg', 10, now())`,
        [randomUUID(), aviso.id, `k-${randomUUID()}`],
      ),
      /upload_intents_dono_salvo_achador_sem_conta/,
    );
    await assert.rejects(
      cliente.query(
        `INSERT INTO upload_intents (id, user_id, found_report_id, kind, object_key, declared_type, max_bytes, expires_at)
         VALUES ($1, NULL, $2, 'finder_photo', $3, 'image/jpeg', 10, now())`,
        [randomUUID(), aviso.id, `k-${randomUUID()}`],
      ),
      /upload_intents_foto_do_achador_tem_aviso_e_ref/,
    );
  });
});
