import { useCallback } from 'react';

import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';
import { usePendentesDaFila } from '../componentes/casca-de-fila.tsx';

export type Indicacao = Esquemas['AdminDirectorySuggestion'];
export type EstadoDaIndicacao = Esquemas['DirectorySuggestionState'];
export type TipoDeContato = Esquemas['DirectorySuggestionContactKind'];

/** As abas da fila, na ordem em que o operador trabalha. */
export const ABAS: readonly EstadoDaIndicacao[] = ['pending', 'approved', 'declined'];

export const ROTULO_DA_ABA = {
  pending: 'Na fila',
  approved: 'Aprovadas',
  declined: 'Recusadas',
} as const satisfies Record<EstadoDaIndicacao, string>;

export const VAZIO_DA_ABA = {
  pending: 'Nenhuma indicação esperando revisão.',
  approved: 'Nenhuma indicação aprovada ainda.',
  declined: 'Nenhuma indicação recusada.',
} as const satisfies Record<EstadoDaIndicacao, string>;

/** O rotulo do tipo de contato, no singular. */
export const CONTATOS = {
  phone: 'Telefone',
  website: 'Site',
  instagram: 'Instagram',
} as const satisfies Record<TipoDeContato, string>;

export const LIMITE_DO_MOTIVO = 280;

/** Por que a entrada nao vai ao ar sozinha quando o contato nao e telefone. */
export function precisaDeTelefone(i: Indicacao): boolean {
  return i.public_contact.kind !== 'phone';
}

/** Cidade e UF numa linha, como a lista de entradas escreve. */
export function lugarDa(i: Indicacao): string {
  return i.neighborhood ? `${i.neighborhood} · ${i.city} · ${i.state}` : `${i.city} · ${i.state}`;
}

/**
 * AS IMAGENS DA INDICACAO, como a tela precisa delas.
 *
 * O contrato entrega tres campos e nao um estado: `logo_url` (derivada `thumb`,
 * nula em tres casos que a fila trata igual), `photo_urls` (derivadas `card`,
 * **so as `ready`**, lista vazia e nunca nula) e `photos_total` (quantas a
 * indicacao TEM, prontas ou nao). O estado sai da COMPARACAO entre os dois
 * ultimos, e e por isso que `photos_total` existe: sem ele a tela nao distingue
 * "nao enviou nenhuma" de "enviou quatro e nenhuma ficou pronta".
 */
export interface ImagensDaIndicacao {
  readonly logo: string | null;
  /** So as `ready`. Pode ser vazia com `processando` maior que zero. */
  readonly prontas: readonly string[];
  /** Quantas ainda nao sairam: enviadas que o worker nao terminou ou recusou. */
  readonly processando: number;
  /** Ha o que desenhar? Falso e o caso legitimo "sem imagem", nunca um buraco. */
  readonly temAlgo: boolean;
}

export function imagensDa(i: Indicacao): ImagensDaIndicacao {
  const prontas = i.photo_urls;
  const processando = Math.max(0, i.photos_total - prontas.length);
  const logo = i.logo_url ?? null;
  return { logo, prontas, processando, temAlgo: logo !== null || prontas.length > 0 || processando > 0 };
}

/**
 * A MARCA DA LINHA: contagem, e nao as fotos. Uma pagina de 20 linhas traria
 * ate 80 `card` se a lista desenhasse as fotos; quem julga abre a indicacao.
 */
export function marcaDasFotos(i: Indicacao): string {
  const { prontas, processando } = imagensDa(i);
  if (i.photos_total === 0) return 'Sem fotos';
  if (processando === 0) return prontas.length === 1 ? '1 foto' : `${String(prontas.length)} fotos`;
  return `${String(prontas.length)} de ${String(i.photos_total)} fotos prontas`;
}

/** A CONTAGEM DO AVISO do item do menu. */
export function useIndicacoesPendentes(api: ClienteDaApi, versao = 0): number | undefined {
  const buscar = useCallback(
    async (sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/directory/suggestions', {
        params: { query: { review_status: 'pending', page: 1, limit: 1 } },
        signal: sinal,
      });
      return data?.pending_total;
    },
    [api],
  );
  return usePendentesDaFila(buscar, versao);
}
