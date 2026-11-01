import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { AppError } from '../../../../shared/http/errors.js';
import { iguaisEmTempoConstante } from '../../../../shared/crypto/digest.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { ehTipoDoContrato } from '../../domain/evento-de-entrega.js';
import { registrarEventoDeEntrega } from '../../application/registrar-evento-de-entrega.js';
import type { RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

/** Espelha `api/openapi.yaml`, operação `postmarkWebhook`. */
export const rotaDoWebhookDeEntrega = defineRoute({
  operationId: 'postmarkWebhook',
  method: 'post',
  path: '/webhooks/postmark',
  effects: ['verifies_secret'],
  rateLimit: [
    { dimension: ['ip'], limit: 600, window: '1h', onExceed: 'log_and_alert' },
    {
      dimension: ['ip'],
      appliesTo: 'invalid_attempts',
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
    },
  ],
});

const CABECALHO_DA_ASSINATURA = 'x-postmark-signature';

export interface DependenciasDoWebhookDeEntrega {
  readonly registro: RegistroDeEntregas;
  /** `MAIL_WEBHOOK_SECRET`, já em bytes (`config.mail.webhookSecret`). */
  readonly segredo: Buffer;
  readonly contrato: Contrato;
}

function assinaturaRecusada(): AppError {
  return new AppError('unauthenticated', 'Assinatura ausente ou inválida');
}

function conferirAssinatura(request: FastifyRequest, segredo: Buffer): void {
  const bruto = request.headers[CABECALHO_DA_ASSINATURA];
  if (typeof bruto !== 'string' || bruto === '') throw assinaturaRecusada();
  if (!iguaisEmTempoConstante(Buffer.from(bruto, 'utf8'), segredo)) throw assinaturaRecusada();
}

interface CorpoDoEvento {
  readonly RecordType?: unknown;
  readonly MessageID?: unknown;
  readonly Recipient?: unknown;
  readonly Type?: unknown;
  readonly Description?: unknown;
  readonly DeliveredAt?: unknown;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

function instante(valor: unknown): Date | undefined {
  const bruto = texto(valor);
  if (bruto === undefined) return undefined;
  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

export function registrarRotaDoWebhookDeEntrega(
  app: RegistradorDeRotas,
  deps: DependenciasDoWebhookDeEntrega,
): void {
  const schema = deps.contrato.requestBodySchema(rotaDoWebhookDeEntrega.operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${rotaDoWebhookDeEntrega.operationId} não declara corpo em ` +
        'application/json no contrato, e a rota espera um. Corrija a especificação.',
    );
  }

  registrarRota(
    app,
    rotaDoWebhookDeEntrega,
    {
      schema: { body: schema },
      onRequest: [
        (request: FastifyRequest): Promise<void> => {
          conferirAssinatura(request, deps.segredo);
          return Promise.resolve();
        },
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as CorpoDoEvento;

      const recordType = corpo.RecordType;
      const messageId = texto(corpo.MessageID);
      if (!ehTipoDoContrato(recordType) || messageId === undefined) {
        throw new AppError('validation-failed', 'Confira os dados', {
          errors: [
            { field: 'RecordType', code: 'schema', message: 'Evento fora do contrato.' },
          ],
        });
      }

      const resultado = await registrarEventoDeEntrega(deps.registro, {
        messageId,
        recordType,
        tipo: texto(corpo.Type),
        descricao: texto(corpo.Description),
        ocorridoEm: instante(corpo.DeliveredAt),
        destinatario: texto(corpo.Recipient),
      });

      if (resultado.subtipoDesconhecido) {
        request.log.warn(
          { message_id: messageId, record_type: recordType, event_type: texto(corpo.Type) ?? null },
          'devolucao com subtipo que nao reconhecemos: o evento foi registrado e NADA foi ' +
            'suprimido. Se este subtipo for definitivo, o endereco continua recebendo envio ' +
            'que o provedor recusa — classifique-o em domain/evento-de-entrega.ts',
        );
      } else {
        request.log.info(
          {
            message_id: messageId,
            record_type: recordType,
            novo: resultado.novo,
            suprimiu: resultado.suprimiu,
          },
          resultado.novo ? 'evento de entrega registrado' : 'evento de entrega reenviado, ignorado',
        );
      }

      return reply.status(204).send();
    },
  );
}
