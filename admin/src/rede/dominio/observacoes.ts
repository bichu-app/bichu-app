/**
 * Conveniencia de tela para `notes` (NetworkEventNotes, D59): recusa antes do
 * envio o que o servidor vai recusar com `contact_or_payment_detected`. A
 * autoridade e do servidor; este detector so evita a viagem e diz o motivo no
 * campo. Mesma normalizacao declarada no contrato: NFKC e remocao de largura
 * zero, para que "1 1 9 9 9..." com caractere invisivel no meio nao passe.
 */

export type Achado = 'telefone' | 'email' | 'link' | 'endereco' | 'pix' | 'bidi';

const LARGURA_ZERO = /[\u200B-\u200D\u2060\uFEFF]/g;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/;

const PADROES: ReadonlyArray<[Achado, RegExp]> = [
  ['email', /[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\barroba\b)\s*[\p{L}\p{N}-]+\s*\.\s*[\p{L}]{2,}/iu],
  ['link', /\bhttps?:\/\/|\bwww\.|\b[\p{L}\p{N}-]+\.(?:com|net|org|app|io|me|ly|link|site|online|info|br)\b/iu],
  ['pix', /\bpix\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu],
  // Telefone, CPF, CNPJ e CEP: oito digitos ou mais, com separadores comuns.
  ['telefone', /(?:\+?\d[\s().-]*){8,}/u],
  ['endereco', /\b(?:rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.|estrada|rodovia)\s+\p{L}|\bn[º°o]\.?\s*\d+|\bcep\b/iu],
];

export function normalizar(texto: string): string {
  return texto.normalize('NFKC').replace(LARGURA_ZERO, '');
}

/** O que o texto traz de canal de contato ou de pagamento. Vazio = limpo. */
export function achadosNasObservacoes(texto: string): Achado[] {
  if (BIDI.test(texto)) return ['bidi'];
  const limpo = normalizar(texto);
  return PADROES.filter(([, re]) => re.test(limpo)).map(([nome]) => nome);
}

export const ERRO_DAS_OBSERVACOES = 'Tire das observações telefone, e-mail, chave Pix ou dados de outra pessoa.';
