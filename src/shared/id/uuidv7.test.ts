/**
 * Testes do gerador de identificador (BICHUS-19).
 *
 * O que estes casos travam é a propriedade pela qual o v7 foi escolhido: a
 * ordenação temporal. Um gerador que produz UUID válido mas fora de ordem passa
 * em qualquer teste de formato e devolve, em produção, exatamente a fragmentação
 * de índice que o v4 causaria.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalizarUuid, criarIdGenerator } from './uuidv7.js';

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Índice do primeiro identificador menor que o anterior, ou -1 se não houver. */
function primeiraRegressao(valores: readonly string[]): number {
  return valores.findIndex((valor, i) => i > 0 && valor < (valores[i - 1] ?? ''));
}

/** Os 48 bits de milissegundo que o identificador carrega, em decimal. */
function carimboDe(valor: string): number {
  return Number.parseInt(valor.slice(0, 8) + valor.slice(9, 13), 16);
}

void describe('uuidv7', () => {
  void it('tem a forma, a versão 7 e a variante RFC 4122', () => {
    const ids = criarIdGenerator(() => 1_760_000_000_000);
    const valor = ids.uuidv7();

    assert.match(valor, FORMATO);
    assert.equal(valor[14], '7', 'o dígito de versão precisa ser 7');
    assert.ok(['8', '9', 'a', 'b'].includes(valor[19] ?? ''), 'variante RFC 4122');
  });

  void it('ordena por texto na mesma ordem em que foi gerado', () => {
    let relogio = 1_760_000_000_000;
    const ids = criarIdGenerator(() => relogio);

    const gerados: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      // Metade no mesmo milissegundo, metade com o relógio andando: é o primeiro
      // caso que quebra um v7 sem contador monotônico.
      if (i % 2 === 0) relogio += 1;
      gerados.push(ids.uuidv7());
    }

    const ordenados = [...gerados].sort();
    assert.deepEqual(gerados, ordenados, 'a ordem de geração precisa ser a ordem lexicográfica');
  });

  /**
   * Isca da BICHUS-208, e o portão da propriedade inteira.
   *
   * O caso acima reprovava **por sorte**: com 25 pares no mesmo milissegundo e um
   * contador de 12 bits semeado ao acaso em [0, 4095], a virada `0xfff -> 0x000`
   * caía nele em 0,63% das execuções. Reprovação rara é o que ensina a ignorar
   * reprovação.
   *
   * Aqui a condição é **forçada**: 4097 identificadores no mesmo milissegundo
   * controlado não cabem num contador de 4096 valores, então a virada é obrigatória
   * por casa dos pombos, qualquer que seja a semente. Não depende do relógio da
   * máquina nem de quantos microssegundos passaram entre chamadas — reprovava em
   * 30 de 30 execuções contra o gerador antigo.
   */
  void it('não anda para trás quando o contador de 12 bits vira no mesmo milissegundo', () => {
    const ids = criarIdGenerator(() => 1_760_000_100_000);
    const gerados = Array.from({ length: 4097 }, () => ids.uuidv7());

    const regressao = primeiraRegressao(gerados);
    assert.equal(
      regressao,
      -1,
      regressao === -1
        ? ''
        : `identificador ${regressao} regrediu: ${gerados[regressao - 1] ?? ''} ` +
          `veio antes de ${gerados[regressao] ?? ''}`,
    );
  });

  /**
   * Autoteste da isca acima. Sem ele, a isca vale por confiança no dia em que foi
   * escrita: uma verificação que não consegue reprovar fica verde para sempre e
   * ninguém procura o que acredita já ter.
   *
   * O gerador abaixo é o de antes da BICHUS-208 — semente uniforme nos 12 bits e
   * incremento com `& 0x0fff`, sem tratar a virada. A mesma função que aprova o
   * gerador de produção **precisa** reprovar este.
   */
  void it('a isca acusa um gerador que não trata a virada', () => {
    let sequencia = 0x0ffe;
    const carimbo = 1_760_000_200_000;
    const semTratarAVirada = (): string => {
      sequencia = (sequencia + 1) & 0x0fff;
      const hex =
        carimbo.toString(16).padStart(12, '0') +
        (0x7000 | sequencia).toString(16).padStart(4, '0') +
        '8000000000000000';
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join('-');
    };

    const gerados = Array.from({ length: 4 }, () => semTratarAVirada());
    assert.notEqual(
      primeiraRegressao(gerados),
      -1,
      'a isca ficou cega: ela precisa acusar a virada 0xfff -> 0x000',
    );
  });

  /**
   * Localidade de índice, que é a razão de o ADR-0002 ter escolhido o v7 sobre o
   * v4. O conserto da virada adianta o carimbo de tempo (RFC 9562 §6.2), e um
   * conserto que adiantasse demais espalharia as chaves pelo B-tree e trocaria um
   * defeito raro por custo constante de escrita. Em carga normal o carimbo tem de
   * seguir o relógio exatamente, sem um milissegundo de deriva.
   */
  void it('não deriva do relógio em carga normal', () => {
    let relogio = 1_760_000_300_000;
    const ids = criarIdGenerator(() => relogio);

    for (let ms = 0; ms < 200; ms += 1) {
      relogio += 1;
      for (let i = 0; i < 500; i += 1) {
        assert.equal(carimboDe(ids.uuidv7()), relogio, `deriva no milissegundo ${ms}`);
      }
    }
  });

  /**
   * E quando a virada acontece, o empréstimo é de 1 ms e se devolve sozinho: assim
   * que o relógio real alcança o carimbo adiantado, o gerador volta a segui-lo.
   */
  void it('o empréstimo da virada é de 1 ms e se devolve quando o relógio alcança', () => {
    let relogio = 1_760_000_400_000;
    const ids = criarIdGenerator(() => relogio);

    const carimbos = Array.from({ length: 4097 }, () => carimboDe(ids.uuidv7()));
    const distintos = [...new Set(carimbos)];
    assert.deepEqual(distintos, [relogio, relogio + 1], 'o empréstimo passou de 1 ms');

    relogio += 2;
    assert.equal(carimboDe(ids.uuidv7()), relogio, 'o gerador não voltou a seguir o relógio');
  });

  void it('não repete identificador', () => {
    const ids = criarIdGenerator(() => 1_760_000_000_000);
    const gerados = new Set(Array.from({ length: 1000 }, () => ids.uuidv7()));
    assert.equal(gerados.size, 1000);
  });

  void it('o token opaco tem 256 bits e não é ordenável', () => {
    const ids = criarIdGenerator(() => 1_760_000_000_000);
    const token = ids.opaqueToken();
    // 32 bytes em base64url dão 43 caracteres sem preenchimento.
    assert.equal(token.length, 43);
    assert.notEqual(ids.opaqueToken(), token);
  });
});

void describe('canonicalização de UUID vindo do cliente', () => {
  void it('devolve a forma que o tipo produz, e não a que chegou', () => {
    assert.equal(
      canonicalizarUuid('  018F7C1E-7A2B-7C3D-9E4F-2B1A0C9D8E7F  '),
      '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
    );
  });

  void it('recusa o que não é UUID, em vez de deixar passar adiante', () => {
    // Confiar no texto cru permite que dois valores diferentes designem a mesma
    // linha, e que um deles escape de uma verificação feita por igualdade.
    assert.equal(canonicalizarUuid('018f7c1e7a2b7c3d9e4f2b1a0c9d8e7f'), undefined);
    assert.equal(canonicalizarUuid("018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' or '1'='1"), undefined);
    assert.equal(canonicalizarUuid(''), undefined);
  });
});
