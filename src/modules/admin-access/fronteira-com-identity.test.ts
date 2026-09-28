/**
 * A fronteira entre `admin-access` e `identity` (ADR-0027 item 20.1).
 *
 * Duas camadas, e cada uma pega o que a outra nao pega:
 *
 * 1. **A regra `fronteira-de-modulo` do ESLint**, rodada de verdade contra
 *    iscas: `admin-access` importando `identity/domain` reprova, e o inverso
 *    tambem. Sem a isca, a regra poderia deixar de valer para o modulo novo (um
 *    nome fora de `MODULES`, um caminho que ela nao resolve) e ninguem veria.
 * 2. **A lista exata do que `admin-access` importa de `identity`**: so
 *    `ports/senha.ts` e `ports/lista-de-senhas-vazadas.ts`. A regra do ESLint
 *    aceita qualquer porta; o ADR restringe a duas, porque qualquer outra porta
 *    de `identity` le `users`, e o painel nao le o cadastro do app (D42).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';

const RAIZ = process.cwd();
const PERMITIDOS_DE_IDENTITY = new Set(['identity/ports/senha.js', 'identity/ports/lista-de-senhas-vazadas.js']);

function arquivosTs(diretorio: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosTs(caminho));
    else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) achados.push(caminho);
  }
  return achados;
}

/** Os especificadores de `import`/`export ... from` de um arquivo. */
function importacoes(texto: string): string[] {
  return [...texto.matchAll(/(?:import|export)\s[^;]*?from\s+'([^']+)'/g)].map((m) => m[1] as string);
}

/** O alvo de um import relativo, como `<modulo>/<resto>` a partir de `src/modules`. */
function alvoNoModulo(arquivo: string, especificador: string): string | undefined {
  if (!especificador.startsWith('.')) return undefined;
  const absoluto = resolve(arquivo, '..', especificador);
  const rel = relative(join(RAIZ, 'src', 'modules'), absoluto);
  if (rel.startsWith('..')) return undefined;
  return rel.split(sep).join('/');
}

/**
 * O ESLint de verdade, com a configuracao do repositorio, num processo filho.
 *
 * Filho, e nao `new ESLint()` aqui dentro: carregado neste processo, o ESLint
 * leva `eslint.config.mjs` e `architecture.rules.mjs` para o relatorio de
 * cobertura da suite, que so aceita fonte TypeScript. `NODE_V8_COVERAGE` vai
 * vazio para o filho pelo mesmo motivo. So a regra de fronteira roda: as que
 * precisam do programa TypeScript inteiro nao rodam sobre arquivo que nao
 * existe no disco.
 */
const SCRIPT_DO_LINT = `
import { ESLint } from 'eslint';
const { filePath, texto } = JSON.parse(process.argv[1]);
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: { languageOptions: { parserOptions: { projectService: false, project: null } } },
  ruleFilter: ({ ruleId }) => ruleId.endsWith('/fronteira-de-modulo'),
});
const [r] = await eslint.lintText(texto, { filePath });
process.stdout.write(JSON.stringify((r?.messages ?? []).map((m) => (m.ruleId ?? 'sem-regra') + ': ' + m.message)));
`;

function lint(filePath: string, texto: string): Promise<string[]> {
  // Vazio, e nao apagado: o Node repoe `NODE_V8_COVERAGE` no filho quando a
  // chave falta no `env` passado (e assim que a cobertura atravessa processos),
  // e so respeita a escolha de quem a declara.
  const ambiente = { ...process.env, NODE_V8_COVERAGE: '' };
  const filho = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', SCRIPT_DO_LINT, JSON.stringify({ filePath, texto })],
    { cwd: RAIZ, env: ambiente, encoding: 'utf8' },
  );
  assert.equal(filho.status, 0, `o ESLint nao rodou: ${filho.stderr}`);
  return Promise.resolve(JSON.parse(filho.stdout) as string[]);
}

void describe('fronteira-de-modulo entre admin-access e identity (ESLint)', () => {
  void it('isca: admin-access importando identity/domain reprova', async () => {
    const mensagens = await lint(
      'src/modules/admin-access/application/isca-de-fronteira.ts',
      "import { verificarSenha } from '../../identity/domain/password.js';\nexport const x = verificarSenha;\n",
    );
    assert.ok(
      mensagens.some((m) => m.includes('fronteira-de-modulo') && m.includes("'identity/domain'")),
      `a regra nao acusou: ${JSON.stringify(mensagens)}`,
    );
  });

  void it('isca: identity importando admin-access reprova', async () => {
    const mensagens = await lint(
      'src/modules/identity/application/isca-de-fronteira.ts',
      "import { abreSessaoAdministrativa } from '../../admin-access/domain/sessao-administrativa.js';\n" +
        'export const x = abreSessaoAdministrativa;\n',
    );
    assert.ok(mensagens.some((m) => m.includes('fronteira-de-modulo')), `a regra nao acusou: ${JSON.stringify(mensagens)}`);
  });

  void it('o caminho certo passa: admin-access importando identity/ports/senha', async () => {
    const mensagens = await lint(
      'src/modules/admin-access/application/isca-de-fronteira.ts',
      "import { verificarSenha } from '../../identity/ports/senha.js';\nexport const x = verificarSenha;\n",
    );
    assert.deepEqual(mensagens, []);
  });
});

void describe('o que admin-access importa de identity, e o que identity importa de admin-access', () => {
  const doPainel = arquivosTs(join(RAIZ, 'src', 'modules', 'admin-access'));
  const daIdentidade = arquivosTs(join(RAIZ, 'src', 'modules', 'identity'));

  void it('ha arquivos nos dois modulos para conferir', () => {
    assert.ok(doPainel.length >= 5, `so ${String(doPainel.length)} arquivos em admin-access`);
    assert.ok(daIdentidade.length >= 5, `so ${String(daIdentidade.length)} arquivos em identity`);
  });

  void it('admin-access so importa de identity as portas de senha e de senhas vazadas', () => {
    const fora: string[] = [];
    let conferidos = 0;
    for (const arquivo of doPainel) {
      for (const especificador of importacoes(readFileSync(arquivo, 'utf8'))) {
        const alvo = alvoNoModulo(arquivo, especificador);
        if (alvo === undefined || !alvo.startsWith('identity/')) continue;
        conferidos += 1;
        if (!PERMITIDOS_DE_IDENTITY.has(alvo)) fora.push(`${relative(RAIZ, arquivo)} -> ${alvo}`);
      }
    }
    assert.deepEqual(fora, []);
    // Sem nenhum import de identity o hash nao seria o do app: a porta de senha
    // TEM de estar em uso, e contar zero aqui e defeito, nao limpeza.
    assert.ok(conferidos > 0, 'admin-access nao importa a porta de senha de identity');
  });

  void it('identity nao importa nada de admin-access', () => {
    const fora = daIdentidade.flatMap((arquivo) =>
      importacoes(readFileSync(arquivo, 'utf8'))
        .map((especificador) => alvoNoModulo(arquivo, especificador))
        .filter((alvo): alvo is string => alvo !== undefined && alvo.startsWith('admin-access/'))
        .map((alvo) => `${relative(RAIZ, arquivo)} -> ${alvo}`),
    );
    assert.deepEqual(fora, []);
  });
});
