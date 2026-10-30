/** O prefixo do Brasil. Usado quando o que foi digitado nao tem `+`. */
export const DISCAGEM_DO_BRASIL = '55';

export const DIGITOS_DO_FIXO = 8;
export const DIGITOS_DO_CELULAR = 9;
const DIGITOS_DO_DDD = 2;

/**
 * `+` e 8 a 15 digitos, a MESMA forma do `CHECK` do banco e do `pattern` do
 * contrato.
 */
export const FORMA_DE_E164 = /^\+[1-9][0-9]{7,14}$/;

/** O maximo que a mascara brasileira ocupa: `(11) 98765-4321`. */
export const LIMITE_DO_TELEFONE = 16;

function somenteDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

/** O que a pessoa digitou, na gramatica brasileira. */
export function mascaraDeTelefone(valor: string): string {
  if (valor.trimStart().startsWith('+')) {
    return `+${somenteDigitos(valor)}`.slice(0, LIMITE_DO_TELEFONE);
  }
  const d = somenteDigitos(valor).slice(0, DIGITOS_DO_DDD + DIGITOS_DO_CELULAR);
  if (d.length <= DIGITOS_DO_DDD) return d;

  const ddd = d.slice(0, DIGITOS_DO_DDD);
  const resto = d.slice(DIGITOS_DO_DDD);
  const corte = resto.length <= DIGITOS_DO_FIXO ? 4 : 5;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** O valor da API, ou `null` quando o que foi digitado nao e um telefone. */
export function telefoneEmE164(valor: string): string | null {
  const texto = valor.trim();
  if (texto === '') return null;

  if (texto.startsWith('+')) {
    const internacional = `+${somenteDigitos(texto)}`;
    return FORMA_DE_E164.test(internacional) ? internacional : null;
  }

  const d = somenteDigitos(texto);
  if (d.length !== DIGITOS_DO_DDD + DIGITOS_DO_FIXO && d.length !== DIGITOS_DO_DDD + DIGITOS_DO_CELULAR) {
    return null;
  }
  if (d.startsWith('0') || d.startsWith('1') && d[1] === '0') return null;
  const e164 = `+${DISCAGEM_DO_BRASIL}${d}`;
  return FORMA_DE_E164.test(e164) ? e164 : null;
}

/** O E.164 gravado, de volta na gramatica de quem le. */
export function telefoneDoE164(e164: string | null | undefined): string {
  if (e164 === null || e164 === undefined || e164 === '') return '';
  const d = somenteDigitos(e164);
  if (!d.startsWith(DISCAGEM_DO_BRASIL)) return e164;
  const nacional = d.slice(DISCAGEM_DO_BRASIL.length);
  if (
    nacional.length !== DIGITOS_DO_DDD + DIGITOS_DO_FIXO &&
    nacional.length !== DIGITOS_DO_DDD + DIGITOS_DO_CELULAR
  ) {
    return e164;
  }
  return mascaraDeTelefone(nacional);
}

/** A recusa, ao sair do campo. */
export function erraAoSairDoTelefone(valor: string): boolean {
  return valor.trim() !== '' && telefoneEmE164(valor) === null;
}

export const ERRO_AO_SAIR_DO_TELEFONE = 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
