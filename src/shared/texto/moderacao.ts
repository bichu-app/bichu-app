/**
 * A MODERACAO DE PALAVRAS dos textos que a comunidade escreve sobre profissionais:
 * a **indicacao** (`suggestDirectoryEntry`) e a **recomendacao** com nota e texto
 * (`putMyDirectoryEntryReview`).
 */
import type { ProblemFieldError } from '../http/problem.js';
import { EXCECOES, PALAVRAS_RECUSADAS } from './lista-de-moderacao.js';

/** O `code` da recusa. */
export const CODIGO_DA_MODERACAO = 'inappropriate_language';

/**
 * A mensagem. **Sem a palavra**, sem a lista, sem acusacao -- e dizendo o que
 * fazer.
 */
export const MENSAGEM_DA_MODERACAO =
  'Reescreva sem ofensa. Este texto vai aparecer para a comunidade, e aqui não ' +
  'entra palavra ofensiva, xingamento nem termo que discrimine alguém. Conte o que ' +
  'achou do atendimento com suas palavras: crítica negativa pode, ofensa não.';

/** Invisivel que se usa para partir uma palavra no meio sem a tela mostrar. */
const INVISIVEL = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/gu;

/** As trocas de caractere obvias. */
const IMITA_LETRA: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
};

/** Separador que alguem poe DENTRO da palavra para quebra-la: `p.u.t.a`, `foda-se`. */
const SEPARADOR_INTERNO = /(?<=[a-z0-9])[.\-_*'`/|]+(?=[a-z0-9])/g;

/**
 * Tres ou mais caracteres soltos com o MESMO separador entre eles viram uma
 * palavra.
 */
const SOLTOS = /(?<![a-z0-9])([a-z0-9])([\s.\-_*/|]+)(?:[a-z0-9]\2){1,}[a-z0-9](?![a-z0-9])/g;

/**
 * O texto na forma em que a lista e comparada: sem acento, sem maiuscula, sem
 * invisivel, sem troca de caractere, sem letra repetida e sem separador no meio da
 * palavra.
 */
export function normalizarParaModeracao(texto: string): string {
  const semAcento = texto
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(INVISIVEL, '')
    .toLowerCase();
  const juntado = semAcento
    .replace(SOLTOS, (m) => m.replace(/[^a-z0-9]/g, ''))
    .replace(SEPARADOR_INTERNO, '');
  const semImitacao = juntado.replace(/[a-z0-9@$]+/g, (palavra) =>
    /[a-z]/.test(palavra) ? palavra.replace(/[013457@$]/g, (c) => IMITA_LETRA[c] ?? c) : palavra,
  );
  return semImitacao.replace(/([a-z0-9])\1+/g, '$1');
}

/** Os tokens do texto normalizado. */
function tokens(normalizado: string): string[] {
  return normalizado.split(/[^a-z0-9]+/).filter((t) => t !== '');
}

/** O conjunto, com o plural em `s` resolvido na comparacao e nao na lista. */
function contem(conjunto: ReadonlySet<string>, token: string): boolean {
  if (conjunto.has(token)) return true;
  return token.endsWith('s') && conjunto.has(token.slice(0, -1));
}

/** As duas listas entram **ja normalizadas**, e isto nao e detalhe. */
const RECUSADAS = new Set(PALAVRAS_RECUSADAS.map((p) => normalizarParaModeracao(p)));
const PERMITIDAS = new Set(EXCECOES.map((p) => normalizarParaModeracao(p)));

/** Verdadeiro quando o texto tem palavra recusada. */
export function temPalavraRecusada(valor: string): boolean {
  return tokens(normalizarParaModeracao(valor)).some(
    (token) => !contem(PERMITIDAS, token) && contem(RECUSADAS, token),
  );
}

/**
 * A INTERFACE DO MODULO: os erros de campo de um texto livre, prontos para entrar
 * no `400` junto com os outros.
 */
export function errosDeModeracao(campo: string, valor: string): ProblemFieldError[] {
  if (!temPalavraRecusada(valor)) return [];
  return [{ field: campo, code: CODIGO_DA_MODERACAO, message: MENSAGEM_DA_MODERACAO }];
}
