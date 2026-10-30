/** O que o Fastify entrega ao formatador de erro de schema, e em `erro.validation`. */
export interface ErroDeSchema {
  readonly instancePath?: string;
  readonly keyword?: string;
  readonly message?: string;
  readonly params?: Record<string, unknown>;
}

/** Forma do `errors[]` do contrato. */
export interface CampoComErro {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/** O nome do campo que reprovou. */
export function campoDoErro(erro: ErroDeSchema): string {
  const caminho = (erro.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
  const params = erro.params ?? {};
  const propriedade =
    textoDe(params['missingProperty']) ?? textoDe(params['additionalProperty']);
  if (propriedade === undefined) return caminho;
  return caminho === '' ? propriedade : `${caminho}.${propriedade}`;
}

export function campoDoSchema(erro: ErroDeSchema): CampoComErro {
  return {
    field: campoDoErro(erro),
    code: erro.keyword ?? 'schema',
    message: erro.message ?? 'Valor fora do formato que o contrato declara.',
  };
}

/** Os campos de um lote de achados. */
export function camposDoSchema(achados: unknown): readonly CampoComErro[] | undefined {
  if (!Array.isArray(achados) || achados.length === 0) return undefined;
  return achados.map((achado) => campoDoSchema((achado ?? {}) as ErroDeSchema));
}
