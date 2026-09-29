import createClient, { type Client, type Middleware } from 'openapi-fetch';

import { configuracao } from '../config.ts';
import { semSessao, type EstrategiaDeSessao } from '../sessao/sessao.ts';
import type { components, paths } from './generated/api.ts';

export type ClienteDaApi = Client<paths>;
export type Esquemas = components['schemas'];

export interface OpcoesDoCliente {
  /** URL base com o prefixo de versao: `/v1` (mesma origem) ou uma URL absoluta, so em desenvolvimento. */
  baseUrl?: string;
  sessao?: EstrategiaDeSessao;
  /** Injetavel para teste. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Base relativa (`/v1`) vira absoluta na origem da pagina, que e o que o
 * navegador faria sozinho. Resolver aqui deixa a regra explicita e igual em
 * todo ambiente de execucao; URL absoluta passa sem mudanca.
 */
function resolverNaOrigem(base: string): string {
  return new URL(base, globalThis.location.href).href.replace(/\/+$/, '');
}

/**
 * Cliente tipado pelo contrato: caminho, parametro, corpo e resposta vem de
 * `api/openapi.yaml` via `src/api/generated/api.ts` (gerado, nao edite).
 */
export function criarClienteDaApi(opcoes: OpcoesDoCliente = {}): ClienteDaApi {
  const sessao = opcoes.sessao ?? semSessao;
  const cliente = createClient<paths>({
    baseUrl: resolverNaOrigem(opcoes.baseUrl ?? configuracao.apiBaseUrl),
    ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
  });

  const middlewareDeSessao: Middleware = {
    onRequest: ({ request }) => sessao.prepararRequisicao(request),
    onResponse: ({ response }) => {
      if (response.status === 401) sessao.aoPerderAutorizacao?.(response);
      else sessao.aoUsar?.();
      return undefined;
    },
  };
  cliente.use(middlewareDeSessao);
  return cliente;
}
