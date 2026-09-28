/**
 * Rotulos de tela para os valores de lista fechada do contrato. A chave de
 * cada mapa e o valor do contrato; o tipo `Record<Enum, string>` faz o
 * compilador reprovar quando o contrato ganha ou perde um valor.
 *
 * Textos: docs/06-design-system.md 25.5.2 e docs/05-ux-research.md 29.10.
 */
import type {
  Estrutura,
  EstadoDoPedido,
  IdadeDosCaes,
  ItemParaLevar,
  OrdemDaLista,
  Porte,
  UnidadeDoValor,
} from './tipos.ts';

export const ITENS_PARA_LEVAR: Record<ItemParaLevar, string> = {
  water: 'Água',
  water_bowl: 'Pote de água',
  leash: 'Guia',
  poop_bags: 'Saquinhos para cocô',
  treats: 'Petisco',
  towel: 'Toalha',
  vaccination_card: 'Carteira de vacinação',
  toy: 'Brinquedo',
};

export const PORTES: Record<Porte, string> = {
  P: 'Pequeno',
  M: 'Médio',
  G: 'Grande',
  GG: 'Gigante',
};

export const IDADES: Record<IdadeDosCaes, string> = {
  any: 'Qualquer idade',
  from_4_months: 'A partir de 4 meses',
  from_1_year: 'A partir de 1 ano',
  up_to_1_year: 'Até 1 ano',
};

export const ESTRUTURAS: Record<Estrutura, string> = {
  level_ground_or_ramp: 'Piso plano ou rampa',
  accessible_restroom: 'Banheiro acessível',
  public_restroom_nearby: 'Banheiro público próximo',
  shade: 'Sombra',
  benches: 'Bancos',
  dog_water_fountain: 'Bebedouro para cães',
  parking_nearby: 'Estacionamento próximo',
};

export const UNIDADES: Record<UnidadeDoValor, string> = {
  per_dog: 'por cão',
  per_person: 'por pessoa',
  per_pair: 'por dupla',
};

export const ORDENS: Record<OrdemDaLista, string> = {
  agenda: 'Data do encontro, próximos primeiro',
  atualizado: 'Atualizados por último',
};

export const ABAS_DE_PEDIDOS: Record<EstadoDoPedido, string> = {
  pending: 'Pendentes',
  approved: 'Aprovados',
  declined: 'Recusados',
};

export const VAZIO_DE_PEDIDOS: Record<EstadoDoPedido, string> = {
  pending: 'Nenhum pedido pendente.',
  approved: 'Ninguém aprovado ainda.',
  declined: 'Nenhum pedido recusado.',
};

/** As 27 siglas, na ordem do prototipo. `place.state` e `^[A-Z]{2}$`. */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function chaves<K extends string>(mapa: Record<K, string>): K[] {
  return Object.keys(mapa) as K[];
}
