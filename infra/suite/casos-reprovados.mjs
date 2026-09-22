/* global console */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs` e de
// `infra/integracao/*.mjs`: o ESLint deste repositorio nao declara os globais
// de Node para `**/*.mjs` fora de `src/`, entao `console` reprovaria em
// `no-undef`.
/**
 * Leitura do relatorio TAP: QUAIS casos reprovaram, com o caminho inteiro.
 *
 * Uma leitura so, usada por tres lugares -- o executor da unitaria, o executor
 * da integracao e o acumulador. Duas copias da mesma leitura divergem, e a que
 * diverge para menos registra menos sem avisar.
 *
 * =========================================================================
 * SO A FOLHA, E ISSO NAO E DETALHE
 * =========================================================================
 * O `node --test` reporta a reprovacao de um caso TRES vezes: no proprio caso
 * (`type: 'test'`), no `describe` que o contem (`type: 'suite'`,
 * `failureType: 'subtestsFailed'`) e no ARQUIVO (idem). Registrar os tres
 * encheria o acumulado de nomes de arquivo e de grupo, que nao sao casos e nao
 * piscam sozinhos -- e o nome do arquivo apareceria com contagem tres vezes
 * maior que a do caso, o que inverte a ordem de quem olha a lista.
 *
 * O que distingue os tres e o campo `type` do bloco YAML que segue a linha, e
 * nao a indentacao: `it` no topo do arquivo, sem `describe`, fica na MESMA
 * indentacao de um `describe`.
 *
 * =========================================================================
 * O CAMINHO INTEIRO, E POR QUE NAO SO O NOME DO CASO
 * =========================================================================
 * Dois arquivos diferentes tem casos com o mesmo nome (`'aprova'`, `'recusa'`,
 * `'o caso limpo passa'`). Um acumulado indexado so pelo nome do caso soma
 * piscada de arquivos diferentes na mesma linha, e quem for procurar nao acha.
 * A chave e `arquivo > describe > caso`, montada pela pilha de indentacao.
 */

/** Indentacao de um nivel no TAP do `node --test`. */
const NIVEL = 4;

/**
 * Casos que reprovaram, pelo caminho inteiro (`arquivo > grupo > caso`).
 *
 * Devolve apenas as FOLHAS: o caso de verdade, nunca o `describe` nem o
 * arquivo que o `node --test` tambem marca com `not ok`.
 *
 * @param {string} tap conteudo do relatorio TAP
 * @returns {string[]} caminhos, na ordem em que apareceram
 */
export function casosQueReprovaram(tap) {
  const linhas = tap.split('\n');
  /** @type {string[]} pilha de nomes, indexada por nivel de indentacao */
  const pilha = [];
  /** @type {string[]} */
  const reprovados = [];

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? '';

    // A PILHA SE MONTA PELO `# Subtest:`, E NAO PELO `not ok`.
    //
    // No TAP do `node --test` o resultado do PAI vem DEPOIS do dos filhos:
    // quando a linha `not ok` do caso aparece, a linha `not ok` do `describe`
    // que o contem ainda nao existe. Montar a pilha pelos resultados devolvia
    // ` >  > caso que pisca` -- ancestrais vazios --, e um livro indexado por
    // essa chave junta casos de arquivos diferentes que tenham o mesmo nome.
    // O `# Subtest:` vem ANTES, e e ele que nomeia.
    const anuncio = /^(\s*)# Subtest: (.*)$/.exec(linha);
    if (anuncio !== null) {
      const nivel = Math.floor((anuncio[1] ?? '').length / NIVEL);
      pilha.length = nivel;
      pilha[nivel] = (anuncio[2] ?? '').trim();
      continue;
    }

    const casado = /^(\s*)(not ok|ok) \d+ - (.*)$/.exec(linha);
    if (casado === null) continue;
    if (casado[2] !== 'not ok') continue;

    const nivel = Math.floor((casado[1] ?? '').length / NIVEL);

    // O bloco YAML que segue (` ---` ... ` ...`) diz se isto e um caso ou um
    // agregador. Sem o bloco -- TAP truncado -- o desfecho e registrar, e nao
    // descartar: perder a evidencia e o defeito que este arquivo existe para
    // impedir.
    let ehFolha = true;
    for (let j = i + 1; j < linhas.length; j += 1) {
      const seguinte = linhas[j] ?? '';
      if (/^\s*\.\.\.\s*$/.test(seguinte)) break;
      if (/^\s*(not ok|ok) \d+ - /.test(seguinte)) break;
      if (/^\s*type: 'suite'\s*$/.test(seguinte)) ehFolha = false;
      if (/^\s*failureType: 'subtestsFailed'\s*$/.test(seguinte)) ehFolha = false;
    }
    if (ehFolha) reprovados.push(pilha.slice(0, nivel + 1).join(' > '));
  }

  return reprovados;
}

/**
 * `# tests 244` e companhia. Campo `undefined` quando o placar nao esta no
 * relatorio -- e quem chama precisa tratar isso como reprovacao, nunca como
 * zero.
 *
 * @param {string} tap
 */
export function placarDoTap(tap) {
  const numero = (rotulo) => {
    const casado = new RegExp(`^# ${rotulo} (\\d+)$`, 'm').exec(tap);
    return casado === null ? undefined : Number.parseInt(casado[1], 10);
  };
  return { total: numero('tests'), passaram: numero('pass'), falharam: numero('fail') };
}

/**
 * Autoteste desta leitura. Cada caso isola UMA propriedade, e o caso limpo
 * existe para que os outros nao aprovem por qualquer motivo.
 *
 * @returns {number} 0 aprovado, 1 reprovado
 */
export function autoteste() {
  const TAP_COM_GRUPO = [
    'TAP version 13',
    '# Subtest: dist/_tests/tests/integration/a.test.js',
    '    # Subtest: um grupo',
    '        # Subtest: caso que passa',
    '        ok 1 - caso que passa',
    '          ---',
    "          type: 'test'",
    '          ...',
    '        # Subtest: caso que pisca',
    '        not ok 2 - caso que pisca',
    '          ---',
    "          type: 'test'",
    "          failureType: 'testCodeFailure'",
    '          ...',
    '        1..2',
    '    not ok 1 - um grupo',
    '      ---',
    "      type: 'suite'",
    "      failureType: 'subtestsFailed'",
    '      ...',
    'not ok 1 - dist/_tests/tests/integration/a.test.js',
    '  ---',
    "  type: 'suite'",
    "  failureType: 'subtestsFailed'",
    '  ...',
    '1..1',
    '# tests 2',
    '# pass 1',
    '# fail 1',
  ].join('\n');

  // `it` no topo do arquivo: MESMA indentacao de um `describe`. E o caso que
  // uma leitura por indentacao erra, e por isso ele esta aqui.
  const TAP_SEM_GRUPO = [
    'TAP version 13',
    '# Subtest: dist/_tests/src/b.test.js',
    '    # Subtest: caso solto que reprova',
    '    not ok 1 - caso solto que reprova',
    '      ---',
    "      type: 'test'",
    '      ...',
    '    1..1',
    'not ok 1 - dist/_tests/src/b.test.js',
    '  ---',
    "  type: 'suite'",
    '  ...',
    '# tests 1',
    '# pass 0',
    '# fail 1',
  ].join('\n');

  const TAP_VERDE = [
    'TAP version 13',
    '# Subtest: dist/_tests/src/b.test.js',
    '    # Subtest: caso que passa',
    '    ok 1 - caso que passa',
    '      ---',
    "      type: 'test'",
    '      ...',
    '    1..1',
    'ok 1 - dist/_tests/src/b.test.js',
    '# tests 1',
    '# pass 1',
    '# fail 0',
  ].join('\n');

  const casos = [
    [
      'so a FOLHA: o describe e o arquivo tambem vem `not ok` e nao sao casos',
      () => casosQueReprovaram(TAP_COM_GRUPO),
      ['dist/_tests/tests/integration/a.test.js > um grupo > caso que pisca'],
    ],
    [
      '`it` sem `describe` fica na indentacao de um grupo, e mesmo assim e caso',
      () => casosQueReprovaram(TAP_SEM_GRUPO),
      ['dist/_tests/src/b.test.js > caso solto que reprova'],
    ],
    [
      'o lado permissivo: suite verde nao produz nome nenhum',
      () => casosQueReprovaram(TAP_VERDE),
      [],
    ],
    [
      'placar ausente vira `undefined`, e nao zero',
      () => [String(placarDoTap('TAP version 13\n1..0\n').falharam)],
      ['undefined'],
    ],
  ];

  let falhas = 0;
  console.log(`autoteste da leitura do TAP (${String(casos.length)} casos)`);
  for (const [nome, executar, esperado] of casos) {
    const obtido = executar();
    if (JSON.stringify(obtido) === JSON.stringify(esperado)) {
      console.log(`  [    ok   ] ${nome}`);
    } else {
      falhas += 1;
      console.log(`  [ FALHOU  ] ${nome}`);
      console.log(`               esperava: ${JSON.stringify(esperado)}`);
      console.log(`               obteve:   ${JSON.stringify(obtido)}`);
    }
  }
  if (falhas > 0) {
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s). A leitura do TAP deixou de enxergar o que ela ` +
        'existe para enxergar, e o acumulado passa a registrar outra coisa.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: a folha e distinguida do agregador, e a suite verde nao produz nome');
  return 0;
}
