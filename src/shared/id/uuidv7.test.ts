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
   * Isca da BICHUS-208.
   *
   * O caso acima reprova **por sorte**: ele põe 25 pares no mesmo milissegundo, e
   * o contador de 12 bits é semeado ao acaso em [0, 4095], então a virada
   * `0xfff -> 0x000` cai nele em cerca de 0,6% das execuções (medido: 1253 em
   * 200 000 repetições da mesma sequência, e 6 em 500 execuções do arquivo).
   * Reprovação rara é o que ensina a ignorar reprovação.
   *
   * Aqui a condição é **forçada**: 4097 identificadores no mesmo milissegundo
   * controlado não cabem num contador de 4096 valores, então a virada é
   * obrigatória por casa dos pombos, qualquer que seja a semente. Não depende do
   * relógio da máquina, nem de quantos microssegundos passaram entre chamadas.
   *
   * Está marcado `todo` porque o defeito é do **gerador**, não do teste: a
   * BICHUS-208 concluiu que a propriedade não vale, e mexer no gerador de todas as
   * chaves primárias do sistema é decisão que não cabe nesta branch. Quando o
   * `uuidv7` tratar a virada (RFC 9562 §6.2 manda emprestar 1 ms do futuro ou
   * esperar o tique seguinte), este caso passa e a marca sai junto.
   */
  void it(
    'não anda para trás quando o contador de 12 bits vira no mesmo milissegundo',
    { todo: 'BICHUS-208: o contador vira de 0xfff para 0x000 e o identificador regride' },
    () => {
      const ids = criarIdGenerator(() => 1_760_000_100_000);
      const LARGURA_DO_CONTADOR = 4096;
      const gerados = Array.from({ length: LARGURA_DO_CONTADOR + 1 }, () => ids.uuidv7());

      const regressao = gerados.findIndex(
        (valor, i) => i > 0 && valor < (gerados[i - 1] ?? ''),
      );
      assert.equal(
        regressao,
        -1,
        regressao === -1
          ? ''
          : `identificador ${regressao} regrediu: ${gerados[regressao - 1] ?? ''} ` +
            `veio antes de ${gerados[regressao] ?? ''}`,
      );
    },
  );

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
