/**
 * O trabalho que torna uma imagem de catalogo servivel (ADR-0027 item 10), na
 * mesma ordem de `processar-foto.ts`, e pelos mesmos motivos:
 *
 * 1. **bytes reais primeiro**: o tipo declarado no envio nunca e consultado,
 *    e um SVG ou um poliglota JPEG/HTML e recusado pelos numeros magicos;
 * 2. **cabecalho antes de decodificar**: o teto de pixels e aritmetica, sem
 *    alocar um pixel;
 * 3. **derivada reescrita do zero**, sem EXIF, XMP nem IPTC;
 * 4. **`ready` por ultimo**, e so depois de a derivada estar no bucket
 *    publico. Antes disso a leitura publica nao a enxerga, porque as consultas
 *    filtram `status = 'ready'`.
 *
 * Uma derivada so, a de 1024 px (`card`): a vitrine e a galeria do app usam o
 * mesmo tamanho, e uma miniatura que ninguem pede e um objeto pago a mais.
 *
 * Recusa e final (culpa do arquivo); falha do armazenamento lanca e a fila
 * tenta de novo (culpa nossa).
 */
import type { IdGenerator } from '../../../shared/ports/index.js';
import { chaveDaDerivada } from '../domain/chave-de-objeto.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import { DIMENSAO_MINIMA, type ImagensDeCatalogoDoWorker } from '../ports/imagem-de-catalogo.js';
import type { ObjectStorage } from '../ports/object-storage.js';

const LARGURA_DA_DERIVADA = 1024;

/** O texto que o painel mostra, por motivo. Nao e codigo de erro. */
const TEXTO_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  formato_nao_aceito: 'Esse arquivo não é uma imagem JPEG, PNG ou WebP.',
  imagem_grande_demais: 'Essa imagem é grande demais. Reduza e envie de novo.',
  imagem_ilegivel: 'Não conseguimos ler essa imagem. Ela pode ter chegado incompleta.',
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

  // O objeto que nunca chegou tambem e recusa final: o envio foi confirmado
  // pela escrita do item, e sem os bytes nao ha o que tentar de novo.
  const cabecalho = await deps.armazenamento.head('privado', imagem.originalKey);
  if (cabecalho === null || cabecalho.contentLength === 0) {
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA.imagem_ilegivel);
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_ilegivel' };
  }

  const original = await deps.armazenamento.get('privado', imagem.originalKey);
  const inspecao = await deps.processador.inspecionar(original);
  // HEIC passa na inspecao da foto do pet, que sai de celular; aqui a origem e
  // um computador de mesa e o contrato aceita so JPEG, PNG e WebP.
  if (typeof inspecao === 'string' || inspecao.formato === 'heic') {
    const motivo: MotivoDeRecusa = typeof inspecao === 'string' ? inspecao : 'formato_nao_aceito';
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA[motivo]);
    return { tipo: 'recusada', imagemId: imagem.id, motivo };
  }

  // A dimensao minima por proposito, que so os bytes dizem (contrato,
  // `AdminCatalogImageIntentInput.byte_size`): 800 x 800 no produto, 1600 x 900
  // no encontro. Recusa final, com o numero no motivo, para a miniatura dizer.
  const minima = DIMENSAO_MINIMA[imagem.purpose];
  if (inspecao.largura < minima.largura || inspecao.altura < minima.altura) {
    await deps.imagens.marcarRecusada(
      imagem.id,
      `A imagem precisa ter pelo menos ${String(minima.largura)} x ${String(minima.altura)} pixels.`,
    );
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_pequena_demais' };
  }

  const derivada = await deps.processador.derivar(original, LARGURA_DA_DERIVADA);
  const chave = chaveDaDerivada('card', deps.ids.random128(), derivada.extensao);
  await deps.armazenamento.put('publico', chave, derivada.bytes, derivada.contentType);
  await deps.imagens.marcarPronta(imagem.id, chave);
  return { tipo: 'pronta', imagemId: imagem.id };
}
