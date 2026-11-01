import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { MediaService } from '../../application/media-service.js';
import type {
  CapaDeEncontroDaComunidade,
  CorpoDaIntencaoDeCapa,
} from '../../application/capa-de-encontro-da-comunidade.js';
import type {
  CorpoDaIntencaoDeFoto,
  FotoDoProprioUsuario,
} from '../../application/foto-do-proprio-usuario.js';
import type {
  CorpoDaIntencaoDoLogotipo,
  LogotipoDaIndicacao,
} from '../../application/logotipo-da-indicacao.js';
import type {
  CorpoDaIntencaoDaFoto,
  FotoDaIndicacao,
} from '../../application/foto-da-indicacao.js';
import type { FotoDoPet } from '../../ports/media-repository.js';
import type { AbsoluteUrl, PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeIntencaoDeFoto = defineRoute({
  operationId: 'createPetPhotoUploadIntent',
  method: 'post',
  path: '/media/pet-photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/** A capa do encontro da comunidade (ADR-0025 emenda 3). */
export const rotaDeIntencaoDeCapaDeEncontro = defineRoute({
  operationId: 'createNetworkEventCoverUploadIntent',
  method: 'post',
  path: '/media/network-event-cover-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/** A FOTO DO PROPRIO USUARIO (cliente, 18/10/2026). */
export const rotaDeIntencaoDeFotoDoUsuario = defineRoute({
  operationId: 'createMyPhotoUploadIntent',
  method: 'post',
  path: '/media/my-photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/** O LOGOTIPO DA INDICACAO (cliente, 29/10/2026). */
export const rotaDeIntencaoDoLogotipoDaIndicacao = defineRoute({
  operationId: 'createDirectorySuggestionLogoUploadIntent',
  method: 'post',
  path: '/media/directory-suggestion-logo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/**
 * A FOTO DO ESTABELECIMENTO na indicacao (cliente, 30/10/2026).
 *
 * **O teto e o MESMO de `rotaDeIntencaoDoLogotipoDaIndicacao` (20/1h por
 * conta), e ele NAO foi multiplicado por quatro so porque a tela agora manda
 * ate quatro fotos** -- o espelho do `x-rate-limit` do contrato, com a razao
 * escrita la: multiplicar o teto por causa do numero de campos da tela seria
 * deixar o formulario definir o orcamento do armazenamento.
 */
export const rotaDeIntencaoDaFotoDaIndicacao = defineRoute({
  operationId: 'createDirectorySuggestionPhotoUploadIntent',
  method: 'post',
  path: '/media/directory-suggestion-photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeConfirmacaoDeFoto = defineRoute({
  operationId: 'confirmPetPhoto',
  method: 'post',
  path: '/pets/:petId/photos',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeExclusaoDeFoto = defineRoute({
  operationId: 'deletePetPhoto',
  method: 'delete',
  path: '/pets/:petId/photos/:photoId',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeMidia {
  readonly midia: MediaService;
  /** ADR-0025 emenda 3: a autorizacao de envio da capa do encontro. */
  readonly capasDeEncontro: CapaDeEncontroDaComunidade;
  /** 18/10/2026: a autorizacao de envio da foto do proprio usuario. */
  readonly fotosDoUsuario: FotoDoProprioUsuario;
  /** 29/10/2026: a autorizacao de envio do logotipo da indicacao. */
  readonly logotiposDeIndicacao: LogotipoDaIndicacao;
  /** 30/10/2026: a autorizacao de envio de UMA foto do estabelecimento indicado. */
  readonly fotosDeIndicacao: FotoDaIndicacao;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  /** Domínio de mídia, separado da origem da aplicação (ADR-0007). */
  readonly baseDeMidia: AbsoluteUrl;
}

function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeMidia,
): Promise<UserId> {
  return memoDaRequisicao(request, 'media:dono', async () => {
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
  deps: DependenciasDasRotasDeMidia,
): Promise<string | undefined> {
  try {
    return await donoAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId?: string };
  if (typeof petId !== 'string' || petId === '') throw problemas.naoEncontrado();
  return petId as PetId;
}

function comoRespostaDaFoto(foto: FotoDoPet, baseDeMidia: AbsoluteUrl): Record<string, unknown> {
  const url = (chave: string | null): string | null =>
    chave === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${chave}`;

  return {
    id: foto.id,
    status: foto.status,
    is_primary: foto.isPrimary,
    rejection_reason: foto.rejectionReason,
    thumb_url: url(foto.thumbKey),
    card_url: url(foto.cardKey),
    created_at: foto.createdAt.toISOString(),
  };
}

function comoAutorizacao(
  uploadId: string,
  autorizacao: {
    metodo: string;
    url: string;
    campos?: Record<string, string> | undefined;
    cabecalhos?: Record<string, string> | undefined;
    expiraEm: Date;
    maxBytes: number;
  },
): Record<string, unknown> {
  return {
    upload_id: uploadId,
    method: autorizacao.metodo,
    url: autorizacao.url,
    ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
    ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
    expires_at: autorizacao.expiraEm.toISOString(),
    max_bytes: autorizacao.maxBytes,
  };
}

export function registrarRotasDeMidia(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeMidia,
): void {
  registrarRota(
    app,
    rotaDeIntencaoDeCapaDeEncontro,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDeCapaDeEncontro.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.capasDeEncontro.autorizar(
        dono,
        request.body as CorpoDaIntencaoDeCapa,
      );
      return reply.status(201).send(comoAutorizacao(uploadId, autorizacao));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDeFotoDoUsuario,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDeFotoDoUsuario.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.fotosDoUsuario.autorizar(
        dono,
        request.body as CorpoDaIntencaoDeFoto,
      );
      return reply.status(201).send(comoAutorizacao(uploadId, autorizacao));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDoLogotipoDaIndicacao,
    {
      schema: {
        body: corpoDe(deps.contrato, rotaDeIntencaoDoLogotipoDaIndicacao.operationId),
      },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.logotiposDeIndicacao.autorizar(
        dono,
        request.body as CorpoDaIntencaoDoLogotipo,
      );
      return reply.status(201).send(comoAutorizacao(uploadId, autorizacao));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDaFotoDaIndicacao,
    {
      schema: {
        body: corpoDe(deps.contrato, rotaDeIntencaoDaFotoDaIndicacao.operationId),
      },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.fotosDeIndicacao.autorizar(
        dono,
        request.body as CorpoDaIntencaoDaFoto,
      );
      return reply.status(201).send(comoAutorizacao(uploadId, autorizacao));
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDeFoto,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDeFoto.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const corpo = request.body as { pet_id: string; content_type: string; byte_size: number };

      const { uploadId, autorizacao } = await deps.midia.autorizarEnvioDeFoto(
        corpo.pet_id as PetId,
        dono,
        corpo.content_type,
        corpo.byte_size,
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
    rotaDeConfirmacaoDeFoto,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeConfirmacaoDeFoto.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const corpo = request.body as { upload_id: string; set_as_primary?: boolean };

      const foto = await deps.midia.confirmarFoto(
        petIdDoCaminho(request),
        dono,
        corpo.upload_id,
        corpo.set_as_primary ?? true,
      );

      return reply.status(202).send(comoRespostaDaFoto(foto, deps.baseDeMidia));
    },
  );

  registrarRota(
    app,
    rotaDeExclusaoDeFoto,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { photoId } = request.params as { photoId?: string };
      if (typeof photoId !== 'string' || photoId === '') throw problemas.naoEncontrado();

      await deps.midia.excluirFoto(petIdDoCaminho(request), dono, photoId);
      return reply.status(204).send();
    },
  );
}
