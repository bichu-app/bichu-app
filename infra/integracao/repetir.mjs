#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs` e de
// `infra/integracao/*.mjs`: o ESLint deste repositorio nao declara os globais
// de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovariam em `no-undef`.
/**
 * REPETIR A SUITE DE INTEGRACAO, FORA DO CAMINHO CRITICO.
 *
 *   node infra/integracao/repetir.mjs --vezes 20 --livro <arquivo.jsonl> [--rotulo <texto>]
 *
 * =========================================================================
 * POR QUE 20, E O QUE 20 COMPRA
 * =========================================================================
 * Medido em 22/09, na propria suite: 4 reprovacoes em 31 execucoes, 12,9% --
 * uma em cada oito. A causa era impasse de cadeado, nao relogio: um
 * `alter table ... drop constraint` toma cadeado exclusivo nas DUAS tabelas da
 * chave estrangeira, e os quinze arquivos de `tests/integration/` rodam em
 * paralelo contra o mesmo banco.
 *
 * Com taxa p, N execucoes independentes deixam passar `(1-p)^N`. Para
 * p = 0,129:
 *
 *   N = 10  ->  25,5% de passar batido
 *   N = 20  ->   6,5%  (93,5% de confianca)
 *   N = 30  ->   1,7%
 *
 * 20 e o ponto em que o custo ainda cabe num job agendado e a confianca chega a
 * ~94%. Dobrar para 40 compraria 3 pontos percentuais por mais 6 minutos.
 *
 * =========================================================================
 * E O QUE 20 **NAO** COMPRA -- LEIA ANTES DE CONFIAR
 * =========================================================================
 * A mesma conta responde pelo outro lado, e a resposta e desconfortavel: para
 * p = 0,012 (a taxa do caso unitario `nada correlaciona codigos emitidos em
 * sequencia`, 12 em 1000), 20 execucoes deixam passar 78,5%. Pegar 1,2% com 95%
 * exigiria 250 execucoes, que na suite unitaria sao 64 minutos.
 *
 * Repeticao e a ferramenta certa para CONCORRENCIA e a errada para
 * ESTATISTICA. Para a segunda classe existe
 * `infra/verificacao/verificar-sorteio-sem-semente.mjs`, que custa ~0 e le em
 * vez de medir -- e que e raso, como o cabecalho dele diz.
 *
 * =========================================================================
 * CADA REPETICAO E UMA PILHA NOVA, E ISSO E DE PROPOSITO
 * =========================================================================
 * `npm run test:integration` sobe uma pilha efemera, migra do zero e a derruba
 * com `-v`. Reaproveitar a pilha entre as repeticoes seria mais rapido e mediria
 * outra coisa: o impasse de cadeado de 22/09 aparece na corrida entre os quinze
 * arquivos contra um banco RECEM-MIGRADO, e um banco ja aquecido pela repeticao
 * anterior nao e o mesmo banco.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { registrarExecucao } from '../suite/acumular-reprovados.mjs';
import { casosQueReprovaram, placarDoTap } from '../suite/casos-reprovados.mjs';

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

function bandeira(nome, padrao = undefined) {
  const argv = process.argv.slice(2);
  const indice = argv.indexOf(`--${nome}`);
  if (indice === -1) return padrao;
  const valor = argv[indice + 1];
  if (valor === undefined || valor.startsWith('--')) morrer(`\`--${nome}\` exige um valor.`);
  return valor;
}

const vezes = Number.parseInt(bandeira('vezes', '20'), 10);
const livro = bandeira('livro');
const rotuloBase = bandeira('rotulo', 'repeticao');
const diretorioDoPlacar = bandeira('placar', 'placar');

if (!Number.isInteger(vezes) || vezes < 1) morrer('`--vezes` precisa ser um inteiro positivo.');
if (livro === undefined) morrer('`--livro` e obrigatorio: a repeticao existe para alimentar o acumulado.');

const TAP = join(diretorioDoPlacar, 'integracao.tap');

const inicio = Date.now();
let comFalha = 0;
/** @type {Map<string, number>} */
const porCaso = new Map();

for (let i = 1; i <= vezes; i += 1) {
  // O TAP da repeticao ANTERIOR precisa sumir antes desta. Sem isto, uma
  // execucao que morresse antes de escrever o relatorio faria o registro ler o
  // arquivo da anterior e anotar o resultado dela DUAS vezes -- e o livro
  // passaria a mentir para menos, que e o pior sentido.
  if (existsSync(TAP)) rmSync(TAP);

  const antes = Date.now();
  const execucao = spawnSync('npm', ['run', 'test:integration', '--', '--placar', diretorioDoPlacar], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  const duracao = ((Date.now() - antes) / 1000).toFixed(1);

  if (!existsSync(TAP)) {
    // Verificacao que nao consegue verificar REPROVA. A repeticao existe para
    // contar reprovacao; contar errado e pior do que nao contar.
    morrer(
      `a repeticao ${String(i)} de ${String(vezes)} nao produziu relatorio TAP em ${TAP}. ` +
        'A pilha morreu antes da suite, e esta repeticao nao pode ser registrada nem como verde ' +
        'nem como vermelha. Ver a saida acima.',
    );
  }

  const conteudo = readFileSync(TAP, 'utf8');
  const { total } = placarDoTap(conteudo);
  if (total === undefined) morrer(`a repeticao ${String(i)} produziu TAP sem placar.`);

  const casos = casosQueReprovaram(conteudo);
  registrarExecucao({
    livro,
    suite: 'integracao',
    rotulo: `${rotuloBase} ${String(i)}/${String(vezes)}`,
    casos,
  });

  if (casos.length > 0 || execucao.status !== 0) comFalha += 1;
  for (const caso of casos) porCaso.set(caso, (porCaso.get(caso) ?? 0) + 1);

  console.log(
    `\n[repeticao ${String(i)}/${String(vezes)}] ${String(total)} casos, ` +
      `${String(casos.length)} reprovaram, ${duracao}s\n`,
  );
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
const taxa = ((comFalha / vezes) * 100).toFixed(1);

const resumo = [
  '### repeticao da suite de integracao',
  '',
  `${String(vezes)} execucoes em ${minutos} min. **${String(comFalha)} reprovaram (${taxa}%)**.`,
  '',
];
if (porCaso.size === 0) {
  resumo.push(
    'Nenhum caso reprovou. Com 20 execucoes isto descarta uma taxa de 12,9% com ~94% de ' +
      'confianca, e NAO descarta uma de 1,2% (20 execucoes deixam passar 78,5% delas).',
    '',
  );
} else {
  resumo.push('| reprovou em | caso |', '|---:|---|');
  for (const [caso, quantas] of [...porCaso.entries()].sort((a, b) => b[1] - a[1])) {
    resumo.push(`| ${String(quantas)}/${String(vezes)} | \`${caso}\` |`);
  }
  resumo.push('');
}
console.log(resumo.join('\n'));

if (comFalha > 0) {
  console.error(
    `\nREPROVADO: ${String(comFalha)} de ${String(vezes)} repeticoes reprovaram. Os casos estao ` +
      'nomeados acima e no livro. Reprovacao intermitente nao e ruido: e a suite deixando de ' +
      'significar alguma coisa.\n',
  );
  process.exit(1);
}
console.log(`repeticao APROVADA: ${String(vezes)} execucoes seguidas, nenhuma reprovou`);
