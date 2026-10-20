/**
 * As rotas da VITRINE DE FOTOS DO USUÁRIO. São três, e **todas são do dono**.
 *
 * ## Por que não há rota de vitrine de OUTRA pessoa, e a ausência é a defesa
 *
 * Não existe `GET /users/{id}/showcase`, e não é omissão a ser preenchida
 * depois. A vitrine sai em `GET /me/showcase` e em NENHUMA outra resposta:
 *
 * - o **ADR-0025 item 2** proíbe avatar de pessoa na superfície da `Rede`, por
 *   nome;
 * - o contrato afirma em **dois lugares** que `Conversation.participants` nunca
 *   traz foto de perfil.
 *
 * Mostrar a vitrine a terceiro contraria decisão registrada, e seria decisão do
 * cliente — não desta frente. Por isso a rota que a mostraria não existe, em
 * vez de existir com um `if`: um `if` alguém esquece de repetir, uma rota
 * ausente ninguém chama por engano.
 *
 * ## `PUT` e não `POST`, e uma escrita só
 *
 * O corpo manda a vitrine inteira, na ordem. É o desenho das duas galerias da
 * casa, e ele resolve acrescentar, reordenar, **trocar a capa** (posição 0) e
 * remover com uma operação — quatro rotas seriam quatro lugares para o teto de
 * nove divergir. `photos: []` tira todas.
 *
 * `200` e não `202`: a vitrine responde o estado que passou a valer. As fotos
 * novas vêm com `status: processing` e `grid_url: null`, porque antes de o
 * worker reescrever a derivada elas carregam o EXIF do celular — o contrato diz
 * isso no status em vez de deixar o app descobrir pela ausência da URL.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
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
 * Assinar é barato, mas cada assinatura é uma autorização de escrita que **não
 * se desfaz dentro da validade**. Mesmo teto de 20/h da foto de pet e da capa
 * do encontro, pelo mesmo motivo.
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

/**
 * Uma foto da vitrine como o contrato a declara.
 *
 * **`grid_url` é a derivada de 320 px e `open_url` é a de 1024 px**, e as duas
 * saem nomeadas pelo USO e não pela variante do armazenamento: a grade pede a
 * primeira e nunca a segunda, e **o original nunca sai** — ele não tem derivada
 * pública e o leitor de mídia só abre chave com forma de derivada.
 *
 * A URL é montada AQUI, na leitura, a partir do domínio de mídia. O banco
 * guarda só a chave (§11.1 proibição 9): gravar URL absoluta amarraria cada
 * linha ao provedor do dia em que ela foi escrita.
 *
 * `catalog_images.id` **não aparece**: é identidade interna. O identificador
 * que sai é o `upload_id`, como nas duas galerias da casa.
 */
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
    // O teto, na resposta, para a tela não guardar uma segunda cópia do
    // número. Vem do PONTO ÚNICO (`derivadas.ts`), e não de um literal aqui.
    max_photos: TETO_DE_FOTOS_DA_VITRINE,
  };
}

/**
 * `...DaVitrineDeFotos`, e nao `...DaVitrine`: **a palavra "vitrine" ja tem
 * dono neste repositorio.** `registrarRotasDaVitrine` e a da LOJA (o catalogo
 * de produto), e `DependenciasDasRotasDaVitrine` tambem. Duas coisas com o
 * mesmo nome no mesmo bootstrap e colisao de compilacao -- e, pior, e a leitura
 * errada na cabeca de quem passar por aqui depois.
 */
export function registrarRotasDaVitrineDeFotos(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaVitrineDeFotos,
): void {
  registrarRota(
    app,
    rotaDaMinhaVitrine,
    // Sem `resolvedores`: a leitura nao declara teto, e `registrarRota` recusa
    // resolvedor para rota sem `rateLimit` -- o que e certo, porque um
    // resolvedor sem balde seria trabalho feito e descartado a cada leitura.
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
        // Um dos dois, nunca os dois: `POST` leva campos de formulário, `PUT`
        // leva cabeçalhos assinados. O cliente LÊ `method` em vez de presumir.
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
