#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. Mesmo acerto de `verificar-numero-de-adr.mjs`.
/**
 * `.jarvis/entregas/` — um arquivo por entrega, e por que o arquivo unico caiu.
 *
 * ====================================================================
 * O DEFEITO QUE ESTA FERRAMENTA EXISTE PARA TORNAR IMPOSSIVEL
 * ====================================================================
 *
 * `.jarvis/entregas.md` era um arquivo unico em que todo agente acrescentava a
 * propria linha no fim. O topo dele trazia, desde 17/09, o aviso:
 *
 *     ATENCAO: este arquivo e escrito EM SERIE. Acrescente sua linha no fim;
 *     nunca sobrescreva. Ja houve perda de entradas duas vezes por escrita
 *     concorrente.
 *
 * O aviso nao impediu nada, e nao podia: "acrescentar ao fim" com ferramenta de
 * edicao e uma leitura seguida de uma escrita do arquivo INTEIRO, e entre as
 * duas cabe a escrita de outro agente. Quem grava por ultimo grava por cima, e
 * o arquivo nao fica corrompido -- ele fica plausivel, com uma entrada a menos.
 *
 * Perdas reconhecidas dentro do proprio arquivo, pelos autores que as notaram:
 *   - HEFESTO, `docs/07-devops.md` secoes 1 a 15: "esta linha sumiu duas vezes
 *     do arquivo";
 *   - HELIOS, BICHUS-141: "esta linha foi perdida por escrita concorrente hoje,
 *     junto com as de MOIRA BICHUS-163 e de ZEFIRO" -- tres de uma vez.
 *
 * Cinco perdas, em dois episodios, e essas sao apenas as que alguem viu. O
 * arquivo esta no `.gitignore` (linha 54): nao ha `git log`, nao ha `git
 * checkout`, e nesta maquina nao ha Time Machine nem snapshot APFS. O que foi
 * sobrescrito e irrecuperavel e, pior, incontavel -- uma entrada apagada nao
 * deixa buraco na numeracao nem marcador de conflito. Ela simplesmente nunca
 * esteve la.
 *
 * ====================================================================
 * POR QUE UM DIRETORIO, E NAO UMA TRAVA
 * ====================================================================
 *
 * A alternativa era um auxiliar de acrescimo com trava de arquivo, que os
 * briefings mandariam usar. Ela foi recusada por depender de todo agente
 * lembrar de usa-la -- que e precisamente a dependencia que falhou. O aviso no
 * topo do arquivo ja era essa aposta, feita em 17/09, e ela perdeu cinco linhas.
 *
 * Com um arquivo por entrada, dois agentes escrevendo no mesmo instante
 * escrevem em arquivos diferentes, e nenhuma ordem de escrita perde dado. Nao
 * e uma probabilidade menor de colisao: e a ausencia da operacao que colide.
 *
 * O nome e sorteado, e a criacao usa `wx` -- `O_CREAT|O_EXCL`, que o POSIX
 * define como atomico. Se o nome ja existir, `open` falha com `EEXIST` e o
 * sorteio se repete. O arbitro e o kernel, nao a boa vontade de quem chama.
 *
 * O custo e real e esta aceito: ler o conjunto passa a exigir concatenar, e e
 * para isso que serve `entregas.mjs ler`.
 *
 * ====================================================================
 * POR QUE ESTA VERIFICACAO NAO E UM JOB DA ESTEIRA
 * ====================================================================
 *
 * `.jarvis/` nao esta no repositorio. Um job de CI que exigisse
 * `.jarvis/entregas/` reprovaria TODA execucao no GitHub Actions, porque la o
 * diretorio nunca existe -- e um portao que reprova o fluxo certo e um portao
 * que alguem desliga. `verificar` e ferramenta local, chamada pelo Makefile ou
 * a mao, e e assim de proposito.
 *
 * ====================================================================
 * O QUE `verificar` FAZ COM DIRETORIO VAZIO
 * ====================================================================
 *
 * REPROVA, com o motivo na mensagem. Diretorio ausente ou sem nenhuma entrada
 * significa que a ferramenta nao tem o que conferir, e verificacao que nao
 * consegue verificar nao aprova. O modo de falha que se quer evitar aqui e o
 * oposto do intuitivo: e o portao verde porque nao achou nada.
 *
 * A unica saida para diretorio legitimamente vazio e explicita:
 * `verificar --aceitar-vazio`, que ainda assim imprime o aviso.
 */
import {
  existsSync,
  mkdirSync,
  openSync,
  writeSync,
  closeSync,
  readdirSync,
  readFileSync,
  statSync,
  realpathSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIRETORIO = process.env.JARVIS_ENTREGAS ?? ".jarvis/entregas";

/**
 * `AAAA-MM-DD-HHMMSS-<agente>-<hex6>.md`
 *
 * O prefixo de data e hora faz a ordem lexicografica do nome coincidir com a
 * ordem cronologica, que e a unica ordem que um log de entregas precisa. O
 * sufixo aleatorio e o que permite dois agentes registrarem no mesmo segundo.
 */
const NOME = /^(\d{4}-\d{2}-\d{2})-(\d{6})-([a-z0-9-]+)-([0-9a-f]{6})\.md$/;

const ESTADOS = ["Tarefas pendentes", "Em andamento", "QA", "BLOCK"];

/** Acentos fora, minuscula, resto vira hifen. `HÉLIOS` -> `helios`. */
function slug(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "desconhecido";
}

function carimbo(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return {
    data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`,
  };
}

/**
 * Escreve a entrada num arquivo que ainda nao existe.
 *
 * O `wx` e o ponto inteiro desta funcao. Com ele o kernel garante que dois
 * processos nunca recebem o mesmo arquivo: um dos dois leva `EEXIST` e sorteia
 * outro nome. Trocar `wx` por `w` devolveria o defeito que o diretorio existe
 * para eliminar, em silencio e sem mudar mais nada no codigo.
 */
export function registrar({ agente, chave, estado, texto, data, hora, notas }) {
  if (!texto || !String(texto).trim()) {
    throw new Error("entrega sem texto: a linha existe para dizer o que ficou pronto");
  }
  const est = estado ?? "Em andamento";
  if (!ESTADOS.includes(est)) {
    throw new Error(
      `estado "${est}" nao e uma coluna do quadro. Os quatro que voce pode pedir: ${ESTADOS.join(", ")}`,
    );
  }
  mkdirSync(DIRETORIO, { recursive: true });
  const c = carimbo();
  const d = data ?? c.data;
  const h = hora ?? c.hora;
  const ag = slug(agente ?? "desconhecido");

  const cabecalho = [
    "---",
    `data: ${d}`,
    `agente: ${agente ?? "desconhecido"}`,
    `chave: ${chave && String(chave).trim() ? chave : "—"}`,
    `estado: ${est}`,
    ...(notas ? [`notas: ${notas}`] : []),
    "---",
    "",
  ].join("\n");

  // Ate 64 tentativas. Com 24 bits de aleatoriedade por sorteio, precisar de
  // uma segunda ja e evento raro; 64 existe para que um defeito de ambiente
  // (diretorio sem permissao devolvendo EEXIST, por exemplo) termine em erro
  // ruidoso e nao em laco infinito.
  for (let i = 0; i < 64; i++) {
    const nome = `${d}-${h}-${ag}-${randomBytes(3).toString("hex")}.md`;
    const caminho = join(DIRETORIO, nome);
    let fd;
    try {
      fd = openSync(caminho, "wx");
    } catch (erro) {
      if (erro.code === "EEXIST") continue;
      throw erro;
    }
    try {
      writeSync(fd, cabecalho + String(texto).replace(/\s+$/, "") + "\n");
    } finally {
      closeSync(fd);
    }
    return caminho;
  }
  throw new Error(
    `64 sorteios de nome seguidos deram EEXIST em ${DIRETORIO}. Isto nao e colisao de sorteio: confira permissao e estado do diretorio.`,
  );
}

/** Os arquivos de entrada, em ordem cronologica, com o que o nome declara. */
export function listar() {
  if (!existsSync(DIRETORIO)) return [];
  return readdirSync(DIRETORIO)
    .filter((n) => n.endsWith(".md") && n !== "README.md")
    .sort()
    .map((nome) => {
      const m = nome.match(NOME);
      return {
        nome,
        caminho: join(DIRETORIO, nome),
        data: m?.[1] ?? null,
        hora: m?.[2] ?? null,
        agente: m?.[3] ?? null,
        forma_ok: Boolean(m),
      };
    });
}

/** Separa o front-matter do corpo. Corpo e o que a entrega diz. */
function corpo(bruto) {
  if (!bruto.startsWith("---\n")) return bruto;
  const fim = bruto.indexOf("\n---\n", 4);
  if (fim === -1) return bruto;
  return bruto.slice(fim + 5).replace(/^\n/, "");
}

/**
 * O que `cat .jarvis/entregas.md` fazia antes: o conjunto, em ordem.
 *
 * Cada corpo e normalizado para terminar em exatamente uma quebra de linha
 * antes de juntar. Sem isso, uma entrada gravada sem quebra final cola na
 * seguinte e as duas viram uma linha -- duas entregas distintas passariam a
 * parecer uma, que e um jeito silencioso de perder informacao sem perder byte.
 */
export function ler() {
  return listar()
    .map((e) => corpo(readFileSync(e.caminho, "utf8")).replace(/\n*$/, "\n"))
    .join("");
}

function verificar(aceitarVazio) {
  const problemas = [];
  if (!existsSync(DIRETORIO)) {
    problemas.push(
      `${DIRETORIO}/ nao existe. Nao ha o que conferir, e conferencia que nao confere nao aprova.`,
    );
  } else if (!statSync(DIRETORIO).isDirectory()) {
    problemas.push(`${DIRETORIO} existe e nao e diretorio.`);
  } else {
    const entradas = listar();
    if (entradas.length === 0 && !aceitarVazio) {
      problemas.push(
        `${DIRETORIO}/ esta vazio. Se isto for legitimo, diga em voz alta com --aceitar-vazio; o silencio aqui seria a aprovacao por ausencia que este arquivo existe para nao dar.`,
      );
    }
    for (const e of entradas) {
      if (!e.forma_ok) {
        problemas.push(
          `${e.nome}: fora da forma AAAA-MM-DD-HHMMSS-<agente>-<hex6>.md. A ordem do conjunto sai do nome; nome errado sai de ordem.`,
        );
        continue;
      }
      const bruto = readFileSync(e.caminho, "utf8");
      if (!bruto.startsWith("---\n")) {
        problemas.push(`${e.nome}: sem front-matter. Falta dizer agente, chave e estado.`);
        continue;
      }
      const cab = bruto.slice(4, bruto.indexOf("\n---\n", 4));
      const estado = cab.match(/^estado:\s*(.+)$/m)?.[1]?.trim();
      if (!estado) {
        problemas.push(`${e.nome}: front-matter sem "estado".`);
      } else if (!ESTADOS.includes(estado)) {
        problemas.push(
          `${e.nome}: estado "${estado}" nao e coluna do quadro (${ESTADOS.join(", ")}).`,
        );
      }
      if (!corpo(bruto).trim()) {
        problemas.push(`${e.nome}: corpo vazio. Entrada sem texto nao registra entrega nenhuma.`);
      }
    }
    if (entradas.length > 0 || aceitarVazio) {
      console.log(`${DIRETORIO}/: ${entradas.length} entrada(s).`);
      if (entradas.length === 0) {
        console.log("AVISO: vazio, aceito por --aceitar-vazio. Ninguem registrou entrega.");
      }
    }
  }
  if (problemas.length) {
    console.error("\nREPROVADO:");
    for (const p of problemas) console.error(`  - ${p}`);
    return 1;
  }
  console.log("APROVADO: toda entrada tem forma, autor, estado de coluna e texto.");
  return 0;
}

function uso() {
  console.log(`uso: entregas.mjs <comando>

  registrar --agente <NOME> --estado <coluna> [--chave BICHUS-N] --texto "<o que ficou pronto>"
            cria UM arquivo novo em ${DIRETORIO}/. Nunca toca em arquivo de outro.
  ler       imprime o conjunto em ordem cronologica (o que "cat entregas.md" fazia)
  listar    uma linha por entrada: data, agente, arquivo
  verificar portao local. Diretorio ausente ou vazio REPROVA (--aceitar-vazio afrouxa,
            em voz alta). Nao e job de CI: .jarvis/ nao esta no repositorio.

  Colunas de estado: ${ESTADOS.join(", ")}`);
}

function argumentos(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const chave = argv[i].slice(2);
    const prox = argv[i + 1];
    if (prox === undefined || prox.startsWith("--")) out[chave] = true;
    else {
      out[chave] = prox;
      i++;
    }
  }
  return out;
}

function principal() {
  const [comando, ...resto] = process.argv.slice(2);
  const a = argumentos(resto);
  switch (comando) {
    case "registrar": {
      try {
        const caminho = registrar({
          agente: a.agente,
          chave: a.chave,
          estado: a.estado,
          texto: a.texto,
          notas: a.notas,
        });
        console.log(caminho);
        return 0;
      } catch (erro) {
        console.error(`nao registrou: ${erro.message}`);
        return 1;
      }
    }
    case "ler":
      process.stdout.write(ler());
      return 0;
    case "listar": {
      const entradas = listar();
      for (const e of entradas) {
        console.log(`${e.data ?? "????-??-??"} ${e.hora ?? "??????"} ${(e.agente ?? "?").padEnd(22)} ${e.nome}`);
      }
      console.error(`${entradas.length} entrada(s).`);
      return 0;
    }
    case "verificar":
      return verificar(Boolean(a["aceitar-vazio"]));
    default:
      uso();
      return comando ? 1 : 0;
  }
}

/**
 * A comparacao passa pelo `realpath` dos DOIS lados, e nao e zelo.
 *
 * `import.meta.url` resolve links simbolicos; `process.argv[1]` nao. Neste
 * macOS `/tmp` e `/var` sao links para `/private/tmp` e `/private/var`, entao
 * a forma ingenua `import.meta.url === "file://" + process.argv[1]` e FALSA
 * sempre que a ferramenta e invocada por um desses caminhos -- e o processo
 * termina com saida 0 sem ter executado nada.
 *
 * Saida 0 sem trabalho feito e o pior desfecho possivel aqui: quem chamou
 * acredita que registrou a entrega. O arnes de iscas pegou exatamente isso, e
 * a primeira versao deste arquivo tinha o defeito.
 */
const invocadoDiretamente = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invocadoDiretamente) {
  process.exit(principal());
}
