#!/usr/bin/env node
/* global console, process */
/**
 * Migra `.jarvis/entregas.md` para `.jarvis/entregas/`, um arquivo por entrada.
 *
 * A prova nao e impressao de que ficou igual: e SHA-256. O script reconstroi o
 * arquivo antigo a partir dos arquivos novos (prefacio + corpos concatenados na
 * ordem) e compara o hash com o do original. Difere em um byte, aborta e nao
 * escreve nada de definitivo.
 *
 * Rode com --executar para escrever. Sem isso, so mede e relata.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ORIGEM = process.argv.includes("--origem")
  ? process.argv[process.argv.indexOf("--origem") + 1]
  : ".jarvis/entregas.md";
const DESTINO = process.argv.includes("--destino")
  ? process.argv[process.argv.indexOf("--destino") + 1]
  : ".jarvis/entregas";
const EXECUTAR = process.argv.includes("--executar");

const sha = (s) => createHash("sha256").update(s).digest("hex");

const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "desconhecido";

const original = readFileSync(ORIGEM, "utf8");
const linhas = original.split("\n");

// O prefacio: as linhas `>` do topo e o que vier ate a primeira entrada.
let i = 0;
while (i < linhas.length && !ehInicioDeEntrada(linhas[i])) i++;
const prefacio = linhas.slice(0, i).join("\n") + (i < linhas.length ? "\n" : "");

/** Uma entrada comeca em `- **<data> — <Papel>**` ou em `<CHAVE> | <estado> |`. */
function ehInicioDeEntrada(l) {
  return /^- \*\*/.test(l) || /^(BICHUS?-[0-9A-Za-z—-]+|—) \| /.test(l);
}

// Blocos: da linha de inicio ate a linha antes do proximo inicio. Tudo que vem
// no meio (linha em branco, paragrafo numerado de entrada multilinha) fica com
// a entrada a que pertence. E o que garante o round-trip byte a byte.
const blocos = [];
for (let j = i; j < linhas.length; j++) {
  if (ehInicioDeEntrada(linhas[j])) blocos.push({ inicio: j, linhas: [linhas[j]] });
  else if (blocos.length) blocos[blocos.length - 1].linhas.push(linhas[j]);
  else throw new Error(`linha ${j + 1} fora de qualquer entrada e fora do prefacio`);
}

const PAPEIS = [
  "JARVIS","ORÁCULO","ORACULO","MOIRA","KAIRÓS","KAIROS","DÉDALO","DEDALO","ARGOS","HEFESTO",
  "ARIADNE","ÍRIS","IRIS","AURORA","HERMES","ATLAS","TÊMIS","TEMIS","CALÍOPE","CALIOPE",
  "TÁLIA","TALIA","PROMETEU","TRITÃO","TRITAO","CRONOS","ZÉFIRO","ZEFIRO","HÉLIOS","HELIOS",
  "SELENE","ÉOLO","EOLO","LINCEU","NÊMESIS","NEMESIS",
];

let ultimaData = null;
const preparados = blocos.map((b, idx) => {
  const texto = b.linhas.join("\n");
  const cab = b.linhas[0];

  // Data: do proprio bloco quando ele a declara; senao a da entrada anterior,
  // e isso fica escrito no front-matter em vez de virar numero inventado.
  const mData = cab.match(/\*\*(\d{2})\/(\d{2})\/(\d{4})/) ?? texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  let data, dataInferida = false;
  if (mData) {
    data = `${mData[3]}-${mData[2]}-${mData[1]}`;
    ultimaData = data;
  } else {
    data = ultimaData ?? "2026-09-17";
    dataInferida = true;
  }

  // Agente: o codinome, onde ele aparecer no cabecalho do bloco.
  const janela = cab.slice(0, 400).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const achado = PAPEIS.map((p) => p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase())
    .find((p) => new RegExp(`\\b${p}\\b`).test(janela));
  // Duas entradas assinam pelo TITULO do papel e nao pelo codinome. A
  // correspondencia entre os dois esta em platform/roles.yaml, entao isto e
  // leitura de um mapa que existe, nao deducao sobre quem escreveu.
  const PORTITULO = [["ORQUESTRADOR", "JARVIS"], ["UX SPECIALIST", "ARIADNE"]];
  const porTitulo = PORTITULO.find(([t]) => janela.includes(t))?.[1];
  const agente = achado ?? porTitulo ?? "desconhecido";

  // Chave da issue, quando o bloco a traz.
  const chave = cab.match(/\bBICHUS?-\d+\b/)?.[0] ?? "—";

  // Estado: o que o bloco declarar; os nomes antigos viram os quatro de hoje.
  const brutoEstado = cab.match(/\|\s*([^|]{1,40}?)\s*\|/)?.[1]?.trim() ?? "";
  const estado =
    /BLOCK/i.test(brutoEstado) ? "BLOCK"
    : /(^|\W)(QA|GQ|In Review|Em revis)/i.test(brutoEstado) ? "QA"
    : /(In Progress|Em andamento)/i.test(brutoEstado) ? "Em andamento"
    : /(To Do|Tarefas pendentes)/i.test(brutoEstado) ? "Tarefas pendentes"
    : /Done|Conclu/i.test(brutoEstado) ? "QA"
    : "Em andamento";

  // Hora sintetica derivada da POSICAO original. E o que faz a ordem
  // lexicografica dos nomes reproduzir a ordem do arquivo antigo, e ela esta
  // declarada como sintetica no front-matter para ninguem a ler como fato.
  const seg = idx;
  const hora = `${String(Math.floor(seg / 3600)).padStart(2, "0")}${String(Math.floor(seg / 60) % 60).padStart(2, "0")}${String(seg % 60).padStart(2, "0")}`;

  const notas = [
    "migrado de .jarvis/entregas.md em 2026-09-23",
    `ordem original: ${String(idx + 1).padStart(4, "0")}`,
    "hora sintetica (o arquivo antigo nao registrava hora)",
    ...(dataInferida ? ["data herdada da entrada anterior: o bloco nao declarava data"] : []),
    ...(agente === "desconhecido" ? ["autor nao identificavel no texto do bloco"] : []),
  ].join("; ");

  const nome = `${data}-${hora}-${slug(agente)}-${sha(texto).slice(0, 6)}.md`;
  const conteudo =
    ["---", `data: ${data}`, `agente: ${agente}`, `chave: ${chave}`, `estado: ${estado}`, `notas: ${notas}`, "---", ""].join("\n") +
    texto;
  return { nome, conteudo, texto, idx };
});

// ---- PROVA 1: nomes unicos -------------------------------------------------
const nomes = new Set(preparados.map((p) => p.nome));
if (nomes.size !== preparados.length) {
  console.error(`ABORTADO: ${preparados.length - nomes.size} nome(s) de arquivo repetido(s).`);
  process.exit(1);
}

// ---- PROVA 2: round-trip byte a byte --------------------------------------
const reconstruido = prefacio + preparados.map((p) => p.texto).join("\n");
const shaOriginal = sha(original);
const shaReconstruido = sha(reconstruido);

console.log(`origem:        ${ORIGEM}`);
console.log(`entradas:      ${preparados.length}`);
console.log(`prefacio:      ${prefacio.split("\n").length - 1} linha(s), preservado no README do diretorio`);
console.log(`sha256 origem: ${shaOriginal}`);
console.log(`sha256 recons: ${shaReconstruido}`);
console.log(`round-trip:    ${shaOriginal === shaReconstruido ? "IDENTICO" : "DIFERENTE"}`);

if (shaOriginal !== shaReconstruido) {
  console.error("ABORTADO: a reconstrucao nao bate com o original byte a byte. Nada foi escrito.");
  const a = original.split("\n"), b = reconstruido.split("\n");
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k] !== b[k]) { console.error(`primeira divergencia na linha ${k + 1}:\n  antes: ${String(a[k]).slice(0,160)}\n  depois: ${String(b[k]).slice(0,160)}`); break; }
  }
  process.exit(1);
}

const porAgente = {};
for (const p of preparados) {
  const a = p.conteudo.match(/^agente: (.+)$/m)[1];
  porAgente[a] = (porAgente[a] ?? 0) + 1;
}
console.log("\nentradas por agente:");
for (const [a, n] of Object.entries(porAgente).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(3)}  ${a}`);
}

if (!EXECUTAR) {
  console.log("\n(ensaio. Nada foi escrito. Use --executar.)");
  process.exit(0);
}

if (existsSync(DESTINO)) rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });
for (const p of preparados) writeFileSync(join(DESTINO, p.nome), p.conteudo, { flag: "wx" });
writeFileSync(join(DESTINO, "PREFACIO-ORIGINAL.txt"), prefacio, { flag: "wx" });
console.log(`\nescritos ${preparados.length} arquivos em ${DESTINO}/`);
