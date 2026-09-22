/**
 * `POST /webhooks/postmark` — eventos de entrega do provedor de e-mail
 * (BICHUS-13, critérios 7 e 9; `api/openapi.yaml`, operação `postmarkWebhook`).
 *
 * Esta rota é diferente de todas as outras do serviço em três aspectos, e os
 * três decidem como ela é escrita:
 *
 * 1. **É chamada DE ENTRADA, da internet aberta.** Nenhum usuário nosso a
 *    chama, nenhum token de sessão aparece nela, e ela não pode ser exercitada
 *    de `localhost` pelo provedor — é uma das quatro coisas que o critério 9
 *    nomeia como "não roda em localhost". Quem a alcança é qualquer um que
 *    saiba o endereço, então o segredo do cabeçalho é a única porta.
 * 2. **Ela fica FORA de `/v1`.** O contrato declara o caminho na raiz do host
 *    da API, com `servers` próprio, exatamente como os `.well-known`. Isso tem
 *    consequência na borda, e não só aqui: `handle /v1/*` não a alcança. Ver
 *    `infra/caddy/Caddyfile`.
 * 3. **O provedor REENVIA.** Resposta lenta ou com erro vira o mesmo evento de
 *    novo, mais tarde. Por isso a idempotência é chave natural e não
 *    `Idempotency-Key`: quem chama não manda cabeçalho nosso.
 *
 * ## Privacidade (ADR-0010 item 6, contato mediado)
 *
 * O corpo do evento traz `Recipient` — o e-mail de um tutor — em claro. Duas
 * regras saem disso e valem para toda linha abaixo:
 *
 * - **a resposta não devolve nada.** 204 sem corpo nos dois caminhos de
 *   sucesso, que é o que o contrato declara. Não há telefone, endereço,
 *   `user_id`, `case_id` nem UUID de banco para vazar porque não há corpo;
 * - **o log não recebe o destinatário.** O que sai no log é `message_id` e
 *   `record_type`, que são identificadores do provedor. O log de aplicação é
 *   lido por muita gente, é enviado para fora do host e sobrevive à exclusão da
 *   conta — escrever o e-mail ali desfaz a promessa em um lugar onde ninguém
 *   vai procurá-la.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { AppError } from '../../../../shared/http/errors.js';
import { iguaisEmTempoConstante } from '../../../../shared/crypto/digest.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { ehTipoDoContrato } from '../../domain/evento-de-entrega.js';
import { registrarEventoDeEntrega } from '../../application/registrar-evento-de-entrega.js';
import type { RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

/**
 * Espelha `api/openapi.yaml`, operação `postmarkWebhook`.
 *
 * `effects: ['verifies_secret']` e os dois tetos são cópia do contrato, não
 * julgamento local: rota com efeito e sem teto **não compila**
 * (`shared/http/route-definition.ts`).
 *
 * O segundo teto é o que importa aqui: 20 tentativas inválidas por hora, por
 * IP, com `deny_429`. Ele existe porque verificar assinatura custa do lado do
 * servidor, e sem teto qualquer um transforma a rota num moedor de CPU só
 * mandando cabeçalho errado.
 */
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

/** O nome do cabeçalho vem do esquema `webhookSignature` do contrato. */
const CABECALHO_DA_ASSINATURA = 'x-postmark-signature';

export interface DependenciasDoWebhookDeEntrega {
  readonly registro: RegistroDeEntregas;
  /** `MAIL_WEBHOOK_SECRET`, já em bytes (`config.mail.webhookSecret`). */
  readonly segredo: Buffer;
  readonly contrato: Contrato;
}

/**
 * 401 do contrato ("Assinatura ausente ou invalida").
 *
 * `unauthenticated` é o tipo certo — a lista fechada de `x-problem-types` o
 * descreve como "sem token, token ausente ou **assinatura invalida**".
 *
 * **Sem `next_action`**, e a ausência é deliberada: `problemas.naoAutenticado()`
 * manda `sign_in`, que é a saída certa para um tutor numa tela e um absurdo
 * para um provedor de e-mail. Um cliente que decide por `next_action` receberia
 * a instrução de abrir a tela de login de um robô que não tem tela.
 *
 * O corpo é o mesmo para cabeçalho ausente e para segredo errado, de propósito:
 * distinguir os dois conta a quem está tentando em qual metade do problema ele
 * está.
 */
function assinaturaRecusada(): AppError {
  return new AppError('unauthenticated', 'Assinatura ausente ou inválida');
}

/**
 * A única autenticação desta rota.
 *
 * **Comparação em tempo constante, e não `===`.** O contrato exige com essas
 * palavras ("comparada em tempo constante"), e o motivo é concreto: `===` sobre
 * texto para no primeiro byte diferente, e a diferença de tempo é medível pela
 * rede. Com ela, descobrir um segredo de 32 bytes deixa de ser 256^32 tentativas
 * e vira 32 × 256 — questão de minutos. O que se ganha com o segredo é forjar
 * evento de devolução definitiva para o e-mail de qualquer tutor, e desligar o
 * aviso de pet perdido dele sem que nada acuse.
 */
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

/**
 * `DeliveredAt` do corpo. Data ilegível vira `undefined` em vez de derrubar o
 * evento: o campo é opcional no contrato e a informação que importa
 * (`MessageID` e `RecordType`) já chegou. Perder o evento inteiro por causa do
 * carimbo de tempo faria o provedor reenviar para sempre o mesmo corpo que
 * nunca vamos aceitar.
 */
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
  // Schema de corpo tirado da própria especificação, como nas demais rotas: uma
  // fonte só. Validação escrita à mão ao lado da spec é a segunda definição que
  // diverge, e aqui ela divergiria de um documento que um terceiro preenche.
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
      // A ASSINATURA É CONFERIDA EM `onRequest`, e não dentro do handler.
      //
      // A diferença não é estilo, é ordem de execução, e ela foi encontrada por
      // teste: o Fastify valida o corpo contra o schema ANTES de chamar o
      // handler. Com a verificação lá dentro, uma requisição sem assinatura
      // nenhuma e com corpo torto respondia **400**, e não 401 — ou seja, quem
      // não tem o segredo descobria, de graça, quais campos nós exigimos e qual
      // `enum` aceitamos. Oráculo de formato entregue a chamador não
      // autenticado, que é a primeira coisa que alguém usa para montar um
      // evento forjado que "parece" nosso.
      //
      // `onRequest` roda antes de parsear e antes de validar, então quem não
      // apresenta o segredo não faz o servidor nem desserializar JSON. Isso
      // também é o requisito de "não fazer trabalho no handler": o custo de uma
      // requisição inválida cai para uma comparação de bytes.
      //
      // E o teto de tentativas inválidas roda em `onRequest` ANTES deste gancho
      // (`registrarRota` os empilha nessa ordem). É isso que faz a 21ª chamada
      // inválida da hora receber 429 **sem** a comparação em tempo constante
      // acontecer: a defesa contra o moedor de CPU não pode ela mesma custar CPU.
      onRequest: [
        (request: FastifyRequest): Promise<void> => {
          conferirAssinatura(request, deps.segredo);
          return Promise.resolve();
        },
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as CorpoDoEvento;

      // O schema do contrato já exige `RecordType` e `MessageID` e fecha o
      // `enum`, então o Fastify recusa antes de chegar aqui. Esta guarda existe
      // para o TIPO, não para a validação: ela é o que permite passar
      // `recordType` adiante como a união fechada em vez de `string`, e é o que
      // impede uma linha em `notification_deliveries` com um valor que o CHECK
      // da tabela recusaria — falha que apareceria como 500 numa rota cuja
      // resposta de erro o provedor interpreta como "reenvie".
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

      // O QUE VAI PARA O LOG, e o que NUNCA vai.
      //
      // `message_id` e `record_type` são identificadores do provedor e não
      // dizem de quem é a caixa de e-mail. `Recipient` fica de fora — ver o
      // cabeçalho deste arquivo. `suprimiu` é booleano justamente por isso: ele
      // conta que uma conta foi marcada sem dizer qual.
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

      // 204 nos dois casos — "Evento processado ou ignorado por duplicidade",
      // palavra por palavra do contrato. Responder 409 na duplicidade faria o
      // provedor tratar a reentrega como falha e reenviar de novo, em laço.
      return reply.status(204).send();
    },
  );
}
