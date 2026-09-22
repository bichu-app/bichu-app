#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs` e de
// `infra/integracao/*.mjs`: o ESLint deste repositorio nao declara os globais
// de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovariam em `no-undef`.
/**
 * O LIVRO DOS CASOS QUE PISCAM.
 *
 *   node infra/suite/acumular-reprovados.mjs registrar --suite <nome> --tap <arquivo> \
 *        --livro <arquivo.jsonl> [--rotulo <texto>]
 *   node infra/suite/acumular-reprovados.mjs render --livro <arquivo.jsonl> [--topo <n>]
 *   node infra/suite/acumular-reprovados.mjs --autoteste
 *
 * =========================================================================
 * O PROBLEMA, QUE E CULTURAL E NAO TECNICO
 * =========================================================================
 * Em 22/09 a suite de integracao reprovava 1 execucao em 8 (4 em 31) por
 * impasse de cadeado, sem defeito nenhum atras. Duas coisas acontecem quando
 * isso vira rotina, e a segunda e a cara:
 *
 *   1. quem ve o vermelho roda de novo, o verde chega, e ninguem paga nada;
 *   2. no dia em que a suite reprovar COM defeito, alguem vai rodar de novo e
 *      seguir em frente, porque foi isso que funcionou das ultimas dez vezes.
 *
 * A suite de integracao e o principal mecanismo de prova deste projeto. Ela
 * perde o valor nao quando fica vermelha, mas quando ficar vermelha deixa de
 * significar alguma coisa.
 *
 * "Rodar de novo" nao custa nada porque a reprovacao EVAPORA: o relatorio
 * daquela execucao e substituido pelo da seguinte, e o caso que piscou nao
 * deixa rastro em lugar nenhum. Este arquivo tira o de graca. Ele nao impede
 * ninguem de rodar de novo -- ele faz o caso APARECER numa lista que sobrevive
 * a execucao seguinte.
 *
 * =========================================================================
 * POR QUE UMA LINHA POR EXECUCAO, INCLUSIVE QUANDO A SUITE PASSA
 * =========================================================================
 * Um livro que so anota reprovacao responde "este caso reprovou 7 vezes" e nao
 * responde "em quantas?". 7 em 9 e um defeito; 7 em 1.200 e intermitencia rara,
 * e as duas exigem respostas diferentes. Por isso toda execucao escreve uma
 * linha -- a verde com `casos: []` -- e o denominador sai do proprio livro.
 *
 * Custo: cerca de 150 bytes por execucao. O teto de `LIMITE_DE_LINHAS`
 * execucoes fica abaixo de 500 KB, e o que passa do teto cai pela frente (o
 * mais antigo primeiro). O preco esta dito: historia anterior ao teto nao
 * existe mais, e a coluna "de N execucoes" passa a contar a partir de onde o
 * livro comeca.
 *
 * =========================================================================
 * "REGISTRAR" E UM PORTAO, E NAO UM RECADO
 * =========================================================================
 * Chamar o registro e nao achar placar para ler REPROVA. Verificacao que nao
 * consegue verificar precisa reprovar, nunca aprovar: um livro que pula
 * execucao em silencio e pior que livro nenhum, porque o denominador fica
 * errado e a piscada da execucao pulada desaparece exatamente como desaparecia
 * antes de o livro existir.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { autoteste as autotesteDaLeitura, casosQueReprovaram, placarDoTap } from './casos-reprovados.mjs';

/**
 * Teto de execucoes guardadas. O livro e um JSONL e o corte e pela frente.
 * 2000 execucoes de um job diario de 20 repeticoes sao cerca de 100 dias.
 */
const LIMITE_DE_LINHAS = 2000;

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

/** `--nome valor`. `undefined` quando a bandeira nao veio. */
function bandeira(argv, nome) {
  const indice = argv.indexOf(`--${nome}`);
  if (indice === -1) return undefined;
  const valor = argv[indice + 1];
  if (valor === undefined || valor.startsWith('--')) morrer(`\`--${nome}\` exige um valor.`);
  return valor;
}

/**
 * Le o livro. Linha corrompida NAO e descartada em silencio: ela vira uma
 * execucao anonima, para o denominador continuar certo, e e contada no
 * relatorio.
 *
 * @param {string} caminho
 */
export function lerLivro(caminho) {
  if (!existsSync(caminho)) return { execucoes: [], ilegiveis: 0 };
  const execucoes = [];
  let ilegiveis = 0;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    if (linha.trim() === '') continue;
    try {
      const registro = JSON.parse(linha);
      execucoes.push({
        quando: typeof registro.quando === 'string' ? registro.quando : '?',
        suite: typeof registro.suite === 'string' ? registro.suite : '?',
        rotulo: typeof registro.rotulo === 'string' ? registro.rotulo : '',
        casos: Array.isArray(registro.casos) ? registro.casos.filter((c) => typeof c === 'string') : [],
      });
    } catch {
      ilegiveis += 1;
      execucoes.push({ quando: '?', suite: '?', rotulo: '(linha ilegivel)', casos: [] });
    }
  }
  return { execucoes, ilegiveis };
}

/**
 * Acrescenta UMA execucao ao livro e devolve o registro escrito.
 *
 * Append, e nunca sobrescrita: e esta a propriedade inteira. Um livro que
 * guardasse so a ultima execucao responderia "nada reprovou" no dia seguinte a
 * uma piscada, que e precisamente o comportamento que se quer acabar.
 *
 * @param {{livro: string, suite: string, rotulo: string, casos: string[], quando?: string}} entrada
 */
export function registrarExecucao({ livro, suite, rotulo, casos, quando }) {
  const registro = {
    quando: quando ?? new Date().toISOString(),
    suite,
    rotulo,
    casos,
  };
  const { execucoes } = lerLivro(livro);
  const anteriores = execucoes.map((e) => JSON.stringify(e));
  const todas = [...anteriores, JSON.stringify(registro)].slice(-LIMITE_DE_LINHAS);
  mkdirSync(dirname(livro), { recursive: true });
  writeFileSync(livro, `${todas.join('\n')}\n`);
  return registro;
}

/**
 * Agrega o livro por caso: quantas execucoes o viram reprovar, de quantas.
 *
 * @param {string} caminho
 * @param {string|undefined} suite filtra por suite; `undefined` conta todas
 */
export function agregar(caminho, suite = undefined) {
  const { execucoes, ilegiveis } = lerLivro(caminho);
  const consideradas = suite === undefined ? execucoes : execucoes.filter((e) => e.suite === suite);
  /** @type {Map<string, {vezes: number, primeira: string, ultima: string}>} */
  const porCaso = new Map();
  for (const execucao of consideradas) {
    for (const caso of new Set(execucao.casos)) {
      const atual = porCaso.get(caso);
      if (atual === undefined) porCaso.set(caso, { vezes: 1, primeira: execucao.quando, ultima: execucao.quando });
      else {
        atual.vezes += 1;
        atual.ultima = execucao.quando;
      }
    }
  }
  const linhas = [...porCaso.entries()]
    .map(([caso, dados]) => ({ caso, ...dados }))
    .sort((a, b) => b.vezes - a.vezes || a.caso.localeCompare(b.caso));
  return { execucoes: consideradas.length, linhas, ilegiveis };
}

/**
 * O relatorio em Markdown, que e o que o `$GITHUB_STEP_SUMMARY` renderiza.
 *
 * O cabecalho traz o numero ANTES da tabela de proposito: quem abre a execucao
 * de um PR le uma linha e ja sabe se ha caso piscando, sem precisar querer
 * saber.
 */
export function renderizar(caminho, { suite = undefined, topo = 25 } = {}) {
  const { execucoes, linhas, ilegiveis } = agregar(caminho, suite);
  const titulo = suite === undefined ? 'casos que ja reprovaram' : `casos que ja reprovaram (${suite})`;
  const saida = [`### ${titulo}`, ''];

  if (execucoes === 0) {
    saida.push('O livro esta vazio: nenhuma execucao registrada ainda.', '');
    return saida.join('\n');
  }

  if (linhas.length === 0) {
    saida.push(
      `Nenhum caso reprovou em ${String(execucoes)} execucao(oes) registrada(s). ` +
        'Suite verde nao gera ruido aqui.',
      '',
    );
    return saida.join('\n');
  }

  saida.push(
    `**${String(linhas.length)} caso(s)** reprovaram pelo menos uma vez em ` +
      `**${String(execucoes)} execucao(oes)** registrada(s). Um caso que reprova hoje e passa ` +
      'amanha continua nesta lista: ela e acrescimo, nunca substituicao.',
    '',
    '| reprovou em | taxa | caso | primeira | ultima |',
    '|---:|---:|---|---|---|',
  );
  for (const linha of linhas.slice(0, topo)) {
    const taxa = ((linha.vezes / execucoes) * 100).toFixed(2);
    saida.push(
      `| ${String(linha.vezes)}/${String(execucoes)} | ${taxa}% | \`${linha.caso}\` | ` +
        `${linha.primeira.slice(0, 19)} | ${linha.ultima.slice(0, 19)} |`,
    );
  }
  if (linhas.length > topo) saida.push(`| | | _e mais ${String(linhas.length - topo)} caso(s)_ | | |`);
  if (ilegiveis > 0) {
    saida.push('', `${String(ilegiveis)} linha(s) do livro estavam ilegiveis e contam so no denominador.`);
  }
  saida.push('');
  return saida.join('\n');
}


// =========================================================================
// AUTOTESTE
// =========================================================================

/**
 * A propriedade que importa, e a que um livro mal feito erra: o caso que
 * reprova numa execucao e PASSA na seguinte precisa CONTINUAR na lista.
 *
 * Um livro que guardasse so a ultima execucao passaria em qualquer outro caso
 * e falharia neste -- e e exatamente o livro que a plataforma ja oferece de
 * graca (o relatorio da execucao, o sumario do job), que e por isso que nenhum
 * dos dois serve sozinho.
 *
 * O lado permissivo esta aqui com o mesmo peso: duas execucoes verdes nao
 * produzem lista nenhuma. Lista que acusa quando nao ha nada e a mesma coisa
 * que lista que nao acusa quando ha.
 */
function autoteste() {
  const TAP_VERMELHO = [
    'TAP version 13',
    '# Subtest: dist/_tests/tests/integration/x.test.js',
    '    # Subtest: a isca da quinta forma',
    '    not ok 1 - a isca da quinta forma',
    '      ---',
    "      type: 'test'",
    "      error: 'deadlock detected'",
    '      ...',
    '    1..1',
    'not ok 1 - dist/_tests/tests/integration/x.test.js',
    '  ---',
    "  type: 'suite'",
    "  failureType: 'subtestsFailed'",
    '  ...',
    '# tests 1',
    '# pass 0',
    '# fail 1',
  ].join('\n');

  const TAP_VERDE = [
    'TAP version 13',
    '# Subtest: dist/_tests/tests/integration/x.test.js',
    '    # Subtest: a isca da quinta forma',
    '    ok 1 - a isca da quinta forma',
    '      ---',
    "      type: 'test'",
    '      ...',
    '    1..1',
    'ok 1 - dist/_tests/tests/integration/x.test.js',
    '# tests 1',
    '# pass 1',
    '# fail 0',
  ].join('\n');

  const CASO = 'dist/_tests/tests/integration/x.test.js > a isca da quinta forma';

  let falhas = 0;
  const conferir = (nome, condicao, detalhe = '') => {
    if (condicao) {
      console.log(`  [    ok   ] ${nome}`);
      return;
    }
    falhas += 1;
    console.log(`  [ FALHOU  ] ${nome}`);
    if (detalhe !== '') console.log(`               ${detalhe}`);
  };

  const sala = mkdtempSync(join(tmpdir(), 'bichu-livro-'));
  try {
    console.log('autoteste do livro dos casos que piscam');

    // ---- O CASO QUE PISCA -------------------------------------------------
    const livro = join(sala, 'pisca', 'casos.jsonl');
    registrarExecucao({
      livro,
      suite: 'integracao',
      rotulo: 'execucao 1',
      casos: casosQueReprovaram(TAP_VERMELHO),
      quando: '2026-09-22T10:00:00.000Z',
    });
    registrarExecucao({
      livro,
      suite: 'integracao',
      rotulo: 'execucao 2',
      casos: casosQueReprovaram(TAP_VERDE),
      quando: '2026-09-22T11:00:00.000Z',
    });

    const depois = agregar(livro, 'integracao');
    conferir(
      'o caso que reprovou na execucao 1 e passou na 2 CONTINUA na lista',
      depois.linhas.some((l) => l.caso === CASO),
      `a lista depois da execucao verde: ${JSON.stringify(depois.linhas.map((l) => l.caso))}`,
    );
    conferir(
      'e com o denominador certo: 1 reprovacao em 2 execucoes, e nao 1 em 1',
      depois.execucoes === 2 && depois.linhas[0]?.vezes === 1,
      `execucoes=${String(depois.execucoes)} vezes=${String(depois.linhas[0]?.vezes)}`,
    );
    const relatorio = renderizar(livro, { suite: 'integracao' });
    conferir(
      'e o relatorio que vai para o sumario do job NOMEIA o caso',
      relatorio.includes(CASO) && relatorio.includes('1/2'),
      relatorio.replace(/\n/g, ' | '),
    );

    // Uma terceira execucao verde nao pode apagar o que a primeira viu. E o
    // mesmo defeito uma vez mais adiante: o livro que "se limpa sozinho".
    registrarExecucao({
      livro,
      suite: 'integracao',
      rotulo: 'execucao 3',
      casos: [],
      quando: '2026-09-22T12:00:00.000Z',
    });
    const maisTarde = agregar(livro, 'integracao');
    conferir(
      'nem depois de duas execucoes verdes seguidas o caso sai da lista',
      maisTarde.linhas.some((l) => l.caso === CASO) && maisTarde.execucoes === 3,
      `execucoes=${String(maisTarde.execucoes)} lista=${JSON.stringify(maisTarde.linhas.map((l) => l.caso))}`,
    );

    // ---- O LADO PERMISSIVO ------------------------------------------------
    const limpo = join(sala, 'limpo', 'casos.jsonl');
    registrarExecucao({ livro: limpo, suite: 'integracao', rotulo: 'a', casos: [], quando: '2026-09-22T10:00:00.000Z' });
    registrarExecucao({ livro: limpo, suite: 'integracao', rotulo: 'b', casos: [], quando: '2026-09-22T11:00:00.000Z' });
    const verde = agregar(limpo, 'integracao');
    conferir(
      'o lado permissivo: duas execucoes verdes nao produzem caso nenhum',
      verde.linhas.length === 0 && verde.execucoes === 2,
      JSON.stringify(verde.linhas),
    );
    const relatorioVerde = renderizar(limpo, { suite: 'integracao' });
    conferir(
      'e o relatorio diz isso em uma linha, sem tabela e sem alarme',
      relatorioVerde.includes('Nenhum caso reprovou') && !relatorioVerde.includes('|---'),
      relatorioVerde.replace(/\n/g, ' | '),
    );

    // ---- SUITES DIFERENTES NAO SE MISTURAM --------------------------------
    const misto = join(sala, 'misto', 'casos.jsonl');
    registrarExecucao({ livro: misto, suite: 'unitaria', rotulo: 'u', casos: ['a > b'], quando: '2026-09-22T10:00:00.000Z' });
    registrarExecucao({ livro: misto, suite: 'integracao', rotulo: 'i', casos: [], quando: '2026-09-22T11:00:00.000Z' });
    conferir(
      'o livro e um so e as suites nao se somam: a taxa de uma nao dilui a da outra',
      agregar(misto, 'integracao').linhas.length === 0 && agregar(misto, 'unitaria').linhas.length === 1,
    );

    // ---- O TETO CORTA PELA FRENTE -----------------------------------------
    const cheio = join(sala, 'cheio', 'casos.jsonl');
    for (let i = 0; i < LIMITE_DE_LINHAS + 5; i += 1) {
      registrarExecucao({ livro: cheio, suite: 'integracao', rotulo: `e${String(i)}`, casos: [], quando: '2026-09-22T10:00:00.000Z' });
    }
    conferir(
      `o livro para de crescer em ${String(LIMITE_DE_LINHAS)} execucoes, cortando a mais antiga`,
      lerLivro(cheio).execucoes.length === LIMITE_DE_LINHAS,
      `ficou com ${String(lerLivro(cheio).execucoes.length)}`,
    );
  } finally {
    rmSync(sala, { recursive: true, force: true });
  }

  const daLeitura = autotesteDaLeitura();

  if (falhas > 0 || daLeitura !== 0) {
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s) do livro. O acumulado deixou de acumular, e um caso ` +
        'que pisca volta a evaporar entre uma execucao e a seguinte.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: o caso que pisca aparece, e a suite verde nao gera ruido');
  return 0;
}

// =========================================================================
// LINHA DE COMANDO
// =========================================================================

const argv = process.argv.slice(2);

if (argv.includes('--autoteste')) {
  process.exit(autoteste());
}

const comando = argv[0];

if (comando === 'registrar') {
  const livro = bandeira(argv, 'livro');
  const tap = bandeira(argv, 'tap');
  const suite = bandeira(argv, 'suite');
  const rotulo = bandeira(argv, 'rotulo') ?? '';
  if (livro === undefined || tap === undefined || suite === undefined) {
    morrer('`registrar` exige `--livro`, `--tap` e `--suite`.');
  }

  // Verificacao que nao consegue verificar REPROVA. Um registro pulado em
  // silencio erra o denominador e devolve a piscada daquela execucao ao
  // esquecimento, que e o defeito inteiro que este arquivo existe para fechar.
  if (!existsSync(tap)) {
    morrer(
      `o relatorio TAP nao existe em ${tap}. A execucao da suite \`${suite}\` NAO foi registrada no ` +
        'livro: o denominador fica errado e um caso que tenha piscado aqui some. Confira se o ' +
        'executor recebeu `--placar` e se o diretorio esta montado no container.',
    );
  }
  const conteudo = readFileSync(tap, 'utf8');
  const { total, falharam } = placarDoTap(conteudo);
  if (total === undefined || falharam === undefined) {
    morrer(
      `o relatorio TAP em ${tap} nao traz o placar (\`# tests\`, \`# fail\`). Sem placar nao da para ` +
        'afirmar que a suite rodou, e registrar uma execucao que talvez nao tenha acontecido ' +
        'estraga o denominador de todas as outras.',
    );
  }

  const casos = casosQueReprovaram(conteudo);
  if (casos.length !== falharam) {
    // Nao e reprovacao: `# fail` conta o agregador junto em algumas versoes do
    // runner. E ruido que precisa ser DITO, porque a divergencia silenciosa
    // entre o placar e a lista e como uma lista incompleta parece completa.
    console.log(
      `nota: o placar diz ${String(falharam)} reprovacao(oes) e a leitura nomeou ${String(casos.length)} caso(s). ` +
        'A lista abaixo e a das folhas; o placar conta tambem o grupo e o arquivo.',
    );
  }

  const registro = registrarExecucao({ livro, suite, rotulo, casos });
  console.log(
    `livro: ${livro} | suite ${suite} | ${String(total)} casos executados | ` +
      `${String(casos.length)} reprovaram nesta execucao`,
  );
  for (const caso of casos) console.log(`  reprovou: ${caso}`);
  void registro;
  process.exit(0);
}

if (comando === 'render') {
  const livro = bandeira(argv, 'livro');
  if (livro === undefined) morrer('`render` exige `--livro`.');
  const suite = bandeira(argv, 'suite');
  const topo = Number.parseInt(bandeira(argv, 'topo') ?? '25', 10);
  process.stdout.write(renderizar(livro, { suite, topo }));
  process.exit(0);
}

morrer(
  'comando desconhecido. Use `registrar`, `render` ou `--autoteste`. ' +
    'Ver o cabecalho deste arquivo.',
);
