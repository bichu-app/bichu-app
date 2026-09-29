// Cliente do contrato, so no servidor do site (ADR-0028, item 3).
//
// Caminho, parametro, corpo e resposta vem de `generated/api.ts`, gerado de
// api/openapi.yaml; nenhum tipo de resposta e escrito a mao. O servidor do site
// repassa a API o que identifica a pessoa do outro lado (X-Forwarded-For e
// x-correlation-id) e nada alem: nao guarda sessao, cookie nem segredo.
//
// Tempo limite de 2 s por chamada. Estourou ou a rede caiu: `falha`, e a pagina
// responde 503 com botao de tentar de novo, nunca pagina em branco.
import createClient from 'openapi-fetch';
import type { paths } from './generated/api.ts';
import { resultadoDeProblema, type Resultado } from '../dominio/resultado.ts';

export const TEMPO_LIMITE_MS = 2000;

function baseDaApi(): string {
  const url = process.env.API_INTERNAL_URL ?? 'http://api:3000';
  return `${url.replace(/\/+$/, '')}/v1`;
}

/** Cabecalhos que a API precisa para contar limite e rastrear, e so eles. */
function cabecalhosRepassados(requisicao: Request, enderecoDoCliente: string | undefined): Record<string, string> {
  const saida: Record<string, string> = {};
  const encaminhado = requisicao.headers.get('x-forwarded-for') ?? enderecoDoCliente;
  if (encaminhado) saida['X-Forwarded-For'] = encaminhado;
  const correlacao = requisicao.headers.get('x-correlation-id');
  if (correlacao) saida['x-correlation-id'] = correlacao;
  return saida;
}

/**
 * fetch com tempo limite garantido: aborta a requisicao E corre contra um
 * relogio proprio. So o sinal de abort nao bastou: com a suite inteira rodando,
 * de forma intermitente, a chamada lenta esperou os 3 s do mock e a pagina
 * mostrou sucesso onde devia mostrar 503. A corrida garante que, passados 2 s,
 * a renderizacao segue com `falha`, com ou sem cooperacao do fetch.
 */
async function comTempoLimite(pedido: Request): Promise<Response> {
  const controle = new AbortController();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      const erro = new DOMException('tempo limite', 'TimeoutError');
      controle.abort(erro);
      rejeitar(erro);
    }, TEMPO_LIMITE_MS);
  });
  try {
    return await Promise.race([fetch(new Request(pedido, { signal: controle.signal })), estouro]);
  } finally {
    clearTimeout(relogio);
  }
}

export function clienteDaApi(requisicao: Request, enderecoDoCliente?: string) {
  return createClient<paths>({
    baseUrl: baseDaApi(),
    headers: cabecalhosRepassados(requisicao, enderecoDoCliente),
    fetch: comTempoLimite,
  });
}

type RespostaDoCliente<T> = { data?: T; error?: unknown; response: Response };

/**
 * Executa a chamada e reduz a resposta a um `Resultado`. Qualquer excecao de
 * transporte vira `falha`; qualquer resposta que nao seja 2xx vira `problema`.
 */
export async function executar<T>(chamada: () => Promise<RespostaDoCliente<T>>): Promise<Resultado<T>> {
  try {
    const { data, error, response } = await chamada();
    if (response.ok) return { tipo: 'ok', status: response.status, dados: data as T };
    return resultadoDeProblema(response.status, error, response.headers.get('retry-after'));
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : '';
    return { tipo: 'falha', motivo: nome === 'TimeoutError' || nome === 'AbortError' ? 'tempo' : 'rede' };
  }
}
