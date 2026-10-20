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
 * As derivadas saem de `domain/derivadas.ts`, por proposito e pela medida da
 * TELA. O encontro da comunidade ganhou tres (`thumb` 480 para a galeria de 144
 * dp, `card` 1024 para o cartao da agenda, `banner` 1280 para a capa de borda a
 * borda do detalhe): a galeria baixava 1024 px para desenhar 144 dp, que e
 * cinco vezes o dado que ela pinta, e a capa do detalhe borrava com 1024. O
 * produto da Loja continua com uma derivada e sem corte -- nao medi aquela tela.
 *
 * Recusa e final (culpa do arquivo); falha do armazenamento lanca e a fila
 * tenta de novo (culpa nossa).
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

/**
 * As derivadas por proposito, do PONTO UNICO (`domain/derivadas.ts`).
 *
 * O encontro ganha tres porque a mesma imagem e desenhada em tres tamanhos (ver
 * `DERIVADAS_DO_ENCONTRO`); o produto da Loja fica com uma, e sem corte.
 */
const DERIVADAS_POR_PROPOSITO: Readonly<Record<string, readonly EspecificacaoDaDerivada[]>> = {
  network_event: DERIVADAS_DO_ENCONTRO,
  store_item: DERIVADAS_DO_PRODUTO,
  // 18/10/2026. Tres propositos, tres geometrias, e e por isso que a logo e a
  // foto do profissional sao dois campos e nao um: quadrada 1:1 contra faixa
  // 16:9. Ver `derivadas.ts` para a medida de cada tela.
  directory_logo: DERIVADAS_DA_LOGO,
  directory_photo: DERIVADAS_DA_FOTO_DO_LOCAL,
  user_photo: DERIVADAS_DA_FOTO_DE_USUARIO,
  // A VITRINE: `thumb` 320 x 320 para a GRADE (celula de 104 dp, 312 px reais a
  // 3x) e `card` 1024 x 1024 para a foto aberta. Nem a `thumb` de 176 nem a
  // `card` de 512 de `user_photo` servem a grade -- a primeira seria AMPLIADA
  // 1,8x, a segunda e 1,6x dado demais, e a grade desenha NOVE de uma vez.
  user_showcase: DERIVADAS_DA_VITRINE_DO_USUARIO,
  // A FOTO DA PUBLICACAO (20/10/2026): UMA derivada, `card` 1024 x 1024. Sem
  // `thumb`, e a ausencia e medida -- nao ha grade no Mural, e derivada que
  // nenhuma superficie pinta e peso pago em todo envio. Ver
  // `DERIVADAS_DA_PUBLICACAO`.
  user_publication: DERIVADAS_DA_PUBLICACAO,
};

/** O texto que o painel mostra, por motivo. Nao e codigo de erro. */
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

  // O objeto que nunca chegou tambem e recusa final: o envio foi confirmado
  // pela escrita do item, e sem os bytes nao ha o que tentar de novo.
  const cabecalho = await deps.armazenamento.head('privado', imagem.originalKey);
  if (cabecalho === null || cabecalho.contentLength === 0) {
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA.imagem_ilegivel);
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_ilegivel' };
  }

  const original = await deps.armazenamento.get('privado', imagem.originalKey);
  const inspecao = await deps.processador.inspecionar(original);
  // QUEM ACEITA HEIC E A MESMA LISTA QUE ASSINOU O ENVIO, e nao um `if` com os
  // propositos escritos de novo aqui.
  //
  // Antes desta linha havia DUAS respostas para a mesma pergunta: `preparar`
  // consultava `TIPOS_POR_PROPOSITO`, que aceita HEIC em `user_photo`, e este
  // arquivo recusava HEIC em TODO proposito de catalogo. O resultado e um
  // envio que o backend assina e o worker recusa depois -- a pessoa de iPhone
  // via "enviado" e, minutos depois, a foto `rejected` dizendo que o arquivo
  // nao e imagem aceita. Nao e defeito desta frente, e sim a lista de entrada
  // de `user_photo` tendo sido ampliada em 18/10 sem o worker acompanhar; o
  // conserto e uma linha aqui, e a alternativa era deixar duas listas que
  // discordam e acrescentar uma terceira para a vitrine.
  //
  // HEIC entra e NUNCA sai: a derivada e reescrita em JPEG
  // (`FORMATO_DAS_DERIVADAS`), e a conversao e nossa, no servidor.
  const heicAceito = TIPOS_POR_PROPOSITO[imagem.purpose].includes('image/heic');
  if (typeof inspecao === 'string' || (inspecao.formato === 'heic' && !heicAceito)) {
    const motivo: MotivoDeRecusa = typeof inspecao === 'string' ? inspecao : 'formato_nao_aceito';
    await deps.imagens.marcarRecusada(imagem.id, TEXTO_DA_RECUSA[motivo]);
    return { tipo: 'recusada', imagemId: imagem.id, motivo };
  }

  // A dimensao minima por proposito, que so os bytes dizem (contrato,
  // `AdminCatalogImageIntentInput.byte_size`): 800 x 800 no produto, 600 x 600
  // no encontro. Recusa final, com o numero no motivo, para a miniatura dizer.
  const minima = DIMENSAO_MINIMA[imagem.purpose];
  if (inspecao.largura < minima.largura || inspecao.altura < minima.altura) {
    await deps.imagens.marcarRecusada(
      imagem.id,
      `A imagem precisa ter pelo menos ${String(minima.largura)} x ${String(minima.altura)} pixels.`,
    );
    return { tipo: 'recusada', imagemId: imagem.id, motivo: 'imagem_pequena_demais' };
  }

  // UMA POR VEZ. Cada `derivar` decodifica o original, e decodificar em
  // paralelo e como este worker morreu antes (ver `sharp-image-processor.ts`).
  const categoria = CATEGORIA_DO_PROPOSITO[imagem.purpose];
  const chaves = new Map<string, ObjectKey>();
  for (const especificacao of DERIVADAS_POR_PROPOSITO[imagem.purpose] ?? DERIVADAS_DO_PRODUTO) {
    const derivada = await deps.processador.derivar(original, {
      largura: especificacao.largura,
      ...(especificacao.altura === undefined ? {} : { altura: especificacao.altura }),
      escada: escadaDo(especificacao.porte),
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    // Cabecalho que abriu e pixel que nao abre e culpa do arquivo: recusa
    // final, e nao excecao com cinco retentativas.
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
  // Falha ruidosa: a lista do proposito sempre declara `card`, e uma ausencia
  // aqui e a lista editada sem o resto. Gravar `null` deixaria a imagem `ready`
  // sem endereco, que e o estado que a tela nao sabe explicar.
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
