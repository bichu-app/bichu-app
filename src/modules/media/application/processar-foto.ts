/**
 * O trabalho que torna uma foto utilizável (critérios 14, 18 e 19 de BICHUS-87).
 *
 * A ordem das etapas é a regra, e nenhuma delas pode trocar de lugar:
 *
 * 1. **Bytes reais primeiro.** O tipo declarado no envio nunca é consultado.
 * 2. **Cabeçalho antes de decodificar.** 50 megapixels são recusados por
 *    aritmética sobre largura e altura, sem alocar um pixel.
 * 3. **Derivadas reescritas do zero**, sem copiar metadado nenhum.
 * 4. **`ready` por último.** Antes disso a foto não serve a rota pública, e é
 *    por isso que a ordem importa: entre "a derivada existe" e "a foto está
 *    pronta" não pode haver uma janela em que ela seja servível sem estar limpa.
 *
 * ## Recusa é final, e isso é o critério 19
 *
 * Arquivo que não é imagem, ou é grande demais, **não volta para a fila**. O
 * estado vira `rejected` com motivo e a pessoa é avisada na tela. Retentativa de
 * algo que nunca vai ser aceito é um laço que gasta CPU para sempre, sobe o
 * contador de falhas do serviço e não avisa ninguém — e o pior: o trabalho que
 * derruba o worker por memória volta a derrubá-lo a cada rodada.
 *
 * A distinção entre "recusar" e "falhar" é a distinção entre **culpa do arquivo**
 * e **culpa nossa**. Armazenamento fora do ar é nossa; o worker lança, a fila
 * adia e tenta de novo. Um HTML declarado como JPEG é do arquivo, e tentar de
 * novo não muda nada.
 */
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { chaveDaDerivada } from '../domain/chave-de-objeto.js';
import type { ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';

/** Os dois tamanhos do ADR-0007. */
const LARGURA_DO_THUMB = 160;
const LARGURA_DO_CARD = 1024;

/** O texto que vai para a tela, por motivo. Não é código de erro. */
const TEXTO_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  formato_nao_aceito: 'Esse arquivo não é uma foto que a gente consiga abrir.',
  imagem_grande_demais: 'Essa foto é grande demais. Escolha outra ou tire uma nova.',
  imagem_ilegivel: 'Não conseguimos ler essa foto. Ela pode ter chegado incompleta.',
};

export interface DependenciasDoProcessamento {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly imagens: ImageProcessor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CargaDoTrabalho {
  readonly photo_id: string;
}

export type ResultadoDoProcessamento =
  | { readonly tipo: 'pronta'; readonly fotoId: string }
  | { readonly tipo: 'recusada'; readonly fotoId: string; readonly motivo: MotivoDeRecusa }
  /** Já processada antes: o trabalho foi reentregue depois de um reinício. */
  | { readonly tipo: 'ignorada'; readonly fotoId: string };

export async function processarFoto(
  deps: DependenciasDoProcessamento,
  carga: CargaDoTrabalho,
): Promise<ResultadoDoProcessamento> {
  const foto = await deps.repositorio.buscarParaProcessar(carga.photo_id);
  // Foto apagada entre o envio e o processamento é caso normal, não erro: o
  // tutor desistiu. Lançar aqui faria a fila tentar de novo cinco vezes uma
  // linha que não existe mais.
  if (foto === null) return { tipo: 'ignorada', fotoId: carga.photo_id };
  if (foto.status !== 'processing') return { tipo: 'ignorada', fotoId: foto.id };

  // Pode lançar: armazenamento fora do ar é culpa nossa, e a fila adia.
  const original = await deps.armazenamento.get('privado', foto.originalKey);

  const inspecao = await deps.imagens.inspecionar(original);
  if (typeof inspecao === 'string') {
    await deps.repositorio.marcarRecusada(foto.id, TEXTO_DA_RECUSA[inspecao], deps.clock.now());
    return { tipo: 'recusada', fotoId: foto.id, motivo: inspecao };
  }

  const card = await deps.imagens.derivar(original, LARGURA_DO_CARD);
  const thumb = await deps.imagens.derivar(original, LARGURA_DO_THUMB);

  // As chaves carregam 128 bits de CSPRNG e NÃO carregam `pet_id` (ADR-0010
  // item 6): elas viajam em cartaz impresso e em mensagem de grupo.
  const chaveDoCard = chaveDaDerivada('card', deps.ids.random128(), card.extensao);
  const chaveDoThumb = chaveDaDerivada('thumb', deps.ids.random128(), thumb.extensao);

  // As duas subiram ANTES de marcar `ready`. Na ordem inversa existiria uma
  // janela em que a rota pública serviria o endereço de um objeto que ainda
  // não está lá.
  await deps.armazenamento.put('publico', chaveDoCard, card.bytes, card.contentType);
  await deps.armazenamento.put('publico', chaveDoThumb, thumb.bytes, thumb.contentType);

  await deps.repositorio.marcarPronta({
    fotoId: foto.id,
    thumbKey: chaveDoThumb,
    cardKey: chaveDoCard,
    agora: deps.clock.now(),
  });

  return { tipo: 'pronta', fotoId: foto.id };
}
