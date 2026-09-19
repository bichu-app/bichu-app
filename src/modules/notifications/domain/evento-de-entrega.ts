/**
 * O que cada evento do provedor de e-mail SIGNIFICA para o produto.
 *
 * Camada pura: nada aqui abre banco, lê cabeçalho ou conhece HTTP. É a decisão
 * — "este evento derruba o endereço ou não" — separada do encanamento, porque é
 * a única parte que um teste consegue exercitar exaustivamente e é onde o erro
 * custa caro nos dois sentidos.
 *
 * ## A assimetria que governa este arquivo
 *
 * Errar para um lado e errar para o outro **não custam a mesma coisa**:
 *
 * - **Suprimir um endereço que era bom** desliga o e-mail de um tutor. Ele para
 *   de receber aviso de que alguém encontrou o pet dele, e nada na tela diz por
 *   quê. É o invariante nº 1 do contrato ("nenhum aviso ao tutor é descartado")
 *   quebrado em silêncio, por decisão nossa, sem ninguém pedir.
 * - **Não suprimir um endereço que era ruim** faz o provedor recusar os próximos
 *   envios. Custa reputação de domínio e aparece no painel do provedor — ruim,
 *   visível, e reversível.
 *
 * Por isso a regra: **só suprime no que o provedor afirma ser definitivo.**
 * Subtipo de devolução que não reconhecemos NÃO suprime; ele é devolvido como
 * `desconhecido` para que a rota registre o evento e deixe rastro, em vez de a
 * dúvida virar uma conta sem e-mail.
 */
import type { TipoDeEventoDeEntrega } from '../../../shared/db/schema.js';

export type { TipoDeEventoDeEntrega };

/** Os cinco `RecordType` que `api/openapi.yaml` declara, e só eles. */
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

/**
 * Subtipos de `Bounce` que o provedor classifica como **definitivos**: o
 * endereço não existe, foi desativado, ou a caixa recusa permanentemente.
 *
 * A lista é curta de propósito e cresce por evidência, não por precaução. Cada
 * nome aqui é uma conta que perde o e-mail quando o evento chega — ver a
 * assimetria no topo do arquivo.
 */
const DEVOLUCOES_DEFINITIVAS: ReadonlySet<string> = new Set([
  'HardBounce',
  'BadEmailAddress',
  'ManuallyDeactivated',
  'Blocked',
]);

/**
 * Subtipos que são **temporários** e não podem suprimir nada: caixa cheia,
 * indisponibilidade momentânea, falha de DNS do outro lado. O endereço continua
 * bom e o provedor volta a tentar sozinho.
 *
 * Existem explicitamente, em vez de caírem no `desconhecido`, para que o log
 * consiga distinguir "sabemos que é transitório" de "não sabemos o que é isto"
 * — a segunda é a que precisa de olho humano.
 */
const DEVOLUCOES_TRANSITORIAS: ReadonlySet<string> = new Set([
  'Transient',
  'SoftBounce',
  'DnsError',
  'SMTPApiError',
  'InboundError',
]);

/**
 * O que a aplicação faz com o evento.
 *
 * - `suprimir`: devolução definitiva ou reclamação de spam. Marca o endereço
 *   como não entregável.
 * - `registrar`: entrega, abertura, devolução transitória. Fica na trilha e não
 *   muda o estado da conta.
 * - `desconhecido`: devolução com subtipo fora das duas listas. Registra e
 *   **não** suprime, e pede log para alguém olhar.
 */
export type Decisao = 'suprimir' | 'registrar' | 'desconhecido';

export interface EventoDeEntrega {
  readonly recordType: TipoDeEventoDeEntrega;
  /** `Type` do corpo: o subtipo da devolução. Ausente na maioria dos eventos. */
  readonly tipo: string | undefined;
}

export function decidir(evento: EventoDeEntrega): Decisao {
  // Reclamação de spam é definitiva e não tem subtipo: quem marcou como spam
  // entra na lista de supressão DO PROVEDOR, e todo envio seguinte para aquele
  // endereço falha — com ou sem a nossa marcação. Continuar tentando não
  // entrega nada e queima a reputação do domínio, que é o que o contrato
  // descreve como "falha em silêncio para sempre".
  if (evento.recordType === 'SpamComplaint') return 'suprimir';

  if (evento.recordType === 'Bounce') {
    // Devolução SEM subtipo não é tratada como definitiva. O contrato declara
    // `Type` opcional, então a ausência é um estado legítimo do corpo — e
    // supor "definitiva" no que o provedor não afirmou é exatamente o erro que
    // derruba o e-mail de um tutor de verdade.
    if (evento.tipo === undefined || evento.tipo === '') return 'desconhecido';
    if (DEVOLUCOES_DEFINITIVAS.has(evento.tipo)) return 'suprimir';
    if (DEVOLUCOES_TRANSITORIAS.has(evento.tipo)) return 'registrar';
    return 'desconhecido';
  }

  // `Delivery`, `Open` e `SubscriptionChange`: nenhum deles muda a
  // entregabilidade do endereço.
  return 'registrar';
}
