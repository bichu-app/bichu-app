/**
 * QA bug 6 (28/09): o 401 do login do painel dizia "Se esqueceu a senha, da
 * para criar uma nova", o texto do app. A conta do painel nao tem recuperacao
 * por e-mail (ADR-0027 item 20.4): o convite mandava a pessoa atras de um
 * fluxo que nao existe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { problemas } from './errors.js';

void describe('o 401 do login do painel', () => {
  void it('nao fala em recuperar, criar ou redefinir senha, e e o mesmo tipo do app', () => {
    const doPainel = problemas.credencialDoPainelRecusada();
    const doApp = problemas.credencialRecusada();
    assert.equal(doPainel.problemType, doApp.problemType);
    assert.equal(doPainel.status, 401);
    assert.equal(doPainel.title, doApp.title);
    assert.doesNotMatch(doPainel.detail ?? '', /esquec|nova|recuper|redefin|criar/i);
  });

  void it('ISCA: o servico do painel so usa a variante do painel', () => {
    const servico = readFileSync('src/modules/admin-access/application/sessao-administrativa-service.ts', 'utf8');
    assert.doesNotMatch(servico, /problemas\.credencialRecusada\(/, 'o painel voltou a usar o 401 do app');
    assert.match(servico, /problemas\.credencialDoPainelRecusada\(/);
  });
});
