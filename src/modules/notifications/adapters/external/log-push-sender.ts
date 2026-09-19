/**
 * O adaptador de push que **não envia**, e a escolha entre os dois.
 *
 * ## Por que ele existe
 *
 * O ADR-0008 o recomenda por nome: *"um adaptador de push de registro em log,
 * ligado por variável de ambiente, para que o desenvolvimento não dependa de
 * credencial do Firebase: mesma porta, outra implementação, e o teste de
 * contrato afirma o que foi enviado"*. E ele carrega a regra do ADR-0012 que
 * vale para todas as portas: **nenhuma porta entra em produção com um
 * adaptador só**, porque um adaptador só é um acoplamento com nome bonito.
 *
 * Ele é também a única forma de exercitar o alerta hoje. O projeto Firebase com
 * o app registrado é pendência do cliente (ADR-0008, prazo 22/09), e sem ele
 * `fcm` não tem para onde enviar.
 *
 * ## O que ele prova, e o que ele NÃO prova
 *
 * Prova: que a mensagem foi montada, que passou pela porteira de
 * `domain/conteudo-do-push.ts`, **quantos e quais** aparelhos receberiam cada
 * aviso, e com isso a consulta geoespacial de 5 km, o teto de 500
 * destinatários, o teto de fadiga de 3 alertas por 24 h e a ausência de
 * destinatário duplicado (docs/07-devops.md 4.1).
 *
 * Não prova: que o telefone vibra, que o toque abre a tela certa, que a
 * permissão negada se comporta como desenhado e que a entrega acontece com o
 * app encerrado — que é o estado real de quem recebe um alerta de pet perdido.
 * Isso é verificação manual, em homologação, com aparelho físico (BICHUS-136).
 * **O nome do transporte diz isso em voz alta no log de subida**, de propósito:
 * quem ler o log precisa saber, sem deduzir, que nada saiu deste processo.
 *
 * ## Duas decisões que parecem detalhe e não são
 *
 * **1. A porteira roda aqui também.** Um transporte de desenvolvimento que
 * aceitasse o que o de produção recusa ensinaria a regra errada a quem testa
 * contra ele: a mensagem com telefone dentro passaria a semana inteira em
 * `dev`, e só o primeiro envio real diria que ela nunca podia ter existido. É a
 * mesma razão pela qual o transporte `log` do e-mail repete o
 * `conferirDestinatario` do de produção.
 *
 * **2. O token do aparelho NÃO vai para o log** — vai o resumo dele. A exigência
 * 4 da porta é literal: *"o token do aparelho não entra em mensagem de erro nem
 * em log"*, porque ele identifica uma instalação e, para quem tiver a
 * credencial do projeto, é o endereço para onde mandar qualquer coisa. E o log
 * de `dev` é o lugar menos protegido que existe: ele vai para o terminal, para
 * o `docker compose logs` e para a captura de tela do relato.
 *
 * O resumo resolve o que o log precisa responder — **quais** aparelhos, e se
 * algum apareceu duas vezes — sem escrever o endereço. Quem precisar casar o
 * resumo com uma linha do banco resume o token de lá com a mesma função. É a
 * mesma troca de `hashDeAgente` e da identidade do achador: a pergunta que a
 * trilha faz é "foi o mesmo?", e "foi o mesmo?" se responde com o resumo.
 */
import { assegurarSuperficiePublica } from '../../domain/conteudo-do-push.js';
import type { MensagemDePush, PushSender, ResultadoDoEnvio } from '../../ports/push-sender.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { PushConfig } from '../../../../shared/config/app-config.js';
import { criarPushSenderFcm } from './fcm-http-v1.js';

/**
 * Quantos caracteres do resumo vão para o log.
 *
 * Doze hexadecimais são 48 bits. Basta de sobra para distinguir os 500
 * destinatários de um alerta e para ver um repetido; não é o token, e não volta
 * a ser.
 */
const CARACTERES_DO_RESUMO = 12;

/** O aparelho, sem o endereço dele. Ver a decisão 2 no cabeçalho. */
function resumoDoAparelho(token: string): string {
  return hashDeToken(token).toString('hex').slice(0, CARACTERES_DO_RESUMO);
}

/**
 * O transporte que escreve e não envia.
 *
 * `transporte` diz o que é, e diz o que não é. Ele sai no log de subida do
 * processo, e "por onde este processo manda push?" é a primeira pergunta de
 * todo incidente de notificação.
 */
export function criarPushSenderDeLog(): PushSender {
  return {
    transporte: 'log (escreve o payload; NADA sai deste processo)',

    enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio> {
      // Tudo DENTRO do executor, e não antes dele: a porteira LANÇA, e a porta
      // promete `Promise<ResultadoDoEnvio>`. Um `throw` síncrono escaparia do
      // `.catch()` de quem chama — quem trata com `.catch()` nunca chega a
      // instalá-lo se a função lançar antes de devolver. É a mesma forma do
      // transporte `log` do e-mail, e a mesma razão escrita em
      // `aes-gcm-secret-cipher.ts`. O adaptador do FCM é `async` e falha do
      // mesmo jeito; um `log` que falhasse diferente ensinaria a regra errada.
      return new Promise<ResultadoDoEnvio>((resolver) => {
        // Antes de qualquer escrita, e pela mesma razão que o adaptador do FCM
        // a chama antes de pedir o token: a mensagem envenenada não pode nem
        // chegar ao log. O log de push é superfície pública de um jeito
        // próprio — é o único lugar onde o payload de todo mundo se acumula
        // junto.
        assegurarSuperficiePublica(mensagem);

        console.info(
          JSON.stringify({
            evento: 'push.send',
            transporte: 'log',
            // O RESUMO, nunca o token. Exigência 4 da porta.
            aparelho: resumoDoAparelho(mensagem.token),
            titulo: mensagem.titulo,
            corpo: mensagem.corpo,
            dados: mensagem.dados,
            chave_de_agrupamento: mensagem.chaveDeAgrupamento,
            prioridade: mensagem.prioridade,
            validade_em_segundos: mensagem.validadeEmSegundos,
            // A URL não: ela é pública e opaca, mas é longa e o que interessa
            // ao log é se o alerta saiu COM foto — UX 11.1 diz que a foto é o
            // alerta, e um alerta sem ela é outro produto.
            com_imagem: mensagem.imagemUrl !== undefined,
          }),
        );

        // `aceito` é o que a porta define: "o transporte assumiu a entrega".
        // Aqui o transporte é o log, e ele assumiu. Nenhuma camada acima desta
        // pode prometer entrega, e é por isso que o nome do estado não diz
        // "entregue" nem com o FCM do outro lado.
        resolver('aceito');
      });
    },
  };
}

/**
 * O adaptador de log, ou o do FCM quando `PUSH_TRANSPORT=fcm`.
 *
 * **Este arquivo é o único lugar que conhece os dois**, e ele mora em
 * `adapters/external/` pela mesma razão que `criarSecretProvider`: o `import`
 * do arquivo do FCM carrega o nome do provedor no caminho, e nome de provedor
 * não entra fora de `adapters/external/` — é a regra dura do projeto, e é o que
 * o portão de portabilidade varre. Um `if` sobre o transporte escrito em
 * `config/` poria a marca do provedor na camada que o portão protege.
 *
 * A recusa do valor desconhecido NÃO está aqui, e sim em `app-config.ts`: ela
 * precisa derrubar a subida antes de qualquer porta ser aberta, e precisa valer
 * igual para a API e para o worker, que leem a mesma configuração. Aqui o tipo
 * já chegou fechado em dois valores.
 */
export function criarPushSender(config: PushConfig): PushSender {
  if (config.transport === 'log') return criarPushSenderDeLog();

  // `app-config.ts` já exige `FCM_PROJECT` quando o transporte é `fcm`, então
  // isto não deveria acontecer pela configuração. A guarda fica porque o tipo
  // permite (`projeto` é opcional, e é opcional porque com `log` ele não
  // existe) e porque o desfecho sem ela seria um endereço de envio
  // `/v1/projects/undefined/messages:send` — que o transporte recusa com um
  // erro que não diz nada sobre variável de ambiente nenhuma.
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
