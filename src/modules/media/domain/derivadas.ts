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

/**
 * ## As derivadas da imagem do encontro da comunidade
 *
 * **SO `banner` CORTA, e ela e a CAPA** (cliente, 05/11/2026, verbatim: *"as
 * imagens do evento que subimos, a capa esta correta, fazendo o crop, mas deve
 * subir tambem a foto no formato original e quando clicar para expandir deve
 * mostrar a imagem inteira, hoje as fotos estao sendo cropadas, e a unica
 * cropada tem que ser a da capa"*).
 *
 * As tres derivadas saem do MESMO original, e quem consome cada uma e que
 * separa a capa das fotos -- nao o proposito, que e um so (`network_event`)
 * para toda a lista porque **a capa E a `position` 0** e nao existe campo de
 * capa:
 *
 * - `banner` 1280 x 720 e a CAPA, no topo do detalhe e no que o visualizador
 *   amplia na posicao 0 (`cover_banner_url`). `altura` presente = CORTA, e e
 *   isto que o cliente chamou de correto;
 * - `card` e `thumb` sao as FOTOS da galeria: **sem `altura`**, entao o
 *   servidor nao corta, so limita a largura (`fit: 'inside'`). Era
 *   `card 1024 x 576` e `thumb 480 x 360`, e esse par e que produzia a foto
 *   cortada que ele viu ao ampliar.
 *
 * A posicao 0 nao perde o enquadramento por `card` deixar de cortar: o painel
 * manda a capa JA recortada em 16:9, entao `card` da posicao 0 entra 16:9 e sai
 * 16:9, e `cover_image_url` (o cartao da agenda) continua 16:9 de fato.
 */
export const DERIVADAS_DO_ENCONTRO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, porte: 'enxuta' },
  { variante: 'thumb', largura: 480, porte: 'enxuta' },
];

/**
 * ## As derivadas da GALERIA DE FOTOS da entrada do diretorio
 *
 * **Separada de [DERIVADAS_DO_ENCONTRO] em 05/11/2026**, e a separacao e o
 * ponto: as duas eram a MESMA lista, entao tirar a altura da galeria do
 * encontro tiraria tambem a da galeria do diretorio -- que **nenhuma decisao do
 * cliente pediu**. O pedido de 05/11 fala do encontro.
 *
 * Os numeros aqui sao, deliberadamente, os que o encontro tinha ANTES daquele
 * pedido: a galeria do diretorio nao muda de comportamento nesta mudanca.
 */
export const DERIVADAS_DA_GALERIA_DO_DIRETORIO: readonly EspecificacaoDaDerivada[] = [
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

/**
 * ## As derivadas da FOTO DE CAPA do pet (cliente, 06/11/2026)
 *
 * Pedido literal: *"gostei muito da forma como ele apresenta o perfil do pet,
 * com a foto de capa, como fazemos na pagina de eventos e profissionais"*.
 *
 * **Separada de [DERIVADAS_DA_FOTO_DO_LOCAL] de proposito, embora os numeros
 * sejam hoje os mesmos.** A licao e de 05/11/2026, escrita dez linhas acima em
 * [DERIVADAS_DA_GALERIA_DO_DIRETORIO]: duas superficies que compartilham a
 * MESMA constante nao podem mudar separadamente, e tirar a altura de uma tira a
 * da outra sem ninguem pedir. A capa do pet e a foto do estabelecimento sao
 * duas decisoes de produto diferentes, e vao poder divergir sem arrastar a
 * outra.
 *
 * **`banner` 1280 x 720 e a CAPA**, de borda a borda no topo da ficha: e dela
 * que sai `Pet.cover_image_url`. `altura` presente = CORTA, que e o que a capa
 * precisa -- a faixa 16:9 e a geometria, nao uma sugestao.
 *
 * **`card` 1024 x 576 existe porque `processar-imagem-de-catalogo.ts` EXIGE
 * `card`** (ele lanca com "As derivadas de ... precisam declarar `card`"), e
 * nao porque alguma tela a desenhe. Ela e 16:9 como a `banner`, entao a capa
 * nunca sai deitada por acidente.
 *
 * **SEM `thumb`, e isto e medido e nao economia cega**: nenhuma lista de pets
 * desenha a capa. O cartao do pet em toda lista pinta o RETRATO, que vem de
 * `pet_photos.thumb_key` (176 x 194, proporcao 1 : 1,1) e nao daqui. Derivada
 * que ninguem baixa e byte pago sem leitor.
 */
export const DERIVADAS_DA_CAPA_DO_PET: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, altura: 576, porte: 'enxuta' },
];

/**
 * A dimensão mínima da foto de pet, que não existia.
 *
 * **Esta é a do RETRATO, e ela NÃO vale para a capa.** A capa do pet
 * ([DERIVADAS_DA_CAPA_DO_PET]) anda na esteira de catálogo, e lá o piso é
 * `LARGURA_MINIMA.pet_cover` com a altura DERIVADA da proporção — 1280 x 720,
 * decisão do cliente de 02/11/2026. O par quadrado abaixo só é coerente porque
 * `card` e `thumb` do retrato são 1 : 1,1 e 600 x 600 cabe nas duas; aplicá-lo
 * a um recorte 16:9 seria a regra impossível que travou o cliente em 02/11.
 */
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
