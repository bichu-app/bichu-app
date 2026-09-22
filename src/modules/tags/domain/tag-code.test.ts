/**
 * O código da tag. O que se prova aqui é o **efeito de resolução**: dois textos
 * diferentes ou chegam no mesmo código canônico, ou não chegam em nenhum.
 *
 * Um teste que só confirmasse "a função devolve 16 caracteres" passaria com a
 * substituição errada instalada. Por isso os casos abaixo comparam o resultado
 * da normalização de dois textos entre si, e o caso central é negativo: as
 * confusões de leitura que Crockford **não** corrige precisam continuar sendo
 * códigos distintos, porque corrigi-las abriria a página do pet errado.
 *
 * Os casos do símbolo de verificação e o do viés do descarte são a entrega da
 * BICHUS-154, e não o acessório (ADR-0004, Emenda 1, §13.4). Vale a regra do
 * projeto: prova negativa que vive numa frase evapora.
 */
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

/** Um código válido qualquer, com símbolo de verificação correto por construção. */
const CANONICO = gerarCodigoDaTag(deHex('7c2f9a03b15e88d4c061'));

/** O primeiro código gerado que contém o símbolo pedido. Determinístico. */
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
    // Quem multiplicar 16 por 5 encontra 80 e erra por 5 bits.
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
    // §13.3 da emenda. Qualquer implementação que discorde de um destes está
    // errada, e o desacordo aqui é permanente: ele vira plaquinha impressa.
    const vetores: readonly (readonly [string, string, string])[] = [
      ['00010203040506070809', '00G40R40M30E209X', '00G4-0R40-M30E-209X'],
      ['7c2f9a03b15e88d4c061', 'GQSM0XHBT4D9G31S', 'GQSM-0XHB-T4D9-G31S'],
      ['ffffffffffffffffffff', 'ZZZZZZZZZZZZZZZN', 'ZZZZ-ZZZZ-ZZZZ-ZZZN'],
      // O último NÃO serve sozinho: quinze zeros têm símbolo de verificação
      // zero para qualquer conjunto de pesos, então ele passaria com os pesos
      // errados. Está aqui para fechar a tabela; os dois primeiros discriminam.
      ['00000000000000000000', '0000000000000000', '0000-0000-0000-0000'],
    ];
    for (const [entrada, canonico, impresso] of vetores) {
      const codigo = gerarCodigoDaTag(deHex(entrada));
      assert.equal(codigo, canonico, `vetor ${entrada}`);
      assert.equal(formaImpressaDoCodigo(codigo), impresso);
    }
  });

  void it('descarta os 5 bits MAIS significativos, e não os menos', () => {
    // Dois valores que diferem só nos 5 bits altos precisam produzir o MESMO
    // código. Descartar os bits de baixo passaria em "gera 16 caracteres" e
    // perderia entropia de verdade.
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
    // A guarda existe porque menos bytes produziriam um código com menos
    // entropia e a MESMA aparência — e aqui o defeito é permanente.
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /10 bytes/);
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /75 bits/);
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(9)), /recebeu 9 bytes/);
    // 16 bytes é o tamanho antigo. Passar `random128()` por engano aqui não
    // pode produzir um código: produziria um de 75 bits com a mesma cara.
    assert.throws(() => gerarCodigoDaTag(new Uint8Array(16)), /10 bytes/);
  });
});

void describe('viés do descarte: o ponto em que um defeito seria permanente', () => {
  void it('o primeiro símbolo cobre os 32 valores do alfabeto', () => {
    // É o teste que pega o artefato de 26 caracteres voltando (onde o primeiro
    // símbolo assumia 8 dos 32 valores) e o que pega uma redução enviesada, por
    // exemplo um `mod (2^75 - 1)` no lugar da máscara.
    const vistos = new Set<string>();
    for (let amostra = 0; amostra < 4000; amostra += 1) {
      vistos.add(gerarCodigoDaTag(new Uint8Array(randomBytes(BYTES_DO_GERADOR)))[0] as string);
    }
    assert.equal(vistos.size, 32, `o primeiro símbolo só assumiu ${String(vistos.size)} valores`);
  });

  void it('a distribuição do primeiro símbolo é plana dentro da folga estatística', () => {
    // Cobrir os 32 valores não basta: uma redução enviesada cobre todos e
    // entrega uns com mais frequência que outros. Com 32.000 amostras a média é
    // 1.000 por símbolo; o corte em 750/1.300 é largo o bastante para não
    // piscar por acaso e estreito o bastante para pegar os 3,12% de `2^75 - 1`
    // multiplicados pelo acúmulo — o viés real concentra num extremo.
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

  // =========================================================================
  // "NADA CORRELACIONA CÓDIGOS EMITIDOS EM SEQUÊNCIA", MEDIDO SEM AMOSTRA
  // =========================================================================
  // Aqui havia um caso que sorteava 10.000 códigos e exigia ZERO pares
  // consecutivos com o mesmo prefixo de 4 símbolos. Ele reprovava sozinho, sem
  // defeito atrás, e a conta diz por quê: 4 símbolos são 20 bits, logo
  // 32^4 = 1.048.576 prefixos, e 9.999 pares consecutivos dão
  // λ = 9999/2^20 = 0,00954 colisão esperada por execução. A chance de ver
  // pelo menos uma é 1 − e^−λ = 0,949%, ou seja **1 execução em 105**.
  // Medido: 10 reprovações em 900 execuções (1,11%), e TODAS com exatamente
  // `1 pares consecutivos` — a assinatura de coincidência, não a de estrutura,
  // que produziria milhares.
  //
  // Ou seja: a asserção exigia que o gerador NUNCA coincidisse, que é
  // exatamente o que um gerador aleatório de verdade não pode prometer. Ela
  // reprovava a implementação correta.
  //
  // O gerador NÃO está enviesado, e isso foi medido e não suposto: 200 milhões
  // de emissões deram 195 colisões de prefixo contra 190,73 esperadas para uma
  // fonte uniforme — 0,31 sigma.
  //
  // **E afrouxar a tolerância não era o conserto**, mesmo derivada da
  // estatística. Contar colisão de prefixo não mede a propriedade que o nome do
  // caso promete: um contador cifrado com chave fixa daria distribuição plana e
  // ZERO colisões, passaria com qualquer tolerância, e seria inteiramente
  // derivável — que é precisamente o desastre descrito no cabeçalho deste
  // arquivo. O caso sorteado nunca testou a propriedade que ele nomeia, em
  // tolerância nenhuma.
  //
  // O que de fato sustenta a propriedade são dois fatos, e os dois se medem sem
  // amostra: o código é **função pura dos 10 bytes recebidos** (não há onde
  // esconder contador, data, lote ou ordem de chamada), e o prefixo é uma
  // **bijeção dos 20 bits mais altos da entrada** (o espaço não encolhe nem se
  // enumera por outro caminho que não adivinhar aqueles bits). A aleatoriedade
  // em si é responsabilidade da porta `random80()`, e é lá que ela se prova; o
  // caso antigo nem chegava à porta — ele chamava `randomBytes` direto, isto é,
  // testava o CSPRNG do Node, que não é entrega deste projeto.

  /**
   * 10 bytes com os 20 bits de prefixo escolhidos, e todo o resto escolhido à
   * parte: `enchimento` mexe nos 55 bits de baixo e `descarte` nos 5 bits altos
   * que a codificação joga fora.
   */
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
    // Se contador, data ou lote entrassem no começo do código, mexer em
    // qualquer outra coisa mudaria o prefixo. Exaustivo sobre o que sobra:
    // 128 valores dos 55 bits de baixo × 32 valores dos 5 bits descartados.
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
    // O outro lado. Depender só dos 20 bits não bastaria se muitos valores
    // caíssem no mesmo prefixo: aí o espaço seria menor do que anuncia e
    // enumerável. 4.096 valores distintos precisam dar 4.096 prefixos.
    const vistos = new Set<string>();
    for (let vinteBits = 0; vinteBits < 4096; vinteBits += 1) {
      vistos.add(gerarCodigoDaTag(comPrefixo(vinteBits, 0x33, 0)).slice(0, 4));
    }
    assert.equal(vistos.size, 4096, `4096 entradas distintas deram ${String(vistos.size)} prefixos`);

    // E percorrendo o espaço inteiro dos 20 bits, e não uma faixa dele.
    const espalhados = new Set<string>();
    for (let passo = 0; passo < 4096; passo += 1) {
      espalhados.add(gerarCodigoDaTag(comPrefixo(passo * 256, 0x33, 0)).slice(0, 4));
    }
    assert.equal(espalhados.size, 4096);
  });

  void it('a emissão não carrega estado: a posição na sequência não entra no código', () => {
    // O caso que um contador, uma data ou um lote reprovam SEMPRE, e não uma
    // vez em cem. A mesma entrada, repetida ao longo de uma sequência de
    // emissões, precisa dar sempre o mesmo código. O ruído entre as chamadas é
    // sorteado de propósito — o que se afirma não depende do sorteio.
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
    // Exaustivo sobre o código: 16 posições × 31 trocas = 496 casos, zero
    // escapam. Este é o critério 6, e ele reprova sem o símbolo instalado.
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
    // Corrigir é o mesmo erro que o ADR-0004 recusou ao proibir a substituição
    // de `5`/`S`: um código "corrigido" é um código válido e DIFERENTE, e o
    // resultado não seria "não encontrado", seria abrir a página do pet errado.
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
    // `I` e `L` viram `1`, `O` vira `0`, nas duas caixas. O código de referência
    // é gerado, para que a substituição seja exercitada contra um símbolo de
    // verificação de verdade e não contra um texto inventado.
    const alvo = gerarCodigoDaTag(deHex('11001100110011001100'));
    const comEnganos = alvo.replace(/1/g, 'I').replace(/0/g, 'O');
    assert.notEqual(comEnganos, alvo, 'o código de referência precisa ter 0 ou 1');
    assert.equal(normalizarCodigoDaTag(comEnganos), alvo);
    assert.equal(normalizarCodigoDaTag(comEnganos.toLowerCase()), alvo);
  });

  void it('NÃO corrige 5/S, 8/B nem 2/Z: são códigos distintos e válidos', () => {
    // Este é o caso que o ADR-0004 chama de pior que "não encontrado". Se a
    // normalização mapeasse um no outro, um erro de digitação abriria a página
    // de outro animal, e ninguém veria erro nenhum acontecer.
    //
    // Com o símbolo de verificação, trocar `5` por `S` num código válido passou
    // a ser um erro DETECTADO (400), que é melhor ainda. O que este caso
    // precisa provar é que os dois textos não colapsam no MESMO código: por
    // isso a comparação é entre dois códigos que são ambos válidos, cada um com
    // o seu símbolo de verificação.
    const comCinco = gerarCodigoDaTag(deHex('05050505050505050505'));
    const comEsse = gerarCodigoDaTag(deHex('50505050505050505050'));
    assert.notEqual(normalizarCodigoDaTag(comCinco), undefined);
    assert.notEqual(normalizarCodigoDaTag(comEsse), undefined);
    assert.notEqual(normalizarCodigoDaTag(comCinco), normalizarCodigoDaTag(comEsse));

    // E a substituição não existe: nenhum dos três pares é reescrito. O caso
    // procura um código que contenha cada símbolo em vez de supor que o de
    // referência os tenha — supor deixaria o `replace` sem efeito e o
    // `assert.notEqual` compararia um texto com ele mesmo, passando por engano.
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
    // Não há convivência de duas gerações de plaquinha. Um normalizador com dois
    // ramos teria um caminho que detecta erro de digitação e outro que não, e a
    // mensagem do produto dependeria de qual plaquinha a pessoa tem na mão.
    // O ramo de 26 nunca sairia: "pode existir uma tag antiga" não expira.
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
