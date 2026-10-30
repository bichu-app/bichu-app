/** O serviço da localização de referência: gravar, ler e apagar. */
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import {
  localizacaoAGravar,
  type Coordenada,
  type LocalizacaoDeReferencia,
  type OrigemDaLocalizacao,
} from '../domain/localizacao-de-referencia.js';
import type {
  FamiliaDeSessao,
  LocalizacaoDeReferenciaRepository,
} from '../ports/localizacao-de-referencia-repository.js';

export interface ChamadorDaLocalizacao {
  readonly userId: UserId;
  /**
   * SEC-021: a sessão de aparelho de quem está chamando — o `sid` do token de acesso
   * (ADR-0002, emenda 1).
   */
  readonly familia: FamiliaDeSessao;
  readonly correlationId: string;
  readonly ip?: string | undefined;
}

export interface DependenciasDaLocalizacao {
  readonly repositorio: LocalizacaoDeReferenciaRepository;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class LocalizacaoDeReferenciaService {
  constructor(private readonly deps: DependenciasDaLocalizacao) {}

  /** Grava a localização informada, substituindo a anterior. */
  async informar(
    chamador: ChamadorDaLocalizacao,
    bruta: Coordenada,
    origem: OrigemDaLocalizacao,
  ): Promise<LocalizacaoDeReferencia> {
    const localizacao = localizacaoAGravar(bruta, origem, this.deps.clock.now());
    await this.deps.repositorio.gravar(chamador.userId, chamador.familia, localizacao);
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'privacy.reference_location_set',
      actorUserId: chamador.userId,
      resourceKind: 'user',
      resourceId: chamador.userId,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { source: origem, precision_m: localizacao.precisaoEmMetros },
    });
    return localizacao;
  }

  /**
   * A localização ainda válida **deste aparelho**, ou `null` quando este aparelho
   * nunca informou uma, ou informou e ela venceu.
   */
  atual(chamador: ChamadorDaLocalizacao): Promise<LocalizacaoDeReferencia | null> {
    return this.deps.repositorio.buscarValida(
      chamador.userId,
      chamador.familia,
      this.deps.clock.now(),
    );
  }

  /** Sai do raio de alerta. */
  async esquecer(chamador: ChamadorDaLocalizacao): Promise<void> {
    await this.deps.repositorio.apagar(chamador.userId, chamador.familia);
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'privacy.reference_location_cleared',
      actorUserId: chamador.userId,
      resourceKind: 'user',
      resourceId: chamador.userId,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });
  }
}
