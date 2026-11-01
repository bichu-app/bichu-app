/** 5 MB (5 MiB, 5 242 880 bytes). */
export const TETO_DE_BYTES_DO_ENVIO = 5 * 1024 * 1024;

/** O texto de orientação da tela. */
export const ORIENTACAO_DE_TAMANHO_DA_IMAGEM = 'Envie uma imagem de até 5 MB.';

/** O formato de saída das derivadas, num lugar só. */
export interface FormatoDaDerivada {
  readonly nome: 'jpeg' | 'webp';
  readonly contentType: 'image/jpeg' | 'image/webp';
  readonly extensao: 'jpeg' | 'webp';
  /**
   * O formato não guarda canal alfa, então a transparência precisa virar uma cor
   * antes de codificar.
   */
  readonly achataAlfa: boolean;
}

/** JPEG com extensão `.jpeg`, por decisão do cliente. */
export const FORMATO_DAS_DERIVADAS: FormatoDaDerivada = {
  nome: 'jpeg',
  contentType: 'image/jpeg',
  extensao: 'jpeg',
  achataAlfa: true,
};

/** O teto de 500 KB. Vale para TODA derivada que o app baixa. */
export const TETO_DE_BYTES_DA_DERIVADA = 500 * 1024;

/** O piso de 300 KB. Alvo da imagem grande, e NÃO exigência da miniatura. */
export const PISO_DE_BYTES_DA_DERIVADA_GRANDE = 300 * 1024;

/** A ESCADA DE QUALIDADE da imagem grande: 92 no topo, 40 no fim. */
export const ESCADA_DA_FAIXA: readonly number[] = [92, 86, 82, 74, 66, 58, 48, 40];

/** A ESCADA da miniatura: começa em 82 e não tenta subir. */
export const ESCADA_ENXUTA: readonly number[] = [82, 74, 66, 58, 48, 40];

/** Uma derivada: a variante da chave, a geometria do uso e qual escada usar. */
export interface EspecificacaoDaDerivada {
  readonly variante: 'thumb' | 'card' | 'banner';
  readonly largura: number;
  readonly altura?: number;
  /** `grande` usa [ESCADA_DA_FAIXA] e mira a faixa; `enxuta` usa [ESCADA_ENXUTA]. */
  readonly porte: 'grande' | 'enxuta';
}

/** ## As derivadas da foto de pet */
export const DERIVADAS_DA_FOTO_DE_PET: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, altura: 1126, porte: 'grande' },
  { variante: 'thumb', largura: 176, altura: 194, porte: 'enxuta' },
];

/** ## As derivadas da imagem do encontro da comunidade */
export const DERIVADAS_DO_ENCONTRO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, altura: 576, porte: 'enxuta' },
  { variante: 'thumb', largura: 480, altura: 360, porte: 'enxuta' },
];

/** ## A derivada da imagem de produto da Loja */
export const DERIVADAS_DO_PRODUTO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, porte: 'enxuta' },
];

/** ## A derivada da LOGO do profissional recomendado (cliente, 18/10/2026) */
export const DERIVADAS_DA_LOGO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 512, altura: 512, porte: 'enxuta' },
  { variante: 'thumb', largura: 176, altura: 176, porte: 'enxuta' },
];

/** ## As derivadas da FOTO do lugar do profissional (cliente, 18/10/2026) */
export const DERIVADAS_DA_FOTO_DO_LOCAL: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, altura: 576, porte: 'enxuta' },
];

/** ## As derivadas da FOTO DO PRÓPRIO USUÁRIO (cliente, 18/10/2026) */
export const DERIVADAS_DA_FOTO_DE_USUARIO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 512, altura: 512, porte: 'enxuta' },
  { variante: 'thumb', largura: 176, altura: 176, porte: 'enxuta' },
];

/** ## As derivadas da VITRINE DE FOTOS DO USUÁRIO — e por que 320 px existe */
export const DERIVADAS_DA_VITRINE_DO_USUARIO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, altura: 1024, porte: 'grande' },
  { variante: 'thumb', largura: 320, altura: 320, porte: 'enxuta' },
];

/** ## A derivada da FOTO DE UMA PUBLICAÇÃO DO MURAL (cliente, 20/10/2026) */
export const DERIVADAS_DA_PUBLICACAO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, altura: 1024, porte: 'grande' },
];

/** A dimensão mínima da foto de pet, que não existia. */
export const DIMENSAO_MINIMA_DA_FOTO_DE_PET = { largura: 600, altura: 600 } as const;

/** ## A derivada da foto do ACHADO — privada, e uma só */
export const DERIVADA_DA_FOTO_DO_ACHADO: EspecificacaoDaDerivada = {
  variante: 'card',
  largura: 1024,
  altura: 1126,
  porte: 'grande',
};

/** A escada que o porte pede. */
export function escadaDo(porte: EspecificacaoDaDerivada['porte']): readonly number[] {
  return porte === 'grande' ? ESCADA_DA_FAIXA : ESCADA_ENXUTA;
}
