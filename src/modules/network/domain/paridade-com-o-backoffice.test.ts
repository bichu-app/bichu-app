import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { achadosNasObservacoes } from '../../../../admin/src/rede/dominio/observacoes.js';
import { handleDoInstagram as handleDoPainel, recusaDoLinkDoConvite } from '../../../../admin/src/rede/dominio/link-do-convite.js';
import { cortarEmCodePoints, tamanhoComoOServidor } from '../../../../admin/src/rede/dominio/texto.js';
import {
  errosDasObservacoes,
  errosDeTexto,
  errosDoLinkDeIngresso,
  handleDoInstagram as handleDoServidor,
} from './escrita-do-encontro.js';

const CASOS = [
  'Encontro em 10/10/2026, das 9h às 11h.',
  'Até 10 filhotes por turma.',
  'Traga água; a praça tem pouca sombra depois das 10h.',
  'Ponto de encontro ao lado do lago.',
  'Encontro na Praça Benedito Calixto, perto do coreto.',
  'Portão 3 do parque.',
  'Chama no (11) 98765-4321',
  'zap 11987654321',
  'liga 11 9 8765 4321',
  'nove nove oito sete seis cinco quatro tres dois',
  'com largura zero 1​1​9​8​7​6​5​4​3',
  'dígitos de largura total １１９８７６５４３２１',
  'escreve para ana@exemplo.com.br',
  'ana arroba exemplo ponto com',
  'inscrição em https://exemplo.com/x',
  'veja www.exemplo.com',
  'site exemplo.com.br',
  'paga no Pix antes',
  'chave 123e4567-e89b-12d3-a456-426614174000',
  'CPF 123.456.789-09',
  'fica na Rua das Flores, 123',
  'Av. Paulista perto do metrô',
  'Praça Benedito Calixto, 100',
  'cep 01234-000',
  'Encontro em 10.10.2026, até 12h.',
  'Remarcado de 03.10.2026 para 10.10.2026.',
  'Proximo encontro em 10.10.2026.',
  'Remarcado de 03/11/2026 para 17/11/2026',
  'Dia 1.2.2027, se chover.',
  'Liga 10.10.2026.99',
  'Chame 11 98765-4321 ate 10/10/2026',
  '32.13.2026 1198765432',
  'de 10.10.2026 a 31/12/2026',
  '13.13.2026 e 10.10.26',
  'Inscricao em bit.ly/encontro',
  'Tudo em linktr.ee/organizacao',
  'veja meusite.com.br',
  'fale no wa.me/5511987654321',
  'site . com',
  'siga @organizacao',
  'Pague no p i x',
  'Pague no p-i-x',
  'Pague no P1X',
  'Pague no Pïx',
  'Aceitamos PicPay',
  'Aceitamos pic pay',
  'Mercado Pago na entrada',
  'Nubank ou PayPal',
  'PagSeguro no local',
  'ag 1234 cc 56789-0',
  'Agência: 0001 Conta: 12345-6',
  'deposite em qualquer.dominio/caminho',
  'Traga agua e saquinho.',
  'Encontro na praca central, perto do coreto.',
  'Caes de todos os portes.',
  'Traga água.Leve petisco e um mix de brinquedos.',
  'Picnic liberado na sombra; evite pisar no canteiro.',
  'A agenda do mês tem 3 encontros e 2 caminhadas.',
];

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
  'https://localhost./',
  'https://x.local./',
  'https://exemplo.com.br./ok',
  'https://intranet./x',
  'https://.../x',
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

const MINIMO_DO_RESUMO = 2;
const LIMITE_DO_RESUMO = 200;

const CODE_POINTS = [
  '🐶'.repeat(200),
  '🐶'.repeat(201),
  'e\u0301'.repeat(100),
  'e\u0301'.repeat(100) + 'x',
  '  ' + '🐶'.repeat(200) + '  ',
];

void describe('observações: painel e servidor dão a mesma resposta', () => {
  void it(`são ${String(CASOS.length)} textos`, () => {
    assert.equal(CASOS.length, 58);
  });

  for (const texto of CASOS) {
    void it(texto, () => {
      const servidor = errosDasObservacoes('notes', texto).length > 0;
      const painel = achadosNasObservacoes(texto).length > 0;
      assert.equal(painel, servidor, `servidor ${servidor ? 'recusa' : 'aceita'}: ${texto}`);
    });
  }
});

void describe('link do convite: painel e servidor dão a mesma resposta', () => {
  void it(`são ${String(LINKS.length)} links`, () => {
    assert.equal(LINKS.length, 27);
  });

  for (const link of LINKS) {
    void it(link, () => {
      const servidor = errosDoLinkDeIngresso('ticket_url', link)[0]?.code ?? null;
      assert.equal(recusaDoLinkDoConvite(link), servidor);
    });
  }
});

void describe('Instagram: painel e servidor normalizam igual', () => {
  void it(`são ${String(INSTAGRAMS.length)} handles`, () => {
    assert.equal(INSTAGRAMS.length, 11);
  });

  for (const valor of INSTAGRAMS) {
    void it(valor, () => {
      assert.equal(handleDoPainel(valor), handleDoServidor(valor));
    });
  }
});

void describe('ISCA: o tamanho conta code points, como o servidor', () => {
  void it('🐶 conta 1; e + acento combinado conta 2', () => {
    assert.equal(tamanhoComoOServidor('🐶'), 1);
    assert.equal(tamanhoComoOServidor('e\u0301'), 2);
    assert.equal(cortarEmCodePoints('🐶'.repeat(201), 200), '🐶'.repeat(200));
  });

  for (const resumo of CODE_POINTS) {
    void it(`${String([...resumo].length)} code points`, () => {
      const servidor = errosDeTexto('summary', resumo, MINIMO_DO_RESUMO, LIMITE_DO_RESUMO).length === 0;
      const n = tamanhoComoOServidor(resumo);
      const painel = n >= MINIMO_DO_RESUMO && n <= LIMITE_DO_RESUMO;
      assert.equal(painel, servidor, `servidor ${servidor ? 'aceita' : 'recusa'}`);
    });
  }
});
