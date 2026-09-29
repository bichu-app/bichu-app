#!/usr/bin/env node
// Gera web/src/styles/tokens.g.css a partir de design/tokens.json (ADR-0028,
// item 8). A fonte e UMA, na raiz do repositorio; este arquivo so traduz.
//
//   node scripts/gerar-tokens-css.mjs              escreve o CSS
//   node scripts/gerar-tokens-css.mjs --verificar  reprova se gerar de novo mudaria o arquivo
//   node scripts/gerar-tokens-css.mjs --verificar --tokens <outro.json>
//                                                  a mesma pergunta contra outra fonte (a isca)
//
// A pergunta do --verificar e "gerar de novo muda o arquivo?", e nao
// `git diff`: quem acabou de mexer num token e regerou esta certo e ainda nao
// commitou, e o `git diff` reprovaria justamente esse estado. A esteira faz as
// duas coisas (gera e compara com o HEAD); este modo e o gemeo local.
//
// Nomes: o caminho do token com "." trocado por "-". Tres regras a mais:
//   - `cor.claro.X` e `cor.escuro.X` viram o MESMO nome, `--cor-X`: o tema e
//     escolha de bloco, nao de nome. O escuro so vale onde a pagina declara
//     `data-tema="automatico"` (as paginas publicas); o institucional e claro.
//   - tipografia composta vira cinco propriedades: -family, -weight, -size,
//     -line, -tracking. Tamanho e entrelinha saem em rem (base 16), para
//     respeitar o tamanho de letra que a pessoa escolheu no navegador.
//   - toda familia de fonte termina na pilha do sistema. O site nao carrega
//     fonte web (ADR-0028, item 7): a familia da marca so aparece se estiver
//     instalada no aparelho, e senao vale a do sistema, nunca a serifa padrao.
//
// Todo token entra, inclusive primitivo que nenhum papel usa: assim qualquer
// mudanca em tokens.json muda o derivado, e a isca pode mexer em qualquer um.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const RAIZ = resolve(WEB, '..');
const SAIDA_PADRAO = resolve(WEB, 'src/styles/tokens.g.css');
const FONTE_PADRAO = resolve(RAIZ, 'design/tokens.json');

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
}

const verificar = process.argv.includes('--verificar');
const fonte = resolve(argumento('--tokens') ?? FONTE_PADRAO);
const saida = resolve(argumento('--saida') ?? SAIDA_PADRAO);

if (!existsSync(fonte)) {
  console.error(`ERRO: nao achei a fonte dos tokens em ${fonte}. Sem fonte nao ha o que conferir, e isso reprova.`);
  process.exit(2);
}

const tokens = JSON.parse(readFileSync(fonte, 'utf8'));

// ---------------------------------------------------------------------------
// leitura: achata a arvore em [caminho, token, $type herdado]
// ---------------------------------------------------------------------------
function achatar(no, caminho = [], tipoHerdado = null, acc = []) {
  const tipo = no.$type ?? tipoHerdado;
  if (Object.prototype.hasOwnProperty.call(no, '$value')) {
    acc.push({ caminho, valor: no.$value, tipo });
    return acc;
  }
  for (const [chave, filho] of Object.entries(no)) {
    if (chave.startsWith('$')) continue;
    if (filho && typeof filho === 'object') achatar(filho, [...caminho, chave], tipo, acc);
  }
  return acc;
}

const todos = achatar(tokens);
const porCaminho = new Map(todos.map((t) => [t.caminho.join('.'), t]));

function nomeCss(caminho) {
  if (caminho[0] === 'cor' && (caminho[1] === 'claro' || caminho[1] === 'escuro')) {
    return `--cor-${caminho.slice(2).join('-')}`;
  }
  return `--${caminho.join('-')}`;
}

const REF = /^\{([^}]+)\}$/;

function referencia(valor) {
  if (typeof valor !== 'string') return null;
  const m = REF.exec(valor);
  if (!m) return null;
  const alvo = porCaminho.get(m[1]);
  if (!alvo) {
    console.error(`ERRO: o token referencia {${m[1]}}, que nao existe em ${relative(RAIZ, fonte)}.`);
    process.exit(2);
  }
  return alvo;
}

const dimensao = (v) => `${v.value}${v.unit}`;
const rem = (v) => (v.unit === 'px' ? `${+(v.value / 16).toFixed(4)}rem` : dimensao(v));

function familia(lista, caminho) {
  const nomes = lista.map((n) => (/^[a-zA-Z-]+$/.test(n) ? n : `"${n}"`)).join(', ');
  return caminho.join('.') === 'font.family.sistema' ? nomes : `${nomes}, var(--font-family-sistema)`;
}

function css(valor, tipo, caminho) {
  const ref = referencia(valor);
  if (ref) return `var(${nomeCss(ref.caminho)})`;
  if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'value' in valor && 'unit' in valor) {
    return dimensao(valor);
  }
  if (tipo === 'fontFamily' || (Array.isArray(valor) && caminho[0] === 'font' && caminho[1] === 'family')) {
    return familia(valor, caminho);
  }
  if (tipo === 'cubicBezier' || (Array.isArray(valor) && caminho[0] === 'easing')) {
    return `cubic-bezier(${valor.join(', ')})`;
  }
  if (tipo === 'shadow' || (Array.isArray(valor) && caminho[0] === 'shadow')) {
    return valor
      .map((s) => `${dimensao(s.offsetX)} ${dimensao(s.offsetY)} ${dimensao(s.blur)} ${dimensao(s.spread)} ${css(s.color, 'color', caminho)}`)
      .join(', ');
  }
  if (typeof valor === 'string' || typeof valor === 'number') return String(valor);
  console.error(`ERRO: nao sei traduzir ${caminho.join('.')} (${JSON.stringify(valor)}). Gerador que nao entende um token precisa parar, nao pular.`);
  process.exit(2);
}

function ehTipografia(t) {
  return t.valor && typeof t.valor === 'object' && !Array.isArray(t.valor) && 'fontSize' in t.valor;
}

function linhas(t) {
  const nome = nomeCss(t.caminho);
  const origem = t.caminho.join('.');
  if (ehTipografia(t)) {
    const v = t.valor;
    const valorDe = (campo, conversor) => {
      const ref = referencia(v[campo]);
      return ref ? `var(${nomeCss(ref.caminho)})` : conversor(v[campo]);
    };
    return [
      `  ${nome}-family: ${valorDe('fontFamily', (x) => familia(x, t.caminho))}; /* ${origem}.fontFamily */`,
      `  ${nome}-weight: ${valorDe('fontWeight', String)}; /* ${origem}.fontWeight */`,
      `  ${nome}-size: ${valorDe('fontSize', rem)}; /* ${origem}.fontSize */`,
      `  ${nome}-line: ${valorDe('lineHeight', rem)}; /* ${origem}.lineHeight */`,
      `  ${nome}-tracking: ${valorDe('letterSpacing', dimensao)}; /* ${origem}.letterSpacing */`,
    ];
  }
  return [`  ${nome}: ${css(t.valor, t.tipo, t.caminho)}; /* ${origem} */`];
}

const claro = todos.filter((t) => !(t.caminho[0] === 'cor' && t.caminho[1] === 'escuro'));
const escuro = todos.filter((t) => t.caminho[0] === 'cor' && t.caminho[1] === 'escuro');

if (escuro.length === 0 || !claro.some((t) => t.caminho[0] === 'cor')) {
  console.error('ERRO: nao achei os dois temas em cor.claro e cor.escuro. O derivado sairia pela metade.');
  process.exit(2);
}

const texto = [
  `/* GERADO por web/scripts/gerar-tokens-css.mjs a partir de design/tokens.json. NAO EDITE.`,
  `   Para mudar um valor, edite design/tokens.json e rode, de dentro de web/:`,
  `     node scripts/gerar-tokens-css.mjs`,
  `   Pontos de quebra (web.breakpoint.*) saem aqui so como documento: CSS nao aceita var() em @media,`,
  `   e o varredor de valores soltos confere que todo @media do site usa um destes numeros. */`,
  ':root {',
  ...claro.flatMap(linhas),
  '}',
  '',
  '/* Tema escuro: so nas paginas que pedem (data-tema="automatico"). */',
  '@media (prefers-color-scheme: dark) {',
  '  :root[data-tema="automatico"] {',
  ...escuro.flatMap(linhas).map((l) => `  ${l}`),
  '    color-scheme: dark;',
  '  }',
  '}',
  '',
].join('\n');

if (verificar) {
  const atual = existsSync(saida) ? readFileSync(saida, 'utf8') : null;
  if (atual !== texto) {
    const rel = relative(RAIZ, saida);
    console.error(
      `ERRO: ${rel} divergiu de ${relative(RAIZ, fonte)}.\n` +
        `  Rode 'node scripts/gerar-tokens-css.mjs' de dentro de web/ e versione o resultado.\n` +
        `  Se o valor gerado esta errado, o errado e o token, nao o CSS.`,
    );
    process.exit(1);
  }
  console.log(`${relative(RAIZ, saida)} em dia com ${relative(RAIZ, fonte)} (${todos.length} tokens).`);
} else {
  writeFileSync(saida, texto);
  console.log(`escrevi ${relative(RAIZ, saida)} (${todos.length} tokens).`);
}
