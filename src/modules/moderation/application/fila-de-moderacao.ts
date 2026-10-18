/**
 * O caso de uso da FILA DE MODERACAO do painel (18/10/2026).
 *
 * ## A decisao do cliente, literal
 *
 * "Quem modera vai ser o administrador, deve ir para a pagina de backoffice."
 *
 * O que existia antes: `conversation_reports` GRAVAVA denuncia desde 28/09 e
 * **nenhuma rota do painel a resolvia** -- nenhuma rota a lia. A denuncia de
 * avaliacao do `Perto` tinha remocao pelo administrador
 * (`removeAdminDirectoryReview`), mas enderecada pelo `ref` que alguem tirava
 * da pagina publica do local, porque nao havia fila navegavel; o cabecalho
 * daquela rota diz isso por extenso.
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * Nenhuma conferencia de autenticacao, de CSRF, de origem nem de papel: as
 * quatro acontecem na guarda do escopo (`escoparRotasAdministrativas`), antes
 * de qualquer gancho da rota (ADR-0027 item 7). **Nenhuma escrita daqui pede
 * reautenticacao por senha** -- ela foi removida de toda escrita administrativa
 * em 07/10/2026 por decisao do cliente (ADR-0027 item 23).
 *
 * ## AS DUAS ACOES, E O QUE CADA UMA FAZ DE VERDADE
 *
 * `remover` faz tres coisas em UMA transacao, e a trilha e a quarta:
 *
 *   1. le o item com trava nas denuncias abertas (dois cliques juntos nao
 *      decidem duas vezes) e responde `404` se nao houver nada aberto;
 *   2. **esconde o conteudo** -- `status = 'removed'` na avaliacao,
 *      `moderation_removed_at` na conversa --, com o motivo gravado na propria
 *      linha do conteudo. **Exclusao logica: nao ha `DELETE` em caminho nenhum
 *      deste modulo**;
 *   3. marca todas as denuncias abertas daquele alvo com
 *      `resolution = 'content_removed'` e o motivo.
 *
 * `descartar` faz so o passo 3, com `resolution = 'dismissed'`. **O conteudo
 * fica no ar e a denuncia NAO e apagada**: a linha permanece legivel, com a
 * decisao e o motivo, e o `down` da `20261018000009` recusa a propria descida
 * justamente para que ela continue.
 *
 * ## O MOTIVO E OBRIGATORIO NAS DUAS, e e a diferenca entre moderacao e arbitrio
 *
 * Nas duas, e nao so na remocao. Descartar tambem e uma decisao sobre o
 * trabalho de outra pessoa -- alguem denunciou e um administrador disse que nao
 * procedia --, e sem o motivo gravado o proximo que receber a MESMA denuncia
 * (o indice unico de `conversation_reports` e parcial: resolver libera o par
 * para denunciar de novo) refaz o juizo que alguem ja fez.
 *
 * O motivo passa pelo MESMO detector de todo texto que uma pessoa escreve
 * (D59 e controle bidirecional), pela porta de conferencias: um segundo
 * detector aqui divergiria calado do primeiro.
 *
 * ## NENHUMA ACAO SOBRE A CONTA DA PESSOA
 *
 * Nao ha metodo que toque `users`, e a ausencia e deliberada. Desabilitar
 * conta e outro poder, com trilha propria, e nao entra nesta fila. **Se um dia
 * precisar entrar, ele entra como outra operacao, com outro papel de
 * `x-admin-roles` e outro evento de trilha** -- e nao como um terceiro botao
 * ao lado destes dois.
 *
 * ## NENHUMA NOTIFICACAO, NENHUM PRAZO, NENHUMA MODERACAO AUTOMATICA
 *
 * O denunciante nao recebe resultado e o denunciado nao e avisado (avisar o
 * denunciado e retaliacao, e e decisao de desenho ja tomada). Nada aqui monta
 * mensagem nem enfileira envio. Nao ha prazo nem promessa de resposta: o
 * produto nao promete prazo. E nada aqui olha o texto para decidir -- a lista
 * de palavras e de outro lugar e nao e chamada por este modulo.
 *
 * ## 404 e nunca 403 (ADR-0021)
 *
 * Alvo inexistente, alvo sem denuncia aberta e denuncia de **conta
 * desabilitada** respondem o mesmo `404`: o predicado esta no `WHERE` das tres
 * consultas do adaptador, e nao num `if` depois da leitura. Para este caso de
 * uso ela nao existe.
 */
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
} from '../domain/fila-de-moderacao.js';
import type { FilaDeModeracaoRepository, TransacaoDaModeracao } from '../ports/fila-de-moderacao.js';

/** O corpo das duas escritas. Uma forma so, porque e a mesma decisao. */
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
 * `professionals/ports/conferencias-de-texto.ts`: `arquitetura/fronteira-de-modulo`
 * reprova importar `network/domain` daqui, e escrever um segundo detector faria
 * dois detectores que divergem calados.
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
   * A ordem importa e e esta: o conteudo sai primeiro, as denuncias sao
   * marcadas depois, e a trilha e o ULTIMO passo da transacao. Marcar a
   * denuncia antes de esconder o conteudo deixaria, numa falha no meio, uma
   * denuncia resolvida sobre conteudo que continua no ar -- e a fila nao
   * mostraria mais o item para ninguem consertar.
   */
  async remover(autor: Autor, origem: OrigemDaDenuncia, targetRef: string, corpo: MotivoDaDecisao) {
    const motivo = this.motivoConferido(corpo);

    return this.deps.repositorio.emTransacao(async (tx: TransacaoDaModeracao) => {
      const item = await FilaDeModeracao.itemAberto(tx, origem, targetRef);

      const alvo = await tx.removerConteudo(origem, targetRef, motivo, this.agora());
      // `null` quando o conteudo JA estava fora do ar. 404 e nao 409: o motivo
      // da primeira remocao e de quem auditar, e sobrescreve-lo apagaria a
      // decisao que valeu. Mesma escolha de `removerAvaliacao`.
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
          // `before`/`after` carregam a ORIGEM, o estado do conteudo e os dois
          // numeros da repeticao -- **nunca o texto denunciado nem o relato de
          // quem denunciou**. A trilha sobrevive a exclusao da conta de
          // proposito, e copiar para dentro dela o texto de uma avaliacao
          // removida por ser ofensiva o deixaria gravado onde ele nao tem o
          // mesmo controle de acesso (docs/04-seguranca.md 9). A NOTA entra,
          // porque e ela que explica o efeito na media do local.
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

  /**
   * **Descarta a denuncia, tambem com motivo. O conteudo fica no ar.**
   *
   * Nada e apagado: `descartar` grava `resolution = 'dismissed'` e o motivo
   * sobre a linha da denuncia, que continua legivel em
   * `listAdminModerationReports` com `state=resolved`.
   */
  async descartar(
    autor: Autor,
    origem: OrigemDaDenuncia,
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
      // Zero quer dizer que alguem chegou primeiro entre a leitura travada e a
      // escrita -- que a trava deveria impedir. 404 em vez de sobrescrever.
      if (resolucao.quantidade === 0) throw problemas.naoEncontrado();

      await tx.registrarNaTrilha(
        FilaDeModeracao.evento(autor, 'admin.moderation_report.dismissed', targetRef, {
          before: retratoDoItem(item),
          after: {
            origin: origem,
            // **Fica no ar**, e e isto que distingue descartar de remover na
            // trilha: quem auditar ve que o conteudo nao foi tocado.
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
    origem: OrigemDaDenuncia,
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

  /**
   * O evento, montado de um jeito so.
   *
   * `resourceKind` e `moderation_report`, e nao `professional_review` nem
   * `conversation`: o alvo da DECISAO e o item de fila, e a origem vai em
   * `metadata.origin`. Uma investigacao que procurasse por `moderation_report`
   * acha as duas acoes das duas origens numa consulta so, que e a pergunta que
   * se faz de uma fila de moderacao.
   */
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
      // `surface` e `session` DEPOIS do que veio de fora: um trabalho nao
      // consegue apagar de que sessao a escrita saiu (ADR-0027 item 8).
      metadata: { ...dados.metadata, surface: 'admin', session: autor.sessao },
    };
  }
}

export type { DecisaoDaModeracao };
