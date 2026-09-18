/**
 * O código da tag. O que se prova aqui é o **efeito de resolução**: dois textos
 * diferentes ou chegam no mesmo código canônico, ou não chegam em nenhum.
 *
 * Um teste que só confirmasse "a função devolve 26 caracteres" passaria com a
 * substituição errada instalada. Por isso os casos abaixo comparam o resultado
 * da normalização de dois textos entre si, e o caso central é negativo: as
 * confusões de leitura que Crockford **não** corrige precisam continuar sendo
 * códigos distintos, porque corrigi-las abriria a página do pet errado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BITS_DE_ENTROPIA,
  TAMANHO_DO_CODIGO,
  formaImpressaDoCodigo,
  gerarCodigoDaTag,
  normalizarCodigoDaTag,
  sufixoDoCodigo,
} from './tag-code.js';

const BYTES = BITS_DE_ENTROPIA / 8;

function bytes(preencher: number): Uint8Array {
  return new Uint8Array(BYTES).fill(preencher);
}

void describe('geração do código da tag', () => {
  void it('produz 26 caracteres do alfabeto de Crockford', () => {
    const codigo = gerarCodigoDaTag(bytes(0xa5));
    assert.equal(codigo.length, TAMANHO_DO_CODIGO);
    assert.match(codigo, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  void it('nunca emite os quatro caracteres que Crockford exclui', () => {
    // Percorre entradas suficientes para cobrir todos os 32 símbolos: o alfabeto
    // errado só aparece quando algum índice cai em `I`, `L`, `O` ou `U`.
    for (let valor = 0; valor < 256; valor += 1) {
      const codigo = gerarCodigoDaTag(bytes(valor));
      assert.equal(/[ILOU]/.test(codigo), false, `código com caractere ambíguo: ${codigo}`);
    }
  });

  void it('o código emitido normaliza para ele mesmo: a normalização é idempotente', () => {
    for (let valor = 0; valor < 64; valor += 1) {
      const codigo = gerarCodigoDaTag(bytes(valor));
      assert.equal(normalizarCodigoDaTag(codigo), codigo);
    }
  });

  void it('entradas diferentes produzem códigos diferentes', () => {
    const vistos = new Set<string>();
    for (let valor = 0; valor < 256; valor += 1) vistos.add(gerarCodigoDaTag(bytes(valor)));
    assert.equal(vistos.size, 256);
  });

  void it('recusa entrada com menos de 128 bits em vez de emitir código fraco', () => {
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(8)), /128 bits/);
  });
});

void describe('normalização do código digitado', () => {
  const CANONICO = '7K2F9QJB3XR05TWD8MNCVH1234';

  void it('a forma impressa e a forma canônica resolvem no mesmo código', () => {
    const canonico = normalizarCodigoDaTag(CANONICO);
    assert.notEqual(canonico, undefined);
    const impressa = formaImpressaDoCodigo(canonico as NonNullable<typeof canonico>);
    assert.equal(impressa, '7K2F-9QJB-3XR0-5TWD-8MNC-VH12-34');
    assert.equal(normalizarCodigoDaTag(impressa), CANONICO);
  });

  void it('remove separador em qualquer posição, não só no lugar do agrupamento', () => {
    assert.equal(normalizarCodigoDaTag('7K2 F9Q-JB3X.R05TWD8MNCVH1234'), CANONICO);
    assert.equal(normalizarCodigoDaTag('-7K2F9QJB3XR05TWD8MNCVH1234-'), CANONICO);
  });

  void it('aceita minúscula: a plaquinha é lida por quem digita sem olhar o teclado', () => {
    assert.equal(normalizarCodigoDaTag('7k2f-9qjb-3xr0-5twd-8mnc-vh12-34'), CANONICO);
  });

  void it('aplica as três substituições de Crockford, e só elas', () => {
    // `I` e `L` viram `1`, `O` vira `0`, nas duas caixas. Os seis primeiros
    // caracteres são os enganos clássicos de quem transcreve à mão; os vinte
    // seguintes já estão na forma canônica e não podem mudar.
    const digitadoComEnganos = 'ILOilo0123456789ABCDEFGHJK';
    assert.equal(digitadoComEnganos.length, 26);
    assert.equal(normalizarCodigoDaTag(digitadoComEnganos), '1101100123456789ABCDEFGHJK');
  });

  void it('NÃO corrige 5/S, 8/B nem 2/Z: são códigos distintos e válidos', () => {
    // Este é o caso que o ADR-0004 chama de pior que "não encontrado". Se a
    // normalização mapeasse um no outro, um erro de digitação abriria a página
    // de outro animal, e ninguém veria erro nenhum acontecer.
    const comCinco = normalizarCodigoDaTag('5K2F9QJB3XR05TWD8MNCVH1234');
    const comEsse = normalizarCodigoDaTag('SK2F9QJB3XR05TWD8MNCVH1234');
    assert.notEqual(comCinco, undefined);
    assert.notEqual(comEsse, undefined);
    assert.notEqual(comCinco, comEsse);

    const comOito = normalizarCodigoDaTag('8K2F9QJB3XR05TWD8MNCVH1234');
    const comBe = normalizarCodigoDaTag('BK2F9QJB3XR05TWD8MNCVH1234');
    assert.notEqual(comOito, comBe);

    const comDois = normalizarCodigoDaTag('2K2F9QJB3XR05TWD8MNCVH1234');
    const comZe = normalizarCodigoDaTag('ZK2F9QJB3XR05TWD8MNCVH1234');
    assert.notEqual(comDois, comZe);
  });

  void it('recusa `U`, que não tem substituição e não está no alfabeto', () => {
    assert.equal(normalizarCodigoDaTag('UK2F9QJB3XR05TWD8MNCVH1234'), undefined);
  });

  void it('recusa tamanho diferente de 26 depois da normalização', () => {
    assert.equal(normalizarCodigoDaTag('7K2F9QJB3XR05TWD8MNCVH123'), undefined);
    assert.equal(normalizarCodigoDaTag('7K2F9QJB3XR05TWD8MNCVH12345'), undefined);
    assert.equal(normalizarCodigoDaTag(''), undefined);
  });

  void it('recusa texto que só tem separador: normalizar para vazio não é código', () => {
    assert.equal(normalizarCodigoDaTag('--------------------------'), undefined);
  });
});

void describe('sufixo da plaquinha', () => {
  void it('são os quatro últimos caracteres do código canônico', () => {
    const codigo = normalizarCodigoDaTag('7K2F-9QJB-3XR0-5TWD-8MNC-VH12-34');
    assert.notEqual(codigo, undefined);
    assert.equal(sufixoDoCodigo(codigo as NonNullable<typeof codigo>), '1234');
  });
});
