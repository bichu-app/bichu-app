import { problemas } from '../../../shared/http/errors.js';
import type { EscritaAuditada } from '../../audit/ports/audit-log.js';
import { eventoAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type {
  AtorAdministrativo,
  DeclaracaoDeTrilha,
} from '../../audit/ports/trilha-administrativa.js';
import type {
  Comunicado,
  PaginaDeComunicados,
  JanelaDeDisparo,
  RascunhoDeComunicado,
} from '../domain/comunicado.js';
import type { RepositorioDeComunicados } from '../ports/comunicados.js';

export interface DependenciasDosComunicados {
  readonly repositorio: RepositorioDeComunicados;
  readonly escrita: EscritaAuditada;
}

export class ComunicadosAdministrativos {
  constructor(private readonly deps: DependenciasDosComunicados) {}

  /** Os ja disparados. Sem trilha: nao e escrita e nao le pessoa. */
  async listar(pedido: {
    readonly pagina?: number;
    readonly limite?: number;
  }): Promise<PaginaDeComunicados> {
    const pagina = Math.max(1, pedido.pagina ?? 1);
    const limite = Math.min(Math.max(1, pedido.limite ?? 20), 50);
    return this.deps.repositorio.listar(pagina, limite);
  }

  /**
   * O que o servidor contribui para a pre-visualizacao: alcance, quantos cabem hoje
   * e o teto.
   */
  async janelaDeDisparo(): Promise<JanelaDeDisparo> {
    return this.deps.repositorio.janelaDeDisparo();
  }

  /** Dispara o comunicado. Irreversivel. */
  async disparar(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    rascunho: RascunhoDeComunicado,
  ): Promise<Comunicado> {
    return this.deps.escrita.executar(async (trx) => {
      const gravado = await this.deps.repositorio.disparar(trx, ator.adminAccountId, rascunho);
      if (gravado === undefined) throw problemas.tetoDiarioDeComunicados();

      return {
        resultado: gravado.comunicado,
        evento: eventoAdministrativo(declaracao, ator, {
          resourceId: gravado.id,
          after: {
            title: gravado.comunicado.titulo,
            recipients_total: gravado.comunicado.destinatarios,
          },
          metadata: { ref: gravado.comunicado.ref },
        }),
      };
    });
  }
}
