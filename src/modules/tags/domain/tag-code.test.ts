import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BITS_DE_ENTROPIA,
  BYTES_DO_GERADOR,
  SIMBOLOS_DE_ALEATORIEDADE,
  TAMANHO_DO_CODIGO,
  formaImpressaDoCodigo,
  gerarCodigoDaTag,
  normalizarCodigoDaTag,
  sufixoDoCodigo,
} from './tag-code.js';

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function bytes(preencher: number): Uint8Array {
  return new Uint8Array(BYTES_DO_GERADOR).fill(preencher);
}

function deHex(hexadecimal: string): Uint8Array {
  return new Uint8Array(Buffer.from(hexadecimal, 'hex'));
}

const CANONICO = gerarCodigoDaTag(deHex('7c2f9a03b15e88d4c061'));

function codigoQueContem(simbolo: string): string {
  for (let valor = 0; valor < 256; valor += 1) {
    const codigo = gerarCodigoDaTag(bytes(valor));
    if (codigo.includes(simbolo)) return codigo;
  }
  throw new Error(`nenhum código de referência contém ${simbolo}`);
}

void describe('os números do código, que são os que viram plástico', () => {
  void it('16 caracteres: 15 de aleatoriedade e 1 de verificação', () => {
    assert.equal(TAMANHO_DO_CODIGO, 16);
    assert.equal(SIMBOLOS_DE_ALEATORIEDADE, 15);
  });

  void it('75 bits exatos, e não 80: o símbolo de verificação não é entropia', () => {
    assert.equal(BITS_DE_ENTROPIA, 75);
    assert.equal(SIMBOLOS_DE_ALEATORIEDADE * 5, BITS_DE_ENTROPIA);
    assert.notEqual(TAMANHO_DO_CODIGO * 5, BITS_DE_ENTROPIA);
  });

  void it('o gerador entrega 10 bytes, porque 75 bits não são bytes inteiros', () => {
    assert.equal(BYTES_DO_GERADOR, 10);
    assert.equal(BITS_DE_ENTROPIA / 8, 9.375);
  });
});

void describe('geração do código da tag', () => {
  void it('produz 16 caracteres do alfabeto de Crockford', () => {
    const codigo = gerarCodigoDaTag(bytes(0xa5));
    assert.equal(codigo.length, TAMANHO_DO_CODIGO);
    assert.match(codigo, /^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  void it('os quatro vetores de conferência do ADR produzem exatamente estas saídas', () => {
    const vetores: readonly (readonly [string, string, string])[] = [
      ['00010203040506070809', '00G40R40M30E209X', '00G4-0R40-M30E-209X'],
      ['7c2f9a03b15e88d4c061', 'GQSM0XHBT4D9G31S', 'GQSM-0XHB-T4D9-G31S'],
      ['ffffffffffffffffffff', 'ZZZZZZZZZZZZZZZN', 'ZZZZ-ZZZZ-ZZZZ-ZZZN'],
      ['00000000000000000000', '0000000000000000', '0000-0000-0000-0000'],
    ];
    for (const [entrada, canonico, impresso] of vetores) {
      const codigo = gerarCodigoDaTag(deHex(entrada));
      assert.equal(codigo, canonico, `vetor ${entrada}`);
      assert.equal(formaImpressaDoCodigo(codigo), impresso);
    }
  });

  void it('descarta os 5 bits MAIS significativos, e não os menos', () => {
    const base = deHex('07ffffffffffffffffff');
    const comOsAltosTrocados = deHex('f7ffffffffffffffffff');
    assert.equal(gerarCodigoDaTag(base), gerarCodigoDaTag(comOsAltosTrocados));
  });

  void it('nunca emite os quatro caracteres que Crockford exclui', () => {
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

  void it('recusa entrada curta dizendo os DOIS números: 10 bytes e 75 bits', () => {
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /10 bytes/);
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /75 bits/);
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /recebeu 9 bytes/);
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(16)), /10 bytes/);
  });
});

void describe('viés do descarte: o ponto em que um defeito seria permanente', () => {
  void it('o primeiro símbolo cobre os 32 valores do alfabeto', () => {
    const vistos = new Set<string>();
    for (let amostra = 0; amostra < 4000; amostra += 1) {
      vistos.add(gerarCodigoDaTag(new Uint8Array(randomBytes(BYTES_DO_GERADOR)))[0] as string);
    }
    assert.equal(vistos.size, 32, `o primeiro símbolo só assumiu ${String(vistos.size)} valores`);
  });

  void it('a distribuição do primeiro símbolo é plana dentro da folga estatística', () => {
    const contagem = new Map<string, number>();
    const AMOSTRAS = 32000;
    for (let amostra = 0; amostra < AMOSTRAS; amostra += 1) {
      const primeiro = gerarCodigoDaTag(new Uint8Array(randomBytes(BYTES_DO_GERADOR)))[0] as string;
      contagem.set(primeiro, (contagem.get(primeiro) ?? 0) + 1);
    }
    for (const simbolo of ALFABETO) {
      const vezes = contagem.get(simbolo) ?? 0;
      assert.ok(
        vezes > 750 && vezes < 1300,
        `o símbolo ${simbolo} apareceu ${String(vezes)} vezes em ${String(AMOSTRAS)}`,
      );
    }
  });

  function comPrefixo(vinteBits: number, enchimento: number, descarte: number): Uint8Array {
    const b = new Uint8Array(BYTES_DO_GERADOR);
    b[0] = ((descarte & 0x1f) << 3) | ((vinteBits >>> 17) & 0x07);
    b[1] = (vinteBits >>> 9) & 0xff;
    b[2] = (vinteBits >>> 1) & 0xff;
    b[3] = ((vinteBits & 0x01) << 7) | (enchimento & 0x7f);
    for (let i = 4; i < BYTES_DO_GERADOR; i += 1) b[i] = (enchimento * i) & 0xff;
    return b;
  }

  void it('o prefixo vem SÓ dos 20 bits altos da entrada: nada mais entra nele', () => {
    for (const vinteBits of [0x00000, 0x5a5a5, 0xfffff, 0x12345]) {
      const esperado = gerarCodigoDaTag(comPrefixo(vinteBits, 0, 0)).slice(0, 4);
      for (let enchimento = 0; enchimento < 128; enchimento += 1) {
        for (let descarte = 0; descarte < 32; descarte += 1) {
          assert.equal(
            gerarCodigoDaTag(comPrefixo(vinteBits, enchimento, descarte)).slice(0, 4),
            esperado,
            'o prefixo mudou sem que os 20 bits altos mudassem ' +
              `(enchimento ${String(enchimento)}, descarte ${String(descarte)})`,
          );
        }
      }
    }
  });

  void it('o prefixo é BIJEÇÃO desses 20 bits: o espaço não colapsa', () => {
    const vistos = new Set<string>();
    for (let vinteBits = 0; vinteBits < 4096; vinteBits += 1) {
      vistos.add(gerarCodigoDaTag(comPrefixo(vinteBits, 0x33, 0)).slice(0, 4));
    }
    assert.equal(vistos.size, 4096, `4096 entradas distintas deram ${String(vistos.size)} prefixos`);

    const espalhados = new Set<string>();
    for (let passo = 0; passo < 4096; passo += 1) {
      espalhados.add(gerarCodigoDaTag(comPrefixo(passo * 256, 0x33, 0)).slice(0, 4));
    }
    assert.equal(espalhados.size, 4096);
  });

  void it('a emissão não carrega estado: a posição na sequência não entra no código', () => {
    const marcada = comPrefixo(0x5a5a5, 0x11, 0);
    const referencia = gerarCodigoDaTag(marcada);
    for (let indice = 0; indice < 2000; indice += 1) {
      gerarCodigoDaTag(new Uint8Array(randomBytes(BYTES_DO_GERADOR)));
      assert.equal(
        gerarCodigoDaTag(marcada),
        referencia,
        `o código da mesma entrada mudou na emissão ${String(indice)}: a função guarda estado ` +
          'entre chamadas, e códigos emitidos em sequência passaram a se correlacionar',
      );
    }
  });
});

void describe('símbolo de verificação: o erro de digitação para antes do banco', () => {
  void it('todo erro de UM símbolo, em qualquer posição, é recusado', () => {
    let testados = 0;
    for (let posicao = 0; posicao < TAMANHO_DO_CODIGO; posicao += 1) {
      const original = CANONICO[posicao] as string;
      for (const substituto of ALFABETO) {
        if (substituto === original) continue;
        const errado =
          CANONICO.slice(0, posicao) + substituto + CANONICO.slice(posicao + 1);
        assert.equal(
          normalizarCodigoDaTag(errado),
          undefined,
          `passou um erro de um símbolo: ${errado} (posição ${String(posicao)})`,
        );
        testados += 1;
      }
    }
    assert.equal(testados, TAMANHO_DO_CODIGO * 31);
  });

  void it('toda TRANSPOSIÇÃO de dois símbolos é recusada, adjacente ou não', () => {
    let testadas = 0;
    for (let a = 0; a < TAMANHO_DO_CODIGO; a += 1) {
      for (let b = a + 1; b < TAMANHO_DO_CODIGO; b += 1) {
        if (CANONICO[a] === CANONICO[b]) continue;
        const simbolos = [...CANONICO];
        [simbolos[a], simbolos[b]] = [simbolos[b] as string, simbolos[a] as string];
        const trocado = simbolos.join('');
        assert.equal(
          normalizarCodigoDaTag(trocado),
          undefined,
          `passou uma transposição: ${trocado} (${String(a)} com ${String(b)})`,
        );
        testadas += 1;
      }
    }
    assert.ok(testadas > 0, 'nenhuma transposição foi exercitada');
  });

  void it('a transposição ADJACENTE, que é o segundo erro humano mais comum, é recusada', () => {
    for (let posicao = 0; posicao + 1 < TAMANHO_DO_CODIGO; posicao += 1) {
      if (CANONICO[posicao] === CANONICO[posicao + 1]) continue;
      const simbolos = [...CANONICO];
      [simbolos[posicao], simbolos[posicao + 1]] = [
        simbolos[posicao + 1] as string,
        simbolos[posicao] as string,
      ];
      assert.equal(normalizarCodigoDaTag(simbolos.join('')), undefined);
    }
  });

  void it('ele DETECTA e nunca corrige: a saída é `undefined`, nunca outro código', () => {
    const comUmErro = `${CANONICO.slice(0, 3)}${CANONICO[3] === 'Z' ? 'Y' : 'Z'}${CANONICO.slice(4)}`;
    assert.equal(normalizarCodigoDaTag(comUmErro), undefined);
  });
});

void describe('normalização do código digitado', () => {
  void it('a forma impressa e a forma canônica resolvem no mesmo código', () => {
    const impressa = formaImpressaDoCodigo(CANONICO);
    assert.equal(impressa, 'GQSM-0XHB-T4D9-G31S');
    assert.equal(normalizarCodigoDaTag(impressa), CANONICO);
  });

  void it('remove separador em qualquer posição, não só no lugar do agrupamento', () => {
    assert.equal(normalizarCodigoDaTag('GQS M0X-HBT4.D9G31S'), CANONICO);
    assert.equal(normalizarCodigoDaTag('-GQSM0XHBT4D9G31S-'), CANONICO);
  });

  void it('aceita minúscula: a plaquinha é lida por quem digita sem olhar o teclado', () => {
    assert.equal(normalizarCodigoDaTag('gqsm-0xhb-t4d9-g31s'), CANONICO);
  });

  void it('aplica as três substituições de Crockford, e só elas', () => {
    const alvo = gerarCodigoDaTag(deHex('11001100110011001100'));
    const comEnganos = alvo.replace(/1/g, 'I').replace(/0/g, 'O');
    assert.notEqual(comEnganos, alvo, 'o código de referência precisa ter 0 ou 1');
    assert.equal(normalizarCodigoDaTag(comEnganos), alvo);
    assert.equal(normalizarCodigoDaTag(comEnganos.toLowerCase()), alvo);
  });

  void it('NÃO corrige 5/S, 8/B nem 2/Z: são códigos distintos e válidos', () => {
    const comCinco = gerarCodigoDaTag(deHex('05050505050505050505'));
    const comEsse = gerarCodigoDaTag(deHex('50505050505050505050'));
    assert.notEqual(normalizarCodigoDaTag(comCinco), undefined);
    assert.notEqual(normalizarCodigoDaTag(comEsse), undefined);
    assert.notEqual(normalizarCodigoDaTag(comCinco), normalizarCodigoDaTag(comEsse));

    for (const [de, para] of [['5', 'S'], ['8', 'B'], ['2', 'Z']] as const) {
      const comOSimbolo = codigoQueContem(de);
      const trocado = comOSimbolo.replace(de, para);
      assert.notEqual(trocado, comOSimbolo, `o código de referência precisa conter ${de}`);
      assert.notEqual(
        normalizarCodigoDaTag(trocado),
        comOSimbolo,
        `${de}/${para} foi corrigido, e um erro de digitação abriria outro pet`,
      );
    }
  });

  void it('recusa `U`, que não tem substituição e não está no alfabeto', () => {
    assert.equal(normalizarCodigoDaTag(`U${CANONICO.slice(1)}`), undefined);
  });

  void it('recusa tamanho diferente de 16 depois da normalização', () => {
    assert.equal(normalizarCodigoDaTag(CANONICO.slice(0, 15)), undefined);
    assert.equal(normalizarCodigoDaTag(`${CANONICO}0`), undefined);
    assert.equal(normalizarCodigoDaTag(''), undefined);
  });

  void it('CORTE SECO: um código de 26 caracteres, bem formado pelas regras antigas, é 400', () => {
    assert.equal(normalizarCodigoDaTag('7K2F9QJB3XR05TWD8MNCVH1234'), undefined);
    assert.equal(normalizarCodigoDaTag('7K2F-9QJB-3XR0-5TWD-8MNC-VH12-34'), undefined);
  });

  void it('recusa texto que só tem separador: normalizar para vazio não é código', () => {
    assert.equal(normalizarCodigoDaTag('----------------'), undefined);
  });
});

void describe('sufixo da plaquinha', () => {
  void it('são os quatro últimos caracteres do código canônico', () => {
    assert.equal(sufixoDoCodigo(CANONICO), 'G31S');
    assert.equal(sufixoDoCodigo(CANONICO), CANONICO.slice(-4));
  });

  void it('satisfaz o `char(4)` e a restrição de alfabeto do banco', () => {
    for (let valor = 0; valor < 64; valor += 1) {
      assert.match(sufixoDoCodigo(gerarCodigoDaTag(bytes(valor))), /^[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });
});
