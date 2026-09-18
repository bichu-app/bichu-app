#!/usr/bin/env node
/* global console, process, URL */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. `/* eslint-env node */` nao serve -- a configuracao
// plana do ESLint 9 deixou de honrar `eslint-env`.
/**
 * BICHUS-25 - lint de limite de chamada.
 *
 * Toda operacao PUBLICA precisa declarar `x-rate-limit`, e toda regra de
 * `x-rate-limit` precisa usar palavras que o contrato reconheca.
 *
 * ====================================================================
 * POR QUE O VOCABULARIO NAO ESTA ESCRITO AQUI DENTRO
 * ====================================================================
 *
 * A historia reprovou no refinamento por uma contradicao de numeros: o criterio
 * 7 dizia oito palavras de `on_exceed`, a secao 4.10 de `docs/04-seguranca.md`
 * dizia nove, e o contrato usava onze. Escrita com oito ou com nove, uma lista
 * aqui dentro reprovaria o PROPRIO CONTRATO na primeira execucao, em tres
 * operacoes.
 *
 * O arquiteto resolveu tirando o vocabulario da prosa: `x-rate-limit-vocabulary`
 * na raiz de `api/openapi.yaml` declara `on_exceed`, `counts`, `applies_to` e
 * `when` de forma legivel por maquina. Este verificador LE DALI.
 *
 * Nao e conveniencia: lista repetida aqui seria a segunda fonte da verdade, e
 * uma segunda fonte que diverge da primeira faz o portao reprovar o documento
 * que ele existe para proteger. Palavra nova entra no contrato -- onde ela e
 * revisada como contrato -- e nao no lint.
 *
 * ====================================================================
 * A PROVA NEGATIVA RODA JUNTO, SEMPRE
 * ====================================================================
 *
 * Antes de varrer o contrato, este script roda as duas iscas de
 * `tests/lint-limite/`:
 *
 *   - `deve-reprovar-operacao-publica-sem-limite.yaml` PRECISA reprovar, nas
 *     quatro operacoes, nominalmente;
 *   - `deve-aprovar-excecoes-declaradas.yaml` PRECISA passar.
 *
 * As duas, e nao so a primeira: lint que reprova qualquer coisa e tao inutil
 * quanto lint que aprova qualquer coisa, e o segundo defeito so aparece quando
 * alguem tenta passar uma excecao legitima. Se qualquer uma das duas der o
 * resultado errado, este script falha com "o lint parou de enxergar" e NAO
 * chega a avaliar o contrato: a partir dali o verde dele nao significaria nada.
 *
 * Uso:
 *   node infra/verificacao/verificar-limite-de-chamada.mjs [caminho-da-spec]
 * Saida: 0 aprovado, 1 reprovado.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse as parseYaml } from 'yaml';

const require = createRequire(import.meta.url);
const VERSAO_DO_YAML = require('yaml/package.json').version;
const VERSAO_DO_VERIFICADOR = '1.0.0';

const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * EXCECOES, EXPLICITAS NO PROPRIO LINT (criterio 2 da historia).
 *
 * Excecao nova entra aqui com o motivo escrito, e NUNCA por omissao. Operacao
 * que escapa por nao estar no filtro e a mesma coisa que operacao sem limite,
 * com a diferenca de que ninguem consegue ver que ela escapou.
 */
const PUBLICAS_SEM_LIMITE = new Map([
  [
    'get /health',
    'quem chama e a sonda do balanceador e do orquestrador. Limitar a sonda tira o ' +
      'servico de rotacao exatamente sob carga, que e o oposto do que o limite existe ' +
      'para fazer (criterio 3)',
  ],
]);

/**
 * Arquivos que quem busca e o SISTEMA OPERACIONAL ou uma biblioteca de
 * validacao de token (criterio 4). Eles tem limite e passam, mas o
 * comportamento no estouro e `log_and_alert`, nunca `challenge` nem `deny_429`.
 *
 * Isto e regra, e nao comentario, por causa do dia em que alguem "endurecer" um
 * deles para 429 achando que esta melhorando a seguranca: quem busca esses
 * arquivos nao resolve desafio e nao repete depois de um 429. Recusar ali
 * quebra a verificacao de dominio EM SILENCIO e o deep link para de funcionar
 * sem ninguem saber por que.
 */
const ARQUIVOS_DE_PLATAFORMA = new Set([
  '/.well-known/assetlinks.json',
  '/.well-known/apple-app-site-association',
  '/.well-known/jwks.json',
  '/.well-known/openid-configuration',
]);
const PROIBIDO_EM_ARQUIVO_DE_PLATAFORMA = new Set(['challenge', 'deny_429']);

class Reprovacao extends Error {}

function listaDe(valor) {
  if (Array.isArray(valor)) return valor.filter((v) => typeof v === 'string');
  if (valor && typeof valor === 'object') return Object.keys(valor);
  return null;
}

/**
 * `on_exceed` e um mapa palavra -> semantica no contrato; os outros tres sao
 * listas. Os dois formatos viram conjunto de palavras aqui.
 */
function normalizarVocabulario(bruto, fonte) {
  if (!bruto || typeof bruto !== 'object') {
    throw new Reprovacao(
      `${fonte} nao declara \`x-rate-limit-vocabulary\` na raiz. Sem ele o lint nao tem ` +
        'contra o que conferir `on_exceed` e `counts`, e por isso REPROVA: verificacao que ' +
        'nao consegue verificar nunca aprova',
    );
  }
  const vocabulario = {};
  for (const campo of ['on_exceed', 'counts', 'applies_to', 'when']) {
    const lista = listaDe(bruto[campo]);
    if (lista === null || lista.length === 0) {
      throw new Reprovacao(
        `o vocabulario de ${fonte} nao declara \`${campo}\`. Sem ele o lint aprovaria ` +
          'qualquer palavra neste campo, que e passar verde por nao ter o que checar',
      );
    }
    vocabulario[campo] = new Set(lista);
  }
  return vocabulario;
}

function carregar(caminho) {
  let texto;
  try {
    texto = readFileSync(caminho, 'utf8');
  } catch (erro) {
    throw new Reprovacao(
      `a especificacao \`${caminho}\` nao pode ser lida: ${erro?.message ?? erro}. ` +
        'O job falha aqui em vez de passar verde por nao ter o que checar (criterio 6)',
    );
  }
  let documento;
  try {
    documento = parseYaml(texto);
  } catch (erro) {
    throw new Reprovacao(
      `a especificacao \`${caminho}\` nao e YAML valido: ${erro?.message ?? erro}`,
    );
  }
  if (!documento || typeof documento !== 'object') {
    throw new Reprovacao(`a especificacao \`${caminho}\` nao carregou como um mapa`);
  }
  return documento;
}

/**
 * Publica = quem chama nao precisa de conta. Sao os dois casos do criterio 1:
 * `security: []` (nenhum esquema) e autenticacao OPCIONAL (a lista traz `{}`
 * entre as alternativas, o que significa "tambem serve sem credencial").
 *
 * Operacao SEM `security` declarado nao entra aqui de proposito: ela herda o
 * padrao global, e quem a barra e o portao de contrato publico
 * (`src/tools/portao-contrato-publico.ts`, BICHUS-55 criterio 3), que recusa o
 * documento inteiro. Duas verificacoes acusando o mesmo defeito com mensagens
 * diferentes mandam quem le procurar dois defeitos onde ha um.
 */
function ehPublica(operacao) {
  const seguranca = operacao?.security;
  if (!Array.isArray(seguranca)) return false;
  if (seguranca.length === 0) return true;
  return seguranca.some((alternativa) => Object.keys(alternativa ?? {}).length === 0);
}

function operacoesDe(documento, caminho) {
  const paths = documento.paths;
  if (!paths || typeof paths !== 'object') {
    throw new Reprovacao(
      `\`${caminho}\` nao tem \`paths\`. Nao haveria operacao nenhuma para percorrer e o ` +
        'lint terminaria verde sem verificar nada',
    );
  }
  const operacoes = [];
  for (const [rota, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (!operacao || typeof operacao !== 'object') continue;
      operacoes.push({ rota, metodo, operacao });
    }
  }
  if (operacoes.length === 0) {
    throw new Reprovacao(
      `\`${caminho}\`: \`paths\` existe e nao tem nenhuma operacao. Filtro que nao filtra ` +
        'termina verde e ninguem desconfia: a ausencia de alvo reprova',
    );
  }
  return operacoes;
}

function achadosDaOperacao({ rota, metodo, operacao }, vocabulario) {
  const id = operacao.operationId ?? `${metodo.toUpperCase()} ${rota}`;
  const chave = `${metodo} ${rota}`;
  const achados = [];

  const limites = operacao['x-rate-limit'];
  const publica = ehPublica(operacao);
  const dispensa = PUBLICAS_SEM_LIMITE.get(chave);

  if (limites === undefined || limites === null) {
    if (publica && dispensa === undefined) {
      achados.push(
        `${id} (${metodo.toUpperCase()} ${rota}) e publica (\`security: []\` ou autenticacao ` +
          'opcional) e nao declara `x-rate-limit`. Rota publica sem teto e o vetor de abuso ' +
          'barato. Se ela for excecao, a excecao entra na lista do proprio lint com o motivo ' +
          'escrito, e nunca por omissao',
      );
    }
    return achados;
  }

  if (publica && dispensa !== undefined) {
    achados.push(
      `${id} esta na lista de excecoes do lint (${dispensa}) e MESMO ASSIM declara ` +
        '`x-rate-limit`. Um dos dois esta errado: ou o teto entrou por engano, ou a excecao ' +
        'venceu e precisa sair da lista',
    );
  }

  if (!Array.isArray(limites)) {
    achados.push(`${id}: \`x-rate-limit\` precisa ser uma lista de regras, e veio ${typeof limites}`);
    return achados;
  }
  if (limites.length === 0) {
    achados.push(
      `${id}: \`x-rate-limit\` esta vazio. Lista vazia passa em qualquer conferencia de ` +
        'presenca e nao impoe teto nenhum -- e o jeito mais silencioso de uma rota publica ' +
        'ficar sem limite',
    );
    return achados;
  }

  limites.forEach((regra, indice) => {
    const onde = `${id}: \`x-rate-limit[${indice}]\``;
    if (!regra || typeof regra !== 'object') {
      achados.push(`${onde} nao e um mapa`);
      return;
    }

    if (regra.on_exceed === undefined) {
      achados.push(
        `${onde} nao declara \`on_exceed\`. Teto sem comportamento declarado nao diz o que o ` +
          'servico faz no estouro, e cada leitor supoe um comportamento diferente',
      );
    } else if (!vocabulario.on_exceed.has(regra.on_exceed)) {
      achados.push(
        `${onde} usa \`on_exceed: ${regra.on_exceed}\`, que nao esta em ` +
          '`x-rate-limit-vocabulary.on_exceed` do contrato. Palavra fora do vocabulario nao tem ' +
          'comportamento definido, e por isso reprova em vez de ser tratada como sinonimo de ' +
          `outra. Vocabulario: ${[...vocabulario.on_exceed].join(', ')}`,
      );
    } else if (
      ARQUIVOS_DE_PLATAFORMA.has(rota) &&
      PROIBIDO_EM_ARQUIVO_DE_PLATAFORMA.has(regra.on_exceed)
    ) {
      achados.push(
        `${onde} usa \`on_exceed: ${regra.on_exceed}\` num arquivo que quem busca e o sistema ` +
          'operacional ou uma biblioteca de validacao de token. Eles nao resolvem desafio e nao ' +
          'repetem depois de um 429: recusar ali quebra a verificacao de dominio EM SILENCIO e o ' +
          'deep link para de funcionar. Use `log_and_alert` (criterio 4)',
      );
    }

    for (const campo of ['counts', 'applies_to', 'when']) {
      const valor = regra[campo];
      if (valor === undefined) continue;
      if (!vocabulario[campo].has(valor)) {
        achados.push(
          `${onde} usa \`${campo}: ${valor}\`, que nao esta em ` +
            `\`x-rate-limit-vocabulary.${campo}\` do contrato. ` +
            `Valores declarados: ${[...vocabulario[campo]].join(', ')}`,
        );
      }
    }
  });

  return achados;
}

/**
 * Avalia um documento. `vocabularioDe` existe para as iscas: elas sao fragmentos
 * de OpenAPI escritos pelo QA, nao o contrato, e nao carregam o bloco de
 * vocabulario. O vocabulario continua sendo UM SO -- o do contrato. Este
 * parametro aponta para ele, nao o copia.
 */
export function avaliar(caminho, vocabularioDe = null) {
  const documento = carregar(caminho);
  const fonteDoVocabulario = vocabularioDe ?? caminho;
  const bruto =
    documento['x-rate-limit-vocabulary'] ??
    (vocabularioDe ? carregar(vocabularioDe)['x-rate-limit-vocabulary'] : undefined);
  const vocabulario = normalizarVocabulario(bruto, `\`${fonteDoVocabulario}\``);

  const operacoes = operacoesDe(documento, caminho);
  const achados = operacoes.flatMap((o) => achadosDaOperacao(o, vocabulario));
  return { operacoes: operacoes.length, achados };
}

// ---------------------------------------------------------------------------
// Autoteste: as iscas do QA. E a parte que importa.
// ---------------------------------------------------------------------------

const ISCA_REPROVA = 'tests/lint-limite/deve-reprovar-operacao-publica-sem-limite.yaml';
const ISCA_APROVA = 'tests/lint-limite/deve-aprovar-excecoes-declaradas.yaml';

/**
 * As quatro operacoes que a isca declara, no cabecalho dela, que precisam ser
 * acusadas. Conferir a CONTAGEM nao bastaria: quatro achados concentrados em
 * duas operacoes passariam por quatro achados em quatro, e o lint estaria cego
 * em duas familias sem que nada acusasse.
 */
const ESPERADAS_NA_ISCA = [
  'publicaSemLimite',
  'opcionalSemLimite',
  'limiteComPalavraInventada',
  'limiteComCountsInventado',
];

function autoteste(contrato) {
  const falhas = [];

  let reprovada;
  try {
    reprovada = avaliar(ISCA_REPROVA, contrato);
  } catch (erro) {
    falhas.push(`${ISCA_REPROVA}: nao foi possivel avaliar a isca: ${erro.message}`);
    reprovada = null;
  }
  if (reprovada) {
    if (reprovada.achados.length === 0) {
      falhas.push(
        `${ISCA_REPROVA}: A ISCA PASSOU. O lint de limite de chamada parou de enxergar, e ` +
          'a partir daqui o verde dele nao significa nada',
      );
    }
    for (const esperada of ESPERADAS_NA_ISCA) {
      if (!reprovada.achados.some((a) => a.includes(esperada))) {
        falhas.push(
          `${ISCA_REPROVA}: a isca declara que \`${esperada}\` precisa ser acusada, e ela nao ` +
            'aparece em nenhum achado. O lint ficou cego nesta familia de defeito',
        );
      }
    }
  }

  let aprovada;
  try {
    aprovada = avaliar(ISCA_APROVA, contrato);
  } catch (erro) {
    falhas.push(`${ISCA_APROVA}: nao foi possivel avaliar a contraprova: ${erro.message}`);
    aprovada = null;
  }
  if (aprovada && aprovada.achados.length > 0) {
    falhas.push(
      `${ISCA_APROVA}: A CONTRAPROVA REPROVOU. Lint que reprova qualquer coisa e tao inutil ` +
        'quanto lint que aprova qualquer coisa. Achados: ' +
        aprovada.achados.join(' | '),
    );
  }

  return falhas;
}

function main(argv) {
  const contrato = argv[2] ?? 'api/openapi.yaml';
  console.log(
    `verificar-limite-de-chamada ${VERSAO_DO_VERIFICADOR} | ${process.version} | yaml ${VERSAO_DO_YAML}`,
  );
  console.log(`contrato: ${contrato}`);

  const falhasDoAutoteste = autoteste(contrato);
  console.log(`  [${falhasDoAutoteste.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (falhasDoAutoteste.length > 0) {
    console.error('');
    console.error('O LINT ESTA CEGO:');
    for (const falha of falhasDoAutoteste) console.error(`  - ${falha}`);
    console.error('');
    console.error(
      'O contrato NAO foi avaliado: com o lint cego, aprovar o contrato seria afirmar o que ' +
        'nao foi verificado.',
    );
    return 1;
  }

  let resultado;
  try {
    resultado = avaliar(contrato);
  } catch (erro) {
    if (erro instanceof Reprovacao) {
      console.error(`  [REPROVA] ${erro.message}`);
      return 1;
    }
    throw erro;
  }

  console.log(
    `  [${resultado.achados.length === 0 ? 'ok' : 'REPROVA'}] contrato ` +
      `(${resultado.operacoes} operacoes, ${resultado.achados.length} achado(s))`,
  );
  console.log('  excecoes declaradas no lint:');
  for (const [chave, motivo] of PUBLICAS_SEM_LIMITE) console.log(`    ${chave}: ${motivo}`);

  if (resultado.achados.length > 0) {
    console.error('');
    console.error(`REPROVADO com ${resultado.achados.length} achado(s):`);
    for (const achado of resultado.achados) console.error(`  - ${achado}`);
    return 1;
  }

  console.log('');
  console.log('APROVADO');
  return 0;
}

const invocadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) process.exit(main(process.argv));
