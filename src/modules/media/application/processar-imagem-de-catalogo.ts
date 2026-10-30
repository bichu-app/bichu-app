/**
 * O trabalho que torna uma imagem de catalogo servivel (ADR-0027 item 10), na
 * mesma ordem de `processar-foto.ts`, e pelos mesmos motivos:
 */
import type { IdGenerator } from '../../../shared/ports/index.js';
import { chaveDaDerivada } from '../domain/chave-de-objeto.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import {
  CATEGORIA_DO_PROPOSITO,
  DIMENSAO_MINIMA,
  TIPOS_POR_PROPOSITO,
  type ChavesDaImagemDeCatalogo,
  type ImagensDeCatalogoDoWorker,
} from '../ports/imagem-de-catalogo.js';
import {
  DERIVADAS_DA_FOTO_DE_USUARIO,
  DERIVADAS_DA_FOTO_DO_LOCAL,
  DERIVADAS_DA_LOGO,
  DERIVADAS_DA_PUBLICACAO,
  DERIVADAS_DA_VITRINE_DO_USUARIO,
  DERIVADAS_DO_ENCONTRO,
  DERIVADAS_DO_PRODUTO,
  TETO_DE_BYTES_DA_DERIVADA,
  escadaDo,
  type EspecificacaoDaDerivada,
} from '../domain/derivadas.js';
import type { ObjectKey } from '../../../shared/types/brands.js';
import type { ObjectStorage } from '../ports/object-storage.js';

/** As derivadas por proposito, do PONTO UNICO (`domain/derivadas.ts`). */
const DERIVADAS_POR_PROPOSITO: Readonly<Record<string, readonly EspecificacaoDaDerivada[]>> = {
  network_event: DERIVADAS_DO_ENCONTRO,
  store_item: DERIVADAS_DO_PRODUTO,
  directory_logo: DERIVADAS_DA_LOGO,
  directory_photo: DERIVADAS_DA_FOTO_DO_LOCAL,
  directory_gallery: DERIVADAS_DO_ENCONTRO,
  directory_suggestion_logo: DERIVADAS_DA_LOGO,
  user_photo: DERIVADAS_DA_FOTO_DE_USUARIO,
  user_showcase: DERIVADAS_DA_VITRINE_DO_USUARIO,
  user_publication: DERIVADAS_DA_PUBLICACAO,
};

/** O texto que o painel mostra, por motivo. */
const TEXTO_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  formato_nao_aceito: 'Esse arquivo não é uma imagem JPEG, PNG ou WebP.',
  imagem_grande_demais: 'Essa imagem é grande demais. Reduza e envie de novo.',
  imagem_ilegivel: 'Não conseguimos ler essa imagem. Ela pode ter chegado incompleta.',
  imagem_animada: 'Essa imagem é uma animação. Envie uma imagem parada.',
  formato_nao_decodificavel: 'Não conseguimos abrir esse arquivo. Envie em JPEG, PNG ou WebP.',
};

export interface DependenciasDaImagemDeCatalogo {
  readonly imagens: ImagensDeCatalogoDoWorker;
  readonly armazenamento: ObjectStorage;
  readonly processador: ImageProcessor;
  readonly ids: IdGenerator;
}

export interface CargaDaImagemDeCatalogo {
  readonly catalog_image_id: string;
}

export type ResultadoDaImagemDeCatalogo =
  | { readonly tipo: 'pronta'; readonly imagemId: string }
  | {
      readonly tipo: 'recusada';
      readonly imagemId: string;
      readonly motivo: MotivoDeRecusa | 'imagem_pequena_demais';
    }
  | { readonly tipo: 'ignorada'; readonly imagemId: string };

export async function processarImagemDeCatalogo(
  deps: DependenciasDaImagemDeCatalogo,
  carga: CargaDaImagemDeCatalogo,
): Promise<ResultadoDaImagemDeCatalogo> {
  const imagem = await deps.imagens.paraProcessar(carga.catalog_image_id);
  if (imagem === null || imagem.status !== 'processing') {
    return { tipo: 'ignorada', imagemId: carga.catalog_image_id };
  }

  const cabecalho = await deps.armazenamento.head('privado', imagem.originalKey);
  if (cabecalho === null || cabecalho.contentLength === 0) {
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA.imagem_ilegivel);
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_ilegivel' };
  }

  const original = await deps.armazenamento.get('privado', imagem.originalKey);
  const inspecao = await deps.processador.inspecionar(original);
  const heicAceito = TIPOS_POR_PROPOSITO[imagem.purpose].includes('image/heic');
  if (typeof inspecao === 'string' || (inspecao.formato === 'heic' && !heicAceito)) {
    const motivo: MotivoDeRecusa = typeof inspecao === 'string' ? inspecao : 'formato_nao_aceito';
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA[motivo]);
    return { tipo: 'recusada', imagemId: imagem.id, motivo };
  }

  const minima = DIMENSAO_MINIMA[imagem.purpose];
  if (inspecao.largura < minima.largura || inspecao.altura < minima.altura) {
    await deps.imagens.marcarRecusada(
      imagem.id,
      `A imagem precisa ter pelo menos ${String(minima.largura)} x ${String(minima.altura)} pixels.`,
    );
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_pequena_demais' };
  }

  const categoria = CATEGORIA_DO_PROPOSITO[imagem.purpose];
  const chaves = new Map<string, ObjectKey>();
  for (const especificacao of DERIVADAS_POR_PROPOSITO[imagem.purpose] ?? DERIVADAS_DO_PRODUTO) {
    const derivada = await deps.processador.derivar(original, {
      largura: especificacao.largura,
      ...(especificacao.altura === undefined ? {} : { altura: especificacao.altura }),
      escada: escadaDo(especificacao.porte),
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    if (typeof derivada === 'string') {
      await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA[derivada]);
      return { tipo: 'recusada', imagemId: imagem.id, motivo: derivada };
    }
    const chave = chaveDaDerivada(
      especificacao.variante,
      deps.ids.random128(),
      derivada.extensao,
      categoria,
    );
    await deps.armazenamento.put('publico', chave, derivada.bytes, derivada.contentType);
    chaves.set(especificacao.variante, chave);
  }

  const card = chaves.get('card');
  if (card === undefined) {
    throw new Error(
      `As derivadas de ${imagem.purpose} precisam declarar \`card\`: ` +
        'e ela que sai em `cover_image_url` e na vitrine.',
    );
  }
  const thumb = chaves.get('thumb');
  const banner = chaves.get('banner');
  const prontas: ChavesDaImagemDeCatalogo = {
    card,
    ...(thumb === undefined ? {} : { thumb }),
    ...(banner === undefined ? {} : { banner }),
  };
  await deps.imagens.marcarPronta(imagem.id, prontas);
  return { tipo: 'pronta', imagemId: imagem.id };
}
