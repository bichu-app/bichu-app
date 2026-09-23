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
 * O ARQUIVO SAI DO `location:`, E NAO DA ARVORE DE SUBTESTES
 * =========================================================================
 * Dois arquivos diferentes tem casos com o mesmo nome (`'aprova'`, `'recusa'`,
 * `'o caso limpo passa'`). Um acumulado indexado so pelo nome do caso soma
 * piscada de arquivos diferentes na mesma linha, e quem for procurar nao acha.
 *
 * O caminho natural seria a arvore de subtestes, mas ela NAO traz o arquivo
 * quando os caminhos vao explicitos ao `node --test`, que e como as duas suites
 * deste repositorio rodam. Medido no TAP real da suite de integracao (245
 * casos): o topo da arvore e o primeiro `describe` de cada arquivo, e um `it`
 * no topo do arquivo aparece sozinho, sem nenhum ancestral.
 *
 * O arquivo esta no campo `location:` do bloco YAML da reprovacao, e e de la
 * que ele sai. A chave fica `arquivo > describe > caso`. Em caso PASSADO o
 * campo nao vem, e nao faz falta: so a reprovacao entra no livro.
 */

/** Indentacao de um nivel no TAP do `node --test`. */
const NIVEL = 4;

/**
 * O `location:` traz o caminho do COMPILADO, absoluto dentro do container
 * (`/app/dist/_tests/tests/integration/x.test.js`). Guardar isso no livro
 * amarraria a chave ao ponto de montagem: o mesmo caso registrado do container
 * e da maquina de quem desenvolve viraria duas linhas. Guarda-se o caminho da
 * FONTE, relativo a raiz do repositorio.
 */
function normalizarArquivo(bruto) {
  const semPrefixo = bruto.replace(/^.*?dist\/_tests\//, '');
  return semPrefixo.replace(/\.js$/, '.ts');
}

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
  /** @type {string[]} agregadores reprovados, so usados quando NAO houve folha */
  const agregadores = [];

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
    let arquivo = '';
    for (let j = i + 1; j < linhas.length; j += 1) {
      const seguinte = linhas[j] ?? '';
      if (/^\s*\.\.\.\s*$/.test(seguinte)) break;
      if (/^\s*(not ok|ok) \d+ - /.test(seguinte)) break;
      if (/^\s*type: 'suite'\s*$/.test(seguinte)) ehFolha = false;
      if (/^\s*failureType: 'subtestsFailed'\s*$/.test(seguinte)) ehFolha = false;
      const onde = /^\s*location: '(.+):\d+:\d+'\s*$/.exec(seguinte);
      if (onde !== null) arquivo = normalizarArquivo(onde[1] ?? '');
    }
    const caminho = [...(arquivo === '' ? [] : [arquivo]), ...pilha.slice(0, nivel + 1)].join(' > ');
    if (ehFolha) reprovados.push(caminho);
    else agregadores.push(`${caminho} (falha do grupo, sem caso)`);
  }

  // O GRUPO QUE FALHA SEM NENHUM CASO TER FALHADO.
  //
  // Um `after` de `describe` que lanca produz `type: 'suite'` com
  // `failureType: 'hookFailed'` e NENHUMA folha reprovada -- medido no runner.
  // Devolver lista vazia para uma execucao vermelha seria registrar no livro
  // "nada reprovou" numa execucao que reprovou, que e a mesma evaporacao que
  // este mecanismo existe para acabar. Sem folha, o agregador E a resposta, e
  // ele vai rotulado para ninguem confundi-lo com um caso.
  return reprovados.length > 0 ? reprovados : agregadores;
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
  // As formas abaixo sao as do TAP REAL desta suite, conferidas contra
  // `dist/_tests/integracao.tap` de uma execucao de 245 casos: com os caminhos
  // explicitos no `node --test`, o topo da arvore e o primeiro `describe` de
  // cada arquivo, e um `it` no topo do arquivo aparece sozinho na indentacao
  // zero -- a MESMA de um `describe`. O arquivo so aparece no `location:`.
  const TAP_ANINHADO = [
    'TAP version 13',
    '# Subtest: grupo de fora',
    '    # Subtest: grupo de dentro',
    '        # Subtest: caso que passa',
    '        ok 1 - caso que passa',
    '          ---',
    "          type: 'test'",
    '          ...',
    '        # Subtest: caso que pisca',
    '        not ok 2 - caso que pisca',
    '          ---',
    "          type: 'test'",
    "          location: '/app/dist/_tests/tests/integration/a.test.js:12:3'",
    "          failureType: 'testCodeFailure'",
    '          ...',
    '        1..2',
    '    not ok 1 - grupo de dentro',
    '      ---',
    "      type: 'suite'",
    "      failureType: 'subtestsFailed'",
    '      ...',
    'not ok 1 - grupo de fora',
    '  ---',
    "  type: 'suite'",
    "  failureType: 'subtestsFailed'",
    '  ...',
    '# tests 2',
    '# pass 1',
    '# fail 1',
  ].join('\n');

  // `it` no topo do arquivo: MESMA indentacao de um `describe`, e sem nenhum
  // ancestral. Foi assim que a isca de prova apareceu no TAP de verdade.
  const TAP_SOLTO = [
    'TAP version 13',
    '# Subtest: caso solto que reprova',
    'not ok 1 - caso solto que reprova',
    '  ---',
    "  type: 'test'",
    "  location: '/app/dist/_tests/src/b.test.js:7:1'",
    "  failureType: 'testCodeFailure'",
    '  ...',
    '# tests 1',
    '# pass 0',
    '# fail 1',
  ].join('\n');

  // `after` de `describe` que lanca: `type: 'suite'` com `failureType:
  // 'hookFailed'` e NENHUMA folha reprovada. Isola a regra do `type: 'suite'`:
  // sem ela, o grupo entraria no livro como se fosse um caso.
  const TAP_HOOK_DO_GRUPO = [
    'TAP version 13',
    '# Subtest: grupo cujo after quebra',
    '    # Subtest: caso que passa',
    '    ok 1 - caso que passa',
    '      ---',
    "      type: 'test'",
    '      ...',
    '    1..1',
    'not ok 1 - grupo cujo after quebra',
    '  ---',
    "  type: 'suite'",
    "  location: '/app/dist/_tests/src/z.test.js:3:6'",
    "  failureType: 'hookFailed'",
    '  ...',
    '# tests 2',
    '# pass 1',
    '# fail 1',
  ].join('\n');

  // `it` com subtestes de `t.test()`: o PAI vem `type: 'test'` com
  // `failureType: 'subtestsFailed'`. Isola a regra do `failureType`: sem ela,
  // o pai entraria no livro junto com o filho e a contagem dobraria.
  const TAP_PAI_COM_SUBTESTE = [
    'TAP version 13',
    '# Subtest: caso com subtestes',
    '    # Subtest: subteste que reprova',
    '    not ok 1 - subteste que reprova',
    '      ---',
    "      type: 'test'",
    "      location: '/app/dist/_tests/src/y.test.js:9:11'",
    "      failureType: 'testCodeFailure'",
    '      ...',
    '    1..1',
    'not ok 2 - caso com subtestes',
    '  ---',
    "  type: 'test'",
    "  location: '/app/dist/_tests/src/y.test.js:8:6'",
    "  failureType: 'subtestsFailed'",
    '  ...',
    '# tests 2',
    '# pass 0',
    '# fail 2',
  ].join('\n');

  const TAP_VERDE = [
    'TAP version 13',
    '# Subtest: grupo de fora',
    '    # Subtest: caso que passa',
    '    ok 1 - caso que passa',
    '      ---',
    "      type: 'test'",
    '      ...',
    '    1..1',
    'ok 1 - grupo de fora',
    '# tests 1',
    '# pass 1',
    '# fail 0',
  ].join('\n');

  const casos = [
    [
      'so a FOLHA: os dois `describe` tambem vem `not ok` e nao sao casos',
      () => casosQueReprovaram(TAP_ANINHADO),
      ['tests/integration/a.test.ts > grupo de fora > grupo de dentro > caso que pisca'],
    ],
    [
      '`it` no topo do arquivo nao tem ancestral, e mesmo assim leva o arquivo',
      () => casosQueReprovaram(TAP_SOLTO),
      ['src/b.test.ts > caso solto que reprova'],
    ],
    [
      'o arquivo vem do `location:`, ja como FONTE e relativo a raiz',
      () => [normalizarArquivo('/app/dist/_tests/tests/integration/a.test.js')],
      ['tests/integration/a.test.ts'],
    ],
    [
      'grupo que falha por hook, sem folha nenhuma: entra ROTULADO, e nao some',
      () => casosQueReprovaram(TAP_HOOK_DO_GRUPO),
      ['src/z.test.ts > grupo cujo after quebra (falha do grupo, sem caso)'],
    ],
    [
      '`it` com subtestes: o PAI tambem vem `not ok`, e so o filho entra',
      () => casosQueReprovaram(TAP_PAI_COM_SUBTESTE),
      ['src/y.test.ts > caso com subtestes > subteste que reprova'],
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
