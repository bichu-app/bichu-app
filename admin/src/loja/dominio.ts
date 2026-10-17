import { CENTAVOS_MAXIMO, CENTAVOS_MINIMO, centavosDosDigitos, reaisDeCentavos } from '../formato/dinheiro.ts';
import type { Esquemas } from '../api/cliente.ts';

/**
 * Codigo do contrato -> rotulo da tela. Os rotulos sao os que o app ja mostra
 * (UX 29.10; `correspondencias` de api/rastreabilidade-backoffice-rede.yaml,
 * que declara `app/lib/api/modelos_loja.dart` como a FONTE do rotulo e esta
 * matriz como o registro 1 para 1 -- este mapa e a copia que o painel usa, e
 * mudar o rotulo e mudar os tres juntos).
 * `satisfies Record<...>` faz o compilador reprovar se o contrato ganhar ou
 * perder um valor sem o rotulo acompanhar.
 *
 * **`toy` e `accessory` no PLURAL desde 17/10/2026** (pedido do cliente). Só o
 * rótulo: os códigos do contrato continuam `toy` e `accessory`, porque trocar
 * o código quebraria o APK que já está instalado -- valor desconhecido num
 * enum estoura a tela e não há como atualizar o app à força.
 */
export const CATEGORIAS = {
  food: 'Alimentação',
  toy: 'Brinquedos',
  hygiene: 'Higiene',
  accessory: 'Acessórios',
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

/**
 * Centavos, inteiro (`AdminPriceInput.amount`): de 1 a 100.000.000.
 *
 * A faixa e a mesma da Rede, e mora em `formato/dinheiro.ts`. Estes dois nomes
 * continuam exportados porque a Loja ja os importa.
 */
export const PRECO_MINIMO = CENTAVOS_MINIMO;
export const PRECO_MAXIMO = CENTAVOS_MAXIMO;

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
  // A gramatica aceita acima continua sendo desta funcao; a ARITMETICA e de
  // `formato/dinheiro.ts`, para nao existirem duas contas de centavos no
  // painel. A faixa e a mesma, entao `null` de la e `undefined` aqui.
  return centavosDosDigitos(inteiros, decimais) ?? undefined;
}

/**
 * 18990 -> "189,90", o que vai de volta no campo.
 *
 * Com ponto de milhar, porque e o mesmo texto que a mascara do campo produz:
 * 100000000 -> "1.000.000,00". Antes esta funcao nao punha o ponto e o campo
 * abria com `1000000,00` ate a primeira tecla.
 */
export function centavosParaCampo(centavos: number): string {
  return reaisDeCentavos(centavos);
}

/** 18990 -> "R$ 189,90", como a tabela mostra. */
export function centavosParaTexto(centavos: number): string {
  return `R$ ${reaisDeCentavos(centavos)}`;
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
/**
 * O alfabeto do rotulo de tag, igual ao do servidor
 * (`conferirRotulo` em `escrita-da-vitrine.ts`): letra (com acento e cedilha,
 * em NFC ou NFD, por isso `\p{M}`), digito, espaco, e a pontuacao de nome de
 * marca -- `&`, hifen, apostrofo reto ou curvo, e `+`. `N&D`, `Hill's` e
 * `Farmina N&D Ocean` passam.
 *
 * `.` e `/` ficam de fora nos dois lados: com eles, `bit.ly/x` seria um rotulo
 * valido num texto que a Loja publica. A autoridade continua sendo o servidor;
 * isto aqui e conveniencia de UX.
 */
export const PADRAO_DO_ROTULO_DE_TAG = /^[\p{L}\p{M}\p{N} &'\u2019+-]+$/u;

/**
 * Caractere invisivel ou de controle -- controle, marca de direcao
 * bidirecional, espaco de largura zero, BOM. Recusado em separado, e com
 * mensagem propria: nao e "caractere especial", e o que permite um nome que
 * parece uma coisa e e outra.
 */
export const PADRAO_INVISIVEL =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;
