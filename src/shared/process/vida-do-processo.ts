/**
 * Vida de um processo de longa duração.
 *
 * Node encerra quando o laço de eventos fica sem nada **referenciado** para
 * esperar. Um `await` numa promessa que nunca resolve NÃO conta: promessa
 * pendente não é um recurso do laço, é um objeto na memória. Um processo escrito
 * como
 *
 *     const t = setInterval(trabalho, SEIS_HORAS);
 *     t.unref();
 *     await new Promise<void>(() => {});
 *
 * fica vivo enquanto sobrar qualquer soquete aberto por acaso, e morre com
 * código 0 no instante em que o último deles fecha. Foi isso que aconteceu com o
 * worker: a conexão ociosa do pool soltava em 30 s (`idleTimeoutMillis` em
 * `src/shared/db/pool.ts`), o laço esvaziava, o processo saía limpo e a política
 * `restart: unless-stopped` do compose o ressuscitava. Nada acusava, porque sair
 * com 0 é saída bem-sucedida e reiniciar é o comportamento contratado da
 * política. Com trabalho com estado — despacho de push, processamento de foto —
 * isso é tarefa perdida no meio, não incômodo cosmético.
 *
 * Aqui a permanência é **declarada**: existe um recurso referenciado no laço
 * cuja única função é dizer "este processo tem motivo para continuar", e ele só
 * sai quando alguém encerra de propósito. O tempo de vida deixa de ser efeito
 * colateral do que o resto do código por acaso mantém aberto.
 */

/**
 * Maior atraso que um temporizador de Node aceita sem estourar o inteiro de 32
 * bits e reagendar para 1 ms. O valor não tem significado de negócio: este
 * temporizador existe para ocupar o laço, não para fazer trabalho.
 */
const ATRASO_MAXIMO_DE_TEMPORIZADOR = 2_147_483_647;

export interface VidaDoProcesso {
  /** Resolve quando `encerrar()` é chamado. É o que o `main` aguarda. */
  readonly encerrado: Promise<void>;
  /** Libera o laço de eventos. Idempotente: sinal repetido não é erro. */
  encerrar(): void;
  /** Verdadeiro depois do primeiro `encerrar()`. */
  readonly estaEncerrando: boolean;
}

/**
 * Segura o processo até que alguém peça para sair.
 *
 * O temporizador é **referenciado** de propósito: é ele que mantém o laço de
 * eventos ocupado. `unref()` aqui devolveria exatamente o defeito que este
 * módulo existe para impedir.
 */
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
