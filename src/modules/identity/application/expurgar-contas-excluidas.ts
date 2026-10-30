/** O EXPURGO NÃO EXPURGA MAIS NADA, e esta função é inócua de propósito. */
import type { Clock } from '../../../shared/time/clock.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';

export interface DependenciasDoExpurgo {
  /**
   * Não usado. `contasAExpurgar` continua na porta porque é uma LEITURA, e é ela que
   * o procedimento administrativo de apagamento sob pedido vai precisar para listar
   * candidatas.
   */
  readonly repositorio: Pick<IdentityRepository, 'contasAExpurgar'>;
  /** Não usado. Nenhum evento é gravado, porque nenhum fato acontece. */
  readonly trilha: AuditLog;
  /** Não usado. */
  readonly clock: Clock;
  /**
   * Não usado, e é o ponto inteiro desta mudança: era esta função que apagava os
   * arquivos do balde.
   */
  readonly apagarObjetosDaConta: (dono: UserId) => Promise<number>;
}

export interface ResultadoDoExpurgo {
  readonly examinadas: number;
  readonly expurgadas: number;
  readonly falhas: number;
}

/** Devolve três zeros, sem tocar banco nem balde. */
export function expurgarContasExcluidas(
  deps: DependenciasDoExpurgo,
): Promise<ResultadoDoExpurgo> {
  void deps;
  return Promise.resolve({ examinadas: 0, expurgadas: 0, falhas: 0 });
}
