import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DIMENSAO_MINIMA,
  recusarDimensaoDeclaradaPequena,
} from '../modules/media/ports/imagem-de-catalogo.js';

const FONTE = 'src/modules/media/ports/imagem-de-catalogo.ts';

const ESTE_ARQUIVO = 'src/tools/dimensao-declarada-numa-fonte-so.test.ts';

const FRASE = /Mínimo de \$\{String\(/;

function montaARecusaNaMao(texto: string): boolean {
  return /dimensaoDeclaradaAbaixoDaMinima\(/.test(texto) && /DIMENSAO_MINIMA\[/.test(texto);
}

function todosOsFontes(raiz: string): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'generated' || entrada.name === 'node_modules') continue;
      achados.push(...todosOsFontes(caminho));
    } else if (entrada.name.endsWith('.ts')) {
      achados.push(caminho);
    }
  }
  return achados;
}

void describe('a recusa de dimensão declarada pequena tem uma fonte só', () => {
  const fontes = todosOsFontes('src');

  void it('a varredura alcança a árvore de verdade, e não uma lista vazia', () => {
    assert.ok(fontes.length > 300, `a varredura achou só ${String(fontes.length)} arquivos`);
    assert.ok(fontes.includes(FONTE), `a fonte ${FONTE} não está na varredura`);
    assert.ok(fontes.includes(ESTE_ARQUIVO), `a exclusão aponta para ${ESTE_ARQUIVO}, que não existe`);
  });

  void it('só a fonte monta a frase `Mínimo de N pixels.`', () => {
    const outros = fontes
      .filter((f) => f !== FONTE && f !== ESTE_ARQUIVO)
      .filter((f) => FRASE.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      outros,
      [],
      'a frase que o usuário lê voltou a ser montada fora da fonte. Chame ' +
        '`recusarDimensaoDeclaradaPequena` em vez de copiar: foram CINCO cópias em 21/10/2026.',
    );
  });

  void it('só a fonte junta `dimensaoDeclaradaAbaixoDaMinima` com `DIMENSAO_MINIMA[`', () => {
    const outros = fontes
      .filter((f) => f !== FONTE && f !== ESTE_ARQUIVO)
      .filter((f) => montaARecusaNaMao(readFileSync(f, 'utf8')));
    assert.deepEqual(outros, [], 'o bloco da recusa foi remontado fora da fonte');
  });

  void it('a recusa sai com o campo, o código e a frase, para os SETE propósitos', () => {
    for (const [purpose, minima] of Object.entries(DIMENSAO_MINIMA)) {
      assert.throws(
        () =>
          recusarDimensaoDeclaradaPequena(
            purpose as keyof typeof DIMENSAO_MINIMA,
            minima.largura - 1,
            minima.altura - 1,
          ),
        (erro: unknown) => {
          const problema = erro as {
            problemType?: string;
            errors?: readonly { field: string; code: string; message: string }[];
          };
          assert.equal(problema.problemType, 'image-too-small', `propósito ${purpose}`);
          assert.deepEqual(
            problema.errors,
            [
              { field: 'width', code: 'minimum', message: `Mínimo de ${String(minima.largura)} pixels.` },
              { field: 'height', code: 'minimum', message: `Mínimo de ${String(minima.altura)} pixels.` },
            ],
            `propósito ${purpose}`,
          );
          return true;
        },
        `propósito ${purpose} não recusou a dimensão abaixo da mínima`,
      );
    }
  });

  void it('dimensão na mínima, acima dela e ausente NÃO são recusadas', () => {
    for (const [purpose, minima] of Object.entries(DIMENSAO_MINIMA)) {
      const p = purpose as keyof typeof DIMENSAO_MINIMA;
      recusarDimensaoDeclaradaPequena(p, minima.largura, minima.altura);
      recusarDimensaoDeclaradaPequena(p, minima.largura + 1, minima.altura + 1);
      recusarDimensaoDeclaradaPequena(p, undefined, undefined);
    }
  });
});
