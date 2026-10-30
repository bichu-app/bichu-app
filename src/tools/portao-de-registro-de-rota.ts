/** Portão do registro de rota: **nenhuma rota entra pela porta dos fundos**. */
import path from 'node:path';

import ts from 'typescript';

/** Quem pode chamar o framework direto. */
export const UNICO_AUTORIZADO = path.join('src', 'shared', 'http', 'registrar-rota.ts');

/** A interface do framework cujos membros este portão vigia. */
const INTERFACE_DO_SERVIDOR = 'FastifyInstance';

/** Os membros do servidor que **não** registram rota, e só eles. */
export const MEMBROS_QUE_NAO_REGISTRAM: ReadonlySet<string> = new Set([
  'register',
  'addHook',
  'listen',
  'close',
  'decorate',
  'setErrorHandler',
  'setNotFoundHandler',
  'inject',
  'ready',
]);

export interface RegistroDireto {
  /** Relativo à raiz do projeto, com separador do sistema. */
  readonly caminho: string;
  readonly linha: number;
  /** O membro chamado, como `post` ou `route`. */
  readonly membro: string;
  /** O texto da chamada, cortado. */
  readonly trecho: string;
}

export interface Varredura {
  /** Registro direto fora do autorizado. */
  readonly clandestinos: readonly RegistroDireto[];
  /** Os do arquivo autorizado. */
  readonly noAutorizado: readonly RegistroDireto[];
  readonly arquivosVarridos: number;
}

/** Arquivos extras, em memória, sobrepostos ao programa real. */
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

/** O programa que o portão interroga. */
export function criarPrograma(raiz: string = process.cwd(), extras?: ArquivosEmMemoria): ts.Program {
  const analisado = lerConfiguracao(raiz);
  const opcoes: ts.CompilerOptions = { ...analisado.options, noEmit: true };
  const nomes = [...analisado.fileNames, ...(extras === undefined ? [] : [...extras.keys()])];

  const hospedeiro = ts.createCompilerHost(opcoes, true);
  if (extras !== undefined) {
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
 * servidor.
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

/** Percorre o programa e separa o registro legítimo do clandestino. */
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

/** Os membros que o `Omit` precisa esconder, e exatamente eles. */
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

/** O que a sonda mediu sobre a barreira. */
export interface BarreiraDeTipo {
  /** `keyof FastifyInstance` menos `keyof RegistradorDeRotas`, ordenado. */
  readonly escondidos: readonly string[];
  /** Quantos membros o `FastifyInstance` tem. */
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
      SONDA_DA_CHAMADA_ESCONDIDA,
      [
        "import type { RegistradorDeRotas } from '../../shared/http/registrar-rota.js';",
        'export function montar(escopo: RegistradorDeRotas): void {',
        "  void escopo.post('/isca-da-barreira-de-tipo', async () => ({ ok: true }));",
        '}',
      ].join('\n'),
    ],
    [
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

/** Pergunta ao compilador o que o `Omit` esconde de fato. */
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
