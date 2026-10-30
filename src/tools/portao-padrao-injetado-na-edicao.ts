/** Portao do `default` alcancavel no CORPO DA EDICAO. */
import { parse as parseYaml } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * As operacoes que servem uma MUDANCA PARCIAL por `POST`, e por isso contam como
 * edicao embora a varredura por metodo nao as alcance.
 */
const EDICOES_PARCIAIS_SERVIDAS_POR_POST: readonly string[] = ['changeAdminNetworkEventAccess'];

/** O INVENTARIO DA DIVIDA: as edicoes que hoje alcancam `default` no contrato. */
const PADRAO_INJETADO_ACEITO_HOJE: readonly string[] = [
  'updateNetworkEvent',
  'updateAdminNetworkEvent',
  'updateLostCase',
  'changeAdminNetworkEventAccess',
];

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Um `default` alcancado a partir do corpo de uma edicao. */
export interface PadraoAlcancado {
  readonly operationId: string;
  readonly metodo: string;
  readonly caminho: string;
  /**
   * O caminho ate o `default`, com os `$ref` atravessados: `A -> A/properties/x ->
   * B`.
   */
  readonly trilha: string;
  readonly valor: unknown;
}

export interface ResultadoDoPortao {
  readonly edicoesConferidas: number;
  readonly alcancados: readonly PadraoAlcancado[];
  readonly violacoes: readonly string[];
}

/** O esquema do corpo JSON da operacao, sem resolver `$ref` (a varredura resolve). */
function esquemaDoCorpo(operacao: Record<string, unknown>): Record<string, unknown> | undefined {
  const corpo = operacao['requestBody'];
  const conteudo = ehObjeto(corpo) ? corpo['content'] : undefined;
  const json = ehObjeto(conteudo) ? conteudo['application/json'] : undefined;
  const esquema = ehObjeto(json) ? json['schema'] : undefined;
  return ehObjeto(esquema) ? esquema : undefined;
}

/** Varre o esquema atras de `default`, resolvendo `$ref` transitivamente. */
function varrer(
  no: unknown,
  trilha: string,
  vistos: ReadonlySet<string>,
  resolver: (ref: string) => unknown,
  achados: { trilha: string; valor: unknown }[],
): void {
  if (Array.isArray(no)) {
    no.forEach((item, i) => varrer(item, `${trilha}/${String(i)}`, vistos, resolver, achados));
    return;
  }
  if (!ehObjeto(no)) return;

  const ref = no['$ref'];
  if (typeof ref === 'string') {
    if (vistos.has(ref)) return;
    const nome = ref.split('/').pop() ?? ref;
    const adiante = trilha === '' ? nome : `${trilha} -> ${nome}`;
    varrer(resolver(ref), adiante, new Set([...vistos, ref]), resolver, achados);
    return;
  }

  if ('default' in no) achados.push({ trilha, valor: no['default'] });
  for (const [chave, valor] of Object.entries(no)) {
    if (chave === 'default' || chave === 'example' || chave === 'examples') continue;
    varrer(valor, `${trilha}/${chave}`, vistos, resolver, achados);
  }
}

export function conferirPadraoInjetadoNaEdicao(textoDaSpec: string): ResultadoDoPortao {
  const spec = parseYaml(textoDaSpec) as unknown;
  if (!ehObjeto(spec) || !ehObjeto(spec['paths'])) {
    return { edicoesConferidas: 0, alcancados: [], violacoes: ['o contrato nao tem `paths`'] };
  }
  const raiz = spec;
  const resolver = (ref: string): unknown => {
    let alvo: unknown = raiz;
    for (const parte of ref.replace(/^#\//, '').split('/')) alvo = ehObjeto(alvo) ? alvo[parte] : undefined;
    return alvo;
  };

  const violacoes: string[] = [];
  const alcancados: PadraoAlcancado[] = [];
  const operacoesDoContrato = new Set<string>();
  let edicoes = 0;

  for (const [caminho, item] of Object.entries(spec['paths'])) {
    if (!ehObjeto(item)) continue;
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (!ehObjeto(operacao)) continue;
      const id = typeof operacao['operationId'] === 'string' ? operacao['operationId'] : `${metodo} ${caminho}`;
      operacoesDoContrato.add(id);

      const ehEdicao = metodo === 'patch' || EDICOES_PARCIAIS_SERVIDAS_POR_POST.includes(id);
      if (!ehEdicao) continue;
      const esquema = esquemaDoCorpo(operacao);
      if (esquema === undefined) continue;

      edicoes += 1;
      const achados: { trilha: string; valor: unknown }[] = [];
      const raizDaTrilha = typeof esquema['$ref'] === 'string' ? '' : `${id} (corpo em linha)`;
      varrer(esquema, raizDaTrilha, new Set(), resolver, achados);

      for (const achado of achados) {
        alcancados.push({ operationId: id, metodo, caminho, trilha: achado.trilha, valor: achado.valor });
      }
      if (achados.length > 0 && !PADRAO_INJETADO_ACEITO_HOJE.includes(id)) {
        for (const achado of achados) {
          violacoes.push(
            `${id} [${metodo.toUpperCase()} ${caminho}]: o corpo da edicao alcanca um default ` +
              `(${achado.trilha} = ${JSON.stringify(achado.valor)}). O Ajv do Fastify o ESCREVE no corpo recebido ` +
              `quando o campo falta, e a edicao passa a gravar o que ninguem mandou. Tire o default do schema da ` +
              `EDICAO (ele continua certo no da criacao), ou registre a divida em PADRAO_INJETADO_ACEITO_HOJE ` +
              `com o motivo.`,
          );
        }
      }
    }
  }

  const comPadrao = new Set(alcancados.map((a) => a.operationId));
  for (const id of PADRAO_INJETADO_ACEITO_HOJE) {
    if (!operacoesDoContrato.has(id)) {
      violacoes.push(`${id}: listado em PADRAO_INJETADO_ACEITO_HOJE e o contrato nao declara mais: tire a linha`);
    } else if (!comPadrao.has(id)) {
      violacoes.push(
        `${id}: listado em PADRAO_INJETADO_ACEITO_HOJE e o corpo da edicao nao alcanca mais nenhum default: ` +
          `tire a linha, a divida acabou`,
      );
    }
  }
  for (const id of EDICOES_PARCIAIS_SERVIDAS_POR_POST) {
    if (!operacoesDoContrato.has(id)) {
      violacoes.push(
        `${id}: listado em EDICOES_PARCIAIS_SERVIDAS_POR_POST e o contrato nao declara mais: tire a linha`,
      );
    }
  }

  if (edicoes === 0) {
    violacoes.push('nenhuma operacao de edicao com corpo JSON encontrada: o portao nao tem o que verificar');
  }
  return { edicoesConferidas: edicoes, alcancados, violacoes };
}
