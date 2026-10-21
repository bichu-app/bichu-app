/**
 * As rotas do **convite de conexão** — o segredo que alimenta o link e o QR
 * (decisão do cliente de 20/10/2026).
 *
 * | | |
 * |---|---|
 * | `POST /connection-invites` | emitir o próprio convite, **revogando o anterior** |
 * | `DELETE /connection-invites` | revogar o próprio convite |
 *
 * **A terceira operação do convite não está aqui, e a fronteira é o motivo.**
 * Resolver um token devolve o **perfil** de quem emitiu, e perfil é de `people`
 * — então `resolveConnectionInvite` mora em `people/adapters/http/`, que já
 * importa `connections/ports/convite-de-conexao.ts` pela porta. Trazê-la para cá
 * faria `connections` importar `people/adapters/`, que é exatamente o que a
 * regra de fronteira proíbe: *"Importe de `modules/<outro>/ports/`, ou declare a
 * porta no módulo que precisa dela."*
 *
 * Esta separação não é burocracia — ela é o que mantém a resposta do link sendo
 * **a mesma** `PersonProfile` de `getPersonProfile`, por reuso da projeção, em
 * vez de uma segunda versão dela montada deste lado.
 *
 * ## Por que a etiqueta é `connection-invites` e não `connections`
 *
 * `conexao-nao-expoe-lista-nem-identificador.test.ts` cobra que `connections`
 * tenha **exatamente cinco** operações, e cobra com razão: é esse número que
 * impede uma sexta operação de conexão entrar sem alguém ver. É a mesma saída
 * que `getPersonProfile` tomou em 19/10 — etiqueta própria, e **não** afrouxar o
 * número.
 *
 * ## O que este arquivo NÃO tem
 *
 * **Nenhuma listagem de convites.** Há um convite ativo por conta, ou nenhum
 * (índice `connection_invites_um_ativo_por_conta`) — então não há coleção a
 * paginar, e um `GET /connection-invites` que devolvesse "o meu" devolveria o
 * token em claro numa resposta de leitura, que é o oposto de ele existir uma vez.
 *
 * **Nenhuma leitura de "quem usou o meu convite".** Seria a lista de quem viu o
 * perfil de alguém, que ninguém pediu e que o plano 4-B não reconhece. Quem
 * pediu conexão aparece na caixa de pedidos, que é onde isso já mora.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { ConviteDoPerfil } from '../../application/convite-do-perfil.js';

/**
 * **`irreversible_write`**: emitir **revoga o convite anterior**, e revogar não
 * se desfaz — o link que já foi compartilhado para de valer e não volta. Com
 * efeito não vazio, `defineRoute` torna a ausência de `rateLimit` erro de
 * compilação (ADR-0016).
 *
 * **60/h por conta**, o mesmo teto das outras escritas de conexão desta casa, e
 * não um número inventado aqui.
 */
export const rotaDaEmissaoDeConvite = defineRoute({
  operationId: 'issueConnectionInvite',
  method: 'post',
  path: '/connection-invites',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** `irreversible_write` pela mesma razão: o link revogado não volta. */
export const rotaDaRevogacaoDeConvite = defineRoute({
  operationId: 'revokeConnectionInvite',
  method: 'delete',
  path: '/connection-invites',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** Convite é segredo ao portador: nada daqui entra em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConvite {
  readonly convites: ConviteDoPerfil;
  readonly autenticador: Autenticador;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConvite,
): Promise<UserId> {
  return memoDaRequisicao(request, 'convite:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

async function contexto(request: FastifyRequest, deps: DependenciasDasRotasDeConvite) {
  return {
    userId: await chamador(request, deps),
    correlationId: request.id,
    ip: request.ip,
  };
}

export function registrarRotasDeConvite(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeConvite,
): void {
  const porConta = {
    account: async (request: FastifyRequest) => chamador(request, deps),
  };

  /**
   * Emitir. **201**, porque uma linha nova de convite nasce — e o token em claro
   * sai nesta resposta e em lugar nenhum mais: o banco guarda o resumo de 32
   * bytes, então nem esta casa nem um despejo do banco o recuperam depois.
   */
  registrarRota(
    app,
    rotaDaEmissaoDeConvite,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const convite = await deps.convites.emitir(await contexto(request, deps));
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(convite);
    },
  );

  /**
   * Revogar. **204 sem corpo, e idempotente**: sem convite ativo também é 204.
   *
   * Um 404 para "não havia convite" diria à tela que o estado dela estava velho,
   * o que não é informação útil num botão cujo efeito desejado — *não existe
   * link meu valendo* — já foi alcançado.
   */
  registrarRota(
    app,
    rotaDaRevogacaoDeConvite,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.convites.revogar(await contexto(request, deps));
      return reply.status(204).header('Cache-Control', SEM_CACHE).send();
    },
  );
}
