/** O mesmo schema, sem nenhuma chave `default`, em qualquer profundidade. */
export function semPadroes(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(semPadroes);
  if (typeof schema !== 'object' || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([chave]) => chave !== 'default')
      .map(([chave, valor]) => [chave, semPadroes(valor)]),
  );
}

/** `semPadroes` com o tipo que o `schema.body` do Fastify espera. */
export function corpoSemPadroes(schema: Record<string, unknown>): Record<string, unknown> {
  return semPadroes(schema) as Record<string, unknown>;
}
