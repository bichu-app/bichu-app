/**
 * Portão do registro de rota: **nenhuma rota entra pela porta dos fundos**.
 *
 * O critério 2 da BICHUS-178 pede que registrar uma rota sem que os tetos sejam
 * aplicados "não seja exprimível: ou não compila, ou o registro falha na
 * subida". Duas das três barreiras já são de tipo e de execução:
 *
 * - `defineRoute` torna a **omissão da declaração** erro de compilação;
 * - `registrarRota` exige, também por tipo, um resolvedor para cada dimensão
 *   específica declarada, e derruba a subida quando o servidor não traz o
 *   contador.
 *
 * Falta a terceira, e é esta: alguém pode chamar o framework direto e passar ao
 * largo de tudo.
 *
 * ## Por que este arquivo foi reescrito
 *
 * A primeira versão era uma expressão regular sobre o texto, e ela **enumerava
 * os nomes de variável que alguém lembrou de listar**:
 *
 * ```
 * \b(?:app|servidor|instancia|fastify|server)\s*\.\s*(get|post|...)
 * ```
 *
 * `escopo` não estava na lista. E `escopo` é o nome do parâmetro em
 * `src/bin/api.ts`, dentro do `register` prefixado — o lugar onde as seis
 * famílias de rotas de verdade são registradas. O portão protegia a porta da
 * frente e deixava a de serviço aberta. Medido: com
 * `escopo.post('/isca-clandestina', ...)` plantado em `api.ts`, a suíte inteira
 * passava, 663 de 663.
 *
 * É a segunda vez que um portão deste repositório falha assim (o portão
 * estrutural da BICHUS-161 casava `import ` com aspa simples e deixava passar a
 * aspa dupla). A classe do defeito não é o nome que faltou: é **enumerar o que
 * é proibido**. Lista de proibidos falha exatamente no item que ninguém previu,
 * e falha para verde.
 *
 * ## A regra agora é a inversa, e ela não tem nome de variável dentro
 *
 * O portão pergunta ao compilador, não ao texto:
 *
 * > Reprova **toda chamada de membro do `FastifyInstance`** feita fora de
 * > `shared/http/registrar-rota.ts`, **exceto** os poucos membros que
 * > comprovadamente não registram rota.
 *
 * Três consequências, e são elas que fecham a classe:
 *
 * 1. **O nome do receptor deixou de importar.** Quem decide é o tipo do
 *    receptor, resolvido pelo compilador. `escopo`, `app`, `xpto` ou
 *    `oServidorDaCasa` dão no mesmo.
 * 2. **A forma da chamada deixou de importar.** Comentário, texto entre aspas e
 *    quebra de linha são do léxico, e a árvore sintática já os separou. O
 *    parêntese dentro de uma cadeia de caracteres nunca foi uma chamada, e não
 *    é mais preciso raspar o arquivo para descobrir isso. O acesso por colchete
 *    também é visto, e a versão de texto não via.
 * 3. **A enumeração que sobrou falha para o lado seguro.**
 *    `MEMBROS_QUE_NAO_REGISTRAM` lista o que é **permitido**. Um método novo do
 *    framework, ou um que exista hoje e ninguém lembrou, cai no caso padrão,
 *    que é *reprovar*. Enumerar o permitido erra recusando; enumerar o proibido
 *    erra aceitando, que foi o defeito.
 *
 * ## O que ele NÃO pega, dito por escrito
 *
 * Nenhuma dessas é hipótese: as três foram plantadas, rodadas e conferidas.
 *
 * - **`any` desliga o portão.** Uma conversão para `any` antes da chamada tira
 *   o tipo, logo tira o símbolo, logo não é achado aqui. Quem fecha isso é o
 *   lint com tipo: `@typescript-eslint/no-explicit-any` e
 *   `no-unsafe-member-access` são erro na configuração deste repositório, e os
 *   dois estão no mesmo `npm run lint` que a esteira roda. **São dois portões,
 *   e os dois precisam continuar existindo** — este arquivo sozinho não cobre
 *   `any`.
 * - **O membro precisa ser declarado na interface `FastifyInstance`.** Se o
 *   framework renomear a interface, o portão fica cego. Por isso
 *   `varrerRegistroDireto` devolve os achados do arquivo autorizado à parte: o
 *   registro legítimo dentro de `registrar-rota.ts` é o controle positivo
 *   permanente, e a sua ausência precisa ser falha ruidosa, não aprovação por
 *   silêncio.
 * - **Não há isenção para arquivo de teste**, de propósito. Um
 *   `FastifyInstance` construído e usado dentro de um `.test.ts` é achado como
 *   qualquer outro.
 */
import path from 'node:path';

import ts from 'typescript';

/**
 * Quem pode chamar o framework direto. Um só, e o caminho é comparado por
 * componente: `startsWith` sobre texto deixaria passar um
 * `registrar-rota-antigo.ts` ao lado.
 */
export const UNICO_AUTORIZADO = path.join('src', 'shared', 'http', 'registrar-rota.ts');

/** A interface do framework cujos membros este portão vigia. */
const INTERFACE_DO_SERVIDOR = 'FastifyInstance';

/**
 * Os membros do servidor que **não** registram rota, e só eles.
 *
 * Esta é a única lista do arquivo, e ela é de **permitidos**. A diferença não é
 * de estilo: um membro do framework que não esteja aqui é reprovado, então
 * esquecer um item custa uma recusa que alguém lê e resolve. Na lista de
 * proibidos, esquecer um item custava uma rota sem teto em produção.
 *
 * Cada entrada é um compromisso: acrescentar uma é afirmar que aquele membro
 * não põe rota no servidor. Antes de acrescentar, confira na documentação do
 * framework — `route`, `all` e os atalhos por verbo põem, e por isso nenhum
 * deles está aqui.
 */
export const MEMBROS_QUE_NAO_REGISTRAM: ReadonlySet<string> = new Set([
  // Cria escopo de plugin. As rotas registradas lá dentro continuam passando
  // pelo mesmo crivo: o escopo é um servidor, e este portão olha o tipo.
  'register',
  // Ganchos do ciclo de vida. `onRoute` é como a idempotência e a validação de
  // parâmetro se instalam sobre rotas que já existem, sem criar nenhuma.
  'addHook',
  // Borda do processo.
  'listen',
  'close',
  // Decorador: acrescenta propriedade à instância (é assim que `tetoDeChamada`
  // chega). Não cria rota.
  'decorate',
  // Manipuladores de erro e de rota inexistente. O segundo responde ao que NÃO
  // casou com nenhuma rota, que é o contrário de registrar uma.
  'setErrorHandler',
  'setNotFoundHandler',
  // Requisição sintética, sem socket. Só teste usa.
  'inject',
  // Espera os plugins subirem. Não cria rota nenhuma -- ao contrário, é o que
  // se chama DEPOIS de todas existirem, e é por isso que as conferências de
  // subida (idempotência, parâmetro) rodam logo em seguida. Entrou quando a
  // BICHUS-199 trouxe bancadas que chamam `app.ready()`: o portão as reprovou,
  // e reprovar o desconhecido é o desenho dele funcionando.
  'ready',
]);

export interface RegistroDireto {
  /** Relativo à raiz do projeto, com separador do sistema. */
  readonly caminho: string;
  readonly linha: number;
  /** O membro chamado, como `post` ou `route`. */
  readonly membro: string;
  /** O texto da chamada, cortado. Serve para quem lê o relatório se localizar. */
  readonly trecho: string;
}

export interface Varredura {
  /** Registro direto fora do autorizado. Lista vazia é aprovação. */
  readonly clandestinos: readonly RegistroDireto[];
  /**
   * Os do arquivo autorizado. **Controle positivo**: `registrar-rota.ts` chama
   * o registro do framework, e essa chamada precisa aparecer aqui. Zero
   * significa que o portão perdeu a capacidade de enxergar, não que a árvore
   * está limpa.
   */
  readonly noAutorizado: readonly RegistroDireto[];
  readonly arquivosVarridos: number;
}

/** Arquivos extras, em memória, sobrepostos ao programa real. Chave absoluta. */
export type ArquivosEmMemoria = ReadonlyMap<string, string>;

function lerConfiguracao(raiz: string): ts.ParsedCommandLine {
  const caminho = ts.findConfigFile(raiz, (nome) => ts.sys.fileExists(nome), 'tsconfig.json');
  if (caminho === undefined) {
    throw new Error(`nao achei tsconfig.json a partir de ${raiz}: o portao nao tem o que varrer`);
  }
  const lido = ts.readConfigFile(caminho, (nome) => ts.sys.readFile(nome));
  if (lido.error !== undefined) {
    const motivo = ts.flattenDiagnosticMessageText(lido.error.messageText, ' ');
    throw new Error(`tsconfig.json ilegivel: ${motivo}`);
  }
  const analisado = ts.parseJsonConfigFileContent(lido.config, ts.sys, path.dirname(caminho));
  if (analisado.errors.length > 0) {
    const motivos = analisado.errors
      .map((erro) => ts.flattenDiagnosticMessageText(erro.messageText, ' '))
      .join('; ');
    throw new Error(`tsconfig.json invalido: ${motivos}`);
  }
  return analisado;
}

/**
 * O programa que o portão interroga. Os mesmos arquivos e as mesmas opções do
 * `tsconfig.json` — varrer com configuração própria seria medir outra coisa.
 *
 * `extras` sobrepõe arquivos **em memória**. É por onde a isca do autoteste
 * entra sem tocar o disco: isca que precisa de arquivo gravado deixa lixo
 * quando o teste quebra no meio, e lixo em `src/` é o que o portão vê na
 * próxima execução.
 */
export function criarPrograma(raiz: string = process.cwd(), extras?: ArquivosEmMemoria): ts.Program {
  const analisado = lerConfiguracao(raiz);
  const opcoes: ts.CompilerOptions = { ...analisado.options, noEmit: true };
  const nomes = [...analisado.fileNames, ...(extras === undefined ? [] : [...extras.keys()])];

  const hospedeiro = ts.createCompilerHost(opcoes, true);
  if (extras !== undefined) {
    // Cópia rasa antes de sobrescrever: os originais precisam ser chamados com
    // o próprio hospedeiro como `this`, e `hospedeiro.x = ...` já teria trocado
    // o que a cópia leria.
    const original: ts.CompilerHost = { ...hospedeiro };
    const lerFonteOriginal = (...args: Parameters<ts.CompilerHost['getSourceFile']>) =>
      original.getSourceFile(...args);
    const existeOriginal = (nome: string): boolean => original.fileExists(nome);
    const lerOriginal = (nome: string): string | undefined => original.readFile(nome);

    hospedeiro.getSourceFile = (nome, versao, aoErrar, criarSePreciso) => {
      const conteudo = extras.get(nome);
      if (conteudo === undefined) return lerFonteOriginal(nome, versao, aoErrar, criarSePreciso);
      return ts.createSourceFile(nome, conteudo, versao, true, ts.ScriptKind.TS);
    };
    hospedeiro.fileExists = (nome) => extras.has(nome) || existeOriginal(nome);
    hospedeiro.readFile = (nome) => extras.get(nome) ?? lerOriginal(nome);
  }

  return ts.createProgram(nomes, opcoes, hospedeiro);
}

/** O membro é declarado na interface do servidor do framework? */
function ehMembroDoServidor(simbolo: ts.Symbol | undefined): boolean {
  return (simbolo?.getDeclarations() ?? []).some((declaracao) => {
    const pai: ts.Node = declaracao.parent;
    return ts.isInterfaceDeclaration(pai) && pai.name.text === INTERFACE_DO_SERVIDOR;
  });
}

/**
 * O nome do membro chamado, quando a chamada é sobre um membro resolvido do
 * servidor. `undefined` quando a chamada não é isso.
 *
 * Cobre as duas formas de acesso. O acesso por colchete com literal é a mesma
 * chamada que o acesso por ponto, e uma varredura que só visse o ponto já teria
 * um furo de forma esperando alguém com pressa.
 */
function membroDoServidorChamado(
  chamada: ts.CallExpression,
  verificador: ts.TypeChecker,
): string | undefined {
  const alvo = chamada.expression;

  if (ts.isPropertyAccessExpression(alvo)) {
    const simbolo = verificador.getSymbolAtLocation(alvo.name);
    return ehMembroDoServidor(simbolo) ? alvo.name.text : undefined;
  }

  if (ts.isElementAccessExpression(alvo) && ts.isStringLiteralLike(alvo.argumentExpression)) {
    const nome = alvo.argumentExpression.text;
    const simbolo = verificador.getTypeAtLocation(alvo.expression).getProperty(nome);
    return ehMembroDoServidor(simbolo) ? nome : undefined;
  }

  return undefined;
}

function cortar(texto: string): string {
  const numaLinha = texto.replace(/\s+/g, ' ').trim();
  return numaLinha.length <= 100 ? numaLinha : `${numaLinha.slice(0, 97)}...`;
}

function ehOAutorizado(relativo: string, autorizado: string): boolean {
  const partes = relativo.split(/[\\/]/);
  const doAutorizado = autorizado.split(/[\\/]/);
  if (partes.length < doAutorizado.length) return false;
  return doAutorizado.every(
    (parte, indice) => partes[partes.length - doAutorizado.length + indice] === parte,
  );
}

/**
 * Percorre o programa e separa o registro legítimo do clandestino.
 *
 * Só arquivos sob `src/` entram: `node_modules` e os `.d.ts` do framework não
 * são código nosso, e varrer os tipos do próprio fastify acusaria a declaração
 * como se fosse uso.
 */
export function varrerRegistroDireto(
  programa: ts.Program,
  raiz: string = process.cwd(),
  autorizado: string = UNICO_AUTORIZADO,
): Varredura {
  const verificador = programa.getTypeChecker();
  const clandestinos: RegistroDireto[] = [];
  const noAutorizado: RegistroDireto[] = [];
  const prefixo = path.join(raiz, 'src') + path.sep;
  let arquivosVarridos = 0;

  for (const fonte of programa.getSourceFiles()) {
    if (fonte.isDeclarationFile) continue;
    if (!fonte.fileName.startsWith(prefixo)) continue;
    arquivosVarridos += 1;

    const relativo = path.relative(raiz, fonte.fileName);
    const destino = ehOAutorizado(relativo, autorizado) ? noAutorizado : clandestinos;

    const percorrer = (no: ts.Node): void => {
      if (ts.isCallExpression(no)) {
        const membro = membroDoServidorChamado(no, verificador);
        if (membro !== undefined && !MEMBROS_QUE_NAO_REGISTRAM.has(membro)) {
          const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
          destino.push({
            caminho: relativo,
            linha: line + 1,
            membro,
            trecho: cortar(no.getText(fonte)),
          });
        }
      }
      ts.forEachChild(no, percorrer);
    };
    percorrer(fonte);
  }

  return { clandestinos, noAutorizado, arquivosVarridos };
}

// ---------------------------------------------------------------------------
// A BARREIRA DE TIPO, E O QUE A GUARDA. BICHUS-217.
// ---------------------------------------------------------------------------
//
// `RegistradorDeRotas = Omit<FastifyInstance, MetodoDeRegistro>` é a PRIMEIRA
// camada: ela acusa no editor, na hora, e não tem furo de nome de variável.
// A varredura acima é a segunda, e acusa depois, na suíte.
//
// O QA mediu que a primeira podia ser desfeita sem que nada acusasse: trocar o
// `Omit` por `FastifyInstance` deixava 856 de 856 verdes e o `eslint .` limpo.
// Mecanismo importante cuja remoção não derruba nada é a mesma forma de defeito
// que a BICHUS-206 conserta.
//
// POR QUE A CONFERÊNCIA NÃO LÊ O TEXTO DO ARQUIVO
//
// Ler `Omit<FastifyInstance, MetodoDeRegistro>` com expressão regular seria a
// terceira vez que um portão deste repositório enumera forma de escrita: a
// versão antiga desta varredura listava nomes de variável e `escopo` não estava
// nela; o portão estrutural da BICHUS-161 casava `import '` com aspa simples e
// a aspa dupla passava. Uma reescrita equivalente -- `Omit<FastifyInstance,
// 'get' | 'post' | ...>`, um `Exclude` no lugar do `Omit`, um alias
// intermediário -- deixaria o texto diferente com a barreira intacta, e a
// varredura reprovaria o que está certo. O inverso é pior: `Omit<FastifyInstance,
// never>` casa com a expressão e não esconde nada.
//
// Então a pergunta é feita ao COMPILADOR, e é sobre o EFEITO: quais membros do
// `FastifyInstance` deixaram de existir no `RegistradorDeRotas`. Qualquer forma
// de escrever o tipo que produza o mesmo efeito passa; qualquer uma que não
// produza reprova, inclusive as que ninguém previu.

/**
 * Os membros que o `Omit` precisa esconder, e exatamente eles.
 *
 * É o complemento de `MEMBROS_QUE_NAO_REGISTRAM`: aquela lista diz o que pode
 * ser chamado, esta diz o que não pode nem ser alcançado. As duas precisam ser
 * disjuntas, e há um caso que confere isso.
 */
export const MEMBROS_QUE_O_OMIT_ESCONDE: readonly string[] = [
  'all',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'route',
];

/** O que a sonda mediu sobre a barreira. Nenhum campo é opcional de propósito. */
export interface BarreiraDeTipo {
  /** `keyof FastifyInstance` menos `keyof RegistradorDeRotas`, ordenado. */
  readonly escondidos: readonly string[];
  /**
   * Quantos membros o `FastifyInstance` tem. **Controle de cegueira**: se o
   * tipo não resolveu (dependência ausente, `import` renomeado, caminho errado),
   * ele vem com pouca coisa ou zero, e aí `escondidos` vazio significaria "não
   * consegui olhar" e não "a barreira sumiu". Aprovar nesse estado seria o
   * portão cego da BICHUS-216, na outra linguagem.
   */
  readonly membrosDoServidor: number;
  /** Códigos de erro do compilador na chamada de registro SOBRE o registrador. */
  readonly errosNaChamadaEscondida: readonly number[];
  /** Códigos de erro na MESMA chamada sobre o `FastifyInstance` inteiro. */
  readonly errosNoControle: readonly number[];
}

/** `error TS2339: Property 'x' does not exist on type 'y'`. */
export const PROPRIEDADE_INEXISTENTE = 2339;

const SONDA_DOS_MEMBROS = path.join('src', 'tools', '_sondas', 'membros.ts');
const SONDA_DA_CHAMADA_ESCONDIDA = path.join('src', 'tools', '_sondas', 'chamada-escondida.ts');
const SONDA_DE_CONTROLE = path.join('src', 'tools', '_sondas', 'controle.ts');

/**
 * As sondas vivem em memória, como as iscas da varredura: arquivo gravado em
 * `src/` que não compila deixa lixo quando o teste quebra no meio, e este em
 * particular **não compila de propósito**.
 *
 * `_sondas/` está dois níveis abaixo de `src/`, então o caminho relativo até
 * `shared/http/registrar-rota.js` sobe dois.
 */
function sondas(): ArquivosEmMemoria {
  const importes = [
    "import type { FastifyInstance } from 'fastify';",
    "import type { RegistradorDeRotas } from '../../shared/http/registrar-rota.js';",
  ].join('\n');
  return new Map([
    [
      SONDA_DOS_MEMBROS,
      [
        importes,
        'export declare const servidorInteiro: FastifyInstance;',
        'export declare const registrador: RegistradorDeRotas;',
      ].join('\n'),
    ],
    [
      // A isca: o registro clandestino ESCRITO, com o tipo que os dez pontos de
      // rota recebem. Ela precisa NÃO compilar.
      SONDA_DA_CHAMADA_ESCONDIDA,
      [
        "import type { RegistradorDeRotas } from '../../shared/http/registrar-rota.js';",
        'export function montar(escopo: RegistradorDeRotas): void {',
        "  void escopo.post('/isca-da-barreira-de-tipo', async () => ({ ok: true }));",
        '}',
      ].join('\n'),
    ],
    [
      // O controle positivo: a MESMA chamada, no tipo largo. Ela precisa
      // compilar limpa. Sem ele, uma sonda que não compilasse por qualquer
      // outro motivo (import errado, caminho quebrado) faria o caso acima
      // passar sem medir nada -- aprovação por acidente.
      SONDA_DE_CONTROLE,
      [
        "import type { FastifyInstance } from 'fastify';",
        'export function montar(escopo: FastifyInstance): void {',
        "  void escopo.post('/controle-da-barreira-de-tipo', async () => ({ ok: true }));",
        '}',
      ].join('\n'),
    ],
  ]);
}

function tipoDaConstante(
  fonte: ts.SourceFile,
  nome: string,
  verificador: ts.TypeChecker,
): ts.Type | undefined {
  for (const comando of fonte.statements) {
    if (!ts.isVariableStatement(comando)) continue;
    for (const declaracao of comando.declarationList.declarations) {
      if (ts.isIdentifier(declaracao.name) && declaracao.name.text === nome) {
        return verificador.getTypeAtLocation(declaracao.name);
      }
    }
  }
  return undefined;
}

function membros(tipo: ts.Type | undefined): ReadonlySet<string> {
  return new Set((tipo?.getProperties() ?? []).map((simbolo) => simbolo.getName()));
}

function codigosDeErro(programa: ts.Program, absoluto: string): readonly number[] {
  const fonte = programa.getSourceFile(absoluto);
  if (fonte === undefined) {
    throw new Error(
      `a sonda ${absoluto} nao entrou no programa. Sem ela nao ha o que medir, e ` +
        'uma medicao que nao mede reprova, nunca aprova',
    );
  }
  return programa.getSemanticDiagnostics(fonte).map((d) => d.code);
}

/**
 * Pergunta ao compilador o que o `Omit` esconde de fato.
 *
 * Monta um programa próprio: as sondas não podem entrar no programa que
 * `varrerRegistroDireto` percorre, porque uma delas é um registro clandestino
 * de verdade e seria achada como tal.
 */
export function medirBarreiraDeTipo(raiz: string = process.cwd()): BarreiraDeTipo {
  const absoluto = (relativo: string): string => path.join(raiz, relativo);
  const emMemoria: Map<string, string> = new Map();
  for (const [relativo, conteudo] of sondas()) emMemoria.set(absoluto(relativo), conteudo);

  const programa = criarPrograma(raiz, emMemoria);
  const verificador = programa.getTypeChecker();

  const fonte = programa.getSourceFile(absoluto(SONDA_DOS_MEMBROS));
  if (fonte === undefined) {
    throw new Error(
      `a sonda ${SONDA_DOS_MEMBROS} nao entrou no programa: a barreira ficou sem medicao`,
    );
  }

  const doServidor = membros(tipoDaConstante(fonte, 'servidorInteiro', verificador));
  const doRegistrador = membros(tipoDaConstante(fonte, 'registrador', verificador));

  return {
    escondidos: [...doServidor].filter((nome) => !doRegistrador.has(nome)).sort(),
    membrosDoServidor: doServidor.size,
    errosNaChamadaEscondida: codigosDeErro(programa, absoluto(SONDA_DA_CHAMADA_ESCONDIDA)),
    errosNoControle: codigosDeErro(programa, absoluto(SONDA_DE_CONTROLE)),
  };
}
