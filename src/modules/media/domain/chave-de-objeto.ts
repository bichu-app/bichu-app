/** As chaves de objeto, e por que as duas classes têm formas diferentes. */
import type { ObjectKey } from '../../../shared/types/brands.js';
import { TETO_DE_BYTES_DO_ENVIO } from './derivadas.js';

/** Os únicos tipos aceitos. */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

export function ehTipoAceito(tipo: string): tipo is TipoAceito {
  return (TIPOS_ACEITOS as readonly string[]).includes(tipo);
}

/** O teto do envio, reexportado do PONTO ÚNICO (`derivadas.ts`). */
export const TETO_DE_BYTES = TETO_DE_BYTES_DO_ENVIO;

/** O que uma DERIVADA pode ser, e por que a lista não é a da entrada. */
export const EXTENSOES_DE_DERIVADA = ['webp', 'jpg', 'jpeg'] as const;

export type ExtensaoDeDerivada = (typeof EXTENSOES_DE_DERIVADA)[number];

export function ehExtensaoDeDerivada(extensao: string): extensao is ExtensaoDeDerivada {
  return (EXTENSOES_DE_DERIVADA as readonly string[]).includes(extensao);
}

export const TIPOS_DE_DERIVADA = ['image/webp', 'image/jpeg'] as const;

export type TipoDeDerivada = (typeof TIPOS_DE_DERIVADA)[number];

/** Por IGUALDADE, nunca por prefixo — o mesmo desenho do critério 22 na entrada. */
export function ehTipoDeDerivada(tipo: string): tipo is TipoDeDerivada {
  return (TIPOS_DE_DERIVADA as readonly string[]).includes(tipo);
}

/** O teto de tamanho da chave, que é o do armazenamento e não uma escolha nossa. */
const LIMITE_DA_CHAVE = 1024;

/**
 * As CATEGORIAS do armazenamento (ADR-0007 Emenda 1): o primeiro segmento de toda
 * chave nova, nos dois buckets.
 */
export const CATEGORIAS_DE_CATALOGO = ['products', 'events', 'directory', 'people'] as const;
export type CategoriaDeCatalogo = (typeof CATEGORIAS_DE_CATALOGO)[number];
/** As categorias que tem derivada PUBLICA. */
export const CATEGORIAS_PUBLICAS = ['pets', ...CATEGORIAS_DE_CATALOGO] as const;
export type CategoriaPublica = (typeof CATEGORIAS_PUBLICAS)[number];

function ehCategoriaDeCatalogo(valor: string | undefined): valor is CategoriaDeCatalogo {
  return (CATEGORIAS_DE_CATALOGO as readonly (string | undefined)[]).includes(valor);
}
function ehCategoriaPublica(valor: string | undefined): valor is CategoriaPublica {
  return (CATEGORIAS_PUBLICAS as readonly (string | undefined)[]).includes(valor);
}
/** As VARIANTES da derivada pública, e por que são três e não duas. */
export const VARIANTES_DE_DERIVADA = ['thumb', 'card', 'banner'] as const;
export type VarianteDeDerivada = (typeof VARIANTES_DE_DERIVADA)[number];

export function ehVarianteDeDerivada(valor: string | undefined): valor is VarianteDeDerivada {
  return (VARIANTES_DE_DERIVADA as readonly (string | undefined)[]).includes(valor);
}

function ehNomeDeDerivada(nome: string): boolean {
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 && ponto < nome.length - 1;
}

/**
 * O conjunto de caracteres: os de base64url, mais a barra que separa segmentos e o
 * ponto da extensão.
 */
const CARACTERES_DA_CHAVE = /^[A-Za-z0-9._/-]+$/;

function recusarChave(valor: string, motivo: string): never {
  throw new Error(`Chave de objeto recusada (${motivo}): ${JSON.stringify(valor)}.`);
}

/** O ÚNICO caminho para a marca `ObjectKey`, e por que ela precisava de um. */
export function comoObjectKey(valor: string): ObjectKey {
  if (valor.length === 0 || valor.length > LIMITE_DA_CHAVE) {
    recusarChave(valor, 'tamanho');
  }
  if (!CARACTERES_DA_CHAVE.test(valor)) {
    recusarChave(valor, 'caractere fora do conjunto da chave');
  }

  const segmentos = valor.split('/');
  if (segmentos.some((s) => s === '' || s === '.' || s === '..')) {
    recusarChave(valor, 'segmento que atravessa o caminho');
  }

  if (segmentos.length === 4 && segmentos[0] === 'pets' && segmentos[2] === 'original') {
    return valor as ObjectKey;
  }

  if (segmentos.length === 4 && segmentos[0] === 'found-reports' && segmentos[2] === 'original') {
    return valor as ObjectKey;
  }

  if (segmentos.length === 3 && ehCategoriaDeCatalogo(segmentos[0]) && segmentos[1] === 'original') {
    return valor as ObjectKey;
  }

  if (
    segmentos.length === 3 &&
    ehCategoriaPublica(segmentos[0]) &&
    ehVarianteDeDerivada(segmentos[1]) &&
    ehNomeDeDerivada(segmentos[2] ?? '')
  ) {
    return valor as ObjectKey;
  }

  if (segmentos.length === 4 && segmentos[0] === 'found-reports' && segmentos[2] === 'sanitized') {
    return valor as ObjectKey;
  }

  if (segmentos.length === 3 && segmentos[0] === 'catalog' && segmentos[1] === 'original') {
    return valor as ObjectKey;
  }

  if (segmentos.length === 2 && (segmentos[0] === 'thumb' || segmentos[0] === 'card')) {
    const nome = segmentos[1] ?? '';
    const ponto = nome.lastIndexOf('.');
    if (ponto > 0 && ponto < nome.length - 1) return valor as ObjectKey;
  }

  return recusarChave(valor, 'forma que este sistema não escreve');
}

/** 128 bits. O piso das DUAS chaves, e a mesma recusa ruidosa para as duas. */
const BYTES_DE_ALEATORIO = 16;

/** O piso de entropia, exigido no mesmo lugar para as duas chaves. */
function exigirAleatorioForte(qualChave: string, aleatorio: Uint8Array): void {
  if (aleatorio.length < BYTES_DE_ALEATORIO) {
    throw new Error(
      `A chave ${qualChave} exige 128 bits (${BYTES_DE_ALEATORIO} bytes) de aleatório.`,
    );
  }
}

export function chaveDoOriginal(petId: string, aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('do original', aleatorio);
  return comoObjectKey(`pets/${petId}/original/${Buffer.from(aleatorio).toString('base64url')}`);
}

/** A chave da derivada pública, a partir de 16 bytes de CSPRNG. */
export function chaveDaDerivada(
  variante: VarianteDeDerivada,
  aleatorio: Uint8Array,
  extensao: string,
  categoria: CategoriaPublica = 'pets',
): ObjectKey {
  if (!ehExtensaoDeDerivada(extensao)) {
    throw new Error(
      `Extensão de derivada recusada: ${JSON.stringify(extensao)}. ` +
        `As únicas aceitas são ${EXTENSOES_DE_DERIVADA.join(', ')}.`,
    );
  }
  exigirAleatorioForte('da derivada pública', aleatorio);
  const nome = Buffer.from(aleatorio).toString('base64url');
  return comoObjectKey(`${categoria}/${variante}/${nome}.${extensao}`);
}

/** A chave da foto do aviso do achador (BICHUS-35, critério 9). */
export function chaveDaFotoDoAchado(foundReportId: string, aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('da foto do achado', aleatorio);
  return comoObjectKey(
    `found-reports/${foundReportId}/original/${Buffer.from(aleatorio).toString('base64url')}`,
  );
}

/** A chave do original de uma imagem de catalogo, no bucket PRIVADO. */
export function chaveDoOriginalDeCatalogo(
  aleatorio: Uint8Array,
  categoria: CategoriaDeCatalogo = 'products',
): ObjectKey {
  exigirAleatorioForte('do original de catalogo', aleatorio);
  return comoObjectKey(`${categoria}/original/${Buffer.from(aleatorio).toString('base64url')}`);
}

/** A chave da foto de quem avisou SEM CONTA (BICHUS-41). */
export function chaveDaFotoDoAchadorSemConta(aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('da foto do achador sem conta', aleatorio);
  return comoObjectKey(
    `found-reports/sem-conta/original/${Buffer.from(aleatorio).toString('base64url')}`,
  );
}

/** A chave da DERIVADA HIGIENIZADA da foto do achado, no bucket **privado**. */
export function chaveDaFotoHigienizada(
  dono: string,
  aleatorio: Uint8Array,
  extensao: string,
): ObjectKey {
  if (!ehExtensaoDeDerivada(extensao)) {
    throw new Error(
      `Extensão de derivada recusada: ${JSON.stringify(extensao)}. ` +
        `As únicas aceitas são ${EXTENSOES_DE_DERIVADA.join(', ')}.`,
    );
  }
  exigirAleatorioForte('da foto higienizada do achado', aleatorio);
  const nome = Buffer.from(aleatorio).toString('base64url');
  return comoObjectKey(`found-reports/${dono}/sanitized/${nome}.${extensao}`);
}
