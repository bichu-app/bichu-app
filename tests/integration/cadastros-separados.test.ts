/**
 * **O painel e o app sao cadastros separados, e o esquema e quem garante**
 * (ADR-0027 item 20; D42 e P21 (b) de `docs/04-seguranca.md` 22.11).
 *
 * Dois fatos do banco, perguntados ao catalogo e nao lidos das migracoes:
 *
 * 1. **Nenhuma tabela `admin_*`, nem `catalog_upload_intents`, tem chave
 *    estrangeira para `users`.** E o que torna a separacao do esquema e nao de
 *    uma recusa escrita em cada porta. A consulta roda contra o banco real e
 *    contra uma isca (tabela `admin_*` criada com FK para `users` dentro de uma
 *    transacao desfeita), e a isca PRECISA ser acusada. Com zero tabelas
 *    `admin_*` o caso reprova: nao ter o que olhar nao e estar limpo.
 *
 * 2. **A 000006 aborta, nomeando a linha, num banco com papel de painel em
 *    `user_roles`.** O bloco de guarda e extraido do proprio arquivo da
 *    migracao e executado depois de plantar uma linha `admin` (com o `CHECK`
 *    novo retirado so dentro da transacao). A mensagem precisa nomear o
 *    `user_id` e o papel e trazer o remedio; abortar cru nao serve a quem
 *    tem de decidir o que fazer com a linha.
 *
 * Tudo que escreve roda numa transacao que termina em `ROLLBACK`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const MIGRACAO = 'migrations/20260923000006_sessao-administrativa.sql';

let cliente: Client;

/**
 * As chaves estrangeiras que saem de uma tabela do painel e chegam em `users`.
 * `catalog_upload_intents` entra pelo nome: e do painel sem ter o prefixo.
 */
async function chavesDoPainelParaUsers(): Promise<{ tabelasDoPainel: number; violacoes: string[] }> {
  const tabelas = await cliente.query<{ total: string }>(
    `select count(*) as total
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and (c.relname like 'admin\\_%' or c.relname = 'catalog_upload_intents')`,
  );
  const r = await cliente.query<{ chave: string }>(
    `select n.nspname || '.' || rel.relname || '.' || con.conname as chave
       from pg_constraint con
       join pg_class rel    on rel.oid  = con.conrelid
       join pg_namespace n  on n.oid    = rel.relnamespace
       join pg_class alvo   on alvo.oid = con.confrelid
       join pg_namespace na on na.oid   = alvo.relnamespace
      where con.contype = 'f'
        and (rel.relname like 'admin\\_%' or rel.relname = 'catalog_upload_intents')
        and na.nspname = 'public' and alvo.relname = 'users'
      order by 1`,
  );
  return { tabelasDoPainel: Number(tabelas.rows[0]?.total ?? 0), violacoes: r.rows.map((l) => l.chave) };
}

/** O primeiro bloco `DO $$ ... $$;` da SUBIDA da 000006: a guarda de `user_roles`. */
function blocoDeGuarda(): string {
  const texto = readFileSync(resolve(process.cwd(), MIGRACAO), 'utf8');
  const inicio = texto.indexOf('-- Up Migration');
  const fim = texto.indexOf('-- Down Migration');
  assert.ok(inicio !== -1 && fim > inicio, `${MIGRACAO} sem os marcadores de subida e descida`);
  const subida = texto.slice(inicio, fim);
  const bloco = /DO \$\$[\s\S]*?\n\$\$;/.exec(subida)?.[0];
  assert.ok(bloco !== undefined && bloco.includes('user_roles'), `${MIGRACAO} perdeu o bloco que aborta`);
  return bloco;
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo pergunta ao catalogo se o painel e o app ' +
        'sao cadastros separados, e sem banco nao pergunta nada. Rode `npm run test:integration`.',
    );
  }
  cliente = new Client({ connectionString: CONEXAO });
  await cliente.connect();
});

after(async () => {
  if (cliente !== undefined) await cliente.end();
});

void describe('P21 (b): nenhuma tabela do painel aponta para users', () => {
  void it('o banco real nao tem nenhuma, e ha tabelas do painel para conferir', async () => {
    const { tabelasDoPainel, violacoes } = await chavesDoPainelParaUsers();
    assert.ok(
      tabelasDoPainel >= 4,
      `so ${String(tabelasDoPainel)} tabelas admin_* no banco: a consulta nao tem o que conferir`,
    );
    assert.deepEqual(violacoes, [], 'tabela do painel com chave estrangeira para users (D42)');
  });

  void it('isca: uma tabela admin_* com FK para users e acusada pelo nome', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        'create table admin_isca_p21 (id uuid primary key, user_id uuid references users (id))',
      );
      const { violacoes } = await chavesDoPainelParaUsers();
      assert.ok(
        violacoes.some((v) => v.startsWith('public.admin_isca_p21.')),
        `a consulta nao acusou a isca. Achou: ${JSON.stringify(violacoes)}`,
      );
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});

void describe('a 000006 aborta, nomeando a linha, se user_roles tiver papel de painel', () => {
  void it('a guarda levanta 23514 com user_id, papel e o remedio', async () => {
    const bloco = blocoDeGuarda();
    const conta = '0e5a0000-0000-7000-8000-00000000a0a1';
    await cliente.query('BEGIN');
    try {
      await cliente.query('alter table user_roles drop constraint user_roles_role_check');
      await cliente.query(`insert into users (id, email) values ($1, 'guarda-000006@exemplo.invalid')`, [conta]);
      await cliente.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [conta]);
      await cliente.query('SAVEPOINT guarda');

      let erro: { code?: string; message?: string; hint?: string } | undefined;
      try {
        await cliente.query(bloco);
      } catch (e) {
        erro = e as typeof erro;
      }
      assert.ok(erro !== undefined, 'a guarda nao abortou com papel admin em user_roles');
      assert.equal(erro.code, '23514');
      assert.match(erro.message ?? '', new RegExp(`user_id=${conta} papel=admin`));
      assert.match(erro.hint ?? '', /conta-admin criar/);
      assert.match(erro.hint ?? '', /DELETE FROM user_roles/);

      // O caso que precisa passar: so `tutor`, e a guarda nao diz nada.
      await cliente.query('ROLLBACK TO SAVEPOINT guarda');
      await cliente.query(`update user_roles set role = 'tutor' where user_id = $1`, [conta]);
      await cliente.query(bloco);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});
