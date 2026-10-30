/**
 * O vocabulario da FILA DE DUVIDAS no painel.
 *
 * ## Arquivo proprio, em pasta propria
 *
 * Varias frentes mexem neste repositorio ao mesmo tempo. Modulo novo em pasta
 * nova faz a mescla ser limpa, e e o mesmo arranjo -- e o mesmo motivo -- de
 * `plaquinhas/fila.ts` e de `diretorio/fila.ts`.
 *
 * ## A FILA NAO TEM ESTADO, e a ausencia e decisao registrada
 *
 * Nao ha abas, nao ha `status`, nao ha chip de recorte. A duvida entra e fica.
 *
 * O cliente decidiu em 29/10/2026 que a duvida *"grava no banco e vai para o
 * backoffice"*, **sem notificacao**. Ele nao decidiu o que torna uma duvida
 * RESOLVIDA -- se e responder, se e o tutor confirmar, se e nunca --, e essa
 * pergunta e dele: ela e o que diz se esta tela e uma fila que esvazia ou um
 * registro que so cresce.
 *
 * Coluna de estado que nenhum codigo escreve seria casca: pareceria uma fila
 * com tratamento e nao teria nenhum. Quando a decisao vier, o estado nasce
 * como MUDANCA DE ESTADO e nunca `DELETE` -- "nao apague nada" e decisao desta
 * casa.
 *
 * ## E A TELA NAO MOSTRA O AUTOR
 *
 * Nao porque ela escolheu: porque **o contrato nao o devolve**. Este painel so
 * le pessoa num lugar, a fila de pedidos de encontro, e isso esta afirmado em
 * TRES pontos de `api/openapi.yaml` com as decisoes D53 a D57 do cliente. A
 * consequencia e desconfortavel e precisa estar escrita: quem le a duvida aqui
 * **nao tem por onde responder** pelo painel.
 */
import type { Esquemas } from '../api/cliente.ts';

export type Duvida = Esquemas['AdminHelpRequest'];

/**
 * As colunas da tabela. Serve a DOIS usos -- o cabecalho e o
 * `LinhasCarregando` --, entao o esqueleto nunca desenha um numero de colunas
 * diferente do da tabela.
 *
 * Nao ha coluna de autor, e nao ha de situacao. Ver o cabecalho.
 */
export const COLUNAS = ['Assunto', 'Dúvida', 'Quando', ''];

/** Os padroes da lista, constante de modulo porque `useParametrosDaLista` o exige estavel. */
export const PADROES = { busca: '' };

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
