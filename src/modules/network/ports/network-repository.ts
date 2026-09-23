/**
 * A porta da secao `Rede`.
 *
 * Tres operacoes, e sao exatamente as tres do contrato. **Nao ha escrita de
 * evento**, e a ausencia nao e omissao de conveniencia: e a decisao 4 do
 * ADR-0025. Nao existe moderacao, denuncia nem remocao em lugar nenhum deste
 * repositorio, e o cliente ja negou o equivalente para o diretorio na emenda 1
 * do ADR-0011. Quando a escrita existir, ela nasce em `/v1/admin/...` como
 * manda o ADR-0023. Porta que declara o que ainda nao existe vira metodo vazio
 * em todo dobre de teste.
 *
 * **Nao ha operacao que leia presenca linha a linha.** A unica leitura de
 * `network_event_checkins` que esta porta admite e a contagem, e o sinal
 * `viewerCheckedIn` sobre quem esta chamando. Nao ha `listarPresentes`, nao ha
 * `presentesDoEvento` e nao ha nada que devolva pessoa: o ADR-0025 secao 2
 * recusa a lista, e uma porta que a declarasse faria a recusa depender de
 * ninguem chamar o metodo.
 */
import type { EncontroComGaleria, EncontroDaRede } from '../domain/encontro-da-rede.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * O recorte no tempo da agenda.
 *
 * `upcoming` e o default no contrato e **isso importa**: a lista abre com o que
 * ainda vai acontecer. `all` existe e nao e o default, porque uma agenda que
 * mistura passado e futuro em ordem unica e o defeito mais comum de agenda.
 */
export type RecorteNoTempo = 'upcoming' | 'past' | 'all';

/**
 * As ordens que a rota aceita. `proximos` e crescente, `recentes` e decrescente.
 *
 * **Nao ha ordem por distancia**, e a ausencia e o ADR-0025 secao 5: o evento
 * nao tem coordenada, entao a distancia nao existe -- e uma ordem que nunca
 * podera ser cumprida e pior que uma que nao e oferecida. Ela tambem nao
 * aparece desabilitada.
 *
 * **Nao ha ordem por numero de presencas.** Ordenar por presenca transformaria
 * `checkin_count` numa disputa e daria a quem enche a contagem o topo da agenda.
 */
export type OrdemDaAgenda = 'proximos' | 'recentes';

export interface RecorteDaAgenda {
  /**
   * O termo de busca. Procura em titulo e resumo, **no servidor**: filtrar em
   * memoria os itens da pagina seria uma busca que funciona com 10 registros e
   * mente com 200.
   */
  readonly q?: string | undefined;
  /**
   * A cidade DIGITADA, nunca uma coordenada. ADR-0006: rotulo e filtro de
   * listagem, e nao fonte de coordenada.
   */
  readonly city?: string | undefined;
  readonly when: RecorteNoTempo;
  readonly sort: OrdemDaAgenda;
  /**
   * O instante que separa passado de futuro, injetado pelo `Clock`.
   *
   * Ele vem de fora em vez de a consulta chamar `now()` do banco porque `when`
   * e `status` precisam concordar: um evento rotulado `upcoming` na projecao e
   * excluido pelo recorte `upcoming` da consulta seria a lista contradizendo o
   * cartao que ela acabou de desenhar.
   */
  readonly agora: Instant;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaAgenda {
  readonly itens: readonly EncontroDaRede[];
  /**
   * O total do RECORTE, nao o da tabela. E ele que distingue "a Rede ainda nao
   * tem encontro" de "o seu recorte esvaziou a agenda"; o total da tabela faria
   * a tela prometer paginas que o filtro nao tem.
   */
  readonly total: number;
}

export interface PedidoDeEncontro {
  readonly slug: string;
  /**
   * Quem esta chamando, quando ha alguem. `undefined` para quem chega sem
   * conta, e ai `viewerCheckedIn` e `false` -- nao ha o caminho em que a
   * ausencia de conta vira uma consulta sem filtro de pessoa.
   */
  readonly chamador?: string | undefined;
}

export interface PedidoDeCheckIn {
  readonly slug: string;
  /** Aqui o chamador e obrigatorio: a operacao EXIGE conta. */
  readonly chamador: string;
}

/** O desfecho do check-in. A contagem JA ATUALIZADA, e nunca uma lista. */
export interface DesfechoDoCheckIn {
  readonly checkinCount: number;
}

export interface NetworkRepository {
  listarAgenda(recorte: RecorteDaAgenda): Promise<PaginaDaAgenda>;
  /**
   * O encontro e a galeria dele. `undefined` quando o evento nao existe **ou
   * esta inativo**, e os dois casos sao o mesmo caso de proposito: distinguir
   * contaria a um estranho que aquele `slug` existiu.
   */
  buscarEncontro(pedido: PedidoDeEncontro): Promise<EncontroComGaleria | undefined>;
  /**
   * Confirma presenca. `undefined` quando nao ha evento ativo com aquele
   * `slug`, e a resposta da borda e 404 -- **nunca 403, e nunca duas consultas
   * com comparacao no manipulador** (ADR-0021).
   */
  confirmarPresenca(pedido: PedidoDeCheckIn): Promise<DesfechoDoCheckIn | undefined>;
}
