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
 * - **o selo de validado é `contact_channel_verified`**, derivado de
 *   `users.email_verified_at` **ou** `users.phone_verified_at` pela fonte única
 *   da régua, e não um campo que quem envia a foto escolhe.
 *
 * A função não ganhou nenhum comportamento ao sair: ela recebe a conta, a foto
 * e a montagem de URL, e devolve o objeto. Quem continua decidindo QUEM pode
 * chamá-la é a rota, que exige `bearerAuth`.
 */
import type { Conta, FotoDoPerfil } from '../ports/identity-repository.js';
import { canalDeContatoConfirmado } from '../../../shared/db/canal-de-contato-confirmado.js';
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
 * ## O SELO DO DONO É `contact_channel_verified`, E NÃO MAIS `email_verified`
 *
 * **Isto mudou em 21/10/2026, por decisão do cliente**: *"Unificar agora, nas
 * duas — a mesma régua (e-mail OU telefone) nos dois lugares, antes de telefone
 * existir."*
 *
 * O selo que o DONO vê de si era `email_verified`, que é só e-mail. O selo que
 * os OUTROS veem dele é `contact_channel_verified`, que é e-mail **OU**
 * telefone. As duas coincidiam porque nada em `src/` grava `phone_verified_at`
 * — e no dia em que telefone confirmar, a mesma conta apareceria validada para
 * os outros e não para si, com a causa enterrada aqui.
 *
 * Então o selo do dono passa a ser **`contact_channel_verified`**, o MESMO nome
 * e a MESMA régua (`canalDeContatoConfirmado`) dos três schemas de terceiro
 * (`PublicationAuthor`, `PersonProfile`, `ConnectionPerson`).
 *
 * **`email_verified` NÃO foi renomeado nem redefinido**, e isto é a parte que
 * importa: ele continua sendo `emailVerifiedAt !== null`, porque é o que o nome
 * dele diz e porque a tela usa esse booleano para outra coisa — a linha "E-mail
 * confirmado / não confirmado" ao lado do endereço, que fala do e-mail e não do
 * selo. Campo de contrato com nome que mente é a classe de defeito que este
 * projeto mais paga; um `email_verified` que respondesse `true` por causa de um
 * telefone seria exatamente isso.
 *
 * Nenhum dos dois é campo de escrita: não existe campo de selo no corpo de
 * escrita, não existe coluna de selo, e quem envia a foto não o escolhe. É a
 * moldura do cliente que desenha o selo quando o booleano é verdadeiro.
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
    // **O SELO DE VALIDADO DO DONO, pela MESMA régua que os outros veem.**
    contact_channel_verified: canalDeContatoConfirmado(conta),
    created_at: conta.createdAt.toISOString(),
  };
}
