/**
 * Carregamento de `api/openapi.yaml` em tempo de execução.
 *
 * Uma fonte só: schemas de OpenAPI 3.1 **são** JSON Schema 2020-12, e o Fastify
 * valida com JSON Schema. Escrever validação à mão em paralelo à especificação
 * cria duas definições que divergem, e o dia em que divergirem ninguém vai saber
 * qual vale (ADR-0001).
 *
 * O que este arquivo faz, e por quê:
 *
 * 1. **Indexa as operações por `operationId`.** É a chave de rastreio entre a
 *    especificação e a rota, e é o que permite a `defineRoute` e ao portão de
 *    contrato falarem do mesmo objeto.
 * 2. **Resolve `$ref` e remove o que é vocabulário de OpenAPI e não de JSON
 *    Schema** (`example`, `nullable`, `discriminator`). `nullable: true` vira
 *    união com `null`, que é a forma de 3.1 — deixá-lo passar faria o validador
 *    ignorar a nulidade em silêncio.
 * 3. **Reprova operação sem `security` declarado.** Herança do `security` global
 *    esconde exatamente a rota que precisava ser olhada
 *    (docs/04-seguranca.md 9).
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export type MetodoHttp = 'get' | 'post' | 'put' | 'patch' | 'delete';

const METODOS: readonly MetodoHttp[] = ['get', 'post', 'put', 'patch', 'delete'];

export interface OperacaoDoContrato {
  readonly operationId: string;
  readonly method: MetodoHttp;
  /** Caminho como está na especificação, com `{param}`. */
  readonly path: string;
  /** `security` declarado na operação. `[]` significa pública. */
  readonly security: readonly Record<string, unknown>[];
  /** Nomes dos esquemas exigidos, achatados. `[]` quando a operação é pública. */
  readonly securitySchemes: readonly string[];
  readonly effects: readonly string[];
  readonly hasRateLimit: boolean;
  readonly raw: Record<string, unknown>;
}

export interface Contrato {
  readonly spec: Record<string, unknown>;
  readonly operacoes: ReadonlyMap<string, OperacaoDoContrato>;
  /** Schema de corpo de requisição em JSON Schema puro, quando existe. */
  requestBodySchema(operationId: string): Record<string, unknown> | undefined;
  responseSchema(operationId: string, status: string): Record<string, unknown> | undefined;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function resolverRef(spec: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    throw new Error(`Referência externa não é suportada no contrato: ${ref}`);
  }
  let atual: unknown = spec;
  for (const parte of ref.slice(2).split('/')) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[parte.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return atual;
}

/** Vocabulário de OpenAPI que não é JSON Schema e confunde o validador. */
const CHAVES_DESCARTADAS = new Set([
  'example',
  'examples',
  'discriminator',
  'xml',
  'externalDocs',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

/**
 * Palavras-chave cujo VALOR e um mapa de nomes escolhidos por quem escreveu o
 * contrato, e nao mais um schema com palavras-chave de OpenAPI.
 *
 * Esta distincao nao e detalhe: sem ela, `CHAVES_DESCARTADAS` e o corte de
 * `x-` se aplicavam dentro de `properties`, onde a chave e o NOME DO CAMPO. Um
 * corpo com um campo chamado `example`, `deprecated`, `readOnly` ou qualquer um
 * comecando com `x-` perdia esse campo de `properties` e o mantinha em
 * `required`; com `additionalProperties: false` a rota passava a recusar
 * **toda** requisicao, para sempre, sem que nada no contrato parecesse errado.
 *
 * Nenhum campo do contrato de hoje tem esses nomes -- o defeito era latente, e
 * e exatamente por isso que ele merecia teste antes de alguem bater nele.
 */
const MAPAS_DE_NOMES = new Set([
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
]);

function paraJsonSchema(
  valor: unknown,
  spec: Record<string, unknown>,
  refsNoCaminho: ReadonlySet<string>,
  /** O objeto recebido e um mapa de NOMES (ver `MAPAS_DE_NOMES`), nao um schema. */
  mapaDeNomes = false,
): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => paraJsonSchema(item, spec, refsNoCaminho));
  }
  if (!ehObjeto(valor)) return valor;

  // Antes de qualquer outra coisa: num mapa de nomes nenhuma chave e palavra
  // de OpenAPI. Nem `$ref`, que aqui seria um campo chamado `$ref`.
  if (mapaDeNomes) {
    const porNome: Record<string, unknown> = {};
    for (const [nome, item] of Object.entries(valor)) {
      porNome[nome] = paraJsonSchema(item, spec, refsNoCaminho);
    }
    return porNome;
  }

  const ref = valor['$ref'];
  if (typeof ref === 'string') {
    if (refsNoCaminho.has(ref)) {
      // Recursão no contrato viraria expansão infinita aqui. Nenhum schema do
      // Bichu é recursivo hoje; se um vier a ser, a falha precisa ser ruidosa e
      // não uma pilha estourada sem explicação.
      throw new Error(`Schema recursivo no contrato, sem tratamento: ${ref}`);
    }
    const alvo = resolverRef(spec, ref);
    if (alvo === undefined) throw new Error(`Referência não resolvida no contrato: ${ref}`);
    return paraJsonSchema(alvo, spec, new Set([...refsNoCaminho, ref]));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (CHAVES_DESCARTADAS.has(chave) || chave.startsWith('x-')) continue;
    if (chave === 'nullable') continue;
    saida[chave] = paraJsonSchema(item, spec, refsNoCaminho, MAPAS_DE_NOMES.has(chave));
  }

  // `nullable: true` é forma de OpenAPI 3.0 e aparece neste contrato. Em 3.1 o
  // equivalente é o tipo em união com `null`; sem a conversão o validador
  // recusaria `null` em campo que a especificação declara anulável.
  if (valor['nullable'] === true) {
    const tipo = saida['type'];
    if (typeof tipo === 'string') saida['type'] = [tipo, 'null'];
    else if (Array.isArray(tipo) && !tipo.includes('null')) {
      saida['type'] = [...(tipo as unknown[]), 'null'];
    }
  }
  return saida;
}

function achatarSecurity(security: readonly Record<string, unknown>[]): string[] {
  const nomes = new Set<string>();
  for (const entrada of security) {
    for (const nome of Object.keys(entrada)) nomes.add(nome);
  }
  return [...nomes];
}

export function carregarContrato(caminho: string): Contrato {
  const texto = readFileSync(caminho, 'utf8');

  let spec: unknown;
  try {
    // `uniqueKeys` fica no padrão, que é recusar chave repetida. Tolerar aqui
    // faria o último valor vencer em silêncio, e a especificação passaria a
    // dizer uma coisa para quem lê e outra para quem carrega.
    spec = parseYaml(texto);
  } catch (erro) {
    throw new Error(
      `O contrato ${caminho} não é YAML válido e por isso nada pode ser ` +
        `carregado a partir dele. Isto não se corrige no código: a especificação ` +
        `é o documento a arrumar. Causa: ${erro instanceof Error ? erro.message : String(erro)}`,
      { cause: erro },
    );
  }
  if (!ehObjeto(spec)) throw new Error(`Contrato não é um documento YAML de mapa: ${caminho}`);

  const paths = spec['paths'];
  if (!ehObjeto(paths)) throw new Error('Contrato sem `paths`.');

  const operacoes = new Map<string, OperacaoDoContrato>();
  const semSecurity: string[] = [];
  const securityMalformado: string[] = [];

  for (const [caminhoDaRota, item] of Object.entries(paths)) {
    if (!ehObjeto(item)) continue;
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (!ehObjeto(operacao)) continue;
      const operationId = operacao['operationId'];
      if (typeof operationId !== 'string') {
        throw new Error(`Operação sem operationId em ${metodo.toUpperCase()} ${caminhoDaRota}.`);
      }

      const security = operacao['security'];
      if (!Array.isArray(security)) {
        semSecurity.push(operationId);
        continue;
      }
      // `security` DECLARADO mas malformado é tão perigoso quanto ausente, e
      // mais traiçoeiro: `security: [bearerAuth]` — sem os dois-pontos e as
      // chaves — é o erro mais natural do arquivo, porque `tags` e `x-effects`
      // logo ao lado são listas de texto. `Array.isArray` passa, o filtro
      // esvazia, e o resultado é `security: []`, que este módulo documenta como
      // **pública**. Uma rota escrita para exigir conta vira pública em
      // silêncio, e o portão que existe para pegar isso é o mesmo que foi
      // enganado.
      //
      // Por isso: lista não vazia que não tem NENHUM mapa não carrega. A lista
      // vazia continua valendo, porque ela é a forma correta de dizer "pública".
      const entradas = security.filter(ehObjeto);
      if (security.length > 0 && entradas.length === 0) {
        securityMalformado.push(operationId);
        continue;
      }
      const efeitos = operacao['x-effects'];

      operacoes.set(operationId, {
        operationId,
        method: metodo,
        path: caminhoDaRota,
        security: entradas,
        securitySchemes: achatarSecurity(entradas),
        effects: Array.isArray(efeitos) ? efeitos.filter((e): e is string => typeof e === 'string') : [],
        hasRateLimit: Array.isArray(operacao['x-rate-limit']) && operacao['x-rate-limit'].length > 0,
        raw: operacao,
      });
    }
  }

  if (securityMalformado.length > 0) {
    throw new Error(
      'Operações com `security` declarado em forma que não é mapa — provavelmente ' +
        '`security: [bearerAuth]` em vez de `security: [{ bearerAuth: [] }]`. ' +
        'Isso seria lido como rota PÚBLICA, que é o contrário do que foi escrito: ' +
        `${securityMalformado.join(', ')}`,
    );
  }
  if (semSecurity.length > 0) {
    // Negar por padrão, e falhar na subida em vez de na primeira requisição:
    // especificação sem `security` não carrega.
    throw new Error(
      'Operações sem `security` declarado, o que faz a rota herdar o padrão ' +
        `global e desaparecer de qualquer conferência: ${semSecurity.join(', ')}`,
    );
  }
  if (operacoes.size === 0) {
    throw new Error(`Contrato carregado sem nenhuma operação: ${caminho}`);
  }

  const cacheDeCorpo = new Map<string, Record<string, unknown> | undefined>();

  return {
    spec,
    operacoes,
    requestBodySchema(operationId) {
      if (cacheDeCorpo.has(operationId)) return cacheDeCorpo.get(operationId);
      const operacao = operacoes.get(operationId);
      let resultado: Record<string, unknown> | undefined;
      const corpo = operacao === undefined ? undefined : operacao.raw['requestBody'];
      if (ehObjeto(corpo)) {
        const conteudo = corpo['content'];
        if (ehObjeto(conteudo)) {
          const json = conteudo['application/json'];
          if (ehObjeto(json) && json['schema'] !== undefined) {
            const convertido = paraJsonSchema(json['schema'], spec, new Set());
            if (ehObjeto(convertido)) resultado = convertido;
          }
        }
      }
      cacheDeCorpo.set(operationId, resultado);
      return resultado;
    },
    responseSchema(operationId, status) {
      const operacao = operacoes.get(operationId);
      const respostas = operacao === undefined ? undefined : operacao.raw['responses'];
      if (!ehObjeto(respostas)) return undefined;
      const resposta = respostas[status];
      if (!ehObjeto(resposta)) return undefined;
      const conteudo = resposta['content'];
      if (!ehObjeto(conteudo)) return undefined;
      for (const midia of Object.values(conteudo)) {
        if (ehObjeto(midia) && midia['schema'] !== undefined) {
          const convertido = paraJsonSchema(midia['schema'], spec, new Set());
          if (ehObjeto(convertido)) return convertido;
        }
      }
      return undefined;
    },
  };
}

export { ehObjeto as ehObjetoDoContrato, resolverRef as resolverRefDoContrato };
