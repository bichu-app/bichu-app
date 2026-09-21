/**
 * Monta o aviso que a vítima do reuso de refresh recebe por e-mail.
 *
 * ## Por que isto saiu da raiz de composição (`src/bin/api.ts`)
 *
 * Até BICHUS-129 este código era uma lambda dentro de `main()`, passada como
 * `avisarTitular`. Nenhum teste carrega `api.ts` — ele abre porta, banco e
 * SMTP —, então a lambda ficava em **0% de cobertura**: inverter o
 * `if (conta === undefined) return`, apagar o corpo da mensagem ou trocar o
 * destinatário não reprovava nada, e a esteira seguia verde.
 *
 * O que isso custa não é cobertura: é a pessoa. O critério 10 de BICHUS-15 diz
 * que na detecção de reuso *"a vítima é avisada por e-mail: detecção silenciosa
 * não protege ninguém"*. Se o aviso parar de sair, quem teve o refresh copiado
 * lê a revogação como "o app me deslogou", faz login de novo e continua com o
 * invasor dentro da conta, sem nunca saber. Uma função nomeada, sem porta nem
 * processo, pode ser carregada por um teste — a lambda não podia.
 *
 * A fiação continua em `api.ts`: o que mudou de lugar é a **decisão** (para
 * quem escrever, e o que dizer), não a composição.
 *
 * O comportamento é o mesmo de antes, linha por linha.
 */
import type { AvisoAoTitular } from './dependencies.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { UserId } from '../../../shared/types/brands.js';

/**
 * O que esta função precisa de um registrador de log.
 *
 * O tipo passou a morar em `dependencies.ts` com BICHUS-147, porque o serviço
 * de identidade também registra ocorrência agora, e duas declarações do mesmo
 * formato de log seriam duas fontes. O re-export mantém o nome onde quem já
 * importava daqui espera encontrá-lo.
 */
export type { RegistrarOcorrencia } from './dependencies.js';
import type { RegistrarOcorrencia } from './dependencies.js';

export interface DependenciasDoAvisoDeReuso {
  readonly repositorio: Pick<IdentityRepository, 'buscarContaPorId'>;
  readonly mailer: Mailer;
  readonly registrarOcorrencia: RegistrarOcorrencia;
}

/**
 * O texto do aviso.
 *
 * ## O que este corpo deliberadamente NÃO carrega
 *
 * Nome, telefone, endereço, `user_id` ou qualquer UUID do banco. E-mail é saída
 * pública — ele é encaminhado, vai para caixa compartilhada, aparece em
 * notificação de tela bloqueada. O ADR-0010 item 6 proíbe UUID de banco em
 * saída pública **sem exceção**, e o contato mediado proíbe telefone e endereço
 * para qualquer pessoa. Uma mensagem de segurança é o lugar mais tentador para
 * "ajudar" enfiando dado de conta aqui dentro; é por isso que o teste afirma a
 * ausência, e não só a presença.
 *
 * O corpo também diz **o que fazer**, e não só que algo aconteceu: um aviso que
 * termina em "detectamos atividade suspeita" deixa a pessoa assustada e sem
 * ação, que é quase o mesmo que não avisar.
 */
export function montarAvisoDeReuso(paraOEnderecoDaConta: string): Mensagem {
  return {
    para: paraOEnderecoDaConta,
    assunto: 'Encerramos as sessões da sua conta no Bichu',
    corpo:
      'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta, ' +
      'e encerramos todas as sessões por precaução.\n\n' +
      'Entre de novo no aplicativo. Se você não reconhece nenhuma atividade estranha, ' +
      'não precisa fazer mais nada.\n\n' +
      'Se desconfiar de alguma coisa, troque a sua senha: isso derruba qualquer acesso ' +
      'que não seja o seu.',
  };
}

/**
 * A implementação de `avisarTitular` que a raiz de composição entrega ao
 * serviço de identidade.
 */
export function criarAvisoDeReusoAoTitular(
  deps: DependenciasDoAvisoDeReuso,
): (aviso: AvisoAoTitular) => Promise<void> {
  return async (aviso) => {
    // Critério 10 de BICHUS-15: **a vítima é avisada por e-mail**. Até
    // 18/09 isto só registrava no log, esperando um módulo `notifications`
    // que não existe — e a própria história diz por que isso não bastava:
    // "detecção silenciosa não protege ninguém". Quem teve a sessão roubada
    // interpreta a revogação como "o app me deslogou" e faz login de novo,
    // sem nunca saber que alguém entrou.
    //
    // O log continua, porque ele serve a outra pessoa: quem investiga depois.
    deps.registrarOcorrencia(
      { tipo: aviso.tipo, correlationId: aviso.correlationId },
      'reuso de refresh detectado',
    );

    const conta = await deps.repositorio.buscarContaPorId(aviso.userId as UserId);
    // Conta apagada entre a detecção e o aviso: não há para quem escrever.
    if (conta === undefined) return;

    await deps.mailer.enviar(montarAvisoDeReuso(conta.email));
  };
}
