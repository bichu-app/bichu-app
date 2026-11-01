const ATRASO_MAXIMO_DE_TEMPORIZADOR = 2_147_483_647;

export interface VidaDoProcesso {
  /** Resolve quando `encerrar()` é chamado. */
  readonly encerrado: Promise<void>;
  /** Libera o laço de eventos. */
  encerrar(): void;
  /** Verdadeiro depois do primeiro `encerrar()`. */
  readonly estaEncerrando: boolean;
}

/** Segura o processo até que alguém peça para sair. */
export function manterProcessoVivo(): VidaDoProcesso {
  let encerrando = false;
  let liberar: () => void = () => undefined;

  const encerrado = new Promise<void>((resolve) => {
    liberar = resolve;
  });

  const ancora = setInterval(() => undefined, ATRASO_MAXIMO_DE_TEMPORIZADOR);

  return {
    encerrado,
    get estaEncerrando() {
      return encerrando;
    },
    encerrar: () => {
      if (encerrando) return;
      encerrando = true;
      clearInterval(ancora);
      liberar();
    },
  };
}
