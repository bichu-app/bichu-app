/**
 * A leitura da fila pelo painel.
 *
 * Fina de proposito: o que ha para decidir aqui e o TETO da pagina, e ele
 * existe porque `limit` chega do painel e um numero grande o bastante
 * transformaria uma leitura de fila numa varredura da tabela.
 *
 * **Nao ha regra de autorizacao aqui**, e a ausencia e correta: quem decide se
 * a chamada entra e `escoparRotasAdministrativas`, pela sessao administrativa
 * e pelo papel declarado em `adminRoles`. Repetir a pergunta neste servico
 * criaria uma segunda fonte da verdade sobre quem pode ler o quê.
 */
import type { DuvidasDeAjuda, PaginaDaFila } from '../ports/duvidas-de-ajuda.js';

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
  listar(pagina: number, limite: number): Promise<PaginaDaFila>;
}

export function criarFilaDeAjudaService(duvidas: DuvidasDeAjuda): FilaDeAjudaAdministrativa {
  return {
    listar(pagina: number, limite: number): Promise<PaginaDaFila> {
      return duvidas.listarAFila(
        Math.max(PAGINA_MINIMA, Math.trunc(pagina)),
        Math.min(TETO_DA_PAGINA, Math.max(1, Math.trunc(limite))),
      );
    },
  };
}
