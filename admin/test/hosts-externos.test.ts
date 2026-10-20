/**
 * Hosts de terceiros fora de src/ (portao de portabilidade): o padrao e o que a
 * CSP da borda libera, e sobrescrita que nao for https: limpo reprova o build.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS_PADRAO, hostsExternos } from '../config/hosts-externos.ts';
import { configuracao } from '../src/config.ts';

describe('hosts externos do painel', () => {
  it('o bundle recebe os valores da configuracao, e nao de literal em src/', () => {
    expect(configuracao.urlDoScriptDoCaptcha).toBe(HOSTS_PADRAO.VITE_URL_DO_SCRIPT_DO_CAPTCHA);
  });

  it('aceita sobrescrita https e REPROVA http ou userinfo', () => {
    expect(hostsExternos({ VITE_URL_DO_SCRIPT_DO_CAPTCHA: 'https://captcha.exemplo.test/x.js' }).VITE_URL_DO_SCRIPT_DO_CAPTCHA).toBe('https://captcha.exemplo.test/x.js');
    expect(() => hostsExternos({ VITE_URL_DO_SCRIPT_DO_CAPTCHA: 'http://captcha.exemplo.test/x.js' })).toThrow(/https/);
  });

  it('o mapa saiu do backoffice (decisao de 01/10): nenhum host de tiles na configuracao', () => {
    // Lista FECHADA, e nao so "nao tem tiles": host novo aqui pede olhar a
    // CSP da borda. O do Instagram entrou em 17/10 (exemplo do campo de
    // Instagram do encontro, `EXEMPLO_DO_INSTAGRAM`), e nao tem relacao com o
    // mapa que saiu em 01/10.
    expect(Object.keys(HOSTS_PADRAO)).toEqual(['VITE_URL_DO_SCRIPT_DO_CAPTCHA', 'VITE_URL_DO_PERFIL_DO_INSTAGRAM']);
    expect(JSON.stringify(HOSTS_PADRAO)).not.toMatch(/openstreetmap/);
    expect(() => hostsExternos({ VITE_URL_DO_SCRIPT_DO_CAPTCHA: 'https://u:p@exemplo.test/x.js' })).toThrow(/usuario/);
  });
});
