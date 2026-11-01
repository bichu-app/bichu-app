import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import {
  erroSeJaResolvido,
  MAXIMO_DO_MOTIVO,
  MINIMO_DO_MOTIVO,
  projetarItem,
  retratoDoItem,
  type DecisaoDaModeracao,
  type EstadoDaFila,
  type ItemProjetado,
  type OrigemDaDenuncia,
  type OrigemDecidivel,
} from '../domain/fila-de-moderacao.js';
import type { FilaDeModeracaoRepository, TransacaoDaModeracao } from '../ports/fila-de-moderacao.js';

/** O corpo das duas escritas. */
export interface MotivoDaDecisao {
  readonly reason: string;
}

/** Quem agiu, como a guarda do prefixo o identificou. */
export interface Autor {
  readonly adminAccountId: import('../../../shared/types/brands.js').AdminAccountId;
  readonly ip: string | undefined;
  readonly correlationId: string;
  readonly sessao: string;
}

export interface PaginaProjetada {
  readonly items: readonly ItemProjetado[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly pending_total: number;
}

/**
 * As conferencias de texto que este modulo **nao reimplementa**, recebidas como
 * porta -- mesmo arranjo e mesmo motivo de
 * `professionals/ports/conferencias-de-texto.ts`:
 * `arquitetura/fronteira-de-modulo` reprova importar `network/domain` daqui, e
 * escrever um segundo detector faria dois detectores que divergem calados.
 */
export interface ConferenciasDeTexto {
  errosDeTextoDeUsuario(
    campo: string,
    valor: string,
    minimo: number,
    maximo: number,
  ): ProblemFieldError[];
}

export interface DependenciasDaFilaDeModeracao {
  readonly repositorio: FilaDeModeracaoRepository;
  readonly conferencias: ConferenciasDeTexto;
  readonly clock: Clock;
}

export interface RecortePedido {
  readonly estado?: EstadoDaFila | undefined;
  readonly origem?: OrigemDaDenuncia | undefined;
  readonly page: number;
  readonly limit: number;
}

export class FilaDeModeracao {
  constructor(private readonly deps: DependenciasDaFilaDeModeracao) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  async listar(recorte: RecortePedido): Promise<PaginaProjetada> {
    const pagina = await this.deps.repositorio.listar(recorte);
    return {
      items: pagina.itens.map(projetarItem),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
      pending_total: pagina.pendentes,
    };
  }

  async ler(origem: OrigemDaDenuncia, targetRef: string): Promise<ItemProjetado> {
    const item = await this.deps.repositorio.itemPorAlvo(origem, targetRef);
    if (item === null) throw problemas.naoEncontrado();
    return projetarItem(item);
  }

  /**
   * **Remove o conteudo do ar** (exclusao logica) e resolve as denuncias.
   *
   * `OrigemDecidivel` e nao `OrigemDaDenuncia`: quem estreita e a BORDA, que e
   * onde ha status HTTP para responder a origem que o contrato declara e esta
   * casa nao decide.
   */
  async remover(autor: Autor, origem: OrigemDecidivel, targetRef: string, corpo: MotivoDaDecisao) {
    const motivo = this.motivoConferido(corpo);

    return this.deps.repositorio.emTransacao(async (tx: TransacaoDaModeracao) => {
      const item = await FilaDeModeracao.itemAberto(tx, origem, targetRef);

      const alvo = await tx.removerConteudo(origem, targetRef, motivo, this.agora());
      if (alvo === null) throw problemas.naoEncontrado();

      const resolucao = await tx.resolverDenuncias(
        origem,
        targetRef,
        'content_removed',
        motivo,
        this.agora(),
      );

      await tx.registrarNaTrilha(
        FilaDeModeracao.evento(autor, 'admin.moderation_report.content_removed', alvo.id, {
          before: { ...retratoDoItem(item), rating: alvo.notaAntes },
          after: {
            origin: origem,
            content_removed: true,
            resolution: 'content_removed',
            reason: motivo,
            reports_resolved: resolucao.quantidade,
          },
          metadata: { origin: origem, target_ref: targetRef },
        }),
      );

      return projetarItem({
        ...item,
        conteudoRemovido: true,
        decisao: 'content_removed',
        motivoDaDecisao: motivo,
        decididaEm: resolucao.decididaEm,
      });
    });
  }

  /** **Descarta a denuncia, tambem com motivo. */
  async descartar(
    autor: Autor,
    origem: OrigemDecidivel,
    targetRef: string,
    corpo: MotivoDaDecisao,
  ) {
    const motivo = this.motivoConferido(corpo);

    return this.deps.repositorio.emTransacao(async (tx: TransacaoDaModeracao) => {
      const item = await FilaDeModeracao.itemAberto(tx, origem, targetRef);

      const resolucao = await tx.resolverDenuncias(
        origem,
        targetRef,
        'dismissed',
        motivo,
        this.agora(),
      );
      if (resolucao.quantidade === 0) throw problemas.naoEncontrado();

      await tx.registrarNaTrilha(
        FilaDeModeracao.evento(autor, 'admin.moderation_report.dismissed', targetRef, {
          before: retratoDoItem(item),
          after: {
            origin: origem,
            content_removed: item.conteudoRemovido,
            resolution: 'dismissed',
            reason: motivo,
            reports_resolved: resolucao.quantidade,
          },
          metadata: { origin: origem, target_ref: targetRef },
        }),
      );

      return projetarItem({
        ...item,
        decisao: 'dismissed',
        motivoDaDecisao: motivo,
        decididaEm: resolucao.decididaEm,
      });
    });
  }

  /** A leitura travada, com os dois juizos de "ainda da para decidir". */
  private static async itemAberto(
    tx: TransacaoDaModeracao,
    origem: OrigemDecidivel,
    targetRef: string,
  ) {
    const item = await tx.itemPorAlvo(origem, targetRef);
    if (item === null) throw problemas.naoEncontrado();
    const jaResolvido = erroSeJaResolvido(item);
    if (jaResolvido !== null) throw problemas.validacao([jaResolvido]);
    return item;
  }

  private motivoConferido(corpo: MotivoDaDecisao): string {
    const erros = this.deps.conferencias.errosDeTextoDeUsuario(
      'reason',
      corpo.reason,
      MINIMO_DO_MOTIVO,
      MAXIMO_DO_MOTIVO,
    );
    if (erros.length > 0) throw problemas.validacao(erros);
    return corpo.reason.trim();
  }

  /** O evento, montado de um jeito so. */
  private static evento(
    autor: Autor,
    action: 'admin.moderation_report.content_removed' | 'admin.moderation_report.dismissed',
    resourceId: string,
    dados: {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      metadata: Record<string, unknown>;
    },
  ): AuditEvent {
    return {
      actorKind: 'admin',
      actorAdminId: autor.adminAccountId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind: 'moderation_report',
      resourceId,
      before: dados.before,
      after: dados.after,
      metadata: { ...dados.metadata, surface: 'admin', session: autor.sessao },
    };
  }
}

export type { DecisaoDaModeracao };
