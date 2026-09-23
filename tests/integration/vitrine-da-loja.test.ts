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
       id, slug, partner_id, title, summary, category, target_url, active, sort_order
     ) VALUES ($1, $2, $3, $4, $5, 'toy', 'https://exemplo.invalid/item', true, 0)`,
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

  void it('a coluna de origem da chave estrangeira é `partner_id`, e o alvo é `store_partners.id`', async () => {
    const { rows } = await cliente.query<{ coluna: string; alvo: string; coluna_alvo: string }>(
      `SELECT kcu.column_name AS coluna,
              ccu.table_name  AS alvo,
              ccu.column_name AS coluna_alvo
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = 'store_items'`,
    );

    // Lista, e não `length > 0`: uma chave estrangeira NOVA sobre `store_items`
    // que ninguém previu precisa aparecer aqui, e não ser diluída numa
    // contagem.
    assert.deepEqual(
      rows.map((r) => `${r.coluna} -> ${r.alvo}.${r.coluna_alvo}`),
      ['partner_id -> store_partners.id'],
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
