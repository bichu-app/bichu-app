/**
 * Testes do HMAC de endereço IP (SEC-010, critério 4 de BICHUS-56).
 *
 * O caso que importa aqui é negativo e fácil de perder de vista: o resultado
 * precisa depender da CHAVE. Um SHA-256 sem chave passaria em qualquer teste de
 * "gera bytes diferentes para IPs diferentes" e continuaria sendo o IP em claro
 * com um passo a mais, porque a tabela dos 4,3 bilhões de IPv4 se monta em
 * minutos numa GPU comum.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  hashDoCodigoDaTag,
  hmacDeEnderecoIp,
  iguaisEmTempoConstante,
  reduzirEnderecoIp,
} from './digest.js';
import type { TagCodeCanonical } from '../types/brands.js';

const CHAVE_A = Buffer.alloc(32, 1);
const CHAVE_B = Buffer.alloc(32, 2);

void describe('redução do endereço antes do HMAC', () => {
  void it('trunca IPv4 para /24', () => {
    assert.equal(reduzirEnderecoIp('187.45.201.98'), '187.45.201.0/24');
    assert.equal(reduzirEnderecoIp('187.45.201.7'), '187.45.201.0/24');
  });

  void it('desembrulha IPv4 mapeado em IPv6', () => {
    assert.equal(reduzirEnderecoIp('::ffff:187.45.201.98'), '187.45.201.0/24');
  });

  void it('trunca IPv6 para /64, que é o prefixo que a operadora delega', () => {
    assert.equal(reduzirEnderecoIp('2804:14d:1:2:3:4:5:6'), '2804:14d:1:2::/64');
  });

  void it('endereço ilegível vira rótulo próprio, e não sai em claro', () => {
    assert.equal(reduzirEnderecoIp('nao-é-um-ip'), 'desconhecido');
  });
});

void describe('HMAC do endereço', () => {
  void it('depende da chave: chave nova torna as janelas não correlacionáveis', () => {
    const comA = hmacDeEnderecoIp('187.45.201.98', CHAVE_A);
    const comB = hmacDeEnderecoIp('187.45.201.98', CHAVE_B);

    assert.ok(comA !== null && comB !== null);
    assert.notEqual(
      comA.toString('hex'),
      comB.toString('hex'),
      'sem dependência da chave isto seria hash puro, que se reverte por força bruta',
    );
  });

  void it('é estável para o mesmo bloco e diferente entre blocos', () => {
    const primeiro = hmacDeEnderecoIp('187.45.201.98', CHAVE_A);
    const mesmoBloco = hmacDeEnderecoIp('187.45.201.7', CHAVE_A);
    const outroBloco = hmacDeEnderecoIp('187.45.202.98', CHAVE_A);

    assert.ok(primeiro !== null && mesmoBloco !== null && outroBloco !== null);
    assert.equal(primeiro.toString('hex'), mesmoBloco.toString('hex'));
    assert.notEqual(primeiro.toString('hex'), outroBloco.toString('hex'));
  });

  void it('endereço ausente não vira bytes inventados', () => {
    assert.equal(hmacDeEnderecoIp(undefined, CHAVE_A), null);
    assert.equal(hmacDeEnderecoIp('', CHAVE_A), null);
  });
});

void describe('comparação em tempo constante', () => {
  void it('compara conteúdo e recusa tamanhos diferentes sem lançar', () => {
    assert.equal(iguaisEmTempoConstante(Buffer.from('abc'), Buffer.from('abc')), true);
    assert.equal(iguaisEmTempoConstante(Buffer.from('abc'), Buffer.from('abd')), false);
    // `timingSafeEqual` lança com tamanhos diferentes; quem chama não deve
    // precisar saber disso para não derrubar o pedido.
    assert.equal(iguaisEmTempoConstante(Buffer.from('abc'), Buffer.from('abcd')), false);
  });
});

/**
 * Índice cego do código da tag (ADR-0004, Emenda 1, seção 3.1).
 *
 * O caso que fecha o critério 1 é negativo e tem que **reprovar com o mecanismo
 * desligado**: trocar a chave e obter o mesmo resumo significa que a função
 * voltou a ser `createHash('sha256')`, e um dump do banco volta a entregar a
 * base inteira por enumeração. O teste de "resumos diferentes para códigos
 * diferentes" passaria igual nos dois mundos, e é por isso que ele não basta.
 */
void describe('índice cego do código da tag', () => {
  const CODIGO = '7K2F9QJB3XR05TWD8MNCVH1234' as TagCodeCanonical;

  void it('depende da chave: chaves diferentes produzem resumos diferentes', () => {
    const comA = hashDoCodigoDaTag(CODIGO, CHAVE_A);
    const comB = hashDoCodigoDaTag(CODIGO, CHAVE_B);
    assert.equal(comA.length, 32);
    assert.equal(comB.length, 32);
    assert.equal(iguaisEmTempoConstante(comA, comB), false);
  });

  void it('não é SHA-256 sem chave: o resumo sem chave não pode ser alcançável', () => {
    // A prova direta de que a implementação trocou de função. Se alguém voltar
    // para `createHash`, este caso reprova citando o valor exato.
    const semChave = createHash('sha256').update(CODIGO, 'utf8').digest();
    assert.equal(iguaisEmTempoConstante(hashDoCodigoDaTag(CODIGO, CHAVE_A), semChave), false);
    assert.equal(iguaisEmTempoConstante(hashDoCodigoDaTag(CODIGO, CHAVE_B), semChave), false);
  });

  void it('é HMAC-SHA-256 do código canônico, e o vetor está escrito aqui', () => {
    assert.equal(
      hashDoCodigoDaTag(CODIGO, CHAVE_A).toString('hex'),
      createHmac('sha256', CHAVE_A).update(CODIGO, 'utf8').digest('hex'),
    );
  });

  void it('é estável com a mesma chave: a resolução depende da igualdade exata', () => {
    assert.equal(
      iguaisEmTempoConstante(hashDoCodigoDaTag(CODIGO, CHAVE_A), hashDoCodigoDaTag(CODIGO, CHAVE_A)),
      true,
    );
  });
});
