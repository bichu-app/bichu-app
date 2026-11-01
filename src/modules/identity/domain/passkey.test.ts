import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../shared/types/brands.js';
import {
  ALGORITMOS_ACEITOS,
  PRAZO_DO_DESAFIO_MS,
  TETO_DE_PASSKEYS_POR_CONTA,
  TETO_DO_ROTULO,
  contadorAceito,
  desafioValido,
  rotuloNormalizado,
} from './passkey.js';

const AGORA = 1_800_000_000_000 as Instant;

void describe('contadorAceito: a defesa contra repeticao', () => {
  void it('aceita o contador que avanca', () => {
    assert.equal(contadorAceito(5n, 6n), true);
    assert.equal(contadorAceito(0n, 1n), true);
  });

  void it('RECUSA o contador que repete -- e a assercao capturada', () => {
    assert.equal(contadorAceito(5n, 5n), false);
  });

  void it('RECUSA o contador que retrocede -- e o autenticador clonado', () => {
    assert.equal(contadorAceito(5n, 4n), false);
    assert.equal(contadorAceito(5n, 0n), false);
  });

  void it('aceita zero sobre zero: a excecao que a especificacao preve', () => {
    assert.equal(contadorAceito(0n, 0n), true);
  });

  void it('a excecao do zero vale SO para zero sobre zero', () => {
    assert.equal(contadorAceito(1n, 0n), false);
  });

  void it('atravessa o teto de 32 bits sem sinal, que `integer` do Postgres nao segura', () => {
    assert.equal(contadorAceito(2_147_483_647n, 2_147_483_648n), true);
    assert.equal(contadorAceito(4_294_967_294n, 4_294_967_295n), true);
    assert.equal(contadorAceito(4_294_967_295n, 4_294_967_295n), false);
  });
});

void describe('desafioValido: prazo e uso unico', () => {
  void it('vale enquanto nao venceu e nao foi consumido', () => {
    assert.equal(
      desafioValido({ expiraEm: (AGORA + 1000) as Instant, consumidoEm: null }, AGORA),
      true,
    );
  });

  void it('nao vale depois do prazo', () => {
    assert.equal(
      desafioValido({ expiraEm: (AGORA - 1) as Instant, consumidoEm: null }, AGORA),
      false,
    );
  });

  void it('no milissegundo EXATO do prazo ja nao vale', () => {
    assert.equal(desafioValido({ expiraEm: AGORA, consumidoEm: null }, AGORA), false);
  });

  void it('nao vale depois de consumido, mesmo dentro do prazo', () => {
    assert.equal(
      desafioValido(
        { expiraEm: (AGORA + 100_000) as Instant, consumidoEm: (AGORA - 1) as Instant },
        AGORA,
      ),
      false,
    );
  });
});

void describe('rotuloNormalizado', () => {
  void it('ausente e nulo, porque o passo e dispensavel e o rotulo tambem', () => {
    assert.equal(rotuloNormalizado(undefined), null);
  });

  void it('apara o espaco em volta', () => {
    assert.equal(rotuloNormalizado('  Celular do Leandro  '), 'Celular do Leandro');
  });

  void it('o que vira vazio depois de aparar e AUSENCIA, nao string vazia', () => {
    assert.equal(rotuloNormalizado('   '), null);
    assert.equal(rotuloNormalizado(''), null);
  });

  void it('corta no teto da coluna', () => {
    const longo = 'x'.repeat(TETO_DO_ROTULO + 40);
    assert.equal(rotuloNormalizado(longo)?.length, TETO_DO_ROTULO);
  });

  void it('NAO escapa: quem escapa e a tela', () => {
    assert.equal(rotuloNormalizado('<b>Pixel</b> & cia'), '<b>Pixel</b> & cia');
  });
});

void describe('as constantes que o contrato tambem declara', () => {
  void it('os algoritmos sao ES256 e RS256, nessa ordem', () => {
    assert.deepEqual([...ALGORITMOS_ACEITOS], [-7, -257]);
  });

  void it('o prazo do desafio e em MILISSEGUNDOS, como o WebAuthn pede', () => {
    assert.equal(PRAZO_DO_DESAFIO_MS, 300_000);
  });

  void it('o teto por conta e dez', () => {
    assert.equal(TETO_DE_PASSKEYS_POR_CONTA, 10);
  });
});
