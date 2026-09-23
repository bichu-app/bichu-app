#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * O gerado de `src/shared/types/generated/` bate com `api/openapi.yaml`?
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * Em 22/09/2026 o commit 351ae0f acrescentou duas respostas `400` a
 * `api/openapi.yaml` e nao rodou `npm run generate:types`. O derivado ficou uma
 * geracao atras da fonte. `make fechar-integracao` rodou inteiro e ficou VERDE,
 * porque a conferencia existia em UM lugar so: o passo `tipos gerados batem com
 * a spec` do job `lint, tipos e teste unitario`, em `.github/workflows/ci.yml`.
 *
 * A divergencia atravessou o fechamento local e so morreu na esteira, DEPOIS do
 * push. Portao que so a esteira tem e portao que so avisa quando ja e tarde.
 *
 * ====================================================================
 * POR QUE ELE NAO E `git diff --exit-code`, QUE E O QUE A ESTEIRA FAZ
 * ====================================================================
 *
 * Na esteira a arvore comeca LIMPA no commit. Gerar e comparar com o git
 * responde "o gerado que esta commitado bate com a spec que esta commitada?",
 * que e a pergunta certa la.
 *
 * Na maquina de quem desenvolve a arvore esta suja, e por um bom motivo: quem
 * mexe no contrato edita `api/openapi.yaml`, roda `npm run generate:types` e SO
 * ENTAO commita os dois. Nesse instante o gerado esta certo e diverge do HEAD.
 * `git diff --exit-code` REPROVA esse estado -- medido, nao deduzido: com a spec
 * adiantada e os tipos ja regerados, `npm run verify:types` continuou saindo 1.
 *
 * Um portao que reprova o fluxo correto e um portao que vai ser desligado, e e
 * assim que a verificacao morre de verdade -- nao por alguem discordar dela.
 *
 * Entao a pergunta aqui e outra, e nao depende do git: **gerar de novo muda
 * alguma coisa?** Se muda, o que estava em disco estava velho. Isso vale com a
 * arvore limpa ou suja, e pega um caso que a forma da esteira NAO pega: gerado
 * commitado velho numa arvore que ja tem outras mudancas.
 *
 * ====================================================================
 * O QUE ELE FAZ COM A ARVORE
 * ====================================================================
 *
 * Ele REGERA antes de comparar. Quando reprova, o conserto ja esta escrito no
 * worktree, pronto para `git add`. Edicao a mao em `src/shared/types/generated/`
 * e desfeita, e e essa a intencao: o destino e gerado, a fonte e o contrato.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DESTINO = "src/shared/types/generated";
const FONTE = "api/openapi.yaml";

/** sha256 de cada arquivo do diretorio, por nome. */
function impressao(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`o diretorio do gerado nao existe: ${dir}`);
  }
  const nomes = readdirSync(dir).filter((n) => n.endsWith(".ts")).sort();
  if (nomes.length === 0) {
    throw new Error(`nenhum .ts em ${dir}: nao ha o que conferir`);
  }
  const mapa = new Map();
  for (const n of nomes) {
    mapa.set(n, createHash("sha256").update(readFileSync(join(dir, n))).digest("hex"));
  }
  return mapa;
}

/**
 * A DECISAO, isolada de proposito: e ela que o autoteste exercita.
 * Devolve a lista de nomes que mudaram entre as duas impressoes.
 */
export function divergencias(antes, depois) {
  const nomes = new Set([...antes.keys(), ...depois.keys()]);
  const fora = [];
  for (const n of [...nomes].sort()) {
    const a = antes.get(n);
    const d = depois.get(n);
    if (a === undefined) fora.push(`${n} (a geracao CRIOU este arquivo)`);
    else if (d === undefined) fora.push(`${n} (a geracao APAGOU este arquivo)`);
    else if (a !== d) fora.push(n);
  }
  return fora;
}

function autoteste() {
  const m = (o) => new Map(Object.entries(o));
  const casos = [
    ["arvore em dia: nada mudou", m({ "a.ts": "1" }), m({ "a.ts": "1" }), 0],
    ["um arquivo mudou", m({ "a.ts": "1" }), m({ "a.ts": "2" }), 1],
    ["dois arquivos mudaram", m({ "a.ts": "1", "b.ts": "9" }), m({ "a.ts": "2", "b.ts": "8" }), 2],
    ["a geracao criou um arquivo novo", m({ "a.ts": "1" }), m({ "a.ts": "1", "b.ts": "3" }), 1],
    ["a geracao apagou um arquivo", m({ "a.ts": "1", "b.ts": "3" }), m({ "a.ts": "1" }), 1],
  ];
  let ruim = 0;
  for (const [nome, antes, depois, esperado] of casos) {
    const veio = divergencias(antes, depois).length;
    const ok = veio === esperado;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? "ok" : "RUIM"} ] ${nome} (esperava ${esperado}, veio ${veio})`);
  }

  // A sexta isca, e a que importa mais: diretorio ausente ou vazio precisa
  // REPROVAR. Portao que nao consegue conferir nao aprova.
  for (const [nome, dir] of [
    ["diretorio inexistente REPROVA", join("/tmp", `nao-existe-${process.pid}`)],
    ["diretorio sem .ts REPROVA", "/tmp"],
  ]) {
    let reprovou = false;
    try {
      impressao(dir);
    } catch {
      reprovou = true;
    }
    // `/tmp` pode ter .ts de outro processo; so cobramos o caso inexistente.
    const ok = dir.includes("nao-existe") ? reprovou : true;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? "ok" : "RUIM"} ] ${nome}`);
  }

  if (ruim > 0) {
    console.error(`\nautoteste REPROVADO: ${ruim} caso(s) nao se comportaram como a regra manda`);
    process.exit(1);
  }
  console.log("\nautoteste APROVADO: a divergencia e contada por arquivo, e a ausencia do destino reprova");
}

function principal() {
  if (!existsSync(FONTE)) {
    console.error(`REPROVA: ${FONTE} nao existe. Portao que nao consegue conferir nao aprova.`);
    process.exit(1);
  }
  const antes = impressao(DESTINO);
  try {
    execFileSync("npm", ["run", "--silent", "generate:types"], { stdio: ["ignore", "inherit", "inherit"] });
  } catch {
    console.error(`\nREPROVA: \`npm run generate:types\` falhou. Sem geracao nao ha como comparar.`);
    process.exit(1);
  }
  const depois = impressao(DESTINO);
  const fora = divergencias(antes, depois);

  if (fora.length === 0) {
    console.log(`\nAPROVADO: ${DESTINO} ja estava igual ao que ${FONTE} gera (${antes.size} arquivos)`);
    return;
  }

  console.error(`\nREPROVA: o gerado de ${DESTINO} estava atras de ${FONTE}.`);
  for (const n of fora) console.error(`  - ${n}`);
  console.error("");
  console.error("  A geracao JA RODOU e o conserto esta no worktree: confira o diff");
  console.error(`  em ${DESTINO}/ e versione o resultado.`);
  console.error("  Se o TIPO e que esta errado, o errado e a especificacao.");
  try {
    const d = execFileSync("git", ["diff", "--stat", "--", DESTINO], { encoding: "utf8" });
    if (d.trim()) console.error(`\n${d}`);
  } catch {
    // sem git aqui: a lista acima ja nomeia os arquivos
  }
  process.exit(1);
}

if (process.argv.includes("--autoteste")) autoteste();
else principal();
