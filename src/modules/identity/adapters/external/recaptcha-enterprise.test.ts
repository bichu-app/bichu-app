/**
 * O adaptador do reCAPTCHA Enterprise, sem rede: o `fetch` e um dublê. O que
 * se prova e que ele so devolve nota quando o token e valido, da acao certa, e
 * que toda outra saida e "nao deu para avaliar" (que o servico recusa).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captchaNaoConfigurado } from '../../ports/verificador-de-captcha.js';
import { criarVerificadorDeCaptcha, type Buscar } from './recaptcha-enterprise.js';

const CONFIG = { transporte: 'recaptcha_enterprise', siteKey: 'chave-publica', projeto: 'projeto-x' };

function buscarQueResponde(avaliacao: unknown, status = 200): { buscar: Buscar; corpos: unknown[] } {
  const corpos: unknown[] = [];
  const buscar = ((url: string, init?: { body?: string }) => {
    if (url.includes('metadata')) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: 't', expires_in: 3600 })));
    }
    corpos.push(init?.body === undefined ? undefined : JSON.parse(init.body));
    return Promise.resolve(new Response(JSON.stringify(avaliacao), { status }));
  }) as unknown as Buscar;
  return { buscar, corpos };
}

void describe('reCAPTCHA Enterprise do login administrativo (D41)', () => {
  void it('sem configuracao, o verificador recusa sempre', () => {
    assert.equal(criarVerificadorDeCaptcha({ ...CONFIG, transporte: undefined }), captchaNaoConfigurado);
    assert.equal(criarVerificadorDeCaptcha({ ...CONFIG, siteKey: undefined }), captchaNaoConfigurado);
  });

  void it('token valido da acao certa devolve a nota, e a avaliacao pede a acao esperada', async () => {
    const { buscar, corpos } = buscarQueResponde({
      tokenProperties: { valid: true, action: 'admin_login' },
      riskAnalysis: { score: 0.9 },
    });
    assert.equal(await criarVerificadorDeCaptcha(CONFIG, buscar).avaliar('tok', 'admin_login'), 0.9);
    assert.deepEqual(corpos, [{ event: { token: 'tok', siteKey: 'chave-publica', expectedAction: 'admin_login' } }]);
  });

  void it('token invalido, de outra acao, resposta de erro ou token ausente: nao ha nota', async () => {
    const casos: [unknown, number][] = [
      [{ tokenProperties: { valid: false, action: 'admin_login' }, riskAnalysis: { score: 0.9 } }, 200],
      [{ tokenProperties: { valid: true, action: 'login' }, riskAnalysis: { score: 0.9 } }, 200],
      [{}, 500],
    ];
    for (const [avaliacao, status] of casos) {
      const { buscar } = buscarQueResponde(avaliacao, status);
      assert.equal(await criarVerificadorDeCaptcha(CONFIG, buscar).avaliar('tok', 'admin_login'), undefined);
    }
    const { buscar } = buscarQueResponde({});
    assert.equal(await criarVerificadorDeCaptcha(CONFIG, buscar).avaliar(undefined, 'admin_login'), undefined);
  });
});
