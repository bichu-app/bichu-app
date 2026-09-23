/**
 * `GET /v1/directory/entries` — a secao `Perto`.
 *
 * ## Por que ela EXIGE conta
 *
 * Nao e zelo: e o que torna a resposta possivel.
 * `src/tools/portao-contrato-publico.ts` reprova `phone_e164` e `distance_m`
 * em qualquer operacao alcancavel sem conta, e reprova com razao. Os dois sao o
 * conteudo util do diretorio -- uma lista de profissionais sem telefone e sem
 * "quao perto" nao e um diretorio, e uma lista publica COM os dois e uma base
 * de contatos pronta para raspagem.
 *
 * O ADR-0011 secao 4 distingue os dois lados: o tutor e uma pessoa que nao
 * pediu para ser achada; o profissional e uma entidade que ACEITOU aparecer
 * para ser contratada. A distincao sustenta publicar telefone comercial, nao
 * sustenta publica-lo para o mundo inteiro sem conta.
 *
 * **Afrouxar o `security` desta operacao para `[bearerAuth, {}]` faz o portao
 * reprovar os dois campos, nominalmente.** Isso foi medido, nao previsto.
 *
 * ## Nenhuma coordenada entra pela requisicao
 *
 * A forma obvia seria receber `lat`/`lon` do aparelho. Ela nao esta aqui por
 * dois motivos, e o segundo e o que decide: coordenada em URL vai para log de
 * acesso, para o historico do aparelho e para o cabecalho `Referer`; e o
 * servidor **ja guarda** a localizacao de referencia de quem chama (BICHUS-92),
 * quantizada em 100 m e com validade de 30 dias.
 *
 * Sem localizacao valida, a resposta diz `distance_available: false`, cai para
 * ordem por nome e devolve `distance_m` nulo em todos os itens. **Nao existe o
 * caminho em que a distancia sai zero porque o calculo falhou** -- e a mesma
 * regra do `reach_status: unavailable` do alerta.
 *
 * ## A validacao de query nao esta aqui
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` a partir do contrato,
 * pelo `operationId`. Declarar um schema aqui criaria a segunda definicao, que
 * e a que diverge. O `400` que ela produz esta declarado na operacao, e o
 * portao de subida reprova se sair de la.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { projetarEntrada, type TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { NivelDeVerificacao } from '../../domain/nivel-de-verificacao.js';
import type { DirectoryRepository, OrdemDoDiretorio } from '../../ports/directory-repository.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { UserId } from '../../../../shared/types/brands.js';

/**
 * O teto e o do contrato, copiado dele e nao escolhido aqui.
 *
 * `account` e nao `ip` porque a rota exige conta: `account` existe e e exato.
 * Teto por `ip` seria armadilha no Brasil, onde o CGNAT das operadoras poe
 * muita gente atras de poucos enderecos -- ele pegaria vizinhos inocentes e
 * erraria quem raspa.
 *
 * `expensive_query` e o efeito: cada chamada mede distancia geoespacial contra
 * o recorte inteiro e ainda o conta. Sem efeito declarado o teto seria
 * opcional, e diretorio sem teto e a porta da raspagem.
 *
 * ## A SEGUNDA ENTRADA, `[account, q]`, e o que ela conta
 *
 * Sessenta buscas por hora por conta, e nao cento e vinte: busca e a metade
 * cara e a metade abusavel desta rota, entao ela paga metade do orcamento.
 *
 * **`q` marca presenca de busca, nao o termo** (ver `DIMENSOES_CONHECIDAS`).
 * Fosse o termo, o balde trocaria a cada termo novo e quem enumera o diretorio
 * -- que varia o termo por definicao -- nunca encostaria no teto. Com a marca
 * constante, o balde e por conta e conta toda busca; a chamada SEM `q` pula
 * esta entrada inteira, porque o resolvedor devolve `undefined` e
 * `resolverValores` pula a entrada quando falta um componente.
 *
 * **Sessenta e numero de tela, e nao de planilha.** Com um campo que busca
 * enquanto se digita, uma unica busca custa mais de uma chamada -- e por isso
 * a tela precisa esperar o terceiro caractere (o contrato o exige) e represar
 * a digitacao. Teto que recusa busca legitima nao e visto como teto: e visto
 * como app quebrado, e esse e o modo de falha que se quis evitar aqui.
 */
export const rotaDoDiretorio = defineRoute({
  operationId: 'listDirectoryEntries',
  method: 'get',
  path: '/directory/entries',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    { dimension: ['account', 'q'], limit: 60, window: '1h', onExceed: 'deny_429' },
  ],
});

/** Os mesmos defaults que o contrato declara. Copiados de la, nao escolhidos aqui. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const ORDEM_PADRAO: OrdemDoDiretorio = 'distance';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDoDiretorio {
  readonly diretorio: DirectoryRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
}

interface QueryDoDiretorio {
  readonly q?: string;
  readonly city?: string;
  readonly state?: string;
  readonly neighborhood?: string;
  readonly kind?: TipoDeProfissional;
  readonly verification_level?: NivelDeVerificacao;
  readonly sort?: OrdemDoDiretorio;
  readonly page?: number;
  readonly limit?: number;
}

/** MEMOIZADA: o teto por `account` e o manipulador precisam do mesmo dono. */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDoDiretorio,
): Promise<UserId> {
  return memoDaRequisicao(request, 'diretorio:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDoDiretorio,
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/**
 * O recorte que de fato valeu, para a tela poder escreve-lo.
 *
 * `scope: all` quando nada foi filtrado: "nada filtrado" e uma informacao, e um
 * objeto vazio faria a tela adivinhar a diferenca entre "sem filtro" e "filtro
 * que nao coube na resposta".
 */
function filtrosAplicados(query: QueryDoDiretorio): Record<string, string> {
  const filtros: Record<string, string> = {};
  // O TERMO VOLTA COMO CHEGOU, aparado. A tela escreve "resultados para
  // <termo>" com o que a pessoa digitou, e nao com a forma normalizada: ela
  // nao reconheceria `veterinaria` como o que escreveu se tinha escrito
  // `Veterinária`. O que a normalizacao decide e o que CASA, nao o que se le.
  if (query.q !== undefined) filtros['q'] = query.q;
  if (query.city !== undefined) filtros['city'] = query.city;
  if (query.state !== undefined) filtros['state'] = query.state;
  if (query.neighborhood !== undefined) filtros['neighborhood'] = query.neighborhood;
  if (query.kind !== undefined) filtros['kind'] = query.kind;
  if (query.verification_level !== undefined) {
    filtros['verification_level'] = query.verification_level;
  }
  if (Object.keys(filtros).length === 0) filtros['scope'] = 'all';
  return filtros;
}

export function registrarRotasDoDiretorio(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoDiretorio,
): void {
  registrarRota(
    app,
    rotaDoDiretorio,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDoDiretorio;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const sort = query.sort ?? ORDEM_PADRAO;

      const pagina = await deps.diretorio.listarPublicados({
        chamador,
        agora: deps.clock.now(),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.city === undefined ? {} : { city: query.city }),
        ...(query.state === undefined ? {} : { state: query.state }),
        ...(query.neighborhood === undefined ? {} : { neighborhood: query.neighborhood }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.verification_level === undefined
          ? {}
          : { verificationLevel: query.verification_level }),
        sort,
        page,
        limit,
      });

      // A distancia so e publicada quando ela vale. Com `distanciaDisponivel`
      // falso a lista saiu em ordem de nome, e devolver um numero ao lado dela
      // seria dizer "estes sao os mais perto" sobre uma ordem que nao mediu
      // nada.
      const itens = pagina.itens.map(projetarEntrada).map((entrada) =>
        pagina.distanciaDisponivel ? entrada : { ...entrada, distance_m: null },
      );

      return reply.send({
        items: itens,
        page,
        limit,
        total: pagina.total,
        distance_available: pagina.distanciaDisponivel,
        applied_filters: filtrosAplicados(query),
      });
    },
  );
}
