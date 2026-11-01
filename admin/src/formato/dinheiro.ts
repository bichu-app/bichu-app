export const CENTAVOS_MINIMO = 1;
export const CENTAVOS_MAXIMO = 100_000_000;

/** `("1234", "5")` -> `123450`. */
export function centavosDosDigitos(inteiros: string, decimais: string): number | null {
  const parteInteira = inteiros === '' ? 0 : Number.parseInt(inteiros, 10);
  const parteDecimal = decimais === '' ? 0 : Number.parseInt(decimais.padEnd(2, '0'), 10);
  if (Number.isNaN(parteInteira) || Number.isNaN(parteDecimal)) return null;
  const centavos = parteInteira * 100 + parteDecimal;
  if (!Number.isSafeInteger(centavos) || centavos < CENTAVOS_MINIMO || centavos > CENTAVOS_MAXIMO) return null;
  return centavos;
}

function comMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Centavos para o texto brasileiro, **sem** `R$`. */
export function reaisDeCentavos(centavos: number, { centavosRedondos = true }: { centavosRedondos?: boolean } = {}): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  const inteiros = comMilhar(Math.trunc(absoluto / 100).toString());
  const resto = absoluto % 100;
  const sinal = negativo ? '-' : '';
  if (resto === 0 && !centavosRedondos) return `${sinal}${inteiros}`;
  return `${sinal}${inteiros},${String(resto).padStart(2, '0')}`;
}

/** A mascara do campo de valor em reais: **so o que a pessoa ve**. */
export function mascaraDeReais(bruto: string): string {
  const limpo = bruto.replace(/[^\d.,]/g, '');
  if (limpo === '') return '';

  let inteiros: string;
  let decimais: string | null;

  const ultimaVirgula = limpo.lastIndexOf(',');
  if (ultimaVirgula >= 0) {
    inteiros = limpo.slice(0, ultimaVirgula).replace(/\D/g, '');
    decimais = limpo.slice(ultimaVirgula + 1).replace(/\D/g, '').slice(0, 2);
  } else if (/\.\d{1,2}$/.test(limpo) && limpo.indexOf('.') === limpo.lastIndexOf('.')) {
    const ponto = limpo.lastIndexOf('.');
    inteiros = limpo.slice(0, ponto).replace(/\D/g, '');
    decimais = limpo.slice(ponto + 1);
  } else {
    inteiros = limpo.replace(/\D/g, '');
    decimais = null;
  }

  const semZeroAEsquerda = inteiros.replace(/^0+(?=\d)/, '');
  const parteInteira = semZeroAEsquerda === '' ? (decimais === null ? '' : '0') : comMilhar(semZeroAEsquerda);

  return decimais === null ? parteInteira : `${parteInteira},${decimais}`;
}
