#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. Mesma linha que os outros portoes em `.mjs` carregam.
/**
 * PORTAO DA VERSAO DOS TERMOS: o que o aplicativo GRAVA tem de ser o que o site
 * PUBLICA.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================
 *
 * Medido em 01/11/2026. O site publicava, no aviso das paginas de Termos e de
 * Privacidade, `'Versão 0.3 de 23/09/2026. ...'`
 * (`web/src/conteudo/legal.ts`). O comando de build do aplicativo passava
 * `--dart-define=TERMS_VERSION=2026-09-17`
 * (`infra/verificacao/verificar-apk.sh`). **17/09 contra 23/09.**
 *
 * Esse valor nao fica no aplicativo: ele vai para
 * `users.accepted_terms_version` (migracao `20260917000001`) no cadastro. Ou
 * seja, o consentimento gravado no banco apontava para uma versao que nunca
 * esteve no ar -- `2026-09-17` e a data em que os ADR-0001..0013 foram
 * escritos, e nao a de nenhum texto legal. Isso tem efeito juridico: um aceite
 * que nao identifica o texto aceito nao prova o que precisa provar.
 *
 * E o defeito nao era so no texto do script. MEDIDO no APK de homologacao
 * `bichu-hml-d03d1a6c-31-10.apk`: `2026-09-17` aparece 1x em cada um dos tres
 * `lib/<abi>/libapp.so`, com controle `hml.bichu.app` presente. O binario
 * distribuido carregava o valor errado.
 *
 * A CAUSA era estrutural, e nao descuido: DOIS literais, em DOIS arquivos,
 * mantidos iguais por coincidencia. Nada media a igualdade, entao a divergencia
 * nao tinha como ser notada.
 *
 * O CONSERTO: `web/src/conteudo/versao-legal.json` passa a ser a UNICA fonte. O
 * site deriva a prosa do aviso dela; `verificar-apk.sh` tira dela o
 * `--dart-define=TERMS_VERSION`. Este portao e o que impede a volta: ele
 * compara TRES observacoes e reprova nomeando as duas versoes em desacordo.
 *
 * AS TRES OBSERVACOES, E POR QUE SAO TRES
 * ========================================
 *
 * Com fonte unica a divergencia fica impossivel pelo caminho padrao -- mas
 * sobram tres caminhos reais por onde ela volta, e cada observacao fecha um:
 *
 *   (A) A FONTE. `versao-legal.json`, lido como JSON.
 *   (B) O QUE O SITE PUBLICA. Lido pela porta da frente: importando o modulo
 *       `legal.ts` que as paginas `.astro` realmente importam, e nao
 *       reconhecendo a prosa por expressao regular. Fecha "alguem voltou a
 *       escrever a versao a mao no aviso".
 *   (C) O QUE O APLICATIVO VAI GRAVAR. Obtido RODANDO
 *       `verificar-apk.sh --imprimir-versao-dos-termos`, que e a resolucao de
 *       verdade do valor -- com a sobrescrita por ambiente ja aplicada. Fecha
 *       "alguem voltou a escrever o literal no script" E
 *       "alguem rodou o build com `TERMS_VERSION=` do ambiente apontando para
 *       outra coisa". O segundo caso e o unico que a fonte unica NAO fecha
 *       sozinha, e e o que custa um build inteiro para descobrir depois.
 *
 * NAO SE APROVA POR VAZIO. Fonte ausente, chave ausente, valor vazio, modulo
 * que nao carrega: tudo reprova. Portao que nao encontra o que conferir e um
 * portao que diz "esta tudo certo" sobre nada.
 *
 * O QUE ESTE PORTAO NAO FAZ, DE PROPOSITO: ele nao sabe nem opina sobre qual
 * versao e a "certa", nao le o texto legal e nao toca no aviso de rascunho. O
 * texto e rascunho PENDENTE DE REVISAO JURIDICA, e isso e decisao do cliente
 * com o advogado dele. O portao so cobra que as duas pontas digam a MESMA
 * coisa.
 *
 * O VALOR DENTRO DO BINARIO e medido em outro lugar, porque e outra pergunta:
 * `verificar_versao_no_apk.py --valor-dos-termos`, chamado por
 * `verificar-apk.sh`, conta os bytes do valor nos tres `libapp.so`. Este portao
 * compara declaracoes; aquele abre o pacote.
 *
 * Uso:
 *   node infra/verificacao/verificar-versao-dos-termos.mjs
 *   node infra/verificacao/verificar-versao-dos-termos.mjs --autoteste
 *   node infra/verificacao/verificar-versao-dos-termos.mjs --versao-do-app 2026-09-23
 *
 * Saida: 0 aprovado, 1 reprovado. Rode da RAIZ do repositorio.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FONTE_PADRAO = 'web/src/conteudo/versao-legal.json';
const PUBLICADO_PADRAO = 'web/src/conteudo/legal.ts';
const SCRIPT_DO_APK = 'infra/verificacao/verificar-apk.sh';

class Reprova extends Error {}

/** (A) A fonte unica. */
function lerFonte(caminho) {
  let cru;
  try {
    cru = readFileSync(caminho, 'utf8');
  } catch (erro) {
    throw new Reprova(
      `nao consegui ler a fonte unica da versao em ${caminho} (${erro.code ?? erro.message}). ` +
        'Sem ela nao ha com o que comparar, e um portao que nao acha o que conferir ' +
        'nao pode aprovar nada.',
    );
  }
  let dados;
  try {
    dados = JSON.parse(cru);
  } catch (erro) {
    throw new Reprova(`${caminho} nao e JSON valido: ${erro.message}`);
  }
  const { rotulo, publicadaEm } = dados;
  if (typeof publicadaEm !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(publicadaEm)) {
    throw new Reprova(
      `${caminho}: \`publicadaEm\` e ${JSON.stringify(publicadaEm)}, e tem de ser ` +
        'uma data `AAAA-MM-DD`. Esse valor vai para `users.accepted_terms_version`: ' +
        'em forma errada, o aceite fica gravado apontando para nada.',
    );
  }
  if (typeof rotulo !== 'string' || rotulo.length === 0) {
    throw new Reprova(
      `${caminho}: \`rotulo\` e ${JSON.stringify(rotulo)}, e tem de ser texto nao vazio. ` +
        'Ele e o nome da versao no aviso que o usuario le antes de aceitar.',
    );
  }
  return { rotulo, publicadaEm };
}

/**
 * (B) O que o site publica, lido do modulo que as paginas importam.
 *
 * Em processo SEPARADO, com `--experimental-strip-types`, por dois motivos: o
 * modulo e TypeScript (este portao e `.mjs` e roda sem a bandeira), e ele LANCA
 * de proposito quando a fonte esta em forma errada -- aqui isso tem de virar
 * reprovacao com motivo legivel, e nao uma pilha de excecao.
 */
function lerPublicado(caminho) {
  const programa =
    'const m = await import(process.argv[1]);' +
    'process.stdout.write(JSON.stringify({ versao: m.LEGAL.versao, versaoRegistrada: m.LEGAL.versaoRegistrada }));';
  // A BANDEIRA E TENTADA, E NAO ASSUMIDA. `--experimental-strip-types` existe no
  // Node 22 (o do projeto) e e DISPENSAVEL a partir do 23, onde ler TypeScript
  // ja e o padrao -- e numa versao nova o suficiente ela pode voltar como opcao
  // DESCONHECIDA e derrubar o portao por motivo nenhum. Nesta maquina o `node`
  // do PATH e um 26 e o do projeto e um 22, entao as duas situacoes sao reais.
  // Por isso: tenta com a bandeira e, se o Node a recusar, tenta sem.
  const rodar = (comBandeira) =>
    execFileSync(
      process.execPath,
      [
        ...(comBandeira ? ['--experimental-strip-types'] : []),
        '--input-type=module',
        '-e',
        programa,
        resolve(caminho),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  let saida;
  try {
    try {
      saida = rodar(true);
    } catch (primeiro) {
      if (!/bad option|not allowed in NODE_OPTIONS|unknown option/i.test(String(primeiro.stderr ?? ''))) {
        throw primeiro;
      }
      saida = rodar(false);
    }
  } catch (erro) {
    throw new Reprova(
      `nao consegui carregar o modulo publicado ${caminho}. Ele e o que as paginas ` +
        '`termos.astro` e `privacidade.astro` importam: se ele nao carrega aqui, o site ' +
        `nao sobe. Erro:\n${String(erro.stderr ?? erro.message).trim()}`,
    );
  }
  let dados;
  try {
    dados = JSON.parse(saida);
  } catch {
    throw new Reprova(
      `${caminho} carregou mas nao devolveu \`LEGAL.versao\`/\`LEGAL.versaoRegistrada\` ` +
        `legiveis (recebi ${JSON.stringify(saida.slice(0, 200))}).`,
    );
  }
  if (typeof dados.versao !== 'string' || dados.versao.length === 0) {
    throw new Reprova(`${caminho}: \`LEGAL.versao\` chegou vazio. O aviso publicado nao diria versao nenhuma.`);
  }
  if (typeof dados.versaoRegistrada !== 'string' || dados.versaoRegistrada.length === 0) {
    throw new Reprova(
      `${caminho}: \`LEGAL.versaoRegistrada\` chegou vazio. E ele a cadeia que o aceite grava.`,
    );
  }
  return dados;
}

/** (C) O valor que o comando de build vai passar, resolvido pelo proprio script. */
function lerVersaoDoApp(script) {
  let saida;
  try {
    saida = execFileSync('sh', [script, '--imprimir-versao-dos-termos'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (erro) {
    throw new Reprova(
      `\`sh ${script} --imprimir-versao-dos-termos\` falhou. E dele que sai o valor que o ` +
        `aplicativo grava no aceite; sem ele nao ha o que comparar. Erro:\n${String(erro.stderr ?? erro.message).trim()}`,
    );
  }
  const valor = saida.trim();
  if (valor.length === 0) {
    throw new Reprova(
      `\`sh ${script} --imprimir-versao-dos-termos\` nao imprimiu nada. Valor vazio viraria ` +
        '`accepted_terms_version` vazio, e o portao do binario procuraria a cadeia vazia -- ' +
        'que esta em qualquer binario, e aprovaria sempre.',
    );
  }
  return valor;
}

function conferir({ fonte, publicado, versaoDoApp }) {
  const laudo = [];
  const a = lerFonte(fonte);
  laudo.push(`  fonte      ${fonte}: ${a.publicadaEm} (rotulo ${a.rotulo})`);

  const b = lerPublicado(publicado);
  laudo.push(`  publicado  ${publicado}: ${JSON.stringify(b.versao)}`);

  // A DATA DA PROSA, e nao so o campo de maquina: o campo pode estar certo e o
  // aviso que o usuario LE pode estar errado, e e o aviso que tem efeito.
  const dataNaProsa = `${a.publicadaEm.slice(8, 10)}/${a.publicadaEm.slice(5, 7)}/${a.publicadaEm.slice(0, 4)}`;
  if (!b.versao.includes(dataNaProsa)) {
    throw new Reprova(
      'O AVISO PUBLICADO NAO CARREGA A DATA DA FONTE.\n' +
        `  fonte (${fonte}) diz      ${a.publicadaEm}, que se escreve ${dataNaProsa}\n` +
        `  aviso (${publicado}) diz  ${JSON.stringify(b.versao)}\n` +
        'O usuario leria uma versao e o aceite gravaria outra. A prosa do aviso tem de ser ' +
        'DERIVADA da fonte, e nao escrita a mao.',
    );
  }
  if (!b.versao.includes(a.rotulo)) {
    throw new Reprova(
      'O AVISO PUBLICADO NAO CARREGA O ROTULO DA FONTE.\n' +
        `  fonte (${fonte}) diz      rotulo ${a.rotulo}\n` +
        `  aviso (${publicado}) diz  ${JSON.stringify(b.versao)}`,
    );
  }
  if (b.versaoRegistrada !== a.publicadaEm) {
    throw new Reprova(
      'O MODULO PUBLICADO E A FONTE DISCORDAM NO VALOR DE MAQUINA.\n' +
        `  fonte (${fonte}):                      ${a.publicadaEm}\n` +
        `  LEGAL.versaoRegistrada (${publicado}): ${b.versaoRegistrada}`,
    );
  }

  // O VAZIO ANTES DA DIVERGENCIA, porque o diagnostico e outro: valor vazio nao
  // e "gravou a versao errada", e "a conferencia do valor no binario vai
  // procurar a cadeia vazia, que esta em qualquer binario, e aprovar sempre".
  if (versaoDoApp.length === 0) {
    throw new Reprova(
      'A VERSAO QUE O APLICATIVO GRAVA CHEGOU VAZIA.\n' +
        `  o site publica  ${a.publicadaEm}  (${fonte})\n` +
        '  o aplicativo grava  (vazio)\n' +
        'Isto nao e divergencia, e cegueira: `accepted_terms_version` ficaria vazio no banco, ' +
        'e `verificar_versao_no_apk.py` procuraria a cadeia vazia dentro do `libapp.so` -- ' +
        'que esta em qualquer binario, e aprovaria qualquer pacote.',
    );
  }
  laudo.push(`  aplicativo registra:  ${versaoDoApp}`);
  if (versaoDoApp !== a.publicadaEm) {
    throw new Reprova(
      'A VERSAO QUE O APLICATIVO GRAVA NAO E A QUE O SITE PUBLICA.\n' +
        `  o site publica  ${a.publicadaEm}  (${fonte}; aviso: ${JSON.stringify(b.versao)})\n` +
        `  o aplicativo grava  ${versaoDoApp}  (--dart-define=TERMS_VERSION, via ${SCRIPT_DO_APK})\n` +
        'Esse valor vai para `users.accepted_terms_version`: enquanto eles diferem, o banco ' +
        'guarda consentimento apontando para uma versao que nao e a que esteve no ar. ' +
        'Conserte mexendo SO em ' +
        `${fonte} -- e, se a diferenca veio de \`TERMS_VERSION\` do ambiente, tire a sobrescrita.`,
    );
  }
  return laudo;
}

// ---------------------------------------------------------------------------
// AUTOTESTE. Sem ele a comparacao acima valeria pela confianca do dia em que
// foi escrita, e ficaria verde para sempre no dia em que cegasse.
// ---------------------------------------------------------------------------

function moduloDeIsca(caminho, { prosa, registrada }) {
  writeFileSync(
    caminho,
    `export const LEGAL = {\n` +
      `  versao: ${JSON.stringify(prosa)},\n` +
      `  versaoRegistrada: ${JSON.stringify(registrada)},\n` +
      `};\n`,
    'utf8',
  );
  return caminho;
}

function autoteste() {
  let falhou = false;
  const tmp = mkdtempSync(join(tmpdir(), 'bichu-isca-versao-dos-termos-'));

  const esperarReprova = (motivo, entradas) => {
    try {
      conferir(entradas);
    } catch (erro) {
      if (erro instanceof Reprova) {
        console.log(`isca reprovada como deveria: ${motivo}`);
        console.log(`    motivo dado: ${erro.message.split('\n')[0].slice(0, 110)}...`);
        return;
      }
      throw erro;
    }
    console.error(
      `REPROVA: a isca '${motivo}' PASSOU. O portao da versao dos termos parou de enxergar esta familia`,
    );
    falhou = true;
  };

  const fonteBoa = join(tmp, 'versao-legal.json');
  writeFileSync(fonteBoa, JSON.stringify({ rotulo: '9.9', publicadaEm: '2026-09-23' }), 'utf8');
  const publicadoBom = moduloDeIsca(join(tmp, 'legal-bom.ts'), {
    prosa: 'Versão 9.9 de 23/09/2026. O texto pode mudar antes da versão final.',
    registrada: '2026-09-23',
  });

  // --- iscas que PRECISAM ser reprovadas ---------------------------------

  // A ISCA CENTRAL: o defeito medido em 01/11/2026, nos numeros dele.
  esperarReprova('o aplicativo grava 2026-09-17 e o site publica 2026-09-23 (o defeito medido)', {
    fonte: fonteBoa,
    publicado: publicadoBom,
    versaoDoApp: '2026-09-17',
  });

  esperarReprova('o aviso publicado traz data DIFERENTE da fonte (prosa escrita a mao)', {
    fonte: fonteBoa,
    publicado: moduloDeIsca(join(tmp, 'legal-data-outra.ts'), {
      prosa: 'Versão 9.9 de 17/09/2026. O texto pode mudar antes da versão final.',
      registrada: '2026-09-23',
    }),
    versaoDoApp: '2026-09-23',
  });

  esperarReprova('o aviso publicado traz ROTULO diferente da fonte', {
    fonte: fonteBoa,
    publicado: moduloDeIsca(join(tmp, 'legal-rotulo-outro.ts'), {
      prosa: 'Versão 0.1 de 23/09/2026. O texto pode mudar antes da versão final.',
      registrada: '2026-09-23',
    }),
    versaoDoApp: '2026-09-23',
  });

  esperarReprova('`LEGAL.versaoRegistrada` discorda da fonte', {
    fonte: fonteBoa,
    publicado: moduloDeIsca(join(tmp, 'legal-registrada-outra.ts'), {
      prosa: 'Versão 9.9 de 23/09/2026. O texto pode mudar antes da versão final.',
      registrada: '2026-09-17',
    }),
    versaoDoApp: '2026-09-23',
  });

  esperarReprova('fonte INEXISTENTE (verde por vazio)', {
    fonte: join(tmp, 'nao-existe.json'),
    publicado: publicadoBom,
    versaoDoApp: '2026-09-23',
  });

  const fonteSemData = join(tmp, 'sem-data.json');
  writeFileSync(fonteSemData, JSON.stringify({ rotulo: '9.9' }), 'utf8');
  esperarReprova('fonte SEM `publicadaEm`', {
    fonte: fonteSemData,
    publicado: publicadoBom,
    versaoDoApp: '2026-09-23',
  });

  const fonteDataTorta = join(tmp, 'data-torta.json');
  writeFileSync(fonteDataTorta, JSON.stringify({ rotulo: '9.9', publicadaEm: '23/09/2026' }), 'utf8');
  esperarReprova('fonte com `publicadaEm` fora de AAAA-MM-DD', {
    fonte: fonteDataTorta,
    publicado: publicadoBom,
    versaoDoApp: '23/09/2026',
  });

  const fonteSemRotulo = join(tmp, 'sem-rotulo.json');
  writeFileSync(fonteSemRotulo, JSON.stringify({ rotulo: '', publicadaEm: '2026-09-23' }), 'utf8');
  esperarReprova('fonte com `rotulo` vazio', {
    fonte: fonteSemRotulo,
    publicado: publicadoBom,
    versaoDoApp: '2026-09-23',
  });

  esperarReprova('versao do aplicativo VAZIA (aprovaria qualquer binario)', {
    fonte: fonteBoa,
    publicado: publicadoBom,
    versaoDoApp: '',
  });

  esperarReprova('modulo publicado que NAO carrega', {
    fonte: fonteBoa,
    publicado: join(tmp, 'nao-existe.ts'),
    versaoDoApp: '2026-09-23',
  });

  // --- iscas que PRECISAM ser aprovadas ----------------------------------
  // Sem estas, um portao que reprovasse TUDO passaria no autoteste inteiro e
  // derrubaria a esteira para sempre, com as linhas de cima dizendo que estava
  // tudo certo.
  const esperarAprova = (motivo, entradas, minimoDeLaudo = 3) => {
    try {
      const laudo = conferir(entradas);
      if (laudo.length < minimoDeLaudo) {
        console.error(
          `REPROVA: a isca '${motivo}' passou com laudo de ${laudo.length} linha(s). ` +
            'Portao que aprova sem medir e o mesmo portao cego',
        );
        falhou = true;
        return;
      }
      console.log(`isca aprovada como deveria: ${motivo}`);
    } catch (erro) {
      console.error(`REPROVA: a isca '${motivo}' foi REPROVADA (${erro.message.split('\n')[0]}).`);
      falhou = true;
    }
  };

  esperarAprova('fonte, aviso publicado e aplicativo dizendo a MESMA versao', {
    fonte: fonteBoa,
    publicado: publicadoBom,
    versaoDoApp: '2026-09-23',
  });

  // O CONTROLE POSITIVO DA ARVORE DE VERDADE, e nao de uma isca: sem ele o
  // portao poderia estar certo sobre arquivos de brinquedo e cego sobre os
  // arquivos que o produto publica.
  esperarAprova('a ARVORE DE VERDADE deste repositorio', {
    fonte: FONTE_PADRAO,
    publicado: PUBLICADO_PADRAO,
    versaoDoApp: lerVersaoDoApp(SCRIPT_DO_APK),
  });

  rmSync(tmp, { recursive: true, force: true });
  if (falhou) return 1;
  console.log('autoteste: o portao da versao dos termos enxerga nos dois sentidos');
  return 0;
}

// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--autoteste')) return autoteste();

  const pegar = (bandeira, padrao) => {
    const i = argv.indexOf(bandeira);
    return i === -1 ? padrao : argv[i + 1];
  };
  const fonte = pegar('--fonte', FONTE_PADRAO);
  const publicado = pegar('--publicado', PUBLICADO_PADRAO);
  const script = pegar('--script', SCRIPT_DO_APK);
  const versaoDoApp = pegar('--versao-do-app', undefined) ?? lerVersaoDoApp(script);

  const laudo = conferir({ fonte, publicado, versaoDoApp });
  console.log('APROVA: a versao gravada no aceite e a versao publicada sao a mesma');
  for (const linha of laudo) console.log(linha);
  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (erro) {
  if (erro instanceof Reprova) {
    console.error(`REPROVA: ${erro.message}`);
    process.exit(1);
  }
  throw erro;
}
