/**
 * As travas de dono do cadastro e da mídia, contra Postgres de verdade.
 *
 * ## O que este arquivo mede, e o que ele não consegue medir
 *
 * Ele mede o **efeito**: duas contas, dois pets, duas fotos, e a conta B não lê,
 * não edita, não apaga e não fotografa o pet de A. É o teste que faltava —
 * cada uma das nove cláusulas de dono destes dois adaptadores foi removida, uma
 * por vez, e os 967 casos unitários continuaram verdes nas nove.
 *
 * Ele **não** consegue provar onde a decisão mora. Um `buscarDoTutor` que lesse
 * a linha de A e a descartasse num `if` passaria aqui exatamente igual, e o dia
 * em que alguém mexesse no `if` não teria testemunha. Essa parte é dos dois
 * `autorizacao-na-clausula-where.test.ts`, que compilam a consulta e leem o
 * predicado. Os arquivos são necessários e nenhum é suficiente sozinho.
 *
 * ## Por que não pode ser unitário
 *
 * A lição da BICHUS-91: o autor transformou `revogarDoDono` num `no-op` e a
 * suíte unitária inteira ficou verde; só a integração reprovou. Nada do que
 * está aqui existe fora do banco — o `innerJoin` entre `pet_photos` e `pets`, o
 * `exists` correlacionado da exclusão de foto, o `owner_user_id` que o Postgres
 * de fato compara, e o `numUpdatedRows` que decide se a rota responde 404. Um
 * dublê em memória responde o que o autor do dublê acreditou.
 *
 * ## A isca, e como ela foi provada
 *
 * Em 22/09/2026, Node v26.8.2 (contêiner da integração: Node 22).
 *
 * Base: 71 casos, 71 passaram.
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaLeituraDoDono` | 2 casos |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaContagemDoTutor` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaAtualizacao` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaExclusao` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaConferenciaDoPet` | 1 caso |
 * | `.where('user_id', '=', dono)` de `construtorDaIntencaoAberta` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaListaDoPet` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaBuscaDeFoto` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` do `exists` da exclusão de foto | 1 caso |
 *
 * Cada desligamento foi confirmado por diferença de conteúdo do arquivo ANTES
 * de a suíte rodar: a tentativa que não casa com o texto reescreve o mesmo
 * conteúdo, a suíte fica verde, e isso quase virou "a isca não pega esse caso"
 * na BICHUS-237.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE` leva
 * pets, intenções e fotos junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarPetRepository } from '../../src/modules/pets/adapters/persistence/kysely-pet-repository.js';
import { criarMediaRepository } from '../../src/modules/media/adapters/persistence/kysely-media-repository.js';
import type { DadosDoPet, PetRepository } from '../../src/modules/pets/ports/pet-repository.js';
import type { MediaRepository } from '../../src/modules/media/ports/media-repository.js';
import type { Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let pets: PetRepository;
let midia: MediaRepository;
const contasCriadas: UserId[] = [];

interface Tutor {
  readonly dono: UserId;
  readonly pet: PetId;
  readonly foto: string;
  readonly intencao: string;
  /** Único por tutor: é o que os casos de vazamento comparam. */
  readonly chave: string;
}

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
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `iscas-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/**
 * Uma conta com um pet, uma intenção de envio aberta e uma foto, por SQL direto.
 *
 * A chave do objeto é única por tutor de propósito: duas chaves iguais fariam o
 * teste passar mesmo servindo a linha errada.
 */
async function criarTutor(marca: string): Promise<Tutor> {
  const dono = await criarConta();
  const pet = randomUUID() as PetId;
  const foto = randomUUID();
  const intencao = randomUUID();
  // A forma que este sistema escreve: `pets/{petId}/original/{nome}`
  // (`comoObjectKey`, BICHUS-134). A primeira versão deste fixture usava
  // `original/{marca}/...`, e o domínio recusou a chave na LEITURA — três casos
  // reprovaram com um erro de chave de objeto, que não é o que eles medem.
  // Conferir aqui, antes de gravar, faz a falha vir com o nome do caso em vez
  // de um erro vindo do fundo do adaptador.
  const chave = `pets/${pet}/original/${foto}.jpg`;
  assert.match(
    chave,
    /^pets\/[A-Za-z0-9-]+\/original\/[A-Za-z0-9._-]+$/,
    `chave de objeto fora da forma que o domínio aceita: ${chave}`,
  );

  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, dono, `Pet ${marca}`],
  );
  await cliente.query(
    `INSERT INTO upload_intents
       (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at)
     VALUES ($1, $2, $3, 'pet_photo', $4, 'image/jpeg', 5000000, $5)`,
    [intencao, dono, pet, chave, new Date(Number(AGORA) + 3_600_000)],
  );
  await cliente.query(
    `INSERT INTO pet_photos (id, pet_id, upload_intent_id, original_key, is_primary)
     VALUES ($1, $2, $3, $4, true)`,
    [foto, pet, intencao, chave],
  );

  return { dono, pet, foto, intencao, chave };
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter comparado um `owner_user_id` dentro do
    // Postgres, que é exatamente o que este arquivo existe para impedir.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede as travas de dono do cadastro e da ' +
        'mídia contra Postgres de verdade, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  pets = criarPetRepository(db);
  midia = criarMediaRepository(db);

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

void describe('o cadastro do pet é do dono, e quem decide isso é o Postgres', () => {
  void it('o dono lê o SEU pet, e a conta B não lê o pet de A', async () => {
    const a = await criarTutor('leitura-a');
    const b = await criarTutor('leitura-b');

    const meu = await pets.buscarDoTutor(a.pet, a.dono);
    assert.ok(meu !== null, 'o próprio dono não conseguiu ler o próprio pet');
    assert.equal(meu.id, a.pet);

    // O id do pet é o VERDADEIRO — nada adivinhado. É o cenário do ADR-0021:
    // quem tem o id na mão e a conta errada no token.
    const roubo = await pets.buscarDoTutor(a.pet, b.dono);
    assert.equal(
      roubo,
      null,
      'a ficha de outra pessoa saiu da consulta: nome, marcas, microchip e notas de cuidado ' +
        'do pet alheio',
    );

    // "Indistinguível de inexistente" é o que produz 404 e não 403 (ADR-0021).
    assert.equal(roubo, await pets.buscarDoTutor(randomUUID() as PetId, b.dono));
  });

  void it('a listagem não atravessa contas', async () => {
    const a = await criarTutor('lista-a');
    const b = await criarTutor('lista-b');

    const minha = await pets.listarDoTutor(a.dono);
    assert.equal(minha.length, 1);
    assert.equal(minha[0]?.id, a.pet);
    assert.ok(
      !minha.some((p) => p.id === b.pet),
      'a listagem de A trouxe o pet de B',
    );
  });

  void it('a contagem do tutor conta os pets DELE, e não os do mundo', async () => {
    const a = await criarTutor('conta-a');
    await criarTutor('conta-b');
    await criarTutor('conta-c');

    assert.equal(
      await pets.contarDoTutor(a.dono),
      1,
      'a contagem que decide o teto de pets por conta passou a contar os pets de todo mundo: ' +
        'a próxima conta a criar um pet bateria no teto sem ter nenhum',
    );
  });

  void it('a conta B NÃO edita a ficha do pet de A', async () => {
    const a = await criarTutor('edita-a');
    const b = await criarTutor('edita-b');

    const tentativa = await pets.atualizar(a.pet, b.dono, dadosDoPet('Renomeado pelo intruso'));
    assert.equal(tentativa, null, 'a conta B editou a ficha do pet de A');

    // O `null` acima poderia vir de um `if`; o banco é quem responde aqui.
    const linha = await cliente.query<{ name: string }>('SELECT name FROM pets WHERE id = $1', [
      a.pet,
    ]);
    assert.equal(
      linha.rows[0]?.name,
      'Pet edita-a',
      'o UPDATE gravou na ficha de outro tutor: o `numUpdatedRows` devolveu 0 e mesmo assim ' +
        'a linha mudou, ou o predicado do dono saiu do WHERE',
    );
  });

  void it('a conta B NÃO exclui o pet de A', async () => {
    const a = await criarTutor('exclui-a');
    const b = await criarTutor('exclui-b');

    assert.equal(await pets.excluir(a.pet, b.dono, AGORA), false, 'a conta B excluiu o pet de A');

    const linha = await cliente.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM pets WHERE id = $1',
      [a.pet],
    );
    assert.equal(
      linha.rows[0]?.deleted_at,
      null,
      'o pet de A foi marcado como excluído por uma conta que não é a dele',
    );

    // E o dono continua conseguindo excluir o próprio: a trava não pode ser uma
    // recusa geral que passaria neste arquivo por acidente.
    assert.equal(await pets.excluir(a.pet, a.dono, AGORA), true);
  });
});

void describe('a mídia do pet é do dono, e quem decide isso é o Postgres', () => {
  void it('a conferência do pet recusa o pet alheio', async () => {
    const a = await criarTutor('midia-conf-a');
    const b = await criarTutor('midia-conf-b');

    assert.equal(await midia.petEhDoTutor(a.pet, a.dono), true);
    assert.equal(
      await midia.petEhDoTutor(a.pet, b.dono),
      false,
      'a conta B recebeu autorização para enviar foto ao pet de A',
    );
  });

  void it('a intenção de envio de A não abre para B, e o dono dela é `user_id`', async () => {
    const a = await criarTutor('intencao-a');
    const b = await criarTutor('intencao-b');

    const minha = await midia.buscarIntencaoAberta(a.intencao, a.dono, AGORA);
    assert.ok(minha !== null, 'o próprio dono não abriu a própria intenção');
    assert.equal(minha.objectKey, a.chave);

    const roubo = await midia.buscarIntencaoAberta(a.intencao, b.dono, AGORA);
    assert.equal(
      roubo,
      null,
      'a conta B abriu a intenção de envio de A: ela receberia a chave do objeto de outra ' +
        'pessoa e confirmaria o envio no lugar dela',
    );
  });

  void it('a conta B NÃO lista as fotos do pet de A', async () => {
    const a = await criarTutor('lista-foto-a');
    const b = await criarTutor('lista-foto-b');

    const minhas = await midia.listarDoPet(a.pet, a.dono);
    assert.equal(minhas.length, 1);
    assert.equal(minhas[0]?.id, a.foto);

    assert.deepEqual(
      await midia.listarDoPet(a.pet, b.dono),
      [],
      'a conta B listou as fotos do pet de A',
    );
  });

  void it('a conta B NÃO lê a foto de A, nem com o par pet/foto verdadeiro', async () => {
    const a = await criarTutor('busca-foto-a');
    const b = await criarTutor('busca-foto-b');

    const minha = await midia.buscarFoto(a.pet, a.foto, a.dono);
    assert.ok(minha !== null, 'o próprio dono não leu a própria foto');
    assert.equal(minha.originalKey, a.chave);

    const roubo = await midia.buscarFoto(a.pet, a.foto, b.dono);
    assert.equal(
      roubo,
      null,
      'a chave do original de outra pessoa saiu da consulta. O original mora no bucket ' +
        'privado e a rota assina uma URL para ele: quem recebe a chave recebe a foto',
    );
    assert.equal(roubo, await midia.buscarFoto(a.pet, randomUUID(), b.dono));
  });

  void it('a conta B NÃO apaga a foto de A, e o `exists` é correlacionado', async () => {
    const a = await criarTutor('apaga-foto-a');
    const b = await criarTutor('apaga-foto-b');

    // B TEM um pet. É o caso que um `exists` sem correlação deixaria passar:
    // ele responderia "esta conta tem algum pet?" em vez de "esta conta é dona
    // DESTE pet?", e uma conta com um pet qualquer apagaria a foto de qualquer um.
    assert.equal(
      await midia.excluirFoto(a.pet, a.foto, b.dono, AGORA),
      false,
      'a conta B apagou a foto do pet de A',
    );

    const linha = await cliente.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM pet_photos WHERE id = $1',
      [a.foto],
    );
    assert.equal(
      linha.rows[0]?.deleted_at,
      null,
      'a foto de A foi marcada como excluída por uma conta que não é a dela',
    );

    assert.equal(await midia.excluirFoto(a.pet, a.foto, a.dono, AGORA), true);
  });
});
