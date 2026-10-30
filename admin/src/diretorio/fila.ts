/** O vocabulario da FILA DE INDICACOES, em arquivo proprio. */
import { useCallback, useEffect, useState } from 'react';

import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';

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

/** A CONTAGEM DO AVISO do item do menu. */
export function useIndicacoesPendentes(api: ClienteDaApi, versao = 0): number | undefined {
  const [pendentes, setPendentes] = useState<number>();

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

  useEffect(() => {
    const controle = new AbortController();
    void buscar(controle.signal)
      .then((n) => {
        if (!controle.signal.aborted && n !== undefined) setPendentes(n);
      })
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}
