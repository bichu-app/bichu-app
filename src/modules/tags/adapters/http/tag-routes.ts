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
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
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
  effects: ['reveals_credential', 'irreversible_write'],
  rateLimit: [{ dimension: ['pet'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

/** A imagem do QR para impressão. */
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
  /** Base pública desta API, de onde sai `qr_png_url`. */
  readonly baseDaApi: string;
}

const PREFIXO_DA_API = '/v1';

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

interface ChamadorComConta extends Chamador {
  readonly userId: UserId;
}

function aplicarHigieneDaRotaPublica(reply: FastifyReply): void {
  void reply.header('X-Robots-Tag', 'noindex, nofollow');
  void reply.header('Referrer-Policy', 'no-referrer');
  void reply.header('Cache-Control', 'no-store');
}

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

/** Os resolvedores de dimensão desta rota pública, e a razão de cada resumo. */
export function resolvedoresDaTag(deps: DependenciasDasRotasDeTag): {
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
      schema: { body: corpoDe(deps.contrato, rotaDeEmissaoDeTag.operationId) },
      resolvedores: { pet: (request) => petIdDoCaminho(request) },
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

      aplicarHigieneDaRotaPublica(reply);
      return reply
        .status(200)
        .type('image/png')
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
        photo_url: resolucao.pet.photoUrl,
      },
      lost: {
        is_lost: resolucao.lost.isLost,
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
      config: { idempotencia: true },
      schema: { body: corpoDe(deps.contrato, rotaDeAvisoPelaTag.operationId) },
      preValidation: [corpoAusenteEhCorpoVazio(deps.contrato, rotaDeAvisoPelaTag.operationId)],
      resolvedores: resolvedoresDaTag(deps),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      aplicarHigieneDaRotaPublica(reply);
      const chamador = await chamadorOpcional(request, deps);
      const corpo = (request.body ?? {}) as { found_at?: string; client_note?: string };

      const canonico = normalizarCodigoDaTag(codigoDoCaminho(request));
      if (canonico === undefined) throw problemas.tagCodeMalformado();

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeAvisoPelaTag.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken:
            chamador.userId ?? `tag:${hashDoCodigoDaTag(canonico, deps.chaveDoIndiceDoCodigo).toString('base64')}`,
          endpoint: `${rotaDeAvisoPelaTag.method.toUpperCase()} ${rotaDeAvisoPelaTag.path}`,
          parametrosDeCaminho: { code: canonico },
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
