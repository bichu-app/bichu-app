/**
 * Rotas da foto.
 *
 * São três, e nenhuma recebe bytes. A do meio é a que explica o desenho:
 * `confirmPetPhoto` responde **202**, e não 201. A foto existe e ainda não
 * serve — antes de o worker remover o EXIF ela carrega a coordenada da casa do
 * tutor, e o contrato diz isso no status em vez de deixar o cliente descobrir
 * pela ausência de `card_url`.
 *
 * `thumb_url` e `card_url` saem **nulos enquanto as derivadas não existem**.
 * Montar o endereço de um objeto que ninguém gravou seria uma promessa que o
 * cliente descobre quebrada na hora de desenhar a tela.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { MediaService } from '../../application/media-service.js';
import type { FotoDoPet } from '../../ports/media-repository.js';
import type { AbsoluteUrl, PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeIntencaoDeFoto = defineRoute({
  operationId: 'createPetPhotoUploadIntent',
  method: 'post',
  path: '/media/pet-photo-intents',
  // Grava a intenção e assina uma autorização que não se desfaz dentro da
  // validade: revogar uma política de POST já entregue não é possível.
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
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  /** Domínio de mídia, separado da origem da aplicação (ADR-0007). */
  readonly baseDeMidia: AbsoluteUrl;
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

/** `account` para o teto. Sem credencial válida não há balde de conta. */
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

/**
 * A foto como o contrato a declara.
 *
 * A URL é montada AQUI, na leitura, a partir do domínio de mídia — o banco
 * guarda só a chave (§11.1 proibição 9). Gravar URL absoluta amarraria cada
 * linha ao provedor e ao domínio do dia em que ela foi escrita, e a migração de
 * armazenamento do ADR-0007 quebraria toda foto já compartilhada.
 */
function comoRespostaDaFoto(foto: FotoDoPet, baseDeMidia: AbsoluteUrl): Record<string, unknown> {
  const url = (chave: string | null): string | null =>
    chave === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${chave}`;

  return {
    id: foto.id,
    status: foto.status,
    is_primary: foto.isPrimary,
    thumb_url: url(foto.thumbKey),
    card_url: url(foto.cardKey),
    created_at: foto.createdAt.toISOString(),
  };
}

export function registrarRotasDeMidia(
  app: FastifyInstance,
  deps: DependenciasDasRotasDeMidia,
): void {
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
        // Um dos dois, nunca os dois: `POST` leva campos de formulário, `PUT`
        // leva cabeçalhos assinados. O cliente LÊ `method` em vez de presumir, e
        // é isso que faz a troca de provedor não virar mudança de app publicado.
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

      // 202: aceito, ainda não pronto. Ver o cabeçalho deste arquivo.
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
