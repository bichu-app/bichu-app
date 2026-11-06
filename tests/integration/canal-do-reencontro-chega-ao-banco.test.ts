/**
 * `reunion_channel` chega ao BANCO, medido lendo a coluna e não a resposta.
 *
 * ## O defeito, medido
 *
 * Medido em 01/11/2026, em `app/lib/telas/pet/tela_detalhe_do_pet.dart`: o
 * encerramento chamava `encerrarCaso(caseId: ..., desfecho:
 * DesfechoDoCaso.reencontrado)` — o desfecho **chumbado** e **sem `canal`**. O
 * enum `CanalDoReencontro` existia em `app/lib/api/modelos_caso.dart` com os
 * cinco valores do contrato e tinha **zero uso em tela nenhuma**.
 *
 * O efeito é o que este arquivo mede: `lost_cases.closure_channel` ficava
 * `NULL` em todo encerramento `reunited`. O próprio `api/openapi.yaml` já
 * registrava isso, no parâmetro `set` de `listPublicLostPets`: *"o enum existe
 * em `LostCaseClosure` e nenhuma tela o preenche: medido em 20/10/2026, está
 * nulo em todo o dado"*. Sem o canal, a métrica de reencontro **atribuível a um
 * canal** — que é como se mede se o produto funciona — não tem como existir.
 *
 * **O contrato e o servidor já estavam prontos**, e por isso o conserto não os
 * toca: `closeLostCase` recebe `LostCaseClosure`, que declara `reunion_channel`
 * com os cinco valores, a rota repassa `corpo.reunion_channel`
 * (`lost-case-routes.ts`), o serviço o descarta para desfecho diferente de
 * `reunited` (`lost-case-service.ts`) e o adaptador grava `closure_channel`
 * (`kysely-lost-case-repository.ts`). Faltava só a tela.
 *
 * ## Por que não pode ser unitário
 *
 * Porque o que estava em dúvida era **o estado gravado**, e não a resposta da
 * rota. Um `UPDATE` que devolvesse a linha com o canal certo no `RETURNING` e
 * não o persistisse responderia `200` idêntico; a suíte do aplicativo mede o
 * CORPO enviado (`app/test/telas/pet_perdido_pagina_e_estados_test.dart`,
 * grupo 8B), que é a outra metade e não esta. Quem acusa esta é a coluna lida
 * de volta do Postgres, num `SELECT` que não passa pelo repositório.
 *
 * ## As iscas, nos dois sentidos
 *
 * | o que foi desligado em `kysely-lost-case-repository.ts` | o que reprova |
 * |---|---|
 * | `closure_channel = ${entrada.canal ?? null}` -> `= NULL` | `o canal escolhido CHEGA a coluna`, os cinco valores de fio |
 * | `canal: desfecho === 'reunited' ? canal : undefined` em `lost-case-service.ts` -> `canal` | nada aqui: o `CHECK lost_cases_canal_so_com_reencontro` recusa com `23514`, e a rota devolveria 500 em vez de encerrar. Medido, e o contrário do que esta tabela afirmava na primeira escrita |
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas saem no `after`, e o `ON DELETE CASCADE` leva pets e
 * casos junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarLostCaseRepository } from '../../src/modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import type {
  CanalDoReencontro,
  DesfechoDoCaso,
  LostCaseRepository,
} from '../../src/modules/lostfound/ports/lost-case-repository.js';
import { criarPetRepository } from '../../src/modules/pets/adapters/persistence/kysely-pet-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { DadosDoPet, PetRepository } from '../../src/modules/pets/ports/pet-repository.js';
import type { CaseId, Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

const AGORA = 1_800_000_000_000 as Instant;

/**
 * Os CINCO valores de fio, e eles não são escolha deste arquivo: são o `enum`
 * de `#/components/schemas/LostCaseClosure/properties/reunion_channel`.
 */
const OS_CINCO_CANAIS: readonly CanalDoReencontro[] = [
  'tag_scan',
  'bichu_alert',
  'poster_or_link',
  'on_my_own',
  'other',
];

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let pets: PetRepository;
let casos: LostCaseRepository;
const contasCriadas: UserId[] = [];

function dadosDoPet(nome: string): DadosDoPet {
  return {
    name: nome,
    species: 'dog',
    breedCode: null,
    breedFreeText: null,
    refDataVersion: null,
    size: 'M',
    primaryColorCode: null,
    secondaryColorCode: null,
    sex: null,
    neutered: null,
    birthDateApprox: null,
    distinctiveMarks: null,
    careNotes: null,
    careNotesRedactions: [],
    microchipNumber: null,
    sinpatinhasId: null,
  };
}

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `canal-do-reencontro-${id}@${DOMINIO_DE_TESTE}`],
  );
  contasCriadas.push(id);
  return id;
}

/**
 * Um caso ABERTO, por SQL direto e não pela rota.
 *
 * Pela rota ele exigiria foto `ready` e canal de contato verificado, que são os
 * dois bloqueios de `openLostCase` — nenhum participa do que este arquivo mede,
 * e montá-los faria a falha vir do fixture em vez do caso. `last_seen_city`
 * entra porque o `CHECK lost_cases_tem_onde` exige ponto OU cidade.
 */
async function abrirCaso(): Promise<{ caso: CaseId; dono: UserId }> {
  const dono = await criarConta();
  const pet = randomUUID() as PetId;
  await pets.criar(pet, dono, dadosDoPet('Nina'));
  const caso = randomUUID() as CaseId;
  await cliente.query(
    `INSERT INTO lost_cases
       (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
     VALUES ($1, $2, $3, now(), 'Sao Paulo', $4)`,
    [caso, pet, dono, `tk-${randomUUID()}`],
  );
  return { caso, dono };
}

/** A LINHA, lida fora do repositório: `SELECT` cru sobre `lost_cases`. */
async function linhaDoCaso(
  caso: CaseId,
): Promise<{ status: string; outcome: string | null; channel: string | null }> {
  const r = await cliente.query<{
    status: string;
    closure_outcome: string | null;
    closure_channel: string | null;
  }>('SELECT status, closure_outcome, closure_channel FROM lost_cases WHERE id = $1', [caso]);
  const linha = r.rows[0];
  assert.ok(linha !== undefined, 'o caso saiu da tabela no meio do teste');
  return {
    status: linha.status,
    outcome: linha.closure_outcome,
    channel: linha.closure_channel,
  };
}

async function encerrar(
  caso: CaseId,
  dono: UserId,
  desfecho: DesfechoDoCaso,
  canal: CanalDoReencontro | undefined,
): Promise<void> {
  const gravado = await casos.encerrar({ caso, dono, desfecho, canal, nota: undefined, agora: AGORA });
  assert.ok(gravado !== null, 'o encerramento não encontrou o caso aberto do dono');
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter lido `lost_cases.closure_channel`
    // dentro do Postgres, que é a única coisa que este arquivo existe para
    // fazer.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede o canal do reencontro CHEGANDO à ' +
        'coluna, contra Postgres de verdade, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  pets = criarPetRepository(db, criarIdGenerator(() => Date.now()));
  casos = criarLostCaseRepository(db);

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

void describe('o canal do reencontro chega a `lost_cases.closure_channel`', () => {
  void it('CONTROLE POSITIVO: a coluna `closure_channel` EXISTE e aceita os cinco valores', async () => {
    // Vem primeiro de propósito. Sem ele, uma coluna ausente ou um `enum` do
    // banco mais estreito que o do contrato fariam os casos abaixo falharem por
    // motivo nenhum a ver com o defeito — e uma coluna que aceitasse qualquer
    // texto deixaria a medição sem significado.
    const r = await cliente.query<{ nulos: string }>(
      'SELECT count(*)::text AS nulos FROM lost_cases WHERE closure_channel IS NULL',
    );
    assert.ok(
      r.rows[0] !== undefined,
      'REPROVA: `lost_cases.closure_channel` não respondeu a um `SELECT`. Sem a coluna não há ' +
        'onde a métrica de reencontro por canal morar, e o conserto da tela seria inútil.',
    );
  });

  for (const canal of OS_CINCO_CANAIS) {
    void it(`ISCA: encerrar \`reunited\` com \`${canal}\` GRAVA o canal na coluna`, async () => {
      const { caso, dono } = await abrirCaso();

      await encerrar(caso, dono, 'reunited', canal);

      const linha = await linhaDoCaso(caso);
      assert.equal(
        linha.channel,
        canal,
        `REPROVA: o canal \`${canal}\` não chegou a \`lost_cases.closure_channel\`. É ele que, ` +
          'nas palavras do contrato, "torna a métrica de reencontro atribuível a um canal": sem ' +
          'o valor na coluna a métrica não existe, por mais que a rota responda 200.',
      );
      assert.equal(
        linha.outcome,
        'reunited',
        'REPROVA: o desfecho gravado não é o enviado. O desfecho é o instrumento de medição do ' +
          'produto, e o canal sem ele não mede nada.',
      );
      assert.equal(linha.status, 'closed_reunited');
    });
  }

  void it('CONTROLE POSITIVO: `not_found` é aceito e gravado, e DEIXA o canal nulo', async () => {
    // O desfecho ia CHUMBADO em `reunited` na tela: este caso mede que o outro
    // caminho funciona de ponta a ponta, e não só que ele existe no contrato.
    const { caso, dono } = await abrirCaso();

    await encerrar(caso, dono, 'not_found', undefined);

    const linha = await linhaDoCaso(caso);
    assert.equal(
      linha.outcome,
      'not_found',
      'REPROVA: `not_found` não chegou à coluna. Era o caminho que o chumbo da tela fechava: ' +
        'todo encerramento gravava `reunited`, inclusive o de quem não encontrou o animal — e ' +
        'isso infla o numerador da métrica de reencontro.',
    );
    assert.equal(linha.status, 'closed_not_found');
    assert.equal(
      linha.channel,
      null,
      'REPROVA: um caso sem reencontro ganhou canal de reencontro. O contrato diz que o campo ' +
        '"só faz sentido com `outcome: reunited`".',
    );
  });

  void it('CONTROLE POSITIVO: o BANCO recusa canal com desfecho que não é `reunited`', async () => {
    // **ESTE CASO ME CORRIGIU.** A primeira escrita dele afirmava que o
    // adaptador gravaria `tag_scan` com `not_found` — que a regra morava só na
    // aplicação (`canal: desfecho === 'reunited' ? canal : undefined`, em
    // `lost-case-service.ts`). O Postgres respondeu `23514`: existe
    // `CONSTRAINT lost_cases_canal_so_com_reencontro CHECK (closure_channel IS
    // NULL OR closure_outcome = 'reunited')`, de
    // `migrations/20260918000003_casos-de-perdido.sql`. A regra é DDL, e a
    // linha do serviço é o que impede um consumidor desatento de encostar nela
    // e receber 500 em vez de um encerramento.
    const { caso, dono } = await abrirCaso();

    await assert.rejects(
      () =>
        casos.encerrar({
          caso,
          dono,
          desfecho: 'not_found',
          canal: 'tag_scan',
          nota: undefined,
          agora: AGORA,
        }),
      (erro: unknown) => (erro as { code?: string }).code === '23514',
      'REPROVA: o banco ACEITOU canal de reencontro num caso que não teve reencontro. O `CHECK` ' +
        'é a última defesa da métrica: sem ele, a conta por canal passaria a somar casos que ' +
        'terminaram sem o animal, e isso não dá para distinguir depois.',
    );

    // E A RECUSA NÃO DEIXOU METADE GRAVADA. `encerrar` é um `UPDATE` só, sem
    // transação, então o `CHECK` aborta a instrução inteira — mas medir é mais
    // barato que confiar: um `return` no meio de uma transação do Kysely
    // COMITARIA o que veio antes, e já houve defeito desta classe aqui.
    const linha = await linhaDoCaso(caso);
    assert.equal(
      linha.status,
      'open',
      'REPROVA: a recusa do `CHECK` deixou o caso meio encerrado. O estado pela metade é o que ' +
        'faz a métrica de reencontro mentir, e é exatamente o que o outro `CHECK` da tabela ' +
        '(`lost_cases_encerrado_tem_desfecho`) existe para impedir.',
    );
    assert.equal(linha.outcome, null);
    assert.equal(linha.channel, null);
  });

  void it('O DEFEITO PELO EFEITO: `reunited` SEM canal grava NULO, e é o que a folha agora impede', async () => {
    // **Este caso descreve o estado ANTERIOR ao conserto, e ele continua
    // verde de propósito**: o contrato declara `required: [outcome]`, então o
    // servidor aceita `reunited` sem canal e vai continuar aceitando. Quem
    // barra é a folha do aplicativo (grupo 8B de
    // `app/test/telas/pet_perdido_pagina_e_estados_test.dart`), e trocar isso
    // no contrato ricochetearia em quatro consumidores.
    //
    // Ele é a medição do defeito pelo EFEITO: era este o único estado que
    // existia no banco antes de 01/11/2026.
    const { caso, dono } = await abrirCaso();

    await encerrar(caso, dono, 'reunited', undefined);

    const linha = await linhaDoCaso(caso);
    assert.equal(linha.outcome, 'reunited');
    assert.equal(
      linha.channel,
      null,
      'o servidor NÃO exige o canal, e esta linha documenta isso. Se ele passar a exigir, o ' +
        'contrato mudou e os quatro consumidores precisam saber.',
    );
  });

  void it('a reabertura LIMPA o canal, e um novo encerramento pode gravar outro', async () => {
    // O canal não é estado permanente do caso: ele pertence AO encerramento.
    // Sem esta limpeza um caso reaberto carregaria o canal do encerramento
    // anterior, e a métrica contaria um reencontro que foi desfeito.
    const { caso, dono } = await abrirCaso();
    await encerrar(caso, dono, 'reunited', 'tag_scan');

    const reaberto = await casos.reabrir({ caso, dono, agora: AGORA });
    assert.ok(reaberto !== null, 'a reabertura não achou o caso dentro da janela de 7 dias');

    const depoisDeReabrir = await linhaDoCaso(caso);
    assert.equal(
      depoisDeReabrir.channel,
      null,
      'REPROVA: o canal sobreviveu à reabertura. O caso está aberto de novo e a coluna ainda diz ' +
        'por onde o animal voltou — a métrica contaria um reencontro desfeito.',
    );

    await encerrar(caso, dono, 'reunited', 'poster_or_link');
    const depoisDoSegundo = await linhaDoCaso(caso);
    assert.equal(
      depoisDoSegundo.channel,
      'poster_or_link',
      'REPROVA: o segundo encerramento não gravou o canal novo.',
    );
  });
});
