#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * Preenche as chaves geradas de um `.env` de NAO-PRODUCAO. `make env-dev`.
 *
 * ===========================================================================
 * O QUE ELE NAO FAZ, E ISSO E A PARTE IMPORTANTE
 * ===========================================================================
 * Ele NAO reescreve o arquivo, NAO sobrescreve valor que ja existe e NAO
 * imprime nenhum valor gerado.
 *
 * O `.env` e o arquivo de quem desenvolve: ele pode ter a porta que a pessoa
 * escolheu, o `MAIL_TRANSPORT=postmark` com o token de verdade de uma
 * bancada, um `DATABASE_URL` apontando para outro banco. Um gerador que
 * reescreve o arquivo inteiro apaga tudo isso na primeira execucao, e quem
 * perde o proprio `.env` uma vez nunca mais roda o alvo.
 *
 * Entao a regra e uma so: **linha vazia ele preenche, linha preenchida ele
 * respeita.** Rodar duas vezes seguidas nao muda nada -- e ha isca provando
 * isso em `--autoteste`.
 * ===========================================================================
 *
 * ## Por que existe
 *
 * Ate aqui, o caminho do README era `cp .env.example .env` seguido de
 * "preencha os valores vazios", e as instrucoes eram cinco `Gere com:`
 * espalhados em comentario. Nao havia alvo, nao havia conferencia, e o
 * resultado dependia de a pessoa ter lido todos os comentarios certos. A
 * receita, enquanto isso, ja existia escrita duas outras vezes -- no `ci.yml` e
 * no gerador da pilha efemera -- e as tres divergiam. A divergencia entre elas
 * ja custou um portao cego neste repositorio (ver o topo de
 * `infra/segredos-descartaveis.mjs`).
 *
 * ## A conferencia no fim
 *
 * Preencher nao basta: o que prova o alvo e a pergunta "sobrou alguma variavel
 * que o CODIGO exige e este arquivo nao tem?". Ela e feita contra os
 * `requireEnv('NOME')` lidos do proprio `src/`, e reprova NOMEANDO a variavel.
 * E ela que faz a receita nao envelhecer calada: variavel nova no codigo, sem
 * entrada na receita, derruba este alvo em vez de derrubar a pilha de alguem
 * dez minutos depois, em loop de reinicio.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lerVariaveisExigidas } from './integracao/variaveis-exigidas.mjs';
import {
  RECEITA,
  VAZIAS_DE_PROPOSITO,
  aplicar,
  exigidasQueFaltam,
  lerAmbiente,
} from './segredos-descartaveis.mjs';

const MARCA_PADRAO = 'dev-descartavel';

/** Uma linha conta como vazia quando nao tem valor -- ou quando a receita diz. */
function estaVazia(item, ambiente) {
  const valor = (ambiente[item.nome] ?? '').trim();
  if (valor === '') return true;
  // `DATABASE_URL` nasce no `.env.example` com a senha em branco
  // (`postgres://bichu:@db:5432/bichu`). A linha tem valor e mesmo assim esta
  // pela metade: sem este predicado, o alvo trocaria `POSTGRES_PASSWORD` e
  // deixaria a url com a senha vazia -- que e o defeito descrito no `ci.yml`,
  // "a api sobe e a primeira consulta morre com password authentication failed".
  return item.vaziaQuando?.(valor) ?? false;
}

export function gerar({
  exemplo = '.env.example',
  destino = '.env',
  marca = MARCA_PADRAO,
  raizDoCodigo = 'src',
  registrar = console.log,
} = {}) {
  if (!existsSync(destino)) {
    copyFileSync(exemplo, destino);
    registrar(`criado ${destino} a partir de ${exemplo}`);
  }

  let texto = readFileSync(destino, 'utf8');
  const preenchidas = [];
  const mantidas = [];

  for (const item of RECEITA) {
    if (!estaVazia(item, lerAmbiente(texto))) {
      mantidas.push(item.nome);
      continue;
    }
    // O valor e gerado SO quando vai ser usado. Chave RSA custa em torno de
    // 100 ms cada, e gerar duas para descartar as duas na segunda execucao
    // seria pagar o preco para nao fazer nada.
    texto = aplicar(texto, item.nome, item.gerar(marca));
    preenchidas.push(item);
  }

  writeFileSync(destino, texto);

  const ambiente = lerAmbiente(texto);
  const { exigidas, opacas } = lerVariaveisExigidas(raizDoCodigo);
  if (opacas.length > 0) {
    throw new Error(
      'ha chamada de requireEnv cujo nome so existe em tempo de execucao, e que ' +
        `portanto NAO esta sendo conferida: ${opacas.join('; ')}`,
    );
  }
  const faltando = exigidasQueFaltam({ ambiente, exigidas });
  if (faltando.length > 0) {
    throw new Error(
      `${destino} nao preenche variavel exigida pelo codigo: ${faltando.join(', ')}.\n` +
        '  Ou ela e gerada, e falta uma entrada em RECEITA, em ' +
        'infra/segredos-descartaveis.mjs;\n' +
        '  ou ela e escolha de quem desenvolve (endpoint, URL, nome de balde), e ' +
        `o lugar dela e o seu ${destino}.\n` +
        '  Nenhum dos dois e "poe qualquer coisa": valor falso que cala a ' +
        'conferencia foi o que cegou o portao em 29/09/2026.',
    );
  }

  return { preenchidas, mantidas, exigidas: exigidas.length };
}

function relatar({ preenchidas, mantidas, exigidas }, destino) {
  if (preenchidas.length === 0) {
    console.log(`${destino}: nada a fazer, as ${mantidas.length} chaves geradas ja tem valor`);
  } else {
    console.log(`${destino}: ${String(preenchidas.length)} chave(s) preenchida(s)`);
    // O NOME e o PORQUE, nunca o valor. Quem precisa do valor le o arquivo.
    for (const { nome, porque } of preenchidas) console.log(`  ${nome.padEnd(32)} ${porque}`);
    if (mantidas.length > 0) {
      console.log(`  (mantidas, ja tinham valor: ${mantidas.join(', ')})`);
    }
  }
  console.log(`  ${String(exigidas)} variaveis exigidas pelo codigo, todas preenchidas`);
  const vazias = Object.keys(VAZIAS_DE_PROPOSITO);
  console.log(`  vazias de proposito, e continuam: ${vazias.join(', ')}`);
}

/**
 * As iscas. Cada uma desliga UM mecanismo e observa a reprovacao.
 *
 * Isto nao e teste de unidade solto: e a condicao de o alvo valer alguma coisa.
 * Gerador que nunca foi visto errando vale pela confianca do dia em que foi
 * escrito.
 */
export function autoteste() {
  const dir = mkdtempSync(join(tmpdir(), 'bichu-env-dev-'));
  const casos = [];
  const registrarNada = () => {};
  try {
    // 1. O caminho feliz: do `.env.example` cru sai um arquivo completo.
    const destino = join(dir, '.env');
    const primeira = gerar({ destino, registrar: registrarNada });
    casos.push([
      primeira.preenchidas.length === RECEITA.length,
      'do `.env.example` cru, TODA a receita e preenchida',
    ]);

    // 2. IDEMPOTENCIA: a segunda passada nao toca em nada. Sem isto, `make
    //    env-dev` rodado duas vezes trocaria a senha de um banco com dado
    //    dentro, e a falha sairia como `password authentication failed`.
    const antes = readFileSync(destino, 'utf8');
    const segunda = gerar({ destino, registrar: registrarNada });
    casos.push([
      segunda.preenchidas.length === 0 && readFileSync(destino, 'utf8') === antes,
      'a segunda passada nao muda um byte',
    ]);

    // 3. O VALOR DE QUEM DESENVOLVE E RESPEITADO. O mecanismo desligado aqui e
    //    o `estaVazia`: sem ele o alvo sobrescreveria o token de bancada de
    //    alguem na primeira execucao.
    const meu = join(dir, '.env.meu');
    copyFileSync(destino, meu);
    writeFileSync(meu, aplicar(readFileSync(meu, 'utf8'), 'IP_HMAC_KEY', 'a-minha-de-propria-mao'));
    gerar({ destino: meu, registrar: registrarNada });
    casos.push([
      lerAmbiente(readFileSync(meu, 'utf8'))['IP_HMAC_KEY'] === 'a-minha-de-propria-mao',
      'linha JA preenchida sobrevive ao alvo',
    ]);

    // 4. `DATABASE_URL` com a senha em branco conta como vazia. O mecanismo e o
    //    `vaziaQuando`: sem ele a linha tem valor, passa batida, e a api sobe
    //    para morrer na primeira consulta.
    const senhaVazia = join(dir, '.env.senha-vazia');
    copyFileSync(join(dir, '.env'), senhaVazia);
    writeFileSync(
      senhaVazia,
      aplicar(readFileSync(senhaVazia, 'utf8'), 'DATABASE_URL', 'postgres://bichu:@db:5432/bichu'),
    );
    gerar({ destino: senhaVazia, registrar: registrarNada });
    casos.push([
      !/^postgres:\/\/[^:]*:@/.test(lerAmbiente(readFileSync(senhaVazia, 'utf8'))['DATABASE_URL']),
      'url com senha em branco e reconhecida como vazia e reescrita',
    ]);

    // 5. `MAIL_API_TOKEN` NAO e preenchido. Ele e a variavel cujo preenchimento
    //    cegou o portao em 29/09/2026, e o alvo nao pode reintroduzir isso.
    casos.push([
      (lerAmbiente(readFileSync(destino, 'utf8'))['MAIL_API_TOKEN'] ?? '') === '',
      '`MAIL_API_TOKEN` continua VAZIO depois do alvo',
    ]);

    // 6. A CONFERENCIA REPROVA. Variavel exigida pelo codigo, sem entrada na
    //    receita e sem valor no arquivo, derruba o alvo NOMEANDO-A. Este e o
    //    caso que impede a receita de envelhecer calada.
    const iscaDeCodigo = mkdtempSync(join(tmpdir(), 'bichu-env-isca-'));
    writeFileSync(
      join(iscaDeCodigo, 'isca.ts'),
      "const x = requireEnv('ISCA_QUE_NINGUEM_GERA');\n",
    );
    let reprovou = '';
    try {
      gerar({ destino, raizDoCodigo: iscaDeCodigo, registrar: registrarNada });
    } catch (erro) {
      reprovou = erro.message;
    } finally {
      rmSync(iscaDeCodigo, { recursive: true, force: true });
    }
    casos.push([
      reprovou.includes('ISCA_QUE_NINGUEM_GERA'),
      'variavel exigida e nao gerada REPROVA, citando o nome',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`autoteste do gerador de .env de dev (${String(casos.length)} casos)`);
  for (const [ok, nome] of casos) console.log(`  [${ok ? '  ok  ' : 'REPROVA'}] ${nome}`);
  const reprovados = casos.filter(([ok]) => !ok);
  if (reprovados.length > 0) {
    throw new Error(
      `autoteste do gerador de .env REPROVOU em ${String(reprovados.length)} caso(s): ` +
        reprovados.map(([, nome]) => nome).join('; '),
    );
  }
  return 'autoteste APROVADO: o alvo preenche, respeita o que ja existe e reprova o que nao sabe gerar';
}

// Mesma guarda de `gerar-env-de-integracao.mjs`: o arquivo tambem e importado
// (por `--autoteste` e pela esteira), e sem ela a importacao escreveria um
// `.env` como efeito colateral.
if (process.argv[1]?.endsWith('gerar-env-de-dev.mjs')) {
  const argumentos = process.argv.slice(2);
  const valorDe = (bandeira, padrao) => {
    const i = argumentos.indexOf(bandeira);
    return i >= 0 && argumentos[i + 1] !== undefined ? argumentos[i + 1] : padrao;
  };

  if (argumentos.includes('--autoteste')) {
    console.log(autoteste());
  } else {
    const destino = valorDe('--destino', '.env');
    relatar(
      gerar({
        destino,
        exemplo: valorDe('--exemplo', '.env.example'),
        marca: valorDe('--marca', MARCA_PADRAO),
      }),
      destino,
    );
  }
}
