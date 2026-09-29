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
 * link, CEP, logradouro, ponto de encontro com numero) e, por cima, a
 * conferencia de `normalizarParaConferencia` (letra quebrada e digito que imita
 * letra), dominio e encurtador, `@usuario`, meios de pagamento e dados
 * bancarios. Antes de tudo, `semDatas` troca as datas dd.mm.aaaa e dd/mm/aaaa
 * por um marcador, como o servidor faz. Recusar aqui o que o servidor aceita,
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
/** Copia de `DATA_DE_CALENDARIO` e `semDatas` do servidor (d54fb59). */
const DATA_DE_CALENDARIO = /(?<!\d)(?<!\d[./])(?:0?[1-9]|[12]\d|3[01])([./])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}(?!\d)(?![./]\d)/g;

export function semDatas(texto: string): string {
  return texto.replace(DATA_DE_CALENDARIO, ' data ');
}

/** Copia de `normalizarParaConferencia` do servidor (af9594b). */
export function normalizarParaConferencia(texto: string): { base: string; letras: string } {
  const base = texto
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/gu, '')
    .toLowerCase();
  const IMITA_LETRA: Readonly<Record<string, string>> = { '1': 'i', '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', $: 's' };
  const juntado = base.replace(/(?<![a-z0-9$])([a-z0-9$])([\s.\-_*/|]+)(?:[a-z0-9$]\2){1,}[a-z0-9$](?![a-z0-9$])/g, (m) =>
    m.replace(/[^a-z0-9$]/g, ''),
  );
  const letras = juntado.replace(/[a-z0-9$]+/g, (palavra) =>
    /[a-z]/.test(palavra) ? palavra.replace(/[103457$]/g, (c) => IMITA_LETRA[c] ?? c) : palavra,
  );
  return { base, letras };
}

const TLD =
  'com|net|org|br|me|io|ly|ee|app|link|gg|co|info|site|online|store|shop|xyz|tv|to|bio|page|sh|cc|gd|in|us|so|ai|dev|click|live|social|pay|money|bank|digital|vip|top|club|ws|biz|tk|ml|ga|cf|gq';
const DOMINIO = new RegExp(`(?:^|[^a-z0-9@])[a-z0-9][a-z0-9-]*\\s?\\.\\s?(?:${TLD})(?![a-z0-9])`);
const DOMINIO_COM_CAMINHO = /[a-z0-9-]+\.[a-z]{2,}\/\S+/;
const ARROBA = /(?:^|[^a-z0-9])@[a-z0-9_.]{2,}/;
const PAGAMENTO_POR_PALAVRA = /\b(?:pix(?!el|ot|ar)|picpay|pic\s?pay|mercado\s?pago|nubank|paypal|pagseguro|chave\s+aleatoria)\b/;
const PAGAMENTO_POR_NUMERO: readonly RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/,
  /\b(?:ag|agencia|agenc)\s*[.:]?\s*\d{3,5}(?:-?\d)?\b/,
  /\b(?:cc|c\/c|conta(?:\s+corrente)?|conta\s+poupanca|cp)\s*[.:]?\s*\d{4,}(?:-?[\dx])?\b/,
  /\bbanco\s*[.:]?\s*\d{3}\b/,
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
  const semData = semDatas(texto.normalize('NFKC'));
  const canonico = canonizar(semData);
  const { base, letras } = normalizarParaConferencia(semData);
  const achados: Achado[] = [];
  if (EMAIL.test(canonico)) achados.push('email');
  if (LINK.test(canonico) || DOMINIO.test(base) || DOMINIO.test(letras) || DOMINIO_COM_CAMINHO.test(base) || ARROBA.test(base)) achados.push('link');
  if (CEP.test(canonico) || LOGRADOURO.test(canonico) || PONTO_DE_ENCONTRO.test(canonico)) achados.push('endereco');
  if (temTelefone(canonico)) achados.push('telefone');
  if (PAGAMENTO_POR_PALAVRA.test(letras) || PAGAMENTO_POR_NUMERO.some((p) => p.test(base))) achados.push('pix');
  return achados;
}

export const ERRO_DAS_OBSERVACOES = 'Tire das observações telefone, e-mail, chave Pix ou dados de outra pessoa.';
