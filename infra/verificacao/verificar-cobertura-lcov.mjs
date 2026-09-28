#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * Os relatorios de cobertura falam de `src/**\/*.ts`? E falam de TODOS eles?
 *
 * ====================================================================
 * POR QUE ESTE VERIFICADOR EXISTE
 * ====================================================================
 *
 * O SonarCloud nao reclama de relatorio de cobertura que ele nao consegue
 * casar com nenhum arquivo. Ele so nao encontra nada, registra a analise com
 * 0% e segue verde. O scanner devolve 0, o job fica verde, o painel mostra
 * "0.0% Coverage", e quem olha conclui que ninguem escreveu teste -- quando o
 * que aconteceu foi o relatorio ter sido gerado apontando para o lugar errado.
 *
 * O caminho errado nao e hipotese. `npm test` compila TypeScript para
 * `dist/_tests/` e roda o JavaScript compilado. O reporter `lcov` do Node
 * grava, por padrao, o caminho do arquivo QUE ELE EXECUTOU:
 *
 *   SF:dist/_tests/src/shared/id/uuidv7.js      <- inutil para o Sonar
 *
 * So com `--enable-source-maps` o reporter atravessa o source map e grava a
 * origem:
 *
 *   SF:src/shared/id/uuidv7.ts                  <- e isto que o Sonar casa
 *
 * Uma flag. Ela cai de um comando qualquer dia, e nada acusa. Daqui em diante,
 * acusa.
 *
 * ====================================================================
 * O SEGUNDO DEFEITO, QUE ESTE ARQUIVO DEIXAVA PASSAR EM SILENCIO
 * ====================================================================
 *
 * Ate 22/09 este verificador conferia NUMA DIRECAO SO: que todo caminho DENTRO
 * do relatorio existia NO DISCO. Ele nunca conferia o contrario. Medido: os 82
 * caminhos do lcov existiam todos, o verificador aprovava, e 40 arquivos de
 * producao de `src` -- ausentes do relatorio -- passavam calados. Para o
 * SonarCloud, arquivo de fonte SEM dado de cobertura e arquivo com 0%.
 *
 * A frase que explica a cegueira, e que vale para todo portao deste projeto:
 *
 *   VERIFICACAO QUE PARTE DO ARTEFATO SO CONSEGUE ERRAR SOBRE O QUE ESTA NO
 *   ARTEFATO. O conjunto de partida era o proprio relatorio, entao o que
 *   faltava nele nunca chegava a ser examinado. As quatro iscas antigas sao
 *   todas relatorios MAL FORMADOS -- caminho compilado, relatorio vazio,
 *   caminho inexistente, relatorio legitimo -- e nenhuma delas e um arquivo
 *   que o relatorio deixou de mencionar. Para enxergar ausencia, o conjunto de
 *   partida tem de ser O DISCO, e o relatorio passa a ser o que se confere
 *   CONTRA ele.
 *
 * Por isso a regra nova (`conferirAusencias`) parte da lista de fontes que o
 * SonarCloud indexa, lida de `sonar-project.properties`, e nao de uma copia
 * escrita aqui: duas listas divergem, e a que diverge para menos aprova o que
 * nao conferiu.
 *
 * ====================================================================
 * A PROVA NEGATIVA RODA JUNTO, SEMPRE
 * ====================================================================
 *
 * Antes de olhar para os relatorios de verdade, este script roda as iscas de
 * `infra/verificacao/iscas/`:
 *
 *   lcov-deve-reprovar-caminho-compilado.info       aponta para dist/**\/*.js
 *   lcov-deve-reprovar-sem-cobertura.info           relatorio gerado e vazio
 *   lcov-deve-reprovar-arquivo-inexistente.info     caminho que nao existe no disco
 *   lcov-deve-reprovar-arquivo-de-src-ausente.info  fonte que o relatorio NAO cita
 *   lcov-deve-passar.info                           relatorio legitimo
 *
 * As quatro primeiras PRECISAM reprovar; a quinta PRECISA passar -- e ela e
 * avaliada com a regra de ausencia LIGADA, senao um verificador que acusasse
 * ausencia de tudo passaria por verificador que funciona. Se qualquer uma der
 * o resultado errado, este script falha com "o verificador de cobertura parou
 * de verificar" e NAO chega a avaliar os relatorios reais.
 *
 * Uso:
 *   node infra/verificacao/verificar-cobertura-lcov.mjs [lcov...]
 * Padrao: coverage/lcov.info coverage/lcov-integracao.info
 * Saida: 0 aprovado, 1 reprovado.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VERSAO_DO_VERIFICADOR = '2.0.0';

const RELATORIOS_PADRAO = ['coverage/lcov.info', 'coverage/lcov-integracao.info'];
const PROPRIEDADES_DO_SONAR = 'sonar-project.properties';

/**
 * Os sufixos que o SonarCloud analisa como fonte JavaScript/TypeScript
 * (`sonar.javascript.file.suffixes` e `sonar.typescript.file.suffixes`, nos
 * padroes). Tirar um daqui tira arquivo da conferencia de ausencia sem tirar
 * nada da analise do Sonar, que e exatamente o furo que esta lista fecha.
 */
const SUFIXOS_DE_FONTE = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'];

const DIR_DAS_ISCAS = 'infra/verificacao/iscas';

// ---------------------------------------------------------------------------
// AS AUSENCIAS ACEITAS. Lista EXPLICITA, caminho a caminho, com motivo.
// ---------------------------------------------------------------------------
/*
 * NAO transforme isto em expressao regular nem em prefixo de diretorio.
 * Excecao larga recria o furo que a regra de ausencia existe para fechar: um
 * `src/modules/**\/adapters/persistence/**` deixaria de fora todo adaptador
 * FUTURO, inclusive os que alguem for escrever amanha sem teste nenhum.
 *
 * Tres invariantes valem para esta lista, e as tres REPROVAM:
 *
 *   1. caminho que nao existe mais no disco -> a lista apodreceu;
 *   2. caminho que JA APARECE em algum relatorio -> a excecao ficou obsoleta e
 *      precisa sair (e o que faz a lista encolher sozinha quando o teste
 *      chega, em vez de virar um deposito permanente);
 *   3. fonte ausente do relatorio que NAO esta aqui -> o furo novo.
 *
 * As duas primeiras sao o que impede esta lista de virar `sonar.exclusions`
 * disfarcado.
 */
const SO_TIPO =
  'so declara tipo (interface, type, generico). O TypeScript apaga tudo na compilacao, o ' +
  'JavaScript resultante nao tem instrucao nenhuma, e arquivo sem instrucao nao produz registro ' +
  'em relatorio de cobertura de runtime NENHUM. Cobrar presenca aqui seria cobrar o impossivel; ' +
  'o Sonar tambem nao poe estes arquivos no denominador, porque nao ha linha executavel para cobrir.';
const PONTO_DE_ENTRADA =
  'ponto de entrada de processo: o que ele faz e montar a fiacao, ouvir porta e encerrar. Medi-lo ' +
  'exige subir o processo SOB instrumentacao e recolher o relatorio na parada, que e entrega ' +
  'propria e nao efeito colateral desta. DIVIDA REGISTRADA, nao isencao.';
const SEM_SUITE_QUE_CARREGUE =
  'adaptador que NENHUMA das duas suites carrega hoje -- medido em 22/09, nao suposto: a suite de ' +
  'integracao cobre identidade, auditoria e o pool de conexao, e nao chega a este modulo. DIVIDA ' +
  'DE TESTE REGISTRADA. No dia em que um teste tocar o arquivo, esta entrada passa a reprovar por ' +
  'obsoleta e sai da lista.';
const FERRAMENTA_FORA_DO_RUNTIME =
  'roda fora do runtime da aplicacao (regra de ESLint / gerador de tipos), em processo que nenhuma ' +
  'suite instrumenta. Entra em `sonar.sources` por estar sob `src/`; nao e codigo que chega ao usuario.';

const AUSENCIAS_ACEITAS = new Map([
  // -- so tipo: o compilado nao tem uma instrucao sequer ---------------------
  // `audit/ports/audit-log.ts` saiu daqui na BICHUS-259: passou a exportar
  // `ACOES_ADMINISTRATIVAS`, que e valor, e a suite o carrega.
  // As cinco de 22/09, que chegaram com o alerta, a conversa mediada, o achado
  // avulso e o aparelho. Cada uma esta nomeada, uma linha por arquivo, pelo
  // motivo escrito no topo desta lista: um prefixo `src/modules/**/ports/**`
  // seria uma linha a menos e dispensaria de antemao toda porta FUTURA,
  // inclusive a que alguem escrever amanha ja com codigo de verdade dentro.
  // Conferido arquivo a arquivo: nenhuma das cinco declara `const`, `function`,
  // `class` ou `enum`, entao o compilado nao tem uma instrucao sequer.
  // ADR-0027 item 20: as tres portas de `admin-access` que so declaram tipos.
  // A da sessao veio de `identity/ports/`; as outras duas nasceram com o
  // cadastro proprio do painel. `verificador-de-captcha.ts` NAO esta aqui: ela
  // exporta valor, e o teste do reCAPTCHA a carrega.
  ['src/modules/admin-access/ports/aviso-por-email.ts', SO_TIPO],
  ['src/modules/admin-access/ports/repositorio-de-contas-administrativas.ts', SO_TIPO],
  ['src/modules/admin-access/ports/sessao-administrativa-repository.ts', SO_TIPO],
  ['src/modules/found/ports/found-report-repository.ts', SO_TIPO],
  ['src/modules/identity/application/dependencies.ts', SO_TIPO],
  ['src/modules/identity/ports/identity-repository.ts', SO_TIPO],
  ['src/modules/identity/ports/localizacao-de-referencia-repository.ts', SO_TIPO],
  ['src/modules/identity/ports/mailer.ts', SO_TIPO],
  ['src/modules/identity/ports/token-signer.ts', SO_TIPO],
  ['src/modules/lostfound/ports/alcance-do-alerta.ts', SO_TIPO],
  ['src/modules/lostfound/ports/entrega-do-alerta.ts', SO_TIPO],
  ['src/modules/lostfound/ports/lost-case-repository.ts', SO_TIPO],
  ['src/modules/lostfound/ports/registro-de-disparos.ts', SO_TIPO],
  ['src/modules/media/ports/image-processor.ts', SO_TIPO],
  ['src/modules/media/ports/media-repository.ts', SO_TIPO],
  ['src/modules/messaging/ports/conversation-repository.ts', SO_TIPO],
  ['src/modules/network/ports/network-repository.ts', SO_TIPO],
  ['src/modules/notifications/ports/registro-de-aparelhos.ts', SO_TIPO],
  ['src/modules/notifications/ports/registro-de-entregas.ts', SO_TIPO],
  ['src/modules/pets/ports/fotos-do-pet.ts', SO_TIPO],
  ['src/modules/pets/ports/pet-repository.ts', SO_TIPO],
  ['src/modules/pets/ports/reference-data-repository.ts', SO_TIPO],
  // Chegou com o `Perto` com dados (23/09). Conferida pelo MESMO criterio das
  // outras: nao declara `const`, `function`, `class` nem `enum`, e o compilado
  // em `dist/_tests` e `export {};` -- 59 bytes, nenhuma instrucao.
  ['src/modules/professionals/ports/directory-repository.ts', SO_TIPO],
  // Chegou com a `Loja` (23/09). Conferida pelo MESMO criterio das outras:
  // nao declara `const`, `function`, `class` nem `enum`, e o compilado em
  // `dist/_tests` e `export {};` -- 55 bytes, nenhuma instrucao.
  ['src/modules/store/ports/store-repository.ts', SO_TIPO],
  ['src/modules/tags/ports/autenticador.ts', SO_TIPO],
  ['src/modules/tags/ports/rasterizador-de-qr.ts', SO_TIPO],
  ['src/modules/tags/ports/tag-repository.ts', SO_TIPO],
  ['src/modules/transfers/ports/transfer-repository.ts', SO_TIPO],
  ['src/shared/db/schema.ts', SO_TIPO],
  ['src/shared/ports/id-generator.ts', SO_TIPO],
  ['src/shared/ports/job-queue.ts', SO_TIPO],
  ['src/shared/ports/rate-limit-store.ts', SO_TIPO],
  ['src/shared/ports/secret-cipher.ts', SO_TIPO],
  ['src/shared/types/brands.ts', SO_TIPO],

  // -- pontos de entrada -----------------------------------------------------
  ['src/bin/api.ts', PONTO_DE_ENTRADA],
  ['src/bin/worker.ts', PONTO_DE_ENTRADA],
  // `src/bin/seed.ts` SAIU em 23/09, pela invariante 2 desta lista. Ele passou
  // a APARECER nos dois relatorios (`src/bin/seed.test.ts` chegou com o `Perto`
  // com dados), e dispensa que sobra depois de o teste chegar e o comeco de uma
  // lista que so cresce. Quem acusou foi o proprio verificador, e ele acusou no
  // fechamento -- que e onde ele tem de acusar.

  // -- adaptadores que nenhuma suite carrega ---------------------------------
  //
  // Sairam em 22/09, pela invariante 2 desta lista: `kysely-pet-repository.ts` e
  // `kysely-tag-repository.ts` passaram a APARECER no relatorio de integracao
  // (`autorizacao-de-pets-e-fotos.test.ts` e `reimpressao-do-qr-e-do-dono.
  // test.ts` carregam os dois), e dispensa que sobra depois de o teste chegar e
  // o comeco de uma lista que so cresce. No fechamento do dia saiu tambem
  // `kysely-lost-case-repository.ts`, pelo mesmo motivo: o proprio verificador
  // acusou a excecao como obsoleta.
  //
  // SAIRAM TRES EM 28/09, pela mesma invariante 2, e o verificador acusou as
  // tres no fechamento:
  //
  // - `media-service.ts` e `processar-foto.ts` passaram a APARECER no relatorio
  //   de integracao quando a bancada da BICHUS-245
  //   (`tests/integration/foto-de-ponta-a-ponta.test.ts`) mesclou na
  //   development: ela importa os dois e exercita a foto de ponta a ponta. As
  //   duas entradas ja estavam obsoletas antes da correcao do worker.
  // - `kysely-job-queue.ts` passou a aparecer com
  //   `tests/integration/worker-sobrevive-a-serie-e-nao-deixa-foto-presa.test.ts`,
  //   que exercita `enqueue` e a recuperacao de orfao contra Postgres de
  //   verdade.
  //
  // E SAIU UMA QUARTA, no mesmo fechamento de 28/09, esta pelo motivo e nao pelo
  // relatorio: `src/modules/media/ports/object-storage.ts` estava como `SO_TIPO`,
  // e deixou de ser so tipo. O conserto de prazo do armazenamento de objeto poe
  // `PrazoDoArmazenamentoEsgotadoError` -- uma CLASSE, com codigo que sobrevive a
  // compilacao -- dentro da porta, entao o arquivo passou a ter linha
  // instrumentada e a aparecer nos dois relatorios. Nenhuma das quatro foi
  // deduzida: a invariante 2 acusou cada uma pelo nome, e este verificador roda
  // em `verificar-cobertura`, dentro de `make verificar`.
  ['src/modules/notifications/adapters/persistence/kysely-registro-de-entregas.ts', SEM_SUITE_QUE_CARREGUE],
  ['src/modules/pets/adapters/persistence/kysely-reference-data-repository.ts', SEM_SUITE_QUE_CARREGUE],
  [
    'src/shared/ports/index.ts',
    're-exportacao de portas. So `SegredoIndisponivelError` sobrevive a compilacao, e quem precisa ' +
      'dele importa do arquivo de origem, entao nenhuma suite carrega ESTE modulo. DIVIDA ' +
      'REGISTRADA pelo mesmo criterio dos adaptadores.',
  ],

  // -- ferramenta que nao roda no runtime da aplicacao -----------------------
  ['src/architecture.rules.mjs', FERRAMENTA_FORA_DO_RUNTIME],
  ['src/tools/gerar-tipos-de-problema.mjs', FERRAMENTA_FORA_DO_RUNTIME],
]);

// ---------------------------------------------------------------------------
// Leitura de lcov
// ---------------------------------------------------------------------------
/**
 * Le um lcov e devolve os registros que interessam.
 * Formato: linhas `SF:<caminho>`, `DA:<linha>,<execucoes>`,
 * `LF:<linhas instrumentadas>`, `LH:<linhas cobertas>`, terminadas por
 * `end_of_record`.
 */
function lerLcov(texto) {
  const registros = [];
  let atual = null;
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim();
    if (linha.startsWith('SF:')) {
      atual = { caminho: linha.slice(3), lf: 0, lh: 0, linhas: new Map() };
      registros.push(atual);
    } else if (atual && linha.startsWith('DA:')) {
      const [n, h] = linha.slice(3).split(',');
      const numero = Number(n);
      const vezes = Number(h) || 0;
      atual.linhas.set(numero, Math.max(atual.linhas.get(numero) ?? 0, vezes));
    } else if (atual && linha.startsWith('LF:')) {
      atual.lf = Number(linha.slice(3)) || 0;
    } else if (atual && linha.startsWith('LH:')) {
      atual.lh = Number(linha.slice(3)) || 0;
    } else if (linha === 'end_of_record') {
      atual = null;
    }
  }
  return registros;
}

/**
 * A UNIAO dos relatorios, por LINHA.
 *
 * Linha coberta em QUALQUER um dos relatorios conta como coberta, que e como o
 * SonarCloud agrega varios `sonar.javascript.lcov.reportPaths`. Somar `LF:`/`LH:`
 * dos arquivos que aparecem nos dois contaria a mesma linha duas vezes e
 * inflaria denominador e numerador juntos, sem ninguem notar.
 */
function unirRelatorios(porRelatorio) {
  const uniao = new Map();
  for (const registros of porRelatorio) {
    for (const r of registros) {
      if (!uniao.has(r.caminho)) uniao.set(r.caminho, new Map());
      const destino = uniao.get(r.caminho);
      for (const [n, vezes] of r.linhas) destino.set(n, Math.max(destino.get(n) ?? 0, vezes));
    }
  }
  return uniao;
}

// ---------------------------------------------------------------------------
// O recorte do SonarCloud, lido de sonar-project.properties
// ---------------------------------------------------------------------------
/**
 * Padrao no estilo do Sonar (ant-like) para expressao regular ancorada.
 *
 * `**` atravessa diretorio; `*` para na barra; `?` e um caractere que nao e
 * barra. `**\/` precisa virar "zero ou mais diretorios", e nao `.*\/`, senao
 * `**\/*.g.ts` deixaria de casar `a.g.ts` na raiz.
 */
function padraoParaRegex(padrao) {
  let saida = '';
  for (let i = 0; i < padrao.length; i += 1) {
    const c = padrao[i];
    if (c === '*' && padrao[i + 1] === '*') {
      if (padrao[i + 2] === '/') {
        saida += '(?:[^/]+/)*';
        i += 2;
      } else {
        saida += '.*';
        i += 1;
      }
    } else if (c === '*') {
      saida += '[^/]*';
    } else if (c === '?') {
      saida += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      saida += `\\${c}`;
    } else {
      saida += c;
    }
  }
  return new RegExp(`^${saida}$`);
}

function lerPropriedades(caminho) {
  const mapa = new Map();
  for (const bruta of readFileSync(caminho, 'utf8').split('\n')) {
    const linha = bruta.trim();
    if (linha === '' || linha.startsWith('#')) continue;
    const igual = linha.indexOf('=');
    if (igual === -1) continue;
    mapa.set(linha.slice(0, igual).trim(), linha.slice(igual + 1).trim());
  }
  return mapa;
}

function varrer(raiz) {
  if (!existsSync(raiz)) return [];
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else saida.push(caminho);
    }
  };
  if (statSync(raiz).isDirectory()) andar(raiz);
  else saida.push(raiz);
  return saida.sort();
}

/**
 * Os arquivos que o SonarCloud indexa como FONTE (nao como teste).
 *
 * Derivado de `sonar-project.properties`, e nao escrito aqui: no dia em que
 * alguem ampliar `sonar.sources` ou mexer em `sonar.exclusions`, esta conta
 * acompanha. Uma copia nao acompanharia, e a copia que ficasse para tras
 * aprovaria justamente o arquivo novo.
 */
function fontesQueOSonarIndexa(propriedades) {
  const lista = (chave) =>
    (propriedades.get(chave) ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');

  const fora = [...lista('sonar.exclusions'), ...lista('sonar.test.inclusions')].map(padraoParaRegex);
  const arquivos = new Set();
  for (const raiz of lista('sonar.sources')) {
    for (const caminho of varrer(raiz)) {
      if (!SUFIXOS_DE_FONTE.some((s) => caminho.endsWith(s))) continue;
      if (fora.some((r) => r.test(caminho))) continue;
      arquivos.add(caminho);
    }
  }
  return [...arquivos].sort();
}

// ---------------------------------------------------------------------------
// AS REGRAS, EM FUNCOES PURAS -- e as iscas chamam estas mesmas.
// ---------------------------------------------------------------------------

/**
 * A regra que faltava. Parte da FONTE e confere contra o relatorio.
 *
 * Devolve as tres familias de falha separadas, porque elas se consertam de
 * jeitos diferentes.
 */
function conferirAusencias(fontes, caminhosNoRelatorio, aceitas) {
  const noRelatorio = new Set(caminhosNoRelatorio);
  const ausentes = fontes.filter((f) => !noRelatorio.has(f) && !aceitas.has(f));
  const excecoesQuePodemSair = [...aceitas.keys()].filter((f) => noRelatorio.has(f));
  const excecoesPodres = [...aceitas.keys()].filter((f) => !noRelatorio.has(f) && !existsSync(f));
  return { ausentes, excecoesQuePodemSair, excecoesPodres };
}

/** As acusacoes da regra de ausencia, ja em texto. */
function acusacoesDeAusencia({ ausentes, excecoesQuePodemSair, excecoesPodres }) {
  const falhas = [];
  for (const f of ausentes) {
    falhas.push(
      `\`${f}\` e fonte para o SonarCloud e esta ausente do relatorio de cobertura. Arquivo de ` +
        'fonte SEM dado de cobertura e, para o Sonar, arquivo com 0% -- e ele nao reclama disso, ' +
        'so publica o numero. Ou uma suite passa a carregar este arquivo, ou ele entra em ' +
        '`AUSENCIAS_ACEITAS` deste verificador COM o motivo escrito.',
    );
  }
  for (const f of excecoesQuePodemSair) {
    falhas.push(
      `\`${f}\` esta em \`AUSENCIAS_ACEITAS\` e JA APARECE no relatorio. A excecao ficou obsoleta: ` +
        'apague a entrada. Excecao que sobra depois de o teste chegar e o comeco de uma lista que ' +
        'so cresce.',
    );
  }
  for (const f of excecoesPodres) {
    falhas.push(
      `\`${f}\` esta em \`AUSENCIAS_ACEITAS\` e nao existe no disco. A lista apodreceu, e lista ` +
        'podre dispensa arquivo que ninguem consegue mais achar.',
    );
  }
  return falhas;
}

/**
 * Avalia UM relatorio, isolado: forma dos caminhos e existencia no disco.
 *
 * `conferirNoDisco` existe para as iscas: algumas sao fragmentos que falam de
 * arquivos que nao existem de proposito, e a conferencia de disco tem isca
 * propria.
 */
function avaliarRelatorio(caminhoDoLcov, { conferirNoDisco }) {
  const falhas = [];

  if (!existsSync(caminhoDoLcov)) {
    falhas.push(
      `${caminhoDoLcov}: relatorio de cobertura nao encontrado. O passo que o gera nao rodou, ` +
        'ou gravou em outro lugar. O Sonar aceitaria a ausencia em silencio e publicaria 0%.',
    );
    return { falhas, registros: [] };
  }

  const texto = readFileSync(caminhoDoLcov, 'utf8');
  const registros = lerLcov(texto);

  if (registros.length === 0) {
    falhas.push(
      `${caminhoDoLcov}: o relatorio existe e nao declara nenhum arquivo (nenhuma linha \`SF:\`). ` +
        'Relatorio vazio e pior que relatorio ausente: ele publica 0% como se fosse medicao.',
    );
    return { falhas, registros };
  }

  for (const { caminho } of registros) {
    if (caminho.startsWith('/') || caminho.startsWith('..')) {
      falhas.push(
        `${caminhoDoLcov}: caminho absoluto ou fora do projeto: \`${caminho}\`. O Sonar casa ` +
          'caminho relativo a raiz do projeto; absoluto do runner nao casa com nada.',
      );
      continue;
    }
    if (!caminho.endsWith('.ts')) {
      falhas.push(
        `${caminhoDoLcov}: \`${caminho}\` nao e um arquivo TypeScript de origem. O relatorio foi ` +
          'gerado sobre o JavaScript compilado. Rode o teste com `--enable-source-maps`: sem essa ' +
          'flag o reporter grava o caminho de `dist/`, o Sonar nao casa nenhum arquivo e a analise ' +
          'sobe com 0% sem erro nenhum.',
      );
      continue;
    }
    if (conferirNoDisco && !existsSync(caminho)) {
      falhas.push(
        `${caminhoDoLcov}: \`${caminho}\` nao existe no disco. Caminho que o Sonar nao encontra e ` +
          'cobertura que ele descarta em silencio.',
      );
    }
  }

  const lf = registros.reduce((soma, r) => soma + r.lf, 0);
  const lh = registros.reduce((soma, r) => soma + r.lh, 0);
  if (lf === 0) {
    falhas.push(
      `${caminhoDoLcov}: zero linhas instrumentadas (soma de \`LF:\` e 0). Nada foi medido.`,
    );
  } else if (lh === 0) {
    falhas.push(
      `${caminhoDoLcov}: ${lf} linhas instrumentadas e nenhuma coberta. Ou o relatorio esta ` +
        'corrompido, ou nenhum teste executou.',
    );
  }

  const producao = registros.filter((r) => !r.caminho.endsWith('.test.ts'));
  if (producao.length === 0) {
    falhas.push(
      `${caminhoDoLcov}: o relatorio so fala de arquivos de teste. Cobertura medida sobre os ` +
        'proprios testes e 100% garantido e informacao nenhuma.',
    );
  }

  return { falhas, registros };
}

// ---------------------------------------------------------------------------
// Autoteste: as iscas. E a parte que importa.
// ---------------------------------------------------------------------------
const ISCAS_QUE_REPROVAM = [
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-caminho-compilado.info`,
    conferirNoDisco: false,
    fontesEsperadas: [],
    exigeNaSaida: 'enable-source-maps',
  },
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-sem-cobertura.info`,
    conferirNoDisco: false,
    fontesEsperadas: [],
    exigeNaSaida: 'nenhum arquivo',
  },
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-arquivo-inexistente.info`,
    conferirNoDisco: true,
    fontesEsperadas: [],
    exigeNaSaida: 'nao existe no disco',
  },
  {
    // A ISCA NOVA. Relatorio impecavel em tudo que as outras tres conferem, e
    // que simplesmente NAO MENCIONA uma das fontes. As outras tres passam nela,
    // e e por isso que ela precisa existir separada.
    //
    // As fontes sao ficticias de proposito, pelo mesmo motivo que a contraprova
    // nao confere disco: amarrar a isca a um caminho real do backend faria este
    // portao quebrar no dia em que alguem renomear um arquivo que nao tem nada
    // a ver com ele.
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-arquivo-de-src-ausente.info`,
    conferirNoDisco: false,
    fontesEsperadas: ['src/exemplo/de/isca-presente.ts', 'src/exemplo/de/isca-ausente.ts'],
    exigeNaSaida: 'ausente do relatorio de cobertura',
  },
];

const ISCA_QUE_PASSA = {
  arquivo: `${DIR_DAS_ISCAS}/lcov-deve-passar.info`,
  conferirNoDisco: false,
  // COM a regra de ausencia LIGADA e satisfeita: sem isto, um verificador que
  // acusasse ausencia de qualquer coisa passaria por verificador que funciona.
  fontesEsperadas: ['src/exemplo/de/contraprova.ts'],
};

/** Casos de mesa para `padraoParaRegex`: regex frouxa aqui alarga toda a excecao. */
const CASOS_DE_PADRAO = [
  ['src/**/*.test.ts', 'src/a/b/c.test.ts', true],
  ['src/**/*.test.ts', 'src/a.test.ts', true],
  ['src/**/*.test.ts', 'src/a/b/c.ts', false],
  ['src/shared/types/generated/**', 'src/shared/types/generated/api.ts', true],
  ['src/shared/types/generated/**', 'src/shared/types/gerado/api.ts', false],
  ['**/*.g.ts', 'a.g.ts', true],
  ['**/*.g.ts', 'src/a/b.g.ts', true],
  ['**/*.g.ts', 'src/a/b.ts', false],
  ['tests/**/*', 'tests/integration/x.test.ts', true],
  ['tests/**/*', 'src/x.ts', false],
  // O caso que uma regex preguicosa (`*` -> `.*`) erraria: `*` NAO atravessa barra.
  ['src/*.ts', 'src/a/b.ts', false],
  ['app/**', 'app/lib/main.dart', true],
];

/** Avalia uma isca com TODAS as regras ligadas, como o relatorio real e avaliado. */
function acusacoesDaIsca(isca) {
  const { falhas, registros } = avaliarRelatorio(isca.arquivo, {
    conferirNoDisco: isca.conferirNoDisco,
  });
  return [
    ...falhas,
    ...acusacoesDeAusencia(
      conferirAusencias(
        isca.fontesEsperadas,
        registros.map((r) => r.caminho),
        new Map(),
      ),
    ),
  ];
}

function rodarIscas() {
  const falhas = [];

  for (const [padrao, caminho, esperado] of CASOS_DE_PADRAO) {
    const obtido = padraoParaRegex(padrao).test(caminho);
    if (obtido !== esperado) {
      falhas.push(
        `padrao \`${padrao}\` contra \`${caminho}\`: esperado ${String(esperado)}, obtido ` +
          `${String(obtido)}. A leitura de \`sonar-project.properties\` deixou de casar o que o ` +
          'Sonar casa, e a lista de fontes conferidas nao e mais a lista que ele analisa.',
      );
    }
  }

  for (const isca of ISCAS_QUE_REPROVAM) {
    if (!existsSync(isca.arquivo)) {
      falhas.push(
        `${isca.arquivo}: a isca sumiu do repositorio. Sem ela este verificador passa a valer por ` +
          'confianca no dia em que foi escrito.',
      );
      continue;
    }
    const acusacoes = acusacoesDaIsca(isca);
    if (acusacoes.length === 0) {
      falhas.push(
        `${isca.arquivo}: A ISCA PASSOU. O verificador de cobertura parou de verificar, e daqui ` +
          'para a frente o verde dele nao significa nada.',
      );
      continue;
    }
    if (!acusacoes.some((a) => a.includes(isca.exigeNaSaida))) {
      falhas.push(
        `${isca.arquivo}: a isca reprovou, mas por outro motivo. Ela existe para provar a acusacao ` +
          `contendo "${isca.exigeNaSaida}", e essa acusacao nao apareceu. Reprovar por acaso nao e ` +
          'reprovar pelo motivo certo.',
      );
    }
  }

  if (!existsSync(ISCA_QUE_PASSA.arquivo)) {
    falhas.push(
      `${ISCA_QUE_PASSA.arquivo}: a contraprova sumiu do repositorio. Sem ela, um verificador que ` +
        'reprova tudo passaria por verificador que funciona.',
    );
  } else {
    const acusacoes = acusacoesDaIsca(ISCA_QUE_PASSA);
    if (acusacoes.length > 0) {
      falhas.push(
        `${ISCA_QUE_PASSA.arquivo}: A CONTRAPROVA REPROVOU. Verificador que reprova qualquer coisa ` +
          `e tao inutil quanto verificador que aprova qualquer coisa. Acusacoes: ${acusacoes.join(' | ')}`,
      );
    }
  }

  return falhas;
}

// ---------------------------------------------------------------------------
// O placar, dito pelo que ele e
// ---------------------------------------------------------------------------
function contar(uniao, filtro) {
  let lf = 0;
  let lh = 0;
  let arquivos = 0;
  for (const [caminho, linhas] of uniao) {
    if (!filtro(caminho)) continue;
    arquivos += 1;
    for (const vezes of linhas.values()) {
      lf += 1;
      if (vezes > 0) lh += 1;
    }
  }
  return { arquivos, lf, lh, pct: lf === 0 ? 0 : (lh / lf) * 100 };
}

function main(argv) {
  const alvos = argv.slice(2).length > 0 ? argv.slice(2) : RELATORIOS_PADRAO;

  console.log(`verificador de cobertura lcov ${VERSAO_DO_VERIFICADOR} - node ${process.version}`);

  const falhasDoAutoteste = rodarIscas();
  console.log(`  [${falhasDoAutoteste.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (falhasDoAutoteste.length > 0) {
    console.log('');
    console.log(
      'O VERIFICADOR DE COBERTURA PAROU DE VERIFICAR. Os relatorios reais nem foram avaliados:',
    );
    for (const f of falhasDoAutoteste) console.log(`  - ${f}`);
    return 1;
  }

  if (!existsSync(PROPRIEDADES_DO_SONAR)) {
    console.log('');
    console.log(
      `REPROVADO: ${PROPRIEDADES_DO_SONAR} nao encontrado. Sem ele nao da para saber QUAIS arquivos ` +
        'o SonarCloud indexa como fonte, e a conferencia de ausencia perderia o conjunto de ' +
        'partida. Verificacao que nao consegue verificar reprova, nunca aprova.',
    );
    return 1;
  }
  const propriedades = lerPropriedades(PROPRIEDADES_DO_SONAR);
  const fontes = fontesQueOSonarIndexa(propriedades);
  if (fontes.length === 0) {
    console.log('');
    console.log(
      `REPROVADO: a leitura de ${PROPRIEDADES_DO_SONAR} nao achou nenhum arquivo de fonte. Ou ` +
        '`sonar.sources` esta errado, ou as exclusoes engoliram tudo. Conjunto de partida vazio ' +
        'faz a conferencia de ausencia aprovar qualquer relatorio.',
    );
    return 1;
  }

  const acusacoes = [];
  const porRelatorio = [];
  for (const alvo of alvos) {
    const { falhas, registros } = avaliarRelatorio(alvo, { conferirNoDisco: true });
    console.log(
      `  [${falhas.length === 0 ? 'ok' : 'REPROVA'}] ${alvo} (${String(registros.length)} arquivos)`,
    );
    acusacoes.push(...falhas);
    porRelatorio.push(registros);
  }

  const uniao = unirRelatorios(porRelatorio);
  const acusacoesAusencia = acusacoesDeAusencia(
    conferirAusencias(fontes, [...uniao.keys()], AUSENCIAS_ACEITAS),
  );
  console.log(
    `  [${acusacoesAusencia.length === 0 ? 'ok' : 'REPROVA'}] toda fonte de ` +
      `\`${propriedades.get('sonar.sources') ?? '?'}\` aparece em algum relatorio ` +
      `(${String(fontes.length)} fontes, ${String(AUSENCIAS_ACEITAS.size)} ausencias aceitas e ` +
      'justificadas)',
  );
  acusacoes.push(...acusacoesAusencia);

  if (acusacoes.length > 0) {
    console.log('');
    console.log('REPROVADO: a cobertura que chegaria ao SonarCloud nao serve.');
    for (const a of acusacoes) console.log(`  - ${a}`);
    return 1;
  }

  // -------------------------------------------------------------------------
  // O NUMERO, DITO PELO QUE ELE E.
  //
  // Ate 22/09 esta linha imprimia o total BRUTO do lcov -- 91,76%. Aquele
  // numero incluia os 71 arquivos de TESTE, que o reporter do Node 22 poe no
  // relatorio (o Node 26 nao poe) e que o Sonar descarta por
  // `sonar.test.inclusions`. O Sonar nunca se enganou; quem se enganava era a
  // pessoa que lia o log e concluia que o projeto media 91,76%.
  // -------------------------------------------------------------------------
  const ehFonteDoSonar = new Set(fontes);
  const doSonar = contar(uniao, (c) => ehFonteDoSonar.has(c));
  const bruto = contar(uniao, () => true);
  const fora = contar(uniao, (c) => !ehFonteDoSonar.has(c));

  console.log('');
  console.log('APROVADO.');
  console.log(
    `  O QUE O SONARCLOUD MEDE: ${String(doSonar.lh)}/${String(doSonar.lf)} linhas ` +
      `(${doSonar.pct.toFixed(2)}%) em ${String(doSonar.arquivos)} arquivos de fonte.`,
  );
  console.log(
    `  Denominador: ${String(fontes.length)} arquivos de fonte; ${String(doSonar.arquivos)} com ` +
      `dado de cobertura e ${String(AUSENCIAS_ACEITAS.size)} sem, por ausencia aceita e ` +
      'justificada em `AUSENCIAS_ACEITAS`. Cada uma dessas volta a reprovar no dia em que ' +
      'ganhar teste, para a lista encolher sozinha.',
  );
  console.log(
    `  O QUE ESTE NUMERO NAO E: o total BRUTO do lcov e ${String(bruto.lh)}/${String(bruto.lf)} ` +
      `(${bruto.pct.toFixed(2)}%) em ${String(bruto.arquivos)} arquivos, e ele inclui ` +
      `${String(fora.arquivos)} arquivos que o Sonar NAO poe no denominador (os \`*.test.ts\` e os ` +
      'de `tests/`, que entram por `sonar.tests`/`sonar.test.inclusions`). Teste medindo teste da ' +
      'perto de 100% e nao informa nada: nao cite o numero bruto como cobertura do projeto.',
  );
  return 0;
}

process.exit(main(process.argv));
