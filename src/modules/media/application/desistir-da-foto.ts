/** O que acontece com a foto quando o trabalho dela não tem mais tentativa. */
import type { Clock } from '../../../shared/ports/index.js';
import type { MediaRepository } from '../ports/media-repository.js';

/** O texto que vai para `rejection_reason`, e dele para quem investiga. */
export const TEXTO_DO_PROCESSAMENTO_INTERROMPIDO =
  'Não conseguimos processar essa foto. O problema foi nosso, não do arquivo.';

export interface DependenciasDaDesistencia {
  readonly repositorio: MediaRepository;
  readonly clock: Clock;
}

export interface CargaDoTrabalhoDeFoto {
  readonly photo_id: string;
}

/** `true` quando a foto saiu de `processing` por esta chamada. */
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
