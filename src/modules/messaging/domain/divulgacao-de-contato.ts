/**
 * O recado que leva ao TUTOR o contato de quem achou o pet, sob consentimento
 * (decisão do cliente, 03/11/2026).
 *
 * ## Por que ele é mensagem de SISTEMA
 *
 * `ConversaDoAchadorService.enviar` redige o corpo de toda mensagem humana
 * (`redigirCanalMediado`), e redigir é exatamente o que não se quer aqui: o
 * telefone e o e-mail têm de atravessar, porque foi para isso que a pessoa
 * consentiu. Mensagem de sistema não passa pela redação, e por isso ela é a
 * forma certa — não é escolha estética.
 *
 * ## Por que mensagem, e não campo no cabeçalho da conversa
 *
 * O consentimento é **daquele momento**, e a mensagem é imutável e fica no
 * histórico: as duas coisas têm a mesma natureza. Um campo no cabeçalho seria
 * uma projeção viva, recalculada em toda leitura, e a condição que a monta
 * passaria a existir no caminho de LEITURA — onde um erro vaza em toda conversa,
 * para sempre, e não em uma só, uma vez, com registro ao lado. Aqui a divulgação
 * acontece num caminho de ESCRITA, uma vez, dentro da transação que grava o
 * consentimento.
 *
 * ## A finalidade vai escrita
 *
 * Quem recebe dado de contato de um estranho precisa ler para que ele serve. E a
 * última linha é a mesma recomendação de `AVISO_DE_DADO_RETIRADO`, aqui pelo
 * golpe do falso achador: encontro em lugar público é o que protege as duas
 * pontas, e esta mensagem não desarma esse risco — ela só o move de lado.
 */

/** Espelha o `CHECK` de `finder_contact_consents.purpose`. */
export type FinalidadeDaDivulgacao = 'owner_contact';

export const FINALIDADE_DO_CONTATO_DO_ACHADOR: FinalidadeDaDivulgacao = 'owner_contact';

/** A espécie da mensagem, em `conversation_messages.system_kind`. */
export const ESPECIE_DA_DIVULGACAO = 'finder_contact';

/**
 * A finalidade em português, para quem lê. Escrita para caber na frase de
 * [recadoDaDivulgacaoDeContato], que já nomeou quem achou.
 */
export const FINALIDADE_PARA_O_TUTOR = 'você entrar em contato e recuperar seu pet';

export interface ContatoDivulgado {
  readonly nome: string | undefined;
  readonly email: string | undefined;
  readonly telefone: string | undefined;
}

/**
 * O consentimento **como a linha gravada o devolveu**. Não é parâmetro opcional
 * em lugar nenhum: sem esta prova não há como montar o recado.
 */
export interface ConsentimentoGravado {
  readonly consentidoEm: Date;
  readonly finalidade: FinalidadeDaDivulgacao;
  readonly versao: string;
  /** O texto que a pessoa leu, como ele estava naquele dia. */
  readonly texto: string;
}

/**
 * Monta o recado a partir da prova.
 *
 * **Lança** em vez de devolver um recado quando a prova não se sustenta. Ela é
 * chamada de dentro da transação que grava o consentimento, e ali `return`
 * COMITA — o Kysely só desfaz ao lançar. Recusar aqui com `return` deixaria a
 * linha de consentimento gravada e a mensagem fora, ou pior: dependeria de quem
 * chama conferir o resultado.
 */
export function recadoDaDivulgacaoDeContato(
  consentimento: ConsentimentoGravado,
  contato: ContatoDivulgado,
  nomeDoPet: string | null,
): string {
  if (consentimento.texto.trim() === '') {
    throw new Error(
      'divulgação de contato sem o texto do consentimento: sem ele o registro não ' +
        'demonstra o que a pessoa leu, e não há consentimento a exercer',
    );
  }
  /*
   * O tipo diz que só há uma finalidade; esta conferência existe porque o valor
   * vem do BANCO, e tipo não é garantia em tempo de execução. Comparo pela forma
   * larga de propósito: o compilador estreita `finalidade` para `never` dentro do
   * `if`, e aí a própria checagem viraria código morto aos olhos dele.
   */
  const finalidade: string = consentimento.finalidade;
  if (finalidade !== FINALIDADE_DO_CONTATO_DO_ACHADOR) {
    throw new Error(
      `divulgação de contato com finalidade que não é a declarada: ${finalidade}`,
    );
  }

  const linhas: string[] = [];
  if (contato.nome !== undefined) linhas.push(`Nome: ${contato.nome}`);
  if (contato.email !== undefined) linhas.push(`E-mail: ${contato.email}`);
  if (contato.telefone !== undefined) linhas.push(`Telefone: ${contato.telefone}`);
  if (linhas.length === 0) {
    throw new Error('divulgação de contato sem contato nenhum para divulgar');
  }

  const quem = nomeDoPet === null ? 'Quem achou seu pet' : `Quem achou ${nomeDoPet}`;
  return [
    `${quem} aceitou compartilhar o contato com você, com uma finalidade só: ` +
      `${FINALIDADE_PARA_O_TUTOR}. Não use para mais nada.`,
    '',
    ...linhas,
    '',
    'Combine um ponto de encontro público e movimentado.',
  ].join('\n');
}
