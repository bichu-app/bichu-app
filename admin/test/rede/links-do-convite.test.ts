/**
 * Os textos e a isca do link do convite, do lado do PAINEL -- sem olhar para o
 * servidor.
 *
 * A prova de que painel e servidor dao a mesma resposta caso a caso (27 links,
 * 11 handles de Instagram) saiu daqui em 23/10/2026 e mora na suite da RAIZ,
 * em `src/modules/network/domain/paridade-com-o-backoffice.test.ts`, que tem o
 * `kysely` que o `admin/` nunca vai ter instalado. O que ficou neste arquivo
 * sao os dois casos que nunca precisaram do servidor: a mensagem que a tela
 * mostra, e a isca do ponto final no host.
 */
import { describe, expect, it } from 'vitest';

import { MENSAGEM_DO_LINK, recusaDoLinkDoConvite } from '../../src/rede/dominio/links.ts';

describe('textos das recusas (UX 30.10)', () => {
  it('bidi e link incompleto dizem o que fazer', () => {
    expect(MENSAGEM_DO_LINK.bidi_control).toBe('O link tem caracteres invisíveis. Apague e digite de novo.');
    expect(MENSAGEM_DO_LINK.ticket_url_invalid).toBe('Confira o link: ele não pode ter espaço e precisa estar completo, com https:// e o endereço do site.');
  });
});

describe('ISCA: ponto final no host nao escapa das regras (QA r5)', () => {
  it('localhost. e x.local. sao host local; com ponto final, site publico continua valendo', () => {
    expect(recusaDoLinkDoConvite('https://localhost./')).toBe('ticket_url_local_host');
    expect(recusaDoLinkDoConvite('https://x.local./')).toBe('ticket_url_local_host');
    expect(recusaDoLinkDoConvite('https://exemplo.com.br./ok')).toBeNull();
  });
});
