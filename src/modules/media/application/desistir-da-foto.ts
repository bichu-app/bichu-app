/**
 * O que acontece com a foto quando o trabalho dela não tem mais tentativa.
 *
 * ## O silêncio que isto existe para quebrar
 *
 * `processarFoto` cobre dois desfechos e os cobre bem: a foto fica pronta, ou é
 * recusada com motivo. O que ele não cobre — porque não pode — é o desfecho em
 * que **ele nunca chega ao fim**: o processo morre no meio da decodificação, e
 * então não há `marcarPronta`, não há `marcarRecusada`, e não há exceção para
 * ninguém tratar. A linha fica `processing`.
 *
 * E `processing` não tem saída própria. `claim` só olha `pending`; a foto fica
 * "processando" na tela do tutor para sempre, sem erro, sem alarme e sem
 * ninguém tentando de novo. É a pior forma de errar aqui, e é a mesma que a
 * BICHUS-245 registrou no estado `upload-not-received`: a promessa continua na
 * tela e o sistema parou de honrá-la.
 *
 * ## Por que `rejected` e não um estado novo
 *
 * O contrato declara `processing | ready | rejected` para `PetPhoto.status`, e
 * `rejected` já significa exatamente o que precisa ser dito: **acabou, e não
 * volta para a fila**. Um quarto valor seria um valor novo num enum público, que
 * é o que o app não sabe desenhar — e a razão pela qual ele não é necessário é
 * que a distinção que interessa ao tutor ("adianta tentar de novo?") já é a
 * mesma nos dois casos: não adianta.
 *
 * O que muda é o MOTIVO, e ele é honesto: as três recusas de `processarFoto`
 * culpam o arquivo, e esta não. Foto boa, defeito nosso — e o texto diz isso sem
 * mentir para o tutor e sem convidá-lo a reenviar a mesma foto que derrubou o
 * processamento duas vezes.
 *
 * ## A foto que escapa, e ela escapa de propósito
 *
 * `marcarRecusada` só age sobre `status = 'processing'`. Se o processo morreu
 * DEPOIS de `marcarPronta` e antes de `fila.complete`, a foto está `ready` e
 * este caminho não a toca. Recusar uma foto pronta apagaria da tela uma imagem
 * que já está no balde público e servindo.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { MediaRepository } from '../ports/media-repository.js';

/**
 * O texto que vai para `rejection_reason`, e dele para quem investiga.
 *
 * Não culpa o arquivo, porque não foi ele: as outras três recusas ("não é uma
 * foto que a gente consiga abrir", "grande demais", "chegou incompleta")
 * descrevem o envio, e esta descreve o processamento. Dizer "escolha outra" aqui
 * seria empurrar para o tutor a conta de um defeito nosso.
 */
export const TEXTO_DO_PROCESSAMENTO_INTERROMPIDO =
  'Não conseguimos processar essa foto. O problema foi nosso, não do arquivo.';

export interface DependenciasDaDesistencia {
  readonly repositorio: MediaRepository;
  readonly clock: Clock;
}

export interface CargaDoTrabalhoDeFoto {
  readonly photo_id: string;
}

/**
 * `true` quando a foto saiu de `processing` por esta chamada.
 *
 * O booleano existe para o chamador poder registrar a diferença: `false`
 * significa que a foto já tinha desfecho (pronta, recusada, ou apagada pelo
 * tutor), e isso é normal, não falha.
 */
export async function desistirDaFoto(
  deps: DependenciasDaDesistencia,
  carga: CargaDoTrabalhoDeFoto,
): Promise<boolean> {
  const foto = await deps.repositorio.buscarParaProcessar(carga.photo_id);
  if (foto === null) return false;
  if (foto.status !== 'processing') return false;

  await deps.repositorio.marcarRecusada(
    foto.id,
    TEXTO_DO_PROCESSAMENTO_INTERROMPIDO,
    deps.clock.now(),
  );
  return true;
}
