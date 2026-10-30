/** BICHUS-278 -- o servico dos contadores das abas `Pets` e `Rede`. */
import type { Clock } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ContagemDePerdidosNovos } from '../../lostfound/ports/contagem-de-perdidos-novos.js';
import type { ContagemDeEventosNovos } from '../../network/ports/contagem-de-eventos-novos.js';
import type { ContagemDeEntradasNovas } from '../../professionals/ports/contagem-de-entradas-novas.js';
import type { ContadoresDeSecao } from '../ports/contadores-de-secao.js';
import type { MarcadoresDeSecao, SecaoComContador } from '../ports/marcadores-de-secao.js';

export interface ChamadorDosContadores {
  readonly userId: UserId;
}

export interface DependenciasDosContadores {
  readonly marcadores: MarcadoresDeSecao;
  readonly perdidos: ContagemDePerdidosNovos;
  readonly eventos: ContagemDeEventosNovos;
  readonly diretorio: ContagemDeEntradasNovas;
  readonly clock: Clock;
}

export interface ContadoresDeSecaoService {
  contar(chamador: ChamadorDosContadores, cidade?: string): Promise<ContadoresDeSecao>;
  marcarVista(
    chamador: ChamadorDosContadores,
    secao: SecaoComContador,
    cidade?: string,
  ): Promise<ContadoresDeSecao>;
}

export function criarContadoresDeSecaoService(
  deps: DependenciasDosContadores,
): ContadoresDeSecaoService {
  /**
   * As tres contagens, **em paralelo**: sao tres consultas independentes, e
   * serializa-las triplicaria a espera do primeiro desenho da barra sem economizar
   * consulta nenhuma.
   */
  async function compor(
    chamador: UserId,
    agora: Instant,
    cidade: string | undefined,
  ): Promise<ContadoresDeSecao> {
    const vistas = await deps.marcadores.ler(chamador);
    const [perdidosNovos, eventosNovos, profissionaisNovos] = await Promise.all([
      deps.perdidos.contar({
        agora,
        ...(cidade === undefined ? {} : { cidade }),
        ...(vistas.pets === undefined ? {} : { desde: vistas.pets }),
      }),
      deps.eventos.contar({
        agora,
        ...(vistas.network_events === undefined ? {} : { desde: vistas.network_events }),
      }),
      deps.diretorio.contar({
        chamador,
        agora,
        ...(vistas.network_directory === undefined
          ? {}
          : { desde: vistas.network_directory }),
      }),
    ]);
    return { perdidosNovos, eventosNovos, profissionaisNovos };
  }

  return {
    contar(chamador, cidade) {
      return compor(chamador.userId, deps.clock.now(), cidade);
    },

    async marcarVista(chamador, secao, cidade) {
      const agora = deps.clock.now();
      await deps.marcadores.marcarVista(chamador.userId, secao, agora);
      return compor(chamador.userId, agora, cidade);
    },
  };
}
