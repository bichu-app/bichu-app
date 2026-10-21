/**
 * TODO TIPO DE TRABALHO QUE ALGUEM ENFILEIRA TEM DE TER TRATADOR NO WORKER.
 *
 * Conferido por TEXTO, pela mesma razao de `fiacao-do-push.test.ts` e
 * `fiacao-das-bases.test.ts` ao lado: **nada de `src/bin/` e carregado por
 * teste**. O `main()` do worker abre banco, fila e temporizadores, e a cadeia de
 * despacho mora dentro dele. A montagem pode sair do arquivo; o despacho, nao:
 * ele **e** o arquivo. Entao ou se confere o texto, ou nao se confere.
 *
 * ## O defeito que este arquivo existe para nao deixar voltar, medido
 *
 * `found-report-service.ts` enfileirava `match.recompute` a cada achado
 * registrado sem caso vinculado; `job-queue.ts` aceitava o tipo; e a cadeia de
 * despacho do worker **nao tinha ramo para ele**. O trabalho caia no pega-tudo
 * e ia para `fila.fail`, que devolve a linha a `pending` com espera e so
 * declara `failed` quando `attempts >= max_attempts` -- **5** por omissao
 * (`kysely-job-queue.ts`). Resultado: cada achado registrado custava cinco
 * reservas de worker e terminava em `failed` garantido, em producao, sem parar.
 *
 * O pega-tudo esta certo (ignorar em silencio deixaria a linha `running` para
 * sempre). O que faltava era este portao: **a fila nao avisa que um tipo nao
 * tem tratador**; ela so acumula `failed`, e `failed` so e visto por quem for
 * olhar a tabela.
 *
 * ## Isca
 *
 * Apague o ramo de `match.recompute` de `worker.ts` e este arquivo reprova.
 * Acrescente um `enqueue` de tipo novo sem o ramo correspondente, e ele reprova
 * tambem -- que e o ponto: o portao e sobre a CLASSE do defeito, nao sobre a
 * instancia que o produziu.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DO_WORKER = 'src/bin/worker.ts';
const DA_PORTA_DA_FILA = 'src/shared/ports/job-queue.ts';

function ler(caminho: string): string {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    throw new Error(
      `nao foi possivel ler ${caminho} a partir de ${process.cwd()}. Este teste ` +
        'confere texto e precisa rodar da raiz do repositorio; um teste que nao ' +
        'acha o arquivo precisa REPROVAR, e nao passar por vacuidade.',
    );
  }
}

/** Todo `.ts` de produção de `src/`. Teste e tipo gerado ficam de fora. */
function arquivosDeProducao(raiz = 'src'): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'generated') continue;
      achados.push(...arquivosDeProducao(caminho));
      continue;
    }
    if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) achados.push(caminho);
  }
  return achados;
}

/** Os tipos declarados na união `JobKind`, lidos da porta da fila. */
function tiposDeclarados(): string[] {
  const porta = ler(DA_PORTA_DA_FILA);
  const uniao = porta.slice(
    porta.indexOf('export type JobKind ='),
    porta.indexOf('export interface JobRecord'),
  );
  const tipos = [...uniao.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]!);
  assert.ok(
    tipos.length >= 10,
    `a união JobKind rendeu ${String(tipos.length)} tipos, o que não é plausível: ` +
      'este teste provavelmente deixou de saber ler a porta da fila, e um portão ' +
      'que não lê precisa reprovar em vez de aprovar tudo.',
  );
  return tipos;
}

/**
 * As constantes exportadas que dão nome a um tipo de trabalho
 * (`export const TRABALHO_DE_X = 'media.y'`), para alcançar quem enfileira e
 * quem despacha pelo NOME em vez do literal.
 */
function constantesPorTipo(fontes: readonly string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const caminho of fontes) {
    for (const m of ler(caminho).matchAll(/export const (\w+) = '([a-z_]+\.[a-z_]+)'/g)) {
      mapa.set(m[2]!, m[1]!);
    }
  }
  return mapa;
}

void describe('despacho da fila: nenhum tipo enfileirado sem tratador', () => {
  void it('todo tipo que alguem enfileira tem ramo proprio no worker', () => {
    const fontes = arquivosDeProducao();
    const constantes = constantesPorTipo(fontes);
    const worker = ler(DO_WORKER);
    const textoDeTudo = new Map(fontes.map((c) => [c, ler(c)] as const));

    const semTratador: string[] = [];
    for (const tipo of tiposDeclarados()) {
      const constante = constantes.get(tipo);
      const formas = [`'${tipo}'`, ...(constante === undefined ? [] : [constante])];

      // Enfileirado em algum lugar de produção?
      const enfileiradoEm = [...textoDeTudo].find(([, texto]) =>
        formas.some((forma) => new RegExp(`enqueue(?:<[^>]*>)?\\(\\s*${forma}`).test(texto)),
      );
      if (enfileiradoEm === undefined) continue;

      // Despachado por um ramo PRÓPRIO? `trabalho.kind === X` é a forma da
      // cadeia; o pega-tudo (`!== 'media.process_upload'`) não conta, e é
      // justamente ele que transformava ausência de tratador em `failed`.
      const despachado = formas.some((forma) =>
        new RegExp(`trabalho\\.kind === ${forma}`).test(worker),
      );
      if (!despachado) semTratador.push(`${tipo} (enfileirado em ${enfileiradoEm[0]})`);
    }

    assert.deepEqual(
      semTratador,
      [],
      'estes tipos sao enfileirados e NAO tem ramo no worker. Cada trabalho ' +
        'desses cai no pega-tudo, consome cinco reservas de worker e termina em ' +
        '`failed` -- sem alarme, e em producao. Ou ligue o tratador, ou pare de ' +
        'enfileirar: ' +
        semTratador.join(', '),
    );
  });

  void it('o ramo de `match.recompute` CONCLUI o trabalho, e nao o reprova', () => {
    const worker = ler(DO_WORKER);
    const ramo = worker.slice(worker.indexOf("trabalho.kind === 'match.recompute'"));
    const ate = ramo.slice(0, ramo.indexOf('continue;'));
    assert.match(
      ate,
      /fila\.complete\(trabalho\.id\)/,
      'o ramo de `match.recompute` nao conclui mais o trabalho: a hemorragia de ' +
        '`failed` volta no proximo achado registrado.',
    );
    assert.ok(
      !/fila\.fail\(/.test(ate),
      'o ramo de `match.recompute` voltou a reprovar o trabalho. Enquanto o ' +
        'cruzamento nao estiver ligado, reprovar e so encher a tabela.',
    );
  });

  void it('e o ramo DIZ em voz alta que nao cruzou nada', () => {
    // Um `complete` mudo e a forma de a fila ficar limpa mentindo: ninguem
    // descobre que N achados nunca foram cruzados. E a contagem deste evento e
    // a evidencia com que se pede o motor.
    assert.match(
      ler(DO_WORKER),
      /match\.recompute_sem_motor/,
      'o ramo de `match.recompute` ficou silencioso. Concluir sem registrar e ' +
        'a mesma familia do `owner_notified: true` sobre aviso que nao saiu.',
    );
  });
});
