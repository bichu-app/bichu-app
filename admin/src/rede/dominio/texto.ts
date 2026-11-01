export function tamanhoComoOServidor(t: string): number {
  return [...t.trim()].length;
}

/** O texto cortado em `max` code points, sem partir um par substituto ao meio. */
export function cortarEmCodePoints(t: string, max: number): string {
  const cp = [...t];
  return cp.length <= max ? t : cp.slice(0, max).join('');
}
