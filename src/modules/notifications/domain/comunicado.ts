/**
 * O COMUNICADO -- o unico aviso do produto com alcance total.
 *
 * Dominio puro: nao conhece banco, HTTP nem framework.
 */

/**
 * Quantos comunicados cabem por dia.
 *
 * TRES, e nao um nem dez: tres cabe um comunicado, a correcao dele e um
 * terceiro imprevisto no mesmo dia, e nao cabe uma sequencia que transforme o
 * sino em feed.
 *
 * **Este numero esta em DOIS lugares de proposito**: aqui e dentro de
 * `comunicado_disparar(uuid, text, text)` na migracao `20261018000020`. Quem
 * APLICA o teto e o banco, na mesma transacao da gravacao -- teto conferido
 * numa consulta anterior e teto que duas abas furam. O valor vive aqui tambem
 * porque a pre-visualizacao precisa dizer quantos ainda cabem hoje, e porque o
 * teste de desligamento compara os dois.
 */
export const TETO_DIARIO_DE_COMUNICADOS = 3;

export interface Comunicado {
  /** Identificador opaco. Nao e UUID (ADR-0010). */
  readonly ref: string;
  readonly titulo: string;
  readonly corpo: string;
  readonly disparadoEm: Date;
  /**
   * O NOME DE EXIBICAO da conta de painel que disparou. Nao e o e-mail e nao e
   * o UUID: a pergunta que a tela responde e "quem mandou isto", e o nome a
   * responde sem publicar identificador.
   */
  readonly disparadoPor: string;
  /** Quantas caixas ele alcancou NO INSTANTE do disparo. */
  readonly destinatarios: number;
}

export interface PaginaDeComunicados {
  readonly itens: readonly Comunicado[];
  readonly pagina: number;
  readonly limite: number;
  readonly total: number;
}

/**
 * O que o SERVIDOR contribui para a pre-visualizacao. **Nao grava nada e nao
 * alcanca caixa nenhuma.**
 *
 * **Ela nao carrega o rascunho, e a ausencia e a decisao.** A primeira forma
 * desta leitura era um `POST .../preview` que mandava titulo e corpo e os
 * devolvia. Duas razoes a derrubaram, e apontam para o mesmo lugar:
 *
 * 1. `portao-contrato-administrativo` (ADR-0027 item 7, regra 2) exige
 *    `x-audit` de toda operacao sob `/admin/` de metodo nao seguro -- e com
 *    razao: sob `/admin`, metodo nao seguro E escrita, e "esta aqui nao
 *    escreve" e justamente a afirmacao que um portao nao pode aceitar na
 *    palavra de quem escreveu a rota. Dar trilha a uma pre-visualizacao
 *    gravaria uma linha por tecla digitada e afogaria a trilha do disparo.
 * 2. **O servidor nao precisa do texto.** Nenhum destes tres numeros depende de
 *    uma letra do rascunho; renderizar titulo e corpo e trabalho do painel, que
 *    ja os tem na mao.
 *
 * A pre-visualizacao continua obrigatoria antes do disparo. Ela so deixou de
 * precisar de uma ida ao servidor carregando o texto.
 */
export interface JanelaDeDisparo {
  /**
   * Quantas contas habilitadas o disparo alcancaria AGORA. E uma CONTAGEM e
   * nunca uma lista. Estimativa por construcao -- o numero muda entre a leitura
   * e o disparo --, e e por isso que `Comunicado.destinatarios` e gravado em
   * separado no instante do disparo.
   */
  readonly alcancaria: number;
  /**
   * Quantos ainda cabem hoje. **Zero aqui e o que a tela usa para desabilitar o
   * disparo antes de tentar**, em vez de descobrir pelo 409.
   */
  readonly restamHoje: number;
  /**
   * O teto diario. Sai na resposta em vez de ser constante do painel: duas
   * copias do mesmo numero divergem, e a que diverge e a que diz "resta 1"
   * sobre um teto que o banco ja fechou.
   */
  readonly tetoDiario: number;
}

/** O rascunho que o painel manda, ja conferido pelo schema do contrato. */
export interface RascunhoDeComunicado {
  readonly titulo: string;
  readonly corpo: string;
}
