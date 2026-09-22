/**
 * A trava de dono da reimpressão do QR, contra Postgres de verdade (BICHUS-237).
 *
 * ## O que este arquivo mede, e o que ele não consegue medir
 *
 * Ele mede o **efeito**: duas contas, dois pets, duas tags, e a conta B pedindo
 * a reimpressão da tag de A não recebe o cifrado. É o teste que faltava — a
 * suíte unitária da rota `qr.png` prova que o dublê recusa, e o dublê não é o
 * `WHERE`.
 *
 * Ele **não** consegue provar onde a decisão mora. Um `buscarParaReimpressao`
 * que lesse a linha de A e a descartasse num `if` passaria aqui exatamente
 * igual, e o dia em que alguém mexesse no `if` não teria testemunha. Essa parte
 * é de `src/modules/tags/adapters/persistence/autorizacao-na-clausula-where.test.ts`,
 * que compila a consulta e lê o predicado. Os dois arquivos são necessários e
 * nenhum dos dois é suficiente sozinho.
 *
 * ## Por que não pode ser unitário
 *
 * Nada do que está aqui existe fora do banco: o `innerJoin` entre `pet_tags` e
 * `pets`, o `owner_user_id` que o Postgres de fato compara, e o
 * `pets.deleted_at is null` que decide se um pet excluído ainda reimprime. Um
 * dublê em memória responde o que o autor do dublê acreditou.
 *
 * ## A isca, e como ela foi provada
 *
 * Removida a linha `.where('pets.owner_user_id', '=', dono)` de
 * `construtorDaBuscaParaReimpressao`, em 22/09/2026, Node v26.8.2:
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | o predicado do dono na busca para reimpressão | 1 caso (de 68) |
 *
 * É `a conta B NÃO recebe o cifrado da tag de A` que reprova, e ela reprova
 * porque o Postgres devolveu a linha — não porque um dublê recusou.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE` leva
 * pets e tags junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarTagRepository } from '../../src/modules/tags/adapters/persistence/kysely-tag-repository.js';
import type { TagRepository } from '../../src/modules/tags/ports/tag-repository.js';
import type { Instant, PetId, TagId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: TagRepository;
const contasCriadas: UserId[] = [];

interface Plaquinha {
  readonly dono: UserId;
  readonly pet: PetId;
  readonly tag: TagId;
  readonly cifrado: Uint8Array;
}

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus237-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/**
 * Uma conta com um pet e uma tag ativa, gravada por SQL direto.
 *
 * O cifrado é único por plaquinha de propósito: é ele que o caso do vazamento
 * compara. Dois cifrados iguais fariam o teste passar mesmo servindo a linha
 * errada.
 */
async function criarPlaquinha(sufixo: string): Promise<Plaquinha> {
  // O alfabeto do `code_suffix` exclui I, L, O e U — os quatro que se confundem
  // com 1 e 0 numa plaquinha de metal lida no escuro. Conferir aqui em vez de
  // deixar o `CHECK` reprovar dá o nome do caso em vez de um 23514 do Postgres.
  assert.match(sufixo, /^[0-9A-HJKMNP-TV-Z]{4}$/, `sufixo fora do alfabeto: ${sufixo}`);

  const dono = await criarConta();
  const pet = randomUUID() as PetId;
  const tag = randomUUID() as TagId;
  const cifrado = new TextEncoder().encode(`cifrado-de-${sufixo}`);

  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, dono, `Pet ${sufixo}`],
  );
  await cliente.query(
    `INSERT INTO pet_tags (id, pet_id, code_hash, code_ciphertext, code_suffix)
     VALUES ($1, $2, $3, $4, $5)`,
    [tag, pet, Buffer.alloc(32, sufixo.charCodeAt(0)), Buffer.from(cifrado), sufixo],
  );

  return { dono, pet, tag, cifrado };
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter comparado um `owner_user_id` dentro do
    // Postgres, que é exatamente o que este arquivo existe para impedir.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede a trava de dono da reimpressão do ' +
        'QR contra Postgres de verdade, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarTagRepository(db);

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

void describe('a reimpressão do QR é do dono, e quem decide isso é o Postgres', () => {
  void it('o dono recebe o cifrado da SUA tag', async () => {
    const a = await criarPlaquinha('AAAA');

    const achado = await repo.buscarParaReimpressao(a.pet, a.tag, a.dono);

    assert.ok(achado !== undefined, 'o próprio dono não conseguiu reimprimir a própria tag');
    assert.equal(achado.status, 'active');
    assert.deepEqual(
      achado.codeCiphertext === null ? null : [...achado.codeCiphertext],
      [...a.cifrado],
      'o cifrado devolvido não é o que a emissão gravou',
    );
  });

  void it('a conta B NÃO recebe o cifrado da tag de A, e o resultado é indistinguível de inexistente', async () => {
    const a = await criarPlaquinha('BBBB');
    const b = await criarPlaquinha('CCCC');

    // O par pet/tag é o VERDADEIRO — nada adivinhado. É o cenário do ADR-0021:
    // quem tem o par na mão, por link compartilhado ou por enumeração, e a
    // conta errada no token.
    const roubo = await repo.buscarParaReimpressao(a.pet, a.tag, b.dono);

    assert.equal(
      roubo,
      undefined,
      'o cifrado de outra pessoa saiu da consulta. O QR carrega o código dentro dos pixels ' +
        'e o ADR-0004 diz que ele é irreversível: quem baixar a imagem tem a credencial da ' +
        'plaquinha alheia, para sempre',
    );

    // "Indistinguível de inexistente" é o que produz 404 e não 403 (ADR-0021).
    const inexistente = await repo.buscarParaReimpressao(a.pet, randomUUID() as TagId, b.dono);
    assert.equal(roubo, inexistente);
  });

  void it('a tag certa com o pet de outra pessoa também não reimprime', async () => {
    const a = await criarPlaquinha('DDDD');
    const b = await criarPlaquinha('EEEE');

    // O terceiro caso do mesmo WHERE: dono certo, tag certa, pet trocado. Sem o
    // `pet_id` no predicado, o dono de B reimprimiria a tag de B por um caminho
    // que o contrato diz ser do pet de A.
    assert.equal(await repo.buscarParaReimpressao(a.pet, b.tag, b.dono), undefined);
  });

  void it('pet excluído não reimprime, nem para o próprio dono', async () => {
    const a = await criarPlaquinha('FFFF');
    await cliente.query('UPDATE pets SET deleted_at = now() WHERE id = $1', [a.pet]);

    assert.equal(
      await repo.buscarParaReimpressao(a.pet, a.tag, a.dono),
      undefined,
      '`pets.deleted_at is null` saiu do WHERE: a plaquinha de um pet excluído voltou a ' +
        'ser reimprimível',
    );
  });

  void it('a tag revogada do próprio dono é DISTINGUÍVEL da inexistente, e é isso que dá 410', async () => {
    const a = await criarPlaquinha('HHHH');
    await cliente.query(
      `UPDATE pet_tags
          SET status = 'revoked', revoked_at = now(), revocation_reason = 'owner_request',
              code_ciphertext = NULL
        WHERE id = $1`,
      [a.tag],
    );

    const achado = await repo.buscarParaReimpressao(a.pet, a.tag, a.dono);

    // `status` NÃO entra no WHERE de propósito. Se entrasse, este caso viraria
    // `undefined`, a rota responderia 404, e o tutor que revogou a plaquinha
    // veria "não existe" no lugar de "você revogou esta".
    assert.ok(achado !== undefined, 'a tag revogada do próprio dono virou 404 em vez de 410');
    assert.equal(achado.status, 'revoked');
    assert.equal(achado.codeCiphertext, null, 'a revogação apaga o cifrado (ADR-0004)');
  });

  void it('a listagem de tags do pet não atravessa contas', async () => {
    const a = await criarPlaquinha('JJJJ');
    const b = await criarPlaquinha('KKKK');

    const minhas = await repo.listarTagsDoPet(a.pet, a.dono);
    assert.equal(minhas?.length, 1);
    assert.equal(minhas?.[0]?.id, a.tag);

    assert.equal(
      await repo.listarTagsDoPet(a.pet, b.dono),
      undefined,
      'a conta B listou as plaquinhas do pet de A',
    );
  });

  void it('emitir para o pet de outra pessoa é recusado pela consulta, e não por um `if`', async () => {
    const a = await criarPlaquinha('PPPP');
    const b = await criarPlaquinha('MMMM');

    const resultado = await repo.emitir(
      {
        id: randomUUID() as TagId,
        petId: a.pet,
        codeHash: new Uint8Array(32).fill(0x11),
        codeCiphertext: new TextEncoder().encode('cifrado-intruso'),
        codeSuffix: 'NNNN',
        label: null,
      },
      b.dono,
      AGORA,
    );

    assert.deepEqual(resultado, { tipo: 'pet_nao_e_deste_tutor' });

    const r = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM pet_tags WHERE pet_id = $1',
      [a.pet],
    );
    assert.equal(r.rows[0]?.n, '1', 'a emissão intrusa gravou uma plaquinha no pet de A');
  });
});
