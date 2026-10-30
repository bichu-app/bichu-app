/** Um trecho retirado. Espelha `TrechoRedigido` de `shared/db/schema.ts`. */
export interface TrechoRedigido {
  kind: 'phone' | 'email' | 'address' | 'external_link';
  /** Rótulo genérico para a tela. */
  hint: string;
}

export interface ResultadoDaRedacao {
  /** O texto já sem os trechos. */
  texto: string;
  /** O que saiu, na ordem em que aparecia. */
  retirados: TrechoRedigido[];
}

/** O que substitui o trecho. */
const MARCA: Record<TrechoRedigido['kind'], string> = {
  phone: '[telefone removido]',
  email: '[e-mail removido]',
  address: '[endereço removido]',
  external_link: '[link removido]',
};

const DICA: Record<TrechoRedigido['kind'], string> = {
  phone: 'um número de telefone',
  email: 'um endereço de e-mail',
  address: 'um endereço',
  external_link: 'um link externo',
};

/** Pontos de código que não desenham nada e servem para partir uma sequência. */
const LARGURA_ZERO = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/u;

/** Homóglifos: o que parece ASCII na tela e não é. */
const HOMOGLIFOS: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'ａ': 'a', 'ｃ': 'c', 'ｅ': 'e', 'ｍ': 'm', 'ｏ': 'o',
  'ｒ': 'r', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', '．': '.',
  '＠': '@', '：': ':', '／': '/', '－': '-',
  'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p',
  'х': 'x', 'у': 'y', 'і': 'i', 'ѕ': 's', 'ο': 'o',
  'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ο': 'o', 'Ρ': 'p',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  '·': '.', '•': '.', '․': '.',
};

/** Palavra de número para dígito. */
const NUMERO_POR_EXTENSO: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3',
  quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7',
  oito: '8', nove: '9',
};

/** `@` e `.` escritos por extenso, o disfarce mais comum de e-mail e de link. */
const SIMBOLO_POR_EXTENSO: Record<string, string> = {
  arroba: '@',
  ponto: '.',
};

/** Uma unidade de texto: um pedaço do ORIGINAL e a forma canônica dele. */
interface Unidade {
  inicio: number;
  fim: number;
  canonico: string;
  /**
   * Verdadeiro quando esta unidade nasceu de uma PALAVRA que virou símbolo (`arroba`
   * → `@`, `ponto` → `.`).
   */
  deSimbolo?: boolean;
}

function tirarAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Quebra o original em unidades e devolve, junto, a forma canônica inteira e o
 * mapa de cada posição canônica para a unidade que a originou.
 */
function canonizar(original: string): {
  canonico: string;
  mapa: number[];
  unidades: Unidade[];
} {
  const unidades: Unidade[] = [];
  const palavra = /[\p{L}]/u;

  let i = 0;
  while (i < original.length) {
    const c = original[i]!;

    if (LARGURA_ZERO.test(c)) {
      unidades.push({ inicio: i, fim: i + 1, canonico: '' });
      i += 1;
      continue;
    }

    if (palavra.test(c)) {
      let j = i;
      while (j < original.length && (palavra.test(original[j]!) || LARGURA_ZERO.test(original[j]!))) {
        j += 1;
      }
      const bruta = original.slice(i, j);
      const limpa = tirarAcento(bruta.replace(new RegExp(LARGURA_ZERO.source, 'gu'), '')).toLowerCase();
      const traduzida = NUMERO_POR_EXTENSO[limpa] ?? SIMBOLO_POR_EXTENSO[limpa];

      if (traduzida !== undefined) {
        unidades.push({
          inicio: i,
          fim: j,
          canonico: traduzida,
          deSimbolo: SIMBOLO_POR_EXTENSO[limpa] !== undefined,
        });
      } else {
        for (let k = i; k < j; k += 1) {
          const ch = original[k]!;
          const mapeado = HOMOGLIFOS[ch] ?? tirarAcento(ch).toLowerCase();
          unidades.push({ inicio: k, fim: k + 1, canonico: LARGURA_ZERO.test(ch) ? '' : mapeado });
        }
      }
      i = j;
      continue;
    }

    unidades.push({ inicio: i, fim: i + 1, canonico: HOMOGLIFOS[c] ?? c.toLowerCase() });
    i += 1;
  }

  for (let n = 0; n < unidades.length; n += 1) {
    if (!unidades[n]!.deSimbolo) continue;
    for (const vizinho of [n - 1, n + 1]) {
      const u = unidades[vizinho];
      if (u && /^\s+$/.test(u.canonico)) u.canonico = '';
    }
  }

  let canonico = '';
  const mapa: number[] = [];
  unidades.forEach((u, indice) => {
    for (let n = 0; n < u.canonico.length; n += 1) {
      mapa.push(indice);
    }
    canonico += u.canonico;
  });

  return { canonico, mapa, unidades };
}

interface Achado {
  inicio: number;
  fim: number;
  kind: TrechoRedigido['kind'];
}

/** Telefone: 8 a 13 dígitos com separador qualquer entre eles. */
const TELEFONE = /(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d(?:[\s.()-]*\d){7,12}/g;
/**
 * E-mail. O olhar-para-trás na frente não é refinamento de casamento: é o que
 * torna o custo linear, e sem ele o resto desta expressão não adianta.
 */
const EMAIL = /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g;
/** Link. O olhar-para-trás está **só** no segundo ramo, e de propósito. */
const LINK =
  /(?:https?:\/\/|www\.)[^\s]+|(?<![a-z0-9-])[a-z0-9-]+\.(?:com|net|org|br|me|io|app|link|gg)(?:\.br)?(?:\/[^\s]*)?/g;
const CEP = /\d{5}-?\d{3}/g;
/** Endereço: a palavra de logradouro seguida do resto, com o número opcional. */
const LOGRADOURO =
  /\b(?:rua|r\.|av|av\.|avenida|alameda|al\.|travessa|tv\.|rodovia|rod\.|estrada)\s+[^,.;\n]{1,60}(?:,?\s*(?:n[o°º.]?\s*)?\d{1,6}\b)?/g;

/** Ponto de encontro: só vira endereço **com número**. */
const PONTO_DE_ENCONTRO =
  /\b(?:praca|largo|viela|quadra|qd\.?)\s+[^,.;\n]{1,60}?,?\s*(?:n[o°º.]?\s*)?\d{1,6}\b/g;

function achar(canonico: string, regex: RegExp, kind: Achado['kind']): Achado[] {
  const achados: Achado[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(canonico)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (kind === 'phone') {
      const digitos = m[0].replace(/\D/g, '').length;
      if (digitos < 8 || digitos > 13) continue;
    }
    achados.push({ inicio: m.index, fim: m.index + m[0].length, kind });
  }
  return achados;
}

/** Redige telefone, e-mail, endereço e link externo de um texto livre. */
export function redigirCanalMediado(entrada: string | null | undefined): ResultadoDaRedacao {
  if (entrada === null || entrada === undefined || entrada === '') {
    return { texto: entrada ?? '', retirados: [] };
  }

  const { canonico, mapa, unidades } = canonizar(entrada);

  const achados = [
    ...achar(canonico, EMAIL, 'email'),
    ...achar(canonico, LINK, 'external_link'),
    ...achar(canonico, CEP, 'address'),
    ...achar(canonico, LOGRADOURO, 'address'),
    ...achar(canonico, PONTO_DE_ENCONTRO, 'address'),
    ...achar(canonico, TELEFONE, 'phone'),
  ].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  const escolhidos: Achado[] = [];
  let limite = -1;
  for (const a of achados) {
    if (a.inicio >= limite) {
      escolhidos.push(a);
      limite = a.fim;
    }
  }

  if (escolhidos.length === 0) {
    return { texto: entrada, retirados: [] };
  }

  let saida = '';
  let cursor = 0;
  const retirados: TrechoRedigido[] = [];

  for (const a of escolhidos) {
    const unidadeInicial = unidades[mapa[a.inicio]!]!;
    const unidadeFinal = unidades[mapa[a.fim - 1]!]!;
    const inicio = unidadeInicial.inicio;
    let fim = unidadeFinal.fim;
    while (fim < entrada.length && LARGURA_ZERO.test(entrada[fim]!)) fim += 1;

    saida += entrada.slice(cursor, inicio) + MARCA[a.kind];
    retirados.push({ kind: a.kind, hint: DICA[a.kind] });
    cursor = fim;
  }
  saida += entrada.slice(cursor);

  return { texto: saida, retirados };
}
