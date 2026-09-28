/**
 * Portão da matriz de rastreabilidade (ADR-0027 item 18).
 *
 * Regra do cliente, 23/09/2026: tudo segue `api/openapi.yaml`, e backend, app,
 * backoffice e site usam os mesmos campos, valores e funcionalidades. A matriz
 * `api/rastreabilidade-backoffice-rede.yaml` liga cada tela dos protótipos à
 * operação que ela chama e a cada campo, filtro, valor de lista fechada e tipo
 * de problema que ela usa. Este portão lê a matriz e o contrato e reprova
 * quando os dois deixam de concordar.
 *
 * O que ele reprova:
 *
 * 1. operação de `situacao: contrato` cujo `operationId` não existe;
 * 2. referência (`req:`, `resp:`, `query:`, `path:`, `header:`, `problem:`,
 *    `enum:`) que não resolve, seguindo `$ref`, `allOf`, `oneOf`, `anyOf` e
 *    itens de lista;
 * 3. operação `pendente` sem `onde`;
 * 4. operação do contrato sob `/admin/` que não aparece nem em `telas` nem em
 *    `contrato_sem_tela`: operação nova que ninguém classificou;
 * 5. `operationId` de `contrato_sem_tela` que não existe;
 * 6. correspondência código → rótulo com código fora da lista fechada, ou
 *    `um_para_um: true` com valor da lista sem rótulo;
 * 7. **matriz sem nenhuma tela**, ou sem nenhuma referência resolvida: portão
 *    que não tem o que conferir reprova, nunca aprova.
 *
 * O que ele NÃO pega, dito por escrito: se a tela real (o código do app, do
 * painel ou do site) usa o que a matriz diz. A matriz é declaração; o que ela
 * garante é que a declaração e o contrato não divergem em silêncio. A ligação
 * entre a matriz e o código de cada ponta é o próximo passo, e é de cada
 * ponta.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

type Mapa = Record<string, unknown>;

function ehMapa(valor: unknown): valor is Mapa {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

/** Segue `$ref` locais até um schema concreto. Ciclo ou ref quebrada devolve `undefined`. */
function desreferenciar(spec: Mapa, valor: unknown): Mapa | undefined {
  let atual: unknown = valor;
  for (let passo = 0; passo < 32; passo++) {
    if (!ehMapa(atual)) return undefined;
    const ref = texto(atual['$ref']);
    if (ref === undefined) return atual;
    if (!ref.startsWith('#/')) return undefined;
    let alvo: unknown = spec;
    for (const parte of ref.slice(2).split('/')) {
      alvo = ehMapa(alvo) ? alvo[parte] : undefined;
    }
    atual = alvo;
  }
  return undefined;
}

/** O schema e todas as alternativas e composições dele, já desreferenciados. */
function variantes(spec: Mapa, schema: unknown, vistos = new Set<unknown>()): Mapa[] {
  const concreto = desreferenciar(spec, schema);
  if (concreto === undefined || vistos.has(concreto)) return [];
  vistos.add(concreto);
  const saida: Mapa[] = [concreto];
  for (const chave of ['allOf', 'oneOf', 'anyOf']) {
    for (const parte of lista(concreto[chave])) saida.push(...variantes(spec, parte, vistos));
  }
  return saida;
}

/** `a.b[].c` resolve dentro de `schema`? */
export function resolveCaminho(spec: Mapa, schema: unknown, caminho: string): boolean {
  let atuais: unknown[] = [schema];
  for (const bruto of caminho.split('.')) {
    const ehLista = bruto.endsWith('[]');
    const nome = ehLista ? bruto.slice(0, -2) : bruto;
    const proximos: unknown[] = [];
    for (const atual of atuais) {
      for (const v of variantes(spec, atual)) {
        const props = v['properties'];
        if (ehMapa(props) && props[nome] !== undefined) proximos.push(props[nome]);
      }
    }
    if (proximos.length === 0) return false;
    if (ehLista) {
      atuais = proximos.flatMap((p) => variantes(spec, p).map((v) => v['items']).filter((i) => i !== undefined));
      if (atuais.length === 0) return false;
    } else {
      atuais = proximos;
    }
  }
  return true;
}

interface OperacaoIndexada {
  readonly caminho: string;
  readonly operacao: Mapa;
  readonly parametros: readonly Mapa[];
}

function indexarOperacoes(spec: Mapa): Map<string, OperacaoIndexada> {
  const saida = new Map<string, OperacaoIndexada>();
  const paths = spec['paths'];
  if (!ehMapa(paths)) return saida;
  for (const [caminho, item] of Object.entries(paths)) {
    if (!ehMapa(item)) continue;
    const doCaminho = lista(item['parameters']);
    for (const [metodo, operacao] of Object.entries(item)) {
      if (metodo === 'parameters' || !ehMapa(operacao)) continue;
      const id = texto(operacao['operationId']);
      if (id === undefined) continue;
      const parametros = [...doCaminho, ...lista(operacao['parameters'])]
        .map((p) => desreferenciar(spec, p))
        .filter((p): p is Mapa => p !== undefined);
      saida.set(id, { caminho, operacao, parametros });
    }
  }
  return saida;
}

function schemaDoCorpo(spec: Mapa, operacao: Mapa): unknown {
  const corpo = desreferenciar(spec, operacao['requestBody']);
  const conteudo = corpo?.['content'];
  return ehMapa(conteudo) && ehMapa(conteudo['application/json']) ? conteudo['application/json']['schema'] : undefined;
}

function schemaDaResposta(spec: Mapa, operacao: Mapa): unknown {
  const respostas = operacao['responses'];
  if (!ehMapa(respostas)) return undefined;
  for (const codigo of ['200', '201']) {
    const resposta = desreferenciar(spec, respostas[codigo]);
    const conteudo = resposta?.['content'];
    if (ehMapa(conteudo) && ehMapa(conteudo['application/json'])) return conteudo['application/json']['schema'];
  }
  return undefined;
}

function valoresDoEnum(spec: Mapa, referencia: string): unknown[] | undefined {
  const partes = referencia.split('.');
  const nome = partes.shift();
  const schemas = ehMapa(spec['components']) ? spec['components']['schemas'] : undefined;
  if (nome === undefined || !ehMapa(schemas)) return undefined;
  let alvos: unknown[] = schemas[nome] === undefined ? [] : [schemas[nome]];
  for (const prop of partes) {
    alvos = alvos.flatMap((a) =>
      variantes(spec, a)
        .map((v) => (ehMapa(v['properties']) ? v['properties'][prop] : undefined))
        .filter((p) => p !== undefined),
    );
  }
  const valores: unknown[] = [];
  for (const alvo of alvos) {
    for (const v of variantes(spec, alvo)) {
      valores.push(...lista(v['enum']));
      for (const item of variantes(spec, v['items'])) valores.push(...lista(item['enum']));
    }
  }
  return alvos.length === 0 ? undefined : valores;
}

export interface Resultado {
  readonly achados: string[];
  readonly resolvidas: number;
  readonly pendentes: number;
  readonly telas: number;
}

export function inspecionar(spec: Mapa, matriz: Mapa): Resultado {
  const achados: string[] = [];
  const operacoes = indexarOperacoes(spec);
  const problemas = new Set(
    lista(spec['x-problem-types'])
      .map((p) => (ehMapa(p) ? texto(p['slug']) : undefined))
      .filter((s): s is string => s !== undefined),
  );
  const citadas = new Set<string>();
  let resolvidas = 0;
  let pendentes = 0;
  const telas = lista(matriz['telas']);

  for (const tela of telas) {
    if (!ehMapa(tela)) continue;
    const nomeDaTela = texto(tela['tela']) ?? '(sem nome)';
    for (const entrada of lista(tela['operacoes'])) {
      if (!ehMapa(entrada)) continue;
      const id = texto(entrada['operationId']);
      if (id === undefined) {
        achados.push(`${nomeDaTela}: operação sem operationId`);
        continue;
      }
      citadas.add(id);
      if (entrada['situacao'] === 'pendente') {
        pendentes++;
        if (texto(entrada['onde']) === undefined) achados.push(`${id} (${nomeDaTela}): pendente sem \`onde\``);
        continue;
      }
      const indexada = operacoes.get(id);
      if (indexada === undefined) {
        achados.push(`${id} (${nomeDaTela}): operationId não existe no contrato`);
        continue;
      }
      const corpo = schemaDoCorpo(spec, indexada.operacao);
      const resposta = schemaDaResposta(spec, indexada.operacao);
      for (const bruta of lista(entrada['usa'])) {
        const ref = texto(bruta);
        if (ref === undefined) continue;
        const separador = ref.indexOf(':');
        const tipo = ref.slice(0, separador);
        const valor = ref.slice(separador + 1);
        let ok = false;
        if (tipo === 'req') ok = corpo !== undefined && resolveCaminho(spec, corpo, valor);
        else if (tipo === 'resp') ok = resposta !== undefined && resolveCaminho(spec, resposta, valor);
        else if (tipo === 'query' || tipo === 'path' || tipo === 'header')
          ok = indexada.parametros.some((p) => p['in'] === tipo && p['name'] === valor);
        else if (tipo === 'problem') ok = problemas.has(valor);
        else if (tipo === 'enum') {
          const ponto = valor.lastIndexOf('.');
          ok = valoresDoEnum(spec, valor.slice(0, ponto))?.includes(valor.slice(ponto + 1)) ?? false;
        }
        if (ok) resolvidas++;
        else achados.push(`${id} (${nomeDaTela}): não resolve \`${ref}\``);
      }
    }
  }

  for (const item of lista(matriz['contrato_sem_tela'])) {
    if (!ehMapa(item)) continue;
    const id = texto(item['operationId']);
    if (id === undefined) continue;
    citadas.add(id);
    if (item['situacao'] === 'pendente') {
      pendentes++;
      if (texto(item['onde']) === undefined) achados.push(`contrato_sem_tela: ${id} pendente sem \`onde\``);
      continue;
    }
    if (!operacoes.has(id)) achados.push(`contrato_sem_tela: ${id} não existe no contrato`);
  }

  for (const [id, { caminho }] of operacoes) {
    if (caminho.startsWith('/admin/') && !citadas.has(id)) {
      achados.push(`${id} (${caminho}): operação administrativa fora da matriz; classifique em \`telas\` ou em \`contrato_sem_tela\``);
    }
  }

  const correspondencias = matriz['correspondencias'];
  if (ehMapa(correspondencias)) {
    for (const [nome, corr] of Object.entries(correspondencias)) {
      if (!ehMapa(corr)) continue;
      if (corr['situacao'] === 'pendente') {
        if (texto(corr['onde']) === undefined) achados.push(`correspondencias.${nome}: pendente sem \`onde\``);
        continue;
      }
      const enumerados = valoresDoEnum(spec, nome);
      if (enumerados === undefined) {
        achados.push(`correspondencias.${nome}: schema não existe no contrato`);
        continue;
      }
      const rotulados = ehMapa(corr['valores']) ? Object.keys(corr['valores']) : [];
      for (const codigo of rotulados) {
        if (!enumerados.includes(codigo)) achados.push(`correspondencias.${nome}: código \`${codigo}\` fora da lista fechada`);
      }
      if (corr['um_para_um'] === true) {
        for (const codigo of enumerados) {
          if (typeof codigo === 'string' && !rotulados.includes(codigo))
            achados.push(`correspondencias.${nome}: \`${codigo}\` está no contrato e não tem rótulo`);
        }
      }
    }
  }

  if (telas.length === 0) achados.push('a matriz não tem nenhuma tela: portão sem o que conferir reprova');
  else if (resolvidas === 0) achados.push('nenhuma referência resolvida: a leitura do contrato ou da matriz falhou');

  return { achados, resolvidas, pendentes, telas: telas.length };
}

export const MATRIZ = 'api/rastreabilidade-backoffice-rede.yaml';
export const CONTRATO = 'api/openapi.yaml';
export const ISCA = 'src/tools/iscas/rastreabilidade-deve-reprovar.yaml';

/** Os achados que a isca permanente PRECISA produzir. Se algum faltar, o portão ficou cego. */
export const ACHADOS_DA_ISCA: readonly string[] = [
  'operationId não existe no contrato',
  'não resolve `req:campo_que_nao_existe`',
  'pendente sem `onde`',
  'código `nao_existe` fora da lista fechada',
];

function ler(raiz: string, relativo: string): Mapa {
  const valor: unknown = parseYaml(readFileSync(join(raiz, relativo), 'utf8'));
  if (!ehMapa(valor)) throw new Error(`${relativo} não é um documento YAML de mapa`);
  return valor;
}

export function executar(raiz: string): number {
  let spec: Mapa;
  let matriz: Mapa;
  let isca: Mapa;
  try {
    spec = ler(raiz, CONTRATO);
    matriz = ler(raiz, MATRIZ);
    isca = ler(raiz, ISCA);
  } catch (erro) {
    console.error(`REPROVA: não consegui ler o que conferir: ${(erro as Error).message}`);
    return 1;
  }
  const daIsca = inspecionar(spec, isca);
  const faltando = ACHADOS_DA_ISCA.filter((esperado) => !daIsca.achados.some((a) => a.includes(esperado)));
  if (faltando.length > 0) {
    console.error(`REPROVA: a isca ${ISCA} deixou de reprovar por: ${faltando.join('; ')}. O portão ficou cego.`);
    return 1;
  }
  const resultado = inspecionar(spec, matriz);
  if (resultado.achados.length > 0) {
    console.error(`REPROVA: ${resultado.achados.length} divergência(s) entre ${MATRIZ} e ${CONTRATO}:`);
    for (const a of resultado.achados) console.error(`  - ${a}`);
    return 1;
  }
  console.info(
    `APROVADO: ${resultado.telas} telas, ${resultado.resolvidas} referências resolvidas, ` +
      `${resultado.pendentes} operações pendentes com \`onde\`; a isca reprovou pelos ${ACHADOS_DA_ISCA.length} motivos.`,
  );
  return 0;
}

const executadoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('portao-rastreabilidade.js');
if (executadoDiretamente) {
  process.exit(executar(process.argv[2] ?? process.cwd()));
}
