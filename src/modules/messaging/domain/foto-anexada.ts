/**
 * A tradução do desfecho da higiene no problema que a pessoa recebe.
 *
 * **Um lugar só, usado pelos DOIS lados da conversa.** O lado com conta
 * (`ConversationService.enviar`) e o lado sem conta
 * (`ConversaDoAchadorService.enviar`) chegam aqui com o mesmo
 * [FotoParaAMensagem], e duas traduções do mesmo desfecho divergiriam na
 * primeira que alguém ajustasse — o achador receberia uma frase e o tutor
 * outra para o mesmo fato.
 *
 * ## Nenhum caminho devolve "grave sem a foto"
 *
 * A função devolve a chave ou **levanta**. Não existe retorno que signifique
 * "siga em frente sem a imagem", e a ausência é o desenho: quem anexou uma foto
 * precisa saber que ela não entrou. Gravar o texto em silêncio produz a pior
 * falha possível desta tela — a pessoa acredita ter mandado a prova de que está
 * com o animal, e o outro lado nunca a vê.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { FotoParaAMensagem } from '../ports/foto-da-conversa.js';

/**
 * A chave HIGIENIZADA, ou o problema correspondente ao estado da higiene.
 *
 * `nao-encontrada` vira `validation-failed` apontando o CAMPO, e não 404:
 * o recurso do caminho (a conversa) existe e é do chamador — o que não serve é
 * um valor do corpo. `404` aqui diria que a conversa não existe, que é falso,
 * e mandaria a tela para a lista.
 *
 * Referência inexistente e referência de OUTRO aviso recebem a mesma resposta,
 * pela regra do ADR-0021: distinguir contaria a quem chama que aquele
 * identificador é uma intenção de verdade, de outro aviso — e um aviso diz onde
 * um animal foi visto.
 */
export function chaveHigienizadaOuRecusa(foto: FotoParaAMensagem, campo: string): string {
  switch (foto.situacao) {
    case 'pronta':
      return foto.chaveHigienizada;
    case 'pendente':
      throw problemas.fotoAindaNaoEstaPronta();
    case 'recusada':
      throw problemas.fotoRecusadaNaHigiene(foto.motivo);
    case 'ausente':
      // O tipo que já existia para este fato exato: a intenção foi assinada e
      // os bytes nunca chegaram ao armazenamento.
      throw problemas.envioNaoChegou();
    case 'nao-encontrada':
    default:
      throw problemas.validacao(
        [{ field: campo, code: 'unknown_upload' }],
        'Essa foto não foi encontrada neste aviso.',
      );
  }
}
