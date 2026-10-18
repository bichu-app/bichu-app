/**
 * `POST /v1/directory/suggestions` — a comunidade SUGERE uma entrada do
 * `Perto`, e a sugestao entra na fila de revisao.
 *
 * ## Arquivo proprio, e nao mais um registro em `directory-routes.ts`
 *
 * Aquele arquivo e a LEITURA do diretorio, e o cabecalho dele e inteiro sobre
 * por que a leitura exige conta e por que nenhuma coordenada entra pela
 * requisicao. Esta operacao e uma escrita, com outras razoes -- fila,
 * terceiro que nao pediu, corpo fechado. O que os dois COMPARTILHAM e o
 * reconhecimento de quem chama, e ele e reusado de la
 * (`chamadorAutenticado`/`contaDoTeto`, memoizados por requisicao) em vez de
 * copiado: o teto por conta e o manipulador precisam ver o mesmo dono.
 *
 * ## O guarda de corpo fechado NAO e opcional aqui
 *
 * O Fastify monta o Ajv com `removeAdditional: true`. Com isso,
 * `additionalProperties: false` no contrato **nao recusa** o campo
 * desconhecido: ele o **apaga em silencio**, e o manipulador recebe um corpo
 * que nao e o que o cliente mandou (ver `shared/http/corpo-fechado.ts`, medido
 * em 23/09). `registrarRota` instala o guarda sozinho so na superficie
 * administrativa, entao aqui ele entra a mao.
 *
 * Nesta operacao o campo apagado em silencio teria NOME, e e por isso que o
 * guarda importa: quem mandasse `verification_level: document_verified`,
 * `status: published` ou `crmv_number` receberia **201** e acreditaria ter
 * sugerido um perfil verificado, publicado ou com documento. Nenhum dos tres
 * existe no corpo, de proposito (ADR-0011 secao 4, ADR-0026 §5), e aceitar e
 * ignorar e pior que aceitar: o primeiro mente sobre o que aconteceu.
 *
 * ## O que a resposta devolve, e o que ela NAO devolve
 *
 * `201` com `reference`, `state: pending` e `created_at`, e nada mais.
 * **Sem `id`** (ADR-0010 item 6) e sem o texto sugerido de volta: devolve-lo
 * faria o recibo parecer publicacao. `Cache-Control: private, no-store`, como
 * as escritas da `Rede`: recibo de fila nao e resposta cacheavel, e o
 * intermediario que a guardasse a mostraria para a chamada seguinte.
 *
 * ## A validacao de corpo nao e escrita aqui
 *
 * O esquema sai do CONTRATO, pelo `operationId`. Declarar um objeto inline
 * criaria a segunda definicao, que e a que diverge; e o `400` que ela produz
 * esta declarado na operacao.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { SugestaoDoDiretorio } from '../../application/sugestao-do-diretorio.js';
import type { CorpoDaSugestaoDoDiretorio } from '../../domain/sugestao-do-diretorio.js';
import { chamadorAutenticado, contaDoTeto, type Autenticador } from './directory-routes.js';

/**
 * O teto e o do contrato, COPIADO dele.
 *
 * `human_work` e o efeito, e e literal: cada sugestao cria trabalho de revisao
 * para uma pessoa. Com efeito nao vazio, `defineRoute` torna a ausencia de
 * `rateLimit` erro de compilacao (ADR-0016).
 *
 * **5 por 24 h por CONTA**, o mesmo numero de `createNetworkEvent`, e o juizo e
 * o mesmo: o teto por conta e o ORCAMENTO DA FILA. Por conta e nao por `ip`
 * porque a rota exige conta -- `account` existe e e exato --, e porque o CGNAT
 * das operadoras brasileiras faria um teto por IP pegar vizinho inocente e
 * errar quem abusa.
 */
export const rotaDaSugestaoDoDiretorio = defineRoute({
  operationId: 'suggestDirectoryEntry',
  method: 'post',
  path: '/directory/suggestions',
  effects: ['human_work'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

const SEM_CACHE = 'private, no-store';

export interface DependenciasDaRotaDeSugestao {
  readonly autenticador: Autenticador;
  readonly sugestoes: SugestaoDoDiretorio;
  /** De onde sai o esquema do corpo: a declaracao e a do contrato. */
  readonly contrato: Contrato;
}

/** O esquema do corpo, do contrato e pelo `operationId`. */
function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        'no contrato, mas a rota espera um. Corrija a especificação, não o código.',
    );
  }
  return schema;
}

export function registrarRotaDeSugestaoDoDiretorio(
  app: RegistradorDeRotas,
  deps: DependenciasDaRotaDeSugestao,
): void {
  const corpo = corpoDe(deps.contrato, rotaDaSugestaoDoDiretorio.operationId);
  registrarRota(
    app,
    rotaDaSugestaoDoDiretorio,
    {
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [recusarCampoDesconhecido(corpo, rotaDaSugestaoDoDiretorio.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // O 401 vem ANTES de qualquer escrita: sem conta nao ha autoria, e
      // sugestao sem autor nao e sugestao.
      const chamador = await chamadorAutenticado(request, deps);
      const recibo = await deps.sugestoes.sugerir(
        {
          userId: chamador,
          correlationId: request.id,
          // EM CLARO. A porta da trilha o transforma em HMAC (SEC-010); nem
          // esta borda nem o caso de uso o transformam, e nenhum dos dois o
          // registra em log.
          ip: request.ip,
        },
        request.body as CorpoDaSugestaoDoDiretorio,
      );
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(recibo);
    },
  );
}
