/**
 * Valor informativo do encontro pago (AdminEventPrice): centavos inteiros,
 * `BRL`, e unidade de lista fechada. O app escreve "R$ 15 por cão"; o painel
 * mostra a mesma forma na previa e na lista.
 */
import { UNIDADES } from './rotulos.ts';
import type { UnidadeDoValor } from './tipos.ts';

const MAXIMO_EM_CENTAVOS = 100_000_000;
const FORMATO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/** "15", "15,5", "15,50" e "1.250,00" viram centavos; o resto, `null`. */
export function centavosDoTexto(texto: string): number | null {
  const t = texto.trim();
  if (!FORMATO.test(t)) return null;
  const [inteiro = '', fracao = ''] = t.replaceAll('.', '').split(',');
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos < 1 || centavos > MAXIMO_EM_CENTAVOS) return null;
  return centavos;
}

export function textoDosCentavos(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return resto === 0 ? inteiro : `${inteiro},${resto.toString().padStart(2, '0')}`;
}

/** "R$ 15 por cão", como o app mostra. */
export function valorComoOAppMostra(centavos: number, unidade: UnidadeDoValor): string {
  return `R$ ${textoDosCentavos(centavos)} ${UNIDADES[unidade]}`;
}
