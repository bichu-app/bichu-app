const memorias = new WeakMap<object, Map<string, Promise<unknown>>>();

export function memoDaRequisicao<T>(
  request: object,
  chave: string,
  produzir: () => Promise<T>,
): Promise<T> {
  let porChave = memorias.get(request);
  if (porChave === undefined) {
    porChave = new Map<string, Promise<unknown>>();
    memorias.set(request, porChave);
  }
  const guardada = porChave.get(chave);
  if (guardada !== undefined) return guardada as Promise<T>;

  const nova = produzir();
  porChave.set(chave, nova);
  return nova;
}
