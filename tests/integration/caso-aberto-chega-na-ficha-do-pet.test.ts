/**
 * `Pet.open_case_id` chega na ficha do pet, contra Postgres de verdade.
 *
 * ## O defeito, medido
 *
 * O cliente, em 20/10/2026: *"o botão para desmarcar o pet como perdido no
 * perfil do usuário também não está funcionando."*
 *
 * `Encontrei meu pet` vive no ramo `_jaProcurado` de
 * `app/lib/telas/pet/tela_detalhe_do_pet.dart`, e esse ramo é o OU de dois
 * campos da ficha: `status == lost` e `open_case_id != null`. Medido em
 * 20/10/2026, com um caso `open` no banco e o mesmo artefato que a homologação
 * roda:
 *
 *   GET /v1/pets/{petId}  ->  200  {"status":"active","open_case_id":null}
 *
 * `pets.status` fica `active` de propósito (cabeçalho de
 * `kysely-perfil-publico.ts`: *"abrir um caso não muda `pets.status` hoje, e o
 * caso aberto é a fonte da verdade sobre 'perdido'"*), então `open_case_id` era
 * o único sinal possível — e `comoPet` o fixava em `null`. O botão de desmarcar
 * não era desenhado para nenhum pet, em nenhum estado. O encerramento em si
 * estava certo: `POST /v1/lost-cases/{caseId}/close {"outcome":"reunited"}`
 * respondeu `200` com `status: closed_reunited` e `reopen_deadline` a 7 dias.
 *
 * ## Por que não pode ser unitário
 *
 * O defeito tinha DUAS metades, e só uma aparece fora do banco: a consulta (que
 * `src/modules/pets/adapters/persistence/caso-aberto-na-leitura-do-pet.test.ts`
 * lê do SQL compilado) e a PROJEÇÃO em memória, `openCaseId: linha.open_case_id`
 * em `comoPet`. Devolver a projeção para `null` deixa o SQL intacto: o arquivo
 * unitário continua verde, e a ficha volta a mentir. Quem acusa isso é a linha
 * que o Postgres de fato devolveu.
 *
 * E a suíte do aplicativo não alcança nenhuma das duas: os casos de
 * `app/test/telas/pet_perdido_pagina_e_estados_test.dart` montam a ficha à mão
 * com `petDoContrato(status: 'lost', casoAberto: ...)`, que é uma resposta que o
 * servidor nunca emitiu.
 *
 * ## A isca, e como ela foi provada
 *
 * Em 20/10/2026, Node v22.23.2, contra `postgis/postgis:16-3.4` descartável, do
 * hospedeiro (a pilha de contêiner da integração não sobe nesta máquina hoje:
 * morre em `resolve image config`, saída 137). Cada desligamento foi confirmado
 * por diferença de conteúdo do arquivo ANTES de a suíte rodar.
 *
 * Base deste arquivo, com o conserto ligado: 6 casos, 6 passaram.
 *
 * | o que foi desligado em `kysely-pet-repository.ts` | placar | reprovaram, por nome |
 * |---|---|---|
 * | `openCaseId: linha.open_case_id` de volta para `openCaseId: null` | 3/3 | `a ficha do pet com caso ABERTO traz o identificador do caso`, `a ficha volta a NULO depois de o caso ser encerrado`, `a lista do tutor traz o caso no pet certo, e so nele` |
 * | a subconsulta inteira de `open_case_id` | 1/5 | os três acima, mais `a ficha do pet SEM caso nenhum traz nulo` e `o caso aberto de OUTRO tutor nao chega nesta ficha` -- sem a coluna na consulta o campo chega `undefined`, e nem o ramo de nulo passa |
 *
 * Na PRIMEIRA linha a suíte unitária ficou inteira verde (3455/1, só a
 * pré-existente do `viacep`). É a metade do defeito que nada fora do banco
 * alcança, e a razão de este arquivo existir.
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
import { criarPetRepository } from '../../src/modules/pets/adapters/persistence/kysely-pet-repository.js';
import type { DadosDoPet, PetRepository } from '../../src/modules/pets/ports/pet-repository.js';
import type { PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let pets: PetRepository;
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
    [id, `caso-na-ficha-${id}@${DOMINIO_DE_TESTE}`],
  );
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId, nome: string): Promise<PetId> {
  const id = randomUUID() as PetId;
  await pets.criar(id, dono, dadosDoPet(nome));
  return id;
}

/**
 * Um caso de perdido por SQL direto, e não pela rota.
 *
 * Pela rota ele exigiria foto `ready` e canal de contato verificado, que são os
 * dois bloqueios de `openLostCase` — nenhum dos dois participa do que este
 * arquivo mede, e montá-los faria a falha vir do fixture em vez do caso.
 */
async function abrirCaso(pet: PetId, dono: UserId): Promise<string> {
  const id = randomUUID();
  // `last_seen_city` entra porque o `CHECK lost_cases_tem_onde` exige ponto OU
  // cidade. Sem ele o `INSERT` reprova com `23514` e os casos deste arquivo
  // falham pelo fixture, e nao pelo que medem -- foi o que aconteceu na primeira
  // escrita dele.
  await cliente.query(
    `INSERT INTO lost_cases
       (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
     VALUES ($1, $2, $3, now(), 'Sao Paulo', $4)`,
    [id, pet, dono, `tk-${randomUUID()}`],
  );
  return id;
}

/** O encerramento como `closeLostCase` o grava: estado, desfecho e `closed_at`. */
async function encerrarCaso(caso: string): Promise<void> {
  await cliente.query(
    `UPDATE lost_cases
        SET status = 'closed_reunited',
            closure_outcome = 'reunited',
            closed_at = now(),
            reopen_deadline = now() + interval '7 days'
      WHERE id = $1`,
    [caso],
  );
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter lido uma linha de `lost_cases` dentro do
    // Postgres, que é exatamente o que este arquivo existe para fazer.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede a ficha do pet carregando o caso ' +
        'aberto contra Postgres de verdade, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  pets = criarPetRepository(db);

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

void describe('a ficha do pet carrega o caso aberto, e e isso que desenha o botao de desmarcar', () => {
  void it('a ficha do pet com caso ABERTO traz o identificador do caso', async () => {
    const dono = await criarConta();
    const pet = await criarPet(dono, 'Perdido');
    const caso = await abrirCaso(pet, dono);

    const ficha = await pets.buscarDoTutor(pet, dono);

    assert.ok(ficha !== null, 'o dono não leu o próprio pet');
    assert.equal(
      ficha.openCaseId,
      caso,
      'a ficha não traz o caso aberto. É o campo que desenha `Encontrei meu pet`: o ramo ' +
        '`_jaProcurado` da tela é o OU de `status == lost` com `open_case_id != null`, e ' +
        '`pets.status` NÃO vira `lost` ao abrir um caso. Sem este campo o botão de desmarcar ' +
        'não aparece para nenhum pet, que foi o defeito relatado pelo cliente em 20/10/2026.',
    );
  });

  void it('a ficha do pet SEM caso nenhum traz nulo', async () => {
    const dono = await criarConta();
    const pet = await criarPet(dono, 'Em casa');

    const ficha = await pets.buscarDoTutor(pet, dono);

    assert.ok(ficha !== null);
    assert.equal(
      ficha.openCaseId,
      null,
      'pet sem caso ganhou identificador de caso. A tela mostraria a faixa de urgência e o ' +
        'botão de desmarcar para um animal que nunca foi procurado.',
    );
  });

  void it('a ficha volta a NULO depois de o caso ser encerrado', async () => {
    const dono = await criarConta();
    const pet = await criarPet(dono, 'Voltou');
    const caso = await abrirCaso(pet, dono);

    const antes = await pets.buscarDoTutor(pet, dono);
    assert.equal(
      antes?.openCaseId,
      caso,
      'a ficha já não traz o caso ABERTO, e este caso nem chegou a medir o encerramento. ' +
        'O `INSERT` do fixture foi conferido: ele grava `status` padrão `open` e passa pelo ' +
        '`CHECK lost_cases_tem_onde`.',
    );

    await encerrarCaso(caso);
    const depois = await pets.buscarDoTutor(pet, dono);

    assert.equal(
      depois?.openCaseId,
      null,
      'o caso ENCERRADO continua saindo como caso aberto. A tela ficaria com a faixa de ' +
        'urgência e com `Encontrei meu pet` sobre um caso que já tem desfecho, e o segundo ' +
        'toque receberia 404 — que é o que `encerrar` devolve para caso fora de `open`.',
    );
  });

  void it('a lista do tutor traz o caso no pet certo, e so nele', async () => {
    const dono = await criarConta();
    const perdido = await criarPet(dono, 'Lista perdido');
    const emCasa = await criarPet(dono, 'Lista em casa');
    const caso = await abrirCaso(perdido, dono);

    const lista = await pets.listarDoTutor(dono);
    const porId = new Map(lista.map((p) => [p.id, p.openCaseId]));

    assert.equal(lista.length, 2, `a lista trouxe ${String(lista.length)} pets em vez de 2`);
    assert.equal(
      porId.get(perdido),
      caso,
      'a lista do tutor não traz o caso aberto. `listarDoTutor` e `buscarDoTutor` partem da ' +
        'MESMA `construtorDaLeituraDoDono`, e um caso que passa só na busca significa que a ' +
        'base deixou de ser uma.',
    );
    assert.equal(
      porId.get(emCasa),
      null,
      'o caso de UM pet escorreu para o outro pet do mesmo tutor: a subconsulta deixou de se ' +
        'correlacionar por `pets.id`.',
    );
  });

  void it('o caso aberto de OUTRO tutor nao chega nesta ficha', async () => {
    const a = await criarConta();
    const b = await criarConta();
    const petDeA = await criarPet(a, 'De A');
    const petDeB = await criarPet(b, 'De B');
    await abrirCaso(petDeB, b);

    const ficha = await pets.buscarDoTutor(petDeA, a);

    assert.ok(ficha !== null);
    assert.equal(
      ficha.openCaseId,
      null,
      'o caso do pet de outra conta apareceu na ficha deste. ADR-0021: a autorização mora no ' +
        'WHERE, e a correlação por `pets.id` é o que a mantém de pé dentro da subconsulta.',
    );
  });

  void it('abrir o caso NAO muda `pets.status`, e e por isso que o campo acima precisa existir', async () => {
    // Medido, e não suposto. Esta asserção registra o motivo do conserto: se um
    // dia o produto passar a escrever `pets.status = 'lost'`, este caso reprova
    // e manda revisitar `_jaProcurado` no aplicativo em vez de deixar dois sinais
    // concorrentes para o mesmo estado.
    const dono = await criarConta();
    const pet = await criarPet(dono, 'Status intacto');
    await abrirCaso(pet, dono);

    const ficha = await pets.buscarDoTutor(pet, dono);

    assert.equal(
      ficha?.status,
      'active',
      'abrir um caso passou a mexer em `pets.status`. O cabeçalho de ' +
        '`kysely-perfil-publico.ts` diz que o caso aberto é a fonte da verdade sobre ' +
        '"perdido"; dois lugares dizendo isso divergem, e o app lê os dois.',
    );
  });
});
