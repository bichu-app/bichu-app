/**
 * Os links do encontro: a conferencia do painel tem de dar a mesma resposta
 * que a do servidor, caso a caso (mesma ideia de observacoes-contra-o-servidor).
 */
import { describe, expect, it } from 'vitest';

import { errosDoLinkDeIngresso, handleDoInstagram as handleDoServidor } from '../../../src/modules/network/domain/escrita-do-encontro.ts';
import { handleDoInstagram, MENSAGEM_DO_LINK, recusaDoLinkDoConvite } from '../../src/rede/dominio/links.ts';

const LINKS = [
  'https://sympla.com.br/evento/encontro-123',
  'https://exemplo.com.br/x?y=1#z',
  '  https://exemplo.com.br/com-espaco-nas-pontas  ',
  'http://exemplo.com.br',
  'HTTPS://exemplo.com.br',
  'https:/exemplo.com.br',
  'javascript:alert(1)',
  'https://usuario:senha@exemplo.com.br',
  'https://@exemplo.com.br',
  'https://192.168.0.1/x',
  'https://[::1]/x',
  'https://3232235521/x',
  'https://0x7f000001/x',
  'https://localhost/x',
  'https://intranet/x',
  'https://site.local/x',
  'https://exemplo.test/x',
  'https://exemplo.com.br/com espaco',
  'nao e link',
  `https://exemplo.com.br/${'a'.repeat(480)}`,
  `https://exemplo.com.br/${'a'.repeat(490)}`,
  'https://exemplo.com.br/\u202Einvertido',
];

const INSTAGRAMS = [
  '@organizacao',
  'organizacao',
  'Organizacao.Pet_',
  'https://www.instagram.com/organizacao/',
  'instagram.com/organizacao?hl=pt',
  'http://m.instagram.com/organizacao',
  '@a',
  '@' + 'a'.repeat(31),
  '@com espaco',
  'https://facebook.com/organizacao',
  '@org!',
];

describe('link do convite: painel e servidor dão a mesma resposta', () => {
  it.each(LINKS)('%s', (link) => {
    const servidor = errosDoLinkDeIngresso('ticket_url', link)[0]?.code ?? null;
    expect(recusaDoLinkDoConvite(link)).toBe(servidor);
  });
});

describe('Instagram: painel e servidor normalizam igual', () => {
  it.each(INSTAGRAMS)('%s', (valor) => {
    expect(handleDoInstagram(valor)).toBe(handleDoServidor(valor));
  });
});

describe('textos das recusas (UX 30.10)', () => {
  it('bidi e link incompleto dizem o que fazer', () => {
    expect(MENSAGEM_DO_LINK.bidi_control).toBe('O link tem caracteres invisíveis. Apague e digite de novo.');
    expect(MENSAGEM_DO_LINK.ticket_url_invalid).toBe('Confira o link: ele não pode ter espaço e precisa estar completo, com https:// e o endereço do site.');
  });
});
