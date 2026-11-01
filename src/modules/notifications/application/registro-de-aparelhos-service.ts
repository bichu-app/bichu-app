import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Aparelho, MotivoDaRevogacao, RegistroDeAparelho } from '../domain/aparelho.js';
import type { RegistroDeAparelhos } from '../ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';

export interface ChamadorDoAparelho {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip?: string | undefined;
}

export interface DependenciasDoRegistroDeAparelhos {
  readonly repositorio: RegistroDeAparelhos;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class RegistroDeAparelhosService {
  constructor(private readonly deps: DependenciasDoRegistroDeAparelhos) {}

  /** Registra ou atualiza o aparelho do chamador. */
  async registrar(
    chamador: ChamadorDoAparelho,
    entrada: RegistroDeAparelho,
  ): Promise<Aparelho> {
    const agora = this.deps.clock.now();
    const { aparelho, reivindicadoDe } = await this.deps.repositorio.registrar(
      chamador.userId,
      entrada,
      agora,
    );

    if (reivindicadoDe !== null) {
      await this.registrarRevogacao(
        { ...aparelho, dono: reivindicadoDe },
        'reclaimed_by_other_account',
        { actorKind: 'user', actorUserId: chamador.userId, ...this.contexto(chamador) },
      );
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'device.registered',
      actorUserId: chamador.userId,
      resourceKind: 'device',
      resourceId: aparelho.id,
      ...this.contexto(chamador),
      metadata: {
        platform: aparelho.plataforma,
        push_permission: aparelho.permissao,
        has_push_token: aparelho.pushToken !== null,
      },
    });
    return aparelho;
  }

  /** Os aparelhos do chamador, para o Perfil (critério 5). */
  listar(chamador: ChamadorDoAparelho): Promise<readonly Aparelho[]> {
    return this.deps.repositorio.listarDoDono(chamador.userId);
  }

  /** Remove um aparelho do chamador. */
  async remover(chamador: ChamadorDoAparelho, aparelhoId: string): Promise<boolean> {
    const revogado = await this.deps.repositorio.revogarDoDono(chamador.userId, aparelhoId);
    if (revogado === null) return false;
    await this.registrarRevogacao(revogado, 'user_removed', {
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...this.contexto(chamador),
    });
    return true;
  }

  /** Todos os aparelhos da conta saem, porque a identidade revogou tudo (SEC-019). */
  removerTodosDaConta(dono: UserId): Promise<number> {
    return this.deps.repositorio.revogarTodosDoDono(dono);
  }

  /** O FCM recusou este token: o aparelho sai agora (critério 4). */
  async revogarPorTokenRecusado(token: TokenDeAparelho, correlationId?: string): Promise<boolean> {
    const revogado = await this.deps.repositorio.revogarPorToken(token);
    if (revogado === null) return false;
    await this.registrarRevogacao(revogado, 'token_rejected', {
      actorKind: 'system',
      ...(correlationId === undefined ? {} : { correlationId }),
    });
    return true;
  }

  /** Dois dos sete critérios do ADR-0006, sobre candidatos que alguém já filtrou. */
  contasAlcancaveisPorPush(candidatos: readonly UserId[]): Promise<ReadonlySet<UserId>> {
    return this.deps.repositorio.contasAlcancaveisPorPush(candidatos);
  }

  /** O token, relido no instante do envio. */
  enderecoDeEnvio(aparelhoId: string): Promise<TokenDeAparelho | null> {
    return this.deps.repositorio.enderecoDeEnvio(aparelhoId);
  }

  private contexto(chamador: ChamadorDoAparelho): {
    correlationId: string;
    actorIp?: string | undefined;
  } {
    return { correlationId: chamador.correlationId, actorIp: chamador.ip };
  }

  /** A gravação da revogação, num lugar só. */
  private registrarRevogacao(
    aparelho: Aparelho,
    motivo: MotivoDaRevogacao,
    ator:
      | { actorKind: 'user'; actorUserId: UserId; correlationId: string; actorIp?: string | undefined }
      | { actorKind: 'system'; correlationId?: string | undefined },
  ): Promise<void> {
    return this.deps.trilha.record({
      ...ator,
      action: 'device.revoked',
      resourceKind: 'device',
      resourceId: aparelho.id,
      metadata: {
        reason: motivo,
        platform: aparelho.plataforma,
        owner_user_id: aparelho.dono,
      },
    });
  }
}
