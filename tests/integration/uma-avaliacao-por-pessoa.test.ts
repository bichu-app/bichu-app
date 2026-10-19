/**
 * **Uma avaliação por pessoa, e a nota de 1 a 5 — conferido no BANCO.**
 *
 * ## Por que este arquivo existe
 *
 * `professional_reviews` tem o índice `professional_reviews_uma_por_autor`
 * (`UNIQUE (professional_id, author_user_id)`) e o CHECK
 * `professional_reviews_rating_faixa` (`rating >= 1 AND rating <= 5`). Nenhum
 * caso da árvore os exercitava: varri `tests/integration/` e só
 * `fila-de-indicacoes-do-diretorio.test.ts` menciona a tabela, de passagem, e
 * nenhum caso tenta a SEGUNDA avaliação da mesma pessoa.
 *
 * A regra "uma avaliação por pessoa" é um pedido do cliente de 18/10/2026 e
 * **não pode ser provada em unidade**: ela não está em nenhuma função de
 * domínio, está no índice. Um dublê de repositório que recusasse a segunda
 * avaliação provaria o dublê, não o produto — e é exatamente o tipo de caso
 * verde que não mede nada. Por isso ela mora aqui, onde há banco de verdade.
 *
 * `avaliacao-do-local.test.ts` (unidade) cobre a outra metade: a faixa da nota
 * recusada na ENTRADA, com o campo nomeado para a tela. As duas camadas são
 * deliberadas e o próprio domínio diz por quê: "esta funcao e a SEGUNDA recusa
 * e nao a unica. A primeira e o schema do contrato (…); a terceira sao os
 * `CHECK` de `professional_reviews`. As tres existem porque cada uma e a que
 * sobra quando as outras forem contornadas". Este arquivo é a terceira.
 *
 * ## O QUE DESLIGAR PARA VER CADA CASO REPROVAR
 *
 * Numa migração nova (NÃO altere as que já subiram):
 *
 * - `DROP INDEX professional_reviews_uma_por_autor;` — reprova
 *   `a SEGUNDA avaliação da mesma pessoa no mesmo local é RECUSADA`. É o caso
 *   que carrega o arquivo;
 * - trocar o índice por `UNIQUE (professional_id, author_user_id, created_at)`
 *   — reprova o mesmo caso, e é a forma mais plausível de o defeito voltar:
 *   parece unicidade e não é;
 * - `ALTER TABLE professional_reviews DROP CONSTRAINT
 *   professional_reviews_rating_faixa;` — reprovam
 *   `nota 0 e nota 6 são RECUSADAS pelo banco` nas duas pontas;
 * - trocar a faixa para `rating >= 1 AND rating <= 4` — reprova
 *   `as cinco notas da faixa entram`, que é a guarda contra o conserto
 *   preguiçoso de estreitar o limite (o projeto já teve um teste que afirmava
 *   "para em 16 símbolos: o 17º não entra", e era o defeito);
 * - `DROP INDEX professional_reviews_ref_unico;` — reprova
 *   `dois `ref` iguais são RECUSADOS`.
 *
 * E, sem tocar no banco: trocar o `assert.rejects` de qualquer caso por um
 * `try/catch` que engole o erro faz o caso passar sempre — por isso cada
 * recusa confere o **código** do erro do Postgres (`23505` para unicidade,
 * `23514` para CHECK) e o **nome da restrição**, e não só "deu erro". Erro de
 * digitação no SQL também "dá erro".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** Prefixo próprio: a limpeza apaga só o que este arquivo criou. */
const PREFIXO = 'isca-uma-avaliacao-';

let cliente: pg.Client;
let localId = '';
let autorId = '';
let outroAutorId = '';
let outroLocalId = '';

/** `ref` no formato que o CHECK exige: 22 caracteres de `[A-Za-z0-9_-]`. */
function ref(semente: string): string {
  return semente.padEnd(22, 'x').slice(0, 22);
}

/** O erro do Postgres, com o que importa para distinguir uma recusa de um acidente. */
interface ErroDoBanco {
  readonly code?: string;
  readonly constraint?: string;
  readonly message?: string;
}

async function inserirAvaliacao(campos: {
  readonly local: string;
  readonly autor: string;
  readonly nota: number;
  readonly ref: string;
}): Promise<void> {
  await cliente.query(
    `INSERT INTO professional_reviews (id, ref, professional_id, author_user_id, rating)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), campos.ref, campos.local, campos.autor, campos.nota],
  );
}

/**
 * Exige que a escrita seja recusada pelo banco, COM o código e a restrição
 * esperados. É o que separa "o banco recusou pela regra" de "o SQL estava
 * errado" — e sem isso o caso passaria com qualquer erro.
 */
async function recusadaPor(
  escrita: () => Promise<void>,
  codigo: string,
  restricao: string,
): Promise<void> {
  await assert.rejects(
    escrita,
    (erro: unknown) => {
      const e = erro as ErroDoBanco;
      assert.equal(e.code, codigo, `o banco recusou por outro motivo: ${String(e.message)}`);
      assert.equal(
        e.constraint,
        restricao,
        `recusou por outra restrição (${String(e.constraint)}), e não por ${restricao}`,
      );
      return true;
    },
  );
}

void describe('uma avaliação por pessoa, e a faixa da nota, no banco', () => {
  before(async () => {
    assert.ok(
      CONEXAO !== undefined && CONEXAO !== '',
      'DATABASE_URL ausente: este arquivo precisa de banco e não pode passar sem ele',
    );
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();

    localId = randomUUID();
    outroLocalId = randomUUID();
    autorId = randomUUID();
    outroAutorId = randomUUID();

    for (const [id, nome] of [
      [localId, 'Clinica da Isca'],
      [outroLocalId, 'Clinica da Isca Dois'],
    ] as const) {
      await cliente.query(
        // `claim_status: 'unclaimed'` EXPLICITO: o default da coluna e
        // `'claimed'`, e o CHECK `professionals_titularidade_tem_marco` exige
        // `claimed_at` quando ha titular. O local desta isca nao tem dono --
        // e um registro importado, como a maioria do diretorio.
        `INSERT INTO professionals (id, kind, display_name, source, city, state, claim_status)
         VALUES ($1, 'clinic', $2, 'import', 'Cidade da Isca', 'SP', 'unclaimed')`,
        [id, `${PREFIXO}${nome}`],
      );
    }
    for (const [id, local] of [
      [autorId, 'autor'],
      [outroAutorId, 'outro'],
    ] as const) {
      await cliente.query(`INSERT INTO users (id, email, public_ref) VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`, [
        id,
        `${PREFIXO}${local}@exemplo.invalid`,
      ]);
    }
  });

  after(async () => {
    if (cliente === undefined) return;
    // A limpeza é por id criado aqui, e não por `TRUNCATE`: a suíte roda em
    // banco compartilhado entre arquivos.
    await cliente.query('DELETE FROM professional_reviews WHERE professional_id = ANY($1)', [
      [localId, outroLocalId],
    ]);
    await cliente.query('DELETE FROM professionals WHERE id = ANY($1)', [[localId, outroLocalId]]);
    await cliente.query('DELETE FROM users WHERE id = ANY($1)', [[autorId, outroAutorId]]);
    await cliente.end();
  });

  void it('a PRIMEIRA avaliação entra', async () => {
    await inserirAvaliacao({ local: localId, autor: autorId, nota: 5, ref: ref('primeira') });
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM professional_reviews WHERE professional_id = $1',
      [localId],
    );
    assert.equal(rows[0]?.n, '1');
  });

  void it('a SEGUNDA avaliação da mesma pessoa no mesmo local é RECUSADA', async () => {
    await recusadaPor(
      () => inserirAvaliacao({ local: localId, autor: autorId, nota: 1, ref: ref('segunda') }),
      '23505',
      'professional_reviews_uma_por_autor',
    );
    // A assercao que importa de verdade: a recusa não deixou linha para trás.
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM professional_reviews WHERE professional_id = $1',
      [localId],
    );
    assert.equal(rows[0]?.n, '1', 'a segunda avaliação entrou mesmo assim');
  });

  void it('a MESMA pessoa avalia OUTRO local, e isso é permitido', async () => {
    await inserirAvaliacao({
      local: outroLocalId,
      autor: autorId,
      nota: 4,
      ref: ref('outrolocal'),
    });
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM professional_reviews WHERE professional_id = $1',
      [outroLocalId],
    );
    assert.equal(
      rows[0]?.n,
      '1',
      'a unicidade é por (local, autor); barrar a mesma pessoa em locais diferentes seria o defeito oposto',
    );
  });

  void it('OUTRA pessoa avalia o MESMO local, e isso é permitido', async () => {
    await inserirAvaliacao({
      local: localId,
      autor: outroAutorId,
      nota: 3,
      ref: ref('outroautor'),
    });
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM professional_reviews WHERE professional_id = $1',
      [localId],
    );
    assert.equal(rows[0]?.n, '2');
  });

  void it('nota 0 e nota 6 são RECUSADAS pelo banco', async () => {
    for (const fora of [0, 6, -1, 100]) {
      const terceiro = randomUUID();
      await cliente.query(
        `INSERT INTO professionals (id, kind, display_name, source, claim_status)
         VALUES ($1, 'vet', $2, 'import', 'unclaimed')`,
        [terceiro, `${PREFIXO}faixa-${String(fora)}`],
      );
      try {
        await recusadaPor(
          () =>
            inserirAvaliacao({
              local: terceiro,
              autor: autorId,
              nota: fora,
              ref: ref(`faixa${String(fora)}`),
            }),
          '23514',
          'professional_reviews_rating_faixa',
        );
      } finally {
        await cliente.query('DELETE FROM professional_reviews WHERE professional_id = $1', [terceiro]);
        await cliente.query('DELETE FROM professionals WHERE id = $1', [terceiro]);
      }
    }
  });

  void it('as cinco notas da faixa entram', async () => {
    for (const nota of [1, 2, 3, 4, 5]) {
      const local = randomUUID();
      await cliente.query(
        `INSERT INTO professionals (id, kind, display_name, source, claim_status)
         VALUES ($1, 'vet', $2, 'import', 'unclaimed')`,
        [local, `${PREFIXO}nota-${String(nota)}`],
      );
      try {
        await inserirAvaliacao({
          local,
          autor: autorId,
          nota,
          ref: ref(`nota${String(nota)}`),
        });
        const { rows } = await cliente.query<{ r: number }>(
          'SELECT rating AS r FROM professional_reviews WHERE professional_id = $1',
          [local],
        );
        assert.equal(rows[0]?.r, nota, `a nota ${String(nota)} é da faixa e não entrou`);
      } finally {
        await cliente.query('DELETE FROM professional_reviews WHERE professional_id = $1', [local]);
        await cliente.query('DELETE FROM professionals WHERE id = $1', [local]);
      }
    }
  });

  void it('dois `ref` iguais são RECUSADOS', async () => {
    const local = randomUUID();
    await cliente.query(
      `INSERT INTO professionals (id, kind, display_name, source, claim_status)
       VALUES ($1, 'vet', $2, 'import', 'unclaimed')`,
      [local, `${PREFIXO}ref-repetido`],
    );
    try {
      await recusadaPor(
        () => inserirAvaliacao({ local, autor: outroAutorId, nota: 2, ref: ref('primeira') }),
        '23505',
        'professional_reviews_ref_unico',
      );
    } finally {
      await cliente.query('DELETE FROM professional_reviews WHERE professional_id = $1', [local]);
      await cliente.query('DELETE FROM professionals WHERE id = $1', [local]);
    }
  });
});
