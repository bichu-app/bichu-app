/**
 * "Estou num ambiente de gente de verdade?" — uma resposta só, para todos.
 *
 * O predicado já existia, escrito dentro de `app-config.ts` como
 * `exigeChaveDeRotacao`, com o raciocínio inteiro ao lado dele: `prod` e
 * `preprod` valem, `dev` e teste não, e `NODE_ENV=production` vale sozinho
 * porque os estágios de produção do `Dockerfile` o definem e podem não definir
 * `ENVIRONMENT` — se a guarda olhasse só o rótulo, o ambiente que mais precisa
 * dela seria o que escaparia.
 *
 * Ele saiu para cá quando o ADR-0022 precisou da MESMA pergunta para decidir de
 * onde vêm os segredos. O comentário que estava em `app-config.ts` já dizia por
 * que isso não podia ser copiado: *"duas respostas diferentes para 'estou num
 * ambiente de gente de verdade?' viram duas verdades, e a que fica para trás é
 * sempre a que protege"*. Copiar teria sido a segunda verdade.
 *
 * `exigeChaveDeRotacao` continua existindo em `app-config.ts` e continua sendo
 * o nome certo lá — o que mudou é que ele agora delega, em vez de decidir.
 */

export function ehAmbienteHospedado(environment: string): boolean {
  return (
    process.env['NODE_ENV'] === 'production' ||
    environment === 'prod' ||
    environment === 'preprod'
  );
}
