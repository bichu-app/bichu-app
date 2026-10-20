/**
 * BICHUS-278 -- o servico dos contadores das abas `Pets` e `Rede`.
 *
 * ## ESTE ARQUIVO E O LUGAR DA COMPOSICAO, e e so isso que ele e
 *
 * As tres contagens sao de TRES MODULOS diferentes -- `lostfound`, `network` e
 * `professionals` --, cada uma por tras da porta do modulo que tem a tabela. O
 * que sobra aqui e o que nenhum deles pode fazer: ler o marcador de "ja vi" de
 * cada area e compor os tres numeros num objeto.
 *
 * **A primeira versao deste modulo fazia as tres consultas aqui**, importando
 * os construtores direto de `adapters/persistence/` dos outros tres. A
 * fronteira de modulo reprovou, e com razao: `sections` alcancando `adapters`
 * alheio e `sections` que quebra quando qualquer um dos tres mexe na
 * persistencia. O desenho que saiu da reprovacao e melhor, e nao so legal --
 * cada contagem ficou **ao lado da listagem com que ela tem de concordar**, e
 * quem mexer nos predicados de publicacao ve a contagem no mesmo arquivo.
 *
 * ## POR QUE A ESCRITA DEVOLVE OS CONTADORES
 *
 * `markNotificationsListSeen` responde 204, e tem razao escrita: lá o numero
 * depois de "vista" **nao e necessariamente zero** (`tag_scanned` e
 * `found_reported` atravessam o zero), e devolver um numero faria a tela
 * acreditar no que ela acabou de zerar.
 *
 * Nenhuma das tres areas daqui tem excecao desse tipo -- medido: o que a aba
 * `Pets` conta e o que `listPublicLostPets` devolve, e as duas sub-abas da
 * `Rede` contam o que as duas listagens devolvem. Mesmo assim **quem decide o
 * numero continua sendo o servidor**, e e por isso a resposta com corpo em vez
 * de 204: as duas alternativas sao piores.
 *
 *   * o app escrever zero local e ADIVINHACAO, e divergiria no dia em que uma
 *     excecao nascer -- foi exatamente o erro que a primeira versao de
 *     `marcarMensagensVistas` cometeu e que a medicao do `WHERE` desmentiu;
 *   * o app chamar `getSectionCounters` depois custa **uma viagem a mais por
 *     visita a area**, que e o preco que o contador de mensagens paga hoje.
 *
 * A ordem importa e esta aqui: **grava, depois conta.** Contar antes devolveria
 * o numero de antes, que e o defeito que `marcarMensagensVistas` descreve.
 */
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
   * serializa-las triplicaria a espera do primeiro desenho da barra sem
   * economizar consulta nenhuma.
   *
   * `cidade` recorta **so** os perdidos. As duas sub-abas da `Rede` abrem SEM
   * cidade, e recortar a contagem delas por uma cidade que a lista nao aplica
   * faria o selo discordar da tela.
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
      // O MESMO `agora` das duas operacoes, e nao dois `clock.now()`: com dois
      // instantes, um item publicado no intervalo entre a escrita e a contagem
      // sairia da contagem sem nunca ter sido visto.
      return compor(chamador.userId, agora, cidade);
    },
  };
}
