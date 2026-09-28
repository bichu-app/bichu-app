/**
 * O evento de trilha de uma operacao administrativa, montado de um jeito so.
 *
 * A rota administrativa declara a acao e o tipo de recurso em `defineRoute`
 * (`audit`), e o portao `rotas-registradas-contra-o-contrato` confere os dois
 * contra o `x-audit` do contrato. Esta funcao e a ponte entre aquela
 * declaracao, que em `shared/http` e so uma cadeia, e a uniao fechada
 * `AuditAction` deste modulo: acao fora da lista lanca aqui, na primeira
 * escrita, em vez de gravar uma acao que ninguem declarou.
 *
 * O `metadata` sai sempre com `surface: 'admin'` e os oito primeiros bytes do
 * hash da sessao (ADR-0027 item 8): e o que liga uma escrita a UMA sessao numa
 * investigacao de conta tomada, sem gravar nada que reabra a sessao.
 */
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
    // `surface` e `session` depois do que veio de fora: um trabalho nao
    // consegue apagar de que sessao a escrita saiu.
    metadata: { ...dados.metadata, surface: 'admin', session: ator.sessao },
  };
}
