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
 * - **O ORIGINAL É APAGADO, e a versão limpa fica no lugar dele** (decisão do
 *   cliente, 17/10/2026 — ver [descartarOriginalComGps]). Era ele que
 *   carregava a coordenada de GPS, porque é nele que o EXIF mora.
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
import type {
  FotoDoAchadoParaHigienizar,
  FotosDoAchadoDoWorker,
} from '../ports/fotos-do-achado.js';
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

/**
 * APAGA O ORIGINAL, que é a cópia que carrega a coordenada de GPS.
 *
 * ## ISTO NÃO VIOLA A REGRA DE "NENHUM APAGAMENTO AUTOMÁTICO" — leia antes de
 * "consertar"
 *
 * A regra do cliente (17/10/2026) é: *"você só deve apagar as informações, caso
 * o usuário remova o pet ou delete a conta"*. Alguém vai ler esta função em
 * três meses, ver um `delete` dentro de um worker, concluir que é apagamento
 * automático de informação de achado e remover a chamada. **Não remova.**
 *
 * **Nenhuma informação do pet é perdida aqui.** O que sai é **uma das duas
 * cópias do MESMO arquivo** — a que tem a coordenada de GPS no EXIF —, e ela só
 * sai **depois** de a outra cópia, idêntica como imagem e sem o metadado, estar
 * no balde **e gravada em `sanitized_key`**. A foto continua existindo, a
 * mesma, visível para o tutor na conversa mediada. O que deixa de existir é o
 * endereço aproximado de quem fotografou o animal.
 *
 * Decisão do cliente, nas palavras dele, depois de a troca ser explicada sem
 * jargão: **"pode apagar o original e guardar só o arquivo 2"** (17/10/2026).
 *
 * ## A INVARIANTE, e é ela que fecha a janela de perda
 *
 * **O original só é apagado quando existe uma versão limpa GRAVADA.** Não "já
 * enviada", não "provavelmente lá": gravada em `sanitized_key`, que é o que a
 * leitura usa para achar a foto. É por isso que esta função é chamada **depois**
 * de `marcarHigienizada` e nunca antes.
 *
 * `sanitize_status = 'pronta'` **é** a prova de que ela está gravada, e não uma
 * suposição: o CHECK `upload_intents_higiene_coerente` (migração
 * `20261001000006`) só admite `'pronta'` com `sanitized_key IS NOT NULL`. Então
 * o banco é testemunha, e esta função aceita exatamente esse estado.
 *
 * ## Por que ela LANÇA em vez de engolir a falha
 *
 * Porque a alternativa é guardar a coordenada de GPS em silêncio. Se o
 * armazenamento recusar a exclusão, a foto está **segura** (as duas cópias
 * existem) e o trabalho **não terminou**: lançar deixa a fila readiar, e a
 * readiação **conserta**, porque o caminho de reentrada desta função trata o
 * `'pronta'` que ela vai encontrar. Engolir a falha deixaria o arquivo com a
 * coordenada no balde para sempre, sem nada acusando — que é a classe de
 * defeito que este módulo inteiro existe para não repetir.
 *
 * O `delete` da porta trata 404 como sucesso, então repetir é barato e a
 * operação é idempotente.
 */
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
  // Intenção apagada entre o envio e o processamento é caso normal: o varredor
  // de envios vencidos a recolheu. Lançar aqui faria a fila tentar cinco vezes
  // uma linha que não existe mais.
  if (foto === null) return { tipo: 'ignorada', envioId: carga.upload_intent_id };
  if (foto.status !== 'pendente') {
    // `'pronta'` NA REENTRADA É O CONSERTO, e é o que torna o `throw` de
    // `descartarOriginalComGps` produtivo em vez de só ruidoso: a versão limpa
    // está gravada (o CHECK garante), e o original pode ter sobrado de uma
    // tentativa em que o armazenamento recusou a exclusão. Apagar de novo é
    // idempotente -- o `delete` da porta trata 404 como sucesso --, então o
    // caso comum (nada sobrou) custa uma chamada e não muda nada.
    //
    // `'recusada'` e `'ausente'` NÃO entram aqui, e a assimetria é a
    // invariante: nos dois NÃO existe versão limpa, então o original é a ÚNICA
    // cópia da foto. Apagá-lo ali seria perder a foto, que é precisamente o
    // que esta correção existe para impedir.
    if (foto.status === 'pronta') await descartarOriginalComGps(deps, foto);
    return { tipo: 'ignorada', envioId: foto.uploadIntentId };
  }

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

  // E SÓ AGORA O ORIGINAL, que é a cópia com a coordenada de GPS. Nesta ordem,
  // nunca na inversa: a versão limpa já subiu (duas linhas acima) e já está
  // GRAVADA em `sanitized_key` (uma linha acima), então não existe instante em
  // que a foto não tenha nenhuma cópia -- nem se o processo morrer aqui.
  //
  // Lança se o armazenamento recusar, e isso é deliberado: ver
  // `descartarOriginalComGps`. A foto está segura; o que falta é o metadado
  // sair, e a readiação conserta.
  await descartarOriginalComGps(deps, foto);

  return { tipo: 'higienizada', envioId: foto.uploadIntentId, bytes: derivada.bytes.length };
}
