#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * Dois arquivos de `adr/` carregam o mesmo numero?
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * Em 23/09/2026 duas ADRs nasceram com o numero 0024 em branches diferentes:
 * `ADR-0024-identidade-interna-separada-da-publica.md`, sobre a Loja, e uma
 * outra `ADR-0024-...` sobre privacidade da Rede. Nenhum dos dois autores sabia
 * do outro.
 *
 * O git NAO acusa isso. Nomes de arquivo diferentes nao conflitam, entao o
 * merge junta os dois em silencio e a arvore fica com duas decisoes carregando
 * o mesmo numero. So apareceu porque alguem foi olhar; o conserto custou cerca
 * de 55 referencias trocadas linha a linha.
 *
 * O desfecho ruim nao e o trabalho de renumerar. E o codigo citar "ADR-0024" com
 * duas decisoes possiveis atras do mesmo rotulo, uma contradizendo a outra, e
 * ninguem saber de qual o comentario falava. Com quatorze papeis escrevendo em
 * paralelo e mais de cem worktrees, a proxima colisao e questao de tempo, e na
 * proxima pode nao ter ninguem olhando.
 *
 * ====================================================================
 * POR QUE ELE NAO PERGUNTA NADA AO GIT
 * ====================================================================
 *
 * A pergunta e sobre o CONTEUDO do diretorio, nao sobre o estado do git: duas
 * ADRs com o mesmo numero sao um defeito com a arvore limpa e com a arvore
 * suja, commitadas ou nao. Um portao que so olhasse `git diff` aprovaria o
 * arquivo recem-criado e ainda nao rastreado, que e exatamente o instante em
 * que a colisao nasce e o unico instante em que consertar e barato.
 *
 * O portao dos tipos gerados custou uma iteracao para aprender isso pelo outro
 * lado: a primeira versao dele terminava em `git diff --exit-code` e reprovava
 * quem tinha feito tudo certo e ainda nao commitado. Portao que reprova o fluxo
 * certo e portao que alguem desliga.
 *
 * ====================================================================
 * O QUE ELE CONSIDERA MESMO NUMERO
 * ====================================================================
 *
 * O numero e comparado pelo VALOR, nao pelo texto: `ADR-24-x.md` e
 * `ADR-0024-y.md` sao o mesmo numero, e colidem. O reconhecimento de que um
 * arquivo esta tentando ser uma ADR e tolerante de proposito (aceita minuscula,
 * separador ausente, digitos a menos) justamente para que errar o nome nao seja
 * uma porta de saida do portao. Quem erra o nome reprova pelas DUAS coisas: a
 * colisao, se houver, e a forma.
 *
 * Emenda nao e caso de borda aqui. Conferido nas quatro que existem (ADR-0002,
 * ADR-0004, ADR-0011, ADR-0016 e ADR-0017): emenda e SECAO dentro do proprio
 * arquivo da ADR, nunca um arquivo novo. Entao um numero continua valendo um
 * arquivo, e um segundo arquivo com o mesmo numero e sempre colisao.
 *
 * Buraco na numeracao NAO reprova. O portao pergunta por colisao, e continuidade
 * e outra pergunta: numero reservado numa branch que ainda nao mesclou deixa
 * buraco legitimo em toda branch vizinha, e reprovar nisso seria reprovar o
 * fluxo normal do repositorio. Os buracos sao impressos como nota, nunca como
 * falha.
 */
import { existsSync, readdirSync, statSync } from "node:fs";

const DIRETORIO = "adr";

/** A forma que a casa usa: `ADR-0024-slug-em-minuscula.md`. */
const FORMA_CANONICA = /^ADR-(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * O reconhecimento TOLERANTE. Ele existe para que um nome errado nao escape da
 * conferencia de numero: casa minuscula, separador ausente e qualquer
 * quantidade de digitos.
 */
const TENTATIVA_DE_ADR = /^adr[-_. ]?(\d+)/i;

/** Os nomes de `dir` que valem para esta conferencia. Recusa o que nao da para conferir. */
export function lerNomes(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`o diretorio das ADRs nao existe: ${dir}`);
  }
  const nomes = readdirSync(dir)
    // Arquivo oculto nao e documento, e nao esta no git (`.DS_Store` e ignorado).
    .filter((n) => !n.startsWith("."))
    .filter((n) => statSync(`${dir}/${n}`).isFile())
    .sort();
  if (nomes.length === 0) {
    throw new Error(`nenhum arquivo em ${dir}: nao ha o que conferir`);
  }
  return nomes;
}

/**
 * A DECISAO, isolada de proposito: e ela que o autoteste exercita.
 *
 * Devolve `{ colisoes, foraDaForma, buracos }`. `colisoes` e `foraDaForma`
 * reprovam; `buracos` e nota.
 */
export function analisar(nomes) {
  const porNumero = new Map();
  const foraDaForma = [];

  for (const nome of nomes) {
    const canonico = FORMA_CANONICA.exec(nome);
    const tolerante = TENTATIVA_DE_ADR.exec(nome);

    if (!canonico) {
      foraDaForma.push({
        arquivo: nome,
        motivo: tolerante
          ? `numero ${Number(tolerante[1])} reconhecido, mas a forma nao e ADR-NNNN-slug-em-minuscula.md`
          : "nao tem forma de ADR: o portao nao consegue extrair numero deste nome",
      });
    }

    const digitos = canonico ? canonico[1] : tolerante?.[1];
    if (digitos === undefined) continue;

    // Pelo VALOR: `ADR-24` e `ADR-0024` sao o mesmo numero.
    const numero = Number(digitos);
    if (!porNumero.has(numero)) porNumero.set(numero, []);
    porNumero.get(numero).push(nome);
  }

  const colisoes = [...porNumero.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([numero, arquivos]) => ({ numero, arquivos: [...arquivos].sort() }))
    .sort((a, b) => a.numero - b.numero);

  const numeros = [...porNumero.keys()].sort((a, b) => a - b);
  const buracos = [];
  if (numeros.length > 0) {
    for (let n = numeros[0]; n < numeros[numeros.length - 1]; n++) {
      if (!porNumero.has(n)) buracos.push(n);
    }
  }

  return { colisoes, foraDaForma, buracos };
}

/** `0024`, que e como o numero aparece no nome do arquivo e nas referencias. */
function comQuatroDigitos(numero) {
  return String(numero).padStart(4, "0");
}

function autoteste() {
  /** A assinatura de uma colisao, para o caso cobrar QUAIS arquivos colidem. */
  const assinatura = ({ colisoes }) =>
    colisoes.map((c) => `${comQuatroDigitos(c.numero)}:${c.arquivos.join("+")}`).join(" | ");

  const reais = [
    "ADR-0023-fronteira-com-o-backoffice-do-diretorio.md",
    "ADR-0024-identidade-interna-separada-da-publica.md",
  ];

  const casos = [
    [
      "numeros distintos: nada colide",
      reais,
      "",
    ],
    [
      "A COLISAO DE 23/09: dois arquivos no 0024, e a mensagem nomeia os DOIS",
      [...reais, "ADR-0024-privacidade-da-rede.md"],
      "0024:ADR-0024-identidade-interna-separada-da-publica.md+ADR-0024-privacidade-da-rede.md",
    ],
    [
      "tres arquivos no mesmo numero: nomeia os tres",
      ["ADR-0007-a.md", "ADR-0007-b.md", "ADR-0007-c.md"],
      "0007:ADR-0007-a.md+ADR-0007-b.md+ADR-0007-c.md",
    ],
    [
      "zeros a esquerda: ADR-24 e ADR-0024 sao o MESMO numero",
      ["ADR-0024-identidade-interna-separada-da-publica.md", "ADR-24-privacidade-da-rede.md"],
      "0024:ADR-0024-identidade-interna-separada-da-publica.md+ADR-24-privacidade-da-rede.md",
    ],
    [
      "caixa: adr-0024 minusculo colide com ADR-0024",
      ["ADR-0024-identidade-interna-separada-da-publica.md", "adr-0024-privacidade-da-rede.md"],
      "0024:ADR-0024-identidade-interna-separada-da-publica.md+adr-0024-privacidade-da-rede.md",
    ],
    [
      "buraco na numeracao NAO e colisao",
      ["ADR-0001-um.md", "ADR-0009-nove.md"],
      "",
    ],
    [
      "emenda mora DENTRO do arquivo: a ADR-0004 continua sendo um arquivo so",
      ["ADR-0004-codigo-da-tag-qr-e-ciclo-de-vida.md", "ADR-0011-perfil-de-profissional-criado-pela-comunidade.md"],
      "",
    ],
  ];

  let ruim = 0;
  for (const [nome, nomes, esperado] of casos) {
    const veio = assinatura(analisar(nomes));
    const ok = veio === esperado;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? "ok" : "RUIM"} ] ${nome}`);
    if (!ok) console.log(`           esperava "${esperado}"\n           veio     "${veio}"`);
  }

  // Forma: quem erra o nome NAO escapa em silencio.
  const casosDeForma = [
    ["nome canonico nao acusa forma", "ADR-0024-identidade-interna-separada-da-publica.md", 0],
    ["ADR-24 com tres digitos a menos acusa forma", "ADR-24-privacidade-da-rede.md", 1],
    ["minuscula no prefixo acusa forma", "adr-0024-privacidade-da-rede.md", 1],
    ["slug com maiuscula acusa forma", "ADR-0024-Privacidade.md", 1],
    ["sem numero nenhum acusa forma", "README.md", 1],
    ["extensao errada acusa forma", "ADR-0024-privacidade-da-rede.txt", 1],
  ];
  for (const [nome, arquivo, esperado] of casosDeForma) {
    const veio = analisar([arquivo]).foraDaForma.length;
    const ok = veio === esperado;
    if (!ok) ruim++;
    console.log(`  [ ${ok ? "ok" : "RUIM"} ] ${nome} (esperava ${esperado}, veio ${veio})`);
  }

  // Buraco e NOTA, nao falha: o portao precisa enxerga-lo sem reprovar por ele.
  const comBuraco = analisar(["ADR-0001-um.md", "ADR-0004-quatro.md"]);
  const buracoOk = comBuraco.buracos.join(",") === "2,3" && comBuraco.colisoes.length === 0;
  if (!buracoOk) ruim++;
  console.log(`  [ ${buracoOk ? "ok" : "RUIM"} ] buraco e enxergado como nota (2 e 3), sem virar colisao`);

  // As duas iscas que importam mais: portao que nao consegue conferir precisa
  // REPROVAR. Diretorio ausente e diretorio vazio nao sao "nada errado".
  for (const [nome, dir] of [
    ["diretorio de ADR inexistente REPROVA", `/tmp/nao-existe-adr-${process.pid}`],
    ["arquivo em vez de diretorio REPROVA", "package.json"],
  ]) {
    let reprovou = false;
    try {
      lerNomes(dir);
    } catch {
      reprovou = true;
    }
    if (!reprovou) ruim++;
    console.log(`  [ ${reprovou ? "ok" : "RUIM"} ] ${nome}`);
  }

  if (ruim > 0) {
    console.error(`\nautoteste REPROVADO: ${ruim} caso(s) nao se comportaram como a regra manda`);
    process.exit(1);
  }
  console.log(
    "\nautoteste APROVADO: colisao e por valor do numero, nome errado nao escapa, buraco nao reprova e diretorio que nao da para conferir reprova",
  );
}

function principal() {
  let nomes;
  try {
    nomes = lerNomes(DIRETORIO);
  } catch (erro) {
    console.error(`REPROVA: ${erro.message}.`);
    console.error("  Portao que nao consegue conferir nao aprova: aprovar por ausencia e");
    console.error("  como 1037 casos ficaram verdes sem rodar nenhum.");
    process.exit(1);
  }

  const { colisoes, foraDaForma, buracos } = analisar(nomes);

  if (colisoes.length === 0 && foraDaForma.length === 0) {
    console.log(`APROVADO: os ${nomes.length} arquivos de ${DIRETORIO}/ tem numeros distintos.`);
    if (buracos.length > 0) {
      console.log(`  nota, sem reprovar: numero sem arquivo aqui -- ${buracos.map(comQuatroDigitos).join(", ")}.`);
      console.log("  Buraco e esperado quando um numero foi reservado numa branch que ainda nao mesclou.");
    }
    return;
  }

  if (colisoes.length > 0) {
    console.error(`REPROVA: ${colisoes.length} numero(s) de ADR com mais de um arquivo em ${DIRETORIO}/.`);
    for (const { numero, arquivos } of colisoes) {
      console.error(`\n  ADR-${comQuatroDigitos(numero)} esta em ${arquivos.length} arquivos:`);
      for (const a of arquivos) console.error(`    - ${DIRETORIO}/${a}`);
    }
    console.error("");
    console.error("  O git nao acusa isto: nomes diferentes nao conflitam, e o merge junta os");
    console.error("  dois em silencio. Depois o codigo cita o numero e ninguem sabe qual decisao.");
    console.error("");
    console.error("  Saida: quem chegou DEPOIS renumera para o proximo numero livre e troca as");
    console.error("  referencias por contexto, uma a uma. Nao mexa na que ja foi citada por outros.");
  }

  if (foraDaForma.length > 0) {
    console.error(`\nREPROVA: ${foraDaForma.length} arquivo(s) de ${DIRETORIO}/ fora da forma ADR-NNNN-slug-em-minuscula.md:`);
    for (const { arquivo, motivo } of foraDaForma) {
      console.error(`  - ${DIRETORIO}/${arquivo}`);
      console.error(`      ${motivo}`);
    }
    console.error("");
    console.error("  Ignorar em silencio o nome fora do padrao daria a quem erra o nome uma");
    console.error("  saida do portao inteiro, que e o oposto do que ele existe para fazer.");
  }

  process.exit(1);
}

if (process.argv.includes("--autoteste")) autoteste();
else principal();
