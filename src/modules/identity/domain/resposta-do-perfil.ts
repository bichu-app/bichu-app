/**
 * A resposta `Me`, montada numa FUNÇÃO PURA.
 *
 * ## Por que ela saiu de dentro de `registrarRotasDeIdentidade`
 *
 * Ela morava como closure dentro do registrador de rotas, e lá a única forma de
 * medi-la era subir um Fastify, autenticar e injetar uma requisição. Duas
 * regras que o cliente pediu em 18/10/2026 precisam de medição direta, e as
 * duas são de OMISSÃO — o tipo de regra que um teste de rota mede mal:
 *
 * - **a foto do usuário sai nesta resposta e em nenhuma outra**;
 * - **o selo de validado é `email_verified`**, derivado de
 *   `users.email_verified_at`, e não um campo que quem envia a foto escolhe.
 *
 * A função não ganhou nenhum comportamento ao sair: ela recebe a conta, a foto
 * e a montagem de URL, e devolve o objeto. Quem continua decidindo QUEM pode
 * chamá-la é a rota, que exige `bearerAuth`.
 */
import type { Conta, FotoDoPerfil } from '../ports/identity-repository.js';
import { camposPendentesDoPerfil, podeAbrirCasoDePerdido } from './completude-do-perfil.js';

/** `MyPhoto` do contrato. */
export interface FotoProjetada {
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

/**
 * A foto, com a URL montada na LEITURA.
 *
 * Nunca gravada: `MEDIA_PUBLIC_BASE_URL` é configuração, e uma URL absoluta no
 * banco amarraria cada linha ao domínio do dia (ADR-0007 §11.1 proibição 9).
 *
 * Fora de `ready`, ou sem chave, a URL é **nula** e não uma URL que daria 404: o
 * app precisa distinguir "ainda processando" de "pronta", e uma URL que não
 * serve é a pior das duas respostas.
 */
export function projetarFotoDoPerfil(
  foto: FotoDoPerfil | null,
  urlDeMidia: (chave: string) => string,
): FotoProjetada | null {
  if (foto === null) return null;
  return {
    status: foto.status,
    url: foto.status === 'ready' && foto.publicKey !== null ? urlDeMidia(foto.publicKey) : null,
    rejection_reason: foto.status === 'rejected' ? foto.rejectionReason : null,
  };
}

/**
 * O perfil como o contrato o declara, campo a campo.
 *
 * `pending_profile_fields` e `can_open_lost_case` são calculados na leitura, e
 * não guardados: são função do estado da conta. Uma coluna que os guardasse
 * seria uma segunda fonte, e ela envelheceria na primeira verificação de e-mail
 * que alguém esquecesse de propagar.
 *
 * `reference_area` sai **nula inteira** quando nenhum dos campos existe, em vez
 * de um objeto com quatro nulos: a tela distingue "não informou" de "informou
 * parcialmente", e quatro nulos dentro de um objeto parecem a segunda coisa.
 *
 * **`email_verified` É O SELO DE VALIDADO** que o cliente pediu em 18/10/2026
 * ("um selo na foto dele, se ele estiver validado"). Ele é derivado de
 * `emailVerifiedAt` aqui, na leitura, como sempre foi — não existe campo de selo
 * no corpo de escrita, não existe coluna de selo, e quem envia a foto não o
 * escolhe. É a moldura do cliente que desenha o selo quando este booleano é
 * verdadeiro.
 */
export function projetarMeuPerfil(
  conta: Conta,
  foto: FotoDoPerfil | null,
  urlDeMidia: (chave: string) => string,
): Record<string, unknown> {
  const temArea =
    conta.referencePostalCode !== null ||
    conta.referenceNeighborhood !== null ||
    conta.referenceCity !== null ||
    conta.referenceState !== null;

  return {
    id: conta.id,
    email: conta.email,
    email_verified: conta.emailVerifiedAt !== null,
    pending_email: conta.pendingEmail,
    email_deliverable: conta.emailDeliverable,
    display_name: conta.displayName,
    // O APELIDO VOLTA, E O DESTINATARIO E O DONO.
    //
    // Esta projecao alimenta `getMe`, `updateMe` e -- por
    // `SessionResponse.user` -> `Me` -- tambem `registerUser`, `login`,
    // `refreshSession` e `confirmEmailVerification`. As quatro ultimas tem
    // `security: []`, **mas nao sao anonimas**: cada uma entrega a sessao a
    // quem acabou de provar identidade com senha, com refresh ou com token de
    // e-mail, e sao exatamente as quatro que `portao-contrato-publico`
    // dispensa da varredura de campos, por esse motivo escrito la. Nenhuma
    // rota de TERCEIRO traz este campo.
    //
    // Ele precisa voltar porque a pagina de edicao do perfil mostra o apelido
    // atual para a pessoa poder troca-lo: campo que nao volta e campo que a
    // tela abre vazio e sobrescreve com o que a pessoa digitar.
    //
    // **A DATA DE NASCIMENTO NAO ESTA NESTA LISTA, e a ausencia e a regra.**
    // Medido resolvendo `$ref` sobre o contrato inteiro: `birth_date` sai em
    // ZERO respostas. A assimetria e deliberada -- o apelido *"nao tem relacao
    // com informacoes pessoais"* (cliente, 18/10/2026) e o dono precisa dele
    // de volta; a data existe para ter sido conferida no cadastro, e com idade
    // minima de 16 o titular pode ser adolescente.
    handle: conta.handle,
    // A FOTO DO PRÓPRIO USUÁRIO. **Esta é a única resposta do contrato que a
    // carrega**, e `getMe` exige `bearerAuth` sem alternativa vazia: quem vê é o
    // dono. Mostrá-la a terceiros é exposição de pessoa física e depende de
    // decisão do cliente — o ADR-0025 item 2 proíbe avatar na `Rede` por nome, e
    // `Conversation.participants` diz por extenso que nunca traz foto de perfil.
    photo: projetarFotoDoPerfil(foto, urlDeMidia),
    phone_e164: conta.phoneE164,
    phone_verified: conta.phoneVerifiedAt !== null,
    reference_area: temArea
      ? {
          postal_code: conta.referencePostalCode,
          neighborhood: conta.referenceNeighborhood,
          city: conta.referenceCity,
          state: conta.referenceState,
        }
      : null,
    pending_profile_fields: camposPendentesDoPerfil(conta),
    can_open_lost_case: podeAbrirCasoDePerdido(conta),
    created_at: conta.createdAt.toISOString(),
  };
}
