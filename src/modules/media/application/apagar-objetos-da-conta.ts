/** DESLIGADO EM 17/10. NINGUÉM CHAMA ESTA FUNÇÃO PARA APAGAR NADA. */
import type { UserId } from '../../../shared/types/brands.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';

export interface DependenciasDoApagamentoDeObjetos {
  readonly repositorio: Pick<MediaRepository, 'chavesDaConta'>;
  readonly armazenamento: ObjectStorage;
}

/** A função estreita que o expurgo recebe por injeção. */
export function criarApagadorDeObjetosDaConta(
  deps: DependenciasDoApagamentoDeObjetos,
): (dono: UserId) => Promise<number> {
  return async (dono: UserId): Promise<number> => {
    const objetos = await deps.repositorio.chavesDaConta(dono);
    for (const objeto of objetos) {
      await deps.armazenamento.delete(objeto.classe, objeto.chave);
    }
    return objetos.length;
  };
}
