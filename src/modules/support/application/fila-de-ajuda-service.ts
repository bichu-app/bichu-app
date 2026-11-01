import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type { Clock } from '../../../shared/time/clock.js';
import type {
  DuvidaNaFila,
  DuvidasDeAjuda,
  PaginaDaFila,
  SituacaoDaDuvida,
} from '../ports/duvidas-de-ajuda.js';

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
      return duvidas.marcarAtendida(ator, ref, relogio.now());
    },
  };
}
