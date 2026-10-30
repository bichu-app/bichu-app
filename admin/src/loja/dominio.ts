import { CENTAVOS_MAXIMO, CENTAVOS_MINIMO, centavosDosDigitos, reaisDeCentavos } from '../formato/dinheiro.ts';
import type { Esquemas } from '../api/cliente.ts';

/** O vocabulario dos dois niveis, como `GET /v1/store/taxonomy` o entrega. */
export type Taxonomia = Esquemas['StoreTaxonomy'];
export type CategoriaDoVocabulario = Esquemas['StoreTaxonomyCategory'];

/** A categoria do vocabulario com este codigo, ou `undefined`. */
export function categoriaDoVocabulario(
  taxonomia: Taxonomia | undefined,
  codigo: string,
): CategoriaDoVocabulario | undefined {
  return taxonomia?.categories.find((c) => c.code === codigo);
}

/** As subcategorias da categoria escolhida, **e so dela**. */
export function subcategoriasDaCategoria(
  taxonomia: Taxonomia | undefined,
  categoria: string,
): readonly Esquemas['StoreTaxonomySubcategory'][] {
  if (categoria === '') return [];
  return categoriaDoVocabulario(taxonomia, categoria)?.subcategories ?? [];
}

export const ESPECIES = {
  dog: 'Cão',
  cat: 'Gato',
  other: 'Outros animais',
} as const satisfies Record<Esquemas['Species'], string>;

export type Categoria = Esquemas['StoreCategory'];
export type Subcategoria = Esquemas['StoreSubcategory'];
export type Especie = Esquemas['Species'];

export const MAXIMO_DE_TAGS = 5;
export const MAXIMO_DE_TAGS_ATIVAS = 40;

/** O valor escolhido no select e uma categoria do vocabulario CARREGADO. */
export function eCategoria(taxonomia: Taxonomia | undefined, v: string): v is Categoria {
  return v !== '' && categoriaDoVocabulario(taxonomia, v) !== undefined;
}

/** O valor escolhido e subcategoria ATIVA da categoria escolhida. */
export function eSubcategoriaDaCategoria(
  taxonomia: Taxonomia | undefined,
  categoria: string,
  v: string,
): v is Subcategoria {
  return v !== '' && subcategoriasDaCategoria(taxonomia, categoria).some((s) => s.code === v);
}
export function eEspecie(v: string): v is Especie {
  return Object.hasOwn(ESPECIES, v);
}

/** Centavos, inteiro (`AdminPriceInput.amount`): de 1 a 100.000.000. */
export const PRECO_MINIMO = CENTAVOS_MINIMO;
export const PRECO_MAXIMO = CENTAVOS_MAXIMO;

/**
 * "89,90" -> 8990. Aceita o jeito brasileiro de escrever (virgula decimal, ponto
 * de milhar opcional) e "R$".
 */
export function precoEmCentavos(texto: string): number | undefined {
  let t = texto.replace(/R\$/i, '').replace(/\s/g, '');
  if (t === '') return undefined;
  if (/^\d+\.\d{1,2}$/.test(t)) t = t.replace('.', ',');
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return undefined;
  const [inteiros = '', decimais = ''] = t.replace(/\./g, '').split(',');
  return centavosDosDigitos(inteiros, decimais) ?? undefined;
}

/** 18990 -> "189,90", o que vai de volta no campo. */
export function centavosParaCampo(centavos: number): string {
  return reaisDeCentavos(centavos);
}

/** 18990 -> "R$ 189,90", como a tabela mostra. */
export function centavosParaTexto(centavos: number): string {
  return `R$ ${reaisDeCentavos(centavos)}`;
}

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

/**
 * Hoje como data civil `AAAA-MM-DD`, no horario de Brasilia (onde a pessoa leu o
 * preco).
 */
export function hojeCivil(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return partes;
}

/**
 * O `slug` que o servidor deriva do rotulo (AdminStoreTagInput): sem acento,
 * minusculo, espaco vira hifen.
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

/** O mesmo, cortado ao formato de `Slug` (3 a 30). */
export function slugSugerido(nome: string): string {
  return slugDoRotulo(nome).slice(0, 30).replace(/-+$/, '');
}

export const PADRAO_DO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const PADRAO_DO_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/**
 * O alfabeto do rotulo de tag, igual ao do servidor (`conferirRotulo` em
 * `escrita-da-vitrine.ts`): letra (com acento e cedilha, em NFC ou NFD, por isso
 * `\p{M}`), digito, espaco, e a pontuacao de nome de marca -- `&`, hifen,
 * apostrofo reto ou curvo, e `+`.
 */
export const PADRAO_DO_ROTULO_DE_TAG = /^[\p{L}\p{M}\p{N} &'\u2019+-]+$/u;

/**
 * Caractere invisivel ou de controle -- controle, marca de direcao bidirecional,
 * espaco de largura zero, BOM.
 */
export const PADRAO_INVISIVEL =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;
