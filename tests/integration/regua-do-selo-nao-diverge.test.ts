/**
 * **ISCA PRINCIPAL: o selo que o DONO vê de si é o mesmo que os OUTROS veem.**
 *
 * Decisão do cliente, 21/10/2026, literal: *"Unificar agora, nas duas — a mesma
 * régua (e-mail OU telefone) nos dois lugares, antes de telefone existir."*
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * As duas pontas do selo são derivadas em **camadas diferentes**, e é por isso
 * que elas podiam divergir sem ninguém ver:
 *
 * - o selo do DONO é derivado em **TypeScript** (`projetarMeuPerfil`,
 *   `projetarConta`), sobre a conta já lida;
 * - o selo de TERCEIRO é derivado em **SQL**, dentro da consulta do perfil de
 *   pessoa, do Mural e das arestas de conexão.
 *
 * Nenhum teste unitário compara as duas: dublê não executa SQL, e um dublê que
 * respondesse `canal_verificado` seria eu alimentando a resposta que queria
 * medir. **Só Postgres responde o que a expressão realmente responde.**
 *
 * ## O CASO QUE DEFINE A TAREFA FINGE O FUTURO
 *
 * As duas réguas coincidem em **toda conta que existe hoje**, porque nada em
 * `src/` grava `phone_verified_at` — a coluna existe e só é zerada. O defeito é
 * invisível por isso, e só um teste que monte a conta de amanhã o pega: aqui a
 * massa inclui uma conta com `phone_verified_at` PREENCHIDO e
 * `email_verified_at` NULO, gravada direto na tabela.
 *
 * Com a régua antiga do dono (`email_verified_at IS NOT NULL`), essa conta sai
 * validada para os outros e não para si — e é exatamente o que o caso
 * `ISCA: telefone confirmado...` reprova.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { construtorDoPerfilPorApelido } from '../../src/modules/people/adapters/persistence/kysely-perfil-de-pessoa.js';
import { projetarMeuPerfil } from '../../src/modules/identity/domain/resposta-do-perfil.js';
import { projetarConta } from '../../src/modules/identity/application/session-view.js';
import { canalDeContatoConfirmadoNoSql } from '../../src/shared/db/canal-de-contato-confirmado.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = Date.parse('2026-10-21T12:00:00.000Z') as Instant;
const CONFIRMADO_EM = new Date('2026-10-20T09:00:00.000Z');

/** A conta de amanhã: TELEFONE confirmado, e-mail NÃO. Hoje não existe. */
const SO_TELEFONE = '0192f3a1-7c2b-7e3d-9a10-21600000ce01' as UserId;
/** A conta de hoje: só e-mail. O contrapeso que impede um `true` fixo de passar. */
const SO_EMAIL = '0192f3a1-7c2b-7e3d-9a10-21600000ce02' as UserId;
/** Nenhum canal. O outro contrapeso: sem ele, `true` fixo passaria. */
const SEM_CANAL = '0192f3a1-7c2b-7e3d-9a10-21600000ce03' as UserId;
/** Quem OLHA. Precisa ser outra conta ativa: o perfil de pessoa é de terceiro. */
const QUEM_OLHA = '0192f3a1-7c2b-7e3d-9a10-21600000ce04' as UserId;

const APELIDOS: Record<string, string> = {
  [SO_TELEFONE]: 'isca-telefone',
  [SO_EMAIL]: 'isca-email-so',
  [SEM_CANAL]: 'isca-sem-canal',
};

const TODAS = [SO_TELEFONE, SO_EMAIL, SEM_CANAL, QUEM_OLHA];

let cliente: Client;
let banco: DbHandle;
let db: Db;
let repo: ReturnType<typeof criarIdentityRepository>;

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Falha ruidosa, nunca `skip`. O mecanismo é a comparação entre uma
    // derivação de SQL e uma de TypeScript; um arquivo que se pula sozinho por
    // falta de banco termina verde e deixa de conferir justamente o que não
    // aparece na leitura do código.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo compara a derivação de SQL do selo com ' +
        'a de TypeScript, e sem banco ele não confere nada. Rode `npm run test:integration`.',
    );
  }
  cliente = new Client({ connectionString: CONEXAO });
  await cliente.connect();
  banco = createDb(CONEXAO);
  db = banco.db;
  repo = criarIdentityRepository(db, criarIdGenerator(() => AGORA));
  await montarMassa();
});

after(async () => {
  await limparMassa();
  await banco?.close();
  await cliente?.end();
});

async function limparMassa(): Promise<void> {
  // `delete` porque é massa de teste numa pilha efêmera, e não o caminho de
  // produto -- que, desde 17/10, não apaga nada. `handles` sai primeiro: o
  // `ON DELETE SET NULL` deixaria a linha órfã e o `CHECK
  // handles_pessoa_tem_dono` recusa `kind = 'pessoa'` sem dono.
  await cliente?.query('delete from handles where user_id = any($1::uuid[])', [TODAS]);
  await cliente?.query('delete from users where id = any($1::uuid[])', [TODAS]);
}

async function montarMassa(): Promise<void> {
  await limparMassa();
  await cliente.query(
    `insert into users (id, email, email_verified_at, phone_e164, phone_verified_at,
                        display_name, status, deleted_at, public_ref) values
       ($1, 'so-telefone@exemplo-de-teste.invalid', null, '+5511999990001', $5::timestamptz, 'Marina', 'active', null, $6),
       ($2, 'so-email@exemplo-de-teste.invalid',    $5::timestamptz, null,  null, 'Bruna',  'active', null, $7),
       ($3, 'sem-canal@exemplo-de-teste.invalid',   null, null,             null, 'Carla',  'active', null, $8),
       ($4, 'quem-olha@exemplo-de-teste.invalid',   $5::timestamptz, null,  null, 'Daniel', 'active', null, $9)`,
    [
      SO_TELEFONE,
      SO_EMAIL,
      SEM_CANAL,
      QUEM_OLHA,
      CONFIRMADO_EM,
      refPublico(1),
      refPublico(2),
      refPublico(3),
      refPublico(4),
    ],
  );
  for (const [conta, apelido] of Object.entries(APELIDOS)) {
    await cliente.query(
      `insert into handles (handle, handle_esqueleto, kind, user_id, claimed_at)
         values ($1, $2, 'pessoa', $3, $4)`,
      [apelido, apelido.replace(/-/g, ''), conta, CONFIRMADO_EM],
    );
  }
}

/**
 * `public_ref` é opaco e não entra em asserção nenhuma, mas a FORMA é cobrada
 * por `users_public_ref_forma`: exatamente 22 de `[A-Za-z0-9_-]`. Um valor de 21
 * derruba o `insert` com `23514`, antes de qualquer medição.
 */
function refPublico(n: number): string {
  const base = `IscaDoSeloRegua${String(n).padStart(2, '0')}`;
  return base.padEnd(22, 'z').slice(0, 22);
}

/**
 * O selo como o TERCEIRO o recebe: derivado **no SQL**, pela consulta real do
 * perfil de pessoa.
 *
 * Não é o fragmento isolado, de propósito: é a resposta da rota que o app lê.
 */
async function oQueOTerceiroVe(apelido: string): Promise<boolean> {
  const consulta = construtorDoPerfilPorApelido(db, apelido, QUEM_OLHA);
  const { rows } = await db.executeQuery(consulta);
  assert.equal(rows.length, 1, `o perfil de \`@${apelido}\` não foi encontrado`);
  return rows[0]!.canal_verificado;
}

/** O selo como o DONO o recebe: derivado em **TypeScript**, nas duas projeções. */
async function oQueODonoVe(conta: UserId): Promise<{ perfil: boolean; sessao: boolean }> {
  const lida = await repo.buscarContaPorId(conta);
  assert.ok(lida !== undefined, 'a conta da massa não foi lida');
  const doPerfil = projetarMeuPerfil(lida, null, (chave) => `https://img.test/${chave}`);
  const daSessao = projetarConta(lida);
  return {
    perfil: doPerfil['contact_channel_verified'] as boolean,
    sessao: daSessao.contact_channel_verified,
  };
}

void describe('a régua do selo é a MESMA no SQL e no TypeScript', () => {
  void it(
    'ISCA: telefone confirmado e e-mail NULO — o dono e o terceiro veem o MESMO selo',
    async () => {
      // **ESTE É O CASO QUE DEFINE A TAREFA.** Ele monta a conta que hoje não
      // existe e compara as duas camadas sobre a MESMA linha de `users`.
      //
      // ISCA: voltar `contact_channel_verified` a `conta.emailVerifiedAt !== null`
      // em `resposta-do-perfil.ts` compila, passa em toda conta real, e reprova
      // aqui com `false !== true`.
      const terceiro = await oQueOTerceiroVe(APELIDOS[SO_TELEFONE]!);
      const dono = await oQueODonoVe(SO_TELEFONE);

      assert.equal(
        terceiro,
        true,
        'o SQL não reconheceu o telefone confirmado: a régua de terceiro deixou de ser ' +
          'e-mail OU telefone',
      );
      assert.equal(
        dono.perfil,
        terceiro,
        'o DONO e o TERCEIRO discordam sobre a mesma conta. Esta é a divergência que o ' +
          'cliente mandou unificar em 21/10/2026: com a régua antiga do dono (só e-mail) ' +
          'esta conta aparece validada para os outros e não para si, e nada no produto ' +
          'diria por quê.',
      );
      assert.equal(
        dono.sessao,
        terceiro,
        '`SessionResponse.user` discorda do terceiro: o selo apareceria depois do login e ' +
          'sumiria ao abrir `Meus dados`',
      );
    },
  );

  void it('CONTRAPESO: só e-mail — as duas camadas continuam dizendo `true`', async () => {
    // Sem este caso, uma régua que respondesse `true` só para telefone passaria
    // no caso de cima.
    const terceiro = await oQueOTerceiroVe(APELIDOS[SO_EMAIL]!);
    const dono = await oQueODonoVe(SO_EMAIL);
    assert.equal(terceiro, true);
    assert.equal(dono.perfil, true);
    assert.equal(dono.sessao, true);
  });

  void it('CONTRAPESO: nenhum canal — as duas camadas dizem `false`', async () => {
    // E este é o que reprova um `true` fixo em qualquer das duas camadas.
    const terceiro = await oQueOTerceiroVe(APELIDOS[SEM_CANAL]!);
    const dono = await oQueODonoVe(SEM_CANAL);
    assert.equal(terceiro, false, 'o SQL devolveu selo para quem não confirmou nada');
    assert.equal(dono.perfil, false, 'a projeção do dono devolveu selo para quem não confirmou nada');
    assert.equal(dono.sessao, false);
  });

  void it(
    '`email_verified` do dono continua falando do E-MAIL, e não do selo',
    async () => {
      // A metade que impede "unificar" de virar licença para o campo mentir: a
      // conta de telefone confirmado tem `email_verified: false` e selo `true`,
      // na MESMA resposta.
      const lida = await repo.buscarContaPorId(SO_TELEFONE);
      assert.ok(lida !== undefined);
      const resposta = projetarMeuPerfil(lida, null, (chave) => `https://img.test/${chave}`);
      assert.equal(resposta['email_verified'], false, 'o e-mail desta conta NÃO foi confirmado');
      assert.equal(resposta['contact_channel_verified'], true);
      assert.equal(resposta['phone_verified'], true);
    },
  );

  void it(
    'a expressão da FONTE ÚNICA responde o mesmo que a consulta real, no mesmo Postgres',
    async () => {
      // O fragmento sozinho, contra a tabela de verdade. Ele é o que as oito
      // cópias viraram, e este caso é o que prova que o texto que ele emite é
      // SQL válido e com a semântica esperada -- um teste de texto não prova
      // nenhuma das duas coisas.
      const consulta = db
        .selectFrom('users as u')
        .select(canalDeContatoConfirmadoNoSql('u').as('canal'))
        .select('u.id as id')
        .where('u.id', '=', SO_TELEFONE)
        .compile();
      const { rows } = await db.executeQuery<{ canal: boolean }>(consulta);
      assert.equal(rows[0]?.canal, true);
      assert.equal(await oQueOTerceiroVe(APELIDOS[SO_TELEFONE]!), rows[0]?.canal);
    },
  );
});
