import type { AuditAction, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock } from '../../../shared/ports/index.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { EmissorDeConvite } from '../ports/convite-de-conexao.js';
import type { ContextoDoChamador } from './conexao-entre-pessoas.js';

type AcaoDoConvite = Extract<AuditAction, `connection.invite.${string}`>;

/** O convite, no vocabulário do contrato. */
export interface ConviteProjetado {
  /** O token em claro — **a única vez em que ele existe**. */
  readonly invite_token: string;
  /** Quando ele para de resolver, em ISO-8601. */
  readonly expires_at: string;
}

export interface DependenciasDoConviteDoPerfil {
  readonly convites: EmissorDeConvite;
  readonly trilha: AuditLog;
  readonly clock: Clock;
}

export class ConviteDoPerfil {
  constructor(private readonly deps: DependenciasDoConviteDoPerfil) {}

  /** Emitir o convite do próprio perfil, **revogando o anterior**. */
  async emitir(contexto: ContextoDoChamador): Promise<ConviteProjetado> {
    const agora = this.deps.clock.now();
    const emitido = await this.deps.convites.emitir(contexto.userId, agora);
    await this.registrar(contexto, 'connection.invite.issued');
    return { invite_token: emitido.token, expires_at: comoIso(emitido.expiraEm) };
  }

  /** Revogar o convite ativo. */
  async revogar(contexto: ContextoDoChamador): Promise<void> {
    const agora = this.deps.clock.now();
    await this.deps.convites.revogar(contexto.userId, agora);
    await this.registrar(contexto, 'connection.invite.revoked');
  }

  private async registrar(contexto: ContextoDoChamador, acao: AcaoDoConvite): Promise<void> {
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: contexto.userId,
      action: acao,
      resourceKind: 'user',
      resourceId: contexto.userId,
      correlationId: contexto.correlationId,
      ...(contexto.ip === undefined ? {} : { actorIp: contexto.ip }),
      metadata: {},
    });
  }
}
