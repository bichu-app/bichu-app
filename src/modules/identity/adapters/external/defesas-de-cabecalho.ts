/**
 * As defesas de cabeçalho de e-mail, num lugar só, porque agora há **dois**
 * transportes que entregam.
 */
import type { MailConfig } from '../../../../shared/config/app-config.js';
import { motivoDaRecusaDeEndereco } from '../../domain/gramatica-de-endereco.js';

/** Recusa o destinatário perigoso, em vez de limpá-lo. */
export function conferirDestinatario(para: string): void {
  const motivo = motivoDaRecusaDeEndereco(para);
  if (motivo !== null) {
    throw new Error(`destinatário recusado: endereço com ${motivo}`);
  }
}

/** Tudo que fecha uma linha de cabeçalho. */
const QUEBRAS_DE_LINHA_NO_ASSUNTO = new Set([
  0x0a,
  0x0d,
  0x0b,
  0x0c,
  0x85,
  0x2028,
  0x2029,
]);

/** Toda sequência de quebra vira um espaço só, como o `[\r\n]+` que veio antes. */
export function limparAssunto(assunto: string): string {
  let saida = '';
  let quebrou = false;
  for (const ch of assunto) {
    if (QUEBRAS_DE_LINHA_NO_ASSUNTO.has(ch.codePointAt(0) ?? 0)) {
      quebrou = true;
      continue;
    }
    if (quebrou) {
      saida += ' ';
      quebrou = false;
    }
    saida += ch;
  }
  return quebrou ? `${saida} ` : saida;
}

/** O remetente vem da configuração, e a configuração também é entrada. */
export function conferirRemetente(config: MailConfig): void {
  for (const [variavel, valor] of [
    ['MAIL_FROM', config.from],
    ['MAIL_REPLY_TO', config.replyTo],
  ] as const) {
    const motivo = motivoDaRecusaDeEndereco(valor);
    if (motivo !== null) {
      throw new Error(`remetente recusado: ${variavel} com ${motivo}`);
    }
  }
  const nomeQuebra = [...config.fromName].some((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return QUEBRAS_DE_LINHA_NO_ASSUNTO.has(cp) || cp === 0x3c || cp === 0x3e;
  });
  if (nomeQuebra) {
    throw new Error('remetente recusado: MAIL_FROM_NAME com quebra de linha ou delimitador');
  }
}
