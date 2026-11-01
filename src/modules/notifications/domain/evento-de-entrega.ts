import type { TipoDeEventoDeEntrega } from '../../../shared/db/schema.js';

export type { TipoDeEventoDeEntrega };

const TIPOS_DO_CONTRATO: ReadonlySet<string> = new Set<TipoDeEventoDeEntrega>([
  'Delivery',
  'Bounce',
  'SpamComplaint',
  'Open',
  'SubscriptionChange',
]);

export function ehTipoDoContrato(valor: unknown): valor is TipoDeEventoDeEntrega {
  return typeof valor === 'string' && TIPOS_DO_CONTRATO.has(valor);
}

const DEVOLUCOES_DEFINITIVAS: ReadonlySet<string> = new Set([
  'HardBounce',
  'BadEmailAddress',
  'ManuallyDeactivated',
  'Blocked',
]);

const DEVOLUCOES_TRANSITORIAS: ReadonlySet<string> = new Set([
  'Transient',
  'SoftBounce',
  'DnsError',
  'SMTPApiError',
  'InboundError',
]);

/** O que a aplicação faz com o evento. */
export type Decisao = 'suprimir' | 'registrar' | 'desconhecido';

export interface EventoDeEntrega {
  readonly recordType: TipoDeEventoDeEntrega;
  /** `Type` do corpo: o subtipo da devolução. */
  readonly tipo: string | undefined;
}

export function decidir(evento: EventoDeEntrega): Decisao {
  if (evento.recordType === 'SpamComplaint') return 'suprimir';

  if (evento.recordType === 'Bounce') {
    if (evento.tipo === undefined || evento.tipo === '') return 'desconhecido';
    if (DEVOLUCOES_DEFINITIVAS.has(evento.tipo)) return 'suprimir';
    if (DEVOLUCOES_TRANSITORIAS.has(evento.tipo)) return 'registrar';
    return 'desconhecido';
  }

  return 'registrar';
}
