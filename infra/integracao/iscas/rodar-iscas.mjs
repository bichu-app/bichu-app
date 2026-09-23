#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint deste
// repositorio nao declara os globais de Node para `**/*.mjs` fora de `src/`,
// entao `console` e `process` reprovariam em `no-undef`.
/**
 * AS ISCAS DE BICHUS-245: desliga um mecanismo de cada vez e EXIGE que a suite
 * de integracao reprove o caso que existe para pega-lo.
 *
 * ===========================================================================
 * POR QUE ELAS EXISTEM, E POR QUE ESTAS DUAS
 * ===========================================================================
 * Prova negativa que vive numa frase evapora. "Conferi, com o envio removido a
 * suite reprova" nao e evidencia: ninguem reexecuta, e ela nao acusa no dia em
 * que o caso deixa de funcionar. Cada verificacao que este repositorio escreve
 * vem com o caso que ela PRECISA reprovar, guardado aqui.
 *
 * As duas iscas correspondem aos dois buracos que esta issue fechou:
 *
 * - **`sem-envio-da-derivada`** reproduz o defeito de producao desta semana: a
 *   funcao de envio escrita e nunca chamada. O aplicativo nunca subiu foto
 *   nenhuma e ninguem notou, porque a pilha efemera nao tinha armazenamento --
 *   nao havia onde a foto chegar, entao nao havia isca capaz de pegar.
 * - **`balde-privado-aberto`** abre o balde privado a leitura anonima. O
 *   criterio 22 de BICHUS-87 manda os dois baldes nascerem sem ela, e o QA
 *   reprovou porque nada conferia isso. Um caso que exige recusa e o inverso
 *   do teste comum: ele so vale se alguem ja o viu ficar vermelho com a
 *   protecao desligada.
 *
 * ===========================================================================
 * AS TRES CONFERENCIAS ANTES DE RODAR, E O QUE CADA UMA JA DEIXOU PASSAR
 * ===========================================================================
 * 1. **A substituicao casa EXATAMENTE UMA VEZ.** Zero casamentos e a isca que
 *    nao morde: a suite fica verde, alguem escreve "conferi, reprova", e a
 *    frase passa a valer por confianca. Mais de um e pior -- ja aconteceu aqui
 *    uma substituicao casar no bloco errado porque duas funcoes tinham texto
 *    identico.
 * 2. **O SHA-256 do arquivo MUDA**, medido antes e depois. Mesmo hash significa
 *    que nada foi escrito, independente do que o `replace` disse ter feito.
 * 3. **`git diff` NAO e vazio.** Outra testemunha para a mesma pergunta: o hash
 *    prova que os bytes mudaram; o `git diff` prova que o Git enxerga a mudanca
 *    no arquivo que a pilha vai usar.
 *
 * Qualquer uma que falhe ABORTA sem rodar a suite e restaura o arquivo. Isca
 * que nao conseguiu armar nao produz veredito nenhum.
 *
 * ===========================================================================
 * COMO O RESULTADO E LIDO
 * ===========================================================================
 * POR NOME DE CASO **E** POR CODIGO DE SAIDA, e a redundancia e deliberada. Ja
 * houve aqui um placar dizendo "0 falharam" com a execucao saindo em 1: um
 * portao estourou antes dos casos e nove sairam cancelados. Placar sozinho
 * mente. Codigo de saida sozinho nao diz QUAL caso reprovou -- compilacao
 * quebrada, banco indisponivel e isca pega saem todos diferentes de zero, com
 * a mesma cor.
 *
 *   node infra/integracao/iscas/rodar-iscas.mjs            # as duas
 *   node infra/integracao/iscas/rodar-iscas.mjs sem-envio  # so a que casar
 *
 * O arquivo alterado e restaurado em qualquer desfecho, inclusive `SIGINT`, e a
 * restauracao confere o SHA-256 de volta: restaurar sem conferir deixaria a
 * isca dentro do repositorio, e o proximo commit levaria o defeito junto.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(raiz);

/**
 * O relatorio TAP que `infra/integracao/executar-suite.mjs` escreve DENTRO da
 * pilha. Ele e alcancavel daqui porque a arvore do worktree e montada no
 * conteiner (`../..:/app` em `compose.integracao.yaml`): o caminho e o mesmo
 * dos dois lados, e por isso a isca le a MESMA evidencia que o portao da suite
 * leu, em vez de uma leitura propria da tela.
 */
const RELATORIO = 'dist/_tests/integracao.tap';

const ISCAS = [
  {
    nome: 'sem-envio-da-derivada',
    porque:
      'reproduz o defeito de producao desta semana: a funcao de envio escrita e nunca ' +
      'chamada. Nenhum byte de derivada sai do processo, e tudo o mais continua igual -- ' +
      'a foto vira `ready`, o banco grava as chaves, o worker diz `pronta`.',
    alvo: 'src/modules/media/application/processar-foto.ts',
    // As DUAS linhas juntas, e nao so a do `card`: elas sao quase identicas, e
    // ancorar numa so casaria uma vez hoje e duas no dia em que alguem
    // renomear uma variavel. O par e um texto que existe uma vez no arquivo
    // inteiro -- e a conferencia de casamento unico transforma essa escolha em
    // garantia em vez de expectativa.
    trecho: `  await deps.armazenamento.put('publico', chaveDoCard, card.bytes, card.contentType);
  await deps.armazenamento.put('publico', chaveDoThumb, thumb.bytes, thumb.contentType);`,
    substituto: `  // ISCA DE BICHUS-245 EM EXECUCAO. Se voce esta lendo isto num arquivo do
  // repositorio, a isca nao foi restaurada e o defeito desta semana voltou:
  // a derivada nunca sai do processo.`,
    casoQueReprova: '1 — o byte sobe pelo caminho do produto e a derivada volta do balde público',
  },
  {
    nome: 'balde-privado-aberto',
    porque:
      'abre o balde privado a leitura anonima, que e o que o criterio 22 de BICHUS-87 ' +
      'proibe e o que nada conferia. O original guarda o EXIF com a coordenada da casa ' +
      'do tutor: o caso 3 existe para exigir a RECUSA, e um caso que exige recusa so vale ' +
      'depois de alguem o ter visto ficar vermelho.',
    alvo: 'infra/integracao/compose.integracao.yaml',
    trecho: `        mc anonymous set none "local/$$OBJECT_BUCKET_PRIVATE"`,
    substituto: `        mc anonymous set download "local/$$OBJECT_BUCKET_PRIVATE"`,
    casoQueReprova: '3 — o balde privado RECUSA leitura anônima do original (critério 22)',
  },
];

function sha256(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

function morrer(mensagem) {
  console.error(`\nISCA ABORTADA: ${mensagem}\n`);
  process.exit(1);
}

/**
 * Arma uma isca, roda a suite e devolve o veredito. Restaura o alvo sempre.
 *
 * Devolve `true` quando a isca PEGOU, que e quando a suite reprovou e o
 * relatorio nomeia o caso certo.
 */
function exercitar(isca) {
  console.log(`\n${'='.repeat(75)}`);
  console.log(`ISCA: ${isca.nome}`);
  console.log(`  alvo:   ${isca.alvo}`);
  console.log(`  porque: ${isca.porque}`);
  console.log(`${'='.repeat(75)}\n`);

  const original = readFileSync(isca.alvo, 'utf8');
  const hashAntes = sha256(isca.alvo);

  let restaurado = false;
  const restaurar = () => {
    if (restaurado) return;
    restaurado = true;
    writeFileSync(isca.alvo, original);
    const hashDepois = sha256(isca.alvo);
    if (hashDepois !== hashAntes) {
      console.error(
        `\nATENCAO: ${isca.alvo} NAO voltou ao estado original.\n` +
          `  esperado ${hashAntes}\n  obtido   ${hashDepois}\n` +
          `Restaure com \`git checkout -- ${isca.alvo}\` ANTES de commitar.\n`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`restaurado: ${isca.alvo} (sha256 ${hashAntes.slice(0, 16)} confere)`);
  };
  process.on('SIGINT', () => {
    restaurar();
    process.exit(130);
  });

  // 1. Casa exatamente uma vez.
  const casamentos = original.split(isca.trecho).length - 1;
  if (casamentos !== 1) {
    morrer(
      `o trecho da isca \`${isca.nome}\` casa ${String(casamentos)} vez(es) em ${isca.alvo}, ` +
        `e precisa casar exatamente UMA. Zero significa que o codigo mudou e a isca perdeu ` +
        `o alvo, e isca que nao morde deixa a suite verde parecendo prova. Mais de uma ` +
        `significa que ela desligaria o mecanismo errado. Releia ${isca.alvo} e reancore.`,
    );
  }

  writeFileSync(isca.alvo, original.replace(isca.trecho, isca.substituto));

  try {
    // 2. O hash mudou.
    const hashComIsca = sha256(isca.alvo);
    if (hashComIsca === hashAntes) {
      restaurar();
      morrer(
        `o SHA-256 de ${isca.alvo} nao mudou depois da substituicao. Nada foi escrito em ` +
          `disco, e rodar a suite agora mediria o codigo intacto: o veredito seria falso.`,
      );
    }

    // 3. O Git enxerga.
    const diff = spawnSync('git', ['diff', '--', isca.alvo], { encoding: 'utf8' });
    if (diff.status !== 0 || diff.stdout.trim() === '') {
      restaurar();
      morrer(
        `\`git diff -- ${isca.alvo}\` veio vazio com a isca armada. O hash mudou e o Git ` +
          `nao enxerga: ou a pilha vai usar outro arquivo, ou ha algo entre o disco e o ` +
          `repositorio. Sem esta testemunha o veredito nao se sustenta.`,
      );
    }

    console.log(`armada:  sha256 ${hashAntes.slice(0, 16)} -> ${hashComIsca.slice(0, 16)}`);
    console.log(`         git diff com ${String(diff.stdout.trim().split('\n').length)} linhas`);
    console.log(`esperado: o caso "${isca.casoQueReprova}" REPROVA\n`);

    // O relatorio da execucao anterior sai primeiro. Sem isto, uma suite que
    // morresse antes de escrever o dela deixaria a isca lendo um TAP verde de
    // outra rodada e concluindo "nao reprovou" -- a forma mais silenciosa de um
    // veredito errado, porque a evidencia existe e esta inteira.
    rmSync(RELATORIO, { force: true });

    const execucao = spawnSync('npm', ['run', 'test:integration'], { stdio: 'inherit' });

    if (!existsSync(RELATORIO)) {
      restaurar();
      morrer(
        `a suite saiu ${String(execucao.status)} e nao deixou relatorio em ${RELATORIO}. ` +
          `Sem relatorio nao ha nome de caso para ler, e codigo de saida sozinho nao diz ` +
          `QUAL caso reprovou. Rode \`npm run test:integration\` sozinho e leia o erro ` +
          `antes de concluir qualquer coisa.`,
      );
    }

    // O nome sai do RELATORIO TAP, e nao da tela: o relator `spec` marca falha
    // com um sinal grafico que muda entre versoes de Node e some quando a saida
    // nao e terminal. `not ok <n> - <nome>` e formato, nao enfeite.
    const linhas = readFileSync(RELATORIO, 'utf8').split('\n');
    const reprovouPeloNome = linhas.some(
      (l) => /^\s*not ok \d+ - /.test(l) && l.includes(isca.casoQueReprova),
    );
    const reprovouPelaSaida = execucao.status !== 0;

    console.log(`\n--- veredito da isca \`${isca.nome}\` ---`);
    console.log(`  codigo de saida da suite: ${String(execucao.status)}`);
    console.log(`  caso reprovou pelo nome:  ${reprovouPeloNome ? 'sim' : 'NAO'}`);

    if (!reprovouPelaSaida) {
      restaurar();
      morrer(
        `A SUITE PASSOU COM O MECANISMO DESLIGADO (${isca.nome}). O caso ` +
          `"${isca.casoQueReprova}" nao prova nada: o buraco continua aberto com aparencia ` +
          `de fechado, que e exatamente o estado em que o defeito desta semana viveu.`,
      );
    }
    if (!reprovouPeloNome) {
      restaurar();
      morrer(
        `a suite saiu ${String(execucao.status)}, mas o relatorio nao traz o caso ` +
          `"${isca.casoQueReprova}" como reprovado. Sair diferente de zero por compilacao ` +
          `quebrada, por portao de placar ou por banco indisponivel tem a MESMA cor e nao ` +
          `prova que a isca foi pega. Leia a saida acima.`,
      );
    }

    console.log(`ISCA PEGOU: \`${isca.nome}\` derruba o caso que existe para pega-la.`);
    return true;
  } finally {
    restaurar();
  }
}

const filtro = process.argv[2];
const aRodar = filtro === undefined ? ISCAS : ISCAS.filter((i) => i.nome.includes(filtro));
if (aRodar.length === 0) {
  morrer(
    `nenhuma isca com "${filtro}" no nome. As que existem: ${ISCAS.map((i) => i.nome).join(', ')}. ` +
      `Filtro que nao casa nada sairia ZERO sem exercitar isca nenhuma, que e a mesma ` +
      `confianca falsa que estas iscas existem para impedir.`,
  );
}

for (const isca of aRodar) exercitar(isca);

console.log(`\n${String(aRodar.length)} isca(s) exercitada(s), todas pegaram.`);
