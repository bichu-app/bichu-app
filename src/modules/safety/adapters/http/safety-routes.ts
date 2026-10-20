/**
 * As SEIS rotas de bloquear e denunciar.
 *
 * ## `404` E NUNCA `403`, E AQUI ISSO É O PRODUTO E NÃO SÓ O ADR-0021
 *
 * O alvo que já bloqueou quem chama devolve **o mesmo `404`, com o mesmo
 * corpo**, de pessoa que nunca existiu. Não é zelo de arquitetura: um `403`, ou
 * um `404` de corpo diferente, seria um oráculo — *"ela te bloqueou"* — e
 * **descobrir que foi bloqueado é o que gera retaliação**. A fusão dos três
 * casos (inexistente, desabilitada, bloqueou quem chama) acontece no `WHERE` do
 * repositório e não num `if` daqui.
 *
 * ## O DENUNCIADO NÃO É AVISADO, e não há como ele descobrir pela resposta
 *
 * O `202` é o mesmo para a primeira denúncia e para a repetição, e não há campo
 * nenhum que mude. Nada nestas rotas escreve para o denunciado, e o caso de uso
 * não tem porta por onde isso seria possível. Ver
 * `domain/o-denunciado-nao-e-avisado.ts`.
 *
 * ## NENHUM PRAZO É PROMETIDO
 *
 * O `202` diz que o pedido foi recebido, e nada mais: nem identificador de
 * denúncia, nem estado, nem posição na fila. **Não existe rota de consulta de
 * denúncia**, e a ausência é deliberada — é por uma rota de consulta que o
 * prazo prometido nasceria.
 *
 * ## Os três tetos, e por que dois deles estão em `defineRoute` e um no banco
 *
 * - **5 denúncias de perfil por dia** e **20 no total por dia** são tetos de
 *   requisição, e vivem em `x-rate-limit`. O total usa o **balde
 *   compartilhado** `community_report`, que é o que faz as três operações
 *   somarem no MESMO contador: sem ele, uma conta faria 5 + 20 + 20.
 * - **1 denúncia aberta por par** é propriedade de dado e não de tráfego, e
 *   vive no índice único PARCIAL do banco. Um teto de requisição não saberia
 *   dizer "aberta".
 *
 * **Não há teto por ALVO**, e a ausência é a decisão: quantas pessoas distintas
 * denunciam o mesmo alvo é o SINAL e não o abuso, e um teto por alvo protegeria
 * justamente quem merece fila. Contra brigada a defesa é PESO
 * (`denunciante_ordena_a_fila`), não teto.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AlvoDaDenuncia } from '../../domain/motivos-da-denuncia.js';
import { O_QUE_O_DENUNCIANTE_RECEBE } from '../../domain/o-denunciado-nao-e-avisado.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { PessoaQueEuBloqueei } from '../../ports/safety-repository.js';
import type { AutorDoAto, SegurancaDaComunidade } from '../../application/seguranca-da-comunidade.js';

export interface DependenciasDasRotasDeSeguranca {
  readonly seguranca: SegurancaDaComunidade;
  readonly autenticador: { autenticar(token: string): Promise<{ userId: UserId }> };
}

/**
 * **A LISTA DE QUEM EU BLOQUEEI** (19/10/2026), e é a ÚNICA leitura da fatia.
 *
 * ## Por que ela existe, e o defeito que ela conserta
 *
 * O bloqueio é **simétrico** (`bloqueio_entre`), e a simetria tinha uma
 * consequência que ninguém havia medido: quem bloqueia alguém também passa a
 * receber `404` no perfil dessa pessoa. E o "Desbloquear" morava dentro do menu
 * **daquele perfil** — que nunca mais abre. Ou seja: **bloquear era
 * irreversível pelo aplicativo**.
 *
 * Decisão do cliente de 19/10/2026: a lista mora na gaveta do `Perfil` e o
 * desbloqueio acontece ali, por `unblockUser` — que já existia e **não muda**.
 * O que não se fez, de propósito, foi mexer na simetria: é ela que protege quem
 * bloqueia por estar sendo perseguido.
 *
 * ## `/me/blocks`, e não `GET /users/{userRef}/blocks`
 *
 * O segundo endereço seria "esta pessoa está bloqueada?", que é uma pergunta
 * sobre um par — e a resposta dela, para quem foi bloqueado, é o oráculo. Este
 * endereço só tem um sujeito possível: quem chama.
 *
 * ## O teto é o de LEITURA, e não o de 60/24h de bloquear
 *
 * 600 por hora por conta, como as outras leituras de página desta casa. Ler a
 * própria lista não é superfície de varredura: ela devolve exatamente o que quem
 * chama escreveu, e nada mais existe para enumerar por ali.
 */
export const rotaDeQuemEuBloqueei = defineRoute({
  operationId: 'listMyBlocks',
  method: 'get',
  path: '/me/blocks',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/**
 * **60 por dia**, e o teto é generoso de propósito.
 *
 * Bloquear é a ação de ALÍVIO desta fatia: quem está sendo assediado por várias
 * contas precisa poder bloquear todas, e um teto apertado puniria a vítima. O
 * teto existe contra o laço automatizado que varreria a base inteira — não
 * contra a pessoa.
 */
export const rotaDeBloquear = defineRoute({
  operationId: 'blockUser',
  method: 'post',
  path: '/users/:userRef/blocks',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDeDesbloquear = defineRoute({
  operationId: 'unblockUser',
  method: 'delete',
  path: '/users/:userRef/blocks',
  effects: [],
  // O MESMO orçamento: bloquear e desbloquear em laço não pode ser o caminho
  // que contorna o teto.
  rateLimit: [{ dimension: ['account'], limit: 60, window: '24h', onExceed: 'deny_429' }],
});

/**
 * Denúncia de PERFIL: **5 por dia**, e é o teto mais apertado dos três.
 *
 * Denunciar um perfil é falar sobre QUEM ALGUÉM É, e não sobre um conteúdo:
 * cinco por dia é mais do que qualquer pessoa de boa-fé encontra. A segunda
 * entrada é o balde compartilhado do total.
 */
export const rotaDeDenunciarPerfil = defineRoute({
  operationId: 'reportUserProfile',
  method: 'post',
  path: '/users/:userRef/reports',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' },
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

/**
 * Denúncia de FOTO: só o teto total, e a diferença em relação ao perfil é
 * deliberada — quem abre uma galeria encontra várias fotos de uma vez, e um
 * teto de cinco a faria escolher quais denunciar.
 */
export const rotaDeDenunciarFoto = defineRoute({
  operationId: 'reportPhoto',
  method: 'post',
  path: '/photos/:photoRef/reports',
  effects: [],
  rateLimit: [
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

export const rotaDeDenunciarPublicacao = defineRoute({
  operationId: 'reportPublication',
  method: 'post',
  path: '/publications/:publicationRef/reports',
  effects: [],
  rateLimit: [
    { bucket: 'community_report', dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' },
  ],
});

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function tokenDaRequisicao(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

/** MEMOIZADO: o teto por `account` e o manipulador precisam do mesmo dono. */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<UserId> {
  return memoDaRequisicao(request, 'seguranca:chamador', async () => {
    const token = tokenDaRequisicao(request);
    if (token === undefined) throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

/** `account` para o teto. Sem credencial válida não há balde de conta. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/** O IP vai EM CLARO: a porta da trilha o transforma em HMAC (SEC-010). */
async function autorDoAto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeSeguranca,
): Promise<AutorDoAto> {
  return {
    userId: await chamadorAutenticado(request, deps),
    correlationId: request.id,
    ip: request.ip,
  };
}

/** O `400` de denunciar o próprio conteúdo, um `code` por alvo. */
const CAMPO_E_CODIGO: Record<AlvoDaDenuncia, { field: string; code: string; message: string }> = {
  profile: {
    field: 'userRef',
    code: 'own_profile',
    message: 'Este perfil é seu. Para mudá-lo, edite os seus dados.',
  },
  photo: {
    field: 'photoRef',
    code: 'own_photo',
    message: 'Esta foto é sua. Para tirá-la do ar, remova-a.',
  },
  publication: {
    field: 'publicationRef',
    code: 'own_publication',
    message: 'Esta publicação é sua. Para tirá-la do ar, apague-a.',
  },
};

/** Perfil é dado de duas pessoas, e esta lista é dado de quem chama: nada em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

/** O teto de página do contrato, COPIADO de lá (`MyBlockPage.limit`). */
const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 20;

/**
 * `page` e `limit` da consulta, com o padrão e o teto do contrato.
 *
 * **O `400` de valor fora da faixa NÃO nasce aqui, e foi medido:**
 * `vigiarParametrosDasRotas` confere `minimum`/`maximum` contra o contrato
 * antes de o manipulador existir, e `?limit=0` sai
 * `400 validation-failed` com `{"field":"limit","code":"minimum"}` — medido à
 * mão em 19/10/2026.
 *
 * Então o recorte abaixo é SEGUNDA linha, e não a primeira: ele existe para que
 * um valor que chegue sem passar pelo validador (rota registrada sem a
 * conferência, que é outro defeito) não vire `LIMIT NaN` nem uma página de
 * tamanho arbitrário. Ele nunca inventa `400` — o contrato declara `default`, e
 * cair no padrão é o comportamento declarado.
 */
function paginaPedida(request: FastifyRequest): { page: number; limit: number } {
  const consulta = (request.query ?? {}) as Record<string, unknown>;
  const inteiro = (valor: unknown): number | undefined => {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 ? n : undefined;
  };
  const limite = inteiro(consulta['limit']) ?? LIMITE_PADRAO;
  return {
    page: inteiro(consulta['page']) ?? 1,
    limit: limite > LIMITE_MAXIMO ? LIMITE_MAXIMO : limite,
  };
}

/**
 * Uma linha como `BlockedPerson` a declara: **QUATRO chaves, e nenhuma quinta**.
 *
 * **Exportada para a isca**, como os `comoResposta` da casa: nenhum portão deste
 * repositório confere o CORPO da resposta, e chamar a projeção é o único jeito
 * de medir em suíte o conjunto de chaves que atravessa a borda.
 *
 * O que NÃO está aqui, e cada ausência tem dono:
 *
 * - **foto** — a emenda 3 do ADR-0010 abriu a foto de perfil em uma superfície,
 *   a conversa mediada, e **só entre conexões aceitas**. Bloqueado é o oposto
 *   de conexão aceita;
 * - **`pets_count` e `connections_count`** — são sinal de confiança de um
 *   PERFIL, e a pergunta desta linha é "qual das pessoas que eu bloqueei é
 *   esta". Contagem não identifica ninguém;
 * - **`connection_state`** — desbloquear não devolve a conexão, e um estado aqui
 *   convidaria a uma religação que a operação não faz.
 */
export function comoRespostaDoBloqueio(pessoa: PessoaQueEuBloqueei): Record<string, unknown> {
  return {
    public_ref: pessoa.publicRef,
    handle: pessoa.handle,
    display_name: pessoa.displayName,
    blocked_at: comoIso(pessoa.bloqueadoEm),
  };
}

export function registrarRotasDeSeguranca(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeSeguranca,
): void {
  const porConta = {
    resolvedores: { account: (request: FastifyRequest) => contaDoTeto(request, deps) },
  };

  // A LISTA DE QUEM EU BLOQUEEI. **Não há parâmetro de pessoa e não há `404`**:
  // o único sujeito possível desta rota é quem chama, e lista vazia é `200` com
  // `items: []` — "não bloqueei ninguém" é uma resposta, não um erro.
  registrarRota(
    app,
    rotaDeQuemEuBloqueei,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await autorDoAto(request, deps);
      const pagina = paginaPedida(request);
      const lista = await deps.seguranca.quemEuBloqueei(autor, pagina);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send({
          items: lista.items.map(comoRespostaDoBloqueio),
          total: lista.total,
          page: pagina.page,
          limit: pagina.limit,
        });
    },
  );

  registrarRota(app, rotaDeBloquear, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const autor = await autorDoAto(request, deps);
    const desfecho = await deps.seguranca.bloquear(autor, parametro(request, 'userRef'));

    // `ausente` cobre os três casos de uma vez, e os três respondem IGUAL:
    // pessoa inexistente, conta desabilitada e **conta que já bloqueou quem
    // chama**. Distinguir seria o oráculo.
    if (desfecho === 'ausente') throw problemas.naoEncontrado();
    // Bloquear a si mesmo: o endereço é o próprio, então quem chama sabe de
    // quem é — não há o que esconder, e um `404` aqui seria mentira sobre a
    // própria existência.
    if (desfecho === 'eu_mesmo') {
      throw problemas.validacao([
        { field: 'userRef', code: 'own_profile', message: 'Este perfil é seu.' },
      ]);
    }

    // `204` e não `200`: não há nada a devolver. **Bloquear de novo responde o
    // mesmo `204`**, e não `409`.
    return reply.status(204).send();
  });

  registrarRota(app, rotaDeDesbloquear, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const autor = await autorDoAto(request, deps);
    const desfecho = await deps.seguranca.desbloquear(autor, parametro(request, 'userRef'));
    if (desfecho === 'ausente') throw problemas.naoEncontrado();
    // Desbloquear quem não estava bloqueado responde o mesmo `204`.
    return reply.status(204).send();
  });

  // AS TRÊS DENÚNCIAS, por um registrador só. A mecânica é a mesma e o que muda
  // é o alvo e o nome do parâmetro — três cópias deste corpo seriam três
  // lugares onde uma correção pode faltar.
  const denuncias = [
    { rota: rotaDeDenunciarPerfil, alvo: 'profile', parametro: 'userRef' },
    { rota: rotaDeDenunciarFoto, alvo: 'photo', parametro: 'photoRef' },
    { rota: rotaDeDenunciarPublicacao, alvo: 'publication', parametro: 'publicationRef' },
  ] as const satisfies readonly { rota: unknown; alvo: AlvoDaDenuncia; parametro: string }[];

  for (const { rota, alvo, parametro: nomeDoParametro } of denuncias) {
    registrarRota(app, rota, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await autorDoAto(request, deps);
      const desfecho = await deps.seguranca.denunciar(
        autor,
        alvo,
        parametro(request, nomeDoParametro),
        request.body,
      );

      if (desfecho.tipo === 'invalida') throw problemas.validacao(desfecho.erros);
      if (desfecho.tipo === 'ausente') throw problemas.naoEncontrado();
      if (desfecho.tipo === 'eu_mesmo') throw problemas.validacao([CAMPO_E_CODIGO[alvo]]);

      // **`202` e não `200`**: o que esta rota promete é que o pedido foi
      // recebido, não que alguém já olhou. E é tudo o que o denunciante recebe:
      // nenhum identificador, nenhum estado, NENHUM PRAZO.
      return reply.status(202).send(O_QUE_O_DENUNCIANTE_RECEBE);
    });
  }
}
