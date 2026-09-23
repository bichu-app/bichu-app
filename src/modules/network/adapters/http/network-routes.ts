/**
 * As tres rotas da secao `Rede`.
 *
 * **LEIA O ADR-0024 ANTES DE MEXER AQUI.** As ausencias deste arquivo sao o
 * conteudo dele, e cada uma fecha uma inferencia que o produto nao consegue
 * reabrir depois sem pedir consentimento a quem ja confirmou presenca.
 *
 * ## Duas publicas e uma autenticada, e a divisao tem razao
 *
 * `listNetworkEvents` e publica (`security: []`) e `getNetworkEvent` aceita as
 * duas coisas (`bearerAuth` ou nada), porque a `Rede` e **navegavel
 * deslogado**: uma agenda de encontros de bairro atras de login e uma agenda
 * que a pessoa so ve depois de criar conta. Nao ha nisso o problema de `Perto`,
 * onde `phone_e164` e `distance_m` sao o conteudo -- aqui nao ha telefone, nao
 * ha coordenada, nao ha distancia, nao ha UUID e, acima de tudo, **nao ha
 * ninguem**: a presenca e um inteiro.
 *
 * `checkInNetworkEvent` exige conta porque ela ESCREVE em nome de alguem. Sem
 * conta nao ha quem confirmar presenca.
 *
 * ## O corpo de `getNetworkEvent` e UM SO, e e o publico
 *
 * ADR-0021. `viewer_checked_in` e a unica coisa derivada de quem chama, e ela
 * segue o precedente do campo `viewer`: e sinal de navegacao, **nao destranca
 * campo nenhum** e nao fala de terceiro. Ela responde "voce ja confirmou
 * presenca?" a partir do token de quem ja esta chamando, e e `false` para quem
 * chega sem conta. Nao ha ramo por chamador neste arquivo, e e por isso que o
 * portao de contrato o confere sem precisar entender prosa.
 *
 * ## A validacao de query nao esta aqui
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` a partir do contrato,
 * pelo `operationId`. Declarar um schema aqui criaria a segunda definicao, que
 * e a que diverge -- e o `400` que ela produz ja esta declarado na operacao.
 *
 * ## O `status` nao e calculado aqui
 *
 * Ele e calculado em `statusDoEncontro`, no dominio, junto da regra que decide
 * o que cada rotulo quer dizer. Um `if` de data nesta funcao separaria a regra
 * do lugar onde ela e testavel sem subir borda -- e as bordas dela (exatamente
 * no comeco, exatamente no fim, sem fim declarado) sao o coracao da secao.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  projetarEncontro,
  projetarEncontroComGaleria,
} from '../../domain/encontro-da-rede.js';
import type {
  NetworkRepository,
  OrdemDaAgenda,
  RecorteNoTempo,
} from '../../ports/network-repository.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { UserId } from '../../../../shared/types/brands.js';

/**
 * Os tetos sao os do contrato, COPIADOS de la e nao escolhidos aqui.
 *
 * `expensive_query` e o efeito da listagem: a busca por texto varre titulo e
 * resumo do recorte inteiro, conta o recorte e ainda conta presenca e foto por
 * cartao. Sem efeito declarado o teto seria opcional, e agenda publica sem teto
 * e a porta da raspagem.
 *
 * **Um teto so, e uma dimensao so, em cada rota.** A armadilha medida em 22/09
 * -- dois tetos na mesma dimensao com janelas diferentes caindo no mesmo balde
 * -- esta consertada em `montarChave`, que poe a janela na chave. Nenhuma
 * destas tres rotas depende do conserto, porque nenhuma declara o segundo.
 */
export const rotaDaAgenda = defineRoute({
  operationId: 'listNetworkEvents',
  method: 'get',
  path: '/network/events',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * Sem efeito: a leitura de um encontro e uma linha, a galeria dele e a
 * contagem. O teto existe mesmo assim, e e o DOBRO da listagem, porque abrir a
 * galeria de varios encontros seguidos e uso normal de quem esta escolhendo
 * para onde ir no domingo.
 */
export const rotaDoEncontro = defineRoute({
  operationId: 'getNetworkEvent',
  method: 'get',
  path: '/network/events/:eventSlug',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/**
 * `account`, e nao `ip`: a operacao EXIGE conta, entao ha conta para contar.
 *
 * Teto por `ip` aqui seria armadilha no Brasil, onde o CGNAT das operadoras poe
 * muita gente atras de poucos enderecos -- ele pegaria vizinho inocente e
 * erraria quem enche a contagem de um encontro. 30 por hora e muito para quem
 * usa e pouco para quem enche.
 */
export const rotaDeCheckIn = defineRoute({
  operationId: 'checkInNetworkEvent',
  method: 'post',
  path: '/network/events/:eventSlug/check-in',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

/** Os mesmos defaults que o contrato declara. Copiados de la. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const RECORTE_PADRAO: RecorteNoTempo = 'upcoming';

/**
 * O default de `sort` **DEPENDE de `when`**, e e esta funcao inteira.
 *
 * Com `upcoming` e com `all` a ordem e `proximos`: a pergunta e "o que vem", e
 * ela se responde de frente para tras. Com `past` a ordem inverte para
 * `recentes`, porque a pergunta "o que houve" se responde do mais recente para
 * tras -- abrir o passado na ordem crescente mostraria primeiro o encontro mais
 * antigo que a `Rede` ja teve, que e o cartao menos util da lista.
 *
 * **E por isso que `effective_sort` existe na resposta.** Um cliente que nao
 * mandou `sort` nao tem como saber qual ordem valeu sem perguntar, e a barra de
 * listagem mostra a ordem REAL.
 */
export function ordemPadraoDe(quando: RecorteNoTempo): OrdemDaAgenda {
  return quando === 'past' ? 'recentes' : 'proximos';
}

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDaRede {
  readonly rede: NetworkRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
}

interface QueryDaAgenda {
  readonly q?: string;
  readonly city?: string;
  readonly when?: RecorteNoTempo;
  readonly sort?: OrdemDaAgenda;
  readonly page?: number;
  readonly limit?: number;
}

interface CaminhoDoEncontro {
  readonly eventSlug: string;
}

/**
 * O recorte que de fato valeu, para a tela poder escreve-lo.
 *
 * `scope: all` quando nada foi recortado, pela mesma razao da `Loja` e de
 * `Perto`: "nada filtrado" e uma informacao, e um objeto vazio faria a tela
 * adivinhar a diferenca entre "sem filtro" e "filtro que nao coube na resposta".
 *
 * `when` **nao entra aqui**, e a ausencia e deliberada: ele tem campo proprio
 * (`effective_when`) porque sempre vale algum, inclusive o default. Poe-lo
 * tambem em `applied_filters` faria a tela mostrar "Proximos" como se fosse um
 * filtro que a pessoa escolheu, e o botao de limpar filtros passaria a prometer
 * que apaga o que e o estado normal da agenda.
 */
function recortesAplicados(query: QueryDaAgenda): Record<string, string> {
  const aplicados: Record<string, string> = {};
  const termo = query.q?.trim();
  if (termo !== undefined && termo !== '') aplicados['q'] = termo;
  const cidade = query.city?.trim();
  if (cidade !== undefined && cidade !== '') aplicados['city'] = cidade;
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

/** O token do cabecalho, sem decidir nada sobre ele. */
function tokenDaRequisicao(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

/** MEMOIZADO: o teto por `account` e o manipulador precisam do mesmo dono. */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<UserId> {
  return memoDaRequisicao(request, 'rede:chamador', async () => {
    const token = tokenDaRequisicao(request);
    if (token === undefined) throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

/**
 * Quem chama, quando ha alguem. **Nao levanta.**
 *
 * `getNetworkEvent` e navegavel deslogado, e um token vencido nao pode virar
 * 401 numa rota que atende sem token nenhum: a pessoa que abriu o aplicativo
 * depois de um mes fora veria a agenda publica recusar, e nao ha nada nesta
 * resposta que uma credencial destranque. Sem chamador, `viewer_checked_in` e
 * `false`, que e a mesma resposta de quem nunca teve conta.
 */
async function chamadorOpcional(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<UserId | undefined> {
  if (tokenDaRequisicao(request) === undefined) return undefined;
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

export function registrarRotasDaRede(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaRede,
): void {
  // Sem resolvedor: `ip` e dimensao generica e o registro a resolve sozinho. O
  // tipo `ResolvedoresExigidos` so aceita o objeto vazio como AUSENTE aqui, e
  // essa e a prova em tempo de compilacao de que nenhuma dimensao nova entrou
  // em `DIMENSOES_CONHECIDAS` por causa desta rota.
  registrarRota(app, rotaDaAgenda, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDaAgenda;
    const page = query.page ?? PAGINA_INICIAL;
    const limit = query.limit ?? TAMANHO_PADRAO;
    const when = query.when ?? RECORTE_PADRAO;
    const sort = query.sort ?? ordemPadraoDe(when);
    const termo = query.q?.trim();
    const cidade = query.city?.trim();
    const agora = deps.clock.now();

    const pagina = await deps.rede.listarAgenda({
      ...(termo === undefined || termo === '' ? {} : { q: termo }),
      ...(cidade === undefined || cidade === '' ? {} : { city: cidade }),
      when,
      sort,
      agora,
      page,
      limit,
    });

    return reply.send({
      items: pagina.itens.map((encontro) => projetarEncontro(encontro, agora)),
      page,
      limit,
      total: pagina.total,
      // Os dois campos que dizem o que DE FATO valeu. `effective_sort` nao e
      // decoracao aqui: como o default de `sort` depende de `when`, um cliente
      // que nao mandou nenhum dos dois nao tem como saber a ordem sem este
      // campo -- e a barra de listagem mostra a ordem REAL, nao a pedida.
      effective_sort: sort,
      effective_when: when,
      applied_filters: recortesAplicados(query),
    });
  });

  registrarRota(app, rotaDoEncontro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const chamador = await chamadorOpcional(request, deps);

    const encontro = await deps.rede.buscarEncontro({
      slug: eventSlug,
      ...(chamador === undefined ? {} : { chamador }),
    });

    // Inativo e inexistente respondem 404 com o MESMO corpo: distinguir
    // contaria a um estranho que aquele `slug` existiu.
    if (encontro === undefined) throw problemas.naoEncontrado();

    return reply.send(projetarEncontroComGaleria(encontro, deps.clock.now()));
  });

  registrarRota(
    app,
    rotaDeCheckIn,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;

      const desfecho = await deps.rede.confirmarPresenca({ slug: eventSlug, chamador });

      // O 404 vem da AUSENCIA DE LINHA, e a ausencia vem do `WHERE` da propria
      // escrita (ADR-0021). Nao houve consulta previa, nao houve comparacao
      // aqui e nao ha 403 -- nem para evento inativo, nem para `slug` que nunca
      // existiu.
      if (desfecho === undefined) throw problemas.naoEncontrado();

      return reply.send({
        checkin_count: desfecho.checkinCount,
        // Sempre `true` numa resposta 200 desta operacao, inclusive na segunda
        // chamada: a presenca esta confirmada nos dois casos, e e por isso que
        // a idempotencia nao precisa aparecer na resposta.
        viewer_checked_in: true,
      });
    },
  );
}
