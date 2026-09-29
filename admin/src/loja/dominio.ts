import type { Esquemas } from '../api/cliente.ts';

/**
 * Codigo do contrato -> rotulo da tela. Os rotulos sao os que o app ja mostra
 * (UX 29.10; `correspondencias` de api/rastreabilidade-backoffice-rede.yaml).
 * `satisfies Record<...>` faz o compilador reprovar se o contrato ganhar ou
 * perder um valor sem o rotulo acompanhar.
 */
export const CATEGORIAS = {
  food: 'Alimentação',
  toy: 'Brinquedo',
  hygiene: 'Higiene',
  accessory: 'Acessório',
  health: 'Saúde',
  bed: 'Cama e conforto',
} as const satisfies Record<Esquemas['StoreCategory'], string>;

export const ESPECIES = {
  dog: 'Cão',
  cat: 'Gato',
  other: 'Outros animais',
} as const satisfies Record<Esquemas['Species'], string>;

export type Categoria = Esquemas['StoreCategory'];
export type Especie = Esquemas['Species'];

export const MAXIMO_DE_TAGS = 5;
export const MAXIMO_DE_TAGS_ATIVAS = 40;

export function eCategoria(v: string): v is Categoria {
  return Object.hasOwn(CATEGORIAS, v);
}
export function eEspecie(v: string): v is Especie {
  return Object.hasOwn(ESPECIES, v);
}

// ---------------------------------------------------------------- preco

/** Centavos, inteiro (`AdminPriceInput.amount`): de 1 a 100.000.000. */
export const PRECO_MINIMO = 1;
export const PRECO_MAXIMO = 100_000_000;

/**
 * "89,90" -> 8990. Aceita o jeito brasileiro de escrever (virgula decimal,
 * ponto de milhar opcional) e "R$". Ponto seguido de 1 ou 2 digitos no fim e
 * lido como decimal ("89.90"); ponto seguido de 3 digitos e milhar ("1.234").
 * Nunca passa por ponto flutuante: a conta e feita nos digitos.
 * Devolve `undefined` para o que nao e preco.
 */
export function precoEmCentavos(texto: string): number | undefined {
  let t = texto.replace(/R\$/i, '').replace(/\s/g, '');
  if (t === '') return undefined;
  if (/^\d+\.\d{1,2}$/.test(t)) t = t.replace('.', ',');
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return undefined;
  const [inteiros = '', decimais = ''] = t.replace(/\./g, '').split(',');
  const centavos = Number.parseInt(inteiros, 10) * 100 + Number.parseInt(decimais.padEnd(2, '0') || '0', 10);
  if (!Number.isSafeInteger(centavos) || centavos < PRECO_MINIMO || centavos > PRECO_MAXIMO) return undefined;
  return centavos;
}

/** 18990 -> "189,90", o que vai de volta no campo. */
export function centavosParaCampo(centavos: number): string {
  const inteiros = Math.trunc(centavos / 100);
  const resto = String(centavos % 100).padStart(2, '0');
  return `${inteiros},${resto}`;
}

/** 18990 -> "R$ 189,90", como a tabela mostra. */
export function centavosParaTexto(centavos: number): string {
  const inteiros = Math.trunc(centavos / 100).toLocaleString('pt-BR');
  return `R$ ${inteiros},${String(centavos % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- datas

/** "2026-09-15" -> "15/09/2026", sem passar por fuso (a data do contrato e civil). */
export function dataCivilParaTexto(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** Instante do contrato -> "18/09/2026" no horario de Brasilia. */
export function instanteParaTexto(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Hoje como data civil `AAAA-MM-DD`, no horario de Brasilia (onde a pessoa leu o preco). */
export function hojeCivil(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return partes;
}

// ---------------------------------------------------------------- tags

/**
 * O `slug` que o servidor deriva do rotulo (AdminStoreTagInput): sem acento,
 * minusculo, espaco vira hifen. So para avisar cedo de colisao; quem decide e o
 * servidor (`409 slug-taken`).
 */
export function slugDoRotulo(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** O mesmo, cortado ao formato de `Slug` (3 a 30). Usado para sugerir o identificador do parceiro. */
export function slugSugerido(nome: string): string {
  return slugDoRotulo(nome).slice(0, 30).replace(/-+$/, '');
}

export const PADRAO_DO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const PADRAO_DO_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
export const PADRAO_DO_ROTULO_DE_TAG = /^[\p{L}\p{N} -]+$/u;
