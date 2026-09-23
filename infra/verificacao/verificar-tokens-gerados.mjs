#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * O Dart gerado de `app/lib/theme/` bate com `design/tokens.json`?
 *
 * ====================================================================
 * O GEMEO DO PORTAO DOS TIPOS, E POR QUE ELE VEM DEPOIS
 * ====================================================================
 *
 * Existem duas conferencias da forma "regera o derivado e compara" neste
 * repositorio, e as duas nasceram so na esteira:
 *
 *   api/openapi.yaml   -> src/shared/types/generated/   (job `codigo`)
 *   design/tokens.json -> app/lib/theme/bichu_tokens.g.dart (job `tokens`)
 *
 * A primeira ja desceu para `make verificar` em 22/09, depois de o commit
 * 351ae0f atravessar um `make fechar-integracao` VERDE com o derivado uma
 * geracao atras da fonte. Este e o outro. Hoje o `.g.dart` esta em dia: isto e
 * buraco latente, nao defeito ativo, e o momento de tapar buraco latente e
 * antes de ele virar historia.
 *
 * Sem ele, `bichu_tokens.g.dart` pode ser editado a mao e o token e o codigo
 * divergem SEM QUE O DIFF MOSTRE, porque a proxima geracao desfaz a edicao em
 * silencio.
 *
 * ====================================================================
 * POR QUE NAO E `git diff --exit-code`, QUE E O QUE A ESTEIRA FAZ
 * ====================================================================
 *
 * O mesmo motivo do irmao, e ele custou uma iteracao la. Na esteira a arvore
 * comeca LIMPA no commit, entao comparar com o git responde "o gerado que esta
 * commitado bate com a fonte que esta commitada?", que e a pergunta certa la.
 *
 * Na maquina de quem desenvolve a arvore esta suja por um bom motivo: quem mexe
 * num token edita `design/tokens.json`, roda o gerador e SO ENTAO commita os
 * dois. Nesse instante o gerado esta certo e diverge do HEAD -- e
 * `git diff --exit-code` REPROVA esse estado, que e exatamente o estado de quem
 * acabou de fazer a coisa certa. Portao que reprova o fluxo correto e portao
 * que alguem desliga, e e assim que a verificacao morre de verdade.
 *
 * A pergunta daqui nao depende do git: **gerar de novo muda algum arquivo?** Se
 * muda, o que estava em disco estava velho. Vale com a arvore limpa ou suja, e
 * pega um caso que a forma da esteira nao pega: gerado commitado velho numa
 * arvore que ja tem outras mudancas.
 *
 * ====================================================================
 * O QUE ELE NAO COBRE, E DESCOBRI ISSO ARMANDO A ISCA ERRADA
 * ====================================================================
 *
 * A primeira isca que armei mudou `raspberry.950` em `design/tokens.json`, e o
 * portao APROVOU. Nao foi defeito dele: o gerador so emite os papeis semanticos
 * e os primitivos que algum papel referencia, e `raspberry.950` nao e
 * referenciado por nenhum. Mudar um token que nao chega ao derivado nao muda o
 * derivado, e a pergunta deste portao e sobre o derivado.
 *
 * Entao ele responde "o gerado esta em dia?", e NAO "todo token de
 * `design/tokens.json` esta em uso". A segunda pergunta e outra, e quem a
 * responde e `app/test/a11y/prosa_dos_tokens_test.dart` e a tabela de contraste
 * -- nao este arquivo. Registrado aqui para ninguem concluir do verde daqui uma
 * coisa que ele nao afirma.
 *
 * A isca que vale esta em `raspberry.700`, que vira `primary`: com ela o portao
 * reprova nomeando `app/lib/theme/bichu_tokens.g.dart`, saida 1.
 *
 * ====================================================================
 * O QUE ELE FAZ COM A ARVORE
 * ====================================================================
 *
 * Ele REGERA antes de comparar. Quando reprova, o conserto ja esta escrito no
 * worktree, pronto para `git add`. Edicao a mao em `bichu_tokens.g.dart` e
 * desfeita, e e essa a intencao: o destino e gerado, a fonte e o token.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const FONTE = 'design/tokens.json';
const PACOTE = 'app';
// Relativo a `PACOTE`, que e de onde o gerador precisa rodar: ele procura a
// fonte em `../design/tokens.json` e escreve em `lib/theme/`.
const DESTINO_NO_PACOTE = 'lib/theme/bichu_tokens.g.dart';
const DESTINO = `${PACOTE}/${DESTINO_NO_PACOTE}`;
const GERADOR = 'tool/gen_tokens.dart';

/**
 * sha256 de cada destino gerado, por nome.
 *
 * Mapa e nao string unica de proposito: o irmao confere um DIRETORIO, e o
 * paragrafo 18.2.2 do documento de design system ja promete um segundo destino
 * gerado da mesma fonte (o CSS da rota publica do QR). Quando ele chegar, entra
 * nesta lista e nada mais muda.
 */
function impressao(caminhos) {
  const mapa = new Map();
  for (const c of caminhos) {
    if (!existsSync(c) || !statSync(c).isFile()) {
      throw new Error(`o destino gerado nao existe: ${c}`);
    }
    const conteudo = readFileSync(c);
    if (conteudo.length === 0) {
      throw new Error(`o destino gerado esta vazio: ${c}`);
    }
    mapa.set(c, createHash('sha256').update(conteudo).digest('hex'));
  }
  return mapa;
}

/**
 * A DECISAO, isolada de proposito: e ela que o autoteste exercita.
 * Devolve a lista de nomes que mudaram entre as duas impressoes.
 */
export function divergencias(antes, depois) {
  const nomes = new Set([...antes.keys(), ...depois.keys()]);
  const fora = [];
  for (const n of [...nomes].sort()) {
    const a = antes.get(n);
    const d = depois.get(n);
    if (a === undefined) fora.push(`${n} (a geracao CRIOU este arquivo)`);
    else if (d === undefined) fora.push(`${n} (a geracao APAGOU este arquivo)`);
    else if (a !== d) fora.push(n);
  }
  return fora;
}

/**
 * As ENTRADAS que precisam existir antes de o gerador ser chamado, isolada pelo
 * mesmo motivo de `divergencias`: e ela que o autoteste exercita.
 * Devolve a lista de caminhos que faltam.
 */
export function entradasQueFaltam(fonte, gerador) {
  return [fonte, gerador].filter((c) => !existsSync(c));
}

function autoteste() {
  const m = (o) => new Map(Object.entries(o));
  const casos = [
    ['arvore em dia: nada mudou', m({ 'a.g.dart': '1' }), m({ 'a.g.dart': '1' }), 0],
    ['o gerado estava velho', m({ 'a.g.dart': '1' }), m({ 'a.g.dart': '2' }), 1],
    [
      'dois destinos velhos',
      m({ 'a.g.dart': '1', 'b.css': '9' }),
      m({ 'a.g.dart': '2', 'b.css': '8' }),
      2,
    ],
    ['a geracao criou um destino novo', m({ 'a.g.dart': '1' }), m({ 'a.g.dart': '1', 'b.css': '3' }), 1],
    ['a geracao apagou um destino', m({ 'a.g.dart': '1', 'b.css': '3' }), m({ 'a.g.dart': '1' }), 1],
  ];
  let ruim = 0;
  for (const [nome, antes, depois, esperado] of casos) {
    const veio = divergencias(antes, depois).length;
    const ok = veio === esperado;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? 'ok' : 'RUIM'} ] ${nome} (esperava ${esperado}, veio ${veio})`);
  }

  // As iscas que importam mais: portao que nao consegue conferir NAO APROVA.
  // Arquivo ausente e arquivo vazio sao os dois jeitos de o destino sumir sem
  // o gerador reclamar, e os dois ja passariam batido numa comparacao de hash
  // ingenua -- dois vazios tem o mesmo sha256.
  const temporario = `/tmp/tokens-gerados-${String(process.pid)}`;
  for (const [nome, caminho, deveriaReprovar] of [
    ['destino inexistente REPROVA', `${temporario}-nao-existe.g.dart`, true],
    ['destino vazio REPROVA', `${temporario}-vazio.g.dart`, true],
    ['destino com conteudo APROVA', `${temporario}-cheio.g.dart`, false],
  ]) {
    // O preparo e escolhido pelo CAMINHO e nao pelo texto do caso: casar o nome
    // por substring foi o primeiro jeito, e o caso "destino com conteudo" nao
    // contem a palavra `cheio` -- a isca nao preparava nada e reprovava como se
    // a regra estivesse errada. Isca que depende do texto do proprio caso e
    // isca que quebra quando alguem reescreve a frase.
    if (caminho.endsWith('-vazio.g.dart')) execFileSync('sh', ['-c', `: > ${caminho}`]);
    if (caminho.endsWith('-cheio.g.dart')) execFileSync('sh', ['-c', `echo conteudo > ${caminho}`]);
    let reprovou = false;
    try {
      impressao([caminho]);
    } catch {
      reprovou = true;
    }
    execFileSync('sh', ['-c', `rm -f ${caminho}`]);
    const ok = reprovou === deveriaReprovar;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? 'ok' : 'RUIM'} ] ${nome}`);
  }

  // E as iscas do outro lado: ENTRADA sumida tambem reprova, e reprova ANTES de
  // chamar o gerador. Sem isto o Dart morreria com a mensagem dele, e quem
  // lesse iria procurar defeito no gerador em vez de no caminho.
  for (const [nome, fonte, gerador, esperado] of [
    ['as duas entradas presentes: nada falta', FONTE, `${PACOTE}/${GERADOR}`, 0],
    ['fonte inexistente REPROVA', `${temporario}-sem-fonte.json`, `${PACOTE}/${GERADOR}`, 1],
    ['gerador inexistente REPROVA', FONTE, `${temporario}-sem-gerador.dart`, 1],
    ['as duas sumidas REPROVAM, e as duas aparecem', `${temporario}-a`, `${temporario}-b`, 2],
  ]) {
    const veio = entradasQueFaltam(fonte, gerador).length;
    const ok = veio === esperado;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? 'ok' : 'RUIM'} ] ${nome} (esperava ${esperado}, veio ${veio})`);
  }

  if (ruim > 0) {
    console.error(`\nautoteste REPROVADO: ${String(ruim)} caso(s) nao se comportaram como a regra manda`);
    process.exit(1);
  }
  console.log(
    '\nautoteste APROVADO: a divergencia e contada por arquivo, e destino ausente ou vazio reprova',
  );
}

function principal() {
  const faltando = entradasQueFaltam(FONTE, `${PACOTE}/${GERADOR}`);
  if (faltando.length > 0) {
    console.error('REPROVA: falta entrada para conferir. Portao que nao consegue conferir nao aprova.');
    for (const c of faltando) console.error(`  - ${c} nao existe`);
    process.exit(1);
  }

  const antes = impressao([DESTINO]);
  try {
    execFileSync('dart', ['run', GERADOR], {
      cwd: PACOTE,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  } catch {
    console.error(`\nREPROVA: \`dart run ${GERADOR}\` falhou. Sem geracao nao ha como comparar.`);
    console.error(`  Rode de dentro de ${PACOTE}/ para ver a mensagem do Dart inteira.`);
    process.exit(1);
  }
  const depois = impressao([DESTINO]);
  const fora = divergencias(antes, depois);

  if (fora.length === 0) {
    console.log(`\nAPROVADO: ${DESTINO} ja estava igual ao que ${FONTE} gera`);
    return;
  }

  console.error(`\nREPROVA: o gerado de ${DESTINO} estava atras de ${FONTE}.`);
  for (const n of fora) console.error(`  - ${n}`);
  console.error('');
  console.error('  A geracao JA RODOU e o conserto esta no worktree: confira o diff');
  console.error(`  em ${DESTINO} e versione o resultado.`);
  console.error('  Se o VALOR gerado esta errado, o errado e o token.');
  try {
    const d = execFileSync('git', ['diff', '--stat', '--', DESTINO], { encoding: 'utf8' });
    if (d.trim()) console.error(`\n${d}`);
  } catch {
    // sem git aqui: a lista acima ja nomeia o arquivo
  }
  process.exit(1);
}

if (process.argv.includes('--autoteste')) autoteste();
else principal();
