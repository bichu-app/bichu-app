/**
 * O schema de corpo do contrato tem **uma fonte só**, e esta é a guarda.
 *
 * ## O que foi medido, e por que uma guarda em vez de confiança
 *
 * Em 21/10/2026, sobre `f60ba3fc`, `corpoDe` estava declarada **29 vezes** --
 * uma em cada arquivo de rotas -- com **três redações** da mesma mensagem de
 * erro: 19 iguais, 9 iguais em execução mas diferentes no arquivo (aspa simples
 * no lugar do acento grave) e 1, em `admin-session-routes.ts`, com outra frase,
 * sem acentos e sem a parte que diz o que fazer. As três concordavam no que
 * FAZEM e discordavam no que DIZEM.
 *
 * A redução a uma fonte (`shared/http/contract.ts`) não se defende sozinha: o
 * arquivo de rotas número 30 nasce de uma cópia do 29, e a função local
 * compila, sombreia o importe e ninguém vê. Foi assim que chegaram a 29.
 *
 * **Esta guarda não mede comportamento nenhum** -- ela mede que a fonte
 * continua sendo uma. Quem mede o comportamento é cada suíte de rotas, que
 * deixa de validar corpo se `corpoDe` devolver o schema errado.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/** A declaração que não pode voltar a existir fora da fonte. */
const DECLARACAO_LOCAL = /\bfunction\s+corpoDe\s*\(\s*contrato\s*:\s*Contrato\b/;

/** A fonte. O caminho é literal de propósito: renomear o arquivo reprova aqui. */
const FONTE = 'src/shared/http/contract.ts';

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

void describe('o schema de corpo do contrato tem uma fonte só', () => {
  const fontes = todosOsFontes('src');

  void it('a varredura alcança a árvore de verdade, e não uma lista vazia', () => {
    // Controle POSITIVO. Sem ele, um caminho errado faria os dois casos abaixo
    // passarem por não ter achado nada -- aprovação por omissão, que é como
    // portão deste repositório já ficou verde sem medir.
    assert.ok(fontes.length > 300, `a varredura achou só ${String(fontes.length)} arquivos`);
    assert.ok(fontes.includes(FONTE), `a fonte ${FONTE} não está na varredura`);
  });

  void it('a fonte declara `corpoDe`, e a declara EXPORTADA', () => {
    const texto = readFileSync(FONTE, 'utf8');
    assert.match(
      texto,
      /export function corpoDe\(contrato: Contrato, operationId: string\)/,
      `${FONTE} deixou de exportar \`corpoDe\`: os arquivos de rotas importam daqui`,
    );
  });

  void it('nenhum outro arquivo declara `corpoDe` por conta própria', () => {
    const reincidentes = fontes
      .filter((f) => f !== FONTE)
      .filter((f) => DECLARACAO_LOCAL.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      reincidentes,
      [],
      'declaração local de `corpoDe` voltou a existir. Importe de ' +
        `${FONTE} em vez de copiar: foi a cópia que produziu as 29 e as três redações.`,
    );
  });
});
