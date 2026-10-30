/** O vocabulario e as regras locais do diretorio de `Perto`, num lugar so. */
import type { Esquemas } from '../api/cliente.ts';

export type Entrada = Esquemas['AdminDirectoryEntry'];
export type TipoDaEntrada = Esquemas['ProfessionalKind'];
export type TipoDeEntidadeDaEntrada = Esquemas['EntityKind'];
export type StatusDaEntrada = Esquemas['DirectoryEntryStatus'];
export type FaltaParaPublicar = Esquemas['AdminDirectoryEntryMissingField'];

/** O rotulo de cada TIPO DE ENTIDADE. */
export const TIPOS_DE_ENTIDADE = {
  professional: 'Profissional ou estabelecimento',
  organization: 'ONG',
} as const satisfies Record<TipoDeEntidadeDaEntrada, string>;

/**
 * A ordem do seletor. `professional` primeiro porque e o padrao do contrato e o
 * caso comum; `organization` e a excecao que o operador escolhe de proposito.
 */
export const ORDEM_DOS_TIPOS_DE_ENTIDADE: readonly TipoDeEntidadeDaEntrada[] = [
  'professional',
  'organization',
];

/** O rotulo de cada atividade, no singular e como o operador fala. */
export const ATIVIDADES = {
  clinic: 'Clínica',
  hospital: 'Hospital',
  store: 'Loja',
  vet: 'Veterinário',
  groomer: 'Banho e tosa',
  walker: 'Dog Walker',
  sitter: 'Pet Sitter',
  boarding: 'Hospedagem',
  daycare: 'Creche',
  trainer: 'Adestrador',
} as const satisfies Record<TipoDaEntrada, string>;

/** A ordem do seletor, escrita por EXTENSO. */
export const ORDEM_DAS_ATIVIDADES: readonly TipoDaEntrada[] = [
  'clinic',
  'hospital',
  'store',
  'boarding',
  'daycare',
  'vet',
  'groomer',
  'walker',
  'sitter',
  'trainer',
];

export const SITUACOES = {
  draft: 'Rascunho',
  published: 'No ar',
  hidden: 'Retirada',
  removed: 'Removida',
} as const satisfies Record<StatusDaEntrada, string>;

/** AS SITUACOES QUE O CADASTRO OFERECE (cliente, 29/10/2026). */
export const SITUACOES_DO_CADASTRO: readonly StatusDaEntrada[] = ['published', 'draft'];

/** AS SITUACOES QUE A EDICAO OFERECE: as quatro, na ordem de sempre. */
export const SITUACOES_DA_EDICAO: readonly StatusDaEntrada[] = [
  'published',
  'draft',
  'hidden',
  'removed',
];

/** O selo da lista. `Selo` de `basicos.tsx` tem vocabulario proprio e fechado. */
export const SELO_DA_SITUACAO = {
  draft: 'rascunho',
  published: 'publicado',
  hidden: 'inativo',
  removed: 'retirado',
} as const satisfies Record<StatusDaEntrada, 'rascunho' | 'publicado' | 'inativo' | 'retirado'>;

/** O que falta, dito para o operador e nao para o programador. */
export const ROTULO_DA_FALTA = {
  slug: 'o identificador',
  city: 'a cidade',
  state: 'a UF',
  phone_e164: 'o telefone',
} as const satisfies Record<FaltaParaPublicar, string>;

/** A frase que diz o que falta para publicar. */
export function frasePendente(faltas: readonly FaltaParaPublicar[]): string | undefined {
  if (faltas.length === 0) return undefined;
  const nomes = faltas.map((falta) => ROTULO_DA_FALTA[falta]);
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(', ')} e ${String(nomes[nomes.length - 1])}`;
  return `Para esta entrada aparecer em Perto, falta ${String(lista)}.`;
}

/**
 * O formato de `professionals.slug`, copiado do `CHECK professionals_slug_formato`
 * da migracao `20260922000021`.
 */
export const PADRAO_DO_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export const MENSAGEM_DO_SLUG =
  'Use de 3 a 30 letras minúsculas, números ou hífen, sem hífen no começo nem no fim.';

/** O endereco sugerido a partir do nome: sem acento, minusculo, espaco vira hifen. */
export function slugSugerido(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

/**
 * A UF, duas letras. A mesma recusa que o servidor da, para a tela nao esperar a
 * rede.
 */
export const PADRAO_DA_UF = /^[A-Za-z]{2}$/;
