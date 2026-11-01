import { estadoNoApp } from '../domain/conexao.js';
import type { EstadoNoApp } from '../domain/conexao.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaVivaDoPar, LeitorDeConexao } from '../ports/conexao.js';
import type { ConnectionsRepository } from '../ports/connections-repository.js';

export function criarLeitorDeConexao(repositorio: ConnectionsRepository): LeitorDeConexao {
  return {
    estaConectado: (um: UserId, outro: UserId): Promise<boolean> =>
      repositorio.estaConectado(um, outro),

    contarConexoes: (pessoa: UserId): Promise<number> => repositorio.contarConexoes(pessoa),

    async arestaVivaEntre(
      quemOlha: UserId,
      outro: UserId,
      agora: Instant,
    ): Promise<ArestaVivaDoPar | undefined> {
      if (quemOlha === outro) return undefined;

      const aresta = await repositorio.arestaDoPar(quemOlha, outro, agora);
      if (aresta === undefined) return undefined;

      const estado = estadoNoApp(aresta, agora);
      if (estado === undefined) return undefined;

      return { estado, ref: aresta.ref };
    },

    async estadosPorApelido(
      quemOlha: UserId,
      apelidos: readonly string[],
      agora: Instant,
    ): Promise<ReadonlyMap<string, EstadoNoApp>> {
      if (apelidos.length === 0) return new Map<string, EstadoNoApp>();

      const arestas = await repositorio.arestasPorApelido(quemOlha, apelidos, agora);
      const mapa = new Map<string, EstadoNoApp>();
      for (const { apelido, aresta } of arestas) {
        const estado = estadoNoApp(aresta, agora);
        if (estado === undefined) continue;
        mapa.set(apelido, estado);
      }
      return mapa;
    },
  };
}
