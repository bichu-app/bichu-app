/**
 * Rotas do código da tag.
 *
 * Cada rota é declarada com `defineRoute`, e o `operationId` é o mesmo da
 * especificação. `effects` e `rateLimit` **espelham** `api/openapi.yaml`; rota
 * com efeito e sem teto não compila (`shared/http/route-definition.ts`).
 *
 * Três pontos desta fiação que não são detalhe:
 *
 * - **`createFoundReportFromTag` passa por `executarComIdempotencia`.** O
 *   contrato declara `Idempotency-Key` como obrigatória, e o portão de subida
 *   derruba a aplicação se uma rota registrada divergir do contrato nos dois
 *   sentidos. Tirar a marca `config: { idempotencia: true }` daqui não produz um
 *   defeito sutil: produz um serviço que não sobe.
 * - **`resolveTagCode` responde os mesmos campos para os três `viewer`.** Não há
 *   ramo por chamador neste arquivo, e é assim que o ADR-0021 pediu.
 * - **A higiene da rota pública é aplicada por cabeçalho**, porque o código
 *   viaja na URL e isso é inevitável num QR.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { corpoAusenteEhCorpoVazio } from '../../../../shared/http/corpo-opcional.js';
import {
  hashDeAgente,
  hashDoCodigoDaTag,
  hmacDeEnderecoIp,
  hmacDeIdentidadeDoAchador,
} from '../../../../shared/crypto/digest.js';
import { normalizarCodigoDaTag } from '../../domain/tag-code.js';
import type { Chamador, TagService } from '../../application/tag-service.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { TagDoTutor } from '../../ports/tag-repository.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { PetId, TagId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeListagemDeTags = defineRoute({
  operationId: 'listPetTags',
  method: 'get',
  path: '/pets/:petId/tags',
  effects: [],
});

export const rotaDeEmissaoDeTag = defineRoute({
  operationId: 'issuePetTag',
  method: 'post',
  path: '/pets/:petId/tags',
  // Revela a credencial (é a única resposta que traz o código em claro) e cria
  // o que não se desfaz: o código é imutável e não se reativa.
  effects: ['reveals_credential', 'irreversible_write'],
  rateLimit: [{ dimension: ['pet'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

/**
 * A imagem do QR para impressão.
 *
 * `reveals_credential` porque o QR **é** o código: quem tem o arquivo tem a
 * plaquinha. É a segunda e última superfície da API que entrega o código, e a
 * única que o entrega mais de uma vez — por isso ela é autenticada, tem teto por
 * conta, e o teto é `deny_429` e não `serve_cache`.
 */
export const rotaDaImagemDoQr = defineRoute({
  operationId: 'getPetTagQrImage',
  method: 'get',
  path: '/pets/:petId/tags/:tagId/qr.png',
  effects: ['reveals_credential'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeResolucaoDaTag = defineRoute({
  operationId: 'resolveTagCode',
  method: 'get',
  path: '/tags/:code',
  // `GET` com efeito, e o efeito é o registro do scan. Está declarado assim no
  // contrato, e a trilha de leituras é o que sustenta a revogação por suspeita
  // de clonagem.
  effects: ['irreversible_write'],
  rateLimit: [
    { dimension: ['ip', 'code'], limit: 30, window: '1h', onExceed: 'serve_cache' },
    { dimension: ['ip'], limit: 300, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 2000, window: '1h', onExceed: 'log_and_alert' },
    { dimension: ['code'], limit: 100, window: '24h', onExceed: 'notify_owner' },
    {
      dimension: ['finder_identity'],
      appliesTo: 'invalid_attempts',
      limit: 5,
      window: '10m',
      onExceed: 'deny_429',
    },
    {
      dimension: ['ip'],
      appliesTo: 'invalid_attempts',
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
    },
  ],
});

export const rotaDeContextoDoDono = defineRoute({
  operationId: 'getTagOwnerContext',
  method: 'get',
  path: '/tags/:code/owner-context',
  effects: [],
});

export const rotaDeAvisoPelaTag = defineRoute({
  operationId: 'createFoundReportFromTag',
  method: 'post',
  path: '/tags/:code/found-reports',
  effects: ['notifies', 'irreversible_write'],
  rateLimit: [
    { dimension: ['code', 'finder_identity'], limit: 1, window: '6h', onExceed: 'group_notification' },
    {
      dimension: ['code'],
      counts: 'distinct_identities',
      limit: 3,
      window: '1h',
      onExceed: 'group_notification',
    },
    {
      dimension: ['code'],
      counts: 'distinct_identities',
      when: 'pet_not_lost',
      limit: 10,
      window: '24h',
      onExceed: 'notify_once_and_review',
    },
    {
      dimension: ['code'],
      counts: 'distinct_identities',
      when: 'pet_lost',
      limit: 30,
      window: '24h',
      onExceed: 'notify_once_and_review',
    },
    { dimension: ['ip', 'code'], limit: 5, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 40, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 200, window: '1h', onExceed: 'log_and_alert' },
  ],
});

export interface DependenciasDasRotasDeTag {
  readonly tags: TagService;
  readonly autenticador: Autenticador;
  readonly idempotencia: Idempotencia;
  readonly contrato: Contrato;
  readonly clock: Clock;
  readonly ipHmacKey: Buffer;
  /** Chave do índice cego de `code_hash` (ADR-0004, Emenda 1, §3.1). */
  readonly chaveDoIndiceDoCodigo: Buffer;
  /**
   * Base pública desta API, de onde sai `qr_png_url`. É `API_BASE_URL`, e **não**
   * `TAG_BASE_URL`: a plaquinha aponta para o host público da tag, e o endereço
   * da imagem é uma rota autenticada desta API. Trocar as duas faria a emissão
   * prometer um arquivo num host que não serve a API.
   */
  readonly baseDaApi: string;
}

/** Prefixo de versão da API. O mesmo de `PREFIXO_DA_API` em `src/bin/api.ts`. */
const PREFIXO_DA_API = '/v1';

/**
 * O endereço da imagem do QR, montado a partir da **própria rota**.
 *
 * Interpolar `/pets/${petId}/tags/${tagId}/qr.png` à mão aqui criaria a segunda
 * definição do caminho: mudar `rotaDaImagemDoQr.path` moveria a rota registrada
 * e deixaria a promessa da emissão apontando para o endereço antigo — 404 na
 * hora de imprimir, que é o modo de falha que o comentário anterior deste
 * arquivo existia para evitar. Aqui a substituição é sobre a declaração, então
 * as duas se movem juntas.
 */
function enderecoDaImagemDoQr(
  deps: DependenciasDasRotasDeTag,
  petId: PetId,
  tagId: TagId,
): string {
  const caminho = rotaDaImagemDoQr.path
    .replace(':petId', encodeURIComponent(petId))
    .replace(':tagId', encodeURIComponent(tagId));
  return `${deps.baseDaApi}${PREFIXO_DA_API}${caminho}`;
}

/** Chamador que passou pelo token. `userId` é definido, e o tipo diz isso. */
interface ChamadorComConta extends Chamador {
  readonly userId: UserId;
}

/**
 * Schema de corpo tirado da própria especificação. Uma fonte só: schemas de
 * OpenAPI 3.1 são JSON Schema, e o Fastify valida com JSON Schema. Validação
 * escrita à mão em paralelo à spec é a segunda definição que diverge.
 *
 * **Quinta cópia desta função no repositório** (as outras estão em `identity`,
 * `pets`, `lostfound` e `media`, idênticas). Ela é copiada e não importada
 * porque foi assim que as quatro anteriores nasceram; extrair para
 * `shared/http/` vale a pena e toca quatro módulos de uma vez, o que não cabe
 * nesta correção.
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

/**
 * Higiene da rota pública (ADR-0004). O código viaja na URL, e isso é inevitável
 * num QR — o que dá para fazer é impedir que ele seja indexado, que vaze pelo
 * referenciador e que fique guardado em cache intermediário.
 */
function aplicarHigieneDaRotaPublica(reply: FastifyReply): void {
  void reply.header('X-Robots-Tag', 'noindex, nofollow');
  void reply.header('Referrer-Policy', 'no-referrer');
  void reply.header('Cache-Control', 'no-store');
}

/**
 * Autenticação **opcional**, para as duas operações que aceitam chamador sem
 * conta.
 *
 * Sem cabeçalho é anônimo, que é o caminho principal: quem escaneia a plaquinha
 * na rua é um estranho. Com cabeçalho, o token é verificado de verdade e um
 * token inválido ou vencido **recusa** em vez de silenciosamente virar anônimo.
 * Rebaixar aqui esconderia do tutor que a sessão dele acabou, e o app perderia a
 * única deixa que tem para renovar.
 */
async function chamadorOpcional(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTag,
): Promise<Chamador> {
  const cabecalho = request.headers.authorization;
  let userId: UserId | undefined;

  if (typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')) {
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const autenticado = await deps.autenticador.autenticar(token);
    userId = autenticado.userId;
  }

  return montarChamador(request, deps, userId);
}

async function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTag,
): Promise<ChamadorComConta> {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  const autenticado = await deps.autenticador.autenticar(token);
  return { ...montarChamador(request, deps, autenticado.userId), userId: autenticado.userId };
}

function montarChamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTag,
  userId: UserId | undefined,
): Chamador {
  const userAgent =
    typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined;
  return {
    userId,
    ipHmac: hmacDeEnderecoIp(request.ip, deps.ipHmacKey),
    userAgentHash: hashDeAgente(userAgent),
    identidadeDoAchador: hmacDeIdentidadeDoAchador(request.ip, userAgent, deps.ipHmacKey),
    ip: request.ip,
    correlationId: request.id,
  };
}

/**
 * `PetTag` como o contrato o declara. Os campos anuláveis saem explicitamente
 * nulos, e não omitidos: o schema os declara `nullable`, e omitir faria o
 * cliente distinguir "sem valor" de "campo que sumiu" sem nenhum motivo.
 */
function comoPetTag(tag: TagDoTutor): Record<string, unknown> {
  return {
    id: tag.id,
    status: tag.status,
    code_suffix: tag.codeSuffix,
    label: tag.label,
    scan_count: tag.scanCount,
    last_scanned_at: tag.lastScannedAt === null ? null : tag.lastScannedAt.toISOString(),
    revoked_at: tag.revokedAt === null ? null : tag.revokedAt.toISOString(),
    revocation_reason: tag.revocationReason,
    created_at: tag.createdAt.toISOString(),
  };
}

/**
 * Os resolvedores de dimensão desta rota pública, e a razão de cada resumo.
 *
 * - **`code`** é uma credencial ao portador. Ela viaja na URL porque um QR não
 *   tem outro jeito, mas a chave do balde vai para `rate_limit_counters` e fica
 *   lá depois que o pet foi encontrado. Código em claro ali é a plaquinha de
 *   alguém guardada em texto puro numa tabela operacional. Vai resumida, e vem
 *   do código **canônico**: sem normalizar, a mesma plaquinha digitada com e sem
 *   hífen cairia em dois baldes e o teto de 30/h viraria 60.
 * - **`finder_identity`** já nasce resumida no domínio
 *   (`hmacDeIdentidadeDoAchador`), que é o mesmo valor que decide se um segundo
 *   aviso anexa à conversa em vez de tocar o telefone do tutor de novo. Usar
 *   outro cálculo aqui faria o teto contar uma identidade e o produto outra.
 * - **`pet`** é UUID interno, e vai em claro pelo mesmo motivo de `account`:
 *   `bucket_key` não sai em resposta nenhuma e o resumo tornaria impossível
 *   responder qual pet bateu no teto de plaquinhas.
 */
function resolvedoresDaTag(deps: DependenciasDasRotasDeTag): {
  code: ResolvedorDeDimensao;
  finder_identity: ResolvedorDeDimensao;
} {
  return {
    code: (request, sigilo) => {
      const canonico = normalizarCodigoDaTag(codigoDoCaminho(request));
      return canonico === undefined ? undefined : sigilo.hmac(`code:${canonico}`);
    },
    finder_identity: (request) => {
      const userAgent =
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined;
      const identidade = hmacDeIdentidadeDoAchador(request.ip, userAgent, deps.ipHmacKey);
      return identidade === null ? undefined : identidade.toString('base64url');
    },
  };
}

/**
 * `account` para o teto. Sem credencial válida não há balde de conta, e a
 * recusa vem do manipulador — o teto não é o lugar de responder 401.
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTag,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId: string };
  return petId as PetId;
}

function tagIdDoCaminho(request: FastifyRequest): TagId {
  const { tagId } = request.params as { tagId: string };
  return tagId as TagId;
}

function codigoDoCaminho(request: FastifyRequest): string {
  const { code } = request.params as { code: string };
  return code;
}

export function registrarRotasDeTags(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeTag,
): void {
  registrarRota(app, rotaDeListagemDeTags, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const tags = await deps.tags.listar(petIdDoCaminho(request), chamador.userId);
    return reply.status(200).send({ items: tags.map(comoPetTag) });
  });

  registrarRota(
    app,
    rotaDeEmissaoDeTag,
    {
      // Mesmo defeito do `logout`, no módulo das plaquinhas: o manipulador lia
      // `label` de um corpo que o contrato não declarava, então não havia
      // schema para o Fastify aplicar. `label` ia do corpo ao `INSERT` sem
      // nenhuma conferência de tamanho, e quem recusava era o CHECK
      // `pet_tags_label_tamanho` — quer dizer, 41 caracteres ou string vazia
      // viravam **500** numa rota autenticada, quando a resposta certa é 400.
      schema: { body: corpoDe(deps.contrato, rotaDeEmissaoDeTag.operationId) },
      resolvedores: { pet: (request) => petIdDoCaminho(request) },
      // E emitir plaquinha sem apelido continua sendo um POST sem corpo, que é
      // o caminho comum. Vale aqui o mesmo motivo do aviso pela tag, abaixo.
      preValidation: [corpoAusenteEhCorpoVazio(deps.contrato, rotaDeEmissaoDeTag.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = (request.body ?? {}) as { label?: string };
      const emitida = await deps.tags.emitir(
        petIdDoCaminho(request),
        chamador.userId,
        corpo.label ?? null,
        chamador,
      );

      // `qr_png_url` fechando o critério 2 da BICHUS-63. Ele é montado a partir
      // da própria `rotaDaImagemDoQr`, e não de uma cadeia repetida aqui: o
      // endereço prometido e o endereço registrado passam a ser a mesma
      // declaração, e mudar o caminho da rota move os dois de uma vez.
      //
      // Os dois UUID no caminho não contrariam o ADR-0010. O que o item 6
      // proíbe é identificador interno em **saída pública**, e esta resposta é
      // autenticada, para o dono, sobre um `petId` que ele acabou de enviar e um
      // `tagId` que `PetTag.id` já traz nesta mesma linha. O que o ADR nomeia
      // como o erro irreversível do projeto é `pet_id` **no QR**, e o QR carrega
      // só `{base}/t/{código}` (`qr-da-tag.ts`, com isca que decodifica o PNG e
      // reprova se algum UUID aparecer).
      return reply.status(201).send({
        ...comoPetTag(emitida.tag),
        code: emitida.codigo,
        url: emitida.url,
        qr_png_url: enderecoDaImagemDoQr(deps, petIdDoCaminho(request), emitida.tag.id),
      });
    },
  );

  registrarRota(
    app,
    rotaDaImagemDoQr,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const imagem = await deps.tags.imagemDoQr(
        petIdDoCaminho(request),
        tagIdDoCaminho(request),
        chamador.userId,
      );

      // A mesma higiene da rota pública, por um motivo diferente e igualmente
      // concreto: lá o código viaja na URL, aqui ele viaja DENTRO da imagem.
      // `no-store` impede que o QR de um pet fique num cache intermediário, e
      // `noindex`/`no-referrer` valem porque a imagem acaba compartilhada por
      // aplicativo de mensagem na hora de mandar imprimir.
      aplicarHigieneDaRotaPublica(reply);
      return reply
        .status(200)
        .type('image/png')
        // O nome que o navegador e o aparelho oferecem ao salvar. O sufixo de
        // quatro caracteres é o mesmo que o tutor já vê na lista de plaquinhas,
        // e é o que faz ele saber qual arquivo é de qual coleira quando tem
        // mais de uma (critério 4). Nunca o código inteiro: nome de arquivo
        // sobrevive em pasta de download e em histórico de conversa.
        .header('Content-Disposition', `attachment; filename="bichu-tag-${imagem.codeSuffix}.png"`)
        .send(imagem.png);
    },
  );

  registrarRota(
    app,
    rotaDeResolucaoDaTag,
    { resolvedores: resolvedoresDaTag(deps) },
    async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDaRotaPublica(reply);
    const chamador = await chamadorOpcional(request, deps);
    const resolucao = await deps.tags.resolver(codigoDoCaminho(request), chamador);

    return reply.status(200).send({
      viewer: resolucao.viewer,
      pet: {
        display_name: resolucao.pet.displayName,
        species: resolucao.pet.species,
        breed_label: resolucao.pet.breedLabel,
        size: resolucao.pet.size,
        primary_color: resolucao.pet.primaryColor,
        distinctive_marks: resolucao.pet.distinctiveMarks,
        care_notes: resolucao.pet.careNotes,
        // A foto vem do módulo `media`, que não existe nesta entrega. Nulo é o
        // valor verdadeiro; um endereço montado para um objeto que ninguém
        // gravou daria uma imagem quebrada na tela de quem está com o animal.
        photo_url: null,
      },
      lost: {
        is_lost: resolucao.lost.isLost,
        // `since` sai de `lost_cases.opened_at`, que pertence a `lostfound`.
        // Enquanto o caso não existir, o valor verdadeiro é nulo — e o contrato
        // declara o campo anulável.
        since: null,
      },
      already_notified: resolucao.alreadyNotified,
    });
  });

  registrarRota(app, rotaDeContextoDoDono, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDaRotaPublica(reply);
    const chamador = await chamadorAutenticado(request, deps);
    const contexto = await deps.tags.contextoDoDono(
      codigoDoCaminho(request),
      chamador.userId,
    );
    return reply.status(200).send({ pet_id: contexto.petId, tag_id: contexto.tagId });
  });

  registrarRota(
    app,
    rotaDeAvisoPelaTag,
    {
      // A marca que o portão de subida confere contra o contrato. Ela não faz a
      // idempotência acontecer — quem faz é `executarComIdempotencia`, abaixo —,
      // ela faz a divergência entre os dois ser impossível de passar despercebida.
      config: { idempotencia: true },
      // Esta rota é PÚBLICA e sem conta: qualquer pessoa na internet com um
      // código de plaquinha chega aqui. Até esta linha existir, `client_note`
      // ia do corpo direto para `notes` no banco **sem nenhuma conferência de
      // tamanho**, enquanto o contrato declarava `maxLength: 500` — texto de
      // tamanho arbitrário, em rota pública, gravado. O teto vem do contrato e
      // não de um número repetido aqui, que é o que impede os dois de
      // divergirem depois.
      schema: { body: corpoDe(deps.contrato, rotaDeAvisoPelaTag.operationId) },
      // E o corpo continua podendo NÃO VIR. O contrato declara este
      // `requestBody` como `required: false` e diz, com todas as letras, que a
      // operação "precisa funcionar com corpo vazio — um toque, zero campos".
      // Sem este gancho, a linha acima sozinha faria a requisição de um toque
      // responder 400 `body must be object`, porque o Fastify valida
      // `request.body` mesmo quando ele é `undefined`. Validar o tamanho ao
      // preço de quebrar o caminho principal do produto não é correção.
      preValidation: [corpoAusenteEhCorpoVazio(deps.contrato, rotaDeAvisoPelaTag.operationId)],
      resolvedores: resolvedoresDaTag(deps),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      aplicarHigieneDaRotaPublica(reply);
      const chamador = await chamadorOpcional(request, deps);
      const corpo = (request.body ?? {}) as { found_at?: string; client_note?: string };

      // Normaliza ANTES de tocar a idempotência: o código é a credencial do
      // chamador sem conta, e a chave de idempotência é escopada por ele. Sem a
      // normalização, a mesma plaquinha digitada com e sem hífen produziria dois
      // donos de chave diferentes, e o reenvio da fila offline executaria o
      // efeito de novo.
      const canonico = normalizarCodigoDaTag(codigoDoCaminho(request));
      if (canonico === undefined) throw problemas.tagCodeMalformado();

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeAvisoPelaTag.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          // Sem conta, o dono da chave é o resumo da credencial ao portador —
          // que aqui é o próprio código da tag. Com conta, é o usuário. Nos dois
          // casos a chave de um chamador não devolve a resposta de outro.
          donoOuToken:
            chamador.userId ?? `tag:${hashDoCodigoDaTag(canonico, deps.chaveDoIndiceDoCodigo).toString('base64')}`,
          endpoint: `${rotaDeAvisoPelaTag.method.toUpperCase()} ${rotaDeAvisoPelaTag.path}`,
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => {
          const criado = await deps.tags.avisar(canonico, chamador, {
            ...(corpo.found_at === undefined ? {} : { foundAt: corpo.found_at }),
            ...(corpo.client_note === undefined ? {} : { clientNote: corpo.client_note }),
          });
          return {
            status: 201,
            body: {
              finder_token: criado.finderToken,
              conversation_url: criado.conversationUrl,
              owner_notified: criado.ownerNotified,
              pet_display_name: criado.petDisplayName,
            },
          };
        },
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );
}
