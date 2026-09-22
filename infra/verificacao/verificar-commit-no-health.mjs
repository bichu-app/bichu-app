#!/usr/bin/env node
/* global console, process, fetch, AbortSignal, URL */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. `/* eslint-env node */` nao serve -- a configuracao
// plana do ESLint 9 deixou de honrar `eslint-env`.
/**
 * BICHUS-210 -- a sonda diz de QUAL COMMIT o binario saiu.
 *
 * ====================================================================
 * POR QUE UM PORTAO SO NAO BASTAVA, E POR QUE SAO DOIS
 * ====================================================================
 *
 * `build.commit` ja existia no contrato antes desta historia, e vinha `null`
 * nos dois ambientes. Um teste que conferisse "o campo existe" ficaria VERDE
 * com o defeito de pe: o campo existia, e era nulo. Por isso a primeira
 * conferencia aqui e sobre o VALOR, e `null`, `''` e rotulo movel (`latest`,
 * `HEAD`, `unknown`) reprovam nominalmente.
 *
 * A segunda e a que nao envelhece. Sem ela, a saida mais barata para deixar a
 * primeira verde e fixar uma string no codigo -- e o portao passaria a aprovar
 * a mentira, que e um estado pior do que o nulo de antes, porque quem le passa
 * a acreditar. Entao o commit reportado e comparado com o commit de que a
 * imagem foi CONSTRUIDA, e diferente reprova dizendo os dois valores.
 *
 * As duas juntas fecham o caso de uso que abriu a historia: "essa correcao ja
 * esta no ar?". A primeira garante que ha resposta; a segunda, que a resposta
 * e sobre o codigo que esta rodando, e nao sobre o que alguem escreveu uma vez.
 *
 * ====================================================================
 * AS ISCAS RODAM ANTES DA REDE, SEMPRE
 * ====================================================================
 *
 * `autoteste()` alimenta o verificador com corpos de sonda montados a mao e
 * exige o resultado de cada um: os que PRECISAM reprovar e os que PRECISAM
 * passar. Verificador que reprova tudo e tao inutil quanto o que aprova tudo, e
 * o segundo defeito so aparece quando alguem tenta passar um caso legitimo.
 *
 * Se qualquer isca der o resultado errado, este script falha com "o portao
 * parou de enxergar" e NAO chega a consultar o destino -- a partir dali o verde
 * dele nao significaria nada.
 *
 * Uso:
 *   node infra/verificacao/verificar-commit-no-health.mjs <url-base> [commit]
 *
 *   <url-base>  raiz do destino, sem `/v1/health` (ex.: http://localhost:3000)
 *   [commit]    o commit de que a imagem no ar foi construida. Sem ele, so a
 *               primeira conferencia roda, e o script DIZ EM VOZ ALTA que a
 *               segunda nao rodou -- a metade que falta nao pode sumir calada.
 *
 * Saida: 0 aprovado, 1 reprovado.
 */

export const VERSAO_DO_VERIFICADOR = '1.0.0';

const CAMINHO_DA_SONDA = '/v1/health';
const TEMPO_LIMITE_MS = 20_000;

/** A mesma forma que o contrato declara em `build.commit` e que o Dockerfile exige. */
const FORMA_DE_COMMIT = /^[0-9a-f]{7,40}$/;

/**
 * Rotulos que tem forma de palavra e cheiro de commit para quem le rapido.
 * Nenhum deles passa em FORMA_DE_COMMIT, entao esta lista nao muda o veredito:
 * ela existe para a MENSAGEM dizer a coisa certa. "`latest` nao e commit" leva
 * a pessoa ao conserto; "nao casou com a expressao regular" leva a discussao
 * sobre a expressao regular.
 */
const ROTULOS_MOVEIS = new Set(['latest', 'head', 'main', 'master', 'dev', 'unknown', 'none', 'null']);

/** Menor prefixo de commit que o projeto aceita, igual ao do contrato. */
const PREFIXO_MINIMO = 7;

/**
 * Confere UM corpo de sonda. Puro: nao toca rede, nao le disco, nao le
 * ambiente. E o que torna as iscas possiveis.
 *
 * @param {unknown} corpo    JSON ja parseado da resposta de /v1/health
 * @param {string|null} esperado commit de que a imagem foi construida, ou null
 * @returns {string[]} falhas; vazio e aprovado
 */
export function conferir(corpo, esperado = null) {
  const falhas = [];

  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    return ['a sonda nao devolveu um objeto JSON: nao ha o que conferir, e nao haver o que conferir nao e aprovacao'];
  }

  const build = corpo.build;
  if (typeof build !== 'object' || build === null || Array.isArray(build)) {
    return [
      'a sonda respondeu SEM o objeto `build`. O contrato declara `build` como obrigatorio ' +
        '(required: [artifact, commit]): um destino que o omite nao consegue dizer o que esta rodando',
    ];
  }

  if (!('commit' in build)) {
    falhas.push(
      '`build.commit` nao veio na resposta. Ele e obrigatorio no contrato, e sem ele a pergunta ' +
        '"essa correcao ja esta no ar?" nao tem resposta pelo sistema',
    );
    return falhas;
  }

  const commit = build.commit;

  // A conferencia que o defeito de 22/09 exige. `commit` EXISTIA e era `null`:
  // qualquer portao que so cobrasse a presenca do campo ficaria verde.
  if (commit === null) {
    falhas.push(
      '`build.commit` veio `null` numa imagem construida. O campo existir nao basta -- era ' +
        'exatamente assim que os dois ambientes respondiam em 22/09. Um servico rodando codigo ' +
        'ANTIGO responde `status: ok` igual a um rodando o novo, e o deploy que nao pegou fica ' +
        'invisivel. O commit precisa ser injetado no build (ARG BUILD_COMMIT no Dockerfile)',
    );
    return falhas;
  }

  if (typeof commit !== 'string') {
    falhas.push(`\`build.commit\` nao e string nem null: veio ${JSON.stringify(commit)}`);
    return falhas;
  }

  if (commit.trim() === '') {
    falhas.push(
      '`build.commit` veio vazio (ou so com espaco). Vazio e a mesma ausencia de antes, com ' +
        'aparencia de valor: a variavel foi apagada em algum ponto entre o build e o runtime',
    );
    return falhas;
  }

  if (!FORMA_DE_COMMIT.test(commit)) {
    const pista = ROTULOS_MOVEIS.has(commit.trim().toLowerCase())
      ? ` \`${commit}\` e rotulo movel, nao commit: ele aponta para coisas diferentes em dias diferentes, ` +
        'e um valor falso engana pior que o nulo, porque quem le acredita.'
      : '';
    falhas.push(
      `\`build.commit\` nao tem forma de commit: veio ${JSON.stringify(commit)}.` +
        pista +
        ` Esperado de ${PREFIXO_MINIMO} a 40 digitos hexadecimais minusculos, como o contrato declara`,
    );
    return falhas;
  }

  if (esperado === null) return falhas;

  if (!FORMA_DE_COMMIT.test(esperado)) {
    falhas.push(
      `o commit ESPERADO que me passaram nao tem forma de commit: ${JSON.stringify(esperado)}. ` +
        'Comparar contra lixo aprovaria ou reprovaria por acaso',
    );
    return falhas;
  }

  // Prefixo conta como igual, e so nesta direcao: um commit truncado por quem
  // constroi (`--short`) continua sendo o commit certo. O que nao conta e uma
  // string parecida -- e por isso o piso de 7 digitos, que e o mesmo do
  // contrato.
  const curto = commit.length <= esperado.length ? commit : esperado;
  const longo = commit.length <= esperado.length ? esperado : commit;
  const bate = curto.length >= PREFIXO_MINIMO && longo.startsWith(curto);

  if (!bate) {
    falhas.push(
      `o destino reporta o commit ${commit} e a imagem foi construida de ${esperado}. ` +
        'Ou o que esta no ar nao e este codigo -- deploy que nao pegou, imagem antiga ainda de pe ' +
        '-- ou o valor foi fixado em algum lugar e a sonda esta afirmando o que nao sabe. As duas ' +
        'sao o defeito que a BICHUS-210 existe para nao ter',
    );
  }

  return falhas;
}

// ---------------------------------------------------------------------------
// Autoteste: as iscas rodam antes da rede
// ---------------------------------------------------------------------------

const COMMIT_REAL = '262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OUTRO_COMMIT = 'b528bc8fedcba9876543210fedcba9876543210f';

function sonda(commit) {
  return {
    status: 'ok',
    version: '0.1.0',
    build: { artifact: '0123456789abcdef', commit },
    checks: { database: 'ok' },
  };
}

/** Quantas iscas o autoteste exerceu na ultima execucao. Contado, nunca escrito. */
export let ISCAS_EXERCIDAS = 0;

/** Cada isca diz o que ela precisa produzir. Resultado diferente e cegueira. */
export function autoteste() {
  const cegueiras = [];
  let exercidas = 0;

  // ISCA 1 -- o defeito de 22/09 e a familia dele. O campo EXISTE em todos
  // estes casos: um portao de presenca aprovaria a lista inteira.
  const precisaReprovarSemEsperado = [
    ['commit nulo (o defeito medido em 22/09)', sonda(null)],
    ['commit vazio', sonda('')],
    ['commit so com espaco', sonda('   ')],
    ['commit `latest`', sonda('latest')],
    ['commit `HEAD`', sonda('HEAD')],
    ['commit `unknown`', sonda('unknown')],
    ['commit em maiusculas', sonda('262CF1F8A1B2C3D4E5F60718293A4B5C6D7E8F90')],
    ['commit curto demais para identificar', sonda('262cf1')],
    ['commit com lixo no fim', sonda('262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90-sujo')],
    ['commit que nao e string', sonda(42)],
    ['sem a chave `commit`', { status: 'ok', version: '0.1.0', build: { artifact: '0123456789abcdef' } }],
    ['sem o objeto `build`', { status: 'ok', version: '0.1.0', checks: { database: 'ok' } }],
    ['resposta que nem e objeto', 'ok'],
  ];
  for (const [nome, corpo] of precisaReprovarSemEsperado) {
    exercidas += 1;
    if (conferir(corpo, null).length === 0) {
      cegueiras.push(`isca "${nome}" PASSOU: o portao parou de enxergar este caso`);
    }
  }

  // ISCA 2 -- a que nao envelhece. O valor tem forma perfeita de commit e
  // mesmo assim e mentira, porque nao e o commit de que a imagem saiu. Sem
  // esta, fixar uma string no codigo deixa o portao verde.
  const precisaReprovarComEsperado = [
    ['commit valido de OUTRO commit (string fixada, ou imagem antiga)', sonda(OUTRO_COMMIT), COMMIT_REAL],
    ['prefixo de outro commit', sonda(OUTRO_COMMIT.slice(0, 12)), COMMIT_REAL],
    ['commit certo trocado num digito', sonda(COMMIT_REAL.slice(0, 39) + 'a'), COMMIT_REAL],
    ['commit esperado sem forma de commit', sonda(COMMIT_REAL), 'a-toa'],
  ];
  for (const [nome, corpo, esperado] of precisaReprovarComEsperado) {
    exercidas += 1;
    if (conferir(corpo, esperado).length === 0) {
      cegueiras.push(`isca "${nome}" PASSOU: o portao aprova um commit que nao e o da imagem`);
    }
  }

  // CONTROLE POSITIVO. Sem ele o autoteste ficaria verde com um portao que
  // reprova qualquer coisa -- que nao verifica nada, so reclama.
  const precisaPassar = [
    ['commit igual ao da imagem', sonda(COMMIT_REAL), COMMIT_REAL],
    ['commit curto do MESMO commit', sonda(COMMIT_REAL.slice(0, 7)), COMMIT_REAL],
    ['commit longo contra esperado curto', sonda(COMMIT_REAL), COMMIT_REAL.slice(0, 7)],
    ['commit valido, sem esperado (modo so-presenca)', sonda(COMMIT_REAL), null],
  ];
  for (const [nome, corpo, esperado] of precisaPassar) {
    exercidas += 1;
    const falhas = conferir(corpo, esperado);
    if (falhas.length > 0) {
      cegueiras.push(`caso legitimo "${nome}" REPROVOU: ${falhas.join('; ')}`);
    }
  }

  ISCAS_EXERCIDAS = exercidas;
  return cegueiras;
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

async function buscarSonda(base) {
  const url = `${base.replace(/\/$/, '')}${CAMINHO_DA_SONDA}`;
  let resposta;
  try {
    resposta = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { 'user-agent': 'bichu-verificador-de-commit/1' },
    });
  } catch (erro) {
    // Destino fora do ar REPROVA. Verificacao que nao consegue verificar nunca
    // aprova: confianca falsa e pior que ausencia de verificacao.
    throw new Error(`GET ${url} falhou: ${String(erro)}`);
  }
  if (resposta.status !== 200) {
    throw new Error(`GET ${url} devolveu ${resposta.status}, esperado 200`);
  }
  const texto = await resposta.text();
  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(`a sonda nao devolveu JSON (${String(erro)}): ${texto.slice(0, 200)}`);
  }
}

export async function main(argv) {
  const [base, esperadoBruto] = argv;
  console.log(`verificador de commit na sonda ${VERSAO_DO_VERIFICADOR}`);

  const cegueiras = autoteste();
  console.log(
    `  [${cegueiras.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas (${ISCAS_EXERCIDAS} casos)`,
  );
  if (cegueiras.length > 0) {
    console.log('\nO PORTAO ESTA CEGO, e por isso nem consultei o destino:');
    for (const c of cegueiras) console.log(`  - ${c}`);
    return 1;
  }

  if (!base) {
    console.log('\nfalta o endereco do destino. Uso: <url-base> [commit-esperado]');
    return 1;
  }

  const esperado = esperadoBruto ? esperadoBruto.trim() : null;
  if (esperado === null) {
    console.log(
      '  [aviso] sem commit esperado: so a conferencia de VALOR rodou. A que compara o commit ' +
        'reportado com o commit construido NAO rodou nesta execucao',
    );
  }

  let corpo;
  try {
    corpo = await buscarSonda(base);
  } catch (erro) {
    console.log(`\nREPROVADO: ${String(erro)}`);
    return 1;
  }

  console.log(`  sonda de ${base}: ${JSON.stringify(corpo)}`);

  const falhas = conferir(corpo, esperado);
  console.log(`  [${falhas.length === 0 ? 'ok' : 'REPROVA'}] \`build.commit\` diz de onde o binario veio`);
  if (falhas.length > 0) {
    console.log('\nREPROVADO:');
    for (const f of falhas) console.log(`  - ${f}`);
    return 1;
  }

  console.log(
    `\nAPROVADO: ${base} roda o commit ${corpo.build.commit}` +
      (esperado ? ` e ele e o commit de que a imagem foi construida` : ' (forma conferida, origem nao)'),
  );
  return 0;
}

// Mesma deteccao dos outros verificadores deste diretorio: comparar a URL do
// modulo com o caminho invocado. `endsWith` no nome do arquivo casaria com
// qualquer homonimo noutra pasta.
const invocadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(String(erro));
      process.exit(1);
    },
  );
}
