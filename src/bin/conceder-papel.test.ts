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

import { SAIDA } from '../modules/identity/domain/concessao-de-papel.js';
import { descreverErro } from './conceder-papel.js';

const COMANDO = fileURLToPath(new URL('./conceder-papel.js', import.meta.url));
const SENTINELA = 'SENTINELA-processo-5a2c';

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

void describe('conceder-papel como processo, sem terminal e sem banco', () => {
  void it('isca: senha por argumento sai 2 e a saida nao contem a senha', () => {
    for (const argumentos of [
      ['--email', 'operacao@exemplo.com.br', '--senha', SENTINELA],
      ['--email', 'operacao@exemplo.com.br', `--password=${SENTINELA}`],
    ]) {
      const { codigo, saida } = rodar(argumentos);
      assert.equal(codigo, SAIDA.USO, saida);
      assert.match(saida, /senha nao e aceita por argumento/);
      assert.ok(!saida.includes(SENTINELA), 'a saida capturada contem a senha');
    }
  });

  void it('isca: sem terminal (stdin redirecionado) sai 2 antes de perguntar, e nao le a senha do pipe', () => {
    const { codigo, saida } = rodar(
      ['--email', 'operacao@exemplo.com.br', '--criar-conta', '--operador', 'teste'],
      `sim\n${SENTINELA}\n${SENTINELA}\n`,
    );
    assert.equal(codigo, SAIDA.USO, saida);
    assert.match(saida, /sem terminal/);
    assert.doesNotMatch(saida, /Senha da conta/);
    assert.ok(!saida.includes(SENTINELA));
  });

  void it('isca: papel fora da lista sai 2 sem banco', () => {
    const { codigo, saida } = rodar(['--email', 'operacao@exemplo.com.br', '--papel', 'superuser']);
    assert.equal(codigo, SAIDA.USO, saida);
    assert.match(saida, /papel fora da lista/);
  });

  void it('revogar tutor sai 2 sem banco', () => {
    const { codigo, saida } = rodar(['--email', 'operacao@exemplo.com.br', '--revogar', '--papel', 'tutor']);
    assert.equal(codigo, SAIDA.USO, saida);
    assert.match(saida, /tutor nao se revoga/);
  });

  void it('--ajuda sai 0 e cita a D51', () => {
    const { codigo, saida } = rodar(['--ajuda']);
    assert.equal(codigo, SAIDA.OK, saida);
    assert.match(saida, /D51/);
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
