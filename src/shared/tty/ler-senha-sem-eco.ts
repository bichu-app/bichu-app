/**
 * Le uma senha do terminal, sem eco, para um `Buffer` que quem chama zera.
 *
 * ## Por que nao `readline`
 *
 * `readline` devolve `string`, e string em JavaScript e imutavel: ela vive ate
 * o coletor passar, e ninguem consegue apaga-la. Aqui os bytes vao para um
 * `Buffer` alocado uma vez, os pedacos que o terminal entrega sao zerados assim
 * que copiados, e o que sai e um `Buffer` do tamanho exato que quem chama zera
 * com `fill(0)` quando termina. Nao e garantia absoluta (o hash precisa da
 * senha como string, ver `comando-conta-admin.ts`), e reduz a senha em memoria ao
 * minimo que a derivacao exige.
 *
 * ## Por que o modo cru
 *
 * Sem ele o terminal ecoa o que se digita antes de o processo ver o byte. Em
 * modo cru o eco e desligado pelo proprio terminal, e o processo trata Enter,
 * apagar e Ctrl-C sozinho. Nada e escrito de volta, nem asterisco: o tamanho
 * da senha tambem e informacao.
 *
 * ## Sem terminal, recusa
 *
 * Com `stdin` redirecionado (`echo senha | node ...`) a senha teria vindo de
 * arquivo ou de outro processo, que sao exatamente os canais que a regra
 * proibe. `exigirTerminal` recusa antes de qualquer pergunta.
 */

/** A parte do `process.stdin` que este leitor usa. Existe para o teste. */
export interface EntradaDeTerminal {
  readonly isTTY?: boolean | undefined;
  setRawMode?: ((modo: boolean) => unknown) | undefined;
  on(evento: 'data', ouvinte: (pedaco: Buffer) => void): unknown;
  removeListener(evento: 'data', ouvinte: (pedaco: Buffer) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface SaidaDeTerminal {
  write(texto: string): unknown;
}

export class SemTerminal extends Error {
  constructor() {
    super('sem terminal');
    this.name = 'SemTerminal';
  }
}

export class LeituraInterrompida extends Error {
  constructor() {
    super('leitura interrompida');
    this.name = 'LeituraInterrompida';
  }
}

/** 256 caracteres de ate 4 bytes em UTF-8: o teto da politica, com folga zero. */
export const BYTES_MAXIMOS_DA_SENHA = 1024;

const CTRL_C = 0x03;
const CTRL_D = 0x04;
const BACKSPACE = 0x08;
const LF = 0x0a;
const CR = 0x0d;
const ESC = 0x1b;
const DEL = 0x7f;

export function temTerminal(entrada: EntradaDeTerminal): boolean {
  return entrada.isTTY === true && typeof entrada.setRawMode === 'function';
}

export function exigirTerminal(entrada: EntradaDeTerminal): void {
  if (!temTerminal(entrada)) throw new SemTerminal();
}

/** Excedeu o teto: a leitura continua ate o Enter, e o resultado sai marcado. */
export interface SenhaLida {
  readonly bytes: Buffer;
  readonly excedeu: boolean;
}

/**
 * Le ate Enter. Ctrl-C, e Ctrl-D com a linha vazia, interrompem. Apagar recua
 * um caractere inteiro de UTF-8, e nao um byte, para nao deixar meio caractere
 * no buffer. Sequencia de escape (setas) e descartada ate a letra final.
 */
export function lerSenhaSemEco(
  entrada: EntradaDeTerminal,
  saida: SaidaDeTerminal,
  rotulo: string,
): Promise<SenhaLida> {
  exigirTerminal(entrada);
  const setRawMode = entrada.setRawMode;
  if (setRawMode === undefined) throw new SemTerminal();

  const area = Buffer.alloc(BYTES_MAXIMOS_DA_SENHA);
  let tamanho = 0;
  let excedeu = false;
  let emEscape = false;

  return new Promise<SenhaLida>((resolver, rejeitar) => {
    const terminar = (erro: Error | undefined): void => {
      entrada.removeListener('data', aoReceber);
      setRawMode.call(entrada, false);
      entrada.pause();
      saida.write('\n');
      if (erro !== undefined) {
        area.fill(0);
        rejeitar(erro);
        return;
      }
      const bytes = Buffer.alloc(tamanho);
      area.copy(bytes, 0, 0, tamanho);
      area.fill(0);
      resolver({ bytes, excedeu });
    };

    const aoReceber = (pedaco: Buffer): void => {
      try {
        for (const byte of pedaco) {
          if (emEscape) {
            // `ESC [ ... <letra>`: termina na primeira letra depois do colchete.
            if ((byte >= 0x40 && byte <= 0x7e && byte !== 0x5b)) emEscape = false;
            continue;
          }
          if (byte === CTRL_C || (byte === CTRL_D && tamanho === 0)) {
            terminar(new LeituraInterrompida());
            return;
          }
          if (byte === CR || byte === LF) {
            terminar(undefined);
            return;
          }
          if (byte === DEL || byte === BACKSPACE) {
            // Recua sobre os bytes de continuacao (10xxxxxx) ate o inicio do caractere.
            while (tamanho > 0 && ((area[tamanho - 1] ?? 0) & 0xc0) === 0x80) {
              tamanho -= 1;
              area[tamanho] = 0;
            }
            if (tamanho > 0) {
              tamanho -= 1;
              area[tamanho] = 0;
            }
            continue;
          }
          if (byte === ESC) {
            emEscape = true;
            continue;
          }
          if (byte < 0x20) continue;
          if (tamanho >= BYTES_MAXIMOS_DA_SENHA) {
            excedeu = true;
            continue;
          }
          area[tamanho] = byte;
          tamanho += 1;
        }
      } finally {
        // O pedaco que o terminal entregou tambem carrega a senha.
        pedaco.fill(0);
      }
    };

    // O modo cru liga ANTES do rotulo. Na ordem inversa, o que chega entre o
    // rotulo e o modo cru (colar, digitar adiantado) passa pelo eco do
    // terminal: medido num pty em 23/09, a segunda senha apareceu na saida.
    setRawMode.call(entrada, true);
    saida.write(rotulo);
    entrada.on('data', aoReceber);
    entrada.resume();
  });
}

/** Teto da linha com eco (nome do operador, confirmacao). */
export const BYTES_MAXIMOS_DA_LINHA = 512;

/**
 * Le uma linha COM eco, no modo normal do terminal (que ja entrega a linha
 * inteira depois do Enter). Serve ao que nao e segredo: o nome de quem roda e
 * a confirmacao. Tambem exige terminal, porque a confirmacao respondida por
 * `yes |` nao confirma nada.
 */
export function lerLinhaComEco(
  entrada: EntradaDeTerminal,
  saida: SaidaDeTerminal,
  rotulo: string,
): Promise<string> {
  exigirTerminal(entrada);
  const pedacos: Buffer[] = [];
  let total = 0;

  return new Promise<string>((resolver, rejeitar) => {
    const aoReceber = (pedaco: Buffer): void => {
      const fim = pedaco.findIndex((byte) => byte === LF || byte === CR || byte === CTRL_C || byte === CTRL_D);
      const util = fim === -1 ? pedaco : pedaco.subarray(0, fim);
      if (total + util.length <= BYTES_MAXIMOS_DA_LINHA) {
        pedacos.push(Buffer.from(util));
        total += util.length;
      }
      if (fim === -1) return;
      entrada.removeListener('data', aoReceber);
      entrada.pause();
      const byteFinal = pedaco[fim];
      if (byteFinal === CTRL_C || byteFinal === CTRL_D) {
        rejeitar(new LeituraInterrompida());
        return;
      }
      resolver(Buffer.concat(pedacos).toString('utf8').trim());
    };
    saida.write(rotulo);
    entrada.on('data', aoReceber);
    entrada.resume();
  });
}
