/**
 * O consentimento de quem achou o pet para o contato dele chegar ao tutor
 * (decisão do cliente, 03/11/2026).
 *
 * ## Por que o texto mora aqui, e não um ponteiro para a versão de hoje
 *
 * O que a lei cobra não é a caixinha marcada na tela: é a demonstração de que
 * aquela pessoa, naquele dia, leu AQUELE texto. Texto muda; o que a pessoa leu
 * não. Por isso o registro guarda o texto, e este módulo é a única fonte dele —
 * o cliente manda a VERSÃO que exibiu, e o servidor grava o texto que ele mesmo
 * publica para aquela versão. Texto que o cliente mandasse não provaria nada,
 * porque o cliente é a parte interessada.
 *
 * `TEXTOS` é **apenda, e nunca reescreve**, pelo mesmo motivo: a versão antiga
 * continua tendo de resolver para o texto que foi lido quando ela era a atual.
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide se o contato sai, e não escreve o recado que o TUTOR lê — esse é
 * montado em `messaging/domain/divulgacao-de-contato.ts`, **dentro da transação
 * e a partir da linha gravada**. Quem decide que o contato sai é a existência da
 * linha de `finder_contact_consents`: não há booleano nenhum neste caminho, e por
 * isso não há bandeira para esquecer.
 */

/**
 * A única finalidade declarada. Espelha o `CHECK` de
 * `finder_contact_consents.purpose` e `FinalidadeDaDivulgacao` do módulo
 * `messaging`, que é quem a grava — este módulo só a LÊ de volta na prova.
 */
export type FinalidadeDoConsentimento = 'owner_contact';

export const VERSAO_ATUAL_DO_CONSENTIMENTO = '2026-11-03';

/** O teto de `consent_version` no contrato: rótulo de versão, não texto. */
const TAMANHO_MAXIMO_DA_VERSAO = 20;

/**
 * O texto que o achador lê ao lado do botão, por versão. **Apenda; não reescreve
 * linha nenhuma daqui.**
 *
 * O texto diz as quatro coisas que fazem o consentimento existir: o que sai, para
 * quem sai, para que serve, e que dá para avisar sem compartilhar nada — sem a
 * última, o consentimento não é livre, e sem as outras três ele não é informado.
 */
const TEXTOS: ReadonlyMap<string, string> = new Map([
  [
    '2026-11-03',
    'Aceito compartilhar com o tutor deste pet os dados de contato que eu preenchi ' +
      'aqui — nome, e-mail e telefone —, com a finalidade exclusiva de ele entrar em ' +
      'contato comigo para recuperar o animal. O Bichu não usa esses dados para outra ' +
      'coisa e não os mostra a mais ninguém. Compartilhar é opcional: sem isso, o meu ' +
      'recado e a minha foto continuam chegando ao tutor pela conversa do Bichu.',
  ],
]);

/**
 * O texto publicado daquela versão, ou `undefined` se a versão não é nossa — e
 * aí não há consentimento a gravar, porque não se sabe o que a pessoa leu.
 */
export function textoDoConsentimento(versao: string): string | undefined {
  const limpa = versao.trim();
  if (limpa === '' || limpa.length > TAMANHO_MAXIMO_DA_VERSAO) return undefined;
  return TEXTOS.get(limpa);
}

/** O que o achador declarou compartilhar, já validado. */
export interface ContatoParaDivulgar {
  readonly nome: string | undefined;
  readonly email: string | undefined;
  readonly telefone: string | undefined;
}

/**
 * O consentimento **como a gravação o devolveu**. Não é parâmetro opcional em
 * lugar nenhum: sem esta prova não há como montar o recado da divulgação.
 */
export interface ConsentimentoDeContatoGravado {
  readonly consentidoEm: Date;
  readonly finalidade: FinalidadeDoConsentimento;
  readonly versao: string;
  /** O texto que a pessoa leu, como ele estava naquele dia. */
  readonly texto: string;
}

/** O que o serviço pede para gravar e divulgar, já validado. */
export interface PedidoDeDivulgacaoDeContato {
  readonly contato: ContatoParaDivulgar;
  readonly versaoDoConsentimento: string;
  /** O texto que o SERVIDOR publica para aquela versão, já resolvido aqui. */
  readonly textoDoConsentimento: string;
  readonly nomeDoPet: string | null;
}

/**
 * Há alguma coisa para divulgar?
 *
 * Consentir em compartilhar **nada** não é consentimento: é uma linha de registro
 * sem objeto. `display_name` sozinho não conta, porque o nome já chegava ao tutor
 * antes desta decisão — o que esta decisão abre é o canal de contato.
 */
export function temContatoNovoParaDivulgar(contato: ContatoParaDivulgar): boolean {
  return contato.email !== undefined || contato.telefone !== undefined;
}
