/**
 * O que falta no cadastro, e o que isso impede.
 *
 * Duas perguntas de produto que a tela faz o tempo todo e que **não podem** ser
 * respondidas no cliente:
 *
 * - `pending_profile_fields` alimenta o aviso persistente de cadastro
 *   incompleto. Ele existe porque o produto deixa o tutor cadastrar o pet antes
 *   de completar o perfil — e essa decisão só é boa se algo continuar lembrando
 *   dele depois.
 * - `can_open_lost_case` é o **bloqueio** de marcar o pet como perdido sem canal
 *   de contato verificado.
 *
 * ## Por que o bloqueio existe, e por que ele é aqui
 *
 * Um caso de perdido dispara alerta para vizinhos e publica o animal numa lista
 * pública. Se ninguém consegue alcançar o tutor, o caso produz movimento e
 * nenhum reencontro: quem acha o animal avisa, e o aviso cai no vazio. É pior
 * que não ter aberto, porque consumiu a atenção de dezenas de pessoas.
 *
 * A regra vive no servidor porque ela é **condição de uma escrita**, não estado
 * de tela. O cliente que a implementasse sozinho continuaria podendo chamar
 * `POST /v1/pets/{petId}/lost-cases` direto.
 *
 * ## "Canal verificado" é e-mail **ou** telefone, e a disjunção é deliberada
 *
 * Exigir os dois travaria o fluxo no pior momento possível — a pessoa acabou de
 * perder o animal e teria que confirmar um SMS. Um canal alcançável basta para
 * a mediação funcionar.
 */

export type CampoPendente = 'email_verification' | 'phone' | 'display_name' | 'reference_area';

export interface PerfilParaConferir {
  readonly emailVerifiedAt: Date | null;
  readonly phoneE164: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly displayName: string | null;
  readonly referencePostalCode: string | null;
  readonly referenceCity: string | null;
}

/**
 * Na ordem em que a tela deve cobrá-los, e essa ordem não é alfabética: é a da
 * consequência. Verificar o e-mail destrava marcar como perdido; o nome de
 * exibição é o que aparece para quem acha o animal; a área de referência afina
 * o alcance do alerta. O telefone vem por último porque é o mais invasivo de
 * pedir e o único que o produto não usa para nada além de segundo canal.
 */
export function camposPendentesDoPerfil(perfil: PerfilParaConferir): CampoPendente[] {
  const pendentes: CampoPendente[] = [];
  if (perfil.emailVerifiedAt === null) pendentes.push('email_verification');
  if (perfil.displayName === null || perfil.displayName.trim() === '') pendentes.push('display_name');
  // Basta um dos dois: o CEP sozinho já dá bairro e cidade, e exigir os três
  // transformaria "complete seu cadastro" numa lista que ninguém termina.
  if (perfil.referencePostalCode === null && perfil.referenceCity === null) {
    pendentes.push('reference_area');
  }
  if (perfil.phoneE164 === null) pendentes.push('phone');
  return pendentes;
}

/**
 * Verdadeiro quando **algum** canal de contato está verificado.
 *
 * Telefone preenchido e não verificado não conta. Contato não verificado é
 * contato que não sabemos se alcança alguém, e é justamente o caso em que o
 * alerta cai no vazio.
 */
export function podeAbrirCasoDePerdido(perfil: PerfilParaConferir): boolean {
  return perfil.emailVerifiedAt !== null || perfil.phoneVerifiedAt !== null;
}
