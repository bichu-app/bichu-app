/**
 * Portão: o enum de erro do back-end não pode divergir de `x-problem-types`.
 *
 * A geração (`src/tools/gerar-tipos-de-problema.mjs`) resolve o caso em que
 * alguém roda o gerador. Ela **não** resolve o caso que custa caro: o contrato
 * muda e ninguém gera. Aí o arquivo versionado continua compilando, continua
 * parecendo certo, e responde com o status de ontem.
 *
 * Por isso este arquivo lê o contrato **de novo**, por conta própria, e compara
 * com a tabela que o código de fato usa. A releitura independente é a razão de
 * ele existir: um portão que reaproveitasse o leitor do gerador concordaria com
 * o gerador mesmo quando os dois estivessem errados.
 *
 * Três coisas que ele reprova, e a terceira é a que costuma faltar:
 *
 * 1. tipo no contrato que não está no código, e vice-versa;
 * 2. tipo cujo status difere entre os dois;
 * 3. **contrato sem `x-problem-types`**. Verificação que não consegue verificar
 *    precisa reprovar, nunca aprovar: uma lista ausente lida como "nenhuma
 *    divergência" seria confiança falsa, que é pior que nenhuma verificação.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { STATUS_DO_PROBLEMA } from '../shared/types/generated/problem-types.js';

export interface DivergenciaDeTipo {
  readonly slug: string;
  readonly motivo: 'ausente-no-codigo' | 'ausente-no-contrato' | 'status-diferente';
  readonly detalhe: string;
}

/** Tabela do código, na forma em que o portão a compara. */
export type TabelaDeStatus = Readonly<Record<string, number>>;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Extrai `x-problem-types` da especificação já carregada.
 *
 * Lança quando a lista não existe, está vazia ou traz entrada malformada. Lançar
 * e não devolver lista vazia é deliberado: lista vazia comparada com um código
 * vazio daria "nenhuma divergência" para um contrato quebrado.
 */
export function tabelaDoContrato(spec: unknown, origem: string): TabelaDeStatus {
  if (!ehObjeto(spec)) {
    throw new Error(`${origem} não é um documento YAML de mapa, então não há contrato para conferir.`);
  }
  const lista = spec['x-problem-types'];
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(
      `${origem} não declara \`x-problem-types\`, ou declara a lista vazia. ` +
        'Sem ela não existe com o que comparar o enum do back-end, e uma conferência ' +
        'que não consegue conferir precisa reprovar em vez de passar.',
    );
  }

  const tabela: Record<string, number> = {};
  for (const item of lista) {
    if (!ehObjeto(item)) {
      throw new Error(`Entrada de \`x-problem-types\` que não é mapa em ${origem}.`);
    }
    const slug = item['slug'];
    const status = item['status'];
    if (typeof slug !== 'string' || slug === '') {
      throw new Error(`Entrada de \`x-problem-types\` sem \`slug\` em ${origem}.`);
    }
    if (typeof status !== 'number' || !Number.isInteger(status)) {
      throw new Error(`Tipo \`${slug}\` sem \`status\` inteiro em ${origem}.`);
    }
    if (slug in tabela) {
      throw new Error(`Tipo repetido em \`x-problem-types\`: \`${slug}\`.`);
    }
    tabela[slug] = status;
  }
  return tabela;
}

/** Compara as duas tabelas e devolve toda divergência encontrada. */
export function conferir(contrato: TabelaDeStatus, codigo: TabelaDeStatus): DivergenciaDeTipo[] {
  const divergencias: DivergenciaDeTipo[] = [];

  for (const [slug, statusDoContrato] of Object.entries(contrato)) {
    const statusDoCodigo = codigo[slug];
    if (statusDoCodigo === undefined) {
      divergencias.push({
        slug,
        motivo: 'ausente-no-codigo',
        detalhe: `o contrato declara \`${slug}\` (${statusDoContrato}) e o código não o tem`,
      });
      continue;
    }
    if (statusDoCodigo !== statusDoContrato) {
      divergencias.push({
        slug,
        motivo: 'status-diferente',
        detalhe: `\`${slug}\`: contrato ${statusDoContrato}, código ${statusDoCodigo}`,
      });
    }
  }

  for (const slug of Object.keys(codigo)) {
    if (!(slug in contrato)) {
      divergencias.push({
        slug,
        motivo: 'ausente-no-contrato',
        detalhe: `o código tem \`${slug}\` e o contrato não o declara`,
      });
    }
  }

  return divergencias.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Lê a spec do disco e confere contra a tabela gerada que o código usa. */
export function conferirContraOContrato(caminhoDaSpec: string): DivergenciaDeTipo[] {
  const spec: unknown = parseYaml(readFileSync(caminhoDaSpec, 'utf8'));
  return conferir(tabelaDoContrato(spec, caminhoDaSpec), STATUS_DO_PROBLEMA);
}
