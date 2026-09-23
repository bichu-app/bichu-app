/**
 * O achado de schema do Fastify traduzido para os `errors[]` do contrato.
 *
 * ## O defeito que este arquivo fecha
 *
 * O 400 de validação de **corpo** saía com `field: ''` em todos os campos:
 *
 * ```ts
 * problemas.validacao([{ field: '', code: 'schema', message: '...' }], ...)
 * ```
 *
 * O schema do `Problem` declara `errors[].field` justamente para a tela poder
 * marcar o campo errado, e uma cadeia vazia não marca nada. Quem recebia o 400
 * ficava sabendo que "um ou mais campos" não passaram, sem saber qual — num
 * cadastro de pet com nove campos isso é a pessoa relendo tudo. E o dado para
 * preencher já estava ali: o Fastify entrega o achado do Ajv em
 * `erro.validation`, e `validacao-de-parametros.ts` já o lia para parâmetro.
 * Corpo não lia, e eram dois caminhos para a mesma coisa.
 *
 * ## `instancePath` não basta, e é aí que mora o caso mais comum
 *
 * O Ajv reporta `required` **no objeto que perdeu a propriedade**, e não na
 * propriedade: `instancePath` vem vazio e o nome está em
 * `params.missingProperty`. Campo obrigatório ausente é o erro mais frequente
 * de qualquer formulário, então ler só `instancePath` deixaria de nomear
 * exatamente o caso que mais precisa ser nomeado. O mesmo vale para
 * `additionalProperties`, cujo nome está em `params.additionalProperty`.
 *
 * ## O que NÃO sai
 *
 * O **valor** recebido, nunca — pelo mesmo motivo de `redacao-de-url.ts`:
 * parâmetro de caminho pode ser o código da tag, que é credencial ao portador, e
 * corpo pode ser senha. Sai o nome do campo e a regra que ele violou. O nome de
 * uma propriedade que o cliente inventou (`additionalProperties`) é dele e volta
 * para ele: é eco, e não revelação.
 */

/** O que o Fastify entrega ao formatador de erro de schema, e em `erro.validation`. */
export interface ErroDeSchema {
  readonly instancePath?: string;
  readonly keyword?: string;
  readonly message?: string;
  readonly params?: Record<string, unknown>;
}

/** Forma do `errors[]` do contrato. Igual a `ProblemFieldError`, sem o acoplamento. */
export interface CampoComErro {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/**
 * O nome do campo que reprovou.
 *
 * Ordem: o caminho da instância quando existe; senão a propriedade que o
 * `keyword` nomeia nos seus `params`. Vazio só quando o achado é sobre o corpo
 * inteiro (um `type` que não bate na raiz, por exemplo), que é o único caso em
 * que não há campo a apontar.
 */
export function campoDoErro(erro: ErroDeSchema): string {
  const caminho = (erro.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
  if (caminho !== '') return caminho;
  const params = erro.params ?? {};
  return textoDe(params['missingProperty']) ?? textoDe(params['additionalProperty']) ?? '';
}

export function campoDoSchema(erro: ErroDeSchema): CampoComErro {
  return {
    field: campoDoErro(erro),
    code: erro.keyword ?? 'schema',
    message: erro.message ?? 'Valor fora do formato que o contrato declara.',
  };
}

/**
 * Os campos de um lote de achados.
 *
 * Devolve `undefined` quando não há achado nenhum para ler — o chamador decide o
 * que fazer com isso. Inventar um campo aqui seria pior que a cadeia vazia que
 * este arquivo veio tirar: um nome errado manda a pessoa corrigir o que está
 * certo.
 */
export function camposDoSchema(achados: unknown): readonly CampoComErro[] | undefined {
  if (!Array.isArray(achados) || achados.length === 0) return undefined;
  return achados.map((achado) => campoDoSchema((achado ?? {}) as ErroDeSchema));
}
