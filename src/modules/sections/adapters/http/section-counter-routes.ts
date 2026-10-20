/**
 * As DUAS rotas dos contadores das abas `Pets` e `Rede` (BICHUS-278).
 *
 * `effects`, `rateLimit` e `operationId` **espelham** `api/openapi.yaml`, e
 * `rotas-registradas-contra-o-contrato` compara os dois.
 *
 * ## UMA leitura para TRES contagens
 *
 * A barra de baixo desenha os cinco selos de uma vez, na abertura do app e em
 * cada retomada. Tres rotas fariam tres viagens para pintar uma barra.
 *
 * ## AS DUAS ESTAO REGISTRADAS, e ha isca cobrando isso
 *
 * `POST /v1/me/conversations-seen` ficou **404 em homologacao** por faltar UMA
 * chamada de `registrarRota`: a rota estava declarada e exportada, o servico
 * existia, o repositorio existia e o app CHAMAVA -- e nenhum portao pegou,
 * porque `rotas-registradas-contra-o-contrato` compara os `defineRoute`
 * EXPORTADOS com a spec e nunca pergunta se `registrarRota` foi chamada. O
 * efeito foi inteiro: o contador de mensagens nao zerava por nenhum caminho, e
 * calado, porque o app engole a falha dessa chamada.
 *
 * Estas duas rotas sao do mesmo tipo, entao
 * `contadores-de-secao-estao-registrados.test.ts` chama
 * `registrarRotasDosContadoresDeSecao` -- a funcao de PRODUCAO, a mesma que
 * `src/bin/api.ts` chama -- e manda as duas requisicoes no servidor que saiu
 * dela. Comentar qualquer um dos dois blocos abaixo reprova por nome.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ChamadorDosContadores,
  ContadoresDeSecaoService,
} from '../../application/contadores-de-secao-service.js';
import type { ContadoresDeSecao } from '../../ports/contadores-de-secao.js';
import type { SecaoComContador } from '../../ports/marcadores-de-secao.js';

export const rotaDeContadoresDeSecao = defineRoute({
  operationId: 'getSectionCounters',
  method: 'get',
  path: '/me/section-counters',
  effects: [],
});

/**
 * `effects` vazio E teto declarado, como `markMyConversationsSeen`: a regra de
 * `x-effects` e piso e nao teto. Esta rota escreve, e nao notifica ninguem nem
 * gera trabalho humano.
 *
 * `accept_and_deduplicate` e **nao** `deny_429`: a tela chama isto a cada
 * entrada na area, e trocar de aba e voltar e normal. Um 429 aqui deixaria o
 * selo ACESO para quem acabou de olhar.
 *
 * **Em `/me/sections-seen` e nao em `/me/sections/:section/seen`**: pelo mesmo
 * motivo de `conversations-seen`, nao se escreve no contrato uma garantia que
 * depende da precedencia do roteador.
 */
export const rotaDeSecaoVista = defineRoute({
  operationId: 'markMySectionSeen',
  method: 'post',
  path: '/me/sections-seen',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 240, window: '1h', onExceed: 'accept_and_deduplicate' },
  ],
});

export interface AutenticadorDosContadores {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDosContadores {
  readonly contadores: ContadoresDeSecaoService;
  readonly autenticador: AutenticadorDosContadores;
  readonly contrato: Contrato;
}

/**
 * A resposta, campo a campo e nunca por espalhamento.
 *
 * Os nomes de fora sao os do contrato e os de dentro sao os do dominio, e a
 * traducao e aqui: `SectionCounters` nao e o objeto do servico com outra caixa.
 */
function comoResposta(contadores: ContadoresDeSecao): Record<string, unknown> {
  return {
    lost_pets_new: contadores.perdidosNovos,
    network_events_new: contadores.eventosNovos,
    network_directory_new: contadores.profissionaisNovos,
  };
}

/**
 * MEMOIZADA por requisicao, como nas rotas da caixa: o teto por `account`
 * precisa do dono antes do handler, e o handler precisa do mesmo dono.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDosContadores,
): Promise<ChamadorDosContadores> {
  return memoDaRequisicao(request, 'contadores:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId };
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDosContadores,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

/**
 * O esquema do corpo, do CONTRATO e nunca escrito a mao. Mesma forma da funcao
 * homonima de `conversation-routes.ts`: operacao que declara corpo e nao tem
 * esquema e defeito de especificacao, e estourar no REGISTRO -- na subida, nao
 * no pedido -- e o que impede a rota de nascer aceitando qualquer coisa.
 */
function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

interface BuscaDosContadores {
  city?: string;
}

interface CorpoDaSecaoVista {
  section: SecaoComContador;
  city?: string;
}

export function registrarRotasDosContadoresDeSecao(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDosContadores,
): void {
  registrarRota(app, rotaDeContadoresDeSecao, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    // `city` chega validada: `vigiarParametrosDasRotas` instala
    // `schema.querystring` a partir do contrato, e e o contrato que exige
    // `minLength: 2` -- `city=` vazio e 400 e nao geografia aberta.
    const busca = request.query as BuscaDosContadores;
    const contadores = await deps.contadores.contar(chamador, busca.city);
    return reply.status(200).send(comoResposta(contadores));
  });

  registrarRota(
    app,
    rotaDeSecaoVista,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeSecaoVista.operationId) },
      // `additionalProperties: false` NO CONTRATO NAO FECHA O CORPO EM
      // EXECUCAO, e eu medi isto na rota de pe em 20/10/2026 antes de instalar
      // o guarda:
      //
      //   POST /v1/me/sections-seen {"section":"pets","inventado":1}  ->  200
      //
      // Duzentos, e o campo desapareceu: o Ajv do Fastify roda com
      // `removeAdditional: true` e **apaga** o desconhecido em silencio em vez
      // de recusar. O arquivo `corpo-fechado.ts` existe por causa desse
      // defeito, com duas rotas em que ele ja custou caro (um `label` e um
      // CPF aceitos com recibo de sucesso e nunca gravados).
      //
      // Aqui o campo que importa e `city`: quem errar o nome dele -- `cidade`,
      // `city_name` -- receberia **200 com os contadores do pais inteiro** e
      // acreditaria ter recortado por cidade. O 400 e o unico desfecho honesto.
      preValidation: [
        recusarCampoDesconhecido(
          corpoDe(deps.contrato, rotaDeSecaoVista.operationId),
          rotaDeSecaoVista.operationId,
        ),
      ],
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDaSecaoVista;
      // O corpo chega validado pelo contrato: `section` fora do `enum` e 400
      // antes do handler, e e por isso que nao ha `switch` de defesa aqui. O
      // `CHECK` do banco e a terceira linha, e nao a primeira.
      const contadores = await deps.contadores.marcarVista(chamador, corpo.section, corpo.city);
      return reply.status(200).send(comoResposta(contadores));
    },
  );
}
