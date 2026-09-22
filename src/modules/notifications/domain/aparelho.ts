/**
 * O aparelho registrado para push, e a única regra de negócio que ele carrega.
 *
 * ## A regra, e por que ela mora num arquivo só
 *
 * O ADR-0006 lista sete critérios para alguém entrar na conta de quem recebe um
 * alerta. Dois deles são desta história e são **um só predicado**:
 *
 *   > 4. tem ao menos um aparelho com `push_permission = granted` e token
 *   >    válido.
 *
 * `podeReceberPush` é esse predicado, escrito uma vez. Ele aparece de novo como
 * predicado parcial do índice `user_devices_alcancaveis` e como `WHERE` da
 * consulta de alcance, e as três formas precisam dizer a mesma coisa — por isso
 * `elegivel-em-tres-lugares.test.ts` compara o SQL do repositório com esta
 * função em vez de confiar em que alguém lembre.
 *
 * ## `not_asked` não é `denied`, e a distinção é de produto
 *
 * O critério 2 da BICHUS-91 é explícito: quem nunca respondeu a antessala fica
 * `not_asked`, e esse estado **não** dispara a linha de permissão negada na aba
 * Perdidos. Um booleano `permitiu` teria colapsado os dois e apagado a
 * diferença entre "disse não" e "ainda não perguntamos" — que é a diferença
 * entre não insistir e a BICHUS-24 ter uma segunda oportunidade para pedir.
 *
 * ## O que este arquivo deliberadamente não faz
 *
 * Não decide QUEM recebe (isso são os outros cinco critérios do ADR-0006, e a
 * contagem é da BICHUS-20), não envia, não fala com o FCM e não conhece banco.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';

/** As duas do contrato (`Device.platform`). Web está fora desta história. */
export type PlataformaDoAparelho = 'android' | 'ios';

/**
 * O que a pessoa respondeu à antessala da BICHUS-24.
 *
 * Os três valores são os do contrato (`DeviceRegistration.push_permission`), e
 * os três são estados distintos de propósito — ver o cabeçalho.
 */
export type PermissaoDePush = 'granted' | 'denied' | 'not_asked';

/**
 * Por que um aparelho deixou de existir. Vai para a trilha, nunca para a
 * resposta, e é a única memória da revogação depois que a linha some.
 */
export type MotivoDaRevogacao =
  /** O tutor removeu pelo Perfil, ou o app removeu ao sair da conta (critério 3). */
  | 'user_removed'
  /** O FCM recusou o token como inexistente: `UNREGISTERED` ou `NOT_FOUND` (critério 4). */
  | 'token_rejected'
  /**
   * Outra conta registrou o mesmo token do FCM. O aparelho físico trocou de
   * dono ou de conta, e a linha antiga era o endereço para o qual o alerta da
   * conta anterior ainda seria mandado.
   */
  | 'reclaimed_by_other_account';

/**
 * O aparelho como o domínio o conhece.
 *
 * `pushToken` está aqui porque `podeReceberPush` precisa saber se ele existe —
 * e **só** se ele existe. Nenhuma função deste arquivo lê o conteúdo dele, e
 * nada que sai daqui vai para resposta: a montagem da resposta é campo a campo
 * em `device-routes.ts`, e o token não é um dos campos.
 */
export interface Aparelho {
  readonly id: string;
  readonly dono: UserId;
  readonly plataforma: PlataformaDoAparelho;
  readonly pushToken: TokenDeAparelho | null;
  readonly permissao: PermissaoDePush;
  readonly versaoDoApp: string | null;
  readonly versaoDoSistema: string | null;
  readonly registradoEm: Instant;
  readonly vistoEm: Instant;
}

/** O que chega de `POST /v1/me/devices`, já validado pelo schema do contrato. */
export interface RegistroDeAparelho {
  readonly plataforma: PlataformaDoAparelho;
  readonly pushToken: TokenDeAparelho | null;
  readonly permissao: PermissaoDePush;
  readonly versaoDoApp: string | null;
  readonly versaoDoSistema: string | null;
}

/**
 * **Os critérios 1 e 4 do ADR-0006, e nada mais que isso.**
 *
 * Um aparelho com permissão concedida e sem token não é alcançável, e o caso é
 * real em vez de teórico: no iOS o SDK só entrega o token depois do registro no
 * APNs, e existe uma janela entre "a pessoa tocou em Permitir" e "o token
 * chegou". Contar essa janela como alcançável infla `reachable_tutors` com
 * aparelhos para os quais não há endereço para onde mandar — que é a mesma
 * classe de mentira que o ADR-0006 proíbe quando fala do zero.
 */
export function podeReceberPush(aparelho: Aparelho): boolean {
  return aparelho.permissao === 'granted' && aparelho.pushToken !== null;
}

/**
 * A conta tem como ser avisada por push?
 *
 * Recebe a lista dos aparelhos DELA. Não lê banco e não conhece os outros cinco
 * critérios do ADR-0006 — localização, validade, raio, fadiga e o próprio tutor
 * são de outras camadas, e juntá-los aqui faria esta função responder uma
 * pergunta que ela não tem como responder.
 */
export function contaEAlcancavelPorPush(aparelhos: readonly Aparelho[]): boolean {
  return aparelhos.some(podeReceberPush);
}
