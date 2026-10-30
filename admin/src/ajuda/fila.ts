/**
 * O vocabulario da FILA DE DUVIDAS no painel.
 *
 * ## Arquivo proprio, em pasta propria
 *
 * Varias frentes mexem neste repositorio ao mesmo tempo. Modulo novo em pasta
 * nova faz a mescla ser limpa, e e o mesmo arranjo -- e o mesmo motivo -- de
 * `plaquinhas/fila.ts` e de `diretorio/fila.ts`.
 *
 * ## A FILA TEM ESTADO desde 30/10/2026
 *
 * O cliente decidiu em 29/10 que a duvida *"grava no banco e vai para o
 * backoffice"*, **sem notificacao**. Em 30/10 ele decidiu a pergunta que eu
 * tinha deixado aberta: **quer marcar a duvida como atendida**, e ver no menu
 * quantas faltam.
 *
 * Entao ha DUAS abas (`Na fila` e `Atendidas`) e um botao por linha.
 *
 * **ATENDIDA E MUDANCA DE ESTADO, E NUNCA `DELETE`**: a linha continua na
 * tabela e so troca de aba. "Nao apague nada" e decisao desta casa.
 *
 * **Nao ha DESMARCAR**, e a ausencia e decisao: "atendida" e afirmacao de uma
 * pessoa sobre o trabalho dela, e apaga-la sem registro e o tipo de reescrita
 * de historia que "nao apague nada" existe para impedir.
 *
 * ## E A TELA NAO MOSTRA O AUTOR
 *
 * Nao porque ela escolheu: porque **o contrato nao o devolve**. Este painel so
 * le pessoa num lugar, a fila de pedidos de encontro, e isso esta afirmado em
 * TRES pontos de `api/openapi.yaml` com as decisoes D53 a D57 do cliente. A
 * consequencia e desconfortavel e precisa estar escrita: quem le a duvida aqui
 * **nao tem por onde responder** pelo painel.
 */
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
 * As colunas da tabela. Serve a DOIS usos -- o cabecalho e o
 * `LinhasCarregando` --, entao o esqueleto nunca desenha um numero de colunas
 * diferente do da tabela.
 *
 * **Nao ha coluna de AUTOR**, e nunca vai haver enquanto a D53 valer: o painel
 * le pessoa num lugar so, e nao e aqui. `Situacao` fala do ESTADO da duvida e
 * de quem a ATENDEU -- conta do painel, nao o tutor.
 */
export const COLUNAS = ['Assunto', 'Dúvida', 'Quando', 'Situação', ''];

/** Os padroes da lista, constante de modulo porque `useParametrosDaLista` o exige estavel. */
export const PADROES = { estado: 'open', busca: '' };

/**
 * Quem marcou e quando, numa frase -- ou `undefined` na aba `Na fila`.
 *
 * O nome e o da OPERADORA, de `admin_accounts`. Quando ele vier nulo com a
 * duvida atendida, o rotulo e do painel e nunca o e-mail nem parte dele: e a
 * mesma regra que `AdminJoinRequest.requester.display_name` escreve para a
 * outra fila.
 */
export function atendimentoDe(duvida: Duvida): string | undefined {
  if (duvida.status !== 'attended') return undefined;
  const quem = duvida.attended_by ?? 'Conta sem nome de exibição';
  return `${quem} · ${dataCurta(duvida.attended_at)}`;
}

export function dataCurta(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * O comeco do texto, para a linha da tabela.
 *
 * A tabela mostra um PEDACO e o dialogo mostra o inteiro. O corte e so da
 * TELA: o contrato devolve `body` completo em toda linha, de proposito, para
 * abrir uma duvida nao custar uma segunda viagem.
 *
 * `…` e nao `...`: o painel escreve reticencias de verdade.
 */
export function previa(texto: string, teto = 120): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= teto ? limpo : `${limpo.slice(0, teto - 1)}…`;
}

/**
 * A busca da tela, sobre a PAGINA JA CARREGADA.
 *
 * E filtro local e nao parametro de consulta, como na fila de moderacao: o
 * contrato desta operacao nao tem `q`, e inventar um aqui faria a tela pedir
 * algo que o servidor nao promete. O rotulo do vazio diz isso ao operador em
 * vez de o deixar achar que a fila inteira foi varrida.
 */
export function casaComABusca(duvida: Duvida, busca: string): boolean {
  if (busca === '') return true;
  const alvo = `${duvida.subject} ${duvida.body}`.toLowerCase();
  return alvo.includes(busca);
}

/**
 * A contagem do aviso do menu: quantas duvidas estao ABERTAS.
 *
 * Mesmo molde de `useIndicacoesPendentes`: pede `limit: 1` porque o que
 * interessa e `pending_total`, e nao as linhas. O numero vem do SERVIDOR e nao
 * de uma soma na tela -- uma soma local contaria so a pagina carregada e
 * diria "2 pendentes" sobre uma fila de duzentas.
 *
 * `versao` existe para a tela pedir o numero de novo depois de marcar uma como
 * atendida: sem isso o menu ficaria com o numero velho ate a proxima troca de
 * pagina, anunciando trabalho que ja foi feito.
 */
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
      // Silencio de proposito: um aviso de contagem que nao carregou nao e
      // motivo para a casca do painel mostrar erro. O item do menu fica sem o
      // numero, e a tela da fila diz a verdade quando alguem abrir.
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}
