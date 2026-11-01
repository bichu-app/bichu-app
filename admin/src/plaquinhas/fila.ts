import type { Esquemas } from '../api/cliente.ts';
import type { TipoDeSelo } from '../componentes/basicos.tsx';
import { cepDosOitoDigitos } from '../formato/cep.ts';
import { telefoneDoE164 } from '../formato/telefone.ts';

export type Pedido = Esquemas['AdminCollarTagRequest'];
export type DecisaoDoPedido = Esquemas['AdminCollarTagRequestStatus'];
export type PassoDaEntrega = Esquemas['CollarTagDeliveryState'];
/** O passo que a rota aceita como alvo: `requested` e so inicial. */
export type PassoAlcancavel = Exclude<PassoDaEntrega, 'requested'>;

/** As abas, na ordem em que o operador trabalha. */
export const ABAS: readonly DecisaoDoPedido[] = ['pending', 'fulfilled', 'declined'];

export const ROTULO_DA_ABA = {
  pending: 'Na fila',
  fulfilled: 'Atendidos',
  declined: 'Recusados',
} as const satisfies Record<DecisaoDoPedido, string>;

export const VAZIO_DA_ABA = {
  pending: 'Nenhum pedido de plaquinha esperando.',
  fulfilled: 'Nenhum pedido atendido ainda.',
  declined: 'Nenhum pedido recusado.',
} as const satisfies Record<DecisaoDoPedido, string>;

/** Os passos, nas palavras do cliente. */
export const ROTULO_DO_PASSO = {
  requested: 'Solicitado',
  in_transit: 'Em transporte',
  arrived: 'Chegou',
} as const satisfies Record<PassoDaEntrega, string>;

/** O selo da linha: o passo da entrega, ou a recusa, que vence o passo. */
export const SELO_DO_PASSO = {
  requested: 'rascunho',
  in_transit: 'ativo',
  arrived: 'publicado',
} as const satisfies Record<PassoDaEntrega, TipoDeSelo>;

/** O teto do codigo de rastreio: o MESMO numero do `CHECK` do banco. */
export const LIMITE_DO_RASTREIO = 64;
/** O piso. Tres simbolos nao e formato de transportadora: e "nao e vazio". */
export const MINIMO_DO_RASTREIO = 3;

export const AJUDA_DO_RASTREIO =
  'Opcional: nem todo envio tem rastreio. Cole o código como a transportadora o escreve — ' +
  'nenhum formato é exigido.';

/** A proxima acao da linha, e e ela que decide qual botao aparece. */
export type ProximaAcao = 'atender' | 'despachar' | 'confirmar' | undefined;

export function proximaAcao(pedido: Pedido): ProximaAcao {
  if (pedido.status === 'pending') return 'atender';
  if (pedido.status === 'declined') return undefined;
  if (pedido.delivery_state === 'requested') return 'despachar';
  if (pedido.delivery_state === 'in_transit') return 'confirmar';
  return undefined;
}

/** O passo que cada acao de entrega alcanca. */
export const PASSO_DA_ACAO = {
  despachar: 'in_transit',
  confirmar: 'arrived',
} as const satisfies Record<'despachar' | 'confirmar', PassoAlcancavel>;

export const ROTULO_DA_ACAO = {
  atender: 'Atender',
  despachar: 'Marcar em transporte',
  confirmar: 'Marcar que chegou',
} as const satisfies Record<'atender' | 'despachar' | 'confirmar', string>;

/** O rastreio pode ser corrigido nesta linha? */
export function podeCorrigirRastreio(pedido: Pedido): boolean {
  return pedido.status === 'fulfilled' && pedido.delivery_state !== 'requested';
}

/** O que esta errado no codigo de rastreio digitado, ou `undefined`. */
export function erroDoRastreio(valor: string): string | undefined {
  const limpo = valor.trim();
  if (limpo === '') return undefined;
  if (limpo.length < MINIMO_DO_RASTREIO) {
    return `O código de rastreio tem pelo menos ${MINIMO_DO_RASTREIO} caracteres.`;
  }
  if (limpo.length > LIMITE_DO_RASTREIO) {
    return `O código de rastreio tem no máximo ${LIMITE_DO_RASTREIO} caracteres.`;
  }
  return undefined;
}

/** O que vai no corpo da atualizacao de entrega. */
export function corpoDaEntrega(
  pedido: Pedido,
  passo: PassoAlcancavel,
  rastreioDigitado: string,
): { delivery_state: PassoAlcancavel; tracking_code?: string | null } {
  const limpo = rastreioDigitado.trim();
  if (limpo !== '') return { delivery_state: passo, tracking_code: limpo };
  if (pedido.tracking_code === null || pedido.tracking_code === undefined) {
    return { delivery_state: passo };
  }
  return { delivery_state: passo, tracking_code: null };
}

/** O endereco de entrega em linhas, MASCARADO para leitura. */
export function enderecoEmLinhas(pedido: Pedido): readonly string[] {
  const e = pedido.delivery_address;
  const rua = e.complement
    ? `${e.street}, ${e.street_number} — ${e.complement}`
    : `${e.street}, ${e.street_number}`;
  return [
    e.recipient_name,
    telefoneDoE164(e.recipient_phone),
    rua,
    `${e.neighborhood} · ${e.city} · ${e.state}`,
    `CEP ${cepDosOitoDigitos(e.postal_code)}`,
  ];
}

/** A espécie e o nome do pet numa linha, como a lista de pedidos escreve. */
export function petDo(pedido: Pedido): string {
  return `${pedido.pet.display_name} · ${pedido.pet.species}`;
}
