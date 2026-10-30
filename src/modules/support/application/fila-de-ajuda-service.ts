/**
 * A leitura da fila pelo painel, e a marcacao de atendida.
 *
 * Fina de proposito. O que ha para decidir aqui e o TETO da pagina, e ele
 * existe porque `limit` chega do painel e um numero grande o bastante
 * transformaria uma leitura de fila numa varredura da tabela.
 *
 * **Nao ha regra de autorizacao aqui**, e a ausencia e correta: quem decide se
 * a chamada entra e `escoparRotasAdministrativas`, pela sessao administrativa
 * e pelo papel declarado em `adminRoles`. Repetir a pergunta neste servico
 * criaria uma segunda fonte da verdade sobre quem pode ler o que.
 *
 * **E nao ha `DELETE`.** Atendida e mudanca de estado; desmarcar nao existe,
 * por decisao registrada no cabecalho da migracao `20261030000001`.
 */
import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type { Clock } from '../../../shared/time/clock.js';
import type {
  DuvidaNaFila,
  DuvidasDeAjuda,
  PaginaDaFila,
  SituacaoDaDuvida,
} from '../ports/duvidas-de-ajuda.js';

/**
 * O teto da pagina, e o mesmo do contrato (`AdminLimit`, `maximum: 100`).
 *
 * O contrato ja recusa `limit=101` antes do handler. Este `Math.min` e a
 * segunda linha, e vale a linha: um caminho de chamada que nao passe pelo
 * esquema do contrato -- um teste, um script, um caso de uso futuro -- pediria
 * a tabela inteira numa consulta so.
 */
const TETO_DA_PAGINA = 100;
const PAGINA_MINIMA = 1;

export interface FilaDeAjudaAdministrativa {
  listar(situacao: SituacaoDaDuvida, pagina: number, limite: number): Promise<PaginaDaFila>;
  /** `undefined` quando o `ref` nao existe -- a rota traduz para 404. */
  atender(ator: AtorAdministrativo, ref: string): Promise<DuvidaNaFila | undefined>;
}

export function criarFilaDeAjudaService(
  duvidas: DuvidasDeAjuda,
  relogio: Clock,
): FilaDeAjudaAdministrativa {
  return {
    listar(situacao: SituacaoDaDuvida, pagina: number, limite: number): Promise<PaginaDaFila> {
      return duvidas.listarAFila(
        situacao,
        Math.max(PAGINA_MINIMA, Math.trunc(pagina)),
        Math.min(TETO_DA_PAGINA, Math.max(1, Math.trunc(limite))),
      );
    },

    atender(ator: AtorAdministrativo, ref: string): Promise<DuvidaNaFila | undefined> {
      // O ATOR INTEIRO e nao so a conta: a trilha grava IP, correlacao e
      // etiqueta da sessao junto, e e isso que torna a transicao auditavel no
      // sentido que o cliente pediu.
      //
      // O INSTANTE SAI DO RELOGIO INJETADO, e nao de `new Date()` solto: e o
      // que torna o caso de teste deterministico, e e a regra desta casa para
      // toda coluna de data.
      return duvidas.marcarAtendida(ator, ref, relogio.now());
    },
  };
}
