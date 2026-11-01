import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { casaIfNoneMatch, lerIfMatch } from './if-match.js';

void describe('If-Match vindo pela borda', () => {
  void it('ISCA: "3-gzip", "3-zstd", "3-br" e W/"3" sao a versao 3', () => {
    for (const valor of ['"3"', '"3-gzip"', '"3-zstd"', '"3-br"', 'W/"3"', 'W/"3-gzip"', '  "3-zstd"  ']) {
      assert.deepEqual(lerIfMatch(valor), { tipo: 'numero', versao: 3 }, valor);
    }
    assert.deepEqual(lerIfMatch('"12-gzip"'), { tipo: 'numero', versao: 12 });
  });

  void it('ISCA: o que a borda nao poe continua invalido, e ausente continua 428', () => {
    for (const lixo of ['"3-deflate"', '"3-gzip-gzip"', '"-gzip"', '"3gzip"', '"3"-gzip', 'w/"3"', '*', '"0-gzip"', '"3", "4"']) {
      assert.deepEqual(lerIfMatch(lixo), { tipo: 'invalida' }, lixo);
    }
    assert.deepEqual(lerIfMatch(undefined), { tipo: 'ausente' });
    assert.deepEqual(lerIfMatch('  '), { tipo: 'ausente' });
  });
});

void describe('If-None-Match vindo pela borda (dados de referencia)', () => {
  const ATUAL = '"2026-09-17.2"';
  void it('ISCA: o ETag com sufixo da borda casa (304), e o de outra versao nao', () => {
    for (const enviado of ['"2026-09-17.2"', '"2026-09-17.2-gzip"', '"2026-09-17.2-zstd"', 'W/"2026-09-17.2-gzip"', '"x", "2026-09-17.2-br"', '*']) {
      assert.equal(casaIfNoneMatch(enviado, ATUAL), true, enviado);
    }
    for (const enviado of [undefined, '"2026-09-17.1-gzip"', '"2026-09-17.2-deflate"', '"2026-09-17"', '']) {
      assert.equal(casaIfNoneMatch(enviado, ATUAL), false, String(enviado));
    }
  });
});
