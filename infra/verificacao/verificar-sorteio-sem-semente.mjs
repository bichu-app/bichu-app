#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs`: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * PORTAO: ASSERCAO DE TOLERANCIA ZERO SOBRE QUANTIDADE SORTEADA.
 *
 *   node infra/verificacao/verificar-sorteio-sem-semente.mjs [--autoteste]
 *
 * =========================================================================
 * LEIA ISTO ANTES DE CONFIAR NESTE PORTAO: ELE E RASO, E ISSO E DITO AQUI
 * =========================================================================
 * Em 22/09 o caso `nada correlaciona codigos emitidos em sequencia`
 * (`src/modules/tags/domain/tag-code.test.ts`) reprovou 12 vezes em 1000
 * execucoes -- 1,2%, contra 0,949% previstos pela conta -- sem defeito nenhum
 * atras. Ele sorteava 10.000 codigos e exigia ZERO pares consecutivos com o
 * mesmo prefixo de 20 bits. A assercao pedia que um gerador aleatorio NUNCA
 * coincidisse, ou seja, reprovava a implementacao correta.
 *
 * O conserto nao foi afrouxar a tolerancia, e o motivo e o que decide o que
 * este portao pode e nao pode prometer:
 *
 *   **Contar colisao de prefixo nao mede a propriedade em tolerancia nenhuma.**
 *   Um contador cifrado com chave fixa daria distribuicao plana, zero colisoes,
 *   passaria com qualquer tolerancia -- e seria inteiramente adivinhavel. A
 *   saida facil nunca testou o que prometia.
 *
 * Disso decorre o limite deste arquivo, e ele precisa ser dito em voz alta em
 * vez de ficar implicito na ausencia de regra:
 *
 * O QUE ELE PEGA: a FORMA sintatica de tolerancia zero sobre quantidade
 * sorteada -- "o contador de coincidencias deu zero" e "N sorteios deram N
 * valores distintos". Sao as duas formas exatas que reprovavam aqui, e sao
 * formas que a conta de probabilidade condena sempre que o espaco e finito.
 *
 * O QUE ELE **NAO** PEGA, e nao ha conserto barato para nenhum destes:
 *
 *   1. **Assercao que mede outra propriedade que nao a que o nome promete.**
 *      E o furo que custou o dia de 22/09, e e semantico: exige saber o que o
 *      caso QUER dizer, que esta em portugues no nome dele. Nenhuma analise
 *      estatica le intencao. O contador cifrado passa por aqui liso.
 *   2. **Tolerancia frouxa que ainda pisca.** `assert.ok(x < 5)` sobre um
 *      sorteio com media 3 e desvio 1,7 pisca 1 vez em 120 e tem forma de
 *      assercao legitima. Julgar isso exigiria o modelo nulo da grandeza --
 *      quantos sorteios, sobre que espaco --, e nenhum dos dois esta no texto
 *      do arquivo.
 *   3. **Aleatoriedade que chega por uma porta.** `ids.uuidv7()`,
 *      `random80()`, uma fixture de outro arquivo: o portao le UM arquivo e
 *      so reconhece fonte de sorteio citada nele. `src/shared/id/uuidv7.test.ts`
 *      tem `assert.equal(gerados.size, 1000)` sobre 1000 sorteios e passa por
 *      aqui sem ser visto -- corretamente, naquele caso, porque o contador de
 *      12 bits torna o valor unico por construcao; mas o portao nao sabe disso,
 *      ele so nao enxergou.
 *   4. **Intermitencia que nao vem de sorteio.** Cadeado, relogio, porta,
 *      ordem de linha do banco, paralelismo. Era a causa do PRIMEIRO caso de
 *      22/09 (impasse de cadeado, 1 em 8), e para essa classe a ferramenta e
 *      repeticao, nao leitura (`.github/workflows/repeticao.yml`).
 *   5. **O app Flutter.** Este portao le TypeScript. `app/` tem suite propria
 *      em Dart e ninguem a varre por isto.
 *
 * A rede que pega o que sobra nao e um portao, e sim o acumulado de
 * `infra/suite/acumular-reprovados.mjs`: ele nao impede nada, mas faz o caso
 * que piscou APARECER em vez de evaporar. Os dois juntos sao a entrega; este
 * arquivo sozinho seria uma promessa maior do que ele cumpre.
 *
 * =========================================================================
 * COMO ELE DECIDE QUE UMA GRANDEZA E SORTEADA
 * =========================================================================
 * Sem analise de fluxo, e sem cair no oposto (marcar o arquivo inteiro porque
 * ele cita `randomBytes` em algum lugar) -- esse oposto REPROVARIA os dois
 * casos estatisticos legitimos que existem hoje neste repositorio, e portao
 * que reprova quem esta certo e desligado na primeira semana.
 *
 * O criterio e contaminacao por BLOCO, em ponto fixo:
 *
 *   - uma variavel preenchida dentro de um laco cujo corpo CHAMA uma fonte de
 *     sorteio esta contaminada;
 *   - uma variavel preenchida dentro de um laco cujo corpo LE uma variavel ja
 *     contaminada tambem esta.
 *
 * O segundo passo nao e luxo: no caso de 22/09 o laco que contava as colisoes
 * nao chamava `randomBytes` -- ele percorria o vetor que o laco anterior tinha
 * preenchido. Um portao sem propagacao teria ficado calado justamente ali.
 *
 * E o que ele NAO contamina e o que o mantem util: `assert.equal(vistos.size, 32)`
 * -- cobertura contra uma CONSTANTE -- e `assert.ok(vezes > 750 && vezes < 1300)`
 * -- intervalo -- sao as duas assercoes estatisticas legitimas do repositorio,
 * com margens de 10^-53 e 8 sigma, e nenhuma das duas casa com as regras
 * abaixo. O autoteste prova isso contra o ARQUIVO REAL, e nao contra copia.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Arvores varridas. `app/` e Dart e tem suite propria; `node_modules` e de terceiro. */
const ARVORES = ['src', 'tests'];

/**
 * Fontes de sorteio RECONHECIVEIS no texto do arquivo. A lista e curta de
 * proposito: o que ela nao tem, o portao nao ve, e isso esta declarado no
 * cabecalho como furo 3 em vez de escondido numa heuristica larga.
 */
const FONTES = ['randomBytes(', 'randomInt(', 'randomUUID(', 'Math.random(', 'getRandomValues('];

/** Os dois casos legitimos contra os quais o lado permissivo e medido. */
const ARQUIVO_DOS_LEGITIMOS = 'src/modules/tags/domain/tag-code.test.ts';
/**
 * O mesmo arquivo COMO ELE ERA antes do conserto de 22/09. Extensao `.isca`
 * para nao ser compilado nem rodado: ele e entrada de portao, nao teste.
 */
const CAMINHO_DA_ISCA_HISTORICA = 'infra/verificacao/iscas/tag-code-antes-do-conserto.ts.isca';
const CASOS_LEGITIMOS = [
  'o primeiro símbolo cobre os 32 valores do alfabeto',
  'a distribuição do primeiro símbolo é plana dentro da folga estatística',
];

/**
 * Troca comentario e literal de texto por espaco, PRESERVANDO o comprimento e
 * as quebras de linha, para que o numero da linha continue batendo.
 *
 * Sem isto o portao acusaria a propria explicacao: o cabecalho de
 * `tag-code.test.ts` descreve em prosa a assercao que foi removida, e um
 * portao deste repositorio ja nasceu furado casando com o proprio comentario.
 */
export function semComentarioNemTexto(fonte) {
  const saida = [...fonte];
  let i = 0;
  const apagar = (ate) => {
    for (let k = i; k < ate && k < saida.length; k += 1) {
      if (saida[k] !== '\n') saida[k] = ' ';
    }
  };
  while (i < fonte.length) {
    const dois = fonte.slice(i, i + 2);
    if (dois === '//') {
      let fim = fonte.indexOf('\n', i);
      if (fim === -1) fim = fonte.length;
      apagar(fim);
      i = fim;
      continue;
    }
    if (dois === '/*') {
      let fim = fonte.indexOf('*/', i + 2);
      fim = fim === -1 ? fonte.length : fim + 2;
      apagar(fim);
      i = fim;
      continue;
    }
    const aspa = fonte[i];
    if (aspa === "'" || aspa === '"' || aspa === '`') {
      let j = i + 1;
      while (j < fonte.length) {
        if (fonte[j] === '\\') {
          j += 2;
          continue;
        }
        if (fonte[j] === aspa) break;
        j += 1;
      }
      // O conteudo some; as aspas ficam, para o texto continuar sendo um
      // operando reconhecivel e nao se colar no vizinho.
      i += 1;
      apagar(j);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return saida.join('');
}

/** Corpos de `for`/`while`, por casamento de chaves. */
function corposDeLaco(codigo) {
  const corpos = [];
  for (const casado of codigo.matchAll(/\b(for|while)\s*\(/g)) {
    let i = casado.index ?? 0;
    // Pula ate a chave que abre o corpo.
    let profundidade = 0;
    let abriu = -1;
    for (let k = i; k < codigo.length; k += 1) {
      const c = codigo[k];
      if (c === '(') profundidade += 1;
      else if (c === ')') {
        profundidade -= 1;
        if (profundidade === 0) {
          abriu = codigo.indexOf('{', k);
          break;
        }
      }
    }
    if (abriu === -1) continue;
    let chaves = 0;
    let fim = -1;
    for (let k = abriu; k < codigo.length; k += 1) {
      if (codigo[k] === '{') chaves += 1;
      else if (codigo[k] === '}') {
        chaves -= 1;
        if (chaves === 0) {
          fim = k;
          break;
        }
      }
    }
    if (fim === -1) continue;
    corpos.push(codigo.slice(abriu, fim + 1));
    i = fim;
  }
  return corpos;
}

/** Variaveis que este bloco PREENCHE. */
function preenchidasEm(bloco) {
  const nomes = new Set();
  for (const casado of bloco.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\.push\(|\.add\(|\.set\(|\+=|\+\+|\[[^\]]*\]\s*=)/g)) {
    nomes.add(casado[1]);
  }
  for (const casado of bloco.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    nomes.add(casado[1]);
  }
  return nomes;
}

/** Nomes citados no bloco, para saber se ele LE alguma variavel contaminada. */
function citadasEm(bloco) {
  return new Set([...bloco.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((c) => c[1]));
}

/**
 * Variaveis contaminadas por sorteio, em ponto fixo.
 *
 * @param {string} codigo ja sem comentario e sem literal de texto
 */
export function variaveisSorteadas(codigo) {
  const contaminadas = new Set();

  // Semente fora de laco: `const x = Array.from(..., () => randomBytes(...))`
  // e companhia. O `Array.from` faz o papel do laco sem escrever um.
  for (const casado of codigo.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)[^;=]*=\s*([^;]*);/g)) {
    const atribuicao = casado[2] ?? '';
    if (FONTES.some((f) => atribuicao.includes(f))) contaminadas.add(casado[1]);
  }

  const corpos = corposDeLaco(codigo);
  const preenche = corpos.map((corpo) => ({
    fonte: FONTES.some((f) => corpo.includes(f)),
    preenchidas: preenchidasEm(corpo),
    citadas: citadasEm(corpo),
  }));

  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const bloco of preenche) {
      const leContaminada = [...bloco.citadas].some((n) => contaminadas.has(n));
      if (!bloco.fonte && !leContaminada) continue;
      for (const nome of bloco.preenchidas) {
        if (!contaminadas.has(nome)) {
          contaminadas.add(nome);
          mudou = true;
        }
      }
    }
  }
  return contaminadas;
}

/** Divide os argumentos de uma chamada por virgula de primeiro nivel. */
function argumentos(codigo, aberturaDoParenteses) {
  const args = [];
  let profundidade = 0;
  let inicio = aberturaDoParenteses + 1;
  for (let k = aberturaDoParenteses; k < codigo.length; k += 1) {
    const c = codigo[k];
    if (c === '(' || c === '[' || c === '{') profundidade += 1;
    else if (c === ')' || c === ']' || c === '}') {
      profundidade -= 1;
      if (profundidade === 0) {
        args.push(codigo.slice(inicio, k));
        return args;
      }
    } else if (c === ',' && profundidade === 1) {
      args.push(codigo.slice(inicio, k));
      inicio = k + 1;
    }
  }
  return args;
}

const IGUALDADE = /\bassert\.(equal|strictEqual|deepEqual|deepStrictEqual)\s*\(/g;

/**
 * As duas regras, sobre UM arquivo.
 *
 * @param {string} fonte texto cru do arquivo
 * @returns {{linha: number, regra: string, trecho: string}[]}
 */
export function achados(fonte) {
  const codigo = semComentarioNemTexto(fonte);
  if (!FONTES.some((f) => codigo.includes(f))) return [];

  const sorteadas = variaveisSorteadas(codigo);
  if (sorteadas.size === 0) return [];

  const linhaDe = (posicao) => codigo.slice(0, posicao).split('\n').length;
  const saida = [];

  for (const casado of codigo.matchAll(IGUALDADE)) {
    const abertura = (casado.index ?? 0) + casado[0].length - 1;
    const args = argumentos(codigo, abertura).map((a) => a.trim());
    if (args.length < 2) continue;
    const [a, b] = args;
    const linha = linhaDe(casado.index ?? 0);
    const trecho = `${casado[0]}${a ?? ''}, ${b ?? ''})`.replace(/\s+/g, ' ');

    // REGRA A -- "a coincidencia nao aconteceu nenhuma vez".
    // Um contador contaminado comparado com zero. O gerador correto produz
    // coincidencia com probabilidade positiva, entao a assercao reprova a
    // implementacao certa a uma taxa que ninguem calculou.
    const contadorZero = (esq, dir) => /^[A-Za-z_$][\w$]*$/.test(esq) && dir === '0' && sorteadas.has(esq);
    if (contadorZero(a ?? '', b ?? '') || contadorZero(b ?? '', a ?? '')) {
      saida.push({
        linha,
        regra: 'contador-de-coincidencia-igual-a-zero',
        trecho,
      });
      continue;
    }

    // REGRA B -- "N sorteios deram N valores distintos" (aniversario).
    // `new Set(x).size === x.length` sobre um `x` contaminado. A colisao tem
    // probabilidade positiva para qualquer espaco finito; o que muda e quanto,
    // e "quanto" nao esta escrito em lugar nenhum do arquivo.
    const aniversario = (esq, dir) => {
      if (!esq.includes('.size')) return false;
      const comprimento = /^([A-Za-z_$][\w$]*)\.length$/.exec(dir);
      if (comprimento === null) return false;
      const alvo = comprimento[1] ?? '';
      const dentro = /\bnew Set\(\s*([A-Za-z_$][\w$]*)/.exec(esq);
      return sorteadas.has(alvo) || (dentro !== null && sorteadas.has(dentro[1] ?? ''));
    };
    if (aniversario(a ?? '', b ?? '') || aniversario(b ?? '', a ?? '')) {
      saida.push({ linha, regra: 'n-sorteios-deram-n-distintos', trecho });
    }
  }
  return saida;
}

function varrer(raiz) {
  if (!existsSync(raiz)) return [];
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === '.git') continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith('.test.ts')) saida.push(caminho);
    }
  };
  andar(raiz);
  return saida.sort();
}

// =========================================================================
// AUTOTESTE
// =========================================================================

const ISCA_CONTADOR = `
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { it } from 'node:test';
void it('nada correlaciona códigos emitidos em sequência', () => {
  const emitidos = [];
  for (let indice = 0; indice < 10000; indice += 1) {
    emitidos.push(gerar(new Uint8Array(randomBytes(10))));
  }
  let prefixosIguais = 0;
  for (let indice = 1; indice < emitidos.length; indice += 1) {
    if (emitidos[indice - 1].slice(0, 4) === emitidos[indice].slice(0, 4)) prefixosIguais += 1;
  }
  assert.equal(prefixosIguais, 0, 'pares consecutivos com o mesmo prefixo');
});
`;

const ISCA_ANIVERSARIO = `
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { it } from 'node:test';
void it('não repete', () => {
  const emitidos = [];
  for (let indice = 0; indice < 10000; indice += 1) {
    emitidos.push(gerar(new Uint8Array(randomBytes(10))));
  }
  assert.equal(new Set(emitidos).size, emitidos.length, 'houve código repetido');
});
`;

// O portao deste repositorio que nasceu furado casava com a PROPRIA
// explicacao. Este caso precisa APROVAR: a forma proibida aparece so em
// comentario e em texto.
const ISCA_SO_NO_COMENTARIO = `
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { it } from 'node:test';
// Aqui havia \`assert.equal(prefixosIguais, 0)\` sobre 10.000 sorteios, e ele
// reprovava 1 vez em 105. Ver o histórico.
void it('mede sem amostra', () => {
  const amostras = [];
  for (let i = 0; i < 10; i += 1) amostras.push(randomBytes(10));
  assert.equal('assert.equal(prefixosIguais, 0)'.length > 0, true);
});
`;

// Sem fonte de sorteio nenhuma, a MESMA forma e legitima: um contador
// deterministico que precisa dar zero e exatamente o que muitos portoes deste
// repositorio afirmam.
const ISCA_SEM_SORTEIO = `
import assert from 'node:assert/strict';
import { it } from 'node:test';
void it('nenhuma rota ficou de fora', () => {
  let faltando = 0;
  for (const rota of rotasDoContrato) {
    if (!registradas.has(rota)) faltando += 1;
  }
  assert.equal(faltando, 0, 'rota do contrato sem registro');
});
`;

function autoteste(raizDoRepositorio) {
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

  console.log('autoteste do portao de sorteio sem semente');

  const doContador = achados(ISCA_CONTADOR);
  conferir(
    'REPROVA a forma que reprovou 12 vezes em 1000: contador de coincidencia igual a zero',
    doContador.length === 1 && doContador[0]?.regra === 'contador-de-coincidencia-igual-a-zero',
    JSON.stringify(doContador),
  );

  const doAniversario = achados(ISCA_ANIVERSARIO);
  conferir(
    'REPROVA a outra forma do mesmo caso: N sorteios deram N valores distintos',
    doAniversario.length === 1 && doAniversario[0]?.regra === 'n-sorteios-deram-n-distintos',
    JSON.stringify(doAniversario),
  );

  conferir(
    'APROVA o arquivo em que a forma proibida so aparece em comentario e em texto',
    achados(ISCA_SO_NO_COMENTARIO).length === 0,
    JSON.stringify(achados(ISCA_SO_NO_COMENTARIO)),
  );

  conferir(
    'APROVA o contador deterministico igual a zero: sem sorteio, a forma e legitima',
    achados(ISCA_SEM_SORTEIO).length === 0,
    JSON.stringify(achados(ISCA_SEM_SORTEIO)),
  );

  // ---- O CASO HISTORICO, INTEIRO ---------------------------------------
  // O arquivo COMO ELE ERA antes do conserto de 22/09, guardado em
  // `iscas/tag-code-antes-do-conserto.ts.isca`. E a isca mais forte que existe
  // para este portao, e por dois motivos:
  //
  //   1. ela exige que ele ache as DUAS assercoes que de fato reprovavam, nas
  //      linhas em que elas estavam;
  //   2. ela exige que ele nao ache mais NADA naquele arquivo -- e os dois
  //      casos estatisticos legitimos (10^-53 e 8 sigma) ja estavam la, no
  //      mesmo arquivo, no mesmo dia. Um portao largo demais acusaria os
  //      quatro e este caso o denunciaria.
  const historico = join(raizDoRepositorio, CAMINHO_DA_ISCA_HISTORICA);
  if (!existsSync(historico)) {
    falhas += 1;
    console.log(`  [ FALHOU  ] a isca historica nao existe em ${CAMINHO_DA_ISCA_HISTORICA}`);
    console.log('               Sem ela este portao volta a valer por confianca no dia em que foi escrito.');
  } else {
    const doHistorico = achados(readFileSync(historico, 'utf8'));
    const assinatura = doHistorico.map((a) => `${String(a.linha)}:${a.regra}`).sort();
    conferir(
      'a isca historica: as DUAS assercoes que reprovavam sao achadas, e so elas',
      JSON.stringify(assinatura) ===
        JSON.stringify(['181:n-sorteios-deram-n-distintos', '191:contador-de-coincidencia-igual-a-zero']),
      JSON.stringify(doHistorico),
    );
  }

  // ---- O LADO PERMISSIVO, CONTRA O ARQUIVO REAL -------------------------
  // Copia do trecho nao serve: ela envelhece em silencio no dia em que o
  // arquivo mudar, e o portao volta a valer por confianca. Le-se o arquivo de
  // verdade, e a ausencia dele REPROVA em vez de ser pulada.
  const caminho = join(raizDoRepositorio, ARQUIVO_DOS_LEGITIMOS);
  if (!existsSync(caminho)) {
    falhas += 1;
    console.log(`  [ FALHOU  ] o arquivo dos dois casos legitimos nao existe em ${ARQUIVO_DOS_LEGITIMOS}`);
    console.log('               Sem ele o lado permissivo deste portao nao esta sendo medido contra nada.');
  } else {
    const texto = readFileSync(caminho, 'utf8');
    for (const nome of CASOS_LEGITIMOS) {
      conferir(
        `o caso legitimo ainda existe no arquivo real: "${nome}"`,
        texto.includes(nome),
        'se ele foi renomeado, este autoteste precisa ser atualizado -- e nao apagado',
      );
    }
    const doReal = achados(texto);
    conferir(
      'APROVA os dois casos estatisticos legitimos (margens de 10^-53 e 8 sigma), no arquivo real',
      doReal.length === 0,
      JSON.stringify(doReal),
    );
  }

  if (falhas > 0) {
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s) de autoteste. O portao deixou de enxergar a forma que ` +
        'ele existe para pegar, ou passou a acusar quem esta certo.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: as duas formas reprovam, e as tres legitimas passam');
  return 0;
}

// =========================================================================

const raiz = process.cwd();

if (process.argv.includes('--autoteste')) {
  process.exit(autoteste(raiz));
}

// As iscas rodam ANTES da varredura de verdade. Portao cego varrendo o
// repositorio inteiro sai verde e ninguem procura o que acredita ja ter.
if (autoteste(raiz) !== 0) process.exit(1);

const arquivos = ARVORES.flatMap((arvore) => varrer(join(raiz, arvore)));
if (arquivos.length === 0) {
  console.error(
    `\nREPROVADO: nenhum *.test.ts em ${ARVORES.join('/ e ')}/. Verificacao que nao acha o que ` +
      'verificar precisa reprovar: varredura vazia sai verde e parece "nada a corrigir".\n',
  );
  process.exit(1);
}

console.log(`\n${String(arquivos.length)} arquivos de teste varridos em ${ARVORES.join('/, ')}/`);

let total = 0;
for (const caminho of arquivos) {
  for (const achado of achados(readFileSync(caminho, 'utf8'))) {
    total += 1;
    const curto = relative(raiz, caminho);
    console.log(
      `::error file=${curto},line=${String(achado.linha)}::assercao de tolerancia zero sobre ` +
        `quantidade sorteada (${achado.regra}): ${achado.trecho}. O gerador correto produz esse ` +
        'desfecho com probabilidade positiva, entao este caso reprova a implementacao CERTA a uma ' +
        'taxa que ninguem calculou. Meça a propriedade sem amostra, ou declare a margem.',
    );
  }
}

if (total > 0) {
  console.error(`\nREPROVADO: ${String(total)} assercao(oes) de tolerancia zero sobre sorteio.\n`);
  process.exit(1);
}

console.log('nenhuma assercao de tolerancia zero sobre quantidade sorteada');
console.log(
  'lembrete do que este portao NAO cobre: assercao que mede outra propriedade que nao a que o nome ' +
    'promete, tolerancia frouxa que ainda pisca, sorteio que chega por uma porta, e intermitencia ' +
    'que nao vem de sorteio. Ver o cabecalho deste arquivo.',
);
