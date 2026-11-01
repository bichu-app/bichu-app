import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { optionalEnv } from '../config/env.js';

export interface IdentidadeDoArtefato {
  /** Resumo do conteúdo do artefato, 16 dígitos hexadecimais. */
  readonly artifact: string;
  /** Commit declarado em `BUILD_COMMIT`, ou `null` quando ninguém declarou. */
  readonly commit: string | null;
}

const ARVORES = [{ caminho: 'dist', extensao: '.js' }] as const;
const ARQUIVOS = ['api/openapi.yaml', 'package.json'] as const;

function ehRascunho(nome: string): boolean {
  return nome.startsWith('_');
}

/** Erro de subida: o processo não consegue dizer o que ele é. */
export class ArtefatoIlegivel extends Error {}

function arquivosDaArvore(raizDaArvore: string, extensao: string): string[] {
  let entradas;
  try {
    entradas = readdirSync(raizDaArvore, { withFileTypes: true });
  } catch (erro) {
    throw new ArtefatoIlegivel(
      `não consegui ler ${raizDaArvore} para calcular a identidade do artefato: ${String(erro)}`,
    );
  }
  const encontrados: string[] = [];
  for (const entrada of entradas) {
    const completo = join(raizDaArvore, entrada.name);
    if (entrada.isDirectory()) {
      if (ehRascunho(entrada.name)) continue;
      encontrados.push(...arquivosDaArvore(completo, extensao));
    } else if (entrada.isFile() && entrada.name.endsWith(extensao)) {
      encontrados.push(completo);
    }
  }
  return encontrados;
}

/**
 * Raiz da aplicação deduzida da posição deste módulo compilado
 * (`dist/shared/artefato/identidade-do-artefato.js` -> três níveis acima).
 */
export function raizDaAplicacao(): string {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

/** Resumo do conteúdo do artefato. */
export function resumirArtefato(raiz: string): string {
  const caminhos: string[] = [];
  for (const { caminho, extensao } of ARVORES) {
    caminhos.push(...arquivosDaArvore(join(raiz, caminho), extensao));
  }
  for (const caminho of ARQUIVOS) {
    const completo = join(raiz, caminho);
    try {
      if (!statSync(completo).isFile()) throw new Error('não é arquivo');
    } catch (erro) {
      throw new ArtefatoIlegivel(
        `${caminho} faz parte da identidade do artefato e não pôde ser lido em ${raiz}: ` +
          `${String(erro)}`,
      );
    }
    caminhos.push(completo);
  }

  if (caminhos.length === 0) {
    throw new ArtefatoIlegivel(
      `nenhum arquivo encontrado para a identidade do artefato em ${raiz}: o resumo seria o ` +
        'mesmo em qualquer build',
    );
  }

  const total = createHash('sha256');
  for (const completo of caminhos.map((c) => relative(raiz, c)).sort()) {
    const conteudo = readFileSync(join(raiz, completo));
    total.update(completo.split(sep).join('/'));
    total.update('\0');
    total.update(createHash('sha256').update(conteudo).digest());
    total.update('\n');
  }
  return total.digest('hex').slice(0, 16);
}

/** `BUILD_COMMIT` conferido na forma. */
export function lerCommitDeclarado(
  ler: (nome: string) => string | undefined = optionalEnv,
): string | null {
  const bruto = ler('BUILD_COMMIT');
  if (bruto === undefined) return null;
  const limpo = bruto.trim();
  if (!/^[0-9a-f]{7,40}$/.test(limpo)) {
    throw new ArtefatoIlegivel(
      `BUILD_COMMIT não parece um commit: esperado de 7 a 40 dígitos hexadecimais minúsculos, ` +
        `veio ${JSON.stringify(bruto)}. Deixe a variável ausente em vez de preenchê-la com ` +
        'qualquer coisa: `null` é honesto, um valor inventado não é',
    );
  }
  return limpo;
}

export function identidadeDoArtefato(raiz: string = raizDaAplicacao()): IdentidadeDoArtefato {
  return { artifact: resumirArtefato(raiz), commit: lerCommitDeclarado() };
}
