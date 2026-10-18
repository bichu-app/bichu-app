/**
 * Portao do `default` do contrato.
 *
 * ## O que mudou, e por que este portao existe
 *
 * Ate 18/10/2026 o Fastify montava o Ajv com `useDefaults: true`, e o Ajv
 * ESCREVIA no que chegou -- corpo, query e parametro -- o `default` de todo
 * campo que faltou. Numa criacao isso passava por inofensivo; numa EDICAO
 * PARCIAL era o contrario do que a operacao promete, e custou tres defeitos
 * silenciosos medidos em 17/10 (o pior deles devolvendo a lista publica um
 * caso de pet perdido que o tutor tinha tirado dela).
 *
 * `criarServidor` passa `ajv: { customOptions: { useDefaults: false } }`. A
 * partir dai **o `default` do contrato e DOCUMENTACAO**: ele diz ao app, ao
 * backoffice, ao site e a quem le a spec o que acontece quando o campo nao vem,
 * e quem faz acontecer e o codigo.
 *
 * Isso fecha um defeito e abre a porta do defeito oposto, que e igualmente
 * silencioso: um `default` novo no contrato cujo caso de uso NAO supre o
 * valor. O campo chega `undefined`, e o que se grava e `null`, `NaN` ou nada.
 *
 * E isso que este portao impede. Ele le `api/openapi.yaml`, resolve os `$ref`
 * TRANSITIVAMENTE a partir de todo corpo de requisicao e de todo parametro, e
 * exige que cada `default` alcancado esteja no inventario abaixo -- com o
 * ARQUIVO que supre o valor e um TRECHO que ele tem de conter. O portao abre
 * o arquivo e confere o trecho: tirar o `?? TAMANHO_PADRAO` de uma listagem
 * reprova aqui, e nao em producao.
 *
 * A mensagem de reprovacao diz o caminho ate o `default`
 * (`AdminNetworkEventPatch/properties/accepted_sizes ->
 * NetworkEventAcceptedSizes`), porque quem reprovar precisa saber onde mexer.
 *
 * ## Por operacao, e nao por nome de schema
 *
 * A varredura e pelas OPERACOES do contrato: o que importa e o que o Ajv
 * valida. Um `*Input` de criacao usado como corpo de `PATCH` conta como
 * edicao (`updateLostCase` reusa `LostCaseInput`), e um corpo de mudanca
 * parcial servido por `POST` tambem
 * (`EDICOES_PARCIAIS_SERVIDAS_POR_POST`).
 *
 * ## Deliberadamente conservador
 *
 * Ele acusa `default` **alcancavel**, e nao `default` que o Ajv escreveria:
 * dentro de `oneOf`/`anyOf` o Ajv nunca aplicou o padrao de forma confiavel, e
 * mesmo assim o portao cobra a linha do inventario. Adivinhar o que aquela
 * versao do Ajv faz e o tipo de precisao que envelhece calada. `example` e
 * `examples` ficam de fora: exemplo nunca foi injetado.
 *
 * **Nao achar alvo reprova**: com zero `default` alcancado o portao nao
 * verificou nada, e diz isso.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * As operacoes que servem uma MUDANCA PARCIAL por `POST`, e por isso contam
 * como edicao embora a varredura por metodo nao as alcance.
 *
 * `changeAdminNetworkEventAccess` recebe `AdminNetworkEventAccessChange`, um
 * corpo cujos dois campos sao opcionais a ponto de a propria aplicacao recusar
 * com `nothing_to_change` quando os dois faltam (`rede-administrativa.ts`,
 * `mudarAcesso`). Era ali que o padrao injetado tinha a consequencia mais cara
 * do contrato: `visibility` nunca chegava indefinida, o `nothing_to_change`
 * nao disparava pelo lado da visibilidade, e quem mudava so a `admission` de
 * um encontro PRIVADO o tornava PUBLICO sem pedir.
 *
 * A lista e EXATA nos dois sentidos: operationId daqui que o contrato nao
 * declara mais reprova.
 */
const EDICOES_PARCIAIS_SERVIDAS_POR_POST: readonly string[] = ['changeAdminNetworkEventAccess'];

/**
 * Uma linha do inventario: um `default` do contrato e onde o codigo o supre.
 *
 * `onde` e `null` quando NAO HA o que suprir, e `porque` diz qual dos dois
 * motivos e: ou o campo e de uma EDICAO -- e ali ausente quer dizer "nao
 * mexa", que e justamente o que o `useDefaults: false` devolveu -- ou nada no
 * codigo le aquele campo.
 */
interface PadraoDoContrato {
  readonly operationId: string;
  /** O caminho ate o `default`, exatamente como a varredura o imprime. */
  readonly trilha: string;
  /** O arquivo que supre o valor, relativo a `src/`. */
  readonly onde: string | null;
  /** Um trecho que `onde` tem de conter. So quando `onde` nao e `null`. */
  readonly exige?: string;
  /** Por que nao ha o que suprir. So quando `onde` e `null`. */
  readonly porque?: string;
}

/**
 * O INVENTARIO: todo `default` alcancavel do contrato, e quem o supre.
 *
 * MEDIDO em 18/10/2026, campo a campo, antes de `useDefaults` ser desligado --
 * e e essa medicao que tornou o desligamento seguro: dos 66 `default`
 * alcancaveis, NENHUM era carregante. Ou o caso de uso ja escrevia o mesmo
 * valor, ou ninguem lia o campo.
 *
 * A lista e EXATA nos dois sentidos, e e ela que torna o portao verificavel:
 * `default` novo no contrato e fora daqui REPROVA -- e e esse o defeito oposto
 * que este portao existe para impedir; linha daqui cujo `default` sumiu do
 * contrato reprova tambem, para o inventario nao virar um passe antigo. Quem
 * acrescenta um `default` escreve o padrao no codigo e a linha aqui, no mesmo
 * commit.
 */
const INVENTARIO: readonly PadraoDoContrato[] = [
  // --- Identidade ---
  {
    operationId: 'registerUser',
    trilha: 'RegisterRequest/properties/stay_signed_in -> StaySignedIn',
    onde: null,
    porque: 'o manipulador do cadastro nao le o campo: a sessao nasce sempre sem "continuar conectado"',
  },
  {
    operationId: 'login',
    trilha: 'LoginRequest/properties/stay_signed_in -> StaySignedIn',
    onde: 'modules/identity/adapters/http/routes.ts',
    exige: 'staySignedIn: corpo.stay_signed_in === true',
  },

  // --- Midia ---
  {
    operationId: 'confirmPetPhoto',
    trilha: 'confirmPetPhoto (corpo em linha)/properties/set_as_primary',
    onde: 'modules/media/adapters/http/media-routes.ts',
    exige: 'corpo.set_as_primary ?? true',
  },

  // --- Achados ---
  {
    operationId: 'listMyFoundReports',
    trilha: 'limit',
    onde: 'modules/found/application/found-report-service.ts',
    // O manipulador passa `Number.NaN` quando o parametro nao vem, e e aqui
    // que o NaN vira o padrao de 20.
    exige: 'if (pedido === undefined || !Number.isInteger(pedido) || pedido < 1) return LIMITE_PADRAO_DA_PAGINA;',
  },

  // --- Conversas ---
  {
    operationId: 'getFinderConversation',
    trilha: 'limit',
    onde: 'modules/messaging/domain/paginacao.ts',
    exige: 'if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO;',
  },
  {
    operationId: 'listConversations',
    trilha: 'limit',
    onde: 'modules/messaging/domain/paginacao.ts',
    exige: 'if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO;',
  },
  {
    operationId: 'getConversation',
    trilha: 'limit',
    onde: 'modules/messaging/domain/paginacao.ts',
    exige: 'if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO;',
  },

  // --- Caso de perdido ---
  {
    operationId: 'openLostCase',
    trilha: 'LostCaseInput/properties/share_to_public_list',
    onde: 'modules/lostfound/application/lost-case-service.ts',
    exige: 'shareToPublicList: entrada.shareToPublicList ?? true',
  },
  {
    operationId: 'updateLostCase',
    trilha: 'LostCaseInput/properties/share_to_public_list',
    onde: null,
    porque:
      'EDICAO: ausente quer dizer "nao mexa", e o repositorio so preserva o valor gravado quando o campo chega ' +
      'indefinido. Era exatamente isto que o padrao injetado quebrava -- editar a descricao devolvia o caso a ' +
      'lista publica -- e e isto que `useDefaults: false` devolveu',
  },
  {
    operationId: 'listLostCaseCandidates',
    trilha: 'limit',
    onde: 'modules/lostfound/domain/paginacao-de-candidatos.ts',
    exige: 'if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO_DE_CANDIDATOS;',
  },
  {
    operationId: 'listPublicLostPets',
    trilha: 'period',
    onde: null,
    porque: 'a operacao nao tem rota nenhuma (divida declarada em `rotas-registradas-contra-o-contrato.test.ts`)',
  },
  {
    operationId: 'listPublicLostPets',
    trilha: 'page',
    onde: null,
    porque: 'a operacao nao tem rota nenhuma (divida declarada em `rotas-registradas-contra-o-contrato.test.ts`)',
  },
  {
    operationId: 'listPublicLostPets',
    trilha: 'limit',
    onde: null,
    porque: 'a operacao nao tem rota nenhuma (divida declarada em `rotas-registradas-contra-o-contrato.test.ts`)',
  },

  // --- Diretorio ---
  {
    operationId: 'listDirectoryEntries',
    trilha: 'sort',
    onde: 'modules/professionals/adapters/http/directory-routes.ts',
    exige: 'const sort = query.sort ?? ORDEM_PADRAO;',
  },
  {
    operationId: 'listDirectoryEntries',
    trilha: 'page',
    onde: 'modules/professionals/adapters/http/directory-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listDirectoryEntries',
    trilha: 'limit',
    onde: 'modules/professionals/adapters/http/directory-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },
  {
    operationId: 'listAdminDirectoryEntries',
    trilha: 'sort',
    onde: 'modules/professionals/adapters/http/admin-directory-routes.ts',
    exige: 'sort: query.sort ?? ORDEM_PADRAO,',
  },
  {
    operationId: 'listAdminDirectoryEntries',
    trilha: 'page',
    onde: 'modules/professionals/adapters/http/admin-directory-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminDirectoryEntries',
    trilha: 'limit',
    onde: 'modules/professionals/adapters/http/admin-directory-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },

  // --- Loja ---
  {
    operationId: 'listStoreItems',
    trilha: 'sort',
    onde: 'modules/store/adapters/http/store-routes.ts',
    exige: 'const sort = query.sort ?? ORDEM_PADRAO;',
  },
  {
    operationId: 'listStoreItems',
    trilha: 'page',
    onde: 'modules/store/adapters/http/store-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listStoreItems',
    trilha: 'limit',
    onde: 'modules/store/adapters/http/store-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },
  {
    operationId: 'listAdminStorePartners',
    trilha: 'page',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminStorePartners',
    trilha: 'limit',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },
  {
    operationId: 'listAdminStoreTags',
    trilha: 'page',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminStoreTags',
    trilha: 'limit',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },
  {
    operationId: 'listAdminStoreItems',
    trilha: 'sort',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'sort: query.sort ?? ORDEM_PADRAO,',
  },
  {
    operationId: 'listAdminStoreItems',
    trilha: 'page',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminStoreItems',
    trilha: 'limit',
    onde: 'modules/store/adapters/http/admin-store-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },
  {
    operationId: 'createAdminStorePartner',
    trilha: 'AdminStorePartnerInput/properties/sort_order',
    onde: 'modules/store/application/catalogo-administrativo.ts',
    exige: 'sortOrder: corpo.sort_order ?? 0,',
  },
  {
    operationId: 'createAdminStoreItem',
    trilha: 'AdminStoreItemInput/properties/sort_order',
    onde: 'modules/store/application/catalogo-administrativo.ts',
    exige: 'sortOrder: corpo.sort_order ?? 0,',
  },

  // --- Plaquinha ---
  {
    operationId: 'listAdminCollarTagRequests',
    trilha: 'page',
    onde: 'modules/tags/adapters/http/admin-pedido-de-plaquinha-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listAdminCollarTagRequests',
    trilha: 'limit',
    onde: 'modules/tags/adapters/http/admin-pedido-de-plaquinha-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },

  // --- Rede: agenda ---
  {
    operationId: 'listNetworkEvents',
    trilha: 'when -> NetworkEventWhen',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const when = query.when ?? RECORTE_PADRAO;',
  },
  {
    operationId: 'listNetworkEvents',
    trilha: 'page',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listNetworkEvents',
    trilha: 'limit',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },
  {
    operationId: 'listNearbyNetworkEvents',
    trilha: 'when -> NetworkEventWhen',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const when = query.when ?? RECORTE_PADRAO;',
  },
  {
    operationId: 'listNearbyNetworkEvents',
    trilha: 'sort -> NetworkEventNearbySort',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: "const pedida = query.sort === 'proximos' ? 'proximos' : 'distancia';",
  },
  {
    operationId: 'listNearbyNetworkEvents',
    trilha: 'page',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listNearbyNetworkEvents',
    trilha: 'limit',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },
  {
    operationId: 'listMyNetworkEventJoinRequests',
    trilha: 'sort',
    onde: null,
    porque:
      'o manipulador nao le `query.sort`: a fila de pedidos sai sempre em `proximos`, e a resposta diz isso em ' +
      '`effective_sort`',
  },
  {
    operationId: 'listMyNetworkEventJoinRequests',
    trilha: 'page',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const page = query.page ?? PAGINA_INICIAL;',
  },
  {
    operationId: 'listMyNetworkEventJoinRequests',
    trilha: 'limit',
    onde: 'modules/network/adapters/http/network-routes.ts',
    exige: 'const limit = query.limit ?? TAMANHO_PADRAO;',
  },

  // --- Rede: encontro do app ---
  {
    operationId: 'createNetworkEvent',
    trilha: 'CommunityNetworkEventInput/properties/time_zone',
    onde: 'modules/network/application/encontro-da-comunidade.ts',
    exige: 'const timeZone = corpo.time_zone ?? FUSO_PADRAO;',
  },
  {
    operationId: 'createNetworkEvent',
    trilha: 'CommunityNetworkEventInput/properties/accepted_sizes -> NetworkEventAcceptedSizes',
    onde: 'modules/network/application/encontro-da-comunidade.ts',
    exige: 'portes: corpo.accepted_sizes ?? PORTES,',
  },
  {
    operationId: 'createNetworkEvent',
    trilha: 'CommunityNetworkEventInput/properties/dog_age -> NetworkEventDogAge',
    onde: 'modules/network/application/encontro-da-comunidade.ts',
    exige: "idadeDosCaes: corpo.dog_age ?? 'any',",
  },
  {
    operationId: 'createNetworkEvent',
    trilha: 'CommunityNetworkEventInput/properties/vaccination_required',
    onde: 'modules/network/application/encontro-da-comunidade.ts',
    exige: 'vacinacaoExigida: corpo.vaccination_required ?? true,',
  },
  {
    operationId: 'createNetworkEvent',
    trilha: 'CommunityNetworkEventInput/properties/fenced_off_leash_area',
    onde: 'modules/network/application/encontro-da-comunidade.ts',
    exige: 'areaCercada: corpo.fenced_off_leash_area ?? false,',
  },
  {
    operationId: 'updateNetworkEvent',
    trilha: 'CommunityNetworkEventPatch/properties/accepted_sizes -> NetworkEventAcceptedSizes',
    onde: null,
    porque:
      'EDICAO: ausente quer dizer "nao mexa". Foi aqui que o defeito foi MEDIDO em 17/10 -- um PATCH com `title` e ' +
      '`notes` chegava ao manipulador aceitando os quatro portes',
  },
  {
    operationId: 'updateNetworkEvent',
    trilha: 'CommunityNetworkEventPatch/properties/dog_age -> NetworkEventDogAge',
    onde: null,
    porque: 'EDICAO: ausente quer dizer "nao mexa"',
  },

  // --- Rede: encontro do painel ---
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/time_zone',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: 'const timeZone = corpo.time_zone ?? FUSO_PADRAO;',
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/accepted_sizes -> NetworkEventAcceptedSizes',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: 'corpo.accepted_sizes ?? PORTES',
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/dog_age -> NetworkEventDogAge',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: "idadeDosCaes: corpo.dog_age ?? 'any',",
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/vaccination_required',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: 'vacinacaoExigida: corpo.vaccination_required ?? true,',
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/fenced_off_leash_area',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: 'areaCercada: corpo.fenced_off_leash_area ?? false,',
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/visibility -> NetworkEventVisibility',
    onde: 'modules/network/application/rede-administrativa.ts',
    exige: "const visibilidade = corpo.visibility ?? 'public';",
  },
  {
    operationId: 'createAdminNetworkEvent',
    trilha: 'AdminNetworkEventInput/properties/admission -> AdminNetworkEventAdmissionInput/properties/kind',
    onde: 'modules/network/domain/escrita-do-encontro.ts',
    // `entradaDoCorpo` devolve `free` tanto com o corpo ausente quanto com
    // `kind` ausente -- e e o mesmo `free` do contrato.
    exige: "if (corpo === undefined) return { entrada: { tipo: 'free' } };",
  },
  {
    operationId: 'updateAdminNetworkEvent',
    trilha: 'AdminNetworkEventPatch/properties/accepted_sizes -> NetworkEventAcceptedSizes',
    onde: null,
    porque: 'EDICAO: ausente quer dizer "nao mexa"',
  },
  {
    operationId: 'updateAdminNetworkEvent',
    trilha: 'AdminNetworkEventPatch/properties/dog_age -> NetworkEventDogAge',
    onde: null,
    porque: 'EDICAO: ausente quer dizer "nao mexa"',
  },
  {
    operationId: 'changeAdminNetworkEventAccess',
    trilha: 'AdminNetworkEventAccessChange/properties/visibility -> NetworkEventVisibility',
    onde: null,
    porque:
      'EDICAO parcial servida por POST: ausente quer dizer "nao mexa", e `mudarAcesso` cai em ' +
      '`corpo.visibility ?? atual.visibilidade`. Era aqui que o padrao injetado tornava PUBLICO o encontro ' +
      'privado de quem mudava so a `admission`',
  },
  {
    operationId: 'changeAdminNetworkEventAccess',
    trilha: 'AdminNetworkEventAccessChange/properties/admission -> AdminNetworkEventAdmissionInput/properties/kind',
    onde: null,
    porque: 'EDICAO parcial servida por POST: ausente quer dizer "nao mexa"',
  },

  // --- Rede: fila de pedidos do painel ---
  {
    operationId: 'listAdminNetworkEvents',
    trilha: 'sort',
    onde: 'modules/network/adapters/http/admin-network-routes.ts',
    exige: "sort: query.sort ?? 'agenda',",
  },
  {
    operationId: 'listAdminNetworkEvents',
    trilha: 'page',
    onde: 'modules/network/adapters/http/admin-network-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminNetworkEvents',
    trilha: 'limit',
    onde: 'modules/network/adapters/http/admin-network-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },
  {
    operationId: 'listAdminNetworkJoinRequests',
    trilha: 'page',
    onde: 'modules/network/adapters/http/admin-network-routes.ts',
    exige: 'page: query.page ?? PAGINA_INICIAL,',
  },
  {
    operationId: 'listAdminNetworkJoinRequests',
    trilha: 'limit',
    onde: 'modules/network/adapters/http/admin-network-routes.ts',
    exige: 'limit: query.limit ?? TAMANHO_PADRAO,',
  },
];

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Um `default` alcancado a partir de um corpo ou de um parametro. */
export interface PadraoAlcancado {
  readonly operationId: string;
  readonly metodo: string;
  readonly caminho: string;
  /** `corpo`, ou o `in` do parametro (`query`, `path`, `header`). */
  readonly lugar: string;
  /** O caminho ate o `default`, com os `$ref` atravessados: `A -> A/properties/x -> B`. */
  readonly trilha: string;
  readonly valor: unknown;
  /** A operacao e uma edicao parcial (`patch`, ou da lista de `POST`)? */
  readonly ehEdicao: boolean;
}

export interface ResultadoDoPortao {
  readonly alcancados: readonly PadraoAlcancado[];
  readonly violacoes: readonly string[];
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
    // `default` ja foi contado; exemplo nao e injetado no que chega.
    if (chave === 'default' || chave === 'example' || chave === 'examples') continue;
    varrer(valor, `${trilha}/${chave}`, vistos, resolver, achados);
  }
}

/** O esquema do corpo JSON da operacao, sem resolver `$ref` (a varredura resolve). */
function esquemaDoCorpo(operacao: Record<string, unknown>): Record<string, unknown> | undefined {
  const corpo = operacao['requestBody'];
  const conteudo = ehObjeto(corpo) ? corpo['content'] : undefined;
  const json = ehObjeto(conteudo) ? conteudo['application/json'] : undefined;
  const esquema = ehObjeto(json) ? json['schema'] : undefined;
  return ehObjeto(esquema) ? esquema : undefined;
}

function chave(operationId: string, trilha: string): string {
  return `${operationId}\u0000${trilha}`;
}

/**
 * `lerArquivo` e injetavel para o teste poder medir a regra do trecho sem
 * mexer em arquivo de verdade. Em producao ele le de `src/`.
 */
export function conferirPadraoDoContrato(
  textoDaSpec: string,
  lerArquivo: (relativoASrc: string) => string = (p) => readFileSync(resolve(process.cwd(), 'src', p), 'utf8'),
): ResultadoDoPortao {
  const spec = parseYaml(textoDaSpec) as unknown;
  if (!ehObjeto(spec) || !ehObjeto(spec['paths'])) {
    return { alcancados: [], violacoes: ['o contrato nao tem `paths`'] };
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

  for (const [caminho, item] of Object.entries(spec['paths'])) {
    if (!ehObjeto(item)) continue;
    const comuns: readonly unknown[] = Array.isArray(item['parameters']) ? item['parameters'] : [];
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (!ehObjeto(operacao)) continue;
      const id = typeof operacao['operationId'] === 'string' ? operacao['operationId'] : `${metodo} ${caminho}`;
      operacoesDoContrato.add(id);
      const ehEdicao = metodo === 'patch' || EDICOES_PARCIAIS_SERVIDAS_POR_POST.includes(id);

      const esquema = esquemaDoCorpo(operacao);
      if (esquema !== undefined) {
        const achados: { trilha: string; valor: unknown }[] = [];
        // Corpo em linha nomeia a operacao; corpo por `$ref` comeca vazio e a
        // varredura poe o nome do schema ao atravessar o primeiro `$ref`.
        const raizDaTrilha = typeof esquema['$ref'] === 'string' ? '' : `${id} (corpo em linha)`;
        varrer(esquema, raizDaTrilha, new Set(), resolver, achados);
        for (const a of achados) {
          alcancados.push({ operationId: id, metodo, caminho, lugar: 'corpo', ...a, ehEdicao });
        }
      }

      const proprios: readonly unknown[] = Array.isArray(operacao['parameters']) ? operacao['parameters'] : [];
      for (const bruto of [...comuns, ...proprios]) {
        const parametro = ehObjeto(bruto) && typeof bruto['$ref'] === 'string' ? resolver(bruto['$ref']) : bruto;
        if (!ehObjeto(parametro)) continue;
        const nome = typeof parametro['name'] === 'string' ? parametro['name'] : '?';
        const lugar = typeof parametro['in'] === 'string' ? parametro['in'] : '?';
        const achados: { trilha: string; valor: unknown }[] = [];
        varrer(parametro['schema'], nome, new Set(), resolver, achados);
        for (const a of achados) {
          alcancados.push({ operationId: id, metodo, caminho, lugar, ...a, ehEdicao });
        }
      }
    }
  }

  const inventariadas = new Map(INVENTARIO.map((linha) => [chave(linha.operationId, linha.trilha), linha]));
  const vistas = new Set<string>();

  for (const a of alcancados) {
    const k = chave(a.operationId, a.trilha);
    vistas.add(k);
    if (!inventariadas.has(k)) {
      violacoes.push(
        `${a.operationId} [${a.metodo.toUpperCase()} ${a.caminho}] (${a.lugar}): default fora do inventario ` +
          `(${a.trilha} = ${JSON.stringify(a.valor)}). O Ajv NAO preenche mais campo ausente com o default do ` +
          `contrato: ou o caso de uso escreve esse padrao e a linha entra em INVENTARIO com o arquivo e o trecho, ` +
          `ou o campo chega indefinido e grava ${a.ehEdicao ? 'por cima do que ninguem mandou mudar' : 'nada'}.`,
      );
    }
  }

  for (const linha of INVENTARIO) {
    const k = chave(linha.operationId, linha.trilha);
    if (!operacoesDoContrato.has(linha.operationId)) {
      violacoes.push(`${linha.operationId}: no INVENTARIO e o contrato nao declara mais a operacao: tire a linha`);
      continue;
    }
    if (!vistas.has(k)) {
      violacoes.push(
        `${linha.operationId}: no INVENTARIO com a trilha '${linha.trilha}', que o contrato nao alcanca mais: ` +
          `tire a linha (ou corrija a trilha, se o schema so mudou de nome)`,
      );
      continue;
    }
    if (linha.onde === null) continue;

    let conteudo: string;
    try {
      conteudo = lerArquivo(linha.onde);
    } catch {
      violacoes.push(`${linha.operationId}: o INVENTARIO aponta para src/${linha.onde}, que nao existe`);
      continue;
    }
    if (linha.exige === undefined || !conteudo.includes(linha.exige)) {
      violacoes.push(
        `${linha.operationId} (${linha.trilha}): src/${linha.onde} nao contem mais ` +
          `'${linha.exige ?? ''}'. O contrato promete esse default e o Ajv nao o escreve: sem esse trecho o ` +
          `campo chega indefinido. Reponha o padrao no codigo, ou corrija a linha do INVENTARIO.`,
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

  if (alcancados.length === 0) {
    violacoes.push('nenhum default alcancado no contrato inteiro: o portao nao tem o que verificar');
  }
  return { alcancados, violacoes };
}
