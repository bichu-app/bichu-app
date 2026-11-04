import type { FoundReportId } from '../../../shared/types/brands.js';
import type {
  ConsentimentoDeContatoGravado,
  PedidoDeDivulgacaoDeContato,
} from '../domain/consentimento-de-contato.js';

export type AcessoDoAchador =
  /** Token malformado, desconhecido ou que não confere. */
  | { readonly situacao: 'recusado' }
  /** O token existiu e passou da validade. */
  | { readonly situacao: 'vencido' }
  | { readonly situacao: 'valido'; readonly aceitaMensagem: boolean };

export interface OrigemDoPedidoDoAchador {
  readonly correlationId?: string | undefined;
  readonly ip?: string | undefined;
}

/** O pedido de divulgação, com o aviso que identifica QUEM consentiu. */
export interface DivulgacaoPedida extends PedidoDeDivulgacaoDeContato {
  readonly foundReportId: FoundReportId;
}

export interface ConversaDoAchadorParaAviso {
  acesso(token: string): Promise<AcessoDoAchador>;
  /** Entrega o recado na conversa, redigido, e devolve o texto como ficou. */
  entregarRecado(token: string, recado: string, origem: OrigemDoPedidoDoAchador): Promise<string>;
  /**
   * Grava o consentimento **e** entrega o contato na conversa do tutor, numa
   * transação só, e devolve a prova gravada.
   *
   * São a MESMA chamada de propósito: não existe forma de entregar o contato sem
   * gravar o consentimento, nem de gravar o consentimento e a entrega falhar pela
   * metade. Se existisse, a metade perigosa seria justamente a entrega sem o
   * registro — um vazamento sem prova de que foi autorizado.
   */
  divulgarContatoComConsentimento(
    token: string,
    pedido: DivulgacaoPedida,
    origem: OrigemDoPedidoDoAchador,
  ): Promise<ConsentimentoDeContatoGravado>;
}
