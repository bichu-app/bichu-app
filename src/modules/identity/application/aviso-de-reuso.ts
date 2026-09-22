/**
 * Monta o aviso que a vítima do reuso de refresh recebe por e-mail, e emite a
 * credencial do "Não fui eu" que vai dentro dele.
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
 * ## O que a BICHUS-215 acrescentou, e por que é AQUI
 *
 * O aviso dizia o que aconteceu e mandava a pessoa "trocar a senha se
 * desconfiar". Trocar a senha exige lembrar a senha atual ou ter a caixa de
 * entrada à mão, e o critério 4 da BICHUS-125 é explícito: *"todas as sessões
 * caem, **sem precisar lembrar a senha**"*. O gesto precisava de uma credencial
 * própria, e ela só pode nascer no mesmo lugar em que a mensagem nasce: o valor
 * em claro existe nesta função e no corpo do e-mail, e em nenhum outro lugar —
 * não é devolvido, não é registrado e não passa pela fila.
 *
 * **A detecção continua revogando só a família apresentada.** Isso é de
 * propósito: ela é automática, e pode disparar por um cliente com relógio torto
 * repetindo um refresh. Derrubar a conta inteira sem ninguém pedir
 * transformaria falso positivo em expulsão. Quem decide derrubar tudo é a
 * pessoa, pelo link — e é por isso que o quarto gatilho do SEC-006 é um gesto,
 * e não um efeito colateral da detecção.
 */
import type { AvisoAoTitular } from './dependencies.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { hashDeToken } from '../../../shared/crypto/digest.js';
import type { AbsoluteUrl, Instant, TokenHash, UserId } from '../../../shared/types/brands.js';

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

/**
 * Sete dias, e o número é maior que o dos outros dois links de propósito.
 *
 * `password_reset` vale 30 minutos porque é uma credencial de troca de senha, e
 * a janela curta é a diferença entre uma caixa de entrada vazada ontem servir
 * ou não servir hoje. Este link não troca nada: ele só derruba sessão, e
 * derrubar a sessão de quem já não deveria estar lá é o resultado desejado, não
 * o dano. O que a janela larga protege é o outro lado — quem lê o aviso no dia
 * seguinte, de outro aparelho, e só então entende o que aconteceu.
 */
const VALIDADE_DO_DISAVOW_EM_MS = 7 * 24 * 60 * 60 * 1000;

export interface DependenciasDoAvisoDeReuso {
  readonly repositorio: Pick<IdentityRepository, 'buscarContaPorId' | 'criarTokenDeVerificacao'>;
  readonly mailer: Mailer;
  readonly registrarOcorrencia: RegistrarOcorrencia;
  readonly ids: IdGenerator;
  /**
   * Base das páginas públicas. O link é montado na HORA DO ENVIO, nunca
   * guardado (§11.1 proibição 9): um link gravado carrega o domínio do dia em
   * que foi escrito, e este e-mail é lido horas depois.
   */
  readonly baseDaWeb: AbsoluteUrl;
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
 *
 * O link do "Não fui eu" é o segundo caminho, e ele existe para quem **não
 * consegue** percorrer o primeiro. Ele é o único dado variável desta mensagem,
 * e é uma credencial: por isso não aparece em log nenhum.
 */
export function montarAvisoDeReuso(paraOEnderecoDaConta: string, linkDoNaoFuiEu: string): Mensagem {
  return {
    para: paraOEnderecoDaConta,
    assunto: 'Encerramos as sessões da sua conta no Bichu',
    corpo:
      'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta, ' +
      'e encerramos por precaução a sessão que apresentou esse acesso.\n\n' +
      'Entre de novo no aplicativo. Se você não reconhece nenhuma atividade estranha, ' +
      'não precisa fazer mais nada.\n\n' +
      'Se não foi você, abra este link. Ele encerra TODAS as sessões da sua conta, ' +
      'em todos os aparelhos, e não pede senha nem login:\n\n' +
      `${linkDoNaoFuiEu}\n\n` +
      'O link vale por 7 dias e só pode ser usado uma vez. Depois de usá-lo, peça uma ' +
      'senha nova em "Esqueci minha senha".',
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

    // 256 bits de CSPRNG. O valor em claro existe nesta variável e no corpo da
    // mensagem, e acaba com esta função.
    const tokenBruto = deps.ids.opaqueToken();
    await deps.repositorio.criarTokenDeVerificacao({
      id: deps.ids.uuidv7(),
      userId: conta.id,
      proposito: 'session_disavow',
      tokenHash: hashDeToken(tokenBruto).toString('base64') as TokenHash,
      enviadoPara: conta.email,
      expiraEm: (aviso.ocorridoEm + VALIDADE_DO_DISAVOW_EM_MS) as Instant,
      // De quem APRESENTOU o refresh reusado, e não da vítima: é o único rastro
      // forense daquele instante.
      ipHmac: aviso.ipHmac,
    });

    const base = deps.baseDaWeb.replace(/\/$/, '');
    await deps.mailer.enviar(
      montarAvisoDeReuso(conta.email, `${base}/nao-fui-eu?token=${tokenBruto}`),
    );
  };
}
