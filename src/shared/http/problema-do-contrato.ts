/**
 * O status e o `type` de um problema, lidos do CONTRATO, para os testes.
 *
 * Existe porque o esperado escrito à mão num teste é a segunda definição que o
 * contrato existe para não ter: na BICHUS-41 o código respondia 403 e o 410
 * contava o desfecho do caso, o contrato mudou para 401 e corpo fixo, e a suíte
 * continuou 1609/1609 porque cada teste comparava com a string que ele mesmo
 * escrevia. Lendo daqui, a mudança no contrato reprova o código que não a
 * acompanhou.
 *
 * Três fontes, conferidas entre si, e a divergência entre elas é falha ruidosa:
 *
 * - `components/responses/<Nome>`: o exemplo diz o `type` e o `status`;
 * - `x-problem-types`: o status único com que aquele `type` pode sair;
 * - `paths.<op>.responses`: a operação declara aquela resposta naquele status.
 */
import { carregarContrato, type Contrato } from './contract.js';

export interface ProblemaDeclarado {
  readonly nome: string;
  readonly status: number;
  /** O slug de `type`: o que vem depois da última barra da URI. */
  readonly slug: string;
  /** Os cabeçalhos que a resposta declara, pelo nome em minúsculas. */
  readonly cabecalhos: readonly string[];
}

type Mapa = Record<string, unknown>;

function mapa(valor: unknown, onde: string): Mapa {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`O contrato não tem um mapa em ${onde}: não há contra o que comparar.`);
  }
  return valor as Mapa;
}

let contratoCarregado: Contrato | undefined;

function contrato(): Contrato {
  contratoCarregado ??= carregarContrato('api/openapi.yaml');
  return contratoCarregado;
}

function statusDoTipo(slug: string): number {
  const lista = contrato().spec['x-problem-types'];
  if (!Array.isArray(lista)) throw new Error('O contrato não declara `x-problem-types`.');
  for (const item of lista as unknown[]) {
    const entrada = mapa(item, 'x-problem-types[]');
    if (entrada['slug'] === slug) return Number(entrada['status']);
  }
  throw new Error(`\`${slug}\` não está em \`x-problem-types\`.`);
}

/** A resposta `components/responses/<nome>`, com status e `type` conferidos entre as fontes. */
export function problemaDaResposta(nome: string): ProblemaDeclarado {
  const componentes = mapa(contrato().spec['components'], 'components');
  const resposta = mapa(mapa(componentes['responses'], 'components.responses')[nome], `responses.${nome}`);
  const conteudo = mapa(mapa(resposta['content'], `${nome}.content`)['application/problem+json'], `${nome} problem+json`);
  const exemplos = mapa(conteudo['examples'], `${nome}.examples`);
  const primeiro = mapa(mapa(Object.values(exemplos)[0], `${nome}.examples[0]`)['value'], `${nome} exemplo`);
  const tipo = primeiro['type'];
  if (typeof tipo !== 'string') throw new Error(`O exemplo de ${nome} não tem \`type\`.`);
  const slug = tipo.slice(tipo.lastIndexOf('/') + 1);
  const status = statusDoTipo(slug);
  if (Number(primeiro['status']) !== status) {
    throw new Error(
      `O exemplo de ${nome} diz status ${String(primeiro['status'])} e \`x-problem-types\` diz ` +
        `${String(status)} para \`${slug}\`. O contrato diverge dele mesmo.`,
    );
  }
  const cabecalhos = Object.keys(
    resposta['headers'] === undefined ? {} : mapa(resposta['headers'], `${nome}.headers`),
  ).map((c) => c.toLowerCase());
  return { nome, status, slug, cabecalhos };
}

/**
 * O nome da resposta que a operação declara naquele status, quando ela é um
 * `$ref` a `components/responses`. `undefined` quando a resposta é escrita na
 * própria operação.
 */
export function respostaDeclarada(operationId: string, status: number): string | undefined {
  const operacao = contrato().operacoes.get(operationId);
  if (operacao === undefined) throw new Error(`Operação fora do contrato: ${operationId}`);
  const respostas = mapa(operacao.raw['responses'], `${operationId}.responses`);
  const resposta = respostas[String(status)];
  if (resposta === undefined) {
    throw new Error(`${operationId} não declara ${String(status)} no contrato.`);
  }
  const ref = mapa(resposta, `${operationId}.responses.${String(status)}`)['$ref'];
  return typeof ref === 'string' ? ref.slice(ref.lastIndexOf('/') + 1) : undefined;
}
