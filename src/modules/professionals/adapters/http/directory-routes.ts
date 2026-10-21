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
import {
  projetarEnderecoComercial,
  projetarEntrada,
  urlDaDerivada,
  type TipoDeProfissional,
} from '../../domain/entrada-do-diretorio.js';
import {
  projetarAvaliacao,
  projetarPontuacao,
  validarDenuncia,
  validarEntradaDaAvaliacao,
  type OrdemDasAvaliacoes,
} from '../../domain/avaliacao-do-local.js';
import type { NivelDeVerificacao } from '../../domain/nivel-de-verificacao.js';
import type { DirectoryRepository, OrdemDoDiretorio } from '../../ports/directory-repository.js';
import {
  comoFamiliaDeSessao,
  type FamiliaDeSessao,
} from '../../../identity/ports/localizacao-de-referencia-repository.js';
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
  /**
   * `sid` e a familia de refresh que emitiu o token -- a SESSAO DE APARELHO do
   * ADR-0002, emenda 1, secao 2. Ele chega aqui porque desde a SEC-021 a
   * localizacao de referencia e do aparelho, e e dela que sai a distancia desta
   * secao.
   *
   * **Opcional porque e opcional no token**: o verificador aceita os dois
   * formatos, e o que nasceu antes da emenda 1 nao o carrega. Ao contrario das
   * rotas de `/v1/me/location`, que recusam esse token, aqui a ausencia nao e
   * recusa: a lista sai por nome e sem distancia. Negar a leitura do diretorio
   * por um campo que a renovacao repoe apagaria a aba inteira.
   */
  autenticar(token: string): Promise<{ userId: UserId; sid?: string | undefined }>;
}

/** Quem chama e de qual aparelho. `familia` indefinida: token sem `sid`. */
export interface ChamadorDoDiretorio {
  readonly userId: UserId;
  readonly familia: FamiliaDeSessao | undefined;
}

export interface DependenciasDasRotasDoDiretorio {
  readonly diretorio: DirectoryRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
  /**
   * A URL publica de uma chave de derivada (18/10/2026, com a liberacao das
   * imagens do profissional no aplicativo).
   *
   * Injetada como na `Loja`, na `Rede`, no painel do diretorio e em `Me`: o host
   * de midia e `MEDIA_PUBLIC_BASE_URL`, que e configuracao, e uma rota que lesse
   * variavel de ambiente deixaria de ser testavel sem ambiente.
   */
  readonly urlDeMidia: (chave: string) => string;
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

/**
 * MEMOIZADA: o teto por `account` e o manipulador precisam do mesmo dono.
 *
 * **O parametro e so o autenticador**, porque `chamadorAutenticado` logo abaixo
 * -- que `directory-suggestion-routes.ts` reusa -- se apoia nesta: o memo e por
 * requisicao e a chave e a mesma (`diretorio:chamador`), entao o teto da
 * sugestao e o manipulador dela veem a MESMA conta, e a credencial e lida uma
 * vez so. Uma segunda copia desta funcao ali daria dois donos possiveis para a
 * mesma requisicao, que e a forma de o teto contar no balde de outra pessoa.
 *
 * SEC-021: devolve o APARELHO ao lado do dono, porque e do aparelho que sai o
 * ponto de referencia desde 23/09/2026. Quem nao mede distancia continua
 * pedindo so o dono.
 */
export function identidadeDoChamador(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
): Promise<ChamadorDoDiretorio> {
  return memoDaRequisicao(request, 'diretorio:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId, sid } = await deps.autenticador.autenticar(token);
    return {
      userId,
      // Vazio e ausente sao o mesmo caso: nenhum dos dois nomeia um aparelho.
      familia: typeof sid === 'string' && sid !== '' ? comoFamiliaDeSessao(sid) : undefined,
    };
  });
}

/**
 * So o dono, para quem nao mede distancia.
 *
 * Projeta `identidadeDoChamador` em vez de repetir a leitura da credencial: e o
 * MESMO memo e a mesma chave, entao continua havendo uma unica autenticacao por
 * requisicao -- a propriedade que o comentario acima descreve.
 */
export async function chamadorAutenticado(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
): Promise<UserId> {
  return (await identidadeDoChamador(request, deps)).userId;
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
export async function contaDoTeto(
  request: FastifyRequest,
  deps: { readonly autenticador: Autenticador },
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

/**
 * `GET /v1/directory/entries/{slug}` -- a pagina do local.
 *
 * **Ela era uma das duas operacoes que o contrato declarou FORA** em 22/09,
 * com a razao escrita por extenso: "este contrato ja carrega 42 operacoes
 * declaradas e sem implementacao, e acrescentar duas para nao as implementar
 * hoje aumenta exatamente a divida que essa conta mede". A razao era boa e
 * deixou de valer: ela entra agora **com implementacao e com tela**.
 *
 * EXIGE CONTA pelo mesmo motivo da listagem e nao por um novo: devolve
 * `phone_e164`, e `portao-contrato-publico.ts` reprova esse campo em operacao
 * alcancavel sem conta.
 *
 * O teto e 300/h e nao 120/h: navegar entre locais e o uso normal da secao, e
 * esta rota le UMA linha -- sem recorte geoespacial sobre a tabela inteira. Ela
 * nao declara `expensive_query` por isso.
 */
export const rotaDoLocal = defineRoute({
  operationId: 'getDirectoryEntry',
  method: 'get',
  path: '/directory/entries/:slug',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDasAvaliacoes = defineRoute({
  operationId: 'listDirectoryEntryReviews',
  method: 'get',
  path: '/directory/entries/:slug/reviews',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * `PUT` e nao `POST`, e o metodo E a regra de produto.
 *
 * O cliente decidiu "uma avaliacao por pessoa por local, que ela possa editar e
 * apagar; enviar de novo ATUALIZA a dela, nao cria segunda". Com `POST`, o
 * segundo envio seria `409` e a tela precisaria de um segundo caminho; com
 * `PUT`, o segundo envio E a edicao.
 *
 * ## O teto, e o numero
 *
 * **20/h por conta**, e e baixo de proposito: isto escreve na reputacao publica
 * de um negocio real, com nome e endereco. Uma pessoa honesta avalia um ou dois
 * locais por sessao e, reeditando o texto, chega a cinco.
 *
 * Por CONTA e nao por IP porque a rota exige conta -- e exige mais do que
 * conta: exige e-mail confirmado. O custo de conseguir um balde novo e um
 * e-mail novo confirmado, o que e exatamente a propriedade que falta num teto
 * por IP sob o CGNAT das operadoras brasileiras.
 *
 * **O que este teto NAO cobre esta declarado no contrato**: muitas contas
 * contra UM local. Isso exigiria balde por ALVO, e `directory_entry` nao esta
 * em `DIMENSOES_CONHECIDAS` -- dimensao nova e decisao de politica e nao
 * detalhe de rota, como aquele arquivo diz. Fica relatado e nao resolvido;
 * enquanto isso, a contencao desse caso e a denuncia e a remocao humana.
 */
export const rotaDeGravarMinhaAvaliacao = defineRoute({
  operationId: 'putMyDirectoryEntryReview',
  method: 'put',
  path: '/directory/entries/:slug/reviews/me',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeApagarMinhaAvaliacao = defineRoute({
  operationId: 'deleteMyDirectoryEntryReview',
  method: 'delete',
  path: '/directory/entries/:slug/reviews/me',
  effects: [],
  // O MESMO orcamento do `PUT`: apagar e regravar nao pode ser o caminho que
  // contorna o teto de escrita.
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/**
 * A denuncia. **20 por DIA**, e a janela de 24 h e deliberada.
 *
 * Denuncia e um pedido de atencao humana, e atencao humana e o recurso mais
 * escasso deste produto -- nao ha equipe de moderacao de plantao. Vinte por dia
 * e mais do que qualquer pessoa de boa-fe encontra, e pouco o bastante para que
 * uma conta nao encha a fila sozinha. O abuso aqui e volume no dia, nao rajada
 * no minuto, e por isso a janela nao e de uma hora.
 */
export const rotaDeDenunciarAvaliacao = defineRoute({
  operationId: 'reportDirectoryEntryReview',
  method: 'post',
  path: '/directory/entries/:slug/reviews/:reviewRef/reports',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' }],
});

const TAMANHO_PADRAO_DAS_AVALIACOES = 10;
const ORDEM_PADRAO_DAS_AVALIACOES: OrdemDasAvaliacoes = 'recent';

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

interface QueryDasAvaliacoes {
  readonly sort?: OrdemDasAvaliacoes;
  readonly page?: number;
  readonly limit?: number;
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
      const chamador = await identidadeDoChamador(request, deps);
      const query = (request.query ?? {}) as QueryDoDiretorio;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const sort = query.sort ?? ORDEM_PADRAO;

      const pagina = await deps.diretorio.listarPublicados({
        chamador: chamador.userId,
        // SEC-021: de qual aparelho sai o ponto que mede a distancia.
        familia: chamador.familia,
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
      // `(e) => projetarEntrada(e, ...)` e nao `.map(projetarEntrada)`: com a
      // referencia nua, o segundo argumento de `map` (o indice) chegaria no
      // lugar de `urlDeMidia`.
      const itens = pagina.itens.map((e) => projetarEntrada(e, deps.urlDeMidia)).map((entrada) =>
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

  // ----------------------------------------------------------------- o local

  registrarRota(
    app,
    rotaDoLocal,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await identidadeDoChamador(request, deps);
      const local = await deps.diretorio.lerLocalPublicado(
        parametro(request, 'slug'),
        chamador.userId,
        chamador.familia,
        deps.clock.now(),
      );
      // **404 E NAO 403** (ADR-0021). Rascunho, oculto, removido e inexistente
      // sao a MESMA resposta: um 403 confirmaria que aquele endereco existe, a
      // quem nao tem direito de saber.
      if (local === undefined) throw problemas.naoEncontrado();

      const entrada = projetarEntrada(local.entrada, deps.urlDeMidia);
      return reply.send({
        ...entrada,
        // A FOTO EM FAIXA, so aqui. `projetarEntrada` -- que a listagem tambem
        // usa -- nao a conhece, e e por isso que ela nao tem como escorregar
        // para a lista num campo novo que alguem acrescente la.
        photo_url: urlDaDerivada(local.fotoPublicKey, deps.urlDeMidia),
        // O ENDERECO COMERCIAL, so aqui e pela mesma razao da faixa (cliente,
        // 21/10/2026: *"o endereco completo do profissional"*). `projetarEntrada`
        // -- que a listagem tambem usa -- nao o conhece, e e por isso que ele
        // nao tem como escorregar para a lista num campo novo que alguem
        // acrescente la.
        //
        // **Endereco de ENTIDADE, nunca de pessoa** (ADR-0011 secao 4): estas
        // quatro colunas sao de `professionals`, e nenhuma rota de pessoa as
        // alcanca.
        ...projetarEnderecoComercial(local.enderecoComercial),
        rating: projetarPontuacao(local.pontuacao),
        my_review_ref: local.refDaMinhaAvaliacao,
        can_review: local.podeAvaliar,
        // O MOTIVO vem junto do booleano para a tela escrever a frase certa e
        // oferecer a SAIDA (confirmar o e-mail), em vez de um "nao e possivel"
        // sem caminho. Hoje ha um motivo so; o campo existe para o segundo nao
        // nascer como um segundo booleano.
        review_blocked_reason: local.podeAvaliar ? null : 'unverified_channel',
      });
    },
  );

  // ------------------------------------------------------- as avaliacoes

  registrarRota(
    app,
    rotaDasAvaliacoes,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDasAvaliacoes;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO_DAS_AVALIACOES;

      const pagina = await deps.diretorio.listarAvaliacoes({
        slug: parametro(request, 'slug'),
        chamador,
        sort: query.sort ?? ORDEM_PADRAO_DAS_AVALIACOES,
        page,
        limit,
      });
      if (pagina === undefined) throw problemas.naoEncontrado();

      return reply.send({
        items: pagina.itens.map(projetarAvaliacao),
        page,
        limit,
        total: pagina.total,
      });
    },
  );

  registrarRota(
    app,
    rotaDeGravarMinhaAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);

      // A VALIDACAO DE DOMINIO roda ANTES de tocar o banco, e ela e a segunda
      // recusa: a primeira e o schema do contrato, instalado por
      // `vigiarParametrosDasRotas`, e a terceira sao os `CHECK` da tabela.
      const { entrada, erros } = validarEntradaDaAvaliacao(request.body);
      if (entrada === undefined) throw problemas.validacao(erros);

      const gravada = await deps.diretorio.gravarMinhaAvaliacao(
        parametro(request, 'slug'),
        chamador,
        entrada,
        deps.clock.now(),
      );

      if (gravada === 'local-ausente') throw problemas.naoEncontrado();
      // **409 E NAO 403, e e o MESMO tipo de problema que criar encontro
      // devolve.** A regra e a mesma regra do cliente ("so usuarios com os
      // dados validados"), e dois tipos para um conceito fariam o app decidir
      // por dois caminhos onde ha um. O que muda e o TEXTO, e ele precisa
      // mudar: "confirme seu e-mail para propor um encontro" numa tela de
      // avaliar local manda a pessoa para o lugar errado.
      //
      // Este 409 e sobre QUEM CHAMA e nao sobre o recurso, e por isso nao
      // contradiz o ADR-0021: a existencia do local ja foi confirmada pela
      // leitura, e o que falta e um atributo da propria conta de quem pede.
      if (gravada === 'sem-canal-verificado') {
        throw problemas.canalDeContatoNaoVerificadoParaAvaliar();
      }

      return reply.send({
        review: projetarAvaliacao(gravada.avaliacao),
        created: gravada.criada,
        // A pontuacao JA COM esta avaliacao dentro, na mesma resposta: a tela
        // nao precisa de uma segunda chamada para atualizar a media que o
        // proprio toque acabou de mudar -- e uma segunda chamada deixaria a
        // media velha na tela se ela falhasse.
        rating: projetarPontuacao(gravada.pontuacao),
      });
    },
  );

  registrarRota(
    app,
    rotaDeApagarMinhaAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const existe = await deps.diretorio.apagarMinhaAvaliacao(parametro(request, 'slug'), chamador);
      // O 404 e do LOCAL, nao da avaliacao: nao ter avaliacao e chamar isto e
      // sucesso (o estado pedido e o estado final), e um erro faria a tela
      // tratar como falha um toque duplo no botao.
      if (!existe) throw problemas.naoEncontrado();
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDenunciarAvaliacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { denuncia, erros } = validarDenuncia(request.body);
      if (denuncia === undefined) throw problemas.validacao(erros);

      const desfecho = await deps.diretorio.denunciarAvaliacao(
        parametro(request, 'slug'),
        parametro(request, 'reviewRef'),
        chamador,
        denuncia,
        deps.clock.now(),
      );

      if (desfecho === 'ausente') throw problemas.naoEncontrado();
      if (desfecho === 'propria') {
        throw problemas.validacao([
          {
            field: 'reviewRef',
            code: 'own_review',
            message: 'Esta avaliação é sua. Para tirá-la do ar, apague-a.',
          },
        ]);
      }

      // **202 e nao 200**: o que esta rota promete e que o pedido foi recebido,
      // nao que alguem ja olhou. Prometer decisao seria mentir sobre o que
      // existe -- nao ha equipe de moderacao de plantao.
      return reply.status(202).send();
    },
  );
}
