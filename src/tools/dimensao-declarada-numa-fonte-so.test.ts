/**
 * A recusa de dimensao declarada pequena tem **uma fonte so**, e esta e a guarda.
 *
 * ## O que foi medido
 *
 * Em 21/10/2026, sobre `f60ba3fc`, o bloco que recusa a dimensao DECLARADA
 * abaixo da minima estava escrito **cinco vezes**:
 *
 * - `media/application/capa-de-encontro-da-comunidade.ts` (`network_event`)
 * - `media/application/foto-do-proprio-usuario.ts` (`user_photo`)
 * - `publications/application/mural-service.ts` (`user_publication`)
 * - `showcase/application/vitrine-de-fotos-service.ts` (`user_showcase`)
 * - `store/application/catalogo-administrativo.ts` (`corpo.purpose`)
 *
 * Normalizando so a expressao do proposito, as cinco eram identicas em
 * execucao. Dentro do bloco esta a FRASE que o usuario le (`Mínimo de N
 * pixels.`) e o CODIGO de campo (`minimum`) que o app usa para decidir onde
 * pintar o erro -- ou seja, nao e duplicacao de enfeite: e a mesma mensagem de
 * usuario em cinco arquivos, que foi exatamente como o rotulo do selo chegou a
 * cinco redacoes.
 *
 * ## Este arquivo mora em `src/tools/` porque le o disco
 *
 * O `eslint` deste repositorio recusa `node:fs` em `domain/` e `application/`,
 * e com razao. Os portoes que leem arquivo de fonte moram aqui -- e a
 * conferencia da fonte unica so pode ser feita lendo a fonte.
 *
 * **Nenhum portao existente de `src/tools/` foi tocado para acrescentar este.**
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DIMENSAO_MINIMA,
  recusarDimensaoDeclaradaPequena,
} from '../modules/media/ports/imagem-de-catalogo.js';

/** A fonte. Caminho literal: renomear o arquivo reprova aqui, e nao em silencio. */
const FONTE = 'src/modules/media/ports/imagem-de-catalogo.ts';

/**
 * ESTE arquivo, excluido das duas varreduras -- e a exclusao e UMA, nomeada, e
 * conferida pelo controle positivo abaixo.
 *
 * Ele cita a frase e o bloco para poder procura-los, entao sem isto a guarda
 * acusa a si mesma. Medido: foi o que aconteceu na primeira execucao. A
 * exclusao e por caminho, e nao por "ignore arquivos de teste" -- uma regra
 * larga assim abriria o buraco para QUALQUER `*.test.ts` remontar o bloco.
 */
const ESTE_ARQUIVO = 'src/tools/dimensao-declarada-numa-fonte-so.test.ts';

/** A frase do usuario. Quem a montar fora da fonte reprova. */
const FRASE = /Mínimo de \$\{String\(/;

/** O bloco que foi reduzido: `dimensaoDeclaradaAbaixoDaMinima` + `DIMENSAO_MINIMA[` juntos. */
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
    // Controle POSITIVO: sem ele, caminho errado aprovaria por omissão.
    assert.ok(fontes.length > 300, `a varredura achou só ${String(fontes.length)} arquivos`);
    assert.ok(fontes.includes(FONTE), `a fonte ${FONTE} não está na varredura`);
    // A exclusao de si mesmo so e legitima enquanto ela nomear um arquivo que
    // EXISTE: renomeado, ela viraria um `filter` que nao tira nada e a guarda
    // voltaria a acusar a si mesma -- ou, pior, passaria a ignorar nada.
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
    // A frase sozinha não basta: alguém pode remontar o bloco com outra
    // redação, que é a divergência -- e é ela que esta conferência pega.
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
