#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. Mesma linha que os outros portoes em `.mjs` carregam.
/**
 * PORTAO DO TEXTO DO CONSENTIMENTO DO ACHADOR: o que a tela EXIBE tem de ser,
 * byte a byte, o que o servidor GRAVA.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================
 *
 * Decisao do cliente de 03/11/2026: o contato de quem acha o pet chega ao tutor
 * sob consentimento. O que legitima isso nao e a caixinha marcada na tela -- e o
 * registro, e dele a peca que importa e `finder_contact_consents.consent_text`:
 * **o texto exato que a pessoa leu, naquele dia**.
 *
 * O servidor grava o texto que ELE publica
 * (`src/modules/found/domain/consentimento-de-contato.ts`), resolvendo-o a partir
 * da VERSAO que o cliente informa. Nunca o texto que o cliente mandar: o cliente
 * e a parte interessada, e texto dele nao provaria nada.
 *
 * Mas a tela e do SITE, e e ela que a pessoa le. Sao DOIS literais, em DOIS
 * projetos -- exatamente a forma do defeito que o portao da versao dos termos
 * mediu em 01/11/2026 (`verificar-versao-dos-termos.mjs`): dois valores mantidos
 * iguais por coincidencia, com nada medindo a igualdade. Ali o aceite apontava
 * para uma versao que nunca esteve no ar.
 *
 * Aqui a consequencia e pior, e nao igual: se o site exibir um texto e o servidor
 * gravar outro, o registro passa a afirmar que a pessoa leu algo que ela NAO leu.
 * Deixa de ser prova e passa a ser prova falsa -- e o que ele autoriza e entregar
 * dado pessoal de alguem sem conta a um terceiro.
 *
 * O CONSERTO nao e disciplina: e esta medicao. A FONTE e o servidor; a COPIA e
 * `web/src/conteudo/consentimento-do-achador.json`; e aqui elas sao comparadas.
 *
 * POR QUE O SITE NAO LE A FONTE DIRETO
 * =====================================
 *
 * Porque sao dois conteineres. A imagem do site nao carrega `src/`, e a imagem da
 * API nao carrega `web/`. Importar atravessado "funcionaria" no worktree e
 * quebraria na subida -- que e a pior ordem possivel para descobrir.
 *
 * COMO RODAR
 * ==========
 *
 *   npm run build   # o portao le o JS compilado da fonte, e nao o TypeScript
 *   node infra/verificacao/verificar-texto-do-consentimento.mjs
 *   node infra/verificacao/verificar-texto-do-consentimento.mjs --autoteste
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FONTE_COMPILADA = 'dist/modules/found/domain/consentimento-de-contato.js';
const FONTE_TS = 'src/modules/found/domain/consentimento-de-contato.ts';
const COPIA_DO_SITE = 'web/src/conteudo/consentimento-do-achador.json';

/**
 * Compara, e devolve a lista de desacordos. Separada de [main] para o autoteste
 * poder exercita-la com valores que ela nunca veria em disco.
 */
export function desacordos(fonte, copia) {
  const achados = [];

  if (typeof copia.versao !== 'string' || copia.versao.trim() === '') {
    achados.push(`${COPIA_DO_SITE} nao declara \`versao\`: sem ela a tela nao sabe o que mandar no corpo.`);
    return achados;
  }
  if (typeof copia.texto !== 'string' || copia.texto.trim() === '') {
    achados.push(`${COPIA_DO_SITE} nao declara \`texto\`: a tela exibiria caixinha sem texto, que nao e consentimento.`);
    return achados;
  }

  if (copia.versao !== fonte.versaoAtual) {
    achados.push(
      `a versao do site e \`${copia.versao}\` e a do servidor e \`${fonte.versaoAtual}\`. ` +
        'A tela mandaria uma versao que o servidor nao trata como atual.',
    );
  }

  const textoDaFonte = fonte.textoDe(copia.versao);
  if (textoDaFonte === undefined) {
    achados.push(
      `o servidor nao publica texto para a versao \`${copia.versao}\`, entao ele RECUSARIA ` +
        'com 400 todo consentimento que esta tela coletasse.',
    );
    return achados;
  }

  if (copia.texto !== textoDaFonte) {
    achados.push(
      'o texto que a TELA exibe nao e o que o SERVIDOR grava. O registro afirmaria que a ' +
        'pessoa leu o texto do servidor, e ela leu o do site.\n' +
        `  tela    : ${JSON.stringify(copia.texto)}\n` +
        `  servidor: ${JSON.stringify(textoDaFonte)}`,
    );
  }

  return achados;
}

/**
 * As quatro afirmacoes que o texto tem de carregar para o consentimento existir.
 * Sem a ultima ele nao e LIVRE; sem as outras nao e INFORMADO. Medir isto aqui e
 * o que impede alguem "enxugar" o texto no dia em que ele parecer comprido.
 */
const EXIGIDAS = [
  ['tutor', 'para QUEM os dados vao'],
  ['finalidade exclusiva', 'que a finalidade e UMA, e limitada'],
  ['nome, e-mail e telefone', 'O QUE sai'],
  ['opcional', 'que da para avisar SEM compartilhar -- e o que torna o consentimento livre'],
];

export function faltasDeConteudo(texto) {
  return EXIGIDAS.filter(([trecho]) => !texto.includes(trecho)).map(
    ([trecho, porque]) => `o texto nao diz \`${trecho}\`, e e ele que carrega: ${porque}`,
  );
}

function lerFonte() {
  if (!existsSync(FONTE_COMPILADA)) {
    console.error(
      `REPROVA: ${FONTE_COMPILADA} nao existe, entao este portao nao tem contra o que comparar.\n` +
        '  Rode `npm run build` antes. Nao conseguir conferir nao e aprovacao.',
    );
    process.exit(2);
  }
  return import(pathToFileURL(resolve(FONTE_COMPILADA)).href);
}

async function main() {
  const modulo = await lerFonte();
  const fonte = {
    versaoAtual: modulo.VERSAO_ATUAL_DO_CONSENTIMENTO,
    textoDe: modulo.textoDoConsentimento,
  };

  if (typeof fonte.versaoAtual !== 'string' || typeof fonte.textoDe !== 'function') {
    console.error(
      `REPROVA: ${FONTE_TS} deixou de exportar \`VERSAO_ATUAL_DO_CONSENTIMENTO\` ou ` +
        '`textoDoConsentimento`. O portao nao consegue mais ler a fonte.',
    );
    process.exit(2);
  }

  const copia = JSON.parse(readFileSync(COPIA_DO_SITE, 'utf8'));
  const problemas = [...desacordos(fonte, copia)];

  const texto = fonte.textoDe(fonte.versaoAtual);
  if (typeof texto === 'string') problemas.push(...faltasDeConteudo(texto));

  if (problemas.length > 0) {
    console.error('REPROVA: o texto do consentimento do achador nao bate.\n');
    for (const p of problemas) console.error(`  - ${p}`);
    console.error(
      '\n  A FONTE e o servidor. Edite ' +
        `${FONTE_TS} e traga a copia de ${COPIA_DO_SITE} junto -- e nunca o contrario, ` +
        'porque e o servidor que GRAVA o texto no registro.',
    );
    process.exit(1);
  }

  console.log(
    `APROVADO: a tela exibe e o servidor grava o MESMO texto da versao \`${fonte.versaoAtual}\` ` +
      `(${texto.length} caracteres), e ele carrega as ${String(EXIGIDAS.length)} afirmacoes exigidas.`,
  );
}

/**
 * As iscas. Sem elas, um portao que aprovasse tudo passaria -- e o
 * `verificar-versao-dos-termos` existe justamente porque "nada media a
 * igualdade".
 */
function autoteste() {
  const fonte = {
    versaoAtual: '2026-11-03',
    textoDe: (v) => (v === '2026-11-03' ? 'o texto de verdade' : undefined),
  };
  const falhas = [];
  const exigir = (rotulo, achados, deveriaReprovar) => {
    const reprovou = achados.length > 0;
    if (reprovou !== deveriaReprovar) {
      falhas.push(`${rotulo}: esperava ${deveriaReprovar ? 'REPROVA' : 'passe'}, veio o contrario`);
    }
  };

  exigir('copia igual', desacordos(fonte, { versao: '2026-11-03', texto: 'o texto de verdade' }), false);
  exigir('texto diferente', desacordos(fonte, { versao: '2026-11-03', texto: 'outro texto' }), true);
  exigir(
    'diferenca de UM caractere',
    desacordos(fonte, { versao: '2026-11-03', texto: 'o texto de verdade ' }),
    true,
  );
  exigir('versao desconhecida', desacordos(fonte, { versao: '1999-01-01', texto: 'o texto de verdade' }), true);
  exigir('sem versao', desacordos(fonte, { texto: 'o texto de verdade' }), true);
  exigir('sem texto', desacordos(fonte, { versao: '2026-11-03' }), true);
  exigir('texto vazio', desacordos(fonte, { versao: '2026-11-03', texto: '   ' }), true);

  // E a conferencia de CONTEUDO enxerga nos dois sentidos.
  const completo =
    'Aceito compartilhar com o tutor deste pet os dados de contato que eu preenchi aqui — ' +
    'nome, e-mail e telefone —, com a finalidade exclusiva de ele entrar em contato comigo. ' +
    'Compartilhar é opcional.';
  exigir('texto completo', faltasDeConteudo(completo), false);
  exigir('texto sem `opcional`', faltasDeConteudo(completo.replace(' Compartilhar é opcional.', '')), true);
  exigir(
    'texto sem `finalidade exclusiva`',
    faltasDeConteudo(completo.replace('finalidade exclusiva', 'intencao')),
    true,
  );

  if (falhas.length > 0) {
    console.error('REPROVA no autoteste: o portao nao mede o que diz medir.\n');
    for (const f of falhas) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('autoteste: 10 iscas, o portao enxerga diferenca de um caractere e falta de conteudo.');
}

if (process.argv.includes('--autoteste')) autoteste();
else await main();
