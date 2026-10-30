/**
 * **A única camada deste módulo que outro módulo enxerga** (ADR-0001,
 * docs/03-arquitetura.md §6), e ela é curta de propósito.
 */
import type { EstadoNoApp } from '../domain/conexao.js';

/**
 * **O estado da aresta, REEXPORTADO pela porta** — e a reexportação é a fronteira
 * funcionando, não conveniência.
 */
export type { EstadoNoApp };
import type { Instant, UserId } from '../../../shared/types/brands.js';

export interface LeitorDeConexao {
  /** **Estes dois estão conectados AGORA?** */
  estaConectado(um: UserId, outro: UserId): Promise<boolean>;

  /**
   * Quantas conexões aceitas esta conta tem, contando os dois lados e só contas
   * habilitadas.
   */
  contarConexoes(pessoa: UserId): Promise<number>;

  /**
   * **A aresta VIVA entre os dois, projetada do ponto de vista de quem olha** — ou
   * `undefined` quando não há nenhuma.
   */
  arestaVivaEntre(
    quemOlha: UserId,
    outro: UserId,
    agora: Instant,
  ): Promise<ArestaVivaDoPar | undefined>;

  /**
   * **O estado da aresta entre `quemOlha` e CADA um destes apelidos**, numa consulta
   * só.
   */
  estadosPorApelido(
    quemOlha: UserId,
    apelidos: readonly string[],
    agora: Instant,
  ): Promise<ReadonlyMap<string, EstadoNoApp>>;
}

/** O que [LeitorDeConexao.arestaVivaEntre] devolve: estado e `ref` da ARESTA. */
export interface ArestaVivaDoPar {
  readonly estado: EstadoNoApp;
  /** O `ref` da aresta. **Da aresta, nunca de uma pessoa.** */
  readonly ref: string;
}

/**
 * **O contrato com a fatia E.** O bloqueio é dela; o efeito sobre a conexão é
 * desta, e esta é a única escrita que o produz.
 */
export interface ConexaoSobBloqueio {
  /** Apaga o pendente nas duas direções e desfaz a conexão do par. */
  desfazerPorBloqueio(um: UserId, outro: UserId, agora: Instant): Promise<number>;
}
