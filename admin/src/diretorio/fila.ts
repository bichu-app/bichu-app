/**
 * O vocabulario da FILA DE INDICACOES, em arquivo proprio.
 *
 * **Arquivo novo, e nao linhas acrescentadas em `dominio.ts`**, de proposito: o
 * modulo do diretorio esta sendo mexido por mais de uma frente ao mesmo tempo
 * (a pagina do local com nota e avaliacoes e a moderacao de avaliacao sao de
 * outro despacho). Edicao localizada em arquivo proprio faz a mescla ser limpa;
 * o que este arquivo precisa de `dominio.ts` ele importa -- `ATIVIDADES` e
 * `slugSugerido` nao sao reescritos aqui.
 */
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

/**
 * O rotulo do tipo de contato, no singular.
 *
 * `satisfies Record<...>` como trava: se o `enum` do contrato ganhar um valor, o
 * compilador do painel reprova aqui em vez de a tela mostrar um codigo cru. E a
 * mesma trava de `ATIVIDADES` em `dominio.ts`, e pelo mesmo motivo.
 */
export const CONTATOS = {
  phone: 'Telefone',
  website: 'Site',
  instagram: 'Instagram',
} as const satisfies Record<TipoDeContato, string>;

export const LIMITE_DO_MOTIVO = 280;

/**
 * Por que a entrada nao vai ao ar sozinha quando o contato nao e telefone.
 *
 * `professionals` so tem `phone_e164` como canal de contato, e uma entrada sem
 * canal nenhum nao passa pela regua de publicacao do servidor. Isso nao e
 * conferido na tela: a tela so EXPLICA, e quem decide continua sendo o servidor.
 */
export function precisaDeTelefone(i: Indicacao): boolean {
  return i.public_contact.kind !== 'phone';
}

/** Cidade e UF numa linha, como a lista de entradas escreve. */
export function lugarDa(i: Indicacao): string {
  return i.neighborhood ? `${i.neighborhood} · ${i.city} · ${i.state}` : `${i.city} · ${i.state}`;
}

/**
 * A CONTAGEM DO AVISO do item do menu.
 *
 * `limit: 1` e nao `limit: 50`: o numero que interessa e `pending_total`, que o
 * servidor manda independente do recorte -- pedir a pagina inteira so para ler
 * um inteiro seria trafego por nada. Mesmo desenho de `contarPedidos` na Rede.
 *
 * **O numero vem do servidor, e nao de uma soma na tela**: ele passa pelo mesmo
 * filtro de conta desabilitada da listagem e da leitura (os tres lugares), e uma
 * soma local contaria o que a lista nao mostra -- que e exatamente o defeito de
 * "1 pendente" sobre fila vazia.
 */
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
      // Silencio de proposito: um aviso de contagem que nao carregou nao e
      // motivo para a casca do painel mostrar erro. O item do menu fica sem o
      // numero, e a tela da fila diz a verdade quando alguem abrir.
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}
