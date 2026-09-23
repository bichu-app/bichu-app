/**
 * As regras de tempo e de transicao da transferencia de pet, sem banco, sem
 * relogio de parede e sem framework.
 *
 * Tudo que decide "da para aceitar?", "da para cancelar?" e "da para consumar?"
 * mora aqui, como funcao pura de (estado, agora). A alternativa -- espalhar os
 * `if` pelo servico e pelo worker -- e o desenho que faz a janela de 24 h valer
 * num caminho e nao valer no outro, que e exatamente o defeito que a isca
 * `janela-de-24h` existe para reprovar.
 *
 * ## Por que 72 h para aceitar e 24 h para desfazer
 *
 * Nao sao dois numeros do mesmo tipo. As 72 h sao generosidade com quem ainda
 * nao tem conta: o convite chega, a pessoa precisa criar conta, verificar o
 * e-mail e so entao aceitar. As 24 h sao arrependimento: e o tempo em que o
 * tutor atual percebe o engano, acha o e-mail e desfaz. Os dois vem do contrato
 * (`api/openapi.yaml`, `startPetTransfer` e `acceptPetTransfer`) e nao sao
 * escolha deste arquivo.
 *
 * ## A assimetria que decide os limites
 *
 * Aceitar cedo demais custa uma espera. Consumar cedo demais custa a plaquinha
 * da coleira, que nao volta (ADR-0004). Por isso toda comparacao de tempo aqui
 * e `>=` para o vencimento e nunca arredonda para baixo: a duvida resolve a
 * favor de nao consumar.
 */
import type { Instant } from '../../../shared/types/brands.js';

const HORA_EM_MS = 60 * 60 * 1000;

/** Prazo para o destinatario aceitar o convite. */
export const JANELA_PARA_ACEITAR_EM_MS = 72 * HORA_EM_MS;

/** Janela cancelavel entre o aceite e a consumacao. */
export const JANELA_CANCELAVEL_EM_MS = 24 * HORA_EM_MS;

export type StatusDaTransferencia =
  | 'pending_acceptance'
  | 'accepted'
  | 'effective'
  | 'cancelled'
  | 'expired';

export type MotivoDoCancelamento =
  | 'current_owner'
  | 'cancel_token'
  | 'lost_case_opened'
  | 'recipient_gone';

/** O que as decisoes deste arquivo precisam saber, e nada alem. */
export interface EstadoDaTransferencia {
  readonly status: StatusDaTransferencia;
  readonly inviteExpiresAt: Instant;
  readonly effectiveAt: Instant | null;
}

export function instanteDoVencimentoDoConvite(criadaEm: Instant): Instant {
  return (criadaEm + JANELA_PARA_ACEITAR_EM_MS) as Instant;
}

export function instanteDaConsumacao(aceitaEm: Instant): Instant {
  return (aceitaEm + JANELA_CANCELAVEL_EM_MS) as Instant;
}

/**
 * O convite ainda vale?
 *
 * `agora >= inviteExpiresAt` ja venceu. O instante exato do vencimento conta
 * como vencido, e nao como o ultimo segundo valido: o limite pertence ao lado
 * seguro.
 */
export function conviteAindaVale(estado: EstadoDaTransferencia, agora: Instant): boolean {
  return estado.status === 'pending_acceptance' && agora < estado.inviteExpiresAt;
}

/**
 * O tutor atual pode cancelar?
 *
 * Vale em TODA a janela: do convite ate as 24 h seguintes ao aceite. Depois de
 * consumada o caminho e transferir de volta, e nao cancelar (`cancelPetTransfer`
 * responde 409 ali).
 *
 * O estado `accepted` sozinho nao basta. Uma linha que ficou `accepted` com
 * `effective_at` no passado -- worker parado, banco restaurado -- nao pode
 * aceitar cancelamento como se a janela ainda corresse: o mundo ja passou do
 * ponto, e responder 200 ali diria ao tutor que ele desfez algo que o proximo
 * ciclo do worker vai consumar assim mesmo.
 */
export function podeCancelar(estado: EstadoDaTransferencia, agora: Instant): boolean {
  if (estado.status === 'pending_acceptance') return true;
  if (estado.status !== 'accepted') return false;
  if (estado.effectiveAt === null) return false;
  return agora < estado.effectiveAt;
}

/**
 * A janela de 24 h fechou e a posse pode mudar?
 *
 * Tres condicoes, e as tres sao necessarias. Faltar qualquer uma e recusar --
 * consumar e irreversivel, e o unico erro barato aqui e o de esperar demais.
 */
export function podeConsumar(estado: EstadoDaTransferencia, agora: Instant): boolean {
  if (estado.status !== 'accepted') return false;
  if (estado.effectiveAt === null) return false;
  return agora >= estado.effectiveAt;
}

/**
 * Mascara o endereco para `recipient_email_masked`.
 *
 * Duas letras, quatro asteriscos, dominio inteiro -- a forma que o contrato
 * exemplifica (`ma****@exemplo.com.br`). O numero de asteriscos e FIXO e nao
 * acompanha o tamanho do trecho escondido: variavel, ele contaria quantos
 * caracteres o endereco tem, que e informacao que a mascara existe para nao
 * dar.
 *
 * Parte local com uma letra so nao vira `m*****`: vira `**` inteiro. Revelar a
 * unica letra de um endereco de uma letra e revelar o endereco.
 */
export function mascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  if (arroba <= 0) return '****';
  const local = email.slice(0, arroba);
  const dominio = email.slice(arroba);
  const prefixo = local.length >= 2 ? local.slice(0, 2) : '**';
  return `${prefixo}****${dominio}`;
}
