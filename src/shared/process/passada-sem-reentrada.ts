/**
 * Uma passada que nunca corre sobre si mesma.
 *
 * ## O defeito que isto existe para fechar, e ele foi medido
 *
 * `setInterval(() => { rodarFila().catch(...) }, 2000)` NAO espera a passada
 * anterior. O temporizador nao sabe que a funcao e assincrona: ele dispara a
 * cada dois segundos, e se uma passada leva mais que isso, a proxima comeca em
 * cima dela. Cada passada reserva o proprio trabalho, entao `TRABALHOS_POR_PASSADA
 * = 1` deixa de significar "um trabalho por vez no processo" e passa a significar
 * "um trabalho por passada", com quantas passadas couberem no tempo de uma.
 *
 * Medido no worktree `correcao/worker-que-morre-na-sequencia`, no container com
 * `mem_limit: 448m` da `compose.yaml`, sobre o pior caso que `inspecionar`
 * aceita (50 megapixels exatos, JPEG progressivo):
 *
 *   uma decodificacao por vez ................ pico 304 MiB, sobrevive a 10 fotos
 *   TRES ao mesmo tempo ...................... morto pelo cgroup, saida 137
 *
 * E as tres morrem juntas, inclusive as duas que estavam saudaveis. Desligar o
 * cache do libvips derruba o pico de 1219 MiB para 313 MiB e **nao salva este
 * caso**: com tres em voo o processo morre com o cache desligado tambem. Serie
 * de verdade nao e consequencia de `TRABALHOS_POR_PASSADA`; e consequencia
 * disto.
 *
 * ## Por que pular, e nao enfileirar
 *
 * Passada que chega durante outra nao tem nada de proprio para fazer: a fila
 * ainda vai estar la em dois segundos, e `claim` pega o que houver. Enfileirar a
 * chamada guardaria trabalho para executar em rajada exatamente quando o
 * processo ja esta ocupado, que e o contrario do que se quer.
 *
 * `puladas` existe para que "a fila esta lenta" seja um numero e nao uma
 * impressao: passada pulada e sinal de que o trabalho nao cabe no intervalo.
 */

export interface PassadaSemReentrada {
  /** Executa, ou pula em silencio se a anterior ainda esta correndo. */
  (): Promise<void>;
  /** `true` enquanto uma passada esta em voo. */
  readonly correndo: boolean;
  /** Quantas chamadas foram pulados por reentrada. */
  readonly puladas: number;
}

export function criarPassadaSemReentrada(
  passada: () => Promise<void>,
): PassadaSemReentrada {
  let correndo = false;
  let puladas = 0;

  const executar = async (): Promise<void> => {
    if (correndo) {
      puladas += 1;
      return;
    }
    correndo = true;
    try {
      await passada();
    } finally {
      // `finally` e nao o fim do `try`: passada que lanca precisa liberar a
      // trava, senao o primeiro erro congela a fila para sempre -- e em
      // silencio, porque o processo continua de pe respondendo a tudo menos a
      // fila. Foi assim que mecanismo escrito e nunca executado passou
      // despercebido duas vezes neste repositorio.
      correndo = false;
    }
  };

  return Object.defineProperties(executar, {
    correndo: { get: () => correndo, enumerable: true },
    puladas: { get: () => puladas, enumerable: true },
  }) as PassadaSemReentrada;
}
