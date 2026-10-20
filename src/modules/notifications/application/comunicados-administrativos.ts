/**
 * O COMUNICADO, do lado da aplicacao -- as tres operacoes do painel.
 *
 * ## A TRAVA, e o que ficou de fora dela
 *
 * O comunicado e o unico aviso do produto com alcance total, e por isso ele tem
 * a trava mais apertada que este produto SABE aplicar:
 *
 *   - **papel de administrador fechado**: `x-admin-roles: [admin]` no contrato,
 *     conferido por `escoparRotasAdministrativas` ANTES de qualquer gancho
 *     daqui, junto com cookie de sessao, `Origin` e `X-CSRF-Token`;
 *   - **trilha obrigatoria por construcao**: o disparo passa por
 *     `EscritaAuditada.executar`, cuja assinatura **nao admite escrita sem
 *     evento** -- `ResultadoAuditado<T>` exige `evento`, e um disparo sem
 *     trilha nao compila. Falha da trilha desfaz o disparo (D49);
 *   - **teto de tres por dia**, aplicado no banco e na mesma transacao;
 *   - **sem apagar**: nao existe `DELETE` no contrato nem metodo aqui.
 *
 * **E ficou SEM confirmacao de senha.** O esquema `adminReauth` existe no
 * contrato e ZERO operacoes o declaram: a emenda do item 23 do ADR-0027
 * (07/10/2026) diz que "as escritas do painel deixam de pedir senha
 * (reautenticacao), por decisao do cliente, com o risco de sessao sequestrada
 * aceito; a rota de reautenticacao fica obsoleta, sem remover". Pedir senha
 * **aqui** contrariaria ADR em vigor, e por isso o comunicado sai com a mesma
 * trava das outras escritas do painel e nao com uma mais forte.
 *
 * Megafone sem trilha e o que vira incidente. A trilha existe; a senha e que
 * nao.
 *
 * ## A janela de disparo nao e um disparo com sinalizador
 *
 * `janelaDeDisparo` e `disparar` sao dois metodos e dois caminhos de codigo. Um
 * caminho de escrita que aceita "nao escreva de verdade" e um caminho de escrita
 * que um dia escreve por engano, e aqui o engano alcanca todas as caixas de uma
 * vez. A janela tambem nao recebe o rascunho: o servidor nao precisa do texto
 * para contar quantas caixas existem.
 */
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
   * O que o servidor contribui para a pre-visualizacao: alcance, quantos cabem
   * hoje e o teto. **Nao grava nada e nao alcanca caixa nenhuma.**
   */
  async janelaDeDisparo(): Promise<JanelaDeDisparo> {
    return this.deps.repositorio.janelaDeDisparo();
  }

  /**
   * Dispara o comunicado. Irreversivel.
   *
   * A trilha carrega `title`, `recipients_total` e o `ref`. **O CORPO NAO
   * ENTRA**: ele e texto livre de pessoa, a trilha sobrevive a exclusao da
   * conta de proposito, e o corpo ja vive em `notification_broadcasts`, que nao
   * tem caminho de exclusao. A trilha responde quem e quando; a tabela responde
   * o que.
   *
   * `resourceId` e o `id` INTERNO e nunca o `ref` (ADR-0027 item 8).
   */
  async disparar(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    rascunho: RascunhoDeComunicado,
  ): Promise<Comunicado> {
    return this.deps.escrita.executar(async (trx) => {
      const gravado = await this.deps.repositorio.disparar(trx, ator.adminAccountId, rascunho);
      // `undefined` = teto diario atingido. Lancar aqui DESFAZ a transacao, e e
      // isso que garante que nada foi gravado: a excecao sobe por dentro de
      // `EscritaAuditada.executar`, que nao confirma.
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
