/**
 * Portão do registro de rota: **nenhuma rota entra pela porta dos fundos**.
 *
 * O critério 2 da BICHUS-178 pede que registrar uma rota sem que os tetos sejam
 * aplicados "não seja exprimível: ou não compila, ou o registro falha na
 * subida". Duas das três barreiras já são de tipo e de execução:
 *
 * - `defineRoute` torna a **omissão da declaração** erro de compilação;
 * - `registrarRota` exige, também por tipo, um resolvedor para cada dimensão
 *   específica declarada, e derruba a subida quando o servidor não traz o
 *   contador.
 *
 * Falta a terceira, e é esta: alguém pode chamar `app.post(...)` direto e passar
 * ao largo de tudo. O compilador não tem como proibir — `app.post` é a API do
 * framework e ela é legítima dentro de `registrar-rota.ts`. Então a proibição é
 * um portão de código-fonte, que reprova a chamada direta em qualquer outro
 * lugar de `src/`.
 *
 * ## Por que ele tira comentário antes de procurar
 *
 * Contar ocorrência de texto não é ler o que elas são. Este arquivo e
 * `aplicacao-de-teto.ts` citam `app.post(` em comentário, explicando justamente
 * o defeito que o portão fecha — um portão que reprovasse por isso obrigaria a
 * apagar a explicação para o código passar. Comentário sai antes da varredura, e
 * há um caso de controle no teste que prova que sai.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface ArquivoVarrido {
  readonly caminho: string;
  readonly conteudo: string;
}

export interface RegistroDireto {
  readonly caminho: string;
  readonly linha: number;
  readonly trecho: string;
}

/**
 * Quem pode chamar o framework direto. Um só, e o caminho é comparado por
 * componente: `startsWith` sobre texto deixaria passar um
 * `registrar-rota-antigo.ts` ao lado.
 */
export const UNICO_AUTORIZADO = path.join('src', 'shared', 'http', 'registrar-rota.ts');

const CHAMADA_DIRETA =
  /\b(?:app|servidor|instancia|fastify|server)\s*\.\s*(get|post|put|patch|delete|head|options|all|route)\s*\(/;

/**
 * Apaga comentário **e conteúdo de texto**, preservando a contagem de linhas.
 *
 * Os dois precisam sair, por motivos diferentes. Comentário, porque este arquivo
 * e `aplicacao-de-teto.ts` citam `app.post(` em prosa para explicar o defeito, e
 * um portão que reprovasse por isso obrigaria a apagar a explicação. Texto,
 * porque `"app.delete('/x')"` dentro de aspas é uma cadeia de caracteres, não
 * uma chamada — contar ocorrência com expressão regular não é ler o que ela é.
 *
 * O texto some, a quebra de linha fica: sem isso o número da linha do achado
 * apontaria para o lugar errado, e achado que aponta para a linha errada faz
 * quem lê procurar no arquivo certo e não encontrar nada.
 */
export function semComentariosNemTexto(codigo: string): string {
  let fora = '';
  let i = 0;
  let emTexto: string | undefined;

  while (i < codigo.length) {
    const atual = codigo[i] ?? '';
    const proximo = codigo[i + 1] ?? '';

    if (emTexto !== undefined) {
      if (atual === '\\') {
        fora += '  ';
        i += 2;
        continue;
      }
      if (atual === emTexto) {
        emTexto = undefined;
        fora += ' ';
        i += 1;
        continue;
      }
      fora += atual === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    if (atual === '"' || atual === "'" || atual === '`') {
      emTexto = atual;
      fora += ' ';
      i += 1;
      continue;
    }

    if (atual === '/' && proximo === '/') {
      while (i < codigo.length && codigo[i] !== '\n') i += 1;
      continue;
    }

    if (atual === '/' && proximo === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) {
        if (codigo[i] === '\n') fora += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    fora += atual;
    i += 1;
  }

  return fora;
}

/** Os achados, com arquivo e linha. Lista vazia é aprovação. */
export function varrerRegistroDireto(
  arquivos: readonly ArquivoVarrido[],
  autorizado: string = UNICO_AUTORIZADO,
): readonly RegistroDireto[] {
  const achados: RegistroDireto[] = [];
  const partesDoAutorizado = autorizado.split(/[\\/]/);

  for (const arquivo of arquivos) {
    const partes = arquivo.caminho.split(/[\\/]/);
    const ehAutorizado =
      partes.length >= partesDoAutorizado.length &&
      partesDoAutorizado.every(
        (parte, indice) => partes[partes.length - partesDoAutorizado.length + indice] === parte,
      );
    if (ehAutorizado) continue;

    const linhas = semComentariosNemTexto(arquivo.conteudo).split('\n');
    linhas.forEach((linha, indice) => {
      if (CHAMADA_DIRETA.test(linha)) {
        achados.push({ caminho: arquivo.caminho, linha: indice + 1, trecho: linha.trim() });
      }
    });
  }

  return achados;
}

/** Todo `.ts` de um diretório, recursivo. `node_modules` e `dist` fora. */
export function lerArvore(raiz: string): readonly ArquivoVarrido[] {
  const arquivos: ArquivoVarrido[] = [];

  const percorrer = (diretorio: string): void => {
    for (const nome of readdirSync(diretorio)) {
      if (nome === 'node_modules' || nome === 'dist' || nome.startsWith('.')) continue;
      const caminho = path.join(diretorio, nome);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
        continue;
      }
      if (nome.endsWith('.ts')) {
        arquivos.push({ caminho, conteudo: readFileSync(caminho, 'utf8') });
      }
    }
  };

  percorrer(raiz);
  return arquivos;
}
