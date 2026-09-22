/**
 * Portão da suíte limpa.
 *
 * ## O defeito que este arquivo existe para impedir
 *
 * `npm test` compila para `dist/_tests` e manda o `node --test` varrer
 * `dist/_tests/src/**\/*.test.js`. O `tsc` **acrescenta**, nunca remove: arquivo
 * de teste apagado ou renomeado no fonte deixa o `.js` antigo no disco, e ele
 * continua sendo executado em toda rodada seguinte. Medido nesta base: apagar o
 * `.test.ts` e rodar de novo mantinha os 637 testes, com o nome do arquivo morto
 * ainda na saída.
 *
 * Isso corrompe **todos** os outros portões do projeto, não só o teste morto. Um
 * commit verde pode estar verde por causa de um binário que ninguém mais
 * consegue ler, e uma falha fantasma manda a investigação para um fonte que não
 * existe. É a família de "verde produzido por não verificar" que já aparece três
 * vezes no histórico deste repositório.
 *
 * ## As duas conferências, e por que são duas
 *
 * 1. `conferirLimpezaDosScripts` lê `package.json` e exige que todo script que
 *    produz `dist/_tests` remova o diretório **antes** de compilar. Ela reprova
 *    no instante em que a limpeza sai do script, sem depender de haver lixo.
 * 2. `procurarCompiladosOrfaos` varre `dist/_tests` e acusa todo `.js` sem
 *    `.ts` correspondente. Ela acusa o dano de fato, inclusive o que chegar por
 *    um caminho que a primeira não prevê (alguém rodando o `tsc` à mão, um
 *    `outDir` novo, um script de CI próprio).
 *
 * A primeira sozinha vira conferência de texto: passa a valer por acreditar que
 * a string implica o efeito. A segunda sozinha é surda enquanto ninguém apaga um
 * teste — ela só acusa na conjunção "limpeza removida E arquivo apagado", que é
 * tarde demais. Juntas, uma cobre o buraco da outra.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Diretório de saída da compilação dos testes, relativo à raiz do repositório. */
export const DIRETORIO_DE_TESTES_COMPILADOS = 'dist/_tests';

/** Scripts de `package.json` que compilam para `DIRETORIO_DE_TESTES_COMPILADOS`. */
export interface ScriptDoPacote {
  readonly nome: string;
  readonly comando: string;
}

export interface QueixaDeScript {
  readonly script: string;
  readonly motivo: string;
}

/**
 * Reconhece uma etapa que de fato apaga o diretório de saída.
 *
 * Aceita `rm -rf dist/_tests` e `tsc --build --clean`, que são as duas formas
 * que resolvem. Não aceita `rm` sem `-r`, que falha em diretório, nem remoção de
 * um caminho diferente: a etapa precisa apagar **este** diretório.
 */
function ehEtapaDeLimpeza(etapa: string): boolean {
  const texto = etapa.trim();
  const alvo = DIRETORIO_DE_TESTES_COMPILADOS;
  const removeComRm =
    /(^|\s)rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)+/.test(texto) &&
    new RegExp(`(^|\\s)${alvo.replace(/\//g, '\\/')}(\\s|$|\\/)`).test(texto);
  const limpaComTsc = /(^|\s)tsc\s/.test(texto) && /--build/.test(texto) && /--clean/.test(texto);
  return removeComRm || limpaComTsc;
}

/** Reconhece a etapa que ESCREVE em `dist/_tests`. */
function ehEtapaQueCompila(etapa: string): boolean {
  return (
    /(^|\s)tsc(\s|$)/.test(etapa) &&
    etapa.includes(`--outDir ${DIRETORIO_DE_TESTES_COMPILADOS}`)
  );
}

/**
 * Quebra o comando do script nas etapas encadeadas por `&&`.
 *
 * `;` e `||` ficam de fora de propósito: etapa encadeada por `;` roda mesmo
 * depois de a anterior falhar, e uma limpeza assim não garante ordem nenhuma.
 * Se alguém escrever o script desse jeito, a etapa não é reconhecida e o portão
 * reprova, que é o desfecho certo.
 */
function etapasDo(comando: string): string[] {
  return comando.split('&&').map((parte) => parte.trim());
}

/**
 * Confere que todo script que compila para `dist/_tests` o apaga antes.
 *
 * Devolve a lista de queixas. Lista vazia é aprovação.
 */
export function conferirLimpezaDosScripts(scripts: readonly ScriptDoPacote[]): QueixaDeScript[] {
  const queixas: QueixaDeScript[] = [];
  const queCompilam = scripts.filter((script) => ehEtapaQueCompila(script.comando));

  if (queCompilam.length === 0) {
    // Falha ruidosa: se nenhum script compila para `dist/_tests`, ou o diretório
    // mudou de nome ou o script mudou de forma. Nos dois casos este portão
    // deixou de olhar o que ele foi escrito para olhar, e aprovar aqui seria
    // exatamente a confiança falsa que ele existe para impedir.
    queixas.push({
      script: '(nenhum)',
      motivo:
        `Nenhum script de package.json compila para '${DIRETORIO_DE_TESTES_COMPILADOS}'. ` +
        'Ou o diretório de saída dos testes mudou e este portão ficou cego, ou os ' +
        'scripts mudaram de forma. Atualize DIRETORIO_DE_TESTES_COMPILADOS em ' +
        'src/tools/portao-de-suite-limpa.ts junto com a mudança.',
    });
    return queixas;
  }

  for (const script of queCompilam) {
    const etapas = etapasDo(script.comando);
    const indiceDaCompilacao = etapas.findIndex(ehEtapaQueCompila);
    const indiceDaLimpeza = etapas.findIndex(ehEtapaDeLimpeza);

    if (indiceDaLimpeza === -1) {
      queixas.push({
        script: script.nome,
        motivo:
          `O script '${script.nome}' compila para '${DIRETORIO_DE_TESTES_COMPILADOS}' e ` +
          'não apaga o diretório antes. O tsc só acrescenta: teste apagado ou ' +
          'renomeado continua rodando da execução anterior, e o verde passa a valer ' +
          `por um binário sem fonte. Acrescente 'rm -rf ${DIRETORIO_DE_TESTES_COMPILADOS}' ` +
          'como primeira etapa.',
      });
      continue;
    }
    if (indiceDaLimpeza > indiceDaCompilacao) {
      queixas.push({
        script: script.nome,
        motivo:
          `O script '${script.nome}' apaga '${DIRETORIO_DE_TESTES_COMPILADOS}' DEPOIS de ` +
          'compilar. Nessa ordem a limpeza joga fora o que acabou de ser compilado ou ' +
          'não impede nada. Ela precisa vir antes do tsc.',
      });
    }
  }
  return queixas;
}

function listarArquivos(diretorio: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(diretorio);
  } catch {
    return [];
  }
  const encontrados: string[] = [];
  for (const entrada of entradas) {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) encontrados.push(...listarArquivos(caminho));
    else encontrados.push(caminho);
  }
  return encontrados;
}

export interface CompiladoOrfao {
  /** Caminho do `.js` dentro de `dist/_tests`, relativo à raiz. */
  readonly compilado: string;
  /** Caminho do `.ts` que deveria existir e não existe. */
  readonly fonteEsperado: string;
}

/**
 * Varre `dist/_tests` e devolve todo `.js` cujo `.ts` de origem não existe mais.
 *
 * Um único órfão já é motivo de reprovação: ele é, por definição, código que
 * ninguém consegue ler e que mesmo assim está sendo executado pela suíte.
 */
export function procurarCompiladosOrfaos(raiz: string): CompiladoOrfao[] {
  const saida = resolve(raiz, DIRETORIO_DE_TESTES_COMPILADOS);
  const orfaos: CompiladoOrfao[] = [];

  for (const arquivo of listarArquivos(saida)) {
    if (!arquivo.endsWith('.js')) continue;
    const relativoASaida = relative(saida, arquivo);
    const fonteEsperado = resolve(raiz, relativoASaida.replace(/\.js$/, '.ts'));
    try {
      statSync(fonteEsperado);
    } catch {
      orfaos.push({
        compilado: relative(raiz, arquivo),
        fonteEsperado: relative(raiz, fonteEsperado),
      });
    }
  }
  return orfaos;
}

export function lerScriptsDoPacote(raiz: string): ScriptDoPacote[] {
  const bruto = readFileSync(resolve(raiz, 'package.json'), 'utf8');
  const pacote: unknown = JSON.parse(bruto);
  if (typeof pacote !== 'object' || pacote === null || !('scripts' in pacote)) {
    throw new Error('package.json sem a seção `scripts`.');
  }
  const scripts: unknown = pacote.scripts;
  if (typeof scripts !== 'object' || scripts === null) {
    throw new Error('A seção `scripts` de package.json não é um objeto.');
  }
  return Object.entries(scripts as Record<string, unknown>)
    .filter((par): par is [string, string] => typeof par[1] === 'string')
    .map(([nome, comando]) => ({ nome, comando }));
}
