#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * O relatorio de cobertura fala de `src/**\/*.ts`?
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
 * A PROVA NEGATIVA RODA JUNTO, SEMPRE
 * ====================================================================
 *
 * Antes de olhar para o relatorio de verdade, este script roda as quatro iscas
 * de `infra/verificacao/iscas/`:
 *
 *   lcov-deve-reprovar-caminho-compilado.info   aponta para dist/**\/*.js
 *   lcov-deve-reprovar-sem-cobertura.info       relatorio gerado e vazio
 *   lcov-deve-reprovar-arquivo-inexistente.info caminho que nao existe no disco
 *   lcov-deve-passar.info                       relatorio legitimo
 *
 * As tres primeiras PRECISAM reprovar; a quarta PRECISA passar. Verificador que
 * reprova qualquer coisa e tao inutil quanto verificador que aprova qualquer
 * coisa, e o segundo defeito so aparece no dia em que alguem tenta passar um
 * relatorio legitimo. Se qualquer uma das quatro der o resultado errado, este
 * script falha com "o verificador de cobertura parou de verificar" e NAO chega
 * a avaliar o relatorio real.
 *
 * Uso:
 *   node infra/verificacao/verificar-cobertura-lcov.mjs [caminho-do-lcov]
 * Padrao: coverage/lcov.info
 * Saida: 0 aprovado, 1 reprovado.
 */
import { existsSync, readFileSync } from 'node:fs';

const VERSAO_DO_VERIFICADOR = '1.0.0';

const DIR_DAS_ISCAS = 'infra/verificacao/iscas';
const ISCAS_QUE_REPROVAM = [
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-caminho-compilado.info`,
    conferirNoDisco: false,
    exigeNaSaida: 'enable-source-maps',
  },
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-sem-cobertura.info`,
    conferirNoDisco: false,
    exigeNaSaida: 'nenhum arquivo',
  },
  {
    arquivo: `${DIR_DAS_ISCAS}/lcov-deve-reprovar-arquivo-inexistente.info`,
    conferirNoDisco: true,
    exigeNaSaida: 'nao existe no disco',
  },
];
const ISCA_QUE_PASSA = `${DIR_DAS_ISCAS}/lcov-deve-passar.info`;

/**
 * Le um lcov e devolve os registros que interessam.
 * Formato: linhas `SF:<caminho>`, `LF:<linhas instrumentadas>`,
 * `LH:<linhas cobertas>`, terminadas por `end_of_record`.
 */
function lerLcov(texto) {
  const registros = [];
  let atual = null;
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim();
    if (linha.startsWith('SF:')) {
      atual = { caminho: linha.slice(3), lf: 0, lh: 0 };
      registros.push(atual);
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
 * Avalia um relatorio. Devolve a lista de falhas; vazia significa aprovado.
 *
 * `conferirNoDisco` existe para as iscas: tres delas sao fragmentos que falam
 * de arquivos que nao existem de proposito, e a conferencia de disco tem isca
 * propria.
 */
function avaliar(caminhoDoLcov, { conferirNoDisco }) {
  const falhas = [];

  if (!existsSync(caminhoDoLcov)) {
    falhas.push(
      `${caminhoDoLcov}: relatorio de cobertura nao encontrado. O passo que o gera nao rodou, ` +
        'ou gravou em outro lugar. O Sonar aceitaria a ausencia em silencio e publicaria 0%.',
    );
    return falhas;
  }

  const texto = readFileSync(caminhoDoLcov, 'utf8');
  const registros = lerLcov(texto);

  if (registros.length === 0) {
    falhas.push(
      `${caminhoDoLcov}: o relatorio existe e nao declara nenhum arquivo (nenhuma linha \`SF:\`). ` +
        'Relatorio vazio e pior que relatorio ausente: ele publica 0% como se fosse medicao.',
    );
    return falhas;
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

  return falhas;
}

// ---------------------------------------------------------------------------
// Autoteste: as iscas. E a parte que importa.
// ---------------------------------------------------------------------------
function rodarIscas() {
  const falhas = [];

  for (const isca of ISCAS_QUE_REPROVAM) {
    if (!existsSync(isca.arquivo)) {
      falhas.push(
        `${isca.arquivo}: a isca sumiu do repositorio. Sem ela este verificador passa a valer por ` +
          'confianca no dia em que foi escrito.',
      );
      continue;
    }
    const acusacoes = avaliar(isca.arquivo, { conferirNoDisco: isca.conferirNoDisco });
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

  if (!existsSync(ISCA_QUE_PASSA)) {
    falhas.push(
      `${ISCA_QUE_PASSA}: a contraprova sumiu do repositorio. Sem ela, um verificador que reprova ` +
        'tudo passaria por verificador que funciona.',
    );
  } else {
    const acusacoes = avaliar(ISCA_QUE_PASSA, { conferirNoDisco: false });
    if (acusacoes.length > 0) {
      falhas.push(
        `${ISCA_QUE_PASSA}: A CONTRAPROVA REPROVOU. Verificador que reprova qualquer coisa e tao ` +
          `inutil quanto verificador que aprova qualquer coisa. Acusacoes: ${acusacoes.join(' | ')}`,
      );
    }
  }

  return falhas;
}

function main(argv) {
  const alvo = argv[2] ?? 'coverage/lcov.info';

  console.log(`verificador de cobertura lcov ${VERSAO_DO_VERIFICADOR} - node ${process.version}`);

  const falhasDoAutoteste = rodarIscas();
  console.log(`  [${falhasDoAutoteste.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (falhasDoAutoteste.length > 0) {
    console.log('');
    console.log('O VERIFICADOR DE COBERTURA PAROU DE VERIFICAR. O relatorio real nem foi avaliado:');
    for (const f of falhasDoAutoteste) console.log(`  - ${f}`);
    return 1;
  }

  const acusacoes = avaliar(alvo, { conferirNoDisco: true });
  console.log(`  [${acusacoes.length === 0 ? 'ok' : 'REPROVA'}] ${alvo}`);
  if (acusacoes.length > 0) {
    console.log('');
    console.log('REPROVADO: o relatorio de cobertura nao serve para o SonarCloud.');
    for (const a of acusacoes) console.log(`  - ${a}`);
    return 1;
  }

  const registros = lerLcov(readFileSync(alvo, 'utf8'));
  const lf = registros.reduce((soma, r) => soma + r.lf, 0);
  const lh = registros.reduce((soma, r) => soma + r.lh, 0);
  console.log('');
  console.log(
    `APROVADO: ${registros.length} arquivos, ${lh}/${lf} linhas cobertas ` +
      `(${((lh / lf) * 100).toFixed(2)}%), todos apontando para src/**/*.ts`,
  );
  return 0;
}

process.exit(main(process.argv));
