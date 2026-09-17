/**
 * O worker saía sozinho a cada ~30 s e o Docker o ressuscitava, com
 * `RestartCount` subindo e `docker compose ps` verde o tempo todo. A causa era
 * `await new Promise(() => {})` segurando nada, e o único recurso referenciado
 * no laço de eventos sendo a conexão ociosa do pool, que solta em 30 s.
 *
 * Um teste que só chamasse `encerrar()` e conferisse a promessa não teria pegado
 * isso: a promessa resolvia certinho no código defeituoso também. O que falhava
 * era o laço de eventos, que só existe de verdade num processo de verdade. Por
 * isso estes casos sobem processos filhos e olham o desfecho deles.
 *
 * O caso `BAIT` é a prova negativa: ele carrega o padrão antigo, e o teste EXIGE
 * que ele saia sozinho. Se um dia ele parar de sair, é porque esta verificação
 * deixou de conseguir enxergar a falha que ela existe para pegar, e aí ela
 * reprova em vez de aprovar por confiança.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, it } from 'node:test';
import { manterProcessoVivo } from './vida-do-processo.js';

/**
 * Tempo de observação. Precisa ser maior que o atraso de arranque do Node e
 * folgado em relação a zero: um processo cujo laço esvazia sai em dezenas de
 * milissegundos, não em centenas.
 */
const JANELA_DE_OBSERVACAO_EM_MS = 1_000;
const LIMITE_PARA_SAIDA_EM_MS = 10_000;

const MODULO = new URL('./vida-do-processo.js', import.meta.url).href;

/**
 * O padrão defeituoso, preservado na íntegra. Temporizador sem referência e uma
 * promessa que nunca resolve, exatamente como `src/bin/worker.ts` estava.
 */
const BAIT = `
  async function main() {
    const t = setInterval(() => undefined, 6 * 60 * 60 * 1000);
    t.unref();
    await new Promise(() => {});
  }
  main().catch(() => process.exit(1));
`;

/** O padrão corrigido: a permanência é declarada, não herdada de um soquete. */
const VIVO = `
  import { manterProcessoVivo } from ${JSON.stringify(MODULO)};
  async function main() {
    const vida = manterProcessoVivo();
    const t = setInterval(() => undefined, 6 * 60 * 60 * 1000);
    t.unref();
    await vida.encerrado;
  }
  main().catch(() => process.exit(1));
`;

/** O corrigido, com pedido de parada: precisa sair, e sair com 0. */
const VIVO_E_ENCERRA = `
  import { manterProcessoVivo } from ${JSON.stringify(MODULO)};
  async function main() {
    const vida = manterProcessoVivo();
    setTimeout(() => vida.encerrar(), 200).unref();
    await vida.encerrado;
  }
  main().catch(() => process.exit(1));
`;

function subirProcesso(codigo: string): ChildProcess {
  return spawn(process.execPath, ['--input-type=module', '-e', codigo], { stdio: 'ignore' });
}

interface Desfecho {
  readonly saiu: boolean;
  readonly codigo: number | null;
}

/** Espera até `limite`; devolve o desfecho real, sem inventar o que não viu. */
function aguardarDesfecho(filho: ChildProcess, limite: number): Promise<Desfecho> {
  return new Promise<Desfecho>((resolve) => {
    const relogio = setTimeout(() => {
      filho.removeAllListeners('exit');
      resolve({ saiu: false, codigo: null });
    }, limite);

    filho.once('exit', (codigo) => {
      clearTimeout(relogio);
      resolve({ saiu: true, codigo });
    });
  });
}

void describe('vida do processo', () => {
  void it('o padrão antigo sai sozinho: é ele que a verificação precisa reprovar', async () => {
    const filho = subirProcesso(BAIT);
    const desfecho = await aguardarDesfecho(filho, LIMITE_PARA_SAIDA_EM_MS);

    if (!desfecho.saiu) {
      filho.kill('SIGKILL');
      assert.fail(
        'a isca não saiu sozinha. Esta verificação perdeu a capacidade de distinguir ' +
          'processo vivo de propósito de processo vivo por acaso: conserte a isca ' +
          'antes de confiar no caso positivo.',
      );
    }
    assert.equal(desfecho.codigo, 0, 'a saída silenciosa era com código 0, e é por isso que ninguém via');
  });

  void it('com a âncora declarada o processo continua de pé', async () => {
    const filho = subirProcesso(VIVO);
    const desfecho = await aguardarDesfecho(filho, JANELA_DE_OBSERVACAO_EM_MS);
    filho.kill('SIGKILL');

    assert.equal(
      desfecho.saiu,
      false,
      `o processo saiu com código ${String(desfecho.codigo)} em menos de ${String(JANELA_DE_OBSERVACAO_EM_MS)} ms. ` +
        'O laço de eventos voltou a esvaziar sozinho, que é a falha do worker reiniciando a cada 30 s.',
    );
  });

  void it('encerrar() devolve o laço e o processo sai com 0', async () => {
    const filho = subirProcesso(VIVO_E_ENCERRA);
    const desfecho = await aguardarDesfecho(filho, LIMITE_PARA_SAIDA_EM_MS);

    if (!desfecho.saiu) filho.kill('SIGKILL');
    assert.equal(desfecho.saiu, true, 'âncora que não solta transforma parada limpa em SIGKILL');
    assert.equal(desfecho.codigo, 0);
  });

  void it('encerrar() é idempotente e resolve a promessa uma vez só', async () => {
    const vida = manterProcessoVivo();

    assert.equal(vida.estaEncerrando, false);
    vida.encerrar();
    vida.encerrar();

    assert.equal(vida.estaEncerrando, true);
    await vida.encerrado;
  });
});
