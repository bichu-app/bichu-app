/** O adaptador de push que **não envia**, e a escolha entre os dois. */
import { assegurarSuperficiePublica } from '../../domain/conteudo-do-push.js';
import type { MensagemDePush, PushSender, ResultadoDoEnvio } from '../../ports/push-sender.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { PushConfig } from '../../../../shared/config/app-config.js';
import { criarPushSenderFcm } from './fcm-http-v1.js';

/** Quantos caracteres do resumo vão para o log. */
const CARACTERES_DO_RESUMO = 12;

/** O aparelho, sem o endereço dele. */
function resumoDoAparelho(token: string): string {
  return hashDeToken(token).toString('hex').slice(0, CARACTERES_DO_RESUMO);
}

/** O transporte que escreve e não envia. */
export function criarPushSenderDeLog(): PushSender {
  return {
    transporte: 'log (escreve o payload; NADA sai deste processo)',

    enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio> {
      return new Promise<ResultadoDoEnvio>((resolver) => {
        assegurarSuperficiePublica(mensagem);

        console.info(
          JSON.stringify({
            evento: 'push.send',
            transporte: 'log',
            aparelho: resumoDoAparelho(mensagem.token),
            titulo: mensagem.titulo,
            corpo: mensagem.corpo,
            dados: mensagem.dados,
            chave_de_agrupamento: mensagem.chaveDeAgrupamento,
            prioridade: mensagem.prioridade,
            validade_em_segundos: mensagem.validadeEmSegundos,
            com_imagem: mensagem.imagemUrl !== undefined,
          }),
        );

        resolver('aceito');
      });
    },
  };
}

/** O adaptador de log, ou o do FCM quando `PUSH_TRANSPORT=fcm`. */
export function criarPushSender(config: PushConfig): PushSender {
  if (config.transport === 'log') return criarPushSenderDeLog();

  if (config.projeto === undefined || config.projeto === '') {
    throw new Error(
      'PUSH_TRANSPORT="fcm" sem FCM_PROJECT. O endereço do HTTP v1 é ' +
        '`/v1/projects/{projeto}/messages:send`: sem o projeto não existe ' +
        'envio. Ele precisa ser o MESMO projeto que gerou o ' +
        '`google-services.json` embutido no APK — se divergir, o transporte ' +
        'responde SENDER_ID_MISMATCH por aparelho, que parece token inválido ' +
        'e faz alguém apagar o registro do aparelho de um tutor.',
    );
  }

  return criarPushSenderFcm({ projeto: config.projeto });
}
