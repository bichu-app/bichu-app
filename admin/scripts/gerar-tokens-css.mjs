#!/usr/bin/env node
/**
 * Gera `admin/src/theme/tokens.g.css` a partir de `design/tokens.json`.
 *
 * Mesma forma do gerador Dart (`app/tool/gen_tokens.dart`): uma fonte na raiz
 * do repositorio, um destino gerado aqui, e uma verificacao que reprova quando
 * os dois divergem. A fonte fica fora de `admin/` de proposito: uma copia dos
 * tokens dentro do backoffice seria a segunda fonte da verdade que o paragrafo
 * 18.2.2 do design system existe para impedir.
 *
 * Uso, de dentro de `admin/`:
 *
 *   node scripts/gerar-tokens-css.mjs              escreve o CSS
 *   node scripts/gerar-tokens-css.mjs --verificar  so compara; saida 1 se divergir
 *
 * A verificacao NAO usa git. A pergunta e "gerar de novo muda o arquivo?", que
 * vale com a arvore limpa ou suja, igual a `infra/verificacao/verificar-tokens-gerados.mjs`.
 * Ela tambem reprova quando nao consegue perguntar: fonte ausente, destino
 * ausente ou vazio, ou uma geracao sem nenhuma cor. Verificacao que fica sem o
 * que checar e termina verde e pior que nenhuma.
 *
 * Decisoes de traducao para CSS, todas mecanicas:
 *
 * - Nome: `--bichu-<caminho com hifen>`. `cor.claro.primary` vira
 *   `--bichu-cor-primary` em `:root`; `cor.escuro.*` redefine os mesmos nomes
 *   sob `prefers-color-scheme: dark` e sob `:root[data-tema="escuro"]`.
 * - Apelido `{grupo.token}` vira `var(--bichu-grupo-token)`, para o CSS mostrar
 *   de onde cada papel vem.
 * - Papeis de `$extensions["bichu.nunca-texto"]` saem com o nome feio que o
 *   Dart usa, em kebab: `action-fill` vira `--bichu-cor-action-fill-raw-do-not-use-as-text`.
 *   Nome feio no ponto de uso e revisao que se faz sozinha (paragrafo 18.2.1).
 * - Dimensao em px vira rem (base 16) em tipografia, espaco, alvo, icone e
 *   layout, para respeitar o zoom do navegador (WCAG 1.4.4). Borda, foco, raio
 *   e sombra continuam em px: sao detalhe de traco.
 * - `layout.medida-max` sai em `ch` e `moldura.css` sai como o border-radius de
 *   quatro valores, calculado dos fatores do grupo: as duas regras estao
 *   escritas na `$description` desses tokens.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const FONTE = path.resolve(AQUI, '../../design/tokens.json');
export const DESTINO = path.resolve(AQUI, '../src/theme/tokens.g.css');

const PREFIXO = '--bichu';
const CHAVE_NUNCA_TEXTO = 'bichu.nunca-texto';
const GRUPOS_EM_PX = new Set(['border', 'focus', 'radius', 'shadow']);
const BASE_REM = 16;

const CABECALHO = `/*
 * GERADO POR admin/scripts/gerar-tokens-css.mjs A PARTIR DE design/tokens.json.
 * NAO EDITE. Para mudar um valor, edite design/tokens.json na raiz do
 * repositorio e rode, de dentro de admin/: npm run generate:tokens
 */
`;

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const nomeDaVariavel = (caminho) => `${PREFIXO}-${caminho.join('-')}`;
const arredondar = (n) => Number(n.toFixed(4)).toString();

function lerNomesFeios(raiz) {
  const declarado = raiz.$extensions?.[CHAVE_NUNCA_TEXTO];
  if (!declarado || typeof declarado !== 'object') {
    throw new Error(
      `design/tokens.json nao declara $extensions["${CHAVE_NUNCA_TEXTO}"]. Sem esse contrato o gerador ` +
        'emitiria nome bonito para cor que nunca pode ser texto (paragrafo 18.2.1).',
    );
  }
  const nomes = new Map();
  for (const [papel, nomeDart] of Object.entries(declarado)) {
    if (papel.startsWith('$')) continue;
    nomes.set(papel, kebab(nomeDart));
  }
  if (nomes.size === 0) {
    throw new Error(`$extensions["${CHAVE_NUNCA_TEXTO}"] esta vazio; o gerador nao segue com zero nomes feios.`);
  }
  return nomes;
}

/** Percorre a arvore e devolve os tokens folha com o `$type` herdado. */
function folhas(no, caminho = [], tipoHerdado = undefined, saida = []) {
  const tipo = no.$type ?? tipoHerdado;
  if (Object.hasOwn(no, '$value')) {
    saida.push({ caminho, tipo, valor: no.$value });
    return saida;
  }
  for (const [chave, filho] of Object.entries(no)) {
    if (chave.startsWith('$') || !filho || typeof filho !== 'object') continue;
    folhas(filho, [...caminho, chave], tipo, saida);
  }
  return saida;
}

function referencia(valor) {
  const m = typeof valor === 'string' ? /^\{([^}]+)\}$/.exec(valor) : null;
  return m ? `var(${nomeDaVariavel(m[1].split('.'))})` : null;
}

function dimensao(valor, emPx) {
  const ref = referencia(valor);
  if (ref) return ref;
  if (!valor || typeof valor.value !== 'number' || typeof valor.unit !== 'string') {
    throw new Error(`dimensao ilegivel: ${JSON.stringify(valor)}`);
  }
  if (valor.value === 0) return '0';
  if (valor.unit === 'px' && !emPx) return `${arredondar(valor.value / BASE_REM)}rem`;
  return `${arredondar(valor.value)}${valor.unit}`;
}

function familia(valor) {
  const ref = referencia(valor);
  if (ref) return ref;
  const lista = Array.isArray(valor) ? valor : [valor];
  const genericas = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);
  return lista.map((f) => (genericas.has(f) || f.startsWith('-') ? f : `"${f}"`)).join(', ');
}

function cor(valor) {
  const ref = referencia(valor);
  if (ref) return ref;
  if (typeof valor !== 'string' || !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(valor)) {
    throw new Error(`cor ilegivel: ${JSON.stringify(valor)}`);
  }
  return valor.toUpperCase();
}

/** Declaracoes CSS de um token folha: lista de [nome, valor]. */
function declarar({ caminho, tipo, valor }, emPx) {
  const nome = nomeDaVariavel(caminho);
  switch (tipo) {
    case 'color':
      return [[nome, cor(valor)]];
    case 'dimension':
      return [[nome, dimensao(valor, emPx)]];
    case 'duration':
      return [[nome, `${valor.value}${valor.unit}`]];
    case 'cubicBezier':
      return [[nome, `cubic-bezier(${valor.join(', ')})`]];
    case 'fontFamily':
      return [[nome, familia(valor)]];
    case 'fontWeight':
    case 'number':
      return [[nome, referencia(valor) ?? String(valor)]];
    case 'shadow':
      return [
        [
          nome,
          valor
            .map((s) =>
              [s.offsetX, s.offsetY, s.blur, s.spread].map((d) => dimensao(d, true)).join(' ') + ` ${cor(s.color)}`,
            )
            .join(', '),
        ],
      ];
    case 'typography':
      return [
        [`${nome}-font-family`, familia(valor.fontFamily)],
        [`${nome}-font-weight`, referencia(valor.fontWeight) ?? String(valor.fontWeight)],
        [`${nome}-font-size`, dimensao(valor.fontSize, false)],
        [`${nome}-line-height`, dimensao(valor.lineHeight, false)],
        [`${nome}-letter-spacing`, dimensao(valor.letterSpacing, false)],
      ];
    default:
      throw new Error(`$type sem traducao para CSS em ${caminho.join('.')}: ${String(tipo)}`);
  }
}

function bloco(seletor, declaracoes, recuo = '') {
  const linhas = declaracoes.map(([n, v]) => `${recuo}  ${n}: ${v};`);
  return `${recuo}${seletor} {\n${linhas.join('\n')}\n${recuo}}`;
}

/** A funcao inteira do gerador, pura: tokens em objeto, CSS em texto. */
export function gerarCss(tokens) {
  const nomesFeios = lerNomesFeios(tokens);
  const base = [];
  const papeis = { claro: [], escuro: [] };

  for (const [grupo, no] of Object.entries(tokens)) {
    if (grupo.startsWith('$') || !no || typeof no !== 'object') continue;

    if (grupo === 'cor') {
      for (const tema of ['claro', 'escuro']) {
        if (!no[tema]) throw new Error(`design/tokens.json nao tem cor.${tema}`);
        for (const f of folhas(no[tema], [], no.$type ?? 'color')) {
          const papel = f.caminho.join('-');
          const nome = nomesFeios.get(papel) ?? papel;
          papeis[tema].push(...declarar({ ...f, caminho: ['cor', nome] }, false));
        }
      }
      continue;
    }

    if (grupo === 'moldura') {
      const v = (k) => no[k].$value;
      const pct = (n) => `${arredondar(n * 100)}%`;
      const sup = v('raio-superior');
      const inf = v('raio-inferior');
      const prop = v('proporcao');
      for (const f of folhas(no, ['moldura'])) {
        if (f.caminho.at(-1) === 'css') continue;
        base.push(...declarar(f, false));
      }
      base.push([
        nomeDaVariavel(['moldura', 'css']),
        `${pct(sup)} ${pct(sup)} ${pct(inf)} ${pct(inf)} / ` +
          `${pct(sup / prop)} ${pct(sup / prop)} ${pct(inf / prop)} ${pct(inf / prop)}`,
      ]);
      continue;
    }

    for (const f of folhas(no, [grupo])) {
      if (f.caminho.join('.') === 'layout.medida-max') {
        base.push([nomeDaVariavel(f.caminho), `${f.valor.value}ch`]);
        continue;
      }
      base.push(...declarar(f, GRUPOS_EM_PX.has(grupo)));
    }
  }

  if (papeis.claro.length === 0 || papeis.escuro.length === 0) {
    throw new Error('a geracao saiu sem papeis de cor; algo na fonte mudou de forma e o gerador nao reconhece.');
  }

  return [
    CABECALHO,
    bloco(':root', [...base, ...papeis.claro]),
    '',
    '@media (prefers-color-scheme: dark) {',
    bloco(':root:not([data-tema="claro"])', papeis.escuro, '  '),
    '}',
    '',
    bloco(':root[data-tema="escuro"]', papeis.escuro),
    '',
  ].join('\n');
}

/**
 * Compara o CSS em disco com uma geracao nova. Devolve a lista de motivos para
 * reprovar; vazia significa em dia. Isolada para o teste exercitar a decisao.
 */
export function divergencias(emDisco, gerado) {
  if (emDisco === null) return [`${path.relative(process.cwd(), DESTINO)} nao existe`];
  if (emDisco.trim() === '') return [`${path.relative(process.cwd(), DESTINO)} esta vazio`];
  if (emDisco === gerado) return [];
  const a = emDisco.split('\n');
  const b = gerado.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return [`primeira linha divergente (${i + 1}):\n  em disco: ${a[i] ?? '<fim>'}\n  gerado:   ${b[i] ?? '<fim>'}`];
    }
  }
  return ['o conteudo diverge'];
}

function lerFonte() {
  if (!existsSync(FONTE)) throw new Error(`fonte dos tokens nao encontrada: ${FONTE}`);
  return JSON.parse(readFileSync(FONTE, 'utf8'));
}

function principal(argv) {
  const verificar = argv.includes('--verificar');
  const gerado = gerarCss(lerFonte());
  if (!verificar) {
    writeFileSync(DESTINO, gerado);
    process.stdout.write(`escrito ${path.relative(process.cwd(), DESTINO)}\n`);
    return 0;
  }
  const emDisco = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : null;
  const motivos = divergencias(emDisco, gerado);
  if (motivos.length > 0) {
    process.stderr.write(
      `REPROVADO: src/theme/tokens.g.css divergiu de design/tokens.json.\n${motivos.join('\n')}\n` +
        'Rode `npm run generate:tokens` de dentro de admin/ e versione o resultado. ' +
        'Se o valor gerado esta errado, o errado e o token, nao o CSS.\n',
    );
    return 1;
  }
  const quantas = (gerado.match(/^\s+--bichu-/gm) ?? []).length;
  process.stdout.write(`ok: src/theme/tokens.g.css bate com design/tokens.json (${quantas} declaracoes)\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (erro) {
    process.stderr.write(`REPROVADO: ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  }
}
