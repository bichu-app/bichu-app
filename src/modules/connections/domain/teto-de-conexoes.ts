/**
 * Os tetos da conexão, num lugar só, e a decisão que eles produzem.
 *
 * **Eles contam LINHAS, não requisições**, então nenhum deles é a porta de teto
 * do ADR-0016 — é a mesma limitação já registrada para o teto de 3 encontros
 * ativos da Rede: *"ele conta LINHAS, e a porta de teto conta requisições. Quem
 * o aplica é o caso de uso."*
 *
 * ## Por que os números aparecem duas vezes, e não são duas cópias
 *
 * 1. **Aqui**, puro, é quem produz a recusa que a pessoa LÊ — com o código que
 *    a tela traduz.
 * 2. **Na cláusula `WHERE`** do `INSERT` e do `UPDATE`
 *    (`kysely-connections-repository.ts`) é o único nível que vale sob
 *    concorrência: dois pedidos simultâneos passam pela conferência daqui, e só
 *    o `WHERE` barra o segundo.
 *
 * Dois níveis com alcances diferentes. A migração escreve a mesma frase, e é o
 * mesmo arranjo que `20261018000005` usa para a data de nascimento (o `CHECK`
 * pega o absurdo, o servidor pega o futuro).
 */

/**
 * **150 conexões aceitas por pessoa.** É bairro, não plateia.
 *
 * É o número que se **sobe** depois e **não se desce**: quem já passasse de 150
 * e visse o teto cair perderia conexão que já existe, e não há forma honesta de
 * escolher qual. Vale para os **dois lados** — aceitar também conta —, senão uma
 * conta lotada continuaria crescendo por aceite.
 */
export const TETO_DE_CONEXOES = 150;

/**
 * **20 pedidos pendentes enviados ao mesmo tempo.**
 *
 * O pendente é a única superfície de saída de quem pede. 20 não atrapalha uma
 * semana real de bairro e limita o alcance de quem espalha.
 */
export const TETO_DE_PENDENTES_ENVIADOS = 20;

/**
 * **10 pedidos novos por dia**, em janela **corrida** de 24 h.
 *
 * Corrida e não "até a meia-noite": com janela de calendário, 20 pedidos caberiam
 * em dois minutos na virada do dia. Com 20 pendentes, quem espalha esgota o
 * pendente em dois dias e **para** — o pendente é o freio, e o diário é a
 * desaceleração.
 */
export const TETO_DE_PEDIDOS_POR_DIA = 10;

/** O pendente vale 30 dias. Expiração preguiçosa: ver a migração. */
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

/**
 * Por que um pedido não pode ser criado. Cada valor é um `code` do contrato, e a
 * ordem desta união é a ordem de avaliação em `recusaDoPedido`.
 */
export type RecusaDeTeto =
  | 'connection_limit_reached'
  | 'addressee_connection_limit_reached'
  | 'pending_limit_reached'
  | 'daily_limit_reached';

/**
 * A decisão de teto de um pedido novo, com as contagens dos **dois** lados.
 *
 * `undefined` quer dizer "pode pedir". A ordem importa: o teto do próprio lado
 * vem antes do teto do outro, porque *"você já tem 150 conexões"* é acionável e
 * *"a outra pessoa está cheia"* não é — e porque anunciar o teto do outro
 * primeiro, quando os dois estão cheios, contaria sobre a outra conta algo que
 * não precisava ser contado.
 */
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

/**
 * A decisão de teto de um **aceite**.
 *
 * Aceitar cria a conexão, então ele é cobrado nos dois lados — e **só aqui**,
 * nunca retroativamente sobre linha que já existe: o contrário apagaria conexão
 * por causa de um número (ver a migração, "a consequência que ninguém gosta").
 */
export function recusaDoAceite(
  quemAceita: Pick<ContagensDaConta, 'conexoes'>,
  quemPediu: Pick<ContagensDaConta, 'conexoes'>,
): 'connection_limit_reached' | 'addressee_connection_limit_reached' | undefined {
  if (quemAceita.conexoes >= TETO_DE_CONEXOES) return 'connection_limit_reached';
  if (quemPediu.conexoes >= TETO_DE_CONEXOES) return 'addressee_connection_limit_reached';
  return undefined;
}

/** Quantos pedidos ainda cabem hoje. Nunca negativo. */
export function pedidosQueAindaCabemHoje(contagens: ContagensDaConta): number {
  return Math.max(0, TETO_DE_PEDIDOS_POR_DIA - contagens.pedidosNasUltimas24h);
}
