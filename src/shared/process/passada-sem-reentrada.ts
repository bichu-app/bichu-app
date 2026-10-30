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
      correndo = false;
    }
  };

  return Object.defineProperties(executar, {
    correndo: { get: () => correndo, enumerable: true },
    puladas: { get: () => puladas, enumerable: true },
  }) as PassadaSemReentrada;
}
