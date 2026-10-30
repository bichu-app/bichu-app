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

export interface ConversaDoAchadorParaAviso {
  acesso(token: string): Promise<AcessoDoAchador>;
  /** Entrega o recado na conversa, redigido, e devolve o texto como ficou. */
  entregarRecado(token: string, recado: string, origem: OrigemDoPedidoDoAchador): Promise<string>;
}
