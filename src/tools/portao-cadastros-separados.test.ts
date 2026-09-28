/**
 * P21 (c): o portao dos cadastros separados contra o codigo real e contra as
 * iscas que precisa reprovar (`autoTeste`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  arquivosReais,
  autoTeste,
  conferirCadastrosSeparados,
  literaisDe,
} from './portao-cadastros-separados.js';

void describe('portao dos cadastros separados (P21 c)', () => {
  void it('as iscas reprovam, e o comentario nao e acusado', () => {
    assert.deepEqual(autoTeste(), []);
  });

  void it('o codigo real passa, e ha arquivos nos dois modulos para conferir', () => {
    const { arquivosPorModulo, violacoes } = conferirCadastrosSeparados(arquivosReais(process.cwd()));
    assert.deepEqual(violacoes, []);
    assert.ok((arquivosPorModulo['admin-access'] ?? 0) >= 5, JSON.stringify(arquivosPorModulo));
    assert.ok((arquivosPorModulo['identity'] ?? 0) >= 5, JSON.stringify(arquivosPorModulo));
  });

  void it('literaisDe separa literal de comentario, nos tres tipos de aspas', () => {
    assert.deepEqual(literaisDe("// 'x'\nconst a = 'um'; /* \"y\" */ const b = \"dois\"; const c = `tres ${a}`;"), [
      'um',
      'dois',
      'tres ${a}',
    ]);
  });
});
