#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * Dois arquivos de `migrations/` carregam o mesmo carimbo?
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * Em 23/09/2026, CINCO migracoes nasceram com o carimbo `20260923000001` em
 * cinco branches diferentes, de tres sessoes que nao se enxergam. E nao foi a
 * primeira vez: quando este portao foi escrito, a `development` JA CARREGAVA
 * onze migracoes em quatro carimbos repetidos --
 *
 *     20260922000003  quatro arquivos
 *     20260922000005  tres arquivos
 *     20260922000004  dois arquivos
 *     20260922000008  dois arquivos
 *
 * O git nao acusa nada disso: os nomes completos diferem, entao nao ha conflito
 * e o merge junta todas em silencio.
 *
 * ====================================================================
 * POR QUE MIGRACAO E PIOR QUE ADR, MEDIDO E NAO SUPOSTO
 * ====================================================================
 *
 * Duas ADRs com o mesmo numero confundem quem le. Duas migracoes com o mesmo
 * carimbo QUEBRAM O `migrate up`, com saida 1 e nada aplicado. Isto foi
 * reproduzido contra um Postgres 16 de verdade, com o node-pg-migrate 9.0.0
 * que o `package.json` pina:
 *
 *   1. um banco aplica `20260102000001_zeta-chegou-primeiro`;
 *   2. a irma `20260102000001_alfa-mesclou-depois` mescla depois;
 *   3. `migrate up` naquele banco morre com
 *
 *        Error: Not run migration 20260102000001_alfa-mesclou-depois is
 *        preceding already run migration 20260102000001_zeta-chegou-primeiro
 *
 *      lancado por `checkOrder`, em `runner.js`. Saida 1, `alfa` NAO criada,
 *      `pgmigrations` intacta. O banco fica travado: nenhuma migracao futura
 *      entra enquanto as duas irmas existirem com o mesmo carimbo.
 *
 * `checkOrder` e LIGADO POR PADRAO (`if (options.checkOrder !== false)`), e o
 * `compose.yaml` chama `migracao up` sem desliga-lo.
 *
 * ====================================================================
 * COMO O node-pg-migrate DE FATO ORDENA -- LIDO DO CODIGO
 * ====================================================================
 *
 * `dist/legacy/utils/comparators.js`:
 *
 *     compareMigrationFileNames(a, b) =
 *       compareFileNamesByTimestamp(a, b) || localeCompareStringsNumerically(a, b)
 *
 * A chave PRIMARIA e o prefixo numerico. O desempate e
 * `localeCompare(b, undefined, { numeric: true, sensitivity: 'variant',
 * ignorePunctuation: true })` sobre o nome INTEIRO -- ou seja, quando o carimbo
 * repete, quem decide a ordem de aplicacao e o SLUG, que ninguem escolheu para
 * essa funcao. `ignorePunctuation: true` ainda descarta o `_` e os hifens, e o
 * locale vem do ambiente: a mesma dupla de arquivos pode ordenar diferente em
 * maquinas com ICU ou `LANG` diferentes.
 *
 * `dist/legacy/utils/fileNameUtils.js` (`getNumericPrefix`): o prefixo e
 * `/^(\d+)/`, e SO um prefixo de 17 digitos e lido como data UTC. Os 14 digitos
 * que esta casa usa viram o inteiro `20260923000001`, que ordena bem -- mas um
 * arquivo com 17 digitos entraria como milissegundos de epoca e cairia em outro
 * universo de ordenacao. Por isso a forma canonica aqui exige 14.
 *
 * E o REGISTRO e por NOME: `migration.js` grava
 * `INSERT INTO pgmigrations (name, run_on) VALUES ('<basename sem extensao>', NOW())`.
 * Nao ha hash, nao ha carimbo guardado. Logo:
 *   - cinco arquivos com o mesmo carimbo sao cinco linhas distintas, aplicadas
 *     numa ordem que o slug decidiu;
 *   - e renumerar um arquivo JA APLICADO em algum banco faz o `migrate up`
 *     daquele banco achar que e uma migracao nova e roda-la de novo.
 *
 * ====================================================================
 * AS QUATRO PERGUNTAS, E POR QUE DUAS REPROVAM E DUAS NAO
 * ====================================================================
 *
 * 1. CARIMBO REPETIDO -- REPROVA. E o caso central, provado acima.
 *
 * 2. CARIMBO FORA DE ORDEM -- REPROVA, e e um defeito DIFERENTE. Uma migracao
 *    nova com carimbo anterior ao maior carimbo que a linha de base ja carrega
 *    produz exatamente a mesma excecao de `checkOrder`, pelo mesmo caminho, em
 *    todo banco que seguiu a linha de base. Nao e o mesmo defeito que a
 *    colisao, e nao seria pego pela conferencia de colisao.
 *
 * 3. BURACO NA SEQUENCIA -- NAO REPROVA, vira nota. Carimbo reservado numa
 *    branch que ainda nao mesclou deixa buraco legitimo em toda branch vizinha,
 *    e o `getMigrationsToRun` nao se importa com buraco nenhum: ele filtra por
 *    nome ja registrado, nao por continuidade.
 *
 * 4. NOME FORA DO PADRAO -- REPROVA. Ignorar em silencio daria a quem erra o
 *    nome uma saida do portao inteiro, que e o oposto do que ele existe para
 *    fazer. O reconhecimento do carimbo e TOLERANTE de proposito (aceita
 *    qualquer quantidade de digitos) justamente para que errar o nome nao
 *    esconda a colisao: quem erra reprova pelas DUAS coisas.
 *
 * ====================================================================
 * POR QUE A COLISAO NAO PERGUNTA NADA AO GIT
 * ====================================================================
 *
 * Pela mesma razao do portao de numero de ADR: a pergunta e sobre o CONTEUDO de
 * `migrations/`, e duas migracoes com o mesmo carimbo sao um defeito com a
 * arvore limpa e com a arvore suja. Um portao que so olhasse `git diff`
 * aprovaria o arquivo recem-criado e ainda nao rastreado, que e exatamente o
 * instante em que a colisao nasce e o unico instante em que renumerar e barato.
 *
 * A conferencia de ORDEM e a unica que precisa do git, e nao tem como nao
 * precisar: "anterior ao que ja existe" so tem sentido contra alguma coisa que
 * ja existe. Ela usa a PONTA da linha de base, nao o `merge-base`, e a escolha
 * importa: o que trava um banco e o que a linha de base ja carrega, nao o ponto
 * em que a branch saiu dela.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { compareMigrationFileNames } from "node-pg-migrate/utils/comparators";
import { getNumericPrefix } from "node-pg-migrate/utils/fileNameUtils";

const DIRETORIO = "migrations";

/** A forma que a casa usa: `20260923000001_slug-em-minuscula.sql`, 14 digitos. */
const FORMA_CANONICA = /^(\d{14})_[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

/**
 * O reconhecimento TOLERANTE do carimbo. Ele existe para que um nome errado nao
 * escape da conferencia de colisao: qualquer quantidade de digitos no inicio.
 */
const TENTATIVA_DE_CARIMBO = /^(\d+)/;

/** As linhas de base tentadas, em ordem. A primeira que o git resolver vence. */
const LINHAS_DE_BASE = ["origin/development", "development"];

/** Os nomes de `dir` que valem para esta conferencia. Recusa o que nao da para conferir. */
export function lerNomes(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`o diretorio das migracoes nao existe: ${dir}`);
  }
  const nomes = readdirSync(dir)
    // Arquivo oculto nao e migracao, e nao esta no git (`.DS_Store` e ignorado).
    .filter((n) => !n.startsWith("."))
    .filter((n) => statSync(`${dir}/${n}`).isFile())
    .sort();
  if (nomes.length === 0) {
    throw new Error(`nenhum arquivo em ${dir}: nao ha o que conferir`);
  }
  return nomes;
}

/**
 * A ordem em que o node-pg-migrate DE FATO aplicaria estes nomes, pelo
 * comparador do proprio pacote. O que se imprime e o resultado da ferramenta,
 * nao um palpite sobre ela: se o node-pg-migrate mudar de regra, isto muda
 * junto, sozinho.
 */
export function ordemDeAplicacao(nomes) {
  return [...nomes].toSorted((a, b) => compareMigrationFileNames(a, b, console));
}

/**
 * A DECISAO da colisao e da forma, isolada de proposito: e ela que o autoteste
 * exercita, sem tocar em `migrations/` e sem tocar no git.
 *
 * Devolve `{ colisoes, foraDaForma, buracos, maiorCarimbo }`. `colisoes` e
 * `foraDaForma` reprovam; `buracos` e nota.
 */
export function analisar(nomes) {
  const porCarimbo = new Map();
  const foraDaForma = [];

  for (const nome of nomes) {
    const canonico = FORMA_CANONICA.exec(nome);
    const tolerante = TENTATIVA_DE_CARIMBO.exec(nome);

    if (!canonico) {
      let motivo;
      if (!tolerante) {
        motivo = "nao tem forma de migracao: o portao nao consegue extrair carimbo deste nome";
      } else if (tolerante[1].length === 17) {
        motivo =
          `carimbo de 17 digitos: o node-pg-migrate le 17 digitos como DATA UTC e ordena ` +
          `por milissegundos de epoca, num universo separado dos 14 digitos desta casa`;
      } else if (tolerante[1].length !== 14) {
        motivo = `carimbo com ${tolerante[1].length} digitos, e a forma da casa tem 14`;
      } else {
        motivo = "carimbo de 14 digitos reconhecido, mas a forma nao e NNNNNNNNNNNNNN_slug-em-minuscula.sql";
      }
      foraDaForma.push({ arquivo: nome, motivo });
    }

    const digitos = canonico ? canonico[1] : tolerante?.[1];
    if (digitos === undefined) continue;

    // A CHAVE DA COLISAO SAI DO PROPRIO node-pg-migrate, e nao de `Number` aqui.
    // Dois arquivos colidem quando o `getNumericPrefix` DELE devolve o mesmo
    // valor, e ele nao e um `Number` ingenuo: prefixo de 17 digitos vira
    // milissegundos de epoca. Usar a funcao dele faz este portao concordar com a
    // ferramenta por construcao, inclusive no dia em que a regra mudar.
    // `getNumericPrefix` grita no logger quando nao consegue; aqui o nome ja foi
    // reconhecido pela tolerante, entao o `catch` e so cinto de seguranca.
    let carimbo;
    try {
      carimbo = getNumericPrefix(nome, { error: () => {} });
    } catch {
      carimbo = Number(digitos);
    }
    if (!porCarimbo.has(carimbo)) porCarimbo.set(carimbo, []);
    porCarimbo.get(carimbo).push(nome);
  }

  const colisoes = [...porCarimbo.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([carimbo, arquivos]) => ({ carimbo, arquivos: ordemDeAplicacao(arquivos) }))
    .sort((a, b) => a.carimbo - b.carimbo);

  const carimbos = [...porCarimbo.keys()].sort((a, b) => a - b);

  // Buraco aqui e "dia com carimbo e nenhum arquivo no sequencial seguinte"? Nao:
  // o carimbo desta casa e `AAAAMMDD` + seis digitos de sequencia POR DIA, entao
  // continuidade so faz sentido dentro do mesmo dia. Buraco entre dias nao e
  // buraco: e um dia sem migracao.
  const porDia = new Map();
  for (const c of carimbos) {
    const texto = String(c).padStart(14, "0");
    const dia = texto.slice(0, 8);
    const sequencia = Number(texto.slice(8));
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(sequencia);
  }
  const buracos = [];
  for (const [dia, sequencias] of [...porDia.entries()].sort()) {
    const vistas = new Set(sequencias);
    for (let s = Math.min(...sequencias); s < Math.max(...sequencias); s++) {
      if (!vistas.has(s)) buracos.push(`${dia}${String(s).padStart(6, "0")}`);
    }
  }

  return {
    colisoes,
    foraDaForma,
    buracos,
    maiorCarimbo: carimbos.length > 0 ? carimbos[carimbos.length - 1] : undefined,
  };
}

/**
 * A DECISAO da ordem, tambem isolada do git: recebe os nomes de agora e os
 * nomes da linha de base, e devolve os arquivos NOVOS cujo carimbo e anterior
 * ou igual ao maior carimbo que a linha de base ja carrega.
 *
 * Anterior OU IGUAL: igual e a colisao, que ja reprova pela outra conferencia,
 * e repetir a acusacao aqui so faria barulho. Entao esta devolve estritamente
 * ANTERIOR, e a colisao fica com a outra.
 */
export function analisarOrdem(nomesDeAgora, nomesDaBase) {
  const carimboDe = (nome) => {
    const m = TENTATIVA_DE_CARIMBO.exec(nome);
    return m ? Number(m[1]) : undefined;
  };
  const daBase = new Set(nomesDaBase);
  const carimbosDaBase = nomesDaBase.map(carimboDe).filter((c) => c !== undefined);
  if (carimbosDaBase.length === 0) return { foraDeOrdem: [], tetoDaBase: undefined };
  const teto = Math.max(...carimbosDaBase);

  const foraDeOrdem = nomesDeAgora
    .filter((n) => !daBase.has(n))
    .map((n) => ({ arquivo: n, carimbo: carimboDe(n) }))
    .filter(({ carimbo }) => carimbo !== undefined && carimbo < teto)
    .sort((a, b) => a.carimbo - b.carimbo);

  return { foraDeOrdem, tetoDaBase: teto };
}

/** `20260923000001`, que e como o carimbo aparece no nome do arquivo. */
function comQuatorzeDigitos(carimbo) {
  return String(carimbo).padStart(14, "0");
}

/**
 * Os nomes de `migrations/` na PONTA da linha de base, pelo git.
 *
 * Devolve `{ ref, nomes }`, ou lanca. Nao ha caminho de "nao consegui, entao
 * passa": portao que nao consegue conferir reprova.
 */
function nomesDaLinhaDeBase(dir) {
  const erros = [];
  for (const ref of LINHAS_DE_BASE) {
    try {
      const saida = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", `${dir}/`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const nomes = saida
        .split("\n")
        .filter(Boolean)
        .map((caminho) => caminho.slice(caminho.lastIndexOf("/") + 1));
      if (nomes.length === 0) {
        erros.push(`${ref}: resolve, mas nao tem nenhum arquivo em ${dir}/`);
        continue;
      }
      return { ref, nomes };
    } catch (erro) {
      erros.push(`${ref}: ${String(erro.message).split("\n")[0]}`);
    }
  }
  throw new Error(
    `nenhuma linha de base resolveu (${LINHAS_DE_BASE.join(", ")}):\n    ${erros.join("\n    ")}`,
  );
}

function autoteste() {
  /** A assinatura de uma colisao, para o caso cobrar QUAIS arquivos colidem e EM QUE ORDEM. */
  const assinatura = ({ colisoes }) =>
    colisoes.map((c) => `${comQuatorzeDigitos(c.carimbo)}:${c.arquivos.join("+")}`).join(" | ");

  const casos = [
    [
      "carimbos distintos: nada colide",
      ["20260917000001_identidade-e-sessao.sql", "20260917000002_idempotencia-e-limites.sql"],
      "",
    ],
    [
      "A COLISAO DE 23/09: os CINCO arquivos no 20260923000001, na ordem que o node-pg-migrate aplicaria",
      [
        "20260923000001_unaccent-para-a-busca-publica.sql",
        "20260923000001_achador-sem-conta-foto-e-denuncia.sql",
        "20260923000001_secao-rede-eventos-e-presenca.sql",
        "20260923000001_aparelho-nao-sobrevive-a-exclusao-logica.sql",
        "20260923000001_localizacao-de-referencia-por-aparelho.sql",
      ],
      "20260923000001:20260923000001_achador-sem-conta-foto-e-denuncia.sql" +
        "+20260923000001_aparelho-nao-sobrevive-a-exclusao-logica.sql" +
        "+20260923000001_localizacao-de-referencia-por-aparelho.sql" +
        "+20260923000001_secao-rede-eventos-e-presenca.sql" +
        "+20260923000001_unaccent-para-a-busca-publica.sql",
    ],
    [
      "A COLISAO QUE JA ESTA MESCLADA: as quatro do 20260922000003 na development",
      [
        "20260922000003_conversa-mediada.sql",
        "20260922000003_achado-avulso-e-correspondencia.sql",
        "20260922000003_restricao-de-motivo-converge-em-banco-ja-migrado.sql",
        "20260922000003_aparelho-e-token-de-push.sql",
      ],
      "20260922000003:20260922000003_achado-avulso-e-correspondencia.sql" +
        "+20260922000003_aparelho-e-token-de-push.sql" +
        "+20260922000003_conversa-mediada.sql" +
        "+20260922000003_restricao-de-motivo-converge-em-banco-ja-migrado.sql",
    ],
    [
      "dois carimbos repetidos ao mesmo tempo: os dois aparecem",
      [
        "20260922000004_disparo-do-alerta.sql",
        "20260922000004_tag-apagada-nao-contradiz-o-achado.sql",
        "20260922000008_endereco-e-publicacao-do-diretorio.sql",
        "20260922000008_transferencia-nao-depende-de-ordem-de-gatilho.sql",
      ],
      "20260922000004:20260922000004_disparo-do-alerta.sql+20260922000004_tag-apagada-nao-contradiz-o-achado.sql" +
        " | 20260922000008:20260922000008_endereco-e-publicacao-do-diretorio.sql" +
        "+20260922000008_transferencia-nao-depende-de-ordem-de-gatilho.sql",
    ],
    [
      // A ordem esperada aqui foi MEDIDA, e a primeira versao deste caso errou:
      // eu escrevi `-ERRADO.SQL` primeiro, por ASCII, e o autoteste reprovou.
      // `ignorePunctuation: true` descarta o `_` e o `-`, e o que sobra compara
      // `certo` com `ERRADO` pelo locale, onde `c` vem antes de `e`. E por isto
      // que este portao IMPORTA o comparador do node-pg-migrate em vez de imitar
      // a regra: a regra nao e a que se supoe.
      "nome fora da forma NAO escapa da colisao: o carimbo continua sendo lido",
      ["20260923000001_certo.sql", "20260923000001-ERRADO.SQL"],
      "20260923000001:20260923000001_certo.sql+20260923000001-ERRADO.SQL",
    ],
    [
      "buraco na sequencia NAO e colisao",
      ["20260923000001_um.sql", "20260923000009_nove.sql"],
      "",
    ],
  ];

  let ruim = 0;
  const conferir = (nome, ok, detalhe) => {
    if (!ok) ruim++;
    console.log(`  [ ${ok ? "ok" : "RUIM"} ] ${nome}`);
    if (!ok && detalhe) console.log(detalhe);
  };

  for (const [nome, nomes, esperado] of casos) {
    const veio = assinatura(analisar(nomes));
    conferir(nome, veio === esperado, `           esperava "${esperado}"\n           veio     "${veio}"`);
  }

  // Forma: quem erra o nome NAO escapa em silencio.
  const casosDeForma = [
    ["nome canonico nao acusa forma", "20260923000001_unaccent-para-a-busca-publica.sql", 0],
    ["carimbo de 17 digitos acusa forma (o node-pg-migrate leria como DATA)", "20260923000001999_x.sql", 1],
    ["carimbo de 4 digitos acusa forma", "0001_identidade.sql", 1],
    ["slug com maiuscula acusa forma", "20260923000001_Unaccent.sql", 1],
    ["separador errado acusa forma", "20260923000001-unaccent.sql", 1],
    ["sem carimbo nenhum acusa forma", "README.md", 1],
    ["extensao errada acusa forma", "20260923000001_unaccent.txt", 1],
    ["`.up.sql` acusa forma: o carregador desta casa e o legado, de arquivo unico", "20260923000001_x.up.sql", 1],
  ];
  for (const [nome, arquivo, esperado] of casosDeForma) {
    const veio = analisar([arquivo]).foraDaForma.length;
    conferir(`${nome} (esperava ${esperado}, veio ${veio})`, veio === esperado);
  }

  // A ordem que este portao IMPRIME precisa ser a do node-pg-migrate, e nao a
  // alfabetica ingenua: `ignorePunctuation: true` descarta o `_` e os hifens.
  const ordemReal = ordemDeAplicacao(["20260101000001_ab-c.sql", "20260101000001_abc.sql", "20260101000001_a-bd.sql"]);
  conferir(
    "a ordem impressa e a do comparador do node-pg-migrate, nao a alfabetica",
    ordemReal[0] === "20260101000001_a-bd.sql" || ordemReal[0].startsWith("20260101000001_ab"),
    `           veio ${ordemReal.join(", ")}`,
  );

  // Buraco e NOTA, nao falha, e so conta DENTRO do mesmo dia.
  const comBuraco = analisar(["20260923000001_um.sql", "20260923000004_quatro.sql"]);
  conferir(
    "buraco e enxergado como nota (000002 e 000003), sem virar colisao",
    comBuraco.buracos.join(",") === "20260923000002,20260923000003" && comBuraco.colisoes.length === 0,
    `           veio ${comBuraco.buracos.join(",")}`,
  );
  const diasDiferentes = analisar(["20260917000008_oito.sql", "20260918000001_um.sql"]);
  conferir(
    "dia sem migracao NAO e buraco: a sequencia e por dia",
    diasDiferentes.buracos.length === 0,
    `           veio ${diasDiferentes.buracos.join(",")}`,
  );

  // A ORDEM, sem git: a decisao isolada.
  const base = ["20260922000009_vitrine-da-loja.sql", "20260923000005_ja-mesclada.sql"];
  const ordemOk = analisarOrdem([...base, "20260923000006_depois.sql"], base);
  conferir(
    "carimbo acima do teto da base nao acusa ordem",
    ordemOk.foraDeOrdem.length === 0,
    `           veio ${JSON.stringify(ordemOk.foraDeOrdem)}`,
  );
  const ordemRuim = analisarOrdem([...base, "20260923000002_antes.sql"], base);
  conferir(
    "carimbo ABAIXO do teto da base acusa ordem, nomeando o arquivo e o teto",
    ordemRuim.foraDeOrdem.length === 1 &&
      ordemRuim.foraDeOrdem[0].arquivo === "20260923000002_antes.sql" &&
      ordemRuim.tetoDaBase === 20260923000005,
    `           veio ${JSON.stringify(ordemRuim)}`,
  );
  const ordemIgual = analisarOrdem([...base, "20260923000005_irma.sql"], base);
  conferir(
    "carimbo IGUAL ao teto fica com a conferencia de colisao, e nao acusa ordem duas vezes",
    ordemIgual.foraDeOrdem.length === 0,
    `           veio ${JSON.stringify(ordemIgual.foraDeOrdem)}`,
  );
  const arquivoDaBase = analisarOrdem(base, base);
  conferir(
    "arquivo que JA esta na base nao e novo, e nao acusa ordem",
    arquivoDaBase.foraDeOrdem.length === 0,
    `           veio ${JSON.stringify(arquivoDaBase.foraDeOrdem)}`,
  );

  // As iscas que importam mais: portao que nao consegue conferir precisa
  // REPROVAR. Diretorio ausente e diretorio vazio nao sao "nada errado".
  for (const [nome, dir] of [
    ["diretorio de migracoes inexistente REPROVA", `/tmp/nao-existe-migrations-${process.pid}`],
    ["arquivo em vez de diretorio REPROVA", "package.json"],
  ]) {
    let reprovou = false;
    try {
      lerNomes(dir);
    } catch {
      reprovou = true;
    }
    conferir(nome, reprovou);
  }
  // Linha de base que nao resolve tambem REPROVA: "nao consegui comparar" nao e
  // "esta tudo certo".
  let baseReprovou = false;
  try {
    nomesDaLinhaDeBase(`nao-existe-${process.pid}`);
  } catch {
    baseReprovou = true;
  }
  conferir("linha de base sem migracao nenhuma REPROVA", baseReprovou);

  if (ruim > 0) {
    console.error(`\nautoteste REPROVADO: ${ruim} caso(s) nao se comportaram como a regra manda`);
    process.exit(1);
  }
  console.log(
    "\nautoteste APROVADO: carimbo repetido reprova nomeando os arquivos na ordem real do node-pg-migrate,\n" +
      "carimbo anterior ao teto da base reprova, nome errado nao escapa, buraco nao reprova\n" +
      "e o que nao da para conferir reprova.",
  );
}

function principal() {
  let nomes;
  try {
    nomes = lerNomes(DIRETORIO);
  } catch (erro) {
    console.error(`REPROVA: ${erro.message}.`);
    console.error("  Portao que nao consegue conferir nao aprova: aprovar por ausencia e");
    console.error("  confianca falsa, que e pior que nao ter portao.");
    process.exit(1);
  }

  const { colisoes, foraDaForma, buracos, maiorCarimbo } = analisar(nomes);

  let base;
  try {
    base = nomesDaLinhaDeBase(DIRETORIO);
  } catch (erro) {
    console.error(`REPROVA: ${erro.message}`);
    console.error("");
    console.error("  A conferencia de ORDEM precisa de alguma coisa com que comparar, e");
    console.error("  'nao consegui comparar' nao e 'esta tudo certo'. Em esteira, isto quer");
    console.error("  dizer checkout sem historico: o job precisa de `fetch-depth: 0`.");
    process.exit(1);
  }
  const { foraDeOrdem, tetoDaBase } = analisarOrdem(nomes, base.nomes);

  if (colisoes.length === 0 && foraDaForma.length === 0 && foraDeOrdem.length === 0) {
    console.log(
      `APROVADO: os ${nomes.length} arquivos de ${DIRETORIO}/ tem carimbos distintos, ` +
        `e nenhum entra abaixo do teto de ${base.ref} (${comQuatorzeDigitos(tetoDaBase)}).`,
    );
    if (buracos.length > 0) {
      console.log(`  nota, sem reprovar: carimbo sem arquivo aqui -- ${buracos.join(", ")}.`);
      console.log("  Buraco e esperado quando um carimbo foi reservado numa branch que ainda nao mesclou.");
    }
    if (maiorCarimbo !== undefined) {
      console.log(`  o proximo carimbo livre e ${comQuatorzeDigitos(maiorCarimbo + 1)}.`);
    }
    return;
  }

  if (colisoes.length > 0) {
    console.error(`REPROVA: ${colisoes.length} carimbo(s) com mais de um arquivo em ${DIRETORIO}/.`);
    for (const { carimbo, arquivos } of colisoes) {
      console.error(`\n  o carimbo ${comQuatorzeDigitos(carimbo)} esta em ${arquivos.length} arquivos:`);
      for (const a of arquivos) console.error(`    - ${DIRETORIO}/${a}`);
      console.error(`    (nesta ordem, que e a que o node-pg-migrate aplicaria: o desempate e o SLUG)`);
    }
    console.error("");
    console.error("  O git nao acusa isto: os nomes completos diferem, entao nao ha conflito e o");
    console.error("  merge junta as duas em silencio.");
    console.error("");
    console.error("  E nao e so confusao de leitura. Num banco que ja aplicou UMA das irmas, o");
    console.error("  `migrate up` seguinte morre em `checkOrder` com");
    console.error("    Error: Not run migration <a irma nova> is preceding already run migration <a irma antiga>");
    console.error("  saida 1, nada aplicado, e nenhuma migracao futura entra ate alguem intervir.");
    console.error("");
    console.error("  Saida: quem chegou DEPOIS renumera para o proximo carimbo livre. ATENCAO --");
    console.error("  o registro em `pgmigrations` e por NOME, entao migracao JA APLICADA em algum");
    console.error("  banco nao se renumera: renomear faz aquele banco roda-la de novo.");
  }

  if (foraDeOrdem.length > 0) {
    console.error(
      `\nREPROVA: ${foraDeOrdem.length} migracao(oes) nova(s) com carimbo ANTERIOR ao teto de ` +
        `${base.ref} (${comQuatorzeDigitos(tetoDaBase)}):`,
    );
    for (const { arquivo, carimbo } of foraDeOrdem) {
      console.error(`  - ${DIRETORIO}/${arquivo}`);
      console.error(`      carimbo ${comQuatorzeDigitos(carimbo)}, abaixo do teto da base`);
    }
    console.error("");
    console.error("  Este e um defeito DIFERENTE da colisao, e quebra do mesmo jeito: todo banco");
    console.error("  que seguiu a base ja aplicou o teto, e uma migracao nao aplicada que a");
    console.error("  PRECEDE faz o `checkOrder` lancar no proximo `migrate up`.");
    console.error(`  Saida: renumerar para ${comQuatorzeDigitos(Math.max(maiorCarimbo ?? 0, tetoDaBase) + 1)} ou acima.`);
  }

  if (foraDaForma.length > 0) {
    console.error(
      `\nREPROVA: ${foraDaForma.length} arquivo(s) de ${DIRETORIO}/ fora da forma NNNNNNNNNNNNNN_slug-em-minuscula.sql:`,
    );
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
