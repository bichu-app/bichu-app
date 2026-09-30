/**
 * O que `found` precisa da conversa mediada para atender o achador sem conta
 * (BICHUS-41), e nada além.
 *
 * A validade do token ("caso aberto mais 30 dias") depende do caso ligado à
 * CONVERSA, e a regra mora em `messaging`. Repeti-la aqui faria o mesmo token
 * valer numa operação e não na outra no dia em que uma das cópias mudasse. Por
 * isso `found` pergunta, e cada operação decide qual status cada resposta vira,
 * pelo que o próprio contrato declara.
 *
 * Quem liga esta porta ao serviço de `messaging` é `src/bin/api.ts`, como faz
 * com `conversaDoAviso` de `tags`.
 */

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
  /**
   * Entrega o recado na conversa, redigido, e devolve o texto como ficou.
   * Lança `conversation-closed` (410) quando a conversa não aceita mensagem.
   */
  entregarRecado(token: string, recado: string, origem: OrigemDoPedidoDoAchador): Promise<string>;
}
