import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import {
  resolvedorDoTokenDoAchador,
  tokenDoAchador,
} from '../../../../shared/http/token-do-achador.js';
import type {
  AvisoDoAchadorService,
  EntradaDeEnriquecimento,
  FotoDoAchadorAutorizada,
  VistaDoAvisoParaOAchador,
} from '../../application/aviso-do-achador.js';

export const rotaDoEnriquecimentoDoAchador = defineRoute({
  operationId: 'enrichFinderFoundReport',
  method: 'patch',
  path: '/finder/found-report',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['finder_token'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

/**
 * Teto vitalício de três por token, que é três por aviso: o token tem escopo de um
 * aviso só.
 */
export const rotaDaFotoDoAchador = defineRoute({
  operationId: 'createFinderPhotoUploadIntent',
  method: 'post',
  path: '/media/finder-photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [
    { dimension: ['finder_token'], limit: 3, window: 'lifetime', onExceed: 'deny_429' },
  ],
});

export interface DependenciasDasRotasDoAvisoDoAchador {
  readonly avisos: AvisoDoAchadorService;
  readonly contrato: Contrato;
}

/** `FinderFoundReportView`, campo a campo. */
export function comoVistaDoAviso(vista: VistaDoAvisoParaOAchador): Record<string, unknown> {
  return {
    status: vista.status,
    found_at: vista.foundAt.toISOString(),
    has_photo: vista.hasPhoto,
    has_location: vista.hasLocation,
    message: vista.message,
    ...(vista.petDisplayName === null ? {} : { pet_display_name: vista.petDisplayName }),
    conversation_url: vista.conversationUrl,
  };
}

/** `FinderUploadIntent`, campo a campo. */
export function comoIntencaoDoAchador(foto: FotoDoAchadorAutorizada): Record<string, unknown> {
  const { autorizacao } = foto;
  return {
    upload_ref: foto.uploadRef,
    method: autorizacao.metodo,
    url: autorizacao.url,
    ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
    ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
    expires_at: autorizacao.expiraEm.toISOString(),
  };
}

export function registrarRotasDoAvisoDoAchador(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoAvisoDoAchador,
): void {
  registrarRota(
    app,
    rotaDoEnriquecimentoDoAchador,
    {
      schema: { body: corpoDe(deps.contrato, rotaDoEnriquecimentoDoAchador.operationId) },
      resolvedores: { finder_token: resolvedorDoTokenDoAchador },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const vista = await deps.avisos.enriquecer(
        tokenDoAchador(request),
        request.body as EntradaDeEnriquecimento,
        { correlationId: request.id, ip: request.ip },
      );
      return reply.status(200).send(comoVistaDoAviso(vista));
    },
  );

  registrarRota(
    app,
    rotaDaFotoDoAchador,
    {
      schema: { body: corpoDe(deps.contrato, rotaDaFotoDoAchador.operationId) },
      resolvedores: { finder_token: resolvedorDoTokenDoAchador },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { content_type: string; byte_size: number };
      const foto = await deps.avisos.autorizarFoto(
        tokenDoAchador(request),
        corpo.content_type,
        corpo.byte_size,
      );
      return reply.status(201).send(comoIntencaoDoAchador(foto));
    },
  );
}
