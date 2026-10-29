/**
 * A fila das duvidas que chegam pelo botao `Ajuda` do menu do usuario.
 *
 * Pedido do cliente de 29/10/2026 ("no menu do usuario, adicione um botao de
 * ajuda, que abrira uma pagina com um formulario de duvida"), com a decisao de
 * destino tomada na mesma conversa: **grava no banco e vai para o backoffice**,
 * **sem notificacao por e-mail**.
 *
 * ## DUAS OPERACOES, E A SEGUNDA AINDA NAO TEM ROTA
 *
 * `registrar` e a escrita, e e a que o aplicativo chama.
 *
 * `listarAFila` e a LEITURA que o painel vai usar, e ela existe aqui **de
 * proposito, antes da tela**. A razao esta escrita porque e uma escolha e nao
 * um descuido: sem ela, a funcionalidade nasceria com entrada e **sem porta de
 * saida** -- linha gravada que nenhuma consulta alcanca e que ninguem
 * descobriria estar inalcancavel ate o dia de construir o painel. O caso de
 * integracao exerce as duas, e e ele que prova que o que a escrita grava a
 * leitura devolve.
 *
 * **A ROTA ADMINISTRATIVA NAO ENTRA NESTA ENTREGA**, e a razao e de fronteira,
 * nao de esforco: toda operacao sob `/admin/` e cobrada por
 * `src/tools/portao-rastreabilidade.ts` em
 * `api/rastreabilidade-backoffice-rede.yaml`, que e arquivo da frente do
 * painel, viva agora. Declarar a operacao obrigaria a escrever naquele arquivo
 * e a disputar com quem esta nele. O que fica pronto aqui e tudo o que a rota
 * precisaria: a porta, a consulta e a prova de que ela le.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';

/** O que o tutor escreveu, ja aparado e dentro dos tetos do contrato. */
export interface DuvidaParaRegistrar {
  readonly autor: UserId;
  readonly assunto: string;
  readonly texto: string;
}

/**
 * Uma linha da fila, **como o painel a le**.
 *
 * O `id` sai daqui porque o consumidor e o painel e nao o aplicativo -- a rota
 * do app responde `202` e nao devolve identificador nenhum. Nenhum campo de
 * contato aparece: nome e e-mail do autor sao do cadastro, e o painel os resolve
 * por juncao com `users` quando tiver tela.
 */
export interface DuvidaNaFila {
  readonly id: string;
  readonly autor: UserId;
  readonly assunto: string;
  readonly texto: string;
  readonly criadaEm: Instant;
}

export interface DuvidasDeAjuda {
  /**
   * Grava a duvida. **Nao notifica ninguem**: nao escreve em
   * `notification_items`, nao enfileira e-mail e nao dispara push. A ausencia de
   * aviso e a decisao do cliente, e nao um pedaco que faltou.
   */
  registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void>;

  /**
   * A fila, da mais nova para a mais velha -- a consulta que o painel vai usar,
   * e a mesma que o indice `help_requests_da_fila` serve.
   */
  listarAFila(limite: number): Promise<readonly DuvidaNaFila[]>;
}
