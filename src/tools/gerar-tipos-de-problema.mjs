/**
 * Gera `src/shared/types/generated/problem-types.ts` a partir de
 * `x-problem-types` de `api/openapi.yaml`.
 *
 * Existe porque o enum do back-end era escrito à mão ao lado do contrato, e
 * duas listas da mesma coisa divergem: foi assim que `forbidden` acabou saindo
 * com 401 em dois caminhos, empilhando "sua senha não confere", "seu token
 * venceu" e "este recurso não é seu" num tipo só.
 *
 * O arquivo gerado carrega o **status junto do tipo**, e não só o nome. É isso
 * que faz o erro anterior parar de ser representável: o status deixa de ser um
 * argumento que quem chama escolhe e passa a ser consequência do tipo.
 *
 * É `.mjs` e não `.ts` de propósito: ele roda antes de qualquer compilação, no
 * mesmo passo de `openapi-typescript`, e um gerador que precisa de build para
 * rodar não pode ser o gerador do passo de build.
 *
 * Uso: `node src/tools/gerar-tipos-de-problema.mjs [spec] [saida]`
 * Saída: 0 gerado, 1 não foi possível gerar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
// `node:process` importado, e nao o global: o ESLint deste projeto nao declara
// globais de Node para `.mjs`, e a fiacao do lint nao e deste papel.
import process from 'node:process';
import { parse as parseYaml } from 'yaml';

const SPEC_PADRAO = 'api/openapi.yaml';
const SAIDA_PADRAO = 'src/shared/types/generated/problem-types.ts';

/**
 * Lê `x-problem-types` e reprova em qualquer forma que não seja a esperada.
 *
 * Gerador que não acha o que gerar precisa falhar alto: emitir um arquivo vazio
 * faria `ProblemType` virar `never`, o build quebraria em vinte lugares e
 * ninguém olharia para a spec, que é onde o defeito estaria.
 *
 * @param {unknown} spec
 * @param {string} origem
 * @returns {{ slug: string, status: number, note?: string }[]}
 */
export function lerTiposDeProblema(spec, origem) {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new Error(`${origem} não é um documento YAML de mapa.`);
  }
  const lista = /** @type {Record<string, unknown>} */ (spec)['x-problem-types'];
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(
      `${origem} não declara \`x-problem-types\`, ou declara a lista vazia. ` +
        'Esta é a fonte do enum de erro do back-end: sem ela não há o que gerar, ' +
        'e gerar um enum vazio esconderia a ausência atrás de um erro de compilação.',
    );
  }

  const tipos = [];
  const vistos = new Set();
  for (const item of lista) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`Entrada de \`x-problem-types\` que não é mapa em ${origem}.`);
    }
    const { slug, status, note } = /** @type {Record<string, unknown>} */ (item);
    if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]*$/.test(slug)) {
      throw new Error(`\`slug\` ausente ou fora do formato em \`x-problem-types\`: ${JSON.stringify(slug)}`);
    }
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) {
      throw new Error(`\`status\` ausente ou fora da faixa de erro no tipo \`${slug}\`: ${JSON.stringify(status)}`);
    }
    if (vistos.has(slug)) {
      throw new Error(`Tipo repetido em \`x-problem-types\`: \`${slug}\`.`);
    }
    vistos.add(slug);
    tipos.push(typeof note === 'string' ? { slug, status, note } : { slug, status });
  }
  return tipos;
}

/**
 * @param {{ slug: string, status: number, note?: string }[]} tipos
 * @param {string} origem
 * @returns {string}
 */
export function renderizar(tipos, origem) {
  const largura = Math.max(...tipos.map((tipo) => tipo.slug.length)) + 3;
  const linhas = tipos.map((tipo) => {
    const chave = `  '${tipo.slug}':`.padEnd(largura + 4);
    const comentario = tipo.note === undefined ? '' : ` // ${tipo.note}`;
    return `${chave}${tipo.status},${comentario}`;
  });

  return `// GERADO por src/tools/gerar-tipos-de-problema.mjs a partir de ${origem}.
// NÃO EDITE À MÃO: a próxima geração desfaz a edição em silêncio.
//
// \`type\` é sempre \`https://{domínio}/problems/<slug>\` e o cliente decide por
// ele, nunca pelo texto. A lista é fechada no contrato: tipo novo entra lá
// antes de existir aqui.
//
// O número ao lado é o **único** status HTTP com que o tipo pode sair.

export const STATUS_DO_PROBLEMA = {
${linhas.join('\n')}
} as const;

/** União fechada dos ${tipos.length} tipos declarados no contrato. */
export type ProblemType = keyof typeof STATUS_DO_PROBLEMA;

/** O status é consequência do tipo, nunca um argumento de quem chama. */
export type StatusDoProblema<T extends ProblemType> = (typeof STATUS_DO_PROBLEMA)[T];
`;
}

function principal() {
  const [, , specArg, saidaArg] = process.argv;
  const spec = specArg ?? SPEC_PADRAO;
  const saida = saidaArg ?? SAIDA_PADRAO;

  const tipos = lerTiposDeProblema(parseYaml(readFileSync(spec, 'utf8')), spec);
  writeFileSync(saida, renderizar(tipos, spec), 'utf8');
  process.stdout.write(`${saida}: ${tipos.length} tipos de problema a partir de ${spec}\n`);
}

if (import.meta.filename === process.argv[1]) {
  try {
    principal();
  } catch (erro) {
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exit(1);
  }
}
