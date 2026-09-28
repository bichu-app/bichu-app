/**
 * Conveniencia de tela para `notes` (NetworkEventNotes, D59): recusa antes do
 * envio o que o servidor vai recusar com `contact_or_payment_detected`. A
 * autoridade e do servidor; este detector so evita a viagem e diz o motivo no
 * campo.
 *
 * **Espelha a regra do servidor**, e nao uma regra propria: `errosDasObservacoes`
 * em `src/modules/network/domain/escrita-do-encontro.ts`, que usa o detector do
 * canal mediado (`src/shared/redaction/redigir.ts`: forma canonica sem largura
 * zero, homoglifo e numero por extenso; telefone de 8 a 13 digitos, e-mail,
 * link, CEP, logradouro, ponto de encontro com numero) mais as chaves PIX (a
 * palavra, CPF, CNPJ e chave aleatoria). Recusar aqui o que o servidor aceita,
 * ou aceitar o que ele recusa, e defeito: `test/rede/observacoes-contra-o-servidor.test.ts`
 * compara os dois caso a caso.
 */

export type Achado = 'telefone' | 'email' | 'link' | 'endereco' | 'pix' | 'bidi';

const LARGURA_ZERO = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/u;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/;

const HOMOGLIFOS: Record<string, string> = {
  '\uFF10': '0', '\uFF11': '1', '\uFF12': '2', '\uFF13': '3', '\uFF14': '4',
  '\uFF15': '5', '\uFF16': '6', '\uFF17': '7', '\uFF18': '8', '\uFF19': '9',
  '\uFF41': 'a', '\uFF43': 'c', '\uFF45': 'e', '\uFF4D': 'm', '\uFF4F': 'o',
  '\uFF52': 'r', '\uFF55': 'u', '\uFF56': 'v', '\uFF57': 'w', '\uFF0E': '.',
  '\uFF20': '@', '\uFF1A': ':', '\uFF0F': '/', '\uFF0D': '-',
  '\u0430': 'a', '\u0441': 'c', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
  '\u0445': 'x', '\u0443': 'y', '\u0456': 'i', '\u0455': 's', '\u03BF': 'o',
  '\u0391': 'a', '\u0392': 'b', '\u0395': 'e', '\u039F': 'o', '\u03A1': 'p',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
  '\u00B7': '.', '\u2022': '.', '\u2024': '.',
};

const NUMERO_POR_EXTENSO: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3',
  quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7',
  oito: '8', nove: '9',
};

const SIMBOLO_POR_EXTENSO: Record<string, string> = { arroba: '@', ponto: '.' };

const tirarAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** A forma canonica do servidor (`canonizar`), sem o mapa de posicoes, que aqui nao serve. */
export function canonizar(original: string): string {
  const unidades: Array<{ c: string; simbolo?: boolean }> = [];
  const letra = /\p{L}/u;
  let i = 0;
  while (i < original.length) {
    const c = original[i] ?? '';
    if (LARGURA_ZERO.test(c)) {
      i += 1;
      continue;
    }
    if (letra.test(c)) {
      let j = i;
      while (j < original.length && (letra.test(original[j] ?? '') || LARGURA_ZERO.test(original[j] ?? ''))) j += 1;
      const bruta = original.slice(i, j);
      const limpa = tirarAcento(bruta.replace(new RegExp(LARGURA_ZERO.source, 'gu'), '')).toLowerCase();
      const numero = NUMERO_POR_EXTENSO[limpa];
      const simbolo = SIMBOLO_POR_EXTENSO[limpa];
      if (numero !== undefined) unidades.push({ c: numero });
      else if (simbolo !== undefined) unidades.push({ c: simbolo, simbolo: true });
      else for (const ch of bruta) if (!LARGURA_ZERO.test(ch)) unidades.push({ c: HOMOGLIFOS[ch] ?? tirarAcento(ch).toLowerCase() });
      i = j;
      continue;
    }
    unidades.push({ c: HOMOGLIFOS[c] ?? c.toLowerCase() });
    i += 1;
  }
  unidades.forEach((u, n) => {
    if (!u.simbolo) return;
    for (const v of [unidades[n - 1], unidades[n + 1]]) if (v && /^\s+$/.test(v.c)) v.c = '';
  });
  return unidades.map((u) => u.c).join('');
}

const TELEFONE = /(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d(?:[\s.()-]*\d){7,12}/g;
const EMAIL = /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
const LINK = /(?:https?:\/\/|www\.)[^\s]+|(?<![a-z0-9-])[a-z0-9-]+\.(?:com|net|org|br|me|io|app|link|gg)(?:\.br)?(?:\/[^\s]*)?/;
const CEP = /\d{5}-?\d{3}/;
const LOGRADOURO = /\b(?:rua|r\.|av|av\.|avenida|alameda|al\.|travessa|tv\.|rodovia|rod\.|estrada)\s+[^,.;\n]{1,60}(?:,?\s*(?:n[o\u00B0\u00BA.]?\s*)?\d{1,6}\b)?/;
const PONTO_DE_ENCONTRO = /\b(?:praca|largo|viela|quadra|qd\.?)\s+[^,.;\n]{1,60}?,?\s*(?:n[o\u00B0\u00BA.]?\s*)?\d{1,6}\b/;
const PAGAMENTO: readonly RegExp[] = [
  /\bpix\b/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i,
];

function temTelefone(canonico: string): boolean {
  TELEFONE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TELEFONE.exec(canonico)) !== null) {
    const digitos = m[0].replace(/\D/g, '').length;
    if (digitos >= 8 && digitos <= 13) return true;
  }
  return false;
}

/** O que o texto traz de canal de contato ou de pagamento. Vazio = limpo. */
export function achadosNasObservacoes(texto: string): Achado[] {
  if (BIDI.test(texto)) return ['bidi'];
  const nfkc = texto.normalize('NFKC');
  const canonico = canonizar(nfkc);
  const achados: Achado[] = [];
  if (EMAIL.test(canonico)) achados.push('email');
  if (LINK.test(canonico)) achados.push('link');
  if (CEP.test(canonico) || LOGRADOURO.test(canonico) || PONTO_DE_ENCONTRO.test(canonico)) achados.push('endereco');
  if (temTelefone(canonico)) achados.push('telefone');
  if (PAGAMENTO.some((p) => p.test(nfkc.replace(/[\u200B-\u200F\u2060-\u2064\uFEFF]/gu, '')))) achados.push('pix');
  return achados;
}

export const ERRO_DAS_OBSERVACOES = 'Tire das observações telefone, e-mail, chave Pix ou dados de outra pessoa.';
