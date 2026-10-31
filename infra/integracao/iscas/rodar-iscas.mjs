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
 * AS QUATRO CONFERENCIAS ANTES DE RODAR, E O QUE CADA UMA JA DEIXOU PASSAR
 * ===========================================================================
 * 1. **O caso vive na suite que a isca DECLARA.** Medido em 30/10/2026: duas
 *    iscas rodavam a suite de INTEGRACAO e o caso que pega cada uma mora em
 *    `src/**\/*.test.ts`, que so a UNITARIA roda. A integracao PASSAVA com o
 *    mecanismo desligado, e a isca abortava com "A SUITE PASSOU COM O MECANISMO
 *    DESLIGADO" -- verdade sobre a suite errada, e um convite a culpar o caso.
 *    O caso servia; ninguem o rodava. Esta conferencia tambem mede que o nome
 *    existe e e UNICO na arvore, porque e por nome que o veredito e lido.
 * 2. **A substituicao casa EXATAMENTE UMA VEZ.** Zero casamentos e a isca que
 *    nao morde: a suite fica verde, alguem escreve "conferi, reprova", e a
 *    frase passa a valer por confianca. Mais de um e pior -- ja aconteceu aqui
 *    uma substituicao casar no bloco errado porque duas funcoes tinham texto
 *    identico.
 *      Esta conferencia roda DUAS vezes, e as duas sao necessarias. Antes de
 *    qualquer coisa ser armada, `conferirAncoras` mede as ancoras de TODAS as
 *    iscas e reprova nomeando isca e arquivo (veja o comentario dela para o
 *    que custou aprender isso). Depois, dentro de `exercitar`, a medicao e
 *    repetida por isca, porque e ela que guarda a janela entre a medicao e a
 *    escrita no disco. A conferencia 1 acompanha nas duas passadas, pelo mesmo
 *    motivo.
 * 3. **O SHA-256 do arquivo MUDA**, medido antes e depois. Mesmo hash significa
 *    que nada foi escrito, independente do que o `replace` disse ter feito.
 * 4. **`git diff` NAO e vazio.** Outra testemunha para a mesma pergunta: o hash
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
 *   node infra/integracao/iscas/rodar-iscas.mjs             # todas
 *   node infra/integracao/iscas/rodar-iscas.mjs sem-envio   # so a que casar
 *   node infra/integracao/iscas/rodar-iscas.mjs --conferir  # so a previa
 *
 * Cinco iscas rodam `npm run test:integration` e duas rodam `npm test`, porque
 * e la que mora o caso de cada uma. O campo `suite` diz qual, e a conferencia 1
 * reprova quando o campo discorda do repositorio.
 *
 * `--conferir` faz a passada previa e para: nada e armado e nenhuma pilha sobe.
 * E a forma barata de descobrir que uma isca perdeu o alvo ou aponta para a
 * suite errada -- segundos, em vez da suite inteira. Ele nao substitui a
 * execucao: ancora que casa nao e isca que pega, e so a suite reprovando prova
 * a segunda coisa.
 *
 * O arquivo alterado e restaurado em qualquer desfecho, inclusive `SIGINT`, e a
 * restauracao confere o SHA-256 de volta: restaurar sem conferir deixaria a
 * isca dentro do repositorio, e o proximo commit levaria o defeito junto.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(raiz);

/**
 * AS DUAS SUITES, E POR QUE A ISCA PRECISA ESCOLHER
 * ===========================================================================
 * Ate 30/10/2026 este arquivo rodava `test:integration` para TODA isca, com um
 * unico `RELATORIO`. Duas iscas tem o caso que as pega em `src/**\/*.test.ts`,
 * que e a suite UNITARIA -- e `tsconfig.integracao.json` exclui exatamente esse
 * padrao, de proposito e com medicao no cabecalho dele (235 arquivos a mais,
 * compilacao estourando o teto de ~520 MB que o V8 escolhe dentro do
 * `mem_limit: 1g`, e a integracao deixando de rodar). A de integracao roda
 * `dist/_tests/tests/integration/**`, e nunca rodou aqueles dois casos.
 *
 * O desfecho medido era o PIOR possivel: `janela-de-perda-da-foto-do-achado`
 * armava, a suite de integracao PASSAVA com o mecanismo desligado, e a isca
 * abortava dizendo "A SUITE PASSOU COM O MECANISMO DESLIGADO" -- uma acusacao
 * verdadeira sobre a suite ERRADA. O caso existia, funcionava e estava verde
 * noutra suite.
 *
 * As tres saidas consideradas, e por que esta:
 *
 * - **Mover o caso para `tests/integration/`**: os dois casos sao de ORDEM e de
 *   LEITURA, exercitados com falso em memoria (`montar({})`, `bancoQueDevolve`).
 *   Em `tests/integration/` eles continuariam sem tocar banco nenhum -- teste
 *   unitario morando na pasta da integracao, pagando o preco da pilha para nao
 *   medir nada dela. Pior: o `expurgo` seria medido pelo falso, que devolve a
 *   linha com `sanitized_key` INDEPENDENTE do `select`, entao mover nao
 *   acrescentaria medicao, so mudaria a contagem das duas suites.
 * - **Tirar a exclusao de `tsconfig.integracao.json`**: desfaz uma correcao
 *   medida e devolve a integracao ao estado de nao rodar.
 * - **A isca DECLARA em que suite o caso dela vive** (esta). Cada caso continua
 *   onde pertence, e a isca passa a medir a suite que realmente o roda. Nenhuma
 *   contagem de suite muda, nenhum `tsconfig` e tocado, e a pergunta "em que
 *   suite isto e cobrado?" deixa de ser implicita.
 *
 * O relatorio da integracao e escrito DENTRO da pilha e e alcancavel daqui
 * porque a arvore do worktree e montada no conteiner (`../..:/app` em
 * `compose.integracao.yaml`): o caminho e o mesmo dos dois lados, e por isso a
 * isca le a MESMA evidencia que o portao da suite leu, em vez de uma leitura
 * propria da tela. O da unitaria e escrito pelo proprio processo, em
 * `dist/_tests/unitaria.tap`, e vale pelo mesmo motivo.
 */
const SUITES = {
  integracao: {
    comando: ['run', 'test:integration'],
    relatorio: 'dist/_tests/integracao.tap',
    /** A raiz que `infra/integracao/executar-suite.mjs` varre (`INTEGRACAO`). */
    raizDosCasos: 'tests/integration',
  },
  unidade: {
    comando: ['test'],
    relatorio: 'dist/_tests/unitaria.tap',
    /** A raiz que `infra/suite/executar-unitaria.mjs` varre (`UNITARIA`). */
    raizDosCasos: 'src',
  },
};

/** Onde pode morar um `*.test.ts` deste repositorio que alguma suite roda. */
const RAIZES_DE_CASO = ['src', 'tests'];

const ISCAS = [
  {
    nome: 'sem-envio-da-derivada',
    suite: 'integracao',
    porque:
      'reproduz o defeito de producao desta semana: a funcao de envio escrita e nunca ' +
      'chamada. Nenhum byte de derivada sai do processo, e tudo o mais continua igual -- ' +
      'a foto vira `ready`, o banco grava as chaves, o worker diz `pronta`.',
    alvo: 'src/modules/media/application/processar-foto.ts',
    // REANCORADA EM 30/10/2026 (BICHUS-320). A ancora anterior eram as DUAS
    // chamadas de envio literais, uma do `card` e outra do `thumb`. O arquivo
    // foi refatorado: as derivadas passaram a ser geradas por
    // `DERIVADAS_DA_FOTO_DE_PET` dentro de um laco, e os dois envios viraram UM
    // envio por volta. As duas linhas antigas casavam ZERO vez, a isca abortava
    // aqui, e por abortar na PRIMEIRA ela levava as outras seis com ela.
    //
    // O envio UNICO do laco e o que esta isca quer desligar, e ele e melhor que
    // o par antigo: desligado, NENHUMA derivada sobe -- nao duas delas.
    //
    // A ancora leva a linha seguinte (`geradas.set`) de proposito, por duas
    // razoes. A primeira e unicidade: `await deps.armazenamento.put(` sozinho
    // nao e um texto generico neste arquivo hoje, mas e curto o bastante para
    // casar de novo no dia em que outra variante ganhar um envio proprio. A
    // segunda, e a mais importante, e que o substituto PRECISA repor essa
    // linha: e ela que mantem a isca medindo o defeito certo, e nao outro.
    trecho: `    await deps.armazenamento.put('publico', chave, derivada.bytes, derivada.contentType);
    geradas.set(especificacao.variante, { chave, derivada });`,
    // O `put` sai e o `geradas.set` FICA. E a diferenca entre reproduzir o
    // defeito de producao e so quebrar o processamento: a chave continua sendo
    // gerada, `marcarPronta` continua gravando `card` e `thumb`, o worker
    // continua dizendo `pronta` e o resultado continua `pronta`. So o byte nao
    // sobe. Era exatamente assim que o defeito vivia -- tudo com cara de ter
    // dado certo, e nenhuma foto no balde.
    substituto: `    // ISCA DE BICHUS-245 EM EXECUCAO. Se voce esta lendo isto num arquivo do
    // repositorio, a isca nao foi restaurada e o defeito desta semana voltou:
    // a derivada nunca sai do processo.
    geradas.set(especificacao.variante, { chave, derivada });`,
    casoQueReprova: '1 — o byte sobe pelo caminho do produto e a derivada volta do balde público',
  },
  {
    nome: 'janela-de-perda-da-foto-do-achado',
    suite: 'unidade',
    porque:
      'INVERTE A ORDEM da higiene: apaga o original ANTES de gravar a chave da versao limpa. ' +
      'As duas ordens terminam com a versao limpa no balde e a linha `pronta`, entao nenhum ' +
      'teste de RESULTADO pega a diferenca -- so a ordem denuncia.\n' +
      '  Invertida, a operacao PERDE a foto de quem achou um pet: com o original fora do balde ' +
      'e a intencao ainda `pendente`, um processo que morra no meio faz a readiacao dar `head` ' +
      'no original, achar nada, marcar `ausente` (estado FINAL, que nunca volta) e o aviso fica ' +
      'sem foto nenhuma, para sempre e sem erro em lugar nenhum.\n' +
      '  O cliente decidiu em 17/10/2026 que o original e apagado ("pode apagar o original e ' +
      'guardar so o arquivo 2"), e a troca e segura por UMA razao e so por ela: a ordem.',
    alvo: 'src/modules/media/application/higienizar-foto-do-achado.ts',
    trecho: `  await deps.fotos.marcarHigienizada(foto.uploadIntentId, chave, agora);`,
    substituto: `  // ISCA EM EXECUCAO: a ordem esta INVERTIDA -- o original e apagado ANTES de a
  // chave da versao limpa ser gravada. Se voce esta lendo isto num arquivo do
  // repositorio, a isca nao foi restaurada e existe uma janela em que a foto do
  // achado nao tem nenhuma copia alcancavel.
  await deps.armazenamento.delete('privado', foto.originalKey);
  await deps.fotos.marcarHigienizada(foto.uploadIntentId, chave, agora);`,
    casoQueReprova:
      'a ordem é: sobe a limpa, GRAVA a chave, e SÓ ENTÃO apaga o original',
  },
  {
    nome: 'expurgo-ignora-a-versao-limpa',
    suite: 'unidade',
    porque:
      'faz `chavesDaConta` voltar a ler so `object_key`, sem `sanitized_key`, que era o estado ' +
      'antes desta correcao. Com a decisao de 17/10/2026 a higiene APAGA o original assim que a ' +
      'versao limpa esta gravada, entao `sanitized_key` e a UNICA copia que existe daquela foto ' +
      '-- e o expurgo de conta estaria apagando a copia que a higiene ja apagou sozinha e ' +
      'deixando no balde justamente a que sobrou.\n' +
      '  O agravante e o NUMERO: `objects_deleted` vai para `privacy.account_purged`, e quem ' +
      'audita o art. 18, VI le aquele numero como "arquivos que sairam". Ele sairia afirmando ' +
      'mais do que aconteceu -- o mesmo defeito de leitura que o SEC-020 existe para corrigir.',
    alvo: 'src/modules/media/adapters/persistence/kysely-media-repository.ts',
    // A LEITURA INTEIRA, e nao so a linha do `.select`. Duas razoes MEDIDAS, as
    // duas em 30/10/2026:
    //
    // 1. Trocar so o `.select` NAO COMPILA: as duas linhas logo abaixo leem
    //    `linha.sanitized_key`, e `tsc` reprova com
    //    `Property 'sanitized_key' does not exist`. A imagem nao constroi, a
    //    suite nao roda e nao ha TAP -- a isca sai diferente de zero pela cor
    //    errada. "O build quebrou" nao e o defeito de producao.
    // 2. E, se compilasse, nao mediria nada: o caso usa `bancoQueDevolve`, um
    //    banco falso que devolve a linha com `sanitized_key` INDEPENDENTE do que
    //    `.select` pediu. O `.select` e inerte para o caso; quem produz a lista
    //    e o laco.
    //
    // Entao a isca devolve a leitura ao estado literal de antes de `3ea4c7b5`
    // -- `.select('object_key')`, em string e nao em arranjo, e o laco sem o
    // segundo `push` -- que compila, e o defeito de producao e e o que o caso
    // observa: `chavesDaConta` deixa de devolver a versao limpa.
    trecho: `        .select(['object_key', 'sanitized_key'])
        .where('user_id', '=', dono)
        .execute();
      for (const linha of intencoes) {
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.object_key) });
        if (linha.sanitized_key === null) continue;
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.sanitized_key) });
      }`,
    substituto: `        // ISCA EM EXECUCAO: a leitura voltou ao estado de antes de 3ea4c7b5 -- so
        // \`object_key\`. Se voce esta lendo isto num arquivo do repositorio, a isca
        // nao foi restaurada e o expurgo de conta deixa no balde a unica copia que
        // existe da foto do achado.
        .select('object_key')
        .where('user_id', '=', dono)
        .execute();
      for (const linha of intencoes) {
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.object_key) });
      }`,
    casoQueReprova: 'devolve a versão limpa JUNTO do original',
  },
  {
    nome: 'varredura-apaga-foto-de-achado',
    suite: 'integracao',
    porque:
      'remove o filtro por especie da consulta de envios vencidos, que e o estado em que a ' +
      'varredura APAGAVA a foto de quem acha um pet cerca de dez minutos depois de ela subir. ' +
      'Medido duas vezes com hora no balde de hml: subida 01:18:44 -> apagada 01:29:10; subida ' +
      '01:33:35 -> apagada 01:44:10.\n' +
      '  A causa nao era o filtro: era julgar pelo `confirmed_at` uma foto cujo ciclo de vida ' +
      'nao e `confirmed_at`. A foto do achado NAO TEM operacao de confirmacao no contrato, de ' +
      'proposito, entao ela era PERMANENTEMENTE elegivel -- nao "a desistida". O comentario do ' +
      'codigo afirmava que "nao ha risco de apagar o original de uma foto viva", e aquilo valia ' +
      'para a foto de pet e a imagem de catalogo, que tem confirmacao. O achado era o terceiro ' +
      'caso, e ninguem o considerou.\n' +
      '  Esta isca derruba os casos 1, 2, 4 e 5 e NAO derruba o caso 3, e a assimetria e ' +
      'honesta: o caso 3 e o contrapeso, e exige que o envio ABANDONADO de foto de pet continue ' +
      'sendo limpo. Uma correcao que apenas devolvesse lista vazia passaria 1 e 2 e reprovaria 3.',
    alvo: 'src/modules/media/adapters/persistence/kysely-media-repository.ts',
    // A linha do filtro JUNTO do comentario que a explica: a cadeia
    // `.where('kind', 'not in', ...)` sozinha e curta e generica o bastante para
    // casar de novo no dia em que outra consulta ganhar um filtro parecido, e a
    // conferencia de casamento unico transforma essa escolha em garantia.
    trecho: `        // AS DUAS ESPECIES DO ACHADO FICAM FORA. \`kind\` e NOT NULL, entao o
        // \`not in\` nao tem a armadilha do NULL que faria a linha sumir calada.
        .where('kind', 'not in', [...ESPECIES_DO_ACHADO])`,
    substituto: `        // ISCA EM EXECUCAO: o filtro por especie SAIU. Se voce esta lendo isto num
        // arquivo do repositorio, a isca nao foi restaurada e a varredura voltou a
        // apagar a foto de quem acha um pet, dez minutos depois de ela subir.`,
    casoQueReprova:
      'CASO 1 — a foto do achado (COM conta) NÃO entra na lista de vencidas',
  },
  {
    nome: 'balde-privado-aberto',
    suite: 'integracao',
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
  {
    nome: 'cache-do-libvips-ligado',
    suite: 'integracao',
    porque:
      'religa o cache do libvips, que e o padrao do sharp e o que retinha memoria entre ' +
      'fotos. Uma foto NUNCA estourou -- o limite de 50 megapixels funciona e a inspecao ' +
      'recusa antes de decodificar. O que estourava era a SERIE: medido no container com ' +
      'o `mem_limit: 448m`, dez fotos do pior caso aceito dao 331 -> 632 MiB e morrem no ' +
      'cgroup na SEGUNDA, saida 137. Com o cache desligado, pico de 304 MiB e as dez ' +
      'passam. Um caso que processe UMA foto aprova este defeito, e um caso que use uma ' +
      'foto de 12 megapixels tambem: medido, 12 MP nao estoura nem com o cache ligado.',
    alvo: 'src/modules/media/adapters/external/sharp-image-processor.ts',
    trecho: 'sharp.cache(false);',
    substituto:
      '// ISCA EM EXECUCAO: o cache do libvips esta LIGADO. Se voce esta lendo isto num\n' +
      '// arquivo do repositorio, a isca nao foi restaurada e o worker volta a morrer na\n' +
      '// segunda foto grande.',
    casoQueReprova:
      '1 — dez fotos do pior caso ACEITO em série, e o processo sobrevive dentro do orçamento',
  },
  {
    nome: 'nada-devolve-orfao',
    suite: 'integracao',
    porque:
      'faz a varredura de orfaos nao achar nada, que era o estado antes desta correcao: ' +
      '`claim` so olha `pending`, e `complete`/`fail` exigem processo vivo, entao trabalho ' +
      'cujo processo morreu ficava `running` para sempre e a foto `processing` para sempre ' +
      '-- sem erro, sem alarme e sem ninguem tentando de novo. E o defeito SILENCIOSO, que ' +
      'e o mais caro: a tela do tutor continua girando e nada na maquina acusa.\n' +
      '  Esta isca derruba o caso 2 e NAO derruba o caso 3, e a assimetria e honesta: o ' +
      'caso 3 exige que um trabalho recem-reservado nao seja roubado, e um mecanismo morto ' +
      'satisfaz isso sem fazer nada. Caso que exige ausencia nunca detecta ausencia de ' +
      'mecanismo; quem faz isso e o caso 2.',
    alvo: 'src/shared/queue/kysely-job-queue.ts',
    // `LIMIT ${criterios.limite}` existe uma vez no arquivo inteiro: `claim` usa
    // `LIMIT ${limit}`. Trocar por zero deixa a consulta rodar, compilar e
    // atualizar nada -- que e exatamente o comportamento de antes, em vez de um
    // erro de compilacao com outra cor.
    trecho: 'LIMIT ${criterios.limite}',
    substituto: 'LIMIT 0 -- ISCA EM EXECUCAO: nada devolve orfao',
    casoQueReprova:
      '2 — processo MORTO no meio do trabalho, e a foto NÃO fica presa em processing',
  },
];

/** Todo `*.test.ts` sob `raiz`, em caminho relativo ao repositorio. */
function testesSob(raiz) {
  const saida = [];
  const andar = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = `${dir}/${entrada.name}`;
      if (entrada.isDirectory()) andar(caminho);
      else if (entrada.name.endsWith('.test.ts')) saida.push(caminho);
    }
  };
  if (existsSync(raiz)) andar(raiz);
  return saida;
}

/**
 * Onde, NO REPOSITORIO, mora o caso que a isca diz que vai reprovar -- e se a
 * suite declarada e a que roda aquele arquivo.
 *
 * Esta e a conferencia que faltava em 30/10/2026, e e PREVIA de proposito: sem
 * ela a isca descobria o desencontro depois de armar o defeito e de pagar uma
 * suite inteira, e descobria MAL -- a mensagem acusava "A SUITE PASSOU COM O
 * MECANISMO DESLIGADO", que e uma afirmacao verdadeira sobre a suite errada e
 * leva direto a conclusao de que o caso nao serve. Ele servia; nao era rodado.
 *
 * Devolve `{ arquivo, motivo }`. `motivo` nulo e a aprovacao.
 */
function ondeViveOCaso(isca) {
  const suite = SUITES[isca.suite];
  if (suite === undefined) {
    return {
      arquivo: null,
      motivo:
        `a isca declara a suite "${String(isca.suite)}", que nao existe ` +
        `(as que existem: ${Object.keys(SUITES).join(', ')})`,
    };
  }

  const comOCaso = RAIZES_DE_CASO.flatMap(testesSob).filter((f) =>
    readFileSync(f, 'utf8').includes(isca.casoQueReprova),
  );

  if (comOCaso.length === 0) {
    return {
      arquivo: null,
      motivo:
        `nenhum \`*.test.ts\` deste repositorio contem o caso "${isca.casoQueReprova}". Ou ele ` +
        `foi renomeado, ou foi apagado -- nos dois a isca nao morde: a suite fica verde e o ` +
        `texto da isca passa a valer por confianca. Releia o teste e reancore o ` +
        `\`casoQueReprova\``,
    };
  }
  if (comOCaso.length > 1) {
    return {
      arquivo: null,
      motivo:
        `o caso "${isca.casoQueReprova}" aparece em ${String(comOCaso.length)} arquivos ` +
        `(${comOCaso.join(', ')}), e o veredito le o nome no TAP: nome ambiguo nao diz qual ` +
        `dos casos reprovou. Torne o nome unico antes de confiar nesta isca`,
    };
  }

  const arquivo = comOCaso[0];
  if (!arquivo.startsWith(`${suite.raizDosCasos}/`)) {
    const outra = Object.entries(SUITES).find(([, s]) => arquivo.startsWith(`${s.raizDosCasos}/`));
    return {
      arquivo,
      motivo:
        `a isca declara a suite \`${isca.suite}\`, que roda \`${suite.raizDosCasos}/\`, mas o ` +
        `caso "${isca.casoQueReprova}" mora em ${arquivo}` +
        (outra === undefined
          ? ', que suite nenhuma daqui roda'
          : `, que a suite \`${outra[0]}\` roda`) +
        `. Rodar \`npm ${suite.comando.join(' ')}\` aqui mediria uma suite que NUNCA executa ` +
        `este caso: ela passaria com o mecanismo desligado, e a mensagem resultante acusaria ` +
        `o caso de nao prestar quando o que falta e roda-lo. Corrija o campo \`suite\``,
    };
  }

  return { arquivo, motivo: null };
}

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
  const suite = SUITES[isca.suite];
  if (suite === undefined) {
    morrer(
      `a isca \`${isca.nome}\` declara a suite "${String(isca.suite)}", que nao existe. ` +
        `As que existem: ${Object.keys(SUITES).join(', ')}.`,
    );
  }

  console.log(`\n${'='.repeat(75)}`);
  console.log(`ISCA: ${isca.nome}`);
  console.log(`  alvo:   ${isca.alvo}`);
  console.log(`  suite:  ${isca.suite} (${suite.comando.join(' ')} -> ${suite.relatorio})`);
  console.log(`  porque: ${isca.porque}`);
  console.log(`${'='.repeat(75)}\n`);

  // 1. O caso que a isca diz que reprova EXISTE, e existe na suite declarada.
  //    A segunda testemunha da mesma conferencia que a passada previa ja fez
  //    para todas: aqui ela cobre a janela entre aquela medicao e esta, e cobre
  //    quem chame `exercitar` de outro caminho.
  const { arquivo: arquivoDoCaso, motivo: motivoDoCaso } = ondeViveOCaso(isca);
  if (motivoDoCaso !== null) morrer(`\`${isca.nome}\`: ${motivoDoCaso}.`);
  console.log(`  caso em: ${String(arquivoDoCaso)} (sob ${suite.raizDosCasos}/, que a suite roda)`);

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

  // 2. Casa exatamente uma vez.
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
    // 3. O hash mudou.
    const hashComIsca = sha256(isca.alvo);
    if (hashComIsca === hashAntes) {
      restaurar();
      morrer(
        `o SHA-256 de ${isca.alvo} nao mudou depois da substituicao. Nada foi escrito em ` +
          `disco, e rodar a suite agora mediria o codigo intacto: o veredito seria falso.`,
      );
    }

    // 4. O Git enxerga.
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
    rmSync(suite.relatorio, { force: true });

    const execucao = spawnSync('npm', suite.comando, { stdio: 'inherit' });

    if (!existsSync(suite.relatorio)) {
      restaurar();
      morrer(
        `a suite saiu ${String(execucao.status)} e nao deixou relatorio em ` +
          `${suite.relatorio}. Sem relatorio nao ha nome de caso para ler, e codigo de ` +
          `saida sozinho nao diz QUAL caso reprovou -- compilacao quebrada sai diferente ` +
          `de zero com a MESMA cor de isca pega. Rode ` +
          `\`npm ${suite.comando.join(' ')}\` sozinho e leia o erro antes de concluir ` +
          `qualquer coisa.`,
      );
    }

    // O nome sai do RELATORIO TAP, e nao da tela: o relator `spec` marca falha
    // com um sinal grafico que muda entre versoes de Node e some quando a saida
    // nao e terminal. `not ok <n> - <nome>` e formato, nao enfeite.
    const linhas = readFileSync(suite.relatorio, 'utf8').split('\n');
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

// ===========================================================================
// A CONFERENCIA PREVIA DAS ANCORAS, ANTES DE ARMAR QUALQUER COISA
// ===========================================================================
/**
 * Mede o `trecho` de CADA isca contra o seu alvo e devolve as que nao casam
 * exatamente uma vez.
 *
 * Isto existe por causa do estado em que este arquivo foi encontrado em
 * 30/10/2026, e o estado era o pior possivel: a PRIMEIRA isca tinha a ancora
 * velha. `processar-foto.ts` foi refatorado, a gravacao das derivadas virou
 * laco, e as duas linhas literais que ela procurava deixaram de existir. A
 * conferencia de casamento unico dentro de `exercitar` funcionou -- ela abortou
 * o processo, como manda -- e foi justamente por funcionar que escondeu o
 * resto: o `process.exit(1)` da primeira isca derrubava a execucao e as outras
 * SEIS nunca eram medidas. Nenhuma das sete iscas do projeto podia ser armada,
 * e o sintoma nao se parecia com "ancora velha": parecia um erro no meio da
 * primeira. Duas frentes tropecaram nisso e uma quase concluiu que o proprio
 * trabalho tinha quebrado algo.
 *
 * A conferencia por isca dentro de `exercitar` continua onde estava, e nao e
 * redundante: ela guarda a janela entre esta medicao e a escrita no disco. O
 * que esta funcao acrescenta e a ORDEM e a COMPLETUDE -- todas as ancoras sao
 * medidas antes de a primeira pilha subir, e uma ancora velha REPROVA nomeando
 * a isca e o arquivo, em vez de abortar no meio escondendo as seguintes.
 *
 * As sete sao medidas mesmo quando o filtro seleciona uma: ancora velha numa
 * isca que voce nao pediu e exatamente o defeito que ficou invisivel aqui. O
 * que o filtro muda e o PESO -- quebrada entre as que vao rodar reprova;
 * quebrada fora delas avisa, porque nao e por ela que voce chamou o script.
 */
function conferirAncoras(iscas) {
  const resultado = [];
  for (const isca of iscas) {
    if (!existsSync(isca.alvo)) {
      resultado.push({ isca, casamentos: null, motivo: 'o arquivo alvo NAO EXISTE' });
      continue;
    }
    const casamentos = readFileSync(isca.alvo, 'utf8').split(isca.trecho).length - 1;
    const motivo =
      casamentos === 1
        ? ondeViveOCaso(isca).motivo
        : casamentos === 0
          ? 'a ancora NAO EXISTE MAIS no alvo (o codigo mudou e a isca perdeu o alvo)'
          : 'a ancora casa em MAIS DE UM lugar (a isca desligaria o mecanismo errado)';
    resultado.push({ isca, casamentos, motivo });
  }
  return resultado;
}

/** Reprova com mensagem lida, em vez de estourar com erro cru. */
function reprovar(mensagem) {
  console.error(`\nCONFERENCIA PREVIA REPROVADA: ${mensagem}\n`);
  process.exit(1);
}

const argumentos = process.argv.slice(2);
const soConferir = argumentos.includes('--conferir');
const filtro = argumentos.find((a) => !a.startsWith('--'));
const aRodar = filtro === undefined ? ISCAS : ISCAS.filter((i) => i.nome.includes(filtro));
if (aRodar.length === 0) {
  morrer(
    `nenhuma isca com "${filtro}" no nome. As que existem: ${ISCAS.map((i) => i.nome).join(', ')}. ` +
      `Filtro que nao casa nada sairia ZERO sem exercitar isca nenhuma, que e a mesma ` +
      `confianca falsa que estas iscas existem para impedir.`,
  );
}

const conferencia = conferirAncoras(ISCAS);
const selecionadas = new Set(aRodar.map((i) => i.nome));

console.log(`\nconferencia previa das ancoras das ${String(ISCAS.length)} iscas:`);
for (const { isca, casamentos, motivo } of conferencia) {
  const marca = motivo === null ? 'ok ' : selecionadas.has(isca.nome) ? 'NAO' : 'nao';
  const alcance = selecionadas.has(isca.nome) ? 'vai rodar' : 'fora do filtro';
  console.log(
    `  [${marca}] ${isca.nome} (${alcance})\n` +
      `         ${isca.alvo} -- casa ${casamentos === null ? 'arquivo ausente' : String(casamentos)} vez(es)`,
  );
}

const quebradasFora = conferencia.filter((c) => c.motivo !== null && !selecionadas.has(c.isca.nome));
for (const { isca, casamentos, motivo } of quebradasFora) {
  console.error(
    `\nAVISO: a isca \`${isca.nome}\` nao passa a conferencia previa ` +
      `(alvo ${isca.alvo}, casa ` +
      `${casamentos === null ? 'arquivo ausente' : String(casamentos)} vez(es)): ${motivo}. ` +
      `Ela esta FORA do filtro desta execucao, entao nao reprova aqui -- mas ela nao pode ser ` +
      `armada por ninguem enquanto estiver assim.`,
  );
}

const quebradasQueVaoRodar = conferencia.filter(
  (c) => c.motivo !== null && selecionadas.has(c.isca.nome),
);
if (quebradasQueVaoRodar.length > 0) {
  reprovar(
    `${String(quebradasQueVaoRodar.length)} de ${String(aRodar.length)} isca(s) desta execucao ` +
      `REPROVOU na conferencia previa, e nenhuma suite foi executada. Toda isca precisa casar ` +
      `EXATAMENTE UMA VEZ no seu alvo antes de qualquer coisa ser armada -- zero e a isca que ` +
      `nao morde (a suite fica verde e alguem le isso como prova), mais de um desliga o ` +
      `mecanismo errado -- e precisa declarar a suite que REALMENTE roda o caso que ela diz ` +
      `que reprova.\n` +
      quebradasQueVaoRodar
        .map(
          ({ isca, casamentos, motivo }) =>
            `\n  isca:      \`${isca.nome}\`\n` +
            `  arquivo:   ${isca.alvo}\n` +
            `  casamentos: ${casamentos === null ? 'arquivo ausente' : String(casamentos)} ` +
            `${casamentos === 1 ? '(a ancora esta boa: o motivo acima e OUTRO)' : '(precisa ser 1)'}\n` +
            `  motivo:    ${motivo}\n` +
            `  conserto:  releia ${isca.alvo} e reancore o campo \`trecho\` desta isca no codigo\n` +
            `             como ele e HOJE, sem mudar o que a isca mede. Se o motivo acima fala\n` +
            `             de SUITE, o campo a corrigir e \`suite\`, e nao \`trecho\`.`,
        )
        .join('\n'),
  );
}

console.log(
  `\ntodas as ${String(ISCAS.length)} ancoras casam exatamente uma vez, e o caso de cada ` +
    `isca mora na suite que ela declara. ${String(aRodar.length)} isca(s) a exercitar.`,
);

if (soConferir) {
  console.log('`--conferir`: so a conferencia previa. Nada foi armado e nenhuma suite subiu.');
  process.exit(0);
}

for (const isca of aRodar) exercitar(isca);

console.log(`\n${String(aRodar.length)} isca(s) exercitada(s), todas pegaram.`);
