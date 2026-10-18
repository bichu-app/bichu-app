/**
 * A porta da FILA DE REVISAO das indicacoes do `Perto`.
 *
 * ## Por que ela nao e `DirectorySuggestionRepository`
 *
 * Aquela porta tem um metodo so, `registrar`, e o cabecalho dela explica por
 * que: "porta que declara o que ainda nao existe vira metodo vazio em todo
 * dobre de teste". Ela declarou, em 17/10, que listar, ler e decidir nao
 * existiam **no contrato** ainda. Agora existem, e e esta a porta deles --
 * sentido oposto (leitura e decisao do painel), ator oposto (conta de
 * `admin_accounts`, nao de `users`) e cenarios opostos. Juntar os dois faria
 * todo dobre da escrita do aplicativo carregar quatro metodos de painel.
 *
 * ## A transacao ESTENDE a do diretorio, e isso e o reuso
 *
 * `TransacaoDaFila extends TransacaoDoDiretorio`: a aprovacao grava a entrada
 * chamando `inserirEntrada` da porta do diretorio, dentro da MESMA transacao em
 * que marca a indicacao aprovada. Nao ha segunda escrita de entrada neste
 * produto -- duas seriam duas definicoes de como uma entrada nasce (`status`,
 * `source`, `claim_status`, `version`, carimbos), e e isso que o ADR-0023 secao
 * 2 proibe.
 *
 * ## A autorizacao mora no `WHERE`, e por isso ela nao esta aqui
 *
 * **Nenhum metodo recebe "ver indicacao de conta desabilitada".** O predicado
 * (`indicacao_com_autor_ativo`, migracao `20261017000016`) esta na clausula
 * `WHERE` de cada uma das tres consultas do adaptador, e nao e parametro: um
 * parametro poderia chegar errado uma vez, e um `if` depois da leitura
 * responderia `403` onde o ADR-0021 manda `404`. Para esta porta, indicacao de
 * conta desabilitada simplesmente nao existe.
 */
import type { IndicacaoNaFila, RevisaoDaIndicacao } from '../domain/fila-de-indicacoes.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { Pagina, TransacaoDoDiretorio } from './diretorio-administrativo.js';

export interface RecorteDaFila {
  /** Sem filtro, a fila de `pending`. */
  readonly reviewStatus?: RevisaoDaIndicacao | undefined;
  readonly page: number;
  readonly limit: number;
}

/**
 * A pagina da fila, com a contagem do aviso do menu.
 *
 * `pendentes` IGNORA o recorte de proposito: o numero do item da navegacao
 * responde "quanto trabalho esta esperando", e nao "quantas linhas esta pagina
 * trouxe". Ele e a TERCEIRA consulta do adaptador a filtrar conta desabilitada
 * -- a listagem e a leitura sao as outras duas --, porque filtrar em um lugar so
 * faz o painel dizer "1 pendente" sobre fila vazia.
 */
export interface PaginaDaFila extends Pagina<IndicacaoNaFila> {
  readonly pendentes: number;
}

export interface TransacaoDaFila extends TransacaoDoDiretorio {
  /** A indicacao com trava de linha. `null` quando nao existe, ou quando a conta de quem indicou esta desabilitada. */
  indicacaoPorRef(ref: string): Promise<IndicacaoNaFila | null>;
  /**
   * Marca `approved`, carimba `decided_at` e liga a indicacao a entrada, **por
   * `slug`**: o UUID da entrada e resolvido dentro do adaptador e nao atravessa
   * esta fronteira (ADR-0010 item 6).
   */
  marcarAprovada(ref: string, entradaSlug: string, agora: Instant): Promise<IndicacaoNaFila>;
  /** Marca `declined`, carimba `decided_at` e grava o motivo. Nao apaga nada. */
  marcarRecusada(ref: string, motivo: string, agora: Instant): Promise<IndicacaoNaFila>;
}

export interface FilaDeIndicacoesRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDaFila) => Promise<T>): Promise<T>;
  listar(recorte: RecorteDaFila): Promise<PaginaDaFila>;
  indicacaoPorRef(ref: string): Promise<IndicacaoNaFila | null>;
}
