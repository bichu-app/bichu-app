/**
 * O contato de quem achou o pet, lido do formulário da página da plaquinha
 * (decisão do cliente, 03/11/2026).
 *
 * ## Por que a validação é AQUI, e não no navegador
 *
 * A página funciona sem JavaScript (`<form method="post">`, decisão D31), e quem
 * mais depende disso é exatamente esta pessoa: um achador com o animal na mão,
 * num celular ruim. `required` e `type="email"` do HTML ajudam quem tem JS e
 * navegador moderno, e **não valem como validação** — o navegador pode não
 * aplicá-los, e o corpo pode vir de qualquer lugar.
 *
 * ## Por que a recusa vem ANTES de o aviso ser criado
 *
 * `POST /tags/{code}/found-reports` cria o aviso e notifica o tutor. Se o
 * formulário fosse validado depois disso, o jeito de corrigir um telefone
 * digitado errado seria mandar um SEGUNDO aviso — e o primeiro já teria saído sem
 * o contato. Então a leitura acontece primeiro, e um erro aqui não cria nada: a
 * pessoa conserta e envia uma vez só.
 *
 * ## Por que o site é MAIS estrito que o servidor
 *
 * O servidor recusa telefone sem consentimento e aceita e-mail sem consentimento
 * — porque lá o e-mail tem uma finalidade própria e antiga ("avisar a resposta do
 * tutor e o desfecho do caso"). Esta tela não usa essa brecha: ela pede o e-mail
 * **dentro** de "quer que o tutor fale com você?", e guardar um e-mail pedido com
 * essa frase, sem o consentimento, seria coletar sob um pretexto e usar sob
 * outro. Aqui os dois exigem o consentimento.
 */

/** O que a pessoa digitou, já sem espaço nas pontas. Volta para a tela no erro. */
export interface CamposDoContato {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly recado: string;
  readonly consentiu: boolean;
}

export type ErroDoContato = 'consentimento' | 'telefone' | 'contato-vazio';

/** O corpo de `PATCH /v1/finder/found-report`, montado só com o que foi preenchido. */
export interface EnriquecimentoDoAchador {
  readonly message?: string;
  readonly finder_contact?: {
    readonly display_name?: string;
    readonly email?: string;
    readonly phone_e164?: string;
    readonly share_consent?: { readonly accepted: true; readonly consent_version: string };
  };
}

export interface ContatoLido {
  readonly campos: CamposDoContato;
  readonly erros: readonly ErroDoContato[];
  /**
   * O que enriquecer depois de o aviso existir, ou `null` quando não há nada —
   * aí o caminho é o de sempre, de um toque. **Nunca é montado quando há erro.**
   */
  readonly enriquecimento: EnriquecimentoDoAchador | null;
  /** O consentimento foi dado E há contato para divulgar. */
  readonly divulgaContato: boolean;
}

/** O teto de `message` em `FinderFoundReportEnrichment`. */
const TETO_DO_RECADO = 1000;
/** O teto de `finder_contact.display_name`. */
const TETO_DO_NOME = 60;

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Normaliza para `+55DDNNNNNNNNN`, o `pattern` que o contrato declara.
 *
 * Aceita o que a pessoa realmente digita — com parêntese, espaço, hífen, com ou
 * sem o `+55` — porque recusar por pontuação é recusar por nada. Devolve
 * `undefined` quando não dá para montar um número discável, e aí a tela pede para
 * conferir em vez de mandar lixo que o servidor recusaria.
 */
export function telefoneEmE164(digitado: string): string | undefined {
  const digitos = digitado.replace(/\D/g, '');
  if (/^\d{10,11}$/.test(digitos)) return `+55${digitos}`;
  if (/^55\d{10,11}$/.test(digitos)) return `+${digitos}`;
  return undefined;
}

/** Lê o formulário e decide. `versao` é a do texto que a tela exibiu. */
export function lerContatoDoAchador(
  formulario: FormData | null,
  versao: string,
): ContatoLido {
  const campos: CamposDoContato = {
    nome: texto(formulario?.get('nome') ?? null).slice(0, TETO_DO_NOME),
    email: texto(formulario?.get('email') ?? null),
    telefone: texto(formulario?.get('telefone') ?? null),
    recado: texto(formulario?.get('recado') ?? null).slice(0, TETO_DO_RECADO),
    // Caixinha NUNCA pré-marcada: o consentimento é a presença do campo, e
    // ausência é a recusa. É a mesma forma do contrato, onde `accepted` só aceita
    // `true` e o "não" se diz omitindo.
    consentiu: formulario?.get('consentimento') !== null && formulario?.get('consentimento') !== undefined,
  };

  const erros: ErroDoContato[] = [];
  const temEmail = campos.email !== '';
  const telefone = campos.telefone === '' ? undefined : telefoneEmE164(campos.telefone);
  if (campos.telefone !== '' && telefone === undefined) erros.push('telefone');

  const temContato = temEmail || campos.telefone !== '';
  if (temContato && !campos.consentiu) erros.push('consentimento');
  if (campos.consentiu && !temContato) erros.push('contato-vazio');

  if (erros.length > 0) {
    return { campos, erros, enriquecimento: null, divulgaContato: false };
  }

  const divulga = campos.consentiu && temContato;
  const contato = {
    ...(campos.nome === '' ? {} : { display_name: campos.nome }),
    ...(divulga && temEmail ? { email: campos.email } : {}),
    ...(divulga && telefone !== undefined ? { phone_e164: telefone } : {}),
    ...(divulga ? { share_consent: { accepted: true as const, consent_version: versao } } : {}),
  };

  const enriquecimento: EnriquecimentoDoAchador = {
    ...(campos.recado === '' ? {} : { message: campos.recado }),
    ...(Object.keys(contato).length === 0 ? {} : { finder_contact: contato }),
  };

  return {
    campos,
    erros,
    enriquecimento: Object.keys(enriquecimento).length === 0 ? null : enriquecimento,
    divulgaContato: divulga,
  };
}
