/** **150 conexões aceitas por pessoa.** É bairro, não plateia. */
export const TETO_DE_CONEXOES = 150;

/** **20 pedidos pendentes enviados ao mesmo tempo.** */
export const TETO_DE_PENDENTES_ENVIADOS = 20;

/** **10 pedidos novos por dia**, em janela **corrida** de 24 h. */
export const TETO_DE_PEDIDOS_POR_DIA = 10;

/** O pendente vale 30 dias. */
export const DIAS_DE_VALIDADE_DO_PEDIDO = 30;

/** Depois da recusa, 90 dias de descanso antes de poder pedir de novo. */
export const DIAS_DE_DESCANSO_APOS_RECUSA = 90;

/** As contagens da conta, já recortadas por conta habilitada e por validade. */
export interface ContagensDaConta {
  /** Conexões `accepted` em que a pessoa é qualquer um dos dois lados. */
  readonly conexoes: number;
  /** Pedidos `pending` **enviados** por ela e ainda dentro da validade. */
  readonly pendentesEnviados: number;
  /** Pedidos que ela criou nas últimas 24 h, qualquer que seja o estado hoje. */
  readonly pedidosNasUltimas24h: number;
}

/** Por que um pedido não pode ser criado. */
export type RecusaDeTeto =
  | 'connection_limit_reached'
  | 'addressee_connection_limit_reached'
  | 'pending_limit_reached'
  | 'daily_limit_reached';

/** A decisão de teto de um pedido novo, com as contagens dos **dois** lados. */
export function recusaDoPedido(
  quemPede: ContagensDaConta,
  quemRecebe: Pick<ContagensDaConta, 'conexoes'>,
): RecusaDeTeto | undefined {
  if (quemPede.conexoes >= TETO_DE_CONEXOES) return 'connection_limit_reached';
  if (quemRecebe.conexoes >= TETO_DE_CONEXOES) return 'addressee_connection_limit_reached';
  if (quemPede.pendentesEnviados >= TETO_DE_PENDENTES_ENVIADOS) return 'pending_limit_reached';
  if (quemPede.pedidosNasUltimas24h >= TETO_DE_PEDIDOS_POR_DIA) return 'daily_limit_reached';
  return undefined;
}

/** A decisão de teto de um **aceite**. */
export function recusaDoAceite(
  quemAceita: Pick<ContagensDaConta, 'conexoes'>,
  quemPediu: Pick<ContagensDaConta, 'conexoes'>,
): 'connection_limit_reached' | 'addressee_connection_limit_reached' | undefined {
  if (quemAceita.conexoes >= TETO_DE_CONEXOES) return 'connection_limit_reached';
  if (quemPediu.conexoes >= TETO_DE_CONEXOES) return 'addressee_connection_limit_reached';
  return undefined;
}

/** Quantos pedidos ainda cabem hoje. */
export function pedidosQueAindaCabemHoje(contagens: ContagensDaConta): number {
  return Math.max(0, TETO_DE_PEDIDOS_POR_DIA - contagens.pedidosNasUltimas24h);
}
