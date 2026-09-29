/**
 * O comando de verdade, como processo, sem terminal e SEM banco.
 *
 * As recusas daqui acontecem antes de qualquer conexao, e o teste prova isso
 * pelo caminho mais curto: o processo roda sem `DATABASE_URL`. Se alguma
 * recusa passasse a depender do banco, ela sairia 1 (configuracao ausente) e
 * nao 2, e o caso reprovaria.
 *
 * Toda saida capturada (stdout e stderr) e conferida contra a sentinela.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SAIDA } from '../modules/admin-access/domain/comando-conta-admin.js';
import { descreverErro } from './conta-admin.js';

const COMANDO = fileURLToPath(new URL('./conta-admin.js', import.meta.url));
const SENTINELA = 'SENTINELA-processo-3b8e';

function rodar(argumentos: string[], entrada = '') {
  const ambiente: NodeJS.ProcessEnv = { ...process.env };
  delete ambiente['DATABASE_URL'];
  delete ambiente['BICHU_SUPRESS_AUTOSTART'];
  const resultado = spawnSync(process.execPath, [COMANDO, ...argumentos], {
    input: entrada,
    env: ambiente,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { codigo: resultado.status, saida: `${resultado.stdout}${resultado.stderr}` };
}

void describe('conta-admin como processo, sem terminal e sem banco', () => {
  void it('isca: senha por argumento sai 2 e a saida nao contem a senha', () => {
    for (const argumentos of [
      ['criar', '--email', 'operacao@exemplo.com.br', '--nome', 'Operacao', '--senha', SENTINELA],
      ['redefinir-senha', '--email', 'operacao@exemplo.com.br', `--password=${SENTINELA}`],
    ]) {
      const { codigo, saida } = rodar(argumentos);
      assert.equal(codigo, SAIDA.USO, saida);
      assert.match(saida, /senha nao e aceita por argumento/);
      assert.ok(!saida.includes(SENTINELA), 'a saida capturada contem a senha');
    }
  });

  void it('isca: sem terminal (stdin redirecionado) sai 2 antes de perguntar, e nao le a senha do pipe', () => {
    for (const sub of ['criar', 'redefinir-senha', 'reativar']) {
      const argumentos = [sub, '--email', 'operacao@exemplo.com.br', '--operador', 'teste'];
      if (sub === 'criar') argumentos.push('--nome', 'Operacao');
      const { codigo, saida } = rodar(argumentos, `sim\n${SENTINELA}\n${SENTINELA}\n`);
      assert.equal(codigo, SAIDA.USO, saida);
      assert.match(saida, /sem terminal/);
      assert.doesNotMatch(saida, /Senha da conta/);
      assert.ok(!saida.includes(SENTINELA));
    }
  });

  void it('subcomando desconhecido sai 2 sem banco, e o conceder-papel antigo nao existe mais', () => {
    const { codigo, saida } = rodar(['conceder', '--email', 'operacao@exemplo.com.br']);
    assert.equal(codigo, SAIDA.USO, saida);
    assert.match(saida, /subcomando desconhecido/);
  });

  void it('--ajuda sai 0 e lista os seis subcomandos', () => {
    const { codigo, saida } = rodar(['--ajuda']);
    assert.equal(codigo, SAIDA.OK, saida);
    for (const sub of ['criar', 'redefinir-senha', 'desativar', 'reativar', 'encerrar-sessoes', 'listar']) {
      assert.match(saida, new RegExp(`conta-admin\\.js ${sub}`));
    }
  });
});

void describe('descreverErro', () => {
  void it('nunca carrega o detail do Postgres (que traz a linha que falhou)', () => {
    const erro = Object.assign(new Error('new row violates check constraint'), {
      code: '23514',
      detail: `Failing row contains ($pbkdf2-sha512$i=1$${SENTINELA})`,
    });
    const texto = descreverErro(erro);
    assert.match(texto, /23514/);
    assert.ok(!texto.includes(SENTINELA));
  });
});
