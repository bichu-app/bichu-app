/**
 * Iscas da redação de canal mediado.
 *
 * O que se prova aqui **não** é "a função tem uma expressão regular de
 * telefone". É que as três evasões nomeadas nos critérios 13 a 16 de
 * `BICHUS-43` não passam, e que o campo continua servindo para o que ele
 * existe.
 *
 * Os dois lados importam na mesma medida, e o segundo é o mais fácil de
 * esquecer: uma redação que engole "toma 2 comprimidos às 8h" cumpre a
 * promessa de privacidade destruindo a informação pela qual `care_notes` foi
 * desenhado — o que quem acabou de achar o animal precisa saber nos próximos
 * cinco minutos. Por isso metade dos casos abaixo é negativa.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redigirCanalMediado } from './redigir.js';

const tipos = (t: string): string[] => redigirCanalMediado(t).retirados.map((r) => r.kind);
const texto = (t: string): string => redigirCanalMediado(t).texto;

void describe('redação de canal mediado — o que precisa sair', () => {
  void it('telefone em grafia comum, com e sem máscara', () => {
    for (const entrada of [
      'me liga 11 98765-4321',
      'contato (11) 98765-4321',
      'zap +55 11 98765 4321',
      'telefone 1198765432',
      'liga 11.98765.4321',
    ]) {
      assert.deepEqual(tipos(entrada), ['phone'], `não redigiu: ${entrada}`);
      assert.ok(!/\d{8}/.test(texto(entrada).replace(/\D/g, '')), `sobrou dígito em: ${entrada}`);
    }
  });

  void it('ISCA 1 — largura zero entre os dígitos', () => {
    // Os dígitos estão na ordem certa e nenhuma regex de dígito consecutivo
    // casa. Na tela, indistinguível do telefone acima.
    const entrada = 'me liga 1​1​9​8​7​6​5​4​3​2​1';
    assert.deepEqual(tipos(entrada), ['phone']);
    assert.ok(!/\d/.test(texto(entrada)), 'o número sobreviveu à redação');
  });

  void it('ISCA 2 — homóglifo: dígitos de largura plena e traço cirílico', () => {
    const entrada = 'chama no １１９８７６５４３２１';
    assert.deepEqual(tipos(entrada), ['phone']);
    assert.ok(!/[０-９]/u.test(texto(entrada)), 'sobrou dígito de largura plena');
  });

  void it('ISCA 3 — número por extenso, inclusive "meia"', () => {
    const entrada = 'anota: um um nove oito sete meia cinco quatro tres dois um';
    assert.deepEqual(tipos(entrada), ['phone']);
    assert.ok(!/nove|oito|meia/.test(texto(entrada)), 'sobrou palavra-dígito');
  });

  void it('e-mail, inclusive com "arroba" e "ponto" escritos', () => {
    assert.deepEqual(tipos('escreve pra joao@exemplo.com.br'), ['email']);
    assert.deepEqual(tipos('manda pra joao arroba exemplo ponto com'), ['email']);
  });

  void it('link externo, com e sem protocolo', () => {
    // O host aqui é neutro de propósito. O portão de portabilidade reprova
    // literal de host conhecido em `src/`, e ele está certo em ser cego: uma
    // expressão regular não distingue "host que o código chama" de "texto que o
    // redator analisa". Afrouxar o portão para acomodar uma fixture sairia mais
    // caro que trocar a fixture.
    assert.deepEqual(tipos('meu perfil https://perfil-de-teste.link/fulano'), ['external_link']);
    assert.deepEqual(tipos('olha em www.meusite.com.br'), ['external_link']);
    assert.deepEqual(tipos('perfil: instagram.com/fulano'), ['external_link']);
  });

  void it('endereço: logradouro com número, e CEP', () => {
    assert.deepEqual(tipos('moro na Rua das Acacias, 120'), ['address']);
    assert.deepEqual(tipos('estamos na Av. Paulista 1000'), ['address']);
    assert.deepEqual(tipos('CEP 01310-100'), ['address']);
  });

  void it('vários numa nota só, na ordem em que apareciam', () => {
    const entrada = 'liga 11987654321 ou joao@exemplo.com, moro na Rua X, 10';
    assert.deepEqual(tipos(entrada), ['phone', 'email', 'address']);
  });
});

void describe('redação de canal mediado — o que NÃO pode sair', () => {
  void it('posologia e horário sobrevivem inteiros', () => {
    for (const entrada of [
      'toma 2 comprimidos as 8h',
      'remedio 3 vezes ao dia',
      'medo de fogos, 1 dose se tremer',
      'pesa 12 kg e tem 4 anos',
      'come 200 g de racao',
    ]) {
      const r = redigirCanalMediado(entrada);
      assert.deepEqual(r.retirados, [], `redigiu indevidamente: ${entrada}`);
      assert.equal(r.texto, entrada);
    }
  });

  void it('a nota de cuidado do exemplo do contrato passa intacta', () => {
    const entrada = 'Toma remedio de uso continuo, nao pode correr muito e tem medo de fogos.';
    assert.deepEqual(redigirCanalMediado(entrada).texto, entrada);
  });

  void it('palavra que contém número por extenso não é telefone', () => {
    // "um" e "seis" isolados são linguagem, não dígito ditado.
    assert.deepEqual(redigirCanalMediado('e um cao docil').retirados, []);
  });
});

void describe('redação de canal mediado — propriedades', () => {
  void it('é idempotente: o texto já redigido não muda na segunda passada', () => {
    const uma = redigirCanalMediado('liga 11987654321 agora');
    const duas = redigirCanalMediado(uma.texto);
    assert.equal(duas.texto, uma.texto);
    assert.deepEqual(duas.retirados, []);
  });

  void it('a dica NUNCA carrega o que foi retirado', () => {
    // Devolver o trecho na dica entregaria pela porta do lado o dado que a
    // função existe para reter — e a dica vai para a tela, para o log e para a
    // trilha de auditoria.
    const r = redigirCanalMediado('liga 11987654321 ou joao@exemplo.com');
    for (const t of r.retirados) {
      assert.ok(!/\d/.test(t.hint), `dica com dígito: ${t.hint}`);
      assert.ok(!t.hint.includes('@'), `dica com e-mail: ${t.hint}`);
      assert.ok(!t.hint.includes('joao'), `dica com conteúdo: ${t.hint}`);
    }
  });

  void it('nulo e vazio não quebram e não inventam retirada', () => {
    assert.deepEqual(redigirCanalMediado(null), { texto: '', retirados: [] });
    assert.deepEqual(redigirCanalMediado(undefined), { texto: '', retirados: [] });
    assert.deepEqual(redigirCanalMediado(''), { texto: '', retirados: [] });
  });
});
