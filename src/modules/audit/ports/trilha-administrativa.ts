/** O evento de trilha de uma operacao administrativa, montado de um jeito so. */
import type { AdminAccountId } from '../../../shared/types/brands.js';
import {
  ACOES_ADMINISTRATIVAS,
  type AcaoAdministrativa,
  type AuditEvent,
} from './audit-log.js';

/** Quem agiu, como a guarda do prefixo o identificou. */
export interface AtorAdministrativo {
  /** `admin_accounts.id`, que vai em `actor_admin_id` e nunca em `actor_user_id`. */
  readonly adminAccountId: AdminAccountId;
  readonly ip: string | undefined;
  readonly correlationId: string;
  /** Oito primeiros bytes do SHA-256 da sessao, em hexadecimal. */
  readonly sessao: string;
}

/** O `x-audit` da operacao, como a rota o declara. */
export interface DeclaracaoDeTrilha {
  readonly action: string;
  readonly resourceKind: string;
}

export interface DadosDoEvento {
  /** O `id` INTERNO do recurso, nunca o `slug` (ADR-0027 item 8). */
  readonly resourceId: string;
  readonly before?: Record<string, unknown> | undefined;
  readonly after?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

const ACOES: ReadonlySet<string> = new Set(ACOES_ADMINISTRATIVAS);

export function ehAcaoAdministrativa(valor: string): valor is AcaoAdministrativa {
  return ACOES.has(valor);
}

export function eventoAdministrativo(
  declaracao: DeclaracaoDeTrilha,
  ator: AtorAdministrativo,
  dados: DadosDoEvento,
): AuditEvent {
  if (!ehAcaoAdministrativa(declaracao.action)) {
    throw new Error(
      `A acao de trilha '${declaracao.action}' nao esta em ACOES_ADMINISTRATIVAS ` +
        '(src/modules/audit/ports/audit-log.ts). Acao nova entra la e no x-audit do contrato, ' +
        'no mesmo commit.',
    );
  }
  return {
    actorKind: 'admin',
    actorAdminId: ator.adminAccountId,
    actorIp: ator.ip,
    correlationId: ator.correlationId,
    action: declaracao.action,
    resourceKind: declaracao.resourceKind,
    resourceId: dados.resourceId,
    before: dados.before,
    after: dados.after,
    metadata: { ...dados.metadata, surface: 'admin', session: ator.sessao },
  };
}
