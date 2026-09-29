/**
 * "Este transporte precisa do token do provedor?" — uma resposta só, para todos.
 *
 * O predicado já existia, escrito dentro de `app-config.ts` como
 * `exigeTokenDoProvedor`, com o raciocínio ao lado dele: `postmark` entrega de
 * verdade, por HTTP, e o token vai no cabeçalho `X-Postmark-Server-Token`;
 * `smtp` fala com o receptor local e `log` não fala com ninguém.
 *
 * Ele saiu para cá pela MESMA razão que tirou `ehAmbienteHospedado` de lá: o
 * ADR-0022 precisou da mesma pergunta em `segredos.ts`, para decidir QUAIS
 * segredos são resolvidos na subida, e a resposta não podia ser copiada.
 *
 * ## O que a cópia custou, medido
 *
 * Até 29/09/2026 as duas metades discordavam de propósito: `app-config.ts`
 * EXIGIA o token só no ramo `postmark`, e `segredos.ts` o RESOLVIA sempre. A
 * assimetria estava escrita e argumentada, e mesmo assim o resultado foi que
 * `api` e `worker` morriam na subida por `MAIL_API_TOKEN` vazio **com
 * `MAIL_TRANSPORT=smtp`** — isto é, pelo caminho que o `.env.example` manda um
 * desenvolvedor novo seguir, cobrando um segredo que nenhum código daquela
 * subida leria.
 *
 * Agora há uma pergunta e uma resposta. Quem resolve e quem exige leem a MESMA
 * função, e a divergência deixa de ser possível em vez de ser vigiada.
 */

/** Os transportes que `MAIL_TRANSPORT` aceita. Valor fora daqui não sobe. */
export type TransporteDeEmail = 'smtp' | 'postmark' | 'log';

/** O padrão de `MAIL_TRANSPORT`, e o que `dev` usa: o receptor local. */
export const TRANSPORTE_DE_EMAIL_PADRAO: TransporteDeEmail = 'smtp';

/**
 * Qual transporte de e-mail exige o token do provedor.
 *
 * Função com nome, e não `=== 'postmark'` embutido na linha do `requireEnv`,
 * pelo mesmo motivo de `exigeProjetoDoFcm`: é ela que decide se o processo
 * sobe, e uma decisão dessas precisa de um lugar para ser lida e apontada. A
 * forma gêmea não é coincidência — as duas respondem a mesma pergunta para dois
 * canais, e escrever a segunda diferente da primeira é como as duas listas de
 * caractere proibido da BICHUS-198 começaram.
 *
 * Recebe `string`, e não `TransporteDeEmail`, porque `segredos.ts` a consulta
 * ANTES de `app-config.ts` ter validado o valor. Valor desconhecido responde
 * `false` de propósito: quem morre por ele é `app-config.ts`, citando o que veio
 * e os aceitos, e essa mensagem é melhor do que "falta MAIL_API_TOKEN".
 */
export function exigeTokenDoProvedor(transporte: string): boolean {
  return transporte === 'postmark';
}

/**
 * O transporte que ESTE processo vai usar, lido do ambiente.
 *
 * Mesma leitura que `carregarEmail` faz em `app-config.ts` (`optionalEnv` com o
 * mesmo padrão), e é isso que permite a `segredos.ts` decidir a lista antes de
 * a configuração existir. Se os dois padrões divergirem, a subida volta a
 * cobrar um segredo que ninguém lê — que é o defeito inteiro.
 */
export function transporteDeEmailDoAmbiente(
  ambiente: Record<string, string | undefined> = process.env,
): string {
  const bruto = ambiente['MAIL_TRANSPORT'];
  return bruto === undefined || bruto.trim() === '' ? TRANSPORTE_DE_EMAIL_PADRAO : bruto;
}
