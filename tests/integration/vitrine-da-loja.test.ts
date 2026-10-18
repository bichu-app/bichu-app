/**
 * A vitrine da `Loja` contra Postgres de verdade: a chave estrangeira aponta
 * para a identidade INTERNA do parceiro, e não para o endereço público dele.
 *
 * ## Por que este arquivo existe
 *
 * O ADR-0024 decidiu separar identidade interna de identidade pública em
 * `store_partners` e `store_items`. Decisão escrita num ADR é decisão escrita:
 * ninguém reexecuta um ADR, e no dia em que alguém apontar uma chave
 * estrangeira de volta para o `slug` nada acusa — o contrato público não muda,
 * a tela não muda, e a suíte unitária aprova com o mecanismo desligado, porque
 * um dobre em memória devolve o que colocarem nele.
 *
 * Quem acusa é o banco, e só ele. Os dois casos abaixo são a mesma pergunta por
 * dois lados:
 *
 * - **trocar o endereço público do parceiro não pode quebrar a referência.**
 *   Este é o caso que pega o defeito original: com a chave estrangeira sobre
 *   `store_partners.slug` e `ON DELETE NO ACTION`, este `UPDATE` era RECUSADO
 *   com `23503`, porque a ação vale também para atualização. É por isso que
 *   chave estrangeira sobre valor que o usuário troca é proibida pelo critério
 *   2 da BICHUS-19.
 * - **apagar um parceiro com item na vitrine continua sendo recusado.** O
 *   `NO ACTION` que a entrada de `chave-estrangeira-contra-restricao.test.ts`
 *   declara precisa valer contra o banco, e não só na declaração. Sem este
 *   caso, trocar a coluna-alvo poderia ter trocado a ação junto sem ninguém
 *   ver.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## Este arquivo REPROVA quando não consegue verificar
 *
 * Sem banco não há caso a pular: há falha ruidosa com o motivo. Arquivo de
 * inspeção que se pula sozinho termina verde e ocupa o lugar de um que
 * funcionaria.
 *
 * ## O que sobrevive à execução
 *
 * Nada. O parceiro e os itens criados são apagados no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `23503` é `foreign_key_violation` no Postgres. */
const VIOLACAO_DE_CHAVE_ESTRANGEIRA = '23503';

let cliente: pg.Client;

/** Só o que este arquivo criou, para o `after` não encostar na massa do seed. */
const parceirosCriados: string[] = [];
const itensCriados: string[] = [];

/** Um sufixo que cabe no CHECK de formato: `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`. */
function sufixo(): string {
  return randomUUID().slice(0, 8);
}

async function criarParceiro(slug: string): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO store_partners (id, slug, name, host, active, sort_order)
     VALUES ($1, $2, $3, $4, true, 0)`,
    [id, slug, `Parceiro ${slug}`, 'exemplo.invalid'],
  );
  parceirosCriados.push(id);
  return id;
}

async function criarItem(partnerId: string, slug: string): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO store_items (
       id, slug, partner_id, title, summary, category, target_path, active, sort_order,
       published_at
     ) VALUES ($1, $2, $3, $4, $5, 'toy', '/item', true, 0, now())`,
    [id, slug, partnerId, `Item ${slug}`, `Resumo de ${slug}`],
  );
  itensCriados.push(id);
  return id;
}

void describe('a vitrine da `Loja`, contra Postgres', () => {
  before(async () => {
    if (CONEXAO === undefined) {
      throw new Error(
        'sem DATABASE_URL nem TEST_DATABASE_URL: este arquivo pergunta ao banco e não tem o ' +
          'que perguntar. Reprovar é o comportamento correto — pular deixaria a decisão do ' +
          'ADR-0024 protegida só por confiança.',
      );
    }
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();

    // Sem as tabelas, todos os casos abaixo passariam por não ter olhado para
    // nada. É a mesma trava de `TABELAS_ESPERADAS` em `esquema.test.ts`.
    const { rows } = await cliente.query<{ tabela: string }>(
      `SELECT table_name AS tabela FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('store_partners', 'store_items')`,
    );
    const achadas = rows.map((r) => r.tabela).sort();
    assert.deepEqual(
      achadas,
      ['store_items', 'store_partners'],
      'a migração da vitrine não está aplicada: não há o que inspecionar, e isso é reprovação',
    );
  });

  after(async () => {
    if (itensCriados.length > 0) {
      await cliente.query('DELETE FROM store_items WHERE id = ANY($1::uuid[])', [itensCriados]);
    }
    if (parceirosCriados.length > 0) {
      await cliente.query('DELETE FROM store_partners WHERE id = ANY($1::uuid[])', [
        parceirosCriados,
      ]);
    }
    await cliente.end();
  });

  void it('as chaves estrangeiras de `store_items` sao exatamente estas tres, com estas colunas', async () => {
    // A CONSULTA MUDOU EM 18/10, E A LISTA ESPERADA MUDOU COM ELA.
    //
    // Ela lia `information_schema.key_column_usage` JUNTO com
    // `constraint_column_usage` por `constraint_name` e mais nada. Para chave
    // de UMA coluna aquilo funciona; para chave COMPOSTA e produto cartesiano:
    // a `store_items_subcategoria_e_da_categoria` -- `(category, subcategory)
    // -> store_subcategories (category_code, code)`, da migracao
    // `20261017000003` -- saia como QUATRO linhas cruzando as duas colunas de
    // origem com as duas de destino, e tres delas nomeavam pares que nao
    // existem (`category -> store_subcategories.code`, por exemplo).
    //
    // Entao a pergunta passou a ser feita ao `pg_constraint`, com
    // `WITH ORDINALITY` nas duas pontas: cada chave aparece UMA vez, com as
    // colunas na ORDEM em que a restricao as declara. Isso e mais estrito que
    // a lista antiga, e nao menos: inverter `(category, subcategory)` para
    // `(subcategory, category)` reprova aqui agora, e antes nao reprovava.
    const { rows } = await cliente.query<{ chave: string }>(
      `SELECT con.conname || ': (' || origem.colunas || ') -> '
              || alvo_ns.nspname || '.' || alvo.relname || ' (' || destino.colunas || ')' AS chave
         FROM pg_constraint con
         JOIN pg_class rel        ON rel.oid = con.conrelid
         JOIN pg_namespace ns     ON ns.oid  = rel.relnamespace
         JOIN pg_class alvo       ON alvo.oid = con.confrelid
         JOIN pg_namespace alvo_ns ON alvo_ns.oid = alvo.relnamespace
         CROSS JOIN LATERAL (
           SELECT string_agg(a.attname, ', ' ORDER BY k.ord) AS colunas
             FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
         ) origem
         CROSS JOIN LATERAL (
           SELECT string_agg(a.attname, ', ' ORDER BY k.ord) AS colunas
             FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
         ) destino
        WHERE con.contype = 'f' AND ns.nspname = 'public' AND rel.relname = 'store_items'`,
    );

    // Lista, e não `length > 0`: uma chave estrangeira NOVA sobre `store_items`
    // que ninguém previu precisa aparecer aqui, e não ser diluída numa
    // contagem. Foi o que aconteceu: as duas da taxonomia de 17/10 entraram e
    // este caso as acusou -- elas estao declaradas em
    // `chave-estrangeira-contra-restricao.test.ts`, com `NO ACTION`, que e a
    // regra do vocabulario curado (categoria retirada fica `active = false`,
    // nunca apagada).
    assert.deepEqual(
      rows.map((r) => r.chave).sort(),
      [
        'store_items_categoria_existe: (category) -> public.store_categories (code)',
        'store_items_partner_id_fkey: (partner_id) -> public.store_partners (id)',
        'store_items_subcategoria_e_da_categoria: (category, subcategory) -> public.store_subcategories (category_code, code)',
      ],
      'a chave estrangeira da vitrine mudou de forma. Apontar de volta para `slug` é o que o ' +
        'ADR-0024 decidiu não fazer, e o critério 2 da BICHUS-19 proíbe.',
    );
  });

  void it('trocar o endereço público do parceiro NÃO quebra a referência do item', async () => {
    const slugAntigo = `isca-p-${sufixo()}`;
    const parceiro = await criarParceiro(slugAntigo);
    const itemSlug = `isca-i-${sufixo()}`;
    await criarItem(parceiro, itemSlug);

    // ESTA É A ISCA. Com a chave estrangeira sobre `store_partners.slug`, este
    // UPDATE era recusado com 23503: `NO ACTION` vale para atualização também.
    const slugNovo = `isca-p2-${sufixo()}`;
    await cliente.query('UPDATE store_partners SET slug = $1 WHERE id = $2', [slugNovo, parceiro]);

    // A referência continua válida, e a junção passa a devolver o endereço
    // NOVO. As duas metades importam: a primeira prova que nada quebrou, e a
    // segunda prova que o `slug` continua sendo o que sai, e não uma cópia
    // congelada em `store_items`.
    const { rows } = await cliente.query<{ partner_slug: string }>(
      `SELECT p.slug AS partner_slug
         FROM store_items i
         JOIN store_partners p ON p.id = i.partner_id
        WHERE i.slug = $1`,
      [itemSlug],
    );
    assert.deepEqual(
      rows.map((r) => r.partner_slug),
      [slugNovo],
      'o item perdeu o parceiro, ou continuou preso ao endereço antigo, depois da troca de slug',
    );
  });

  void it('apagar um parceiro que tem item na vitrine é RECUSADO pelo banco', async () => {
    const parceiro = await criarParceiro(`isca-p3-${sufixo()}`);
    await criarItem(parceiro, `isca-i2-${sufixo()}`);

    await assert.rejects(
      () => cliente.query('DELETE FROM store_partners WHERE id = $1', [parceiro]),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.equal(
          (erro as { code?: string }).code,
          VIOLACAO_DE_CHAVE_ESTRANGEIRA,
          'o banco recusou por outro motivo que não a chave estrangeira',
        );
        return true;
      },
      'o banco APAGOU um parceiro com item apontando para ele. `NO ACTION` deixou de valer, e ' +
        'a vitrine do parceiro sumiria em silêncio.',
    );
  });
});
