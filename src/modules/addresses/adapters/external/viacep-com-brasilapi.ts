/**
 * A busca de CEP contra servico publico: **ViaCEP principal, BrasilAPI de
 * reserva**.
 */
import type {
  BuscaDeCep,
  EnderecoDoCep,
  RespostaDaBuscaDeCep,
} from '../../ports/busca-de-cep.js';

/** **Principal, por pedido do cliente de 17/10** (*"pode implementar o via cep"*). */
const VIA_CEP = 'https://viacep.com.br/ws';

/**
 * Reserva, consultada **so quando a principal falha, nao responde ou diz que o CEP
 * nao existe**.
 */
const BRASIL_API = 'https://brasilapi.com.br/api/cep/v2';

/** Quatro segundos, **por servico**. */
export const PRAZO_POR_SERVICO_MS = 4_000;

const SO_DIGITOS = /[^0-9]/g;

/**
 * `''` para qualquer coisa que nao seja texto: numero, nulo e objeto nao sao
 * endereco.
 */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Endereco completo o bastante para valer, ou `null`. */
function enderecoValido(bruto: EnderecoDoCep): EnderecoDoCep | null {
  if (bruto.city === '' || bruto.state.length !== 2) return null;
  return bruto;
}

export interface OpcoesDaBuscaDeCep {
  /** Injetavel para a bancada. */
  readonly buscarNaRede?: typeof globalThis.fetch;
  readonly prazoMs?: number;
}

export function criarBuscaDeCep(opcoes: OpcoesDaBuscaDeCep = {}): BuscaDeCep {
  const chamar = opcoes.buscarNaRede ?? globalThis.fetch;
  const prazoMs = opcoes.prazoMs ?? PRAZO_POR_SERVICO_MS;

  /** Roda uma tentativa e **engole tudo o que der errado**. */
  const tentar = async (
    tentativa: () => Promise<RespostaDaBuscaDeCep | null>,
  ): Promise<RespostaDaBuscaDeCep | null> => {
    try {
      return await tentativa();
    } catch {
      return null;
    }
  };

  const doViaCep = async (cep: string): Promise<RespostaDaBuscaDeCep | null> => {
    const resposta = await chamar(`${VIA_CEP}/${cep}/json/`, {
      signal: AbortSignal.timeout(prazoMs),
    });
    if (resposta.status !== 200) return null;

    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo)) return null;

    const erro = corpo['erro'];
    if (erro === true || erro === 'true') return { desfecho: 'naoEncontrado' };

    const endereco = enderecoValido({
      street: texto(corpo['logradouro']),
      neighborhood: texto(corpo['bairro']),
      city: texto(corpo['localidade']),
      state: texto(corpo['uf']).toUpperCase(),
    });
    return endereco === null ? null : { desfecho: 'encontrado', endereco };
  };

  const daBrasilApi = async (cep: string): Promise<RespostaDaBuscaDeCep | null> => {
    const resposta = await chamar(`${BRASIL_API}/${cep}`, {
      signal: AbortSignal.timeout(prazoMs),
    });
    if (resposta.status === 404) return { desfecho: 'naoEncontrado' };
    if (resposta.status !== 200) return null;

    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo)) return null;

    const endereco = enderecoValido({
      street: texto(corpo['street']),
      neighborhood: texto(corpo['neighborhood']),
      city: texto(corpo['city']),
      state: texto(corpo['state']).toUpperCase(),
    });
    return endereco === null ? null : { desfecho: 'encontrado', endereco };
  };

  return {
    async buscar(cepBruto: string): Promise<RespostaDaBuscaDeCep> {
      const cep = cepBruto.replace(SO_DIGITOS, '');
      if (cep.length !== 8) return { desfecho: 'naoEncontrado' };

      const principal = await tentar(() => doViaCep(cep));
      if (principal !== null && principal.desfecho === 'encontrado') return principal;

      const reserva = await tentar(() => daBrasilApi(cep));
      if (reserva !== null) return reserva;

      if (principal !== null) return principal;

      return { desfecho: 'indisponivel' };
    },
  };
}
