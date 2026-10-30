/**
 * Valor informativo do encontro pago (AdminEventPrice): centavos inteiros, `BRL`,
 * e unidade de lista fechada.
 */
import { centavosDosDigitos, reaisDeCentavos } from '../../formato/dinheiro.ts';
import { UNIDADES } from './rotulos.ts';
import type { UnidadeDoValor } from './tipos.ts';

const FORMATO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/** "15", "15,5", "15,50" e "1.250,00" viram centavos; o resto, `null`. */
export function centavosDoTexto(texto: string): number | null {
  const t = texto.trim();
  if (!FORMATO.test(t)) return null;
  const [inteiro = '', fracao = ''] = t.replaceAll('.', '').split(',');
  return centavosDosDigitos(inteiro, fracao);
}

/** 1500 -> "15"; 1550 -> "15,50"; 125000 -> "1.250". */
export function textoDosCentavos(centavos: number): string {
  return reaisDeCentavos(centavos, { centavosRedondos: false });
}

/** "R$ 15 por cão", como o app mostra. */
export function valorComoOAppMostra(centavos: number, unidade: UnidadeDoValor): string {
  return `R$ ${textoDosCentavos(centavos)} ${UNIDADES[unidade]}`;
}
