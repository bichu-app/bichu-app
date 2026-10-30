/** Oito digitos, sem mascara. */
export const DIGITOS_DO_CEP = 8;

/** O maximo que a mascara ocupa: `05435-000`. */
export const LIMITE_DO_CEP = 9;

function somenteDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

/** O que a pessoa digitou, na gramatica brasileira. */
export function mascaraDeCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, DIGITOS_DO_CEP);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** O valor da API, ou `null` quando o que foi digitado nao e um CEP. */
export function cepEmOitoDigitos(valor: string): string | null {
  const d = somenteDigitos(valor);
  return d.length === DIGITOS_DO_CEP ? d : null;
}

/** O CEP gravado, de volta na gramatica de quem le. */
export function cepDosOitoDigitos(cep: string | null | undefined): string {
  if (cep === null || cep === undefined || cep === '') return '';
  return mascaraDeCep(cep);
}

/** A recusa, ao sair do campo. */
export function erraAoSairDoCep(valor: string): boolean {
  return valor.trim() !== '' && cepEmOitoDigitos(valor) === null;
}

export const ERRO_AO_SAIR_DO_CEP = 'O CEP tem oito dígitos. Por exemplo: 05435-000.';
