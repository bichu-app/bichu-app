/**
 * Portao do `default` alcancavel no CORPO DA EDICAO.
 *
 * ## O que ele cobra
 *
 * Recebe o contrato como TEXTO (`api/openapi.yaml`; quem abre o arquivo e o
 * autoteste ao lado -- este modulo e funcao pura e nao tem linha de comando nem
 * alvo de `make`) e, para cada operacao de EDICAO, resolve os `$ref`
 * TRANSITIVAMENTE a partir do corpo `application/json` e acusa todo `default`
 * alcancado, dizendo o CAMINHO ate ele (`AdminNetworkEventPatch ->
 * .../accepted_sizes -> NetworkEventAcceptedSizes`), porque quem reprova
 * precisa saber onde mexer.
 *
 * "Edicao" e a OPERACAO `patch`, e nao o nome do schema terminando em `Patch`:
 * o que importa e o corpo que o Ajv valida, e um `*Input` de criacao usado como
 * corpo de `PATCH` conta igual -- `updateLostCase` reusa `LostCaseInput`. Corpo
 * de mudanca PARCIAL servido por `POST` o metodo nao alcanca, e entra a mao em
 * `EDICOES_PARCIAIS_SERVIDAS_POR_POST`. Em 18/10/2026 isso da 12 edicoes
 * conferidas (11 `patch` com corpo JSON + 1 `POST` da lista).
 *
 * O criterio nao e "o Ajv comprovadamente escreve este default", e sim "este
 * default e ALCANCAVEL do corpo": dentro de `oneOf`/`anyOf` o Ajv nao aplica o
 * padrao de forma confiavel, e mesmo assim o portao acusa. Um `default` em
 * corpo de edicao nao tem o que fazer ali de qualquer jeito, e a alternativa --
 * adivinhar o que aquela versao do Ajv faz -- e o tipo de precisao que
 * envelhece calada. `example` e `examples` ficam de fora: exemplo nao e
 * injetado.
 *
 * Alcancar `default` so REPROVA quando a operacao nao esta em
 * `PADRAO_INJETADO_ACEITO_HOJE`, o inventario das 4 dividas medidas (a nota
 * dela diz por que a lista e exata nos dois sentidos). E **nao achar alvo
 * reprova tambem**: com zero edicoes conferidas o portao nao verificou nada, e
 * diz isso.
 *
 * ## Por que ele existe
 *
 * O tutor tirava o pet da lista publica, editava a descricao do caso, e a
 * edicao devolvia o pet para a lista -- com `200` e sem aviso.
 *
 * O mecanismo: `share_to_public_list` tem `default: true` em `LostCaseInput`,
 * `LostCaseInput` e tambem o corpo do `PATCH`, o Ajv que o Fastify monta com
 * `useDefaults: true` (como `criarServidor` o monta em 18/10/2026) ESCREVE no
 * corpo recebido o `default` de todo campo ausente, e o `COALESCE` do
 * repositorio -- que so preserva o valor gravado quando o campo chega
 * INDEFINIDO -- nunca era alcancado. O mesmo mecanismo custou outros dois
 * defeitos medidos em 17/10/2026 na Rede: quem aceitava so porte `P` e corrigia
 * o titulo saia aceitando os quatro (`CommunityNetworkEventPatch` entregou
 * `accepted_sizes: [P,M,G,GG]` e `dog_age: 'any'` por cima), e toda trilha que
 * tira os nomes dos campos de `Object.keys(corpo)` passa a nomear campo que o
 * autor nao tocou.
 *
 * O remedio por rota existe e e compartilhado (`corpoSemPadroes`, em
 * `src/shared/http/sem-padroes.ts`), mas vale so onde esta instalado: nada
 * impedia o proximo `*Patch` a `$ref`ar uma forma de criacao com `default` de
 * reintroduzir o defeito, em qualquer modulo, sem nenhum teste reprovar. E esse
 * buraco que este portao fecha. O contrato nao muda: o `default` esta certo
 * onde nasceu, no schema da criacao.
 *
 * ## O que ele NAO cobre, dito por escrito
 *
 * 1. **parametro nenhum.** Ele le `requestBody`, e nao `query`, `path` ou
 *    header. Medido em 18/10/2026: ha 46 `default` alcancaveis em `query`
 *    (`page`, `limit`, `sort`...) que este portao nao ve, e o Ajv os injeta
 *    igual. O que torna isso tolerado numa listagem e o caso de uso, nao este
 *    arquivo.
 * 2. **`PUT` nao conta como edicao**, por ser substituicao. Dos 4 `PUT` com
 *    corpo JSON de 18/10/2026 nenhum alcanca `default`, mas edicao PARCIAL
 *    escrita como `PUT` passaria batida -- o remedio seria a mesma lista a mao
 *    usada para o `POST`.
 * 3. **so `application/json`.** Outra midia de corpo nao e varrida; em
 *    18/10/2026 o contrato nao declara nenhuma.
 * 4. **o inventario perdoa por OPERACAO, nao por campo.** `default` NOVO dentro
 *    de um corpo ja inventariado nao gera violacao aqui. Para duas das quatro
 *    linhas (`updateLostCase`, `updateNetworkEvent`) o autoteste prende a trilha
 *    exata e reprova no lugar do portao; para `updateAdminNetworkEvent` e
 *    `changeAdminNetworkEventAccess` ele prende so o CONJUNTO de operacoes, e
 *    um campo novo com `default` entra calado nessas duas.
 * 5. **o comportamento do Ajv.** Tudo aqui e leitura de contrato: o portao nao
 *    sobe servidor nem faz requisicao. Que o manipulador receba so o que veio e
 *    medido pelo fio em `a-edicao-nao-republica-o-caso.test.ts` (lostfound).
 *
 * ## Como ver ele reprovar
 *
 * Este arquivo nao tem chave de desligar, e nao precisa de uma: o autoteste ao
 * lado tem uma ISCA por regra, e cada isca e o contrato real com UMA alteracao
 * feita sobre COPIA em memoria (`api/openapi.yaml` nunca e tocado). Para ver a
 * reprovacao central na mao, ponha `default: 0` em
 * `AdminStoreItemPatch.properties.sort_order` no contrato, rode `npm test`, e
 * desfaca.
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
 * aqui e um so: o conserto que FALTA e decisao de arquitetura, e essa decisao
 * tem o PR dela. O remedio por rota ja existe e ja e compartilhado --
 * `corpoSemPadroes`, em `src/shared/http/sem-padroes.ts` (18/10/2026),
 * aplicado em `network-routes.ts` e em `lost-case-routes.ts`. O que esta em
 * aberto e aplica-lo nos corpos de edicao que faltam, ou desligar o
 * `useDefaults` em `criarServidor`, que muda TODA rota de uma vez.
 *
 * A lista e EXATA nos dois sentidos, e e ela que torna o portao verificavel:
 * edicao nova que alcance `default` e fique fora daqui REPROVA -- e e esse o
 * buraco que este portao fecha; linha daqui cujo `default` sumiu do contrato
 * reprova tambem, para a lista nao virar um passe antigo. Quem conserta uma
 * delas tira a linha no mesmo commit.
 */
const PADRAO_INJETADO_ACEITO_HOJE: readonly string[] = [
  // Medido em 17/10/2026. O conserto do manipulador ja existe
  // (`corpoSemPadroes`, chamado em `network-routes.ts`), mas e local: o
  // contrato continua alcancando `default` e por isso a linha fica.
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
