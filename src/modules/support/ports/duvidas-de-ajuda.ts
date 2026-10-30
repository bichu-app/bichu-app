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
 * ## NADA DO AUTOR SAI AQUI, e a ausencia e a regra da casa
 *
 * `api/openapi.yaml` afirma em TRES lugares que a fila de pedidos de encontro
 * e *"a unica leitura de pessoa do backoffice v1"*, coberta pelo RA-01 com as
 * decisoes D53 a D57 do cliente (23/09). A fila de plaquinhas repete a
 * afirmacao e se abstem de ler perfil, projetando so o nome de quem recebe a
 * encomenda -- que e destinatario de entrega e nao leitura de conta.
 *
 * Entao esta interface **nao tem `autor`**. Projetar nome, e-mail ou um
 * identificador estavel do tutor criaria a SEGUNDA leitura de pessoa do
 * backoffice e tornaria aquela frase falsa nos tres lugares -- e isso e
 * decisao do cliente, do tamanho da D53, nao de quem escreve a porta.
 *
 * `ref` e por DUVIDA e nao por pessoa: duas duvidas do mesmo tutor tem refs
 * sem relacao entre si, entao o painel nao monta "todas as duvidas da Maria",
 * que e exatamente o que a D53 proibe.
 */
export interface DuvidaNaFila {
  /** O endereco OPACO da duvida, 22 simbolos. **Nunca o `id`.** */
  readonly ref: string;
  readonly assunto: string;
  readonly texto: string;
  readonly criadaEm: Instant;
}

/** Uma pagina da fila, no formato que o painel ja usa nas outras duas. */
export interface PaginaDaFila {
  readonly itens: readonly DuvidaNaFila[];
  /**
   * O total de duvidas, para o painel desenhar quantas paginas ha.
   *
   * Conta LINHAS e nao pessoas, e nao ha recorte por autor que o torne um
   * numero sobre alguem.
   */
  readonly total: number;
}

export interface DuvidasDeAjuda {
  /**
   * Grava a duvida. **Nao notifica ninguem**: nao escreve em
   * `notification_items`, nao enfileira e-mail e nao dispara push. A ausencia de
   * aviso e a decisao do cliente, e nao um pedaco que faltou.
   */
  registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void>;

  /**
   * A fila, da mais nova para a mais velha -- a consulta que o painel usa, e a
   * mesma que o indice `help_requests_da_fila` serve.
   *
   * `pagina` comeca em 1, como em toda pagina do painel.
   */
  listarAFila(pagina: number, limite: number): Promise<PaginaDaFila>;
}
