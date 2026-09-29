/**
 * A guarda de reentrada, medida sem servidor, sem banco e sem rede.
 *
 * O defeito que ela fecha é do `setInterval` da fila em `worker.ts`: ele não
 * espera promessa, então uma passada que leva mais que o intervalo tem a
 * seguinte começando em cima dela. Cada passada reserva o próprio trabalho, e
 * três decodificações simultâneas do pior caso aceito matam o processo nos
 * 448 MiB do `compose.yaml` — inclusive com o cache do libvips desligado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarPassadaSemReentrada } from './passada-sem-reentrada.js';

/** Uma promessa que só resolve quando o teste quiser. */
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

    // Esta é a chamada que o `setInterval` fazia em cima da anterior.
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

    // Sem o `finally`, esta segunda chamada seria pulada e a fila pararia em
    // silêncio: o processo continuaria de pé respondendo a tudo menos a fila.
    await assert.rejects(passada(), /armazenamento fora do ar/);
    assert.equal(execucoes, 2);
    assert.equal(passada.puladas, 0);
  });
});
