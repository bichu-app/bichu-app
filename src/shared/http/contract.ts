/** Carregamento de `api/openapi.yaml` em tempo de execução. */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export type MetodoHttp = 'get' | 'post' | 'put' | 'patch' | 'delete';

const METODOS: readonly MetodoHttp[] = ['get', 'post', 'put', 'patch', 'delete'];

export interface OperacaoDoContrato {
  readonly operationId: string;
  readonly method: MetodoHttp;
  /** Caminho como está na especificação, com `{param}`. */
  readonly path: string;
  /** `security` declarado na operação. */
  readonly security: readonly Record<string, unknown>[];
  /** Nomes dos esquemas exigidos, achatados. */
  readonly securitySchemes: readonly string[];
  readonly effects: readonly string[];
  readonly hasRateLimit: boolean;
  readonly raw: Record<string, unknown>;
  /**
   * Os parâmetros da operação, com os do **item de caminho** já juntos e todo `$ref`
   * de parâmetro resolvido.
   */
  readonly parameters: readonly Record<string, unknown>[];
}

/** O que o Fastify precisa para validar parâmetro de caminho e de query string. */
export interface EsquemasDeParametros {
  readonly params: Record<string, unknown> | undefined;
  readonly querystring: Record<string, unknown> | undefined;
  /** Tipo de problema a devolver quando **aquele** parâmetro reprova, por nome. */
  readonly tiposDeProblema: ReadonlyMap<string, string>;
}

export interface Contrato {
  readonly spec: Record<string, unknown>;
  readonly operacoes: ReadonlyMap<string, OperacaoDoContrato>;
  /** Schema de corpo de requisição em JSON Schema puro, quando existe. */
  requestBodySchema(operationId: string): Record<string, unknown> | undefined;
  responseSchema(operationId: string, status: string): Record<string, unknown> | undefined;
  /** Schemas de `params` e `querystring` em JSON Schema puro, vindos do contrato. */
  parameterSchemas(operationId: string): EsquemasDeParametros;
}

/** Schema de corpo tirado da própria especificação. */
export function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
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

  if (valor['nullable'] === true) {
    const tipo = saida['type'];
    if (typeof tipo === 'string') saida['type'] = [tipo, 'null'];
    else if (Array.isArray(tipo) && !tipo.includes('null')) {
      saida['type'] = [...(tipo as unknown[]), 'null'];
    }
  }
  return saida;
}

/**
 * A chave que isenta uma palavra-chave do esquema de **borda**, declarada no
 * parâmetro e não dentro do `schema` dele.
 */
const ISENCAO_DE_BORDA = 'x-nao-recusado-na-borda';

function semAsPalavrasIsentas(
  parametro: Record<string, unknown>,
  schema: Record<string, unknown>,
  operationId: string,
): Record<string, unknown> {
  const isentas = parametro[ISENCAO_DE_BORDA];
  if (isentas === undefined) return schema;

  const onde = `\`${ISENCAO_DE_BORDA}\` do parâmetro '${String(parametro['name'])}' em ${operationId}`;
  if (
    !Array.isArray(isentas) ||
    isentas.length === 0 ||
    isentas.some((palavra) => typeof palavra !== 'string')
  ) {
    throw new Error(
      `${onde} precisa ser uma lista NÃO VAZIA de nomes de palavra-chave de JSON ` +
        `Schema, e veio ${JSON.stringify(isentas)}. Lista vazia isentaria nada e ` +
        'deixaria a borda recusando contra o que a descrição promete.',
    );
  }

  const saida = { ...schema };
  for (const palavra of isentas as readonly string[]) {
    if (!(palavra in saida)) {
      throw new Error(
        `${onde} isenta \`${palavra}\`, que o \`schema\` do parâmetro não declara. ` +
          'A isenção seria um no-op silencioso: ou a palavra está escrita errada, ou ' +
          'ela saiu do contrato e esta linha ficou — e nos dois casos a borda volta a ' +
          'recusar enquanto a descrição promete que não. Corrija a lista ou reponha a ' +
          `palavra. O \`schema\` declara: ${Object.keys(schema).join(', ')}.`,
      );
    }
    delete saida[palavra];
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

  /** Resolve `$ref` de parâmetro e descarta o que não é um objeto de parâmetro. */
  const parametrosDe = (valor: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(valor)) return [];
    const resolvidos: Record<string, unknown>[] = [];
    for (const bruto of valor) {
      if (!ehObjeto(bruto)) continue;
      const ref = bruto['$ref'];
      if (typeof ref !== 'string') {
        resolvidos.push(bruto);
        continue;
      }
      const alvo = resolverRef(spec, ref);
      if (!ehObjeto(alvo)) {
        throw new Error(`Referência de parâmetro não resolvida no contrato: ${ref}`);
      }
      resolvidos.push(alvo);
    }
    return resolvidos;
  };

  for (const [caminhoDaRota, item] of Object.entries(paths)) {
    if (!ehObjeto(item)) continue;
    const parametrosDoCaminho = parametrosDe(item['parameters']);
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
        parameters: [...parametrosDoCaminho, ...parametrosDe(operacao['parameters'])],
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
    throw new Error(
      'Operações sem `security` declarado, o que faz a rota herdar o padrão ' +
        `global e desaparecer de qualquer conferência: ${semSecurity.join(', ')}`,
    );
  }
  if (operacoes.size === 0) {
    throw new Error(`Contrato carregado sem nenhuma operação: ${caminho}`);
  }

  const cacheDeCorpo = new Map<string, Record<string, unknown> | undefined>();
  const cacheDeParametros = new Map<string, EsquemasDeParametros>();

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
    parameterSchemas(operationId) {
      const emCache = cacheDeParametros.get(operationId);
      if (emCache !== undefined) return emCache;

      const operacao = operacoes.get(operationId);
      const porLugar = new Map<'path' | 'query', { propriedades: Record<string, unknown>; exigidos: string[] }>();
      const tiposDeProblema = new Map<string, string>();

      for (const parametro of operacao?.parameters ?? []) {
        const lugar = parametro['in'];
        const nome = parametro['name'];
        if (typeof nome !== 'string') continue;
        if (lugar !== 'path' && lugar !== 'query') continue;
        if (parametro['schema'] === undefined) continue;

        const convertido = paraJsonSchema(parametro['schema'], spec, new Set());
        if (!ehObjeto(convertido)) continue;

        const grupo = porLugar.get(lugar) ?? { propriedades: {}, exigidos: [] };
        grupo.propriedades[nome] = semAsPalavrasIsentas(parametro, convertido, operationId);
        if (lugar === 'path' || parametro['required'] === true) grupo.exigidos.push(nome);
        porLugar.set(lugar, grupo);

        const tipo = parametro['x-problem-type'];
        if (typeof tipo === 'string') tiposDeProblema.set(nome, tipo);
      }

      const montar = (lugar: 'path' | 'query'): Record<string, unknown> | undefined => {
        const grupo = porLugar.get(lugar);
        if (grupo === undefined) return undefined;
        return {
          type: 'object',
          properties: grupo.propriedades,
          ...(grupo.exigidos.length > 0 ? { required: grupo.exigidos } : {}),
        };
      };

      const resultado: EsquemasDeParametros = {
        params: montar('path'),
        querystring: montar('query'),
        tiposDeProblema,
      };
      cacheDeParametros.set(operationId, resultado);
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
