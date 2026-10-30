/** O vocabulario da FILA DE DUVIDAS no painel. */
import { useCallback, useEffect, useState } from 'react';

import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';

export type Duvida = Esquemas['AdminHelpRequest'];
export type SituacaoDaDuvida = Esquemas['AdminHelpRequestStatus'];

/** As abas, na ordem em que a operadora trabalha. */
export const ABAS: readonly SituacaoDaDuvida[] = ['open', 'attended'];

export const ROTULO_DA_ABA = {
  open: 'Na fila',
  attended: 'Atendidas',
} as const satisfies Record<SituacaoDaDuvida, string>;

export const VAZIO_DA_ABA = {
  open: 'Ninguém mandou dúvida ainda.',
  attended: 'Nenhuma dúvida foi marcada como atendida.',
} as const satisfies Record<SituacaoDaDuvida, string>;

/**
 * As colunas da tabela. Serve a DOIS usos -- o cabecalho e o `LinhasCarregando`
 * --, entao o esqueleto nunca desenha um numero de colunas diferente do da tabela.
 */
export const COLUNAS = ['Assunto', 'Dúvida', 'Quando', 'Situação', ''];

/**
 * Os padroes da lista, constante de modulo porque `useParametrosDaLista` o exige
 * estavel.
 */
export const PADROES = { estado: 'open', busca: '' };

/** Quem marcou e quando, numa frase -- ou `undefined` na aba `Na fila`. */
export function atendimentoDe(duvida: Duvida): string | undefined {
  if (duvida.status !== 'attended') return undefined;
  const quem = duvida.attended_by ?? 'Conta sem nome de exibição';
  return `${quem} · ${dataCurta(duvida.attended_at)}`;
}

export function dataCurta(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** O comeco do texto, para a linha da tabela. */
export function previa(texto: string, teto = 120): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= teto ? limpo : `${limpo.slice(0, teto - 1)}…`;
}

/** A busca da tela, sobre a PAGINA JA CARREGADA. */
export function casaComABusca(duvida: Duvida, busca: string): boolean {
  if (busca === '') return true;
  const alvo = `${duvida.subject} ${duvida.body}`.toLowerCase();
  return alvo.includes(busca);
}

/** A contagem do aviso do menu: quantas duvidas estao ABERTAS. */
export function useDuvidasPendentes(api: ClienteDaApi, versao = 0): number | undefined {
  const [pendentes, setPendentes] = useState<number>();

  const buscar = useCallback(
    async (sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/help-requests', {
        params: { query: { status: 'open', page: 1, limit: 1 } },
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
