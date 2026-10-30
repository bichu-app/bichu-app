/** O disparo do alerta de 5 km (BICHUS-18), do lado do worker. */
import {
  contagemDe,
  podeDispararDeNovo,
  type EstadoDoDisparo,
} from '../domain/disparo-do-alerta.js';
import { RAIO_DO_ALERTA_EM_METROS } from '../domain/previa-do-alcance.js';
import type { AlcanceCalculado, AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { EntregaDoAlerta } from '../ports/entrega-do-alerta.js';
import type { RegistroDeDisparos } from '../ports/registro-de-disparos.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { CaseId, UserId } from '../../../shared/types/brands.js';

/** De onde sai a URL pública da foto. */
export type UrlDeMidia = (chave: string) => string;

export interface DependenciasDoDisparo {
  readonly disparos: RegistroDeDisparos;
  readonly alcance: AlcanceDoAlerta;
  readonly entrega: EntregaDoAlerta;
  readonly clock: Clock;
  readonly urlDeMidia: UrlDeMidia;
}

/** Por que o disparo não saiu, quando não saiu. */
export type DesfechoDoDisparo =
  /** Rodou. `estado` diz se foi `computed` ou `unavailable`. */
  | { readonly tipo: 'rodou'; readonly estado: EstadoDoDisparo; readonly avisados: number }
  /** O caso sumiu entre o enfileiramento e a execução. */
  | { readonly tipo: 'casoInexistente' }
  /** O caso foi encerrado: o animal voltou, ou a busca acabou. */
  | { readonly tipo: 'casoEncerrado' }
  /** Sem coordenada não há raio. */
  | { readonly tipo: 'semCentro' }
  /** O critério 7: este caso já avisou a vizinhança nas últimas 24 h. */
  | { readonly tipo: 'jaDisparou' }
  /** Não há linha de disparo para este caso: nada foi pedido. */
  | { readonly tipo: 'semDisparoPendente' };

export class DisparoDoAlertaService {
  constructor(private readonly deps: DependenciasDoDisparo) {}

  async disparar(caso: CaseId): Promise<DesfechoDoDisparo> {
    const contexto = await this.deps.disparos.contextoDoCaso(caso);
    if (contexto === null) return { tipo: 'casoInexistente' };
    if (!contexto.aberto) return { tipo: 'casoEncerrado' };

    const disparo = await this.deps.disparos.ultimoDoCaso(caso);
    if (disparo === null) return { tipo: 'semDisparoPendente' };

    const agora = this.deps.clock.now();

    const ultimoEnvio = await this.deps.disparos.ultimoEnvioDoCaso(caso);
    if (!podeDispararDeNovo(ultimoEnvio, agora)) return { tipo: 'jaDisparou' };

    if (contexto.centro === undefined) return { tipo: 'semCentro' };

    const alcance = await this.calcular({
      centro: contexto.centro,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      excluir: contexto.tutor,
      agora,
    });

    if (alcance === null) {
      await this.deps.disparos.concluir({
        id: disparo.id,
        estado: 'unavailable',
        tetoAtingido: false,
        avisados: [],
        enviadoEm: agora,
      });
      return { tipo: 'rodou', estado: 'unavailable', avisados: 0 };
    }

    const avisados: UserId[] = alcance.destinatarios.map((d) => d.usuario);

    await this.deps.disparos.concluir({
      id: disparo.id,
      estado: 'computed',
      tetoAtingido: alcance.tetoAtingido,
      avisados,
      enviadoEm: agora,
    });

    const imagemUrl =
      contexto.fotoKey === null ? undefined : this.deps.urlDeMidia(contexto.fotoKey);

    for (const destinatario of alcance.destinatarios) {
      for (const aparelho of destinatario.aparelhos) {
        await this.deps.entrega.avisar({
          aparelhoId: aparelho,
          nomeDoPet: contexto.nomeDoPet,
          especieCodigo: contexto.especie,
          bairro: contexto.bairro,
          tokenPublico: contexto.tokenPublico,
          imagemUrl,
        });
      }
    }

    return { tipo: 'rodou', estado: 'computed', avisados: contagemDe(alcance) ?? 0 };
  }

  /** A consulta, com a falha traduzida em `null`. */
  private async calcular(consulta: {
    centro: { lat: number; lon: number };
    raioEmMetros: number;
    excluir: UserId;
    agora: ReturnType<Clock['now']>;
  }): Promise<AlcanceCalculado | null> {
    try {
      return await this.deps.alcance.alcancaveis(consulta);
    } catch (erro: unknown) {
      console.error(
        JSON.stringify({ evento: 'alert.reach_failed', erro: String(erro) }),
      );
      return null;
    }
  }
}
