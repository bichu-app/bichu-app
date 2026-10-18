/**
 * O trabalho `tag.scan_notify`, no worker: avisar o tutor de que alguem
 * escaneou a plaquinha do pet dele.
 *
 * ## O buraco central do produto, e o que fecha ele
 *
 * O aviso do achador gravava a linha, abria a conversa e respondia
 * `owner_notified: true` **sem enfileirar entrega nenhuma**. Este arquivo e o
 * consumidor do trabalho que a API passou a enfileirar: ele le o aviso, manda
 * o push por todos os aparelhos do tutor e manda o e-mail como rede de
 * seguranca.
 *
 * ## Os dois canais, e por que os dois
 *
 * UX 10.1 e ADR-0008 obrigam o e-mail porque **um canal que depende de
 * permissao do sistema nao pode ser o unico**. Aqui isso nao e teoria: o push
 * cai quando a pessoa negou a permissao (`push_permission = 'denied'`), quando
 * nenhum aparelho esta registrado, quando a porteira de conteudo barra o texto,
 * e quando o aviso de um segundo pet substitui o do primeiro na bandeja (ver o
 * cabecalho de `aviso-ao-tutor-por-push.ts`). O e-mail cobre os quatro.
 *
 * O e-mail sai **sempre**, e nao so quando o push falha. Decidir pelo push
 * exigiria confiar no `aceitos` do provedor como prova de que a pessoa LEU, e
 * ele nao e isso: ele e prova de que o provedor aceitou a mensagem. Para o
 * aviso mais critico do produto, o erro barato e mandar dois; o erro caro e o
 * tutor nao saber que alguem esta com o animal dele.
 *
 * ## O desfecho vem como VALOR, e nao como excecao
 *
 * Aviso que sumiu (expurgo, pet excluido, conta apagada) nao e falha, e
 * reenfileira-lo gastaria a fila contra algo que nunca muda de resposta. Falha
 * de transporte sim estoura — ai a fila adia e tenta de novo.
 */
import type { Mailer, Mensagem } from '../../identity/ports/mailer.js';
import type {
  AvisoAoTutorParaEntrega,
  EnderecoDeEmailDoTutor,
  EntregaDoAvisoAoTutor,
  LeituraDoAvisoAoTutor,
  ResultadoDoAvisoAoTutor,
} from '../ports/aviso-ao-tutor.js';

export interface DependenciasDoAvisoAoTutor {
  readonly avisos: LeituraDoAvisoAoTutor;
  readonly entrega: EntregaDoAvisoAoTutor;
  readonly mailer: Mailer;
  readonly contas: EnderecoDeEmailDoTutor;
}

export type ResultadoDoEmail = 'enviado' | 'sem_endereco' | 'falhou';

export type DesfechoDoAvisoAoTutor =
  | { readonly tipo: 'sem_aviso' }
  | ({ readonly tipo: 'avisado'; readonly email: ResultadoDoEmail } & ResultadoDoAvisoAoTutor);

/**
 * O e-mail, montado por funcao pura ao lado do servico para que um teste possa
 * ler o texto. E a forma de `montarAvisoDeReuso` e `montarMensagemDoToken`.
 *
 * ## O que ele diz e o que ele NAO diz
 *
 * Ele e mais rico que o push — e-mail nao aparece na tela de bloqueio — mas
 * **nao traz o achador nem o lugar**: nome, recado e foto de quem achou sao
 * vistos dentro da conversa mediada, e localizacao nao e resolvida neste
 * caminho. O corpo leva o nome do pet, o fato, e o endereco do app.
 *
 * Sem link para a conversa: o endereco dela e montado com o token do ACHADOR
 * (`/c/{finderToken}`), que e credencial de outra pessoa e nao pode ir para a
 * caixa do tutor.
 */
export function montarAvisoDoAchadoParaTutor(
  para: string,
  aviso: Pick<AvisoAoTutorParaEntrega, 'nomeDoPet' | 'casoAberto'>,
  baseDaWeb: string,
): Mensagem {
  const nome = aviso.nomeDoPet;
  const base = baseDaWeb.replace(/\/$/, '');
  const assunto = aviso.casoAberto
    ? `Alguem esta com ${nome}`
    : `Alguem escaneou a plaquinha de ${nome}`;
  const primeira = aviso.casoAberto
    ? `Uma pessoa acabou de escanear a plaquinha de ${nome} e avisou que esta com o animal.`
    : `Uma pessoa acabou de escanear a plaquinha de ${nome}.\n\n` +
      `Se ${nome} deveria estar com voce agora, vale conferir.`;
  return {
    para,
    assunto,
    corpo:
      `${primeira}\n\n` +
      'Abra o Bichu para falar com quem avisou. A conversa acontece dentro do ' +
      'aplicativo, sem trocar telefone nem endereco.\n\n' +
      `${base}\n\n` +
      'Este aviso foi enviado tambem para o seu celular. Voce esta recebendo ' +
      'por e-mail porque o aviso da plaquinha e o mais importante do Bichu e ' +
      'nao pode depender de uma notificacao sozinha.',
  };
}

export async function avisarTutorDoAchado(
  deps: DependenciasDoAvisoAoTutor,
  foundReportId: string,
  baseDaWeb: string,
): Promise<DesfechoDoAvisoAoTutor> {
  const aviso = await deps.avisos.avisoDoAchado(foundReportId);
  if (aviso === null) return { tipo: 'sem_aviso' };

  const entrega = await deps.entrega.avisar(aviso);
  const email = await enviarRedeDeSeguranca(deps, aviso, baseDaWeb);
  return { tipo: 'avisado', email, ...entrega };
}

/**
 * O e-mail, sem derrubar o trabalho.
 *
 * Mesma forma de `avisarSemDerrubar` em `auth-service.ts`: falha de provedor
 * vira log e nao excecao, porque reenfileirar o trabalho inteiro mandaria o
 * push de novo — e dois pushes identicos sao pior que um e-mail que faltou.
 */
async function enviarRedeDeSeguranca(
  deps: DependenciasDoAvisoAoTutor,
  aviso: AvisoAoTutorParaEntrega,
  baseDaWeb: string,
): Promise<ResultadoDoEmail> {
  const para = await deps.contas.emailVerificadoDe(aviso.donoUserId);
  if (para === undefined) return 'sem_endereco';
  try {
    await deps.mailer.enviar(montarAvisoDoAchadoParaTutor(para, aviso, baseDaWeb));
    // O evento, e nao o endereco: `para` e dado pessoal e o log nao e lugar
    // dele (ADR-0010). Em hml `MAIL_TRANSPORT=log` faz o transporte imprimir a
    // mensagem inteira; esta linha e da APLICACAO, e e ela que prova despacho
    // independente de qual transporte esta ligado.
    console.info(JSON.stringify({ evento: 'email.send', proposito: 'tag_scan_owner' }));
    return 'enviado';
  } catch (erro: unknown) {
    console.error(
      JSON.stringify({
        evento: 'email.send_failed',
        proposito: 'tag_scan_owner',
        erro: String(erro),
      }),
    );
    return 'falhou';
  }
}
