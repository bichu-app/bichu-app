/**
 * As duas leituras de apoio da transferencia, contra Postgres de verdade:
 * `criarEmailVerificadoDoChamador` e `criarNomeDoPet`, de
 * `src/modules/transfers/adapters/persistence/kysely-consultas-de-apoio.ts`.
 *
 * ## Por que este arquivo existe
 *
 * As duas fabricas sao importadas por `src/bin/api.ts` e `src/bin/worker.ts`:
 * rodam nos dois pontos de entrada, em producao. Ate 22/09 nenhuma suite as
 * carregava, entao o arquivo nao aparecia em relatorio nenhum e o SonarCloud
 * publicaria 0% sem reclamar. Aceitar zero num arquivo que os dois pontos de
 * entrada usam e o verde que nao prova nada.
 *
 * ## O que este arquivo cobra, e o que ele DELIBERADAMENTE nao cobra
 *
 * Ele cobra **a clausula que a consulta tem**, nao a que seria razoavel esperar:
 *
 * - `emailVerificadoDe` filtra por `users.id`, por `email_verified_at IS NOT
 *   NULL` (a camada 2 da transferencia) e por `deleted_at IS NULL`. Os casos
 *   abaixo reprovam se QUALQUER uma das tres sair da consulta.
 * - `nomeDe` filtra por `pets.id` e por `deleted_at IS NULL`, e **nada mais**.
 *   Em particular NAO ha filtro por dono, e o caso `le o nome de pet alheio`
 *   registra isso como fato, nao como defeito: quem autoriza e o servico, antes
 *   de chamar. Escrever aqui uma isca de "pet alheio some" seria uma isca que
 *   fica verde sozinha e nunca reprova nada.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive a execucao
 *
 * Nada: as contas criadas saem no `after`, e a CASCADE leva os pets junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import {
  criarEmailVerificadoDoChamador,
  criarNomeDoPet,
} from '../../src/modules/transfers/adapters/persistence/kysely-consultas-de-apoio.js';
import type {
  EmailVerificadoDoChamador,
  NomeDoPet,
} from '../../src/modules/transfers/application/pet-transfer-service.js';
import type { PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let contas: EmailVerificadoDoChamador;
let pets: NomeDoPet;
const contasCriadas: UserId[] = [];

interface OpcoesDaConta {
  readonly verificado: boolean;
  readonly apagado?: boolean;
}

async function criarConta({ verificado, apagado = false }: OpcoesDaConta): Promise<{
  id: UserId;
  email: string;
}> {
  const id = randomUUID() as UserId;
  const email = `apoio-${id}@${DOMINIO_DE_TESTE}`;
  await cliente.query(
    `INSERT INTO users (id, email, email_verified_at)
     VALUES ($1, $2, CASE WHEN $3::boolean THEN now() ELSE NULL END)`,
    [id, email, verificado],
  );
  contasCriadas.push(id);
  if (apagado) {
    await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);
  }
  return { id, email };
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

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificacao que nao consegue verificar precisa REPROVAR. Pular aqui
    // deixaria o arquivo verde sem ter tocado uma consulta sequer.
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo mede as consultas de apoio da ' +
        'transferencia contra Postgres de verdade, e nao tem versao em memoria. Rode ' +
        '`npm run test:integration`, que sobe a pilha efemera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  contas = criarEmailVerificadoDoChamador(db);
  pets = criarNomeDoPet(db);
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
// emailVerificadoDe
// ---------------------------------------------------------------------------
void describe('emailVerificadoDe', () => {
  void it('devolve o endereco da conta com e-mail verificado', async () => {
    const conta = await criarConta({ verificado: true });
    assert.equal(await contas.emailVerificadoDe(conta.id), conta.email);
  });

  void it('ISCA (camada 2): conta com e-mail POR VERIFICAR nao devolve endereco', async () => {
    // Sem `email_verified_at IS NOT NULL` na consulta este caso passa a devolver
    // o endereco, e bastaria cadastrar uma conta com o e-mail do destinatario
    // para aceitar a transferencia dele. A linha EXISTE no banco de proposito:
    // o que separa os dois casos e a clausula, nao a ausencia do registro.
    const conta = await criarConta({ verificado: false });
    const naBase = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM users WHERE id = $1',
      [conta.id],
    );
    assert.equal(naBase.rows[0]?.n, '1', 'a conta por verificar precisa existir para a isca valer');

    assert.equal(await contas.emailVerificadoDe(conta.id), undefined);
  });

  void it('ISCA: conta apagada logicamente nao devolve endereco, mesmo verificada', async () => {
    const conta = await criarConta({ verificado: true, apagado: true });
    assert.equal(await contas.emailVerificadoDe(conta.id), undefined);
  });

  void it('conta que nao existe devolve undefined, sem estourar', async () => {
    assert.equal(await contas.emailVerificadoDe(randomUUID() as UserId), undefined);
  });
});

// ---------------------------------------------------------------------------
// nomeDe
// ---------------------------------------------------------------------------
void describe('nomeDe', () => {
  void it('devolve o nome do pet vivo', async () => {
    const dono = await criarConta({ verificado: true });
    const pet = await criarPet(dono.id, 'Rex da Integracao');
    assert.equal(await pets.nomeDe(pet), 'Rex da Integracao');
  });

  void it('ISCA: pet apagado logicamente nao devolve nome', async () => {
    const dono = await criarConta({ verificado: true });
    const pet = await criarPet(dono.id, 'Sumido');
    await cliente.query('UPDATE pets SET deleted_at = now() WHERE id = $1', [pet]);
    assert.equal(await pets.nomeDe(pet), undefined);
  });

  void it('le o nome de pet alheio: a consulta NAO filtra por dono, e isso e o desenho', async () => {
    // Registrado como fato verificado, e nao como isca: `nomeDe` recebe um
    // `PetId` que o servico ja autorizou, e o nome so vira texto de e-mail.
    // Quem trocar esta afirmacao por "pet alheio some" precisa mudar a consulta
    // junto, e e exatamente isso que este caso obriga a notar.
    const dono = await criarConta({ verificado: true });
    const estranho = await criarConta({ verificado: true });
    const pet = await criarPet(dono.id, 'Nao e do estranho');
    assert.notEqual(dono.id, estranho.id);

    assert.equal(await pets.nomeDe(pet), 'Nao e do estranho');
  });

  void it('pet que nao existe devolve undefined, sem estourar', async () => {
    assert.equal(await pets.nomeDe(randomUUID() as PetId), undefined);
  });
});
