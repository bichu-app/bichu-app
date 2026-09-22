/**
 * Memória por requisição, para o trabalho que passou a acontecer duas vezes.
 *
 * O teto por `account` precisa saber de quem é a sessão **antes** do handler,
 * porque é o handler que ele existe para poupar. Mas o handler também precisa,
 * e sem memória a autenticação passaria a rodar duas vezes por requisição: duas
 * verificações de assinatura RS256 e duas leituras de `users` no caminho mais
 * percorrido do produto. Isso não é ineficiência de estilo, é dobrar a carga do
 * banco para aplicar um limite que existe para reduzir carga.
 *
 * `WeakMap` e não uma propriedade na requisição: a entrada some junto com a
 * requisição, sem depender de ninguém lembrar de limpar. O que se guarda é a
 * **promessa**, não o valor resolvido — duas chamadas concorrentes no mesmo
 * ciclo compartilham a mesma ida, em vez de disparar duas.
 */
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
