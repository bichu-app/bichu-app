import type { Clock } from '../../../shared/ports/index.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  validarDenuncia,
  type AlvoDaDenuncia,
} from '../domain/motivos-da-denuncia.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type {
  DesfechoDaEscrita,
  PaginaDeBloqueios,
  SafetyRepository,
} from '../ports/safety-repository.js';

export interface DependenciasDaSeguranca {
  readonly repositorio: SafetyRepository;
  readonly trilha: AuditLog;
  readonly clock: Clock;
}

/** Quem escreve, e de onde. */
export interface AutorDoAto {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

export type DesfechoDaDenuncia =
  | { readonly tipo: 'enfileirada' }
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'eu_mesmo' }
  | { readonly tipo: 'invalida'; readonly erros: readonly ProblemFieldError[] };

export class SegurancaDaComunidade {
  constructor(private readonly deps: DependenciasDaSeguranca) {}

  /** **QUEM EU BLOQUEEI** (19/10/2026). */
  quemEuBloqueei(
    autor: AutorDoAto,
    pagina: { readonly page: number; readonly limit: number },
  ): Promise<PaginaDeBloqueios> {
    return this.deps.repositorio.quemEuBloqueei(autor.userId, pagina);
  }

  async bloquear(autor: AutorDoAto, alvo: string): Promise<DesfechoDaEscrita> {
    const desfecho = await this.deps.repositorio.bloquear(
      autor.userId,
      alvo,
      this.deps.clock.now(),
    );
    if (desfecho === 'feito') {
      await this.deps.trilha.record({
        actorKind: 'user',
        actorUserId: autor.userId,
        actorIp: autor.ip,
        correlationId: autor.correlationId,
        action: 'user_block.created',
        resourceKind: 'user_block',
        resourceId: alvo,
      });
    }
    return desfecho;
  }

  async desbloquear(autor: AutorDoAto, alvo: string): Promise<DesfechoDaEscrita> {
    const desfecho = await this.deps.repositorio.desbloquear(autor.userId, alvo);
    if (desfecho === 'feito') {
      await this.deps.trilha.record({
        actorKind: 'user',
        actorUserId: autor.userId,
        actorIp: autor.ip,
        correlationId: autor.correlationId,
        action: 'user_block.removed',
        resourceKind: 'user_block',
        resourceId: alvo,
      });
    }
    return desfecho;
  }

  /** Denuncia, nos três alvos, por um caminho só. */
  async denunciar(
    autor: AutorDoAto,
    alvo: AlvoDaDenuncia,
    enderecoDoAlvo: string,
    corpo: unknown,
  ): Promise<DesfechoDaDenuncia> {
    const { denuncia, erros } = validarDenuncia(alvo, corpo);
    if (denuncia === undefined) return { tipo: 'invalida', erros };

    const agora = this.deps.clock.now();
    const escrever = {
      profile: () =>
        this.deps.repositorio.denunciarPerfil(autor.userId, enderecoDoAlvo, denuncia, agora),
      photo: () =>
        this.deps.repositorio.denunciarFoto(autor.userId, enderecoDoAlvo, denuncia, agora),
      publication: () =>
        this.deps.repositorio.denunciarPublicacao(autor.userId, enderecoDoAlvo, denuncia, agora),
    }[alvo];

    const desfecho = await escrever();
    if (desfecho === 'ausente') return { tipo: 'ausente' };
    if (desfecho === 'eu_mesmo') return { tipo: 'eu_mesmo' };

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action: 'content_report.created',
      resourceKind: `${alvo}_report`,
      resourceId: enderecoDoAlvo,
      metadata: { target: alvo, reason: denuncia.motivo },
    });

    return { tipo: 'enfileirada' };
  }
}
