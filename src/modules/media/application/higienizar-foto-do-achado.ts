/**
 * A HIGIENE DA FOTO DO ACHADO — e o que ela conserta é um vazamento de GPS.
 *
 * O caminho da foto de achado (`/media/found-report-photo-intents`) e o do
 * achador sem conta (`/v1/media/finder-photo-intents`) não tinham worker: o
 * tipo era aceito pela **declaração do cliente**, não havia derivada, e o
 * **EXIF ficava no arquivo**. Foto de celular carrega coordenada de GPS, e num
 * produto de pet perdido isso diz onde a pessoa estava.
 *
 * Este caso de uso é a MESMA ordem de `processar-foto.ts`, e de propósito:
 *
 * 1. bytes reais primeiro — a assinatura decide o formato, nunca o declarado;
 * 2. cabeçalho antes de decodificar — 50 megapixels recusados por aritmética;
 * 3. derivada reescrita do zero, **sem metadado nenhum**;
 * 4. e só então a chave é gravada.
 *
 * O processador de imagem é o MESMO (`ImageProcessor`), o worker é o mesmo
 * processo e a fila é a mesma. Não há segundo caminho de processamento de
 * imagem neste sistema, e não pode haver: dois caminhos divergem, e o que
 * diverge primeiro é sempre o que ninguém está olhando.
 *
 * ## As três diferenças em relação à foto de pet, e por que
 *
 * - **A derivada é PRIVADA.** Critério 9 da BICHUS-35: a foto do achador é
 *   vista pelo tutor dentro da conversa mediada, e só. Uma derivada pública
 *   seria servida com cache de um ano e sem assinatura.
 * - **UMA derivada, no tamanho de leitura na conversa.** A conversa mediada
 *   mostra a foto para o tutor decidir se é o animal dele; ela não tem galeria,
 *   cartaz nem miniatura. Duas derivadas seriam um objeto pago a mais.
 * - **O original não é apagado.** É dele que sai qualquer derivada futura, e
 *   cortar no servidor sem guardar o que sobrou não tem volta.
 *
 * ## Recusa é final; armazenamento fora do ar não é
 *
 * A mesma distinção do resto do módulo: arquivo ruim vira `recusada` e sai da
 * fila; banco ou balde fora do ar lança, e a fila adia. O objeto que nunca
 * chegou é o terceiro caso, e é final também (`ausente`) — a intenção foi
 * assinada, a pessoa desistiu no meio do envio, e não há bytes para tentar de
 * novo.
 */
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import { chaveDaFotoHigienizada } from '../domain/chave-de-objeto.js';
import {
  DERIVADA_DA_FOTO_DO_ACHADO,
  TETO_DE_BYTES_DA_DERIVADA,
  escadaDo,
} from '../domain/derivadas.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import type { FotosDoAchadoDoWorker } from '../ports/fotos-do-achado.js';
import type { ObjectStorage } from '../ports/object-storage.js';

/**
 * O texto do motivo. Vai para a coluna e, no dia em que a conversa servir a
 * foto, para a tela de quem enviou — nunca é código de erro.
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

export async function higienizarFotoDoAchado(
  deps: DependenciasDaHigiene,
  carga: CargaDaHigiene,
): Promise<ResultadoDaHigiene> {
  const foto = await deps.fotos.paraHigienizar(carga.upload_intent_id);
  // Intenção apagada entre o envio e o processamento é caso normal: o varredor
  // de envios vencidos a recolheu. Lançar aqui faria a fila tentar cinco vezes
  // uma linha que não existe mais.
  if (foto === null) return { tipo: 'ignorada', envioId: carga.upload_intent_id };
  if (foto.status !== 'pendente') return { tipo: 'ignorada', envioId: foto.uploadIntentId };

  // `Clock.now()` devolve `Instant` (milissegundos marcados); as colunas sao
  // `timestamptz`. `comoData` e o caminho declarado entre os dois, e a
  // conversao acontece AQUI e uma vez: quatro `comoData(...)` espalhados pelas
  // escritas seriam quatro lugares para alguem esquecer.
  const agora = comoData(deps.clock.now());

  // O objeto que nunca chegou, conferido pelo CABEÇALHO e não pelo corpo: ler
  // 5 MB para descobrir que não há 5 MB é o caminho caro para a mesma resposta.
  const cabecalho = await deps.armazenamento.head('privado', foto.originalKey);
  if (cabecalho === null || cabecalho.contentLength === 0) {
    await deps.fotos.marcarAusente(foto.uploadIntentId, agora);
    return { tipo: 'ausente', envioId: foto.uploadIntentId };
  }

  // Pode lançar: armazenamento fora do ar é culpa nossa, e a fila adia.
  const original = await deps.armazenamento.get('privado', foto.originalKey);

  // OS BYTES. É aqui que o caminho do achado deixa de confiar no tipo que o
  // cliente declarou — a coluna `declared_type` passa a ser o que ela sempre
  // deveria ter sido: diagnóstico, nunca verdade.
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

  // `privado`, e não `publico`. A diferença é o critério 9 inteiro.
  const chave = chaveDaFotoHigienizada(foto.dono, deps.ids.random128(), derivada.extensao);
  // O objeto sobe ANTES de a chave ser gravada: na ordem inversa existiria uma
  // janela em que a conversa mediada assinaria a leitura de um objeto que ainda
  // não está lá.
  await deps.armazenamento.put('privado', chave, derivada.bytes, derivada.contentType);
  await deps.fotos.marcarHigienizada(foto.uploadIntentId, chave, agora);

  return { tipo: 'higienizada', envioId: foto.uploadIntentId, bytes: derivada.bytes.length };
}
