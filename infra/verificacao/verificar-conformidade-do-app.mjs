#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`.
/**
 * A camada de API do app Flutter fala o mesmo que `api/openapi.yaml`?
 *
 * ====================================================================
 * O BURACO QUE ESTE PORTAO EXISTE PARA TAPAR
 * ====================================================================
 *
 * Regra do cliente, 23/09/2026: toda funcionalidade segue `api/openapi.yaml`, e
 * backend, app, backoffice e site usam os mesmos campos e os mesmos valores.
 *
 * Os outros dois clientes tem portao para isso. O backend gera os tipos da spec
 * e `verificar-tipos-gerados` reprova quando o gerado envelhece. O app NAO
 * tinha nada: `app/lib/api/` e escrito a mao, 22 arquivos e 5232 linhas, e um
 * campo renomeado no contrato nao quebrava build nem teste. Quebrava no
 * aparelho da pessoa, que e o unico lugar onde ninguem esta olhando.
 *
 * ====================================================================
 * POR QUE ELE LE O CODIGO EM VEZ DE GERAR MODELO
 * ====================================================================
 *
 * Gerar os modelos Dart da spec foi medido e nao e barato aqui (ver a entrega):
 * sao 45 tipos de modelo a mao com 375 usos fora de `app/lib/api`, os
 * identificadores sao em portugues por regra da casa e o gerador emite os nomes
 * do contrato em ingles, e o contrato tem 68 schemas dos quais o app modela um
 * recorte de proposito. Gerador que espelha o contrato 1:1 entrega ao app
 * exatamente o que ele nao pode ver.
 *
 * Entao a pergunta daqui e outra: **o que o Dart escreve a mao ainda existe no
 * contrato, com os mesmos valores?**
 *
 * ====================================================================
 * A ARMADILHA DESTA CLASSE DE PORTAO, E COMO ELE NAO CAI NELA
 * ====================================================================
 *
 * Portao que le codigo-fonte passa por nao achar nada. Regex que para de casar,
 * diretorio que mudou de nome, arquivo que foi dividido: o portao varre, nao
 * encontra divergencia nenhuma porque nao encontrou NADA, e imprime verde.
 *
 * Tres travas, e nenhuma delas e opinativa:
 *
 * 1. **Piso de inventario.** Achar menos que `PISO_DE_ENUMS` enums ou
 *    `PISO_DE_DECLARACOES` declaracoes REPROVA, porque a leitura quebrou. O
 *    numero e o medido no dia em que o portao nasceu, e ele so sobe.
 * 2. **Todo enum e classificado.** Enum em `app/lib/api/` ou aponta para o
 *    contrato, ou se declara local com `/// Local:` e o motivo. Enum novo sem
 *    classificacao REPROVA. Isso e o que faz o portao cobrir o que ainda nao
 *    foi escrito, em vez de uma lista que envelhece.
 * 3. **Ponteiro que nao resolve REPROVA, nomeando o ponteiro.** E este o caso
 *    do campo renomeado na spec: o Dart aponta para um lugar que deixou de
 *    existir, e o portao diz qual.
 *
 * ====================================================================
 * O VALOR QUE O APP NAO PODE VER, E POR QUE ELE NAO E EXCECAO NO CODIGO
 * ====================================================================
 *
 * A ADR-0027 decidiu que o app recebe `requested` e nunca `declined`: a recusa
 * de participacao e invisivel para o tutor. Entao o enum do app tem MENOS
 * valores que o do servidor, de proposito.
 *
 * Um portao que exige igualdade reprova esse acerto. Um portao que aceita
 * qualquer falta nao pega o valor esquecido. A saida nao e afrouxar a regra, e
 * exigir que a falta seja DECLARADA no proprio Dart:
 *
 *     /// `#/components/schemas/NetworkJoinRequest/properties/status` do
 *     /// contrato, sem `declined`.
 *
 * Valor que falta e esta declarado: passa. Valor que falta e nao esta: reprova.
 * E valor declarado como ausente que o contrato NAO tem mais: reprova tambem,
 * porque dispensa que sobrevive ao motivo dela e dispensa que ninguem revisou.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const require = createRequire(import.meta.url);
const VERSAO_DO_YAML = require("yaml/package.json").version;

const SPEC = process.env.SPEC_DO_APP ?? "api/openapi.yaml";
const DIRETORIO = process.env.API_DO_APP ?? "app/lib/api";

// Medidos em 23/09/2026 no worktree `feat/conformidade-do-app`, sobre 09c430a:
// 23 enums e 81 declaracoes de topo em `app/lib/api/`. O piso fica ABAIXO do
// medido de proposito -- ele nao existe para congelar o numero, e sim para que
// uma leitura que desabou nao consiga se declarar verde. Arquivo dividido em
// dois nao mexe no total; regex que parou de casar derruba para perto de zero.
const PISO_DE_ENUMS = 20;
const PISO_DE_DECLARACOES = 60;

// --------------------------------------------------------------------------
// LEITURA DO DART
// --------------------------------------------------------------------------

/**
 * As declaracoes de topo de um arquivo Dart, com o bloco de `///` que vem
 * colado em cima e o corpo ate a chave que fecha na coluna zero.
 *
 * Isolada de proposito, junto com `divergencias`: sao as duas funcoes que o
 * autoteste exercita sem tocar em disco.
 */
export function lerDeclaracoes(fonte, caminho) {
  const linhas = fonte.split("\n");
  const achadas = [];
  let doc = [];

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const cru = linha.trim();

    if (cru.startsWith("///")) {
      doc.push(cru.slice(3).trim());
      continue;
    }
    // Linha em branco NAO quebra o bloco de doc: o estilo da casa separa
    // paragrafos com `///` vazio, mas tambem com linha vazia antes da
    // declaracao em alguns arquivos.
    if (cru === "") continue;

    const m = /^(abstract class|class|enum)\s+([A-Za-z0-9_]+)/.exec(linha);
    if (m && !linha.startsWith(" ")) {
      let fim = i;
      for (let j = i + 1; j < linhas.length; j += 1) {
        if (linhas[j] === "}") {
          fim = j;
          break;
        }
      }
      achadas.push({
        arquivo: caminho,
        linha: i + 1,
        especie: m[1] === "enum" ? "enum" : "classe",
        nome: m[2],
        doc: doc.join("\n"),
        corpo: linhas.slice(i, fim + 1).join("\n"),
      });
    }
    doc = [];
  }

  return achadas;
}

/** O ponteiro JSON que o bloco de doc declara, ou `null`. */
function ponteiroDe(doc) {
  const m = /`(#\/[^`]+)`/.exec(doc);
  return m ? m[1] : null;
}

/** Os valores que o bloco de doc declara ausentes de proposito. */
function ausenciasDeclaradas(doc) {
  const m = /\bsem\s+((?:`[^`]+`(?:\s*(?:,|e)\s*)?)+)/i.exec(doc);
  if (!m) return [];
  return [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
}

/** `true` quando o bloco de doc declara o enum como local, fora do contrato. */
function ehLocal(doc) {
  return /^\s*Local:/m.test(doc);
}

/**
 * `true` quando o doc declara o alvo como CATALOGO, e nao como lista fechada.
 *
 * A diferenca e real e vale a classificacao propria. `Species` tem tres valores
 * e a tela desenha os tres: faltar um e a tela recebendo algo que ela nao sabe
 * desenhar. `x-problem-types` tem 28 slugs de erro e o app trata 7 por nome,
 * mandando o resto para o texto generico de erro -- que e o desenho certo, e
 * nao uma lacuna. Exigir completude ali significaria declarar 21 ausencias, e
 * lista de 21 dispensas e lista que ninguem le.
 *
 * Entao aqui vale METADE da regra, e e a metade que pega o defeito desta
 * classe: **todo valor que o app nomeia tem de existir no contrato**. Slug
 * renomeado ou inventado reprova pelo nome. O que o catalogo NAO exige e o
 * caminho inverso, e por isso ele e marcado no codigo em vez de deduzido.
 */
function ehCatalogo(doc) {
  return /^\s*Catalogo:/m.test(doc);
}

/**
 * Os valores de fio de um enum Dart: o primeiro literal de cada constante.
 *
 * A constante de valor VAZIO e a sentinela do `app/lib/api/`: `desconhecido('')`
 * e o que este build faz com um valor que ele nao conhece, e nunca e enviado ao
 * servidor. Ela nao e valor de contrato e nao entra na comparacao -- se
 * entrasse, o portao reprovaria justamente o app que se protegeu contra valor
 * novo, que e o contrario do que ele existe para fazer.
 */
function valoresDoEnum(corpo) {
  const dentro = corpo.slice(corpo.indexOf("{") + 1);
  const valores = [];
  for (const linha of dentro.split("\n")) {
    const m = /^\s{2}([a-zA-Z0-9_]+)\s*\(\s*'([^']*)'/.exec(linha);
    if (m && m[2] !== "") valores.push({ constante: m[1], valor: m[2] });
    // O fim da lista de constantes e o primeiro membro do enum, e NAO um
    // comentario: `///` entre constantes e o estilo normal do repositorio e
    // parar nele faz a leitura perder tudo que vem depois. Isso ja aconteceu
    // aqui, e o portao acusou em vez de aprovar de menos -- que e o unico
    // motivo de a leitura ter piso e de a falha ser ruidosa.
    if (/^\s{2}(const|final|static)\b/.test(linha)) break;
  }
  return valores;
}

/** As chaves de resposta que o corpo de uma classe le. */
function chavesLidas(corpo) {
  return [...new Set([...corpo.matchAll(/\bjson\['([^']+)'\]/g)].map((m) => m[1]))];
}

// --------------------------------------------------------------------------
// LEITURA DO CONTRATO
// --------------------------------------------------------------------------

/** Resolve um ponteiro JSON (RFC 6901) contra o documento da spec. */
export function resolverPonteiro(doc, ponteiro) {
  const partes = ponteiro
    .replace(/^#\//, "")
    .split("/")
    .map((p) => decodeURIComponent(p).replace(/~1/g, "/").replace(/~0/g, "~"));
  let no = doc;
  for (const parte of partes) {
    if (no == null) return undefined;
    no = Array.isArray(no) ? no[Number(parte)] : no[parte];
  }
  return no;
}

/** As propriedades de um schema, descendo `allOf` e `$ref`. */
function propriedadesDe(doc, no, vistos = new Set()) {
  if (no == null || typeof no !== "object") return new Set();
  const nomes = new Set();

  if (typeof no.$ref === "string") {
    if (vistos.has(no.$ref)) return nomes;
    vistos.add(no.$ref);
    for (const p of propriedadesDe(doc, resolverPonteiro(doc, no.$ref), vistos)) nomes.add(p);
    return nomes;
  }
  if (no.properties) for (const p of Object.keys(no.properties)) nomes.add(p);
  for (const chave of ["allOf", "oneOf", "anyOf"]) {
    if (Array.isArray(no[chave])) {
      for (const sub of no[chave]) {
        for (const p of propriedadesDe(doc, sub, vistos)) nomes.add(p);
      }
    }
  }
  return nomes;
}

/** Os valores de um enum do contrato, descendo `$ref`. */
function valoresDoContrato(doc, no, vistos = new Set()) {
  if (no == null || typeof no !== "object") return null;
  if (typeof no.$ref === "string") {
    if (vistos.has(no.$ref)) return null;
    vistos.add(no.$ref);
    return valoresDoContrato(doc, resolverPonteiro(doc, no.$ref), vistos);
  }
  if (Array.isArray(no.enum)) return no.enum.filter((v) => v != null).map(String);
  if (no.items) return valoresDoContrato(doc, no.items, vistos);
  return null;
}

/**
 * A lista fechada de um catalogo: `x-problem-types` e uma lista de objetos com
 * `slug`, e nao um `enum`. A forma muda; a pergunta, nao.
 */
function slugsDoCatalogo(no) {
  if (!Array.isArray(no)) return null;
  const slugs = no.map((e) => e && typeof e === "object" && e.slug).filter((s) => typeof s === "string");
  return slugs.length === no.length && slugs.length > 0 ? slugs : null;
}

// --------------------------------------------------------------------------
// A DECISAO, isolada de proposito: e ela que o autoteste exercita.
// --------------------------------------------------------------------------

/**
 * Compara as declaracoes ancoradas com a spec e devolve os casos reprovados,
 * cada um com o NOME do que divergiu. Nao le disco e nao imprime.
 */
export function divergencias(declaracoes, spec) {
  const casos = [];
  const enums = declaracoes.filter((d) => d.especie === "enum");

  if (enums.length < PISO_DE_ENUMS) {
    casos.push({
      caso: "piso-de-enums",
      alvo: `${enums.length} enums`,
      motivo:
        `a leitura achou ${enums.length} enums em ${DIRETORIO}/ e o piso e ${PISO_DE_ENUMS}. ` +
        "Portao que le codigo passa por nao achar nada: isto e a leitura quebrada, nao a ausencia de divergencia.",
    });
  }
  if (declaracoes.length < PISO_DE_DECLARACOES) {
    casos.push({
      caso: "piso-de-declaracoes",
      alvo: `${declaracoes.length} declaracoes`,
      motivo: `a leitura achou ${declaracoes.length} declaracoes de topo e o piso e ${PISO_DE_DECLARACOES}.`,
    });
  }

  for (const d of declaracoes) {
    const ponteiro = ponteiroDe(d.doc);
    const local = ehLocal(d.doc);
    const onde = `${d.arquivo}:${d.linha} ${d.nome}`;

    const catalogo = ehCatalogo(d.doc);

    if (d.especie === "enum" && !ponteiro && !local) {
      casos.push({
        caso: "enum-sem-classificacao",
        alvo: onde,
        motivo:
          "enum de `app/lib/api/` sem ponteiro para o contrato e sem `/// Local:`. " +
          "Ou ele espelha uma lista fechada da spec, e entao aponta para ela, ou nao espelha, " +
          "e entao diz por que. Sem isso o portao nao sabe se deveria conferi-lo, e o silencio vira aprovacao.",
      });
      continue;
    }
    if (!ponteiro) continue;

    const no = resolverPonteiro(spec, ponteiro);
    if (no === undefined) {
      casos.push({
        caso: "ponteiro-nao-resolve",
        alvo: onde,
        motivo:
          `o Dart aponta para \`${ponteiro}\` e o contrato nao tem esse caminho. ` +
          "Campo ou schema renomeado na spec sem o app acompanhar, ou ancora escrita errada.",
      });
      continue;
    }

    const declaradas = ausenciasDeclaradas(d.doc);

    if (d.especie === "enum") {
      const doContrato = catalogo ? slugsDoCatalogo(no) : valoresDoContrato(spec, no);
      if (doContrato === null) {
        casos.push({
          caso: "ancora-sem-lista-fechada",
          alvo: onde,
          motivo: `\`${ponteiro}\` resolve, mas nao declara \`enum\` no contrato. Um enum Dart nao pode espelhar o que nao e lista fechada.`,
        });
        continue;
      }
      const doApp = valoresDoEnum(d.corpo);
      if (doApp.length === 0) {
        casos.push({
          caso: "enum-sem-valores-lidos",
          alvo: onde,
          motivo: "enum ancorado do qual a leitura nao extraiu nenhum valor de fio. Comparar conjunto vazio com o contrato aprova qualquer coisa.",
        });
        continue;
      }

      const valores = doApp.map((v) => v.valor);
      for (const v of valores) {
        if (!doContrato.includes(v)) {
          casos.push({
            caso: "valor-que-o-contrato-nao-tem",
            alvo: onde,
            motivo: `o app aceita \`${v}\` e \`${ponteiro}\` nao declara esse valor. O contrato tem: ${doContrato.map((x) => `\`${x}\``).join(", ")}.`,
          });
        }
      }
      for (const v of doContrato) {
        // Catalogo exige so a metade `app ⊆ contrato`. Ver `ehCatalogo`.
        if (catalogo) break;
        if (valores.includes(v)) continue;
        if (declaradas.includes(v)) continue;
        casos.push({
          caso: "valor-do-contrato-que-falta-no-app",
          alvo: onde,
          motivo:
            `\`${ponteiro}\` declara \`${v}\` e o app nao sabe desenhar esse valor. ` +
            "Se a falta e deliberada, declare no proprio doc: ``sem `" + v + "` ``.",
        });
      }
      for (const v of declaradas) {
        if (!doContrato.includes(v)) {
          casos.push({
            caso: "ausencia-declarada-que-o-contrato-nao-tem",
            alvo: onde,
            motivo: `o doc declara ausencia de \`${v}\`, e \`${ponteiro}\` nao tem mais esse valor. Dispensa que sobreviveu ao motivo dela e dispensa que ninguem revisou.`,
          });
        }
      }
      continue;
    }

    const doContrato = propriedadesDe(spec, no);
    if (doContrato.size === 0) {
      casos.push({
        caso: "ancora-sem-propriedades",
        alvo: onde,
        motivo: `\`${ponteiro}\` resolve e nao expoe nenhuma propriedade. Conferir campo contra conjunto vazio aprova qualquer nome.`,
      });
      continue;
    }
    for (const chave of chavesLidas(d.corpo)) {
      if (!doContrato.has(chave)) {
        casos.push({
          caso: "campo-que-o-contrato-nao-tem",
          alvo: onde,
          motivo:
            `o app le o campo \`${chave}\` (em \`json['${chave}']\`) e \`${ponteiro}\` nao o declara. ` +
            "Campo renomeado ou removido na spec so quebraria no aparelho da pessoa.",
        });
      }
    }
  }

  return casos;
}

// --------------------------------------------------------------------------
// AUTOTESTE: cada isca reprova pelo NOME do caso dela.
// --------------------------------------------------------------------------

const SPEC_DE_MENTIRA = {
  components: {
    schemas: {
      Species: { type: "string", enum: ["dog", "cat", "other"] },
      Pet: {
        allOf: [{ $ref: "#/components/schemas/PetInput" }, { properties: { status: { enum: ["active", "lost"] } } }],
      },
      PetInput: { properties: { name: {}, species: {} } },
      NetworkJoinRequest: { properties: { status: { enum: ["requested", "approved", "withdrawn", "expired", "declined"] } } },
      Solto: { type: "string" },
    },
  },
  "x-problem-types": [
    { slug: "validation-failed", status: 400 },
    { slug: "not-found", status: 404 },
  ],
};

function dart(doc, corpo) {
  return `${doc}\n${corpo}\n`;
}

function autoteste() {
  const iscas = [];

  const enumBom = dart(
    "/// `#/components/schemas/Species` do contrato.",
    "enum Especie {\n  cao('dog', 'C'),\n  gato('cat', 'G'),\n  outro('other', 'O');\n}",
  );

  iscas.push({
    nome: "campo-renomeado-na-spec-reprova-pelo-ponteiro",
    declaracoes: lerDeclaracoes(enumBom, "isca.dart"),
    spec: { components: { schemas: { Especies: { enum: ["dog"] } } } },
    esperado: "ponteiro-nao-resolve",
  });

  iscas.push({
    nome: "valor-do-contrato-que-o-app-nao-conhece-reprova",
    declaracoes: lerDeclaracoes(
      dart("/// `#/components/schemas/Species` do contrato.", "enum Especie {\n  cao('dog', 'C'),\n  gato('cat', 'G');\n}"),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "valor-do-contrato-que-falta-no-app",
    nomeia: "other",
  });

  iscas.push({
    nome: "valor-inventado-pelo-app-reprova",
    declaracoes: lerDeclaracoes(
      dart(
        "/// `#/components/schemas/Species` do contrato.",
        "enum Especie {\n  cao('dog', 'C'),\n  gato('cat', 'G'),\n  outro('other', 'O'),\n  furao('ferret', 'F');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "valor-que-o-contrato-nao-tem",
    nomeia: "ferret",
  });

  iscas.push({
    nome: "declined-declarado-ausente-APROVA-o-fluxo-certo",
    declaracoes: lerDeclaracoes(
      dart(
        "/// `#/components/schemas/NetworkJoinRequest/properties/status` do contrato,\n/// sem `declined`.",
        "enum EstadoDoPedido {\n  pedido('requested', 'P'),\n  aprovado('approved', 'A'),\n  desistiu('withdrawn', 'D'),\n  expirou('expired', 'E');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: null,
  });

  iscas.push({
    nome: "declined-NAO-declarado-reprova-nomeando-o-valor",
    declaracoes: lerDeclaracoes(
      dart(
        "/// `#/components/schemas/NetworkJoinRequest/properties/status` do contrato.",
        "enum EstadoDoPedido {\n  pedido('requested', 'P'),\n  aprovado('approved', 'A'),\n  desistiu('withdrawn', 'D'),\n  expirou('expired', 'E');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "valor-do-contrato-que-falta-no-app",
    nomeia: "declined",
  });

  iscas.push({
    nome: "ausencia-declarada-que-o-contrato-nao-tem-mais-reprova",
    declaracoes: lerDeclaracoes(
      dart("/// `#/components/schemas/Species` do contrato, sem `declined`.", "enum Especie {\n  cao('dog', 'C'),\n  gato('cat', 'G'),\n  outro('other', 'O');\n}"),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "ausencia-declarada-que-o-contrato-nao-tem",
    nomeia: "declined",
  });

  iscas.push({
    nome: "campo-que-a-spec-nao-declara-reprova-pelo-nome-do-campo",
    declaracoes: lerDeclaracoes(
      dart(
        "/// `#/components/schemas/Pet` do contrato.",
        "class Pet {\n  factory Pet.doJson(Map<String, Object?> json) {\n    return Pet(nome: json['name'] as String, raca: json['breed_label'] as String?);\n  }\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "campo-que-o-contrato-nao-tem",
    nomeia: "breed_label",
  });

  iscas.push({
    nome: "enum-novo-sem-classificacao-reprova",
    declaracoes: lerDeclaracoes(dart("/// Uma lista qualquer.", "enum Coisa {\n  uma('x', 'X');\n}"), "isca.dart"),
    spec: SPEC_DE_MENTIRA,
    esperado: "enum-sem-classificacao",
  });

  iscas.push({
    nome: "enum-marcado-Local-nao-e-conferido",
    declaracoes: lerDeclaracoes(dart("/// Local: desfecho do envio, nao trafega.", "enum Coisa {\n  uma('x', 'X');\n}"), "isca.dart"),
    spec: SPEC_DE_MENTIRA,
    esperado: null,
  });

  iscas.push({
    nome: "ancora-para-schema-sem-lista-fechada-reprova",
    declaracoes: lerDeclaracoes(dart("/// `#/components/schemas/Solto` do contrato.", "enum Coisa {\n  uma('x', 'X');\n}"), "isca.dart"),
    spec: SPEC_DE_MENTIRA,
    esperado: "ancora-sem-lista-fechada",
  });

  iscas.push({
    nome: "leitura-que-desabou-reprova-pelo-piso",
    declaracoes: [],
    spec: SPEC_DE_MENTIRA,
    esperado: "piso-de-enums",
    semPiso: false,
  });

  iscas.push({
    nome: "catalogo-nao-exige-completude",
    declaracoes: lerDeclaracoes(
      dart(
        "/// Catalogo: os slugs que a tela trata por nome, em `#/x-problem-types`.\n/// O resto cai no texto generico.",
        "enum ProblemTipo {\n  invalido('validation-failed');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: null,
  });

  iscas.push({
    nome: "slug-renomeado-no-catalogo-reprova-pelo-nome",
    declaracoes: lerDeclaracoes(
      dart(
        "/// Catalogo: os slugs que a tela trata por nome, em `#/x-problem-types`.",
        "enum ProblemTipo {\n  invalido('validation-faild');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: "valor-que-o-contrato-nao-tem",
    nomeia: "validation-faild",
  });

  iscas.push({
    nome: "sentinela-de-valor-desconhecido-nao-reprova",
    declaracoes: lerDeclaracoes(
      dart(
        "/// `#/components/schemas/Species` do contrato.",
        "enum Especie {\n  cao('dog', 'C'),\n  gato('cat', 'G'),\n  outro('other', 'O'),\n  desconhecido('');\n}",
      ),
      "isca.dart",
    ),
    spec: SPEC_DE_MENTIRA,
    esperado: null,
  });

  iscas.push({
    nome: "enum-ancorado-do-qual-nao-se-leu-valor-reprova",
    declaracoes: lerDeclaracoes(dart("/// `#/components/schemas/Species` do contrato.", "enum Especie {\n  cao,\n  gato;\n}"), "isca.dart"),
    spec: SPEC_DE_MENTIRA,
    esperado: "enum-sem-valores-lidos",
  });

  let ruins = 0;
  console.log(`autoteste do portao de conformidade do app (yaml ${VERSAO_DO_YAML})\n`);

  for (const isca of iscas) {
    // O piso reprovaria TODA isca sintetica, que tem uma declaracao so. Ele e
    // exercitado pela isca `leitura-que-desabou`; nas demais ele sai do placar
    // para que cada caso responda pela regra DELE, e nao pelo piso.
    const casos = divergencias(isca.declaracoes, isca.spec).filter(
      (c) => isca.esperado?.startsWith("piso") || !c.caso.startsWith("piso"),
    );

    const nomes = casos.map((c) => c.caso);
    let ok;
    if (isca.esperado === null) {
      ok = casos.length === 0;
    } else {
      ok = nomes.includes(isca.esperado);
      if (ok && isca.nomeia) {
        ok = casos.some((c) => c.caso === isca.esperado && c.motivo.includes(`\`${isca.nomeia}\``));
      }
    }

    if (ok) {
      const detalhe = isca.esperado === null ? "nao reprovou, e era para aprovar" : `reprovou em \`${isca.esperado}\`${isca.nomeia ? `, nomeando \`${isca.nomeia}\`` : ""}`;
      console.log(`  ok    ${isca.nome}: ${detalhe}`);
    } else {
      ruins += 1;
      console.error(`  RUIM  ${isca.nome}: esperava ${isca.esperado ?? "nenhuma reprovacao"}, veio [${nomes.join(", ") || "nada"}]`);
    }
  }

  console.log("");
  if (ruins > 0) {
    console.error(`autoteste REPROVADO: ${ruins} de ${iscas.length} iscas nao se comportaram como a regra manda`);
    process.exit(1);
  }
  console.log(`autoteste APROVADO: as ${iscas.length} iscas reprovam e aprovam pelo motivo de cada uma,`);
  console.log("  inclusive a que prova que `declined` declarado ausente NAO reprova o app correto.");
}

// --------------------------------------------------------------------------

function arquivosDart(dir) {
  const saida = [];
  for (const nome of readdirSync(dir).sort()) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDart(caminho));
    else if (nome.endsWith(".dart")) saida.push(caminho);
  }
  return saida;
}

function principal() {
  let spec;
  try {
    spec = parseYaml(readFileSync(SPEC, "utf8"));
  } catch (erro) {
    console.error(`REPROVA: nao consegui ler \`${SPEC}\`: ${erro.message}`);
    console.error("  Portao que nao consegue verificar reprova. Verde aqui seria confianca em nada.");
    process.exit(1);
  }

  let arquivos;
  try {
    arquivos = arquivosDart(DIRETORIO);
  } catch (erro) {
    console.error(`REPROVA: nao consegui varrer \`${DIRETORIO}/\`: ${erro.message}`);
    process.exit(1);
  }

  const declaracoes = arquivos.flatMap((a) => lerDeclaracoes(readFileSync(a, "utf8"), a));
  const enums = declaracoes.filter((d) => d.especie === "enum");
  const ancoradas = declaracoes.filter((d) => ponteiroDe(d.doc));
  const casos = divergencias(declaracoes, spec);

  if (casos.length === 0) {
    console.log(
      `APROVADO: ${ancoradas.length} tipos de \`${DIRETORIO}/\` batem com \`${SPEC}\` ` +
        `(${arquivos.length} arquivos, ${declaracoes.length} declaracoes, ${enums.length} enums).`,
    );
    console.log(`  yaml ${VERSAO_DO_YAML}. Enum sem ancora e sem \`/// Local:\` teria reprovado.`);
    return;
  }

  console.error(`REPROVA: ${casos.length} divergencia(s) entre \`${DIRETORIO}/\` e \`${SPEC}\`.`);
  console.error(`  lidos: ${arquivos.length} arquivos, ${declaracoes.length} declaracoes, ${enums.length} enums, ${ancoradas.length} ancorados.\n`);
  for (const c of casos) {
    console.error(`  [${c.caso}] ${c.alvo}`);
    console.error(`      ${c.motivo}\n`);
  }
  console.error("  A regra do cliente (23/09) e que app, backend, backoffice e site usem os mesmos");
  console.error("  campos e os mesmos valores. Divergencia aqui nao quebra build nem teste:");
  console.error("  ela quebra no aparelho da pessoa, que e onde ninguem esta olhando.");
  process.exit(1);
}

if (process.argv.includes("--autoteste")) autoteste();
else principal();
