/**
 * As tres rotas da secao `Rede`.
 *
 * **LEIA O ADR-0025 E A SECAO 12 DO ADR-0027 ANTES DE MEXER AQUI.**
 *
 * ## Duas leituras alcancaveis sem conta, e uma so com conta
 *
 * `listNetworkEvents` e publica (`security: []`) e `getNetworkEvent` aceita as
 * duas coisas (`bearerAuth` ou nada), porque a `Rede` e **navegavel
 * deslogado**. Nenhuma das duas carrega coordenada: o portao de contrato
 * publico trata autenticacao opcional como publica, e o ADR-0021 proibe a
 * resposta que muda conforme o chamador.
 *
 * `getNetworkEventLocation` devolve o ponto do encontro e exige conta
 * (`bearerAuth` sem alternativa vazia). E a emenda 1 do ADR-0010, de escopo
 * fechado: ponto de EVENTO publicado, em resposta autenticada. O 401 vem
 * **antes** de qualquer consulta: sem conta nao se descobre nem se o `slug`
 * existe.
 *
 * Check-in e galeria sairam desta versao por decisao do cliente (ADR-0027
 * 12.4); o desenho anterior esta na branch `guarda/rede-checkin-galeria`.
 *
 * ## O corpo de `getNetworkEvent` e UM SO, e e o publico
 *
 * ADR-0021. O detalhe nao le o token: nao ha campo derivado de quem chama, e
 * um token vencido nao vira 401 numa rota que atende sem token nenhum.
 *
 * ## A validacao de query e de caminho nao esta aqui
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` e `schema.params` a
 * partir do contrato, pelo `operationId`. Declarar um schema aqui criaria a
 * segunda definicao, que e a que diverge.
 *
 * ## O `status` nao e calculado aqui
 *
 * Ele e calculado em `statusDoEncontro`, no dominio, junto da regra que decide
 * o que cada rotulo quer dizer, inclusive o do cancelado.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { projetarEncontro, projetarLocalizacao } from '../../domain/encontro-da-rede.js';
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
 * resumo do recorte inteiro e ainda conta o recorte. Sem efeito declarado o
 * teto seria opcional, e agenda publica sem teto e a porta da raspagem.
 *
 * **Um teto so, e uma dimensao so, em cada rota.**
 */
export const rotaDaAgenda = defineRoute({
  operationId: 'listNetworkEvents',
  method: 'get',
  path: '/network/events',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * Sem efeito: a leitura de um encontro e uma linha. O teto e o DOBRO da
 * listagem, porque abrir varios encontros seguidos e uso normal de quem esta
 * escolhendo para onde ir no domingo.
 */
export const rotaDoEncontro = defineRoute({
  operationId: 'getNetworkEvent',
  method: 'get',
  path: '/network/events/:eventSlug',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/**
 * `account`, e nao `ip` (ADR-0027 12.5): a operacao EXIGE conta, entao ha conta
 * para contar, e no Brasil o CGNAT das operadoras poe muita gente atras de
 * poucos enderecos -- um teto por `ip` pegaria vizinho inocente.
 *
 * O teto e o mesmo do detalhe: a tela do encontro chama as duas operacoes a
 * cada abertura, e um limite menor aqui faria o mapa sumir antes do resto da
 * tela. O que ele segura e a raspagem dos pontos de todos os encontros por uma
 * conta so.
 */
export const rotaDoLocal = defineRoute({
  operationId: 'getNetworkEventLocation',
  method: 'get',
  path: '/network/events/:eventSlug/location',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/** Os mesmos defaults que o contrato declara. Copiados de la. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const RECORTE_PADRAO: RecorteNoTempo = 'upcoming';

/**
 * O default de `sort` **DEPENDE de `when`**, e e esta funcao inteira.
 *
 * Com `upcoming` e com `all` a ordem e `proximos`; com `past` a ordem inverte
 * para `recentes`, porque a pergunta "o que houve" se responde do mais recente
 * para tras. E por isso que `effective_sort` existe na resposta.
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
 * O recorte que de fato valeu, para a tela poder escreve-lo. `scope: all`
 * quando nada foi recortado. `when` **nao entra aqui**: ele tem campo proprio
 * (`effective_when`) porque sempre vale algum, inclusive o default.
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
    // O 401 de token vencido, revogado ou forjado e do servico de identidade,
    // como no diretorio. Nao ha `catch` aqui: engolir o erro transformaria uma
    // falha de banco em 401, e a pessoa seria mandada fazer login de novo por
    // um defeito nosso.
    return (await deps.autenticador.autenticar(token)).userId;
  });
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
  // Sem resolvedor: `ip` e dimensao generica e o registro a resolve sozinho.
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
      effective_sort: sort,
      effective_when: when,
      applied_filters: recortesAplicados(query),
    });
  });

  registrarRota(app, rotaDoEncontro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const encontro = await deps.rede.buscarEncontro(eventSlug);

    // Invisivel e inexistente respondem 404 com o MESMO corpo: distinguir
    // contaria a um estranho que aquele `slug` existiu.
    if (encontro === undefined) throw problemas.naoEncontrado();

    return reply.send(projetarEncontro(encontro, deps.clock.now()));
  });

  registrarRota(
    app,
    rotaDoLocal,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // O 401 vem ANTES da consulta: sem conta nao se descobre nem se o `slug`
      // existe. A ordem inversa responderia 404 a quem nao tem conta para um
      // `slug` inexistente e 401 para um existente, e a diferenca entre os dois
      // e exatamente o que o 404 unico existe para esconder.
      await chamadorAutenticado(request, deps);
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;

      const local = await deps.rede.buscarLocalDoEncontro(eventSlug);

      // Mesma regra de visibilidade de `getNetworkEvent`, e o mesmo corpo de
      // 404 (ADR-0027 12.5). Nao ha 403: o ponto de um encontro visivel e o
      // mesmo para qualquer tutor autenticado.
      if (local === undefined) throw problemas.naoEncontrado();

      return reply.send(projetarLocalizacao(local.ponto));
    },
  );
}
