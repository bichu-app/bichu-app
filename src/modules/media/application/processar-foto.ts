import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { ObjectKey } from '../../../shared/types/brands.js';
import type { Derivada } from '../ports/image-processor.js';
import { chaveDaDerivada } from '../domain/chave-de-objeto.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import {
  DERIVADAS_DA_FOTO_DE_PET,
  DIMENSAO_MINIMA_DA_FOTO_DE_PET,
  TETO_DE_BYTES_DA_DERIVADA,
  escadaDo,
} from '../domain/derivadas.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';

const TEXTO_DA_RECUSA: Record<MotivoDeRecusa | 'imagem_pequena_demais', string> = {
  formato_nao_aceito: 'Esse arquivo não é uma foto que a gente consiga abrir.',
  imagem_grande_demais: 'Essa foto é grande demais. Escolha outra ou tire uma nova.',
  imagem_ilegivel: 'Não conseguimos ler essa foto. Ela pode ter chegado incompleta.',
  imagem_animada: 'Essa foto é uma animação. Envie uma imagem parada.',
  formato_nao_decodificavel: 'Não conseguimos abrir esse arquivo. Tente enviar em JPEG.',
  imagem_pequena_demais:
    `Essa foto é pequena demais. Envie uma com pelo menos ` +
    `${String(DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura)} x ` +
    `${String(DIMENSAO_MINIMA_DA_FOTO_DE_PET.altura)} pixels.`,
};

export interface DependenciasDoProcessamento {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly imagens: ImageProcessor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** O que cada derivada custou. */
export interface RelatoDaDerivada {
  readonly variante: string;
  readonly largura: number;
  readonly altura: number;
  readonly bytes: number;
  readonly qualidade: number;
  readonly acimaDoTeto: boolean;
}

export interface CargaDoTrabalho {
  readonly photo_id: string;
}

export type ResultadoDoProcessamento =
  | {
      readonly tipo: 'pronta';
      readonly fotoId: string;
      readonly derivadas: readonly RelatoDaDerivada[];
    }
  | {
      readonly tipo: 'recusada';
      readonly fotoId: string;
      readonly motivo: MotivoDeRecusa | 'imagem_pequena_demais';
    }
  /** Já processada antes: o trabalho foi reentregue depois de um reinício. */
  | { readonly tipo: 'ignorada'; readonly fotoId: string };

export async function processarFoto(
  deps: DependenciasDoProcessamento,
  carga: CargaDoTrabalho,
): Promise<ResultadoDoProcessamento> {
  const foto = await deps.repositorio.buscarParaProcessar(carga.photo_id);
  if (foto === null) return { tipo: 'ignorada', fotoId: carga.photo_id };
  if (foto.status !== 'processing') return { tipo: 'ignorada', fotoId: foto.id };

  const original = await deps.armazenamento.get('privado', foto.originalKey);

  const inspecao = await deps.imagens.inspecionar(original);
  if (typeof inspecao === 'string') {
    await deps.repositorio.marcarRecusada(foto.id, TEXTO_DA_RECUSA[inspecao], deps.clock.now());
    return { tipo: 'recusada', fotoId: foto.id, motivo: inspecao };
  }

  if (
    inspecao.largura < DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura ||
    inspecao.altura < DIMENSAO_MINIMA_DA_FOTO_DE_PET.altura
  ) {
    await deps.repositorio.marcarRecusada(
      foto.id,
      TEXTO_DA_RECUSA.imagem_pequena_demais,
      deps.clock.now(),
    );
    return { tipo: 'recusada', fotoId: foto.id, motivo: 'imagem_pequena_demais' };
  }

  const geradas = new Map<string, { chave: ObjectKey; derivada: Derivada }>();
  for (const especificacao of DERIVADAS_DA_FOTO_DE_PET) {
    const derivada = await deps.imagens.derivar(original, {
      largura: especificacao.largura,
      ...(especificacao.altura === undefined ? {} : { altura: especificacao.altura }),
      escada: escadaDo(especificacao.porte),
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    if (typeof derivada === 'string') {
      await deps.repositorio.marcarRecusada(foto.id, TEXTO_DA_RECUSA[derivada], deps.clock.now());
      return { tipo: 'recusada', fotoId: foto.id, motivo: derivada };
    }
    const chave = chaveDaDerivada(
      especificacao.variante,
      deps.ids.random128(),
      derivada.extensao,
      'pets',
    );
    await deps.armazenamento.put('publico', chave, derivada.bytes, derivada.contentType);
    geradas.set(especificacao.variante, { chave, derivada });
  }

  const card = geradas.get('card');
  const thumb = geradas.get('thumb');
  if (card === undefined || thumb === undefined) {
    throw new Error(
      'DERIVADAS_DA_FOTO_DE_PET precisa declarar `card` e `thumb`: a resposta da ' +
        'foto publica as duas, e o cartaz impresso depende da `card`.',
    );
  }

  await deps.repositorio.marcarPronta({
    fotoId: foto.id,
    thumbKey: thumb.chave,
    cardKey: card.chave,
    agora: deps.clock.now(),
  });

  return {
    tipo: 'pronta',
    fotoId: foto.id,
    derivadas: [...geradas].map(([variante, g]) => ({
      variante,
      largura: g.derivada.largura,
      altura: g.derivada.altura,
      bytes: g.derivada.bytes.length,
      qualidade: g.derivada.qualidade,
      acimaDoTeto: g.derivada.acimaDoTeto,
    })),
  };
}
