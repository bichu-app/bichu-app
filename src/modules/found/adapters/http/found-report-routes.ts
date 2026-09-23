/**
 * Rotas do achado avulso (BICHUS-35).
 *
 * Quatro pontos desta fiação que não são detalhe:
 *
 * - **`createStrayFoundReport` exige conta.** O contrato declara `bearerAuth`
 *   ("exige conta, regra fechada no briefing"), e a história põe isso em *Fora
 *   desta história*: "registro de achado por quem não tem conta, que a regra de
 *   acesso exige". Quem acha um pet COM plaquinha continua avisando sem conta,
 *   pela rota do QR — são portas diferentes de propósito.
 * - **A conversão de data acontece AQUI**, na borda. A camada de aplicação não
 *   constrói `Date`, e uma data malformada precisa virar `validation-failed` com
 *   o nome do campo antes de chegar ao serviço.
 * - **A resposta não tem coordenada.** Nem para quem registrou: a pessoa já sabe
 *   onde estava, e o campo só existiria para vazar depois. O que sai é
 *   `area_label`, por `rotuloDaArea`.
 * - **A resposta não tem `case_id`.** O achado pode ter se ligado a um caso pelo
 *   `share_token`, e devolver qual contaria a quem registrou qual pet de qual
 *   tutor está sendo procurado — antes de qualquer confirmação humana, e para
 *   quem, no pior caso, é o falso achador. O ADR-0010 item 7 proíbe o
 *   agrupamento; o portão de contrato, que só procura o que sumiu, não veria a
 *   propriedade a mais.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { FoundReportService } from '../../application/found-report-service.js';
import { rotuloDaArea, type AchadoGravado } from '../../domain/registro-de-achado.js';
import type { Especie, Porte, Sexo } from '../../domain/cruzamento.js';
import type { FoundReportId, Instant, UserId } from '../../../../shared/types/brands.js';

/**
 * Os dois tetos são os do contrato, copiados dele e não escolhidos aqui.
 *
 * `hold_for_review` **não recusa** (`aplicacao-de-teto.ts`): só `deny_429`
 * recusa. Ele conta e alerta, e está aqui porque o contrato o declara.
 *
 * Por que `account` é a dimensão, e não `ip`: a rota é autenticada, então
 * `account` existe e é exata. Teto por `ip` seria armadilha no Brasil, onde o
 * CGNAT das operadoras põe muita gente atrás de poucos endereços — ele pegaria
 * vizinhos inocentes e erraria o abusador. E o que se protege aqui é caro de
 * verdade: cada achado enfileira um cruzamento geoespacial contra todos os casos
 * abertos, e é `expensive_query` no contrato por isso.
 */
export const rotaDeRegistroDeAchado = defineRoute({
  operationId: 'createStrayFoundReport',
  method: 'post',
  path: '/found-reports',
  effects: ['notifies', 'human_work', 'expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '24h', onExceed: 'deny_429' },
    { dimension: ['account'], limit: 30, window: '30d', onExceed: 'hold_for_review' },
  ],
});

export const rotaDaListaDeAchados = defineRoute({
  operationId: 'listMyFoundReports',
  method: 'get',
  path: '/found-reports',
  effects: [],
});

export const rotaDoAchado = defineRoute({
  operationId: 'getFoundReport',
  method: 'get',
  path: '/found-reports/:foundReportId',
  effects: [],
});

export const rotaDeEnriquecimento = defineRoute({
  operationId: 'enrichFoundReport',
  method: 'patch',
  path: '/found-reports/:foundReportId',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * A intenção de envio da foto do achador.
 *
 * O teto é por **aviso** e não por conta, e a janela é `lifetime`: é o SEC-009
 * ("3 fotos e 2 MB por foto no aviso do achador") copiado do contrato. Um teto
 * por conta faria o segundo animal da noite ficar sem foto nenhuma; um teto por
 * hora deixaria o quarto upload passar na hora seguinte, e "três fotos" viraria
 * "três fotos por hora, para sempre".
 *
 * O teto da borda é um freio grosso — ele conta requisição, inclusive a que vai
 * responder 415. A garantia de verdade é a contagem de `upload_intents` do
 * serviço, e as duas são independentes de propósito (ADR-0001): basta um job ou
 * uma rota interna nova para a borda ser contornada.
 */
export const rotaDeIntencaoDeFotoDoAchado = defineRoute({
  operationId: 'createFoundReportPhotoUploadIntent',
  method: 'post',
  path: '/media/found-report-photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [
    { dimension: ['found_report'], limit: 3, window: 'lifetime', onExceed: 'deny_429' },
  ],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeAchado {
  readonly achados: FoundReportService;
  readonly autenticador: Autenticador;
  readonly idempotencia: Idempotencia;
  readonly contrato: Contrato;
  readonly clock: Clock;
}

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

/** MEMOIZADA: o teto por `account` e o handler precisam do mesmo dono. */
function relatorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAchado,
): Promise<UserId> {
  return memoDaRequisicao(request, 'found:relator', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

/** `account` para o teto. Sem credencial válida não há balde de conta. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAchado,
): Promise<string | undefined> {
  try {
    return await relatorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/**
 * `found_report` para o teto da foto.
 *
 * Sai do corpo, e por isso a entrada é aplicada em `preValidation` e não em
 * `onRequest` — `faseDa` decide isso sozinho, pela dimensão.
 *
 * Devolver `undefined` faz a entrada ser **pulada**, e aqui isso é o certo: sem
 * identificador de aviso não existe balde, e contar todas as requisições sem
 * `found_report_id` num balde só juntaria pessoas que não têm relação nenhuma.
 * O corpo malformado é recusado pela validação de schema logo adiante.
 */
function achadoDoTeto(request: FastifyRequest): string | undefined {
  const corpo = request.body as { found_report_id?: unknown } | undefined;
  const id = corpo?.found_report_id;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

function achadoDoCaminho(request: FastifyRequest): FoundReportId {
  const { foundReportId } = request.params as { foundReportId?: string };
  if (typeof foundReportId !== 'string' || foundReportId === '') throw problemas.naoEncontrado();
  return foundReportId as FoundReportId;
}

/**
 * A data de "quando eu achei", vinda como ISO.
 *
 * Recusa o que não é data; o futuro é recusado no domínio, junto com as outras
 * regras de registro, para que a tela receba a lista inteira de problemas de uma
 * vez em vez de descobri-los um por requisição.
 */
function instanteDeAchado(bruto: unknown): Instant {
  const ms = typeof bruto === 'string' ? Date.parse(bruto) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw problemas.validacao([{ field: 'found_at', code: 'invalid', message: 'Data inválida.' }]);
  }
  return ms as Instant;
}

/**
 * `FoundReport`, campo a campo como o contrato o declara. **Doze campos e nenhum
 * a mais.**
 *
 * `photo_url` sai **nulo enquanto não houver conversa mediada**, e isso é o
 * critério 9 e não uma pendência escondida: a foto do achador "é vista pelo
 * tutor dentro da conversa mediada, e só". Quem chama estas rotas é o achador, e
 * assinar uma URL de leitura para ele aqui criaria a superfície que o critério
 * fecha. Montar o endereço de um objeto que ninguém pode abrir seria uma promessa
 * que o cliente descobre quebrada na hora de desenhar a tela — é a mesma decisão
 * de `thumb_url`/`card_url` em `media-routes.ts`.
 *
 * `conversation_id` sai nulo pelo mesmo motivo: não há conversa nesta entrega, e
 * inventar um identificador seria pior que a ausência.
 */
function comoResposta(achado: AchadoGravado): Record<string, unknown> {
  return {
    id: achado.id,
    origin: achado.origin,
    status: achado.status,
    ...(achado.especie === null ? {} : { species: achado.especie }),
    ...(achado.porte === null ? {} : { size: achado.porte }),
    area_label: rotuloDaArea({
      city: achado.cidade ?? undefined,
      neighborhood: achado.bairro ?? undefined,
    }),
    found_at: achado.achadoEm.toISOString(),
    photo_url: null,
    notes: achado.observacao,
    conversation_id: null,
    created_at: achado.criadoEm.toISOString(),
  };
}

export function registrarRotasDeAchado(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeAchado,
): void {
  registrarRota(
    app,
    rotaDeRegistroDeAchado,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeRegistroDeAchado.operationId) },
      config: { idempotencia: true },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const relator = await relatorAutenticado(request, deps);
      const corpo = request.body as {
        species: Especie;
        size: Porte;
        sex?: Sexo;
        breed_code?: string;
        breed_free_text?: string;
        ref_data_version?: string;
        primary_color_code?: string;
        found_at: string;
        location?: { lat: number; lon: number };
        area?: { city: string; neighborhood?: string; state?: string };
        share_token?: string;
        notes?: string;
        photo_upload_id?: string;
      };

      // `Idempotency-Key` está declarado no contrato, e o portão de subida
      // derruba a aplicação se a rota divergir. O defeito que a máquina evita é
      // o do critério 5: o rascunho local é reenviado quando a conexão volta, e
      // sem ela cada reenvio seria um achado novo — a mesma tutora receberia a
      // mesma sugestão três vezes, e o produto pareceria estar chutando.
      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeRegistroDeAchado.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken: relator,
          endpoint: `${rotaDeRegistroDeAchado.method.toUpperCase()} ${rotaDeRegistroDeAchado.path}`,
          // `/found-reports` nao tem parametro de caminho.
          parametrosDeCaminho: {},
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: comoResposta(
            await deps.achados.registrar(
              {
                especie: corpo.species,
                porte: corpo.size,
                ...(corpo.sex === undefined ? {} : { sexo: corpo.sex }),
                ...(corpo.breed_code === undefined ? {} : { racaCodigo: corpo.breed_code }),
                ...(corpo.breed_free_text === undefined
                  ? {}
                  : { racaTextoLivre: corpo.breed_free_text }),
                ...(corpo.ref_data_version === undefined
                  ? {}
                  : { versaoDosDadosDeReferencia: corpo.ref_data_version }),
                ...(corpo.primary_color_code === undefined
                  ? {}
                  : { corPrimariaCodigo: corpo.primary_color_code }),
                achadoEm: instanteDeAchado(corpo.found_at),
                onde: {
                  ...(corpo.location === undefined
                    ? {}
                    : { lat: corpo.location.lat, lon: corpo.location.lon }),
                  ...(corpo.area === undefined
                    ? {}
                    : {
                        city: corpo.area.city,
                        ...(corpo.area.neighborhood === undefined
                          ? {}
                          : { neighborhood: corpo.area.neighborhood }),
                        ...(corpo.area.state === undefined ? {} : { state: corpo.area.state }),
                      }),
                },
                ...(corpo.notes === undefined ? {} : { observacao: corpo.notes }),
                ...(corpo.share_token === undefined ? {} : { shareToken: corpo.share_token }),
                // `photo_upload_id` é lido do corpo e **não é usado**, e isso é
                // uma tensão do contrato, não um esquecimento.
                //
                // Para existir um `upload_id` de foto de achado é preciso
                // chamar `createFoundReportPhotoUploadIntent`, que exige
                // `found_report_id` no corpo — ou seja, exige que o achado já
                // exista. Não há como obter um valor válido para este campo
                // ANTES da chamada que o recebe, e o único outro emissor de
                // intenção (`createPetPhotoUploadIntent`) exige um `pet_id`,
                // que o achado avulso não tem.
                //
                // O desenho da história é o mesmo: o critério 4 manda registrar
                // o achado SEM a foto quando o upload falha, com o envio
                // seguindo em segundo plano. A foto vem depois, sempre.
                //
                // Não recuso o campo porque o contrato o declara e recusá-lo
                // quebraria um cliente que o lê. Não o uso porque não existe
                // valor que eu possa honrar. Está na pauta de refinamento como
                // pergunta fechada, junto do 415.
              },
              relator,
            ),
          ),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  registrarRota(app, rotaDaListaDeAchados, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const relator = await relatorAutenticado(request, deps);
    const { cursor, limit } = request.query as { cursor?: string; limit?: number };
    const pagina = await deps.achados.listarDoRelator(
      relator,
      limit === undefined ? Number.NaN : Number(limit),
      cursor ?? null,
    );
    return reply.status(200).send({
      items: pagina.itens.map(comoResposta),
      next_cursor: pagina.proximoCursor,
    });
  });

  registrarRota(app, rotaDoAchado, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const relator = await relatorAutenticado(request, deps);
    const achado = await deps.achados.buscar(achadoDoCaminho(request), relator);
    return reply.status(200).send(comoResposta(achado));
  });

  registrarRota(
    app,
    rotaDeEnriquecimento,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEnriquecimento.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const relator = await relatorAutenticado(request, deps);
      const corpo = request.body as {
        message?: string;
        location?: { lat?: number; lon?: number };
      };

      const achado = await deps.achados.enriquecer(achadoDoCaminho(request), relator, {
        ...(corpo.message === undefined ? {} : { observacao: corpo.message }),
        ...(corpo.location?.lat === undefined ? {} : { lat: corpo.location.lat }),
        ...(corpo.location?.lon === undefined ? {} : { lon: corpo.location.lon }),
      });
      return reply.status(200).send(comoResposta(achado));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDeFotoDoAchado,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDeFotoDoAchado.operationId) },
      resolvedores: { found_report: (request) => achadoDoTeto(request) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const relator = await relatorAutenticado(request, deps);
      const corpo = request.body as {
        found_report_id: string;
        content_type: string;
        byte_size: number;
      };

      const { uploadId, autorizacao } = await deps.achados.autorizarFotoDoAchado(
        corpo.found_report_id as FoundReportId,
        relator,
        corpo.content_type,
        corpo.byte_size,
      );

      return reply.status(201).send({
        upload_id: uploadId,
        method: autorizacao.metodo,
        url: autorizacao.url,
        // Um dos dois, nunca os dois: `POST` leva campos de formulário, `PUT`
        // leva cabeçalhos assinados. O cliente LÊ `method` em vez de presumir.
        ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
        ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
        expires_at: autorizacao.expiraEm.toISOString(),
        max_bytes: autorizacao.maxBytes,
      });
    },
  );
}
