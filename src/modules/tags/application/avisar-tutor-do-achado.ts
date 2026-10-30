/**
 * O trabalho `tag.scan_notify`, no worker: avisar o tutor de que alguem escaneou a
 * plaquinha do pet dele.
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
 * O e-mail, montado por funcao pura ao lado do servico para que um teste possa ler
 * o texto.
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

/** O e-mail, sem derrubar o trabalho. */
async function enviarRedeDeSeguranca(
  deps: DependenciasDoAvisoAoTutor,
  aviso: AvisoAoTutorParaEntrega,
  baseDaWeb: string,
): Promise<ResultadoDoEmail> {
  const para = await deps.contas.emailVerificadoDe(aviso.donoUserId);
  if (para === undefined) return 'sem_endereco';
  try {
    await deps.mailer.enviar(montarAvisoDoAchadoParaTutor(para, aviso, baseDaWeb));
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
