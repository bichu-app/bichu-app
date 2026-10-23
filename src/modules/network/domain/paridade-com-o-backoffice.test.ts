/**
 * O PAINEL E O SERVIDOR DAO A MESMA RESPOSTA, CASO A CASO.
 *
 * O backoffice (`admin/`) recusa antes do envio o que o servidor vai recusar:
 * observacoes com contato ou pagamento (D59), link de ingresso e handle do
 * Instagram, e a contagem de texto em code points. Recusar no painel o que o
 * servidor aceita trava a pessoa sem motivo (a data "10.10.2026" ja foi esse
 * caso); aceitar o que ele recusa so adia o erro. Este arquivo roda os dois
 * lados lado a lado e reprova quando eles se afastarem.
 *
 * =========================================================================
 * POR QUE ESTA PROVA MORA AQUI, NA SUITE DA RAIZ, E NAO NA DO PAINEL
 * =========================================================================
 *
 * Ela morava em `admin/test/rede/observacoes-contra-o-servidor.test.ts`,
 * `admin/test/rede/links-contra-o-servidor.test.ts` e num caso de
 * `admin/test/rede/dominio.test.ts`. De la, os tres importavam
 * `src/modules/network/domain/escrita-do-encontro.ts`, que alcanca
 * `src/shared/db/schema.ts`, que importa `kysely`.
 *
 * O job `backoffice (app, imagem e borda)` roda `npm ci` SO em `admin/`. O
 * `kysely` nao existe em nenhum ponto da resolucao de la, e o `tsc -b` do
 * script `build` do painel -- que constroi `admin/tsconfig.test.json`, cujo
 * `include` tem `test` -- reprovava com
 *
 *   ../src/shared/db/schema.ts(13,56): error TS2307: Cannot find module 'kysely'
 *
 * Isso deixou a `development` vermelha de 20/10 a 23/10/2026 e travou todo PR.
 * Nenhum arranjo dentro de `admin/` resolve: o painel nunca vai ter `kysely`
 * instalado, entao ou a prova deixa de ser conferida por tipo, ou ela vem para
 * o lado que TEM as dependencias do servidor. Veio para ca.
 *
 * O contrato (`api/openapi.yaml`) nao serve de arbitro aqui, e foi medido:
 * `notes` e `type: string, maxLength: 500` e nada mais -- o detector de D59 nao
 * esta no contrato, nem poderia estar, porque ele e uma DECISAO sobre o texto e
 * nao uma forma de dado. Um teste contra o contrato conferiria o formato e
 * perderia exatamente as 97 respostas que este arquivo compara.
 *
 * A direcao tambem fica certa: a autoridade da regra e do servidor, e o painel
 * e o espelho. Quando o servidor mudar e o espelho ficar velho, quem fica
 * vermelho e o job do SERVIDOR, que e quem mexeu -- e nao o job do backoffice,
 * que e o que acontecia antes.
 *
 * Os tres modulos do painel importados aqui (`observacoes.ts`,
 * `link-do-convite.ts` e `texto.ts`) nao tem NENHUM especificador de modulo, de
 * proposito: eles atravessam a fronteira para `nodenext` sem arrastar a
 * resolucao `bundler` nem a extensao `.ts` do painel. Medido: importar
 * `links.ts` (que reexporta `../../endereco/enderecos.ts`) reprova com TS5097 e
 * arrasta `src/config.ts`, que usa `import.meta.env`, do Vite. Quem mexer nos
 * tres e precisar de ajuda de outro modulo poe a dependencia no chamador, nao
 * neles. `admin/` continua sendo subprojeto fechado (ADR-0027) para a
 * VARREDURA da suite -- `NAO_VARRER` em `infra/suite/executar-unitaria.mjs` --
 * e o que atravessa aqui e uma referencia deliberada de teste, nao codigo de
 * producao: `tsconfig.build.json` exclui `**\/*.test.ts`.
 */
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
  // datas, horarios e numeros curtos: complemento comum
  'Encontro em 10/10/2026, das 9h às 11h.',
  'Até 10 filhotes por turma.',
  'Traga água; a praça tem pouca sombra depois das 10h.',
  'Ponto de encontro ao lado do lago.',
  'Encontro na Praça Benedito Calixto, perto do coreto.',
  'Portão 3 do parque.',
  // contato e pagamento
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
  // o caso do QA: data com pontos
  'Encontro em 10.10.2026, até 12h.',
  'Remarcado de 03.10.2026 para 10.10.2026.',
  // d54fb59: datas passam, telefone parecido com data continua recusado
  'Proximo encontro em 10.10.2026.',
  'Remarcado de 03/11/2026 para 17/11/2026',
  'Dia 1.2.2027, se chover.',
  'Liga 10.10.2026.99',
  'Chame 11 98765-4321 ate 10/10/2026',
  '32.13.2026 1198765432',
  'de 10.10.2026 a 31/12/2026',
  '13.13.2026 e 10.10.26',
  // af9594b: encurtador, dominio, @perfil, PIX quebrado e dados bancarios
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
  // af9594b: complemento que continua passando
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

/**
 * O teto e o piso com que o painel chama o servidor para o campo `summary`
 * (`validar` em `admin/src/rede/dominio/formulario.ts`: de 2 a 200 code
 * points, pedido de 01/10).
 */
const MINIMO_DO_RESUMO = 2;
const LIMITE_DO_RESUMO = 200;

/** Os casos de code point do antigo `dominio.test.ts` do painel. */
const CODE_POINTS = [
  '🐶'.repeat(200),
  '🐶'.repeat(201),
  'e\u0301'.repeat(100),
  'e\u0301'.repeat(100) + 'x',
  '  ' + '🐶'.repeat(200) + '  ',
];

void describe('observações: painel e servidor dão a mesma resposta', () => {
  // A contagem vai junto do veredito: `it.each` sumindo deixaria o arquivo
  // verde com menos casos, e e por isso que o numero esta escrito aqui.
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
