import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type {
  CorpoDaIntencaoDaVitrine,
  CorpoDaVitrine,
  VitrineDeFotos,
} from '../../application/vitrine-de-fotos-service.js';
import type { FotoDaVitrine } from '../../ports/vitrine-repository.js';
import { TETO_DE_FOTOS_DA_VITRINE } from '../../domain/vitrine-de-fotos.js';

export const rotaDaMinhaVitrine = defineRoute({
  operationId: 'getMyShowcase',
  method: 'get',
  path: '/me/showcase',
  effects: [],
});

/**
 * Assinar é barato, mas cada assinatura é uma autorização de escrita que **não se
 * desfaz dentro da validade**.
 */
export const rotaDeIntencaoDaVitrine = defineRoute({
  operationId: 'createShowcasePhotoUploadIntent',
  method: 'post',
  path: '/me/showcase/photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeEscritaDaVitrine = defineRoute({
  operationId: 'replaceMyShowcase',
  method: 'put',
  path: '/me/showcase',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDaVitrineDeFotos {
  readonly vitrine: VitrineDeFotos;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  /** Domínio de mídia, separado da origem da aplicação (ADR-0007). */
  readonly baseDeMidia: AbsoluteUrl;
}

function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaVitrineDeFotos,
): Promise<UserId> {
  return memoDaRequisicao(request, 'showcase:dono', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaVitrineDeFotos,
): Promise<string | undefined> {
  try {
    return await donoAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

function comoRespostaDaFoto(foto: FotoDaVitrine, baseDeMidia: AbsoluteUrl): Record<string, unknown> {
  const url = (chave: string | null): string | null =>
    chave === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${chave}`;

  return {
    upload_id: foto.uploadId,
    position: foto.position,
    status: foto.status,
    grid_url: url(foto.gradeKey),
    open_url: url(foto.abertaKey),
    rejection_reason: foto.rejectionReason,
    alt_text: foto.altText,
  };
}

function comoRespostaDaVitrine(
  fotos: readonly FotoDaVitrine[],
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    photos: fotos.map((foto) => comoRespostaDaFoto(foto, baseDeMidia)),
    max_photos: TETO_DE_FOTOS_DA_VITRINE,
  };
}

/**
 * `...DaVitrineDeFotos`, e nao `...DaVitrine`: **a palavra "vitrine" ja tem dono
 * neste repositorio.** `registrarRotasDaVitrine` e a da LOJA (o catalogo de
 * produto), e `DependenciasDasRotasDaVitrine` tambem.
 */
export function registrarRotasDaVitrineDeFotos(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaVitrineDeFotos,
): void {
  registrarRota(
    app,
    rotaDaMinhaVitrine,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const fotos = await deps.vitrine.minhaVitrine(dono);
      return reply.status(200).send(comoRespostaDaVitrine(fotos, deps.baseDeMidia));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDaVitrine,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDaVitrine.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.vitrine.autorizarEnvio(
        dono,
        request.body as CorpoDaIntencaoDaVitrine,
      );
      return reply.status(201).send({
        upload_id: uploadId,
        method: autorizacao.metodo,
        url: autorizacao.url,
        ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
        ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
        expires_at: autorizacao.expiraEm.toISOString(),
        max_bytes: autorizacao.maxBytes,
      });
    },
  );

  registrarRota(
    app,
    rotaDeEscritaDaVitrine,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEscritaDaVitrine.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const fotos = await deps.vitrine.substituir(dono, request.body as CorpoDaVitrine);
      return reply.status(200).send(comoRespostaDaVitrine(fotos, deps.baseDeMidia));
    },
  );
}
