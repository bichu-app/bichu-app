import { problemas } from '../../../shared/http/errors.js';
import type { FotoParaAMensagem } from '../ports/foto-da-conversa.js';

/** A chave HIGIENIZADA, ou o problema correspondente ao estado da higiene. */
export function chaveHigienizadaOuRecusa(foto: FotoParaAMensagem, campo: string): string {
  switch (foto.situacao) {
    case 'pronta':
      return foto.chaveHigienizada;
    case 'pendente':
      throw problemas.fotoAindaNaoEstaPronta();
    case 'recusada':
      throw problemas.fotoRecusadaNaHigiene(foto.motivo);
    case 'ausente':
      throw problemas.envioNaoChegou();
    case 'nao-encontrada':
    default:
      throw problemas.validacao(
        [{ field: campo, code: 'unknown_upload' }],
        'Essa foto não foi encontrada neste aviso.',
      );
  }
}
