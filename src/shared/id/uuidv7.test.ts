import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalizarUuid, criarIdGenerator } from './uuidv7.js';

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function primeiraRegressao(valores: readonly string[]): number {
  return valores.findIndex((valor, i) => i > 0 && valor < (valores[i - 1] ?? ''));
}

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
      if (i % 2 === 0) relogio += 1;
      gerados.push(ids.uuidv7());
    }

    const ordenados = [...gerados].sort();
    assert.deepEqual(gerados, ordenados, 'a ordem de geração precisa ser a ordem lexicográfica');
  });

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
    assert.equal(canonicalizarUuid('018f7c1e7a2b7c3d9e4f2b1a0c9d8e7f'), undefined);
    assert.equal(canonicalizarUuid("018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' or '1'='1"), undefined);
    assert.equal(canonicalizarUuid(''), undefined);
  });
});
