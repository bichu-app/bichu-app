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

/**
 * O texto que vai para a tela, por motivo. Não é código de erro.
 *
 * Ele existia e **não chegava a ninguém**: `pet_photos.rejection_reason` era
 * gravado aqui e o contrato não tinha o campo, então a tela dizia "recusada"
 * sem dizer por quê. O campo entrou em `PetPhoto` nesta entrega.
 */
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

/** O que cada derivada custou. Vai para o log do worker, nunca para resposta. */
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

  // A DIMENSÃO MÍNIMA, que não existia: uma foto de 100 x 100 virava cartaz
  // impresso borrado, porque `withoutEnlargement` (com razão) não amplia. É
  // recusa final, com o número no texto, e vem depois do teto de megapixels
  // para que a foto grande demais continue recebendo o motivo dela.
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

  // UMA POR VEZ, e o laço é sequencial de propósito: cada `derivar` decodifica
  // o original, e decodificar em paralelo é como este worker morreu antes.
  const geradas = new Map<string, { chave: ObjectKey; derivada: Derivada }>();
  for (const especificacao of DERIVADAS_DA_FOTO_DE_PET) {
    const derivada = await deps.imagens.derivar(original, {
      largura: especificacao.largura,
      ...(especificacao.altura === undefined ? {} : { altura: especificacao.altura }),
      escada: escadaDo(especificacao.porte),
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    // O decodificador desistiu depois de o cabeçalho ter aberto: culpa do
    // arquivo, recusa final. Sem isto o trabalho lançava e a fila tentava cinco
    // vezes a mesma foto que nunca vai abrir.
    if (typeof derivada === 'string') {
      await deps.repositorio.marcarRecusada(foto.id, TEXTO_DA_RECUSA[derivada], deps.clock.now());
      return { tipo: 'recusada', fotoId: foto.id, motivo: derivada };
    }
    // As chaves carregam 128 bits de CSPRNG e NÃO carregam `pet_id` (ADR-0010
    // item 6): elas viajam em cartaz impresso e em mensagem de grupo.
    const chave = chaveDaDerivada(
      especificacao.variante,
      deps.ids.random128(),
      derivada.extensao,
      'pets',
    );
    // Sobe ANTES de marcar `ready`. Na ordem inversa existiria uma janela em
    // que a rota pública serviria o endereço de um objeto que ainda não está lá.
    await deps.armazenamento.put('publico', chave, derivada.bytes, derivada.contentType);
    geradas.set(especificacao.variante, { chave, derivada });
  }

  const card = geradas.get('card');
  const thumb = geradas.get('thumb');
  // Falha ruidosa: `DERIVADAS_DA_FOTO_DE_PET` declara as duas, e uma ausência
  // aqui é a lista editada sem o resto. Gravar `null` em silêncio faria a foto
  // ficar `ready` sem URL, que é o estado que o app não sabe explicar.
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
    // O que o log registra, e é o que se audita quando alguém perguntar se o
    // teto do cliente está sendo respeitado de verdade.
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
