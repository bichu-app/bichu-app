import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarPassadaSemReentrada } from './passada-sem-reentrada.js';

function represada(): { promessa: Promise<void>; liberar: () => void } {
  let liberar = (): void => {};
  const promessa = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  return { promessa, liberar };
}

void describe('passada sem reentrada', () => {
  void it('a segunda chamada durante a primeira NÃO executa o corpo', async () => {
    let execucoes = 0;
    const porta = represada();
    const passada = criarPassadaSemReentrada(async () => {
      execucoes += 1;
      await porta.promessa;
    });

    const primeira = passada();
    assert.equal(execucoes, 1, 'a primeira chamada tem de entrar');
    assert.equal(passada.correndo, true);

    await passada();
    assert.equal(execucoes, 1, 'a segunda chamada não pode entrar no corpo');
    assert.equal(passada.puladas, 1);

    porta.liberar();
    await primeira;
    assert.equal(passada.correndo, false);
  });

  void it('dez chamadas durante uma passada em voo executam o corpo UMA vez', async () => {
    let execucoes = 0;
    const porta = represada();
    const passada = criarPassadaSemReentrada(async () => {
      execucoes += 1;
      await porta.promessa;
    });

    const emVoo = passada();
    await Promise.all(Array.from({ length: 10 }, () => passada()));

    assert.equal(execucoes, 1);
    assert.equal(passada.puladas, 10);

    porta.liberar();
    await emVoo;
  });

  void it('depois que a passada termina, a próxima entra', async () => {
    let execucoes = 0;
    const passada = criarPassadaSemReentrada(async () => {
      execucoes += 1;
      await Promise.resolve();
    });

    await passada();
    await passada();
    await passada();

    assert.equal(execucoes, 3);
    assert.equal(passada.puladas, 0);
  });

  void it('passada que LANÇA libera a trava, e a fila não congela para sempre', async () => {
    let execucoes = 0;
    const passada = criarPassadaSemReentrada(async () => {
      execucoes += 1;
      await Promise.resolve();
      throw new Error('armazenamento fora do ar');
    });

    await assert.rejects(passada(), /armazenamento fora do ar/);
    assert.equal(passada.correndo, false, 'a trava tem de ter sido liberada');

    await assert.rejects(passada(), /armazenamento fora do ar/);
    assert.equal(execucoes, 2);
    assert.equal(passada.puladas, 0);
  });
});
