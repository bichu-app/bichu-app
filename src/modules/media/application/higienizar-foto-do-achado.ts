/** A HIGIENE DA FOTO DO ACHADO — e o que ela conserta é um vazamento de GPS. */
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import { chaveDaFotoHigienizada } from '../domain/chave-de-objeto.js';
import {
  DERIVADA_DA_FOTO_DO_ACHADO,
  TETO_DE_BYTES_DA_DERIVADA,
  escadaDo,
} from '../domain/derivadas.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import type {
  FotoDoAchadoParaHigienizar,
  FotosDoAchadoDoWorker,
} from '../ports/fotos-do-achado.js';
import type { ObjectStorage } from '../ports/object-storage.js';

/**
 * O texto do motivo. Vai para a coluna e, no dia em que a conversa servir a foto,
 * para a tela de quem enviou — nunca é código de erro.
 */
const TEXTO_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  formato_nao_aceito: 'Esse arquivo não é uma foto que a gente consiga abrir.',
  imagem_grande_demais: 'Essa foto é grande demais. Escolha outra ou tire uma nova.',
  imagem_ilegivel: 'Não conseguimos ler essa foto. Ela pode ter chegado incompleta.',
  imagem_animada: 'Essa foto é uma animação. Envie uma imagem parada.',
  formato_nao_decodificavel: 'Não conseguimos abrir esse arquivo. Tente enviar em JPEG.',
};

export interface DependenciasDaHigiene {
  readonly fotos: FotosDoAchadoDoWorker;
  readonly armazenamento: ObjectStorage;
  readonly imagens: ImageProcessor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CargaDaHigiene {
  readonly upload_intent_id: string;
}

export type ResultadoDaHigiene =
  | { readonly tipo: 'higienizada'; readonly envioId: string; readonly bytes: number }
  | { readonly tipo: 'recusada'; readonly envioId: string; readonly motivo: MotivoDeRecusa }
  | { readonly tipo: 'ausente'; readonly envioId: string }
  /** Já higienizada antes: o trabalho foi reentregue depois de um reinício. */
  | { readonly tipo: 'ignorada'; readonly envioId: string };

/** APAGA O ORIGINAL, que é a cópia que carrega a coordenada de GPS. */
async function descartarOriginalComGps(
  deps: DependenciasDaHigiene,
  foto: FotoDoAchadoParaHigienizar,
): Promise<void> {
  await deps.armazenamento.delete('privado', foto.originalKey);
}

export async function higienizarFotoDoAchado(
  deps: DependenciasDaHigiene,
  carga: CargaDaHigiene,
): Promise<ResultadoDaHigiene> {
  const foto = await deps.fotos.paraHigienizar(carga.upload_intent_id);
  if (foto === null) return { tipo: 'ignorada', envioId: carga.upload_intent_id };
  if (foto.status !== 'pendente') {
    if (foto.status === 'pronta') await descartarOriginalComGps(deps, foto);
    return { tipo: 'ignorada', envioId: foto.uploadIntentId };
  }

  const agora = comoData(deps.clock.now());

  const cabecalho = await deps.armazenamento.head('privado', foto.originalKey);
  if (cabecalho === null || cabecalho.contentLength === 0) {
    await deps.fotos.marcarAusente(foto.uploadIntentId, agora);
    return { tipo: 'ausente', envioId: foto.uploadIntentId };
  }

  const original = await deps.armazenamento.get('privado', foto.originalKey);

  const inspecao = await deps.imagens.inspecionar(original);
  if (typeof inspecao === 'string') {
    await deps.fotos.marcarRecusada(foto.uploadIntentId, TEXTO_DA_RECUSA[inspecao], agora);
    return { tipo: 'recusada', envioId: foto.uploadIntentId, motivo: inspecao };
  }

  const derivada = await deps.imagens.derivar(original, {
    largura: DERIVADA_DA_FOTO_DO_ACHADO.largura,
    ...(DERIVADA_DA_FOTO_DO_ACHADO.altura === undefined
      ? {}
      : { altura: DERIVADA_DA_FOTO_DO_ACHADO.altura }),
    escada: escadaDo(DERIVADA_DA_FOTO_DO_ACHADO.porte),
    tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
  });
  if (typeof derivada === 'string') {
    await deps.fotos.marcarRecusada(foto.uploadIntentId, TEXTO_DA_RECUSA[derivada], agora);
    return { tipo: 'recusada', envioId: foto.uploadIntentId, motivo: derivada };
  }

  const chave = chaveDaFotoHigienizada(foto.dono, deps.ids.random128(), derivada.extensao);
  await deps.armazenamento.put('privado', chave, derivada.bytes, derivada.contentType);
  await deps.fotos.marcarHigienizada(foto.uploadIntentId, chave, agora);

  await descartarOriginalComGps(deps, foto);

  return { tipo: 'higienizada', envioId: foto.uploadIntentId, bytes: derivada.bytes.length };
}
