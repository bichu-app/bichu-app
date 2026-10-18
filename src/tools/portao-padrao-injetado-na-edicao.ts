/**
 * Portao do padrao injetado na edicao.
 *
 * ## O defeito que ele fecha
 *
 * O Fastify monta o Ajv com `useDefaults: true`, e o Ajv **escreve no corpo
 * recebido** o `default` de todo campo ausente. Num corpo de CRIACAO isso e o
 * certo: o registro tem de nascer com valor. Num corpo de EDICAO PARCIAL e o
 * contrario do que a operacao promete, e silencioso nas duas pontas:
 *
 * 1. **a edicao reescreve o que ninguem mandou**: quem aceitava so porte `P` e
 *    corrige o titulo sai aceitando os quatro, com `200` e sem aviso;
 * 2. **a trilha mente**: toda trilha que tira os nomes dos campos de
 *    `Object.keys(corpo)` passa a nomear campo que o autor nao tocou.
 *
 * Foi MEDIDO em 17/10/2026 em `CommunityNetworkEventPatch`: um `PATCH` com
 * `title` e `notes` chegou ao manipulador com `accepted_sizes: [P,M,G,GG]` e
 * `dog_age: 'any'` por cima. O conserto daquela rota mora em
 * `network-routes.ts` (`semPadroes`), e vale so onde esta instalado -- nada
 * impedia o proximo `*Patch` a `$ref`ar uma forma de criacao com `default` de
 * reintroduzir o defeito, em qualquer modulo, sem nenhum teste reprovar.
 *
 * E isso que este portao fecha: ele le `api/openapi.yaml`, resolve os `$ref`
 * **transitivamente** a partir do corpo de cada edicao e acusa todo `default`
 * alcancado, dizendo o CAMINHO ate ele (`AdminNetworkEventPatch ->
 * .../accepted_sizes -> NetworkEventAcceptedSizes`), porque quem reprovar
 * precisa saber onde mexer. O contrato nao muda: o `default` esta certo onde
 * nasceu, no schema da criacao.
 *
 * ## O que e "edicao"
 *
 * A varredura e pelas OPERACOES `patch` do contrato, e nao por nome de schema
 * terminando em `Patch`: o que importa e o corpo que o Ajv valida, e um
 * `*Input` usado como corpo de `PATCH` conta igual -- e um existe hoje
 * (`updateLostCase` reusa `LostCaseInput`).
 *
 * Metodo nao e tudo: ha corpo de MUDANCA PARCIAL servido por `POST`, que o
 * `patch` da varredura nao alcanca. Esses entram a mao, em
 * `EDICOES_PARCIAIS_SERVIDAS_POR_POST`, uma linha por operacao.
 *
 * ## Deliberadamente conservador
 *
 * Ele acusa `default` alcancavel, e nao `default` que o Ajv comprovadamente
 * escreve: dentro de `oneOf`/`anyOf` o Ajv nao aplica o padrao de forma
 * confiavel, e mesmo assim o portao acusa. Um `default` num corpo de edicao nao
 * tem o que fazer ali de qualquer jeito, e a alternativa -- adivinhar o que
 * aquela versao do Ajv faz -- e o tipo de precisao que envelhece calada.
 * `example` e `examples` ficam de fora: exemplo nao e injetado.
 *
 * **Nao achar alvo reprova**: com zero edicoes conferidas o portao nao
 * verificou nada, e diz isso.
 */
import { parse as parseYaml } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * As operacoes que servem uma MUDANCA PARCIAL por `POST`, e por isso contam
 * como edicao embora a varredura por metodo nao as alcance.
 *
 * `changeAdminNetworkEventAccess` recebe `AdminNetworkEventAccessChange`, um
 * corpo cujos dois campos sao opcionais a ponto de a propria aplicacao recusar
 * com `nothing_to_change` quando os dois faltam
 * (`rede-administrativa.ts`, `mudarAcesso`). E uma edicao parcial escrita como
 * `POST`, e o padrao injetado ali tem a consequencia mais cara do contrato:
 * `visibility` nunca chega indefinida, o `nothing_to_change` nao dispara pelo
 * lado da visibilidade, e quem muda so a `admission` de um encontro PRIVADO o
 * torna PUBLICO sem pedir.
 *
 * A lista e EXATA nos dois sentidos: operationId daqui que o contrato nao
 * declara mais reprova.
 */
const EDICOES_PARCIAIS_SERVIDAS_POR_POST: readonly string[] = ['changeAdminNetworkEventAccess'];

/**
 * O INVENTARIO DA DIVIDA: as edicoes que hoje alcancam `default` no contrato.
 *
 * Isto nao e uma dispensa. Cada linha e uma operacao em que o Ajv escreve no
 * corpo campo que o autor da requisicao nao mandou, e o motivo de ela estar
 * aqui e um so: o conserto e decisao de arquitetura (ou `useDefaults: false`
 * em `criarServidor`, que muda TODA rota de uma vez, ou o `semPadroes` da Rede
 * promovido a `src/shared/http/` e aplicado nos corpos de edicao), e essa
 * decisao tem o PR dela.
 *
 * A lista e EXATA nos dois sentidos, e e ela que torna o portao verificavel:
 * edicao nova que alcance `default` e fique fora daqui REPROVA -- e e esse o
 * buraco que este portao fecha; linha daqui cujo `default` sumiu do contrato
 * reprova tambem, para a lista nao virar um passe antigo. Quem conserta uma
 * delas tira a linha no mesmo commit.
 */
const PADRAO_INJETADO_ACEITO_HOJE: readonly string[] = [
  // Medido em 17/10/2026. O conserto do manipulador ja existe
  // (`semPadroes`, em `network-routes.ts`), mas e local: o contrato continua
  // alcancando `default` e por isso a linha fica.
  'updateNetworkEvent',
  // O mesmo corpo, do lado administrativo, SEM o conserto do manipulador.
  'updateAdminNetworkEvent',
  // `LostCaseInput` usado como corpo de `PATCH`: `share_to_public_list` tem
  // `default: true`, e o repositorio so preserva o valor gravado quando o campo
  // chega INDEFINIDO. Com o padrao injetado ele nunca chega, e a edicao
  // devolve a lista publica o caso que o tutor tinha tirado dela.
  'updateLostCase',
  // Edicao parcial servida por `POST` (ver a lista acima).
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
  /** O caminho ate o `default`, com os `$ref` atravessados: `A -> A/properties/x -> B`. */
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

/**
 * Varre o esquema atras de `default`, resolvendo `$ref` transitivamente.
 *
 * `vistos` guarda os `$ref` JA ATRAVESSADOS NESTE RAMO, e nao os de todo o
 * contrato: schema reusado por dois campos tem de ser acusado nos dois, com a
 * trilha de cada um. O que ele impede e o laco (`A` -> `B` -> `A`).
 */
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
    // Raiz que ja e um `$ref` comeca a trilha com o nome do schema, e nao com
    // uma seta solta: `AdminStoreItemPatch/...`, e nao ` -> AdminStoreItemPatch/...`.
    const adiante = trilha === '' ? nome : `${trilha} -> ${nome}`;
    varrer(resolver(ref), adiante, new Set([...vistos, ref]), resolver, achados);
    return;
  }

  if ('default' in no) achados.push({ trilha, valor: no['default'] });
  for (const [chave, valor] of Object.entries(no)) {
    // `default` ja foi contado; exemplo nao e injetado no corpo.
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
      // Corpo em linha nomeia a operacao; corpo por `$ref` comeca vazio e a
      // varredura poe o nome do schema ao atravessar o primeiro `$ref`.
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
