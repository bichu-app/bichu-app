/** As operações do caso de perdido. */
import { problemas } from '../../../shared/http/errors.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import {
  atingiuTetoDaConta,
  bloqueiosParaAbrirCaso,
  rotuloDaArea,
  temOndeSuficiente,
  type Bloqueio,
} from '../domain/abertura-do-caso.js';
import {
  alcanceDe,
  RAIO_DO_ALERTA_EM_METROS,
  type CentroDoAlcance,
  type EstadoDoAlcance,
} from '../domain/previa-do-alcance.js';
import {
  contagemDe,
  estadoInicialDoDisparo,
  podeDispararDeNovo,
  JANELA_DE_24H_EM_MS,
} from '../domain/disparo-do-alerta.js';
import {
  codificarCursorDeCandidato,
  type PosicaoDoCandidato,
} from '../domain/paginacao-de-candidatos.js';
import type { AlcanceCalculado, AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { DisparoGravado, RegistroDeDisparos } from '../ports/registro-de-disparos.js';
import type { JobQueue } from '../../../shared/ports/index.js';
import type {
  CanalDoReencontro,
  CandidatoDecidido,
  CandidatoDoCaso,
  CasoGravado,
  DecisaoDoCandidato,
  DesfechoDoCaso,
  LostCaseRepository,
  PaginaDeCandidatos,
} from '../ports/lost-case-repository.js';
import type {
  CaseId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

/** Quem abre a conversa mediada quando o tutor **confirma** uma correspondência. */
export interface AberturaDeConversaPorCorrespondencia {
  aoConfirmarCorrespondencia(aviso: {
    readonly foundReportId: FoundReportId;
    readonly petId: PetId;
    readonly nomeDoPet: string;
    readonly escaneadoEm: Instant;
    readonly rotuloDaArea: string | null;
    readonly recado: string | null;
    readonly achadorComConta: UserId | null;
    readonly avisoAnteriorId: FoundReportId | null;
  }): Promise<void>;
}

/** BICHUS-66. O que a abertura de caso precisa dizer ao modulo de transferencia. */
export interface AvisoDeCasoAberto {
  cancelarPorCasoAberto(pet: PetId): Promise<void>;
}

export interface DependenciasDeCasos {
  readonly repositorio: LostCaseRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  readonly alcance: AlcanceDoAlerta;
  readonly disparos: RegistroDeDisparos;
  /**
   * A fila. **A API enfileira e o worker envia** (ADR-0001, e a métrica de
   * arquitetura fala em "da abertura ao último push ENFILEIRADO, ≤ 60 s").
   */
  readonly fila: JobQueue;
  /**
   * BICHUS-66. Avisado quando um caso abre, para que a transferencia viva daquele
   * pet caia em vez de consumar no meio da emergencia.
   */
  readonly transferencias: AvisoDeCasoAberto;
  /** BICHUS-86 critério 4. Confirmar abre a conversa; rejeitar não a abre. */
  readonly conversaDaCorrespondencia: AberturaDeConversaPorCorrespondencia;
}

/** O caso e o estado do alerta dele, juntos. */
export interface CasoComAlerta {
  readonly caso: CasoGravado;
  /**
   * `null` só enquanto a linha do disparo não existir (casos abertos antes desta
   * história).
   */
  readonly alerta: DisparoGravado | null;
}

/** `LostCaseReachPreview`, ainda em vocabulário de domínio. */
export interface PreviaDoCaso {
  readonly estadoDoAlcance: EstadoDoAlcance;
  readonly tutoresAlcancaveis: number | null;
  readonly raioEmMetros: number;
  readonly rotuloDaArea: string | null;
  readonly bloqueios: readonly Bloqueio[];
}

export interface EntradaDoCaso {
  /**
   * Já em milissegundos. A conversão de ISO para instante acontece na BORDA, e não
   * aqui: a camada de aplicação não constrói `Date` (regra do relógio injetável), e
   * uma data malformada precisa virar `validation-failed` com o nome do campo antes
   * de chegar a esta função.
   */
  readonly lastSeenAt: Instant;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
  readonly description?: string | undefined;
  readonly shareToPublicList?: boolean | undefined;
}

/** A página de candidatos como ela sai do serviço. */
export interface PaginaDeCandidatosDoCaso {
  readonly items: readonly CandidatoDoCaso[];
  readonly nextCursor: string | null;
}

export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

/** O bloqueio vira o problema que a tela sabe explicar. */
function problemaDoBloqueio(bloqueio: Bloqueio): ReturnType<typeof problemas.naoEncontrado> {
  switch (bloqueio) {
    case 'contact_channel_unverified':
      return problemas.canalDeContatoNaoVerificado();
    case 'pet_photo_missing':
      return problemas.petSemFoto();
    case 'pet_already_lost':
      return problemas.petJaEstaPerdido();
  }
}

export class LostCaseService {
  constructor(private readonly deps: DependenciasDeCasos) {}

  async abrir(
    pet: PetId,
    entrada: EntradaDoCaso,
    chamador: ContextoDoChamador,
  ): Promise<CasoComAlerta> {
    const estado = await this.deps.repositorio.estadoParaAbertura(pet, chamador.userId);
    if (!estado.existeEhDoTutor) throw problemas.naoEncontrado();

    if (atingiuTetoDaConta(estado)) throw problemas.tetoDeCasosAbertos();

    const bloqueios = bloqueiosParaAbrirCaso(estado);
    if (bloqueios.length > 0) throw problemaDoBloqueio(bloqueios[0]!);

    const onde = {
      lat: entrada.lat,
      lon: entrada.lon,
      city: entrada.city,
      neighborhood: entrada.neighborhood,
      state: entrada.state,
    };
    if (!temOndeSuficiente(onde)) {
      throw problemas.validacao([
        {
          field: 'last_seen_area',
          code: 'required',
          message: 'Precisamos do bairro para avisar quem está por perto.',
        },
      ]);
    }

    const caso = await this.deps.repositorio.abrir({
      id: this.deps.ids.uuidv7() as CaseId,
      petId: pet,
      ownerUserId: chamador.userId,
      lastSeenAt: entrada.lastSeenAt,
      lat: entrada.lat,
      lon: entrada.lon,
      city: entrada.city,
      neighborhood: entrada.neighborhood,
      state: entrada.state,
      description: entrada.description,
      shareToPublicList: entrada.shareToPublicList ?? true,
      shareToken: this.deps.ids.opaqueToken(),
    });

    if (caso === null) throw problemas.petJaEstaPerdido();

    await this.deps.transferencias.cancelarPorCasoAberto(pet);

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.opened',
      resourceKind: 'lost_case',
      resourceId: caso.id,
      metadata: { has_location: caso.hasLocation, shared: caso.shareToPublicList },
    });

    return { caso, alerta: await this.pedirOAlerta(caso) };
  }

  /** Registra o disparo e o enfileira — ou registra por que ele não vai existir. */
  private async pedirOAlerta(caso: CasoGravado): Promise<DisparoGravado> {
    const disparo = await this.deps.disparos.abrir({
      id: this.deps.ids.uuidv7(),
      caso: caso.id,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      estado: estadoInicialDoDisparo(caso.hasLocation),
      pedidoEm: this.deps.clock.now(),
    });

    if (disparo.estado === 'queued') {
      await this.deps.fila.enqueue('alert.dispatch', { caseId: caso.id });
    }

    return disparo;
  }

  /** A prévia do alcance, ANTES de abrir o caso (F3.2). */
  async previa(
    pet: PetId,
    centro: CentroDoAlcance | undefined,
    chamador: ContextoDoChamador,
  ): Promise<PreviaDoCaso> {
    const estado = await this.deps.repositorio.estadoParaPrevia(pet, chamador.userId);
    if (!estado.existeEhDoTutor) throw problemas.naoEncontrado();

    const contagem = centro === undefined ? null : contagemDe(await this.calcular(centro, chamador));

    const alcance = alcanceDe(centro, contagem);

    return {
      estadoDoAlcance: alcance.estado,
      tutoresAlcancaveis: alcance.tutoresAlcancaveis,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      rotuloDaArea: centro === undefined ? rotuloDaArea(estado.areaDeReferenciaDoTutor) : null,
      bloqueios: bloqueiosParaAbrirCaso(estado),
    };
  }

  async buscar(caso: CaseId, chamador: ContextoDoChamador): Promise<CasoComAlerta> {
    const achado = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
    if (achado === null) throw problemas.naoEncontrado();
    return { caso: achado, alerta: await this.deps.disparos.ultimoDoCaso(achado.id) };
  }

  /** `GET /v1/lost-cases/{caseId}/candidates`. */
  async candidatos(
    caso: CaseId,
    chamador: ContextoDoChamador,
    pagina: PaginaDeCandidatos,
  ): Promise<PaginaDeCandidatosDoCaso> {
    const doTutor = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
    if (doTutor === null) throw problemas.naoEncontrado();

    const items = await this.deps.repositorio.candidatosDoCaso(caso, chamador.userId, pagina);
    return { items, nextCursor: proximoDosCandidatos(items, pagina.limit) };
  }

  /** `PATCH /v1/lost-cases/{caseId}` — o tutor corrige onde e quando. */
  async atualizar(
    caso: CaseId,
    entrada: EntradaDoCaso,
    chamador: ContextoDoChamador,
  ): Promise<CasoComAlerta> {
    const atualizado = await this.deps.repositorio.atualizarOndeEQuando({
      caso,
      dono: chamador.userId,
      lastSeenAt: entrada.lastSeenAt,
      lat: entrada.lat,
      lon: entrada.lon,
      city: entrada.city,
      neighborhood: entrada.neighborhood,
      state: entrada.state,
      description: entrada.description,
      shareToPublicList: entrada.shareToPublicList,
    });
    if (atualizado === null) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.updated',
      resourceKind: 'lost_case',
      resourceId: atualizado.id,
      metadata: { has_location: atualizado.hasLocation },
    });

    return { caso: atualizado, alerta: await this.deps.disparos.ultimoDoCaso(atualizado.id) };
  }

  /** `POST /v1/lost-cases/{caseId}/alerts` — reenvia o alerta à vizinhança. */
  async reenviarAlerta(caso: CaseId, chamador: ContextoDoChamador): Promise<DisparoGravado> {
    const doTutor = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
    if (doTutor === null || doTutor.status !== 'open') throw problemas.naoEncontrado();

    const agora = this.deps.clock.now();
    const ultimoEnvio = await this.deps.disparos.ultimoEnvioDoCaso(caso);
    if (!podeDispararDeNovo(ultimoEnvio, agora)) {
      const faltam = JANELA_DE_24H_EM_MS - (Number(agora) - Number(ultimoEnvio ?? 0));
      throw problemas.limiteDeChamadas(Math.max(1, Math.ceil(faltam / 1000)));
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.alert_resent',
      resourceKind: 'lost_case',
      resourceId: doTutor.id,
      metadata: { has_location: doTutor.hasLocation },
    });

    return this.pedirOAlerta(doTutor);
  }

  async encerrar(
    caso: CaseId,
    desfecho: DesfechoDoCaso,
    canal: CanalDoReencontro | undefined,
    nota: string | undefined,
    chamador: ContextoDoChamador,
  ): Promise<CasoComAlerta> {
    const encerrado = await this.deps.repositorio.encerrar({
      caso,
      dono: chamador.userId,
      desfecho,
      canal: desfecho === 'reunited' ? canal : undefined,
      nota,
      agora: this.deps.clock.now(),
    });

    if (encerrado === null) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.closed',
      resourceKind: 'lost_case',
      resourceId: encerrado.id,
      metadata: { outcome: desfecho, channel: encerrado.closureChannel },
    });

    return { caso: encerrado, alerta: await this.deps.disparos.ultimoDoCaso(encerrado.id) };
  }

  /** `POST /v1/lost-cases/{caseId}/reopen` — o DESFAZER do encerramento. */
  async reabrir(caso: CaseId, chamador: ContextoDoChamador): Promise<CasoComAlerta> {
    const antes = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);

    const reaberto = await this.deps.repositorio.reabrir({
      caso,
      dono: chamador.userId,
      agora: this.deps.clock.now(),
    });

    if (reaberto === null) {
      const depois = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
      if (depois === null) throw problemas.naoEncontrado();
      if (depois.status === 'open') {
        return { caso: depois, alerta: await this.deps.disparos.ultimoDoCaso(depois.id) };
      }
      const prazo = depois.reopenDeadline;
      if (prazo === null || Number(prazo) <= Number(this.deps.clock.now())) {
        throw problemas.janelaDeReaberturaVencida();
      }
      throw problemas.petJaEstaPerdido();
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.reopened',
      resourceKind: 'lost_case',
      resourceId: reaberto.id,
      metadata: {
        undone_outcome: antes?.closureOutcome ?? null,
        reopen_deadline: antes?.reopenDeadline?.toISOString() ?? null,
      },
    });

    return { caso: reaberto, alerta: await this.deps.disparos.ultimoDoCaso(reaberto.id) };
  }

  /** `POST /v1/lost-cases/{caseId}/candidates/{candidateId}/decision`. */
  async decidirCandidato(
    caso: CaseId,
    candidato: string,
    decisao: DecisaoDoCandidato,
    chamador: ContextoDoChamador,
  ): Promise<CandidatoDecidido> {
    const decidido = await this.deps.repositorio.decidirCandidato({
      caso,
      candidato,
      dono: chamador.userId,
      decisao,
      agora: this.deps.clock.now(),
    });

    if (decidido === null) return this.reenvioDaFila(caso, candidato, decisao, chamador);

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'match.candidate_decided',
      resourceKind: 'match_candidate',
      resourceId: decidido.id,
      metadata: {
        case_id: decidido.caseId,
        decision: decisao,
        link_origin: decidido.linkOrigin,
      },
    });

    if (decisao === 'confirmed') {
      await this.deps.conversaDaCorrespondencia.aoConfirmarCorrespondencia({
        foundReportId: decidido.foundReportId,
        petId: decidido.petId,
        nomeDoPet: decidido.nomeDoPet,
        escaneadoEm: decidido.achado.achadoEm.getTime() as Instant,
        rotuloDaArea: rotuloDaArea({
          city: decidido.achado.cidade ?? undefined,
          neighborhood: decidido.achado.bairro ?? undefined,
        }),
        recado: decidido.achado.observacao,
        achadorComConta: decidido.relatorUserId,
        avisoAnteriorId: null,
      });
    }

    return decidido;
  }

  /** O reenvio da mesma decisão, e só dele. */
  private async reenvioDaFila(
    caso: CaseId,
    candidato: string,
    decisao: DecisaoDoCandidato,
    chamador: ContextoDoChamador,
  ): Promise<CandidatoDecidido> {
    const jaDecidido = await this.deps.repositorio.candidatoDecididoDoTutor(
      caso,
      candidato,
      chamador.userId,
    );
    if (jaDecidido === null || jaDecidido.status !== decisao) throw problemas.naoEncontrado();
    return jaDecidido;
  }

  /** O alcance da prévia, com a falha traduzida em `null`. */
  private async calcular(
    centro: CentroDoAlcance,
    chamador: ContextoDoChamador,
  ): Promise<AlcanceCalculado | null> {
    try {
      return await this.deps.alcance.alcancaveis({
        centro,
        raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
        excluir: chamador.userId,
        agora: this.deps.clock.now(),
      });
    } catch (erro: unknown) {
      console.error(
        JSON.stringify({
          evento: 'lost_case.reach_failed',
          correlation_id: chamador.correlationId,
          erro: String(erro),
        }),
      );
      return null;
    }
  }
}

/** O cursor da próxima página de candidatos, ou `null`. */
function proximoDosCandidatos(
  items: readonly CandidatoDoCaso[],
  limite: number,
): string | null {
  if (items.length < limite) return null;
  const ultimo = items[items.length - 1];
  if (ultimo === undefined) return null;
  const posicao: PosicaoDoCandidato = { score: ultimo.score, id: ultimo.id };
  return codificarCursorDeCandidato(posicao);
}
