import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { OrigemDoPedido } from '../domain/conexao.js';

export interface ConviteResolvido {
  /** A conta que vai receber o pedido. */
  readonly alvo: UserId;
  /** Qual dos cinco caminhos produziu este convite. */
  readonly origem: OrigemDoPedido;
  /** O apelido de quem emitiu, **que é o que a tela de destino precisa**. */
  readonly apelido: string;
}

export interface ResolvedorDeConvite {
  /**
   * `undefined` para token inexistente, **vencido**, **revogado**, de outra conta,
   * cujo dono não tem apelido, ou que aponte para quem bloqueou quem chama.
   */
  resolver(token: string, quemChama: UserId): Promise<ConviteResolvido | undefined>;
}

/** **Quem o apelido endereça, se essa pessoa existe para quem pergunta.** */
export interface ResolvedorDeApelido {
  resolver(apelido: string, quemPergunta: UserId): Promise<UserId | undefined>;
}

/** O convite recém-emitido. */
export interface ConviteEmitido {
  /** O token em claro, **a única vez em que ele existe**. */
  readonly token: string;
  /** Quando ele para de resolver. */
  readonly expiraEm: Instant;
}

/** **Quem emite o convite do próprio perfil** — o que alimenta o link e o QR. */
export interface EmissorDeConvite {
  /** Emite, revogando o convite ativo anterior da mesma conta. */
  emitir(dono: UserId, agora: Instant): Promise<ConviteEmitido>;
  /** Revoga o convite ativo, se houver. */
  revogar(dono: UserId, agora: Instant): Promise<void>;
}
