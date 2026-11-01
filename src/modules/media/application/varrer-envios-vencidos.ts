import type { Clock } from '../../../shared/ports/index.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import { eDoAchado } from '../ports/fotos-do-achado.js';

const POR_RODADA = 50;

export interface DependenciasDaVarredura {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly clock: Clock;
}

export interface ResultadoDaVarredura {
  readonly examinadas: number;
  readonly removidas: number;
  readonly falhas: number;
  /** Quantas a guarda recusou por serem informação de achado. */
  readonly protegidas: number;
}

export async function varrerEnviosVencidos(
  deps: DependenciasDaVarredura,
): Promise<ResultadoDaVarredura> {
  const agora = deps.clock.now();
  const vencidas = await deps.repositorio.listarIntencoesVencidas(agora, POR_RODADA);

  let removidas = 0;
  let falhas = 0;
  let protegidas = 0;

  for (const intencao of vencidas) {
    if (eDoAchado(intencao.kind)) {
      protegidas += 1;
      continue;
    }
    try {
      await deps.armazenamento.delete('privado', intencao.objectKey);
      await deps.repositorio.descartarIntencao(intencao.id);
      removidas += 1;
    } catch {
      falhas += 1;
    }
  }

  return { examinadas: vencidas.length, removidas, falhas, protegidas };
}
