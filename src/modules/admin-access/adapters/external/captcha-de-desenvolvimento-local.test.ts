import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  TOKEN_DE_DESENVOLVIMENTO,
  VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO,
  captchaDeDesenvolvimentoLigado,
  captchaDeDesenvolvimentoLocal,
} from './captcha-de-desenvolvimento-local.js';
import { NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO } from '../../ports/verificador-de-captcha.js';

void describe('captcha de desenvolvimento da pilha local', () => {
  void it('liga so com o valor por extenso', () => {
    assert.equal(captchaDeDesenvolvimentoLigado(VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO), true);
    for (const outro of [undefined, '', 'true', '1', 'sim', 'APROVAR-TOKEN-DE-DESENVOLVIMENTO']) {
      assert.equal(captchaDeDesenvolvimentoLigado(outro), false, String(outro));
    }
  });

  void it('aprova so o token de desenvolvimento; qualquer outro continua recusado', async () => {
    const nota = await captchaDeDesenvolvimentoLocal.avaliar(TOKEN_DE_DESENVOLVIMENTO, 'admin_login');
    assert.ok(nota !== undefined && nota >= NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO);
    assert.equal(await captchaDeDesenvolvimentoLocal.avaliar('token-qualquer', 'admin_login'), undefined);
    assert.equal(await captchaDeDesenvolvimentoLocal.avaliar(undefined, 'admin_login'), undefined);
  });

  void it('o token e o mesmo que o painel manda em desenvolvimento', () => {
    const painel = readFileSync('admin/src/entrar/captcha.ts', 'utf8');
    assert.ok(
      painel.includes(`TOKEN_DE_DESENVOLVIMENTO = '${TOKEN_DE_DESENVOLVIMENTO}'`),
      'o token de desenvolvimento do painel mudou, e o servidor nao o reconhece mais',
    );
  });
});
