/**
 * Iscas do portão da suíte limpa.
 *
 * As duas primeiras são as que valem: elas rodam contra o `package.json` e o
 * `dist/_tests` **de verdade** deste repositório, não contra uma amostra. Tirar
 * a etapa de limpeza do script reprova a primeira na rodada seguinte.
 *
 * As demais exercitam o reconhecedor com as formas erradas que alguém escreveria
 * de boa fé — limpeza depois do tsc, `rm` sem `-r`, alvo trocado —, porque um
 * reconhecedor que aprova qualquer coisa parecida com limpeza é o mesmo que não
 * ter portão.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  conferirLimpezaDosScripts,
  lerScriptsDoPacote,
  procurarCompiladosOrfaos,
  DIRETORIO_DE_TESTES_COMPILADOS,
} from './portao-de-suite-limpa.js';

const RAIZ = process.cwd();

void test('o package.json deste repositório apaga dist/_tests antes de compilar', () => {
  const queixas = conferirLimpezaDosScripts(lerScriptsDoPacote(RAIZ));
  assert.deepEqual(
    queixas,
    [],
    'Algum script que compila para dist/_tests deixou de apagá-lo antes:\n' +
      queixas.map((q) => `  ${q.script}: ${q.motivo}`).join('\n'),
  );
});

void test('dist/_tests não tem nenhum .js sem .ts de origem', () => {
  const orfaos = procurarCompiladosOrfaos(RAIZ);
  assert.deepEqual(
    orfaos,
    [],
    'Há compilado sem fonte em dist/_tests. Ele está sendo EXECUTADO pela suíte e ' +
      'ninguém consegue ler o que ele testa:\n' +
      orfaos.map((o) => `  ${o.compilado} (fonte ausente: ${o.fonteEsperado})`).join('\n'),
  );
});

void test('script que compila sem apagar reprova, e a queixa nomeia o script', () => {
  const queixas = conferirLimpezaDosScripts([
    {
      nome: 'test',
      comando: `tsc -p tsconfig.json --outDir ${DIRETORIO_DE_TESTES_COMPILADOS} && node --test "x"`,
    },
  ]);
  assert.equal(queixas.length, 1);
  assert.equal(queixas[0]?.script, 'test');
  assert.match(queixas[0]?.motivo ?? '', /não apaga o diretório antes/);
});

void test('apagar DEPOIS de compilar reprova: a ordem é metade do mecanismo', () => {
  const queixas = conferirLimpezaDosScripts([
    {
      nome: 'test',
      comando: `tsc -p tsconfig.json --outDir ${DIRETORIO_DE_TESTES_COMPILADOS} && rm -rf ${DIRETORIO_DE_TESTES_COMPILADOS}`,
    },
  ]);
  assert.equal(queixas.length, 1);
  assert.match(queixas[0]?.motivo ?? '', /DEPOIS de/);
});

void test('`rm -f` sem `-r` não conta como limpeza: em diretório ele falha', () => {
  const queixas = conferirLimpezaDosScripts([
    {
      nome: 'test',
      comando: `rm -f ${DIRETORIO_DE_TESTES_COMPILADOS} && tsc -p tsconfig.json --outDir ${DIRETORIO_DE_TESTES_COMPILADOS}`,
    },
  ]);
  assert.equal(queixas.length, 1);
});

void test('apagar OUTRO diretório não conta como limpeza deste', () => {
  const queixas = conferirLimpezaDosScripts([
    {
      nome: 'test',
      comando: `rm -rf dist/outra-coisa && tsc -p tsconfig.json --outDir ${DIRETORIO_DE_TESTES_COMPILADOS}`,
    },
  ]);
  assert.equal(queixas.length, 1);
});

void test('`tsc --build --clean` também resolve, e é aceito', () => {
  const queixas = conferirLimpezaDosScripts([
    {
      nome: 'test',
      comando: `tsc --build --clean && tsc -p tsconfig.json --outDir ${DIRETORIO_DE_TESTES_COMPILADOS}`,
    },
  ]);
  assert.deepEqual(queixas, []);
});

void test('sem nenhum script que compile para dist/_tests, o portão REPROVA em vez de aprovar', () => {
  // Verificação que não consegue verificar precisa reprovar. Se o diretório de
  // saída mudar de nome, o silêncio deste portão seria confiança falsa.
  const queixas = conferirLimpezaDosScripts([{ nome: 'lint', comando: 'eslint .' }]);
  assert.equal(queixas.length, 1);
  assert.match(queixas[0]?.motivo ?? '', /ficou cego/);
});

void test('a varredura de órfãos acusa o .js sem .ts, e nomeia os dois caminhos', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'bichu-suite-limpa-'));
  try {
    mkdirSync(join(raiz, DIRETORIO_DE_TESTES_COMPILADOS, 'src', 'modulo'), { recursive: true });
    mkdirSync(join(raiz, 'src', 'modulo'), { recursive: true });

    writeFileSync(join(raiz, 'src', 'modulo', 'vivo.ts'), 'export {};\n');
    writeFileSync(join(raiz, DIRETORIO_DE_TESTES_COMPILADOS, 'src', 'modulo', 'vivo.js'), '');
    writeFileSync(join(raiz, DIRETORIO_DE_TESTES_COMPILADOS, 'src', 'modulo', 'morto.test.js'), '');

    const orfaos = procurarCompiladosOrfaos(raiz);
    assert.equal(orfaos.length, 1);
    assert.equal(orfaos[0]?.compilado, join(DIRETORIO_DE_TESTES_COMPILADOS, 'src/modulo/morto.test.js'));
    assert.equal(orfaos[0]?.fonteEsperado, join('src', 'modulo', 'morto.test.ts'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

void test('sem dist/_tests no disco, a varredura não inventa órfão nem estoura', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'bichu-suite-limpa-vazia-'));
  try {
    assert.deepEqual(procurarCompiladosOrfaos(raiz), []);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
