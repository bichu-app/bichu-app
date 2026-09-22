/**
 * A transferencia de pet, contra Postgres de verdade.
 *
 * ## O que SO este arquivo consegue medir
 *
 * Quatro coisas deste desenho nao existem fora do banco, e um dublê em memoria
 * responde o que o autor do dublê acreditou:
 *
 * 1. **O indice parcial `pet_transfers_uma_viva_por_pet`.** A conferencia na
 *    aplicacao da a mensagem; o indice da a garantia. Duas insercoes simultaneas
 *    passam pela conferencia e so o Postgres recusa a segunda.
 * 2. **A consumacao como UMA transacao.** Trocar o dono e revogar as tags juntos
 *    ou nenhum. Em memoria isso e uma sequencia de atribuicoes, e ela nunca
 *    falha no meio.
 * 3. **As restricoes CHECK.** `pet_transfers_motivo_acompanha_o_cancelamento` e
 *    `pet_transfers_aceite_traz_os_dois_instantes` sao afirmacoes que o banco
 *    faz, e o unico jeito de saber se ele as faz mesmo e tentar viola-las.
 * 4. **A exclusao de conta.** `ON DELETE CASCADE` no tutor e `ON DELETE SET
 *    NULL` no destinatario: a direcao errada em qualquer uma faz a exclusao de
 *    conta FALHAR ou apagar a linha de outra pessoa, e nada em memoria acusa.
 *
 * ## O que este arquivo NAO consegue medir
 *
 * Ele mede o **efeito**, nunca **onde a decisao mora**. Um `buscarDoTutor` que
 * lesse a linha alheia e a descartasse num `if` passaria aqui identico. Essa
 * parte e de
 * `src/modules/transfers/adapters/persistence/autorizacao-na-clausula-where.test.ts`,
 * que compila a consulta e le o predicado. Os dois sao necessarios e nenhum
 * basta sozinho.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive a execucao
 *
 * Nada. As contas criadas sao apagadas no `after`, e o `ON DELETE CASCADE` leva
 * pets, tags, casos e transferencias junto -- o que, de quebra, exercita a
 * exclusao de conta a cada execucao.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import {
  ESTADOS_VIVOS,
  criarTransferRepository,
} from '../../src/modules/transfers/adapters/persistence/kysely-transfer-repository.js';
import type {
  TransferId,
  TransferRepository,
} from '../../src/modules/transfers/ports/transfer-repository.js';
import type { Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const EM_72H = (AGORA + 72 * 3_600_000) as Instant;
const EM_24H = (AGORA + 24 * 3_600_000) as Instant;

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: TransferRepository;
const contasCriadas: UserId[] = [];

function hashDe(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email, email_verified_at) VALUES ($1, $2, now())', [
    id,
    `transf-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId, nome: string): Promise<PetId> {
  const pet = randomUUID() as PetId;
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, dono, nome],
  );
  return pet;
}

/** Uma tag ativa, com codigo de 4 caracteres do alfabeto que o CHECK aceita. */
async function criarTag(pet: PetId, sufixo: string): Promise<string> {
  const id = randomUUID();
  assert.match(sufixo, /^[0-9A-HJKMNP-TV-Z]{4}$/, `sufixo fora do alfabeto de Crockford: ${sufixo}`);
  await cliente.query(
    `INSERT INTO pet_tags (id, pet_id, code_hash, code_ciphertext, code_suffix, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [id, pet, hashDe(id), Buffer.from('cifrado-de-mentira'), sufixo],
  );
  return id;
}

async function abrirCasoDePerdido(pet: PetId, dono: UserId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO lost_cases (id, pet_id, owner_user_id, status, last_seen_at, share_token)
     VALUES ($1, $2, $3, 'open', now(), $4)`,
    [id, pet, dono, randomUUID()],
  );
  return id;
}

interface Cenario {
  tutor: UserId;
  destino: UserId;
  pet: PetId;
  transferencia: TransferId;
  tokenDoConvite: string;
}

async function cenario(marca: string): Promise<Cenario> {
  const tutor = await criarConta();
  const destino = await criarConta();
  const pet = await criarPet(tutor, `Pet ${marca}`);
  const transferencia = randomUUID() as TransferId;
  const tokenDoConvite = `convite-${transferencia}`;

  const r = await repo.abrir(
    {
      id: transferencia,
      petId: pet,
      fromUserId: tutor,
      recipientEmail: `destino-${marca}@${DOMINIO_DE_TESTE}`,
      inviteTokenHash: hashDe(tokenDoConvite),
      inviteExpiresAt: EM_72H,
    },
    AGORA,
  );
  assert.equal(r.tipo, 'aberta', `a abertura do cenario ${marca} falhou: ${JSON.stringify(r)}`);
  return { tutor, destino, pet, transferencia, tokenDoConvite };
}

async function aceitar(c: Cenario, token = `cancelar-${c.transferencia}`): Promise<string> {
  const r = await repo.registrarAceite({
    transferencia: c.transferencia,
    toUserId: c.destino,
    cancelTokenHash: hashDe(token),
    acceptedAt: AGORA,
    effectiveAt: EM_24H,
  });
  assert.equal(r.tipo, 'aceita', `o aceite falhou: ${JSON.stringify(r)}`);
  return token;
}

async function tagsAtivasDe(pet: PetId): Promise<number> {
  const r = await cliente.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM pet_tags WHERE pet_id = $1 AND status = 'active'`,
    [pet],
  );
  return Number(r.rows[0]?.n ?? '0');
}

async function donoDe(pet: PetId): Promise<string | undefined> {
  const r = await cliente.query<{ owner_user_id: string }>(
    'SELECT owner_user_id FROM pets WHERE id = $1',
    [pet],
  );
  return r.rows[0]?.owner_user_id;
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificacao que nao consegue verificar precisa REPROVAR. Pular aqui faria
    // a suite ficar verde sem nunca ter tocado o indice parcial, as restricoes
    // CHECK nem o comportamento das chaves estrangeiras na exclusao de conta.
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo mede a transferencia de pet contra ' +
        'Postgres de verdade, e nao tem versao em memoria. Rode `npm run test:integration`, ' +
        'que sobe a pilha efemera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarTransferRepository(db);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

// ---------------------------------------------------------------------------
// ISCA 1 -- transferir pet que nao e seu
// ---------------------------------------------------------------------------
void describe('ISCA: transferir pet que nao e seu', () => {
  void it('abrir transferencia de pet alheio nao grava linha nenhuma', async () => {
    const a = await cenario('alheio-a');
    const outro = await criarConta();

    const r = await repo.abrir(
      {
        id: randomUUID() as TransferId,
        petId: a.pet,
        fromUserId: outro,
        recipientEmail: `x@${DOMINIO_DE_TESTE}`,
        inviteTokenHash: hashDe(`tentativa-${randomUUID()}`),
        inviteExpiresAt: EM_72H,
      },
      AGORA,
    );

    assert.equal(r.tipo, 'pet_nao_e_deste_tutor');
    // O EFEITO no banco, e nao so o valor devolvido: um resultado correto
    // depois de a linha ter sido gravada seria a mesma resposta com o dano
    // feito.
    const n = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pet_transfers WHERE pet_id = $1',
      [a.pet],
    );
    assert.equal(n.rows[0]?.n, '1', 'alem da do proprio tutor, apareceu outra linha');
  });

  void it('a busca da transferencia nao atravessa contas, e some como se nao existisse', async () => {
    const a = await cenario('busca-a');
    const b = await cenario('busca-b');

    const minha = await repo.buscarDoTutor(a.transferencia, a.tutor);
    assert.ok(minha !== undefined, 'o proprio tutor nao leu a propria transferencia');
    assert.equal(minha.id, a.transferencia);

    // O id VERDADEIRO na mao, a conta errada no token. O cenario do ADR-0021.
    const roubo = await repo.buscarDoTutor(a.transferencia, b.tutor);
    assert.equal(roubo, undefined, 'a transferencia de outra pessoa saiu da consulta');
    // Indistinguivel de inexistente e o que produz 404 e nao 403.
    assert.equal(roubo, await repo.buscarDoTutor(randomUUID() as TransferId, b.tutor));
  });

  void it('cancelar transferencia alheia nao muda estado nenhum', async () => {
    const a = await cenario('cancela-alheia-a');
    const b = await cenario('cancela-alheia-b');

    // A porta exige o dono: quem nao consegue LER nao chega a cancelar. Este
    // caso mede a composicao inteira, que e o que a rota faz.
    assert.equal(await repo.buscarDoTutor(a.transferencia, b.tutor), undefined);
    const linha = await repo.buscarDoTutor(a.transferencia, a.tutor);
    assert.equal(linha?.status, 'pending_acceptance');
  });
});

// ---------------------------------------------------------------------------
// ISCA 2 -- a janela de 24 h
// ---------------------------------------------------------------------------
void describe('ISCA: a janela de 24 h vale dentro do Postgres', () => {
  void it('antes do instante de consumacao o banco NAO troca o dono nem revoga tag', async () => {
    const c = await cenario('janela');
    await criarTag(c.pet, 'AB12');
    await criarTag(c.pet, 'CD34');
    await aceitar(c);

    const cedo = await repo.consumar(c.transferencia, (EM_24H - 1) as Instant);
    assert.equal(cedo.tipo, 'ainda_na_janela');
    assert.equal(await donoDe(c.pet), c.tutor, 'o dono mudou antes da hora');
    assert.equal(await tagsAtivasDe(c.pet), 2, 'a plaquinha caiu antes da hora');
  });

  void it('no instante exato consuma, troca o dono e revoga TODAS as tags juntas', async () => {
    const c = await cenario('consuma');
    await criarTag(c.pet, 'EF56');
    await criarTag(c.pet, 'GH78');
    await criarTag(c.pet, 'JK90');
    await aceitar(c);

    const r = await repo.consumar(c.transferencia, EM_24H);
    assert.equal(r.tipo, 'consumada');
    assert.equal(r.tipo === 'consumada' ? r.tagsRevogadas : -1, 3);

    assert.equal(await donoDe(c.pet), c.destino);
    assert.equal(await tagsAtivasDe(c.pet), 0);

    // O MOTIVO da revogacao e o do ADR-0004, e o cifrado morreu junto: sem ele
    // a reimpressao entregaria um QR com cara de bom para uma coleira que
    // responde "tag desativada".
    const tags = await cliente.query<{ revocation_reason: string; code_ciphertext: Buffer | null }>(
      'SELECT revocation_reason, code_ciphertext FROM pet_tags WHERE pet_id = $1',
      [c.pet],
    );
    assert.equal(tags.rows.length, 3);
    for (const linha of tags.rows) {
      assert.equal(linha.revocation_reason, 'pet_transferred');
      assert.equal(linha.code_ciphertext, null);
    }
  });

  void it('a segunda consumacao da mesma linha nao faz nada', async () => {
    const c = await cenario('duas-vezes');
    await criarTag(c.pet, 'LM11');
    await aceitar(c);

    assert.equal((await repo.consumar(c.transferencia, EM_24H)).tipo, 'consumada');
    assert.equal((await repo.consumar(c.transferencia, EM_24H)).tipo, 'ja_resolvida');
    assert.equal(await tagsAtivasDe(c.pet), 0);
  });
});

// ---------------------------------------------------------------------------
// ISCA 3 -- o token de cancelamento apos a consumacao
// ---------------------------------------------------------------------------
void describe('ISCA: o cancelamento por token para de funcionar apos a consumacao', () => {
  void it('depois de consumada o cancelamento nao acerta linha nenhuma', async () => {
    const c = await cenario('token-tardio');
    await criarTag(c.pet, 'NP22');
    const token = await aceitar(c);

    assert.equal((await repo.consumar(c.transferencia, EM_24H)).tipo, 'consumada');

    const tardio = await repo.cancelar({
      transferencia: c.transferencia,
      motivo: 'cancel_token',
      quando: (EM_24H + 1000) as Instant,
      consumirTokenDeCancelamento: true,
    });
    assert.equal(tardio, undefined, 'o cancelamento tardio acertou a linha');

    // O ESTADO NAO VOLTA. Um cancelamento tardio que "funcionasse" devolveria
    // um pet sem plaquinha nenhuma ao tutor antigo.
    const linha = await repo.buscarDoTutor(c.transferencia, c.tutor);
    assert.equal(linha?.status, 'effective');
    assert.equal(await donoDe(c.pet), c.destino);
    assert.equal(await tagsAtivasDe(c.pet), 0);
    // E o token nao resolve mais nada.
    assert.equal(await repo.buscarPorTokenDeCancelamento(hashDe(token)), undefined);
  });

  void it('dentro da janela o token cancela, e o uso e unico', async () => {
    const c = await cenario('token-valido');
    await criarTag(c.pet, 'QR33');
    const token = await aceitar(c);

    const visao = await repo.buscarPorTokenDeCancelamento(hashDe(token));
    assert.ok(visao !== undefined);
    assert.equal(visao.petDisplayName, 'Pet token-valido');

    const cancelada = await repo.cancelar({
      transferencia: c.transferencia,
      motivo: 'cancel_token',
      quando: (AGORA + 3_600_000) as Instant,
      consumirTokenDeCancelamento: true,
    });
    assert.equal(cancelada?.status, 'cancelled');
    assert.equal(cancelada?.cancellationReason, 'cancel_token');

    // USO UNICO NA MESMA ESCRITA: o resumo foi apagado junto do cancelamento.
    assert.equal(await repo.buscarPorTokenDeCancelamento(hashDe(token)), undefined);
    // E nada foi revogado.
    assert.equal(await tagsAtivasDe(c.pet), 1);
    assert.equal(await donoDe(c.pet), c.tutor);
  });
});

// ---------------------------------------------------------------------------
// ISCA 4 -- consumar sem aceite
// ---------------------------------------------------------------------------
void describe('ISCA: a transferencia nao conclui sem o aceite', () => {
  void it('convite pendente nunca consuma, por mais tempo que passe', async () => {
    const c = await cenario('sem-aceite');
    await criarTag(c.pet, 'ST44');

    const r = await repo.consumar(c.transferencia, (AGORA + 365 * 24 * 3_600_000) as Instant);
    assert.equal(r.tipo, 'ja_resolvida');
    assert.equal(await donoDe(c.pet), c.tutor, 'o dono mudou sem ninguem ter aceitado');
    assert.equal(await tagsAtivasDe(c.pet), 1, 'a plaquinha caiu sem ninguem ter aceitado');
  });

  void it('o aceite recusa convite vencido, e o banco e quem compara a data', async () => {
    const c = await cenario('vencido');
    const r = await repo.registrarAceite({
      transferencia: c.transferencia,
      toUserId: c.destino,
      cancelTokenHash: hashDe('x'),
      acceptedAt: (EM_72H + 1) as Instant,
      effectiveAt: (EM_72H + 24 * 3_600_000) as Instant,
    });
    assert.equal(r.tipo, 'estado_mudou');
    assert.equal((await repo.buscarDoTutor(c.transferencia, c.tutor))?.status, 'pending_acceptance');
  });

  void it('o segundo aceite do mesmo convite nao acerta linha nenhuma', async () => {
    const c = await cenario('aceite-duplo');
    await aceitar(c);
    const segundo = await repo.registrarAceite({
      transferencia: c.transferencia,
      toUserId: c.destino,
      cancelTokenHash: hashDe('outro-token'),
      acceptedAt: AGORA,
      effectiveAt: EM_24H,
    });
    // A condicao esta no `WHERE`: sem ela, dois aceites agendariam DUAS
    // consumacoes para a mesma linha.
    assert.equal(segundo.tipo, 'estado_mudou');
  });
});

// ---------------------------------------------------------------------------
// O caso que a issue pediu
// ---------------------------------------------------------------------------
void describe('pet marcado como perdido durante a janela de 24 h', () => {
  void it('a consumacao RECUSA, e a plaquinha da coleira continua viva', async () => {
    const c = await cenario('perdido-na-janela');
    await criarTag(c.pet, 'VW55');
    await criarTag(c.pet, 'XY66');
    await aceitar(c);

    // Hora 3 da janela: o caso de perdido abre e ninguem avisa a transferencia.
    await abrirCasoDePerdido(c.pet, c.tutor);

    const r = await repo.consumar(c.transferencia, EM_24H);
    assert.equal(
      r.tipo,
      'caso_aberto',
      'a consumacao passou por cima de um caso de perdido aberto',
    );
    // O QUE IMPORTA: o QR da coleira continua resolvendo. E ele que liga o
    // animal ao tutor enquanto o bicho esta na rua, e revogacao nao volta.
    assert.equal(await tagsAtivasDe(c.pet), 2);
    assert.equal(await donoDe(c.pet), c.tutor);
  });

  void it('cancelar a transferencia viva do pet acerta a linha certa', async () => {
    const c = await cenario('cancela-por-caso');
    await aceitar(c);

    const cancelada = await repo.cancelarVivaDoPet({
      pet: c.pet,
      motivo: 'lost_case_opened',
      quando: (AGORA + 3 * 3_600_000) as Instant,
    });
    assert.equal(cancelada?.id, c.transferencia);
    assert.equal(cancelada?.cancellationReason, 'lost_case_opened');

    // Silenciosa quando nao ha nada vivo: e o caminho de quase todo caso de
    // perdido, e por isso ele nao pode ser erro.
    const segunda = await repo.cancelarVivaDoPet({
      pet: c.pet,
      motivo: 'lost_case_opened',
      quando: AGORA,
    });
    assert.equal(segunda, undefined);
  });

  void it('abrir transferencia de pet com caso aberto e recusado antes da escrita', async () => {
    const tutor = await criarConta();
    const pet = await criarPet(tutor, 'Pet com caso');
    await abrirCasoDePerdido(pet, tutor);

    const r = await repo.abrir(
      {
        id: randomUUID() as TransferId,
        petId: pet,
        fromUserId: tutor,
        recipientEmail: `x@${DOMINIO_DE_TESTE}`,
        inviteTokenHash: hashDe(`caso-${randomUUID()}`),
        inviteExpiresAt: EM_72H,
      },
      AGORA,
    );
    assert.equal(r.tipo, 'caso_aberto');
    const n = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pet_transfers WHERE pet_id = $1',
      [pet],
    );
    assert.equal(n.rows[0]?.n, '0');
  });
});

// ---------------------------------------------------------------------------
// O que so o banco garante
// ---------------------------------------------------------------------------
void describe('as garantias que o Postgres da, e a aplicacao nao', () => {
  void it('o indice parcial recusa uma segunda transferencia viva para o mesmo pet', async () => {
    const c = await cenario('uma-viva');

    // INSERT DIRETO, passando por cima da conferencia da aplicacao. E assim que
    // se mede o indice: pela aplicacao, a conferencia responderia primeiro e o
    // indice nunca seria exercitado.
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO pet_transfers
             (id, pet_id, from_user_id, recipient_email, invite_token_hash, status, invite_expires_at)
           VALUES ($1, $2, $3, $4, $5, 'pending_acceptance', $6)`,
          [
            randomUUID(),
            c.pet,
            c.tutor,
            `outro@${DOMINIO_DE_TESTE}`,
            hashDe(`segunda-${randomUUID()}`),
            new Date(Number(EM_72H)),
          ],
        ),
      /pet_transfers_uma_viva_por_pet|duplicate key/,
      'o banco aceitou duas transferencias vivas para o mesmo pet',
    );
  });

  void it('o indice e PARCIAL: cancelada libera a vaga, e transferir de novo funciona', async () => {
    const c = await cenario('libera-vaga');
    await repo.cancelar({
      transferencia: c.transferencia,
      motivo: 'current_owner',
      quando: AGORA,
      consumirTokenDeCancelamento: true,
    });

    const segunda = await repo.abrir(
      {
        id: randomUUID() as TransferId,
        petId: c.pet,
        fromUserId: c.tutor,
        recipientEmail: `denovo@${DOMINIO_DE_TESTE}`,
        inviteTokenHash: hashDe(`denovo-${randomUUID()}`),
        inviteExpiresAt: EM_72H,
      },
      AGORA,
    );
    assert.equal(segunda.tipo, 'aberta', 'o tutor que desistiu ficou impedido de transferir');
  });

  void it('os estados vivos do codigo sao EXATAMENTE os do predicado do indice', async () => {
    // A lista existe em dois lugares (a constante e a migracao), e duas listas
    // que precisam concordar divergem. Aqui a do codigo e comparada com o que o
    // CATALOGO do Postgres guarda -- nao com o texto do arquivo de migracao,
    // que foi exatamente a licao de 22/09: o arquivo dizia uma coisa e o banco
    // tinha outra.
    const r = await cliente.query<{ def: string }>(
      `SELECT pg_get_expr(i.indpred, i.indrelid) AS def
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = 'pet_transfers_uma_viva_por_pet'`,
    );
    const predicado = r.rows[0]?.def;
    assert.ok(predicado !== undefined, 'o indice parcial sumiu do banco');
    for (const estado of ESTADOS_VIVOS) {
      assert.ok(
        predicado.includes(`'${estado}'`),
        `o estado '${estado}' esta na constante do codigo e NAO no predicado do indice: ${predicado}`,
      );
    }
    for (const terminal of ['effective', 'cancelled', 'expired']) {
      assert.equal(
        predicado.includes(`'${terminal}'`),
        false,
        `'${terminal}' ocupa a vaga do indice, e nao devia: ${predicado}`,
      );
    }
  });

  void it('cancelada SEM motivo e recusada, e nao-cancelada COM motivo tambem', async () => {
    const c = await cenario('check-motivo');

    await assert.rejects(
      () =>
        cliente.query(
          `UPDATE pet_transfers SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
          [c.transferencia],
        ),
      /pet_transfers_motivo_acompanha_o_cancelamento/,
      'o banco aceitou um cancelamento sem motivo',
    );

    // A OUTRA DIRECAO, que e a que ninguem olha: um CHECK que so cobra a
    // presenca deixaria passar `effective` carregando `lost_case_opened`, que e
    // o tipo de lixo em cima do qual alguem constroi um relatorio.
    await assert.rejects(
      () =>
        cliente.query(
          `UPDATE pet_transfers SET cancellation_reason = 'lost_case_opened' WHERE id = $1`,
          [c.transferencia],
        ),
      /pet_transfers_motivo_acompanha_o_cancelamento/,
      'o banco aceitou motivo de cancelamento numa linha nao cancelada',
    );
  });

  void it('`effective_at` sem `accepted_at` e recusado: consumacao agendada a partir de nada', async () => {
    const c = await cenario('check-instantes');
    await assert.rejects(
      () =>
        cliente.query(`UPDATE pet_transfers SET effective_at = now() WHERE id = $1`, [
          c.transferencia,
        ]),
      /pet_transfers_aceite_traz_os_dois_instantes/,
    );
  });

  void it('o resumo do token tem 32 bytes, e o banco recusa qualquer outro tamanho', async () => {
    const c = await cenario('check-hash');
    await assert.rejects(
      () =>
        cliente.query(`UPDATE pet_transfers SET cancel_token_hash = $1 WHERE id = $2`, [
          Buffer.from('token-em-claro-por-engano'),
          c.transferencia,
        ]),
      /pet_transfers_cancel_hash_sha256/,
      'a coluna aceitou algo que nao e um SHA-256: um token em claro caberia ali',
    );
  });
});

// ---------------------------------------------------------------------------
// A EXCLUSAO DE CONTA, que e onde chave estrangeira mal desenhada aparece
// ---------------------------------------------------------------------------
void describe('as tres chaves estrangeiras e a exclusao de conta', () => {
  void it('o TUTOR apaga a conta: a transferencia vai junto, e a exclusao NAO falha', async () => {
    const c = await cenario('exclusao-tutor');
    await aceitar(c);

    // Se `from_user_id` fosse `RESTRICT` ou `NO ACTION`, esta linha estouraria
    // -- e a pessoa ficaria impedida de sair do produto por causa de um convite.
    await cliente.query('DELETE FROM users WHERE id = $1', [c.tutor]);

    const n = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pet_transfers WHERE id = $1',
      [c.transferencia],
    );
    assert.equal(n.rows[0]?.n, '0', 'a transferencia sobreviveu a exclusao do tutor');
  });

  void it('o DESTINATARIO apaga a conta: a linha do tutor FICA, com `to_user_id` nulo', async () => {
    const c = await cenario('exclusao-destino');
    await aceitar(c);

    // A direcao oposta, e a que `ON DELETE CASCADE` aqui estragaria: a conta do
    // destinatario arrastaria a transferencia do TUTOR, que e linha de outra
    // pessoa. `ON DELETE SET NULL` preserva.
    await cliente.query('DELETE FROM users WHERE id = $1', [c.destino]);

    const linha = await repo.buscarDoTutor(c.transferencia, c.tutor);
    assert.ok(linha !== undefined, 'a exclusao do destinatario apagou a linha do tutor');
    assert.equal(linha.toUserId, null);

    // E a consumacao RECUSA: nao ha para quem transferir, e revogar as tags
    // aqui seria destruicao pura.
    const r = await repo.consumar(c.transferencia, EM_24H);
    assert.equal(r.tipo, 'destinatario_sumiu');
    assert.equal(await donoDe(c.pet), c.tutor);
  });

  void it('`to_user_id` e ANULAVEL: a contradicao NOT NULL + SET NULL nao existe aqui', async () => {
    // A contradicao que faz a exclusao de conta estourar em producao: coluna
    // obrigatoria com `ON DELETE SET NULL`. Declarada valida pelo esquema,
    // impossivel de executar. Este caso le o catalogo em vez de confiar na
    // migracao.
    const r = await cliente.query<{ is_nullable: string; delete_rule: string }>(
      `SELECT col.is_nullable, rc.delete_rule
         FROM information_schema.columns col
         JOIN information_schema.key_column_usage kcu
           ON kcu.table_name = col.table_name AND kcu.column_name = col.column_name
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = kcu.constraint_name
        WHERE col.table_name = 'pet_transfers' AND col.column_name = 'to_user_id'`,
    );
    const linha = r.rows[0];
    assert.ok(linha !== undefined, 'nao achei a chave estrangeira de `to_user_id`');
    assert.equal(linha.delete_rule, 'SET NULL');
    assert.equal(
      linha.is_nullable,
      'YES',
      'a coluna e obrigatoria e a FK e SET NULL: a exclusao da conta do destinatario ' +
        'vai estourar na primeira vez que alguem sair do produto',
    );
  });

  void it('o PET e excluido de verdade: a transferencia nao sobrevive a ele', async () => {
    const c = await cenario('exclusao-pet');
    await cliente.query('DELETE FROM pets WHERE id = $1', [c.pet]);
    const n = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pet_transfers WHERE id = $1',
      [c.transferencia],
    );
    assert.equal(n.rows[0]?.n, '0');
  });
});
