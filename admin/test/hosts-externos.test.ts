/**
 * Hosts de terceiros fora de src/ (portao de portabilidade): o padrao e o que a
 * CSP da borda libera, e sobrescrita que nao for https: limpo reprova o build.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS_PADRAO, hostsExternos } from '../config/hosts-externos.ts';
import { configuracao } from '../src/config.ts';

describe('hosts externos do painel', () => {
  it('o bundle recebe os valores da configuracao, e nao de literal em src/', () => {
    expect(configuracao.urlDosTiles).toBe(HOSTS_PADRAO.VITE_URL_DOS_TILES);
    expect(configuracao.urlDoScriptDoCaptcha).toBe(HOSTS_PADRAO.VITE_URL_DO_SCRIPT_DO_CAPTCHA);
    expect(configuracao.urlDaAtribuicaoDoMapa).toBe(HOSTS_PADRAO.VITE_URL_DA_ATRIBUICAO_DO_MAPA);
  });

  it('aceita sobrescrita https e REPROVA http ou userinfo', () => {
    expect(hostsExternos({ VITE_URL_DOS_TILES: 'https://tiles.exemplo.test/{z}/{x}/{y}.png' }).VITE_URL_DOS_TILES).toBe('https://tiles.exemplo.test/{z}/{x}/{y}.png');
    expect(() => hostsExternos({ VITE_URL_DOS_TILES: 'http://tiles.exemplo.test/{z}/{x}/{y}.png' })).toThrow(/https/);
    expect(() => hostsExternos({ VITE_URL_DO_SCRIPT_DO_CAPTCHA: 'https://u:p@exemplo.test/x.js' })).toThrow(/usuario/);
  });
});
