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
 * propriedade: o nome está em `params.missingProperty`. Campo obrigatório
 * ausente é o erro mais frequente de qualquer formulário, então ler só
 * `instancePath` deixaria de nomear exatamente o caso que mais precisa ser
 * nomeado. O mesmo vale para `additionalProperties`, cujo nome está em
 * `params.additionalProperty`.
 *
 * As duas pontas se **somam**, e não se escolhem. Dizer "`instancePath` vem
 * vazio" só vale quando a propriedade que faltou é da RAIZ do corpo. Num
 * objeto aninhado -- `delivery_address` do pedido de plaquinha, por exemplo --
 * o `instancePath` vem `/delivery_address` e o nome que falta continua em
 * `params.missingProperty`. Escolher o primeiro que existisse devolvia
 * `delivery_address`, ou seja o CONTÊINER, e o formulário voltava a não saber
 * qual dos oito campos do endereço reclamar: era o mesmo "um ou mais campos"
 * que este arquivo veio tirar, um nível mais fundo. Medido em 18/10 pela isca
 * `5. cada campo obrigatorio do endereco, faltando, e NOMEADO no 400`
 * (`src/modules/tags/adapters/http/pedido-de-plaquinha.test.ts`), que foi quem
 * acusou. Por isso o campo é o caminho MAIS a propriedade nomeada, juntos.
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
 * O caminho da instância **mais** a propriedade que o `keyword` nomeia nos seus
 * `params`, nessa ordem, unidos por ponto. Cada ponta pode faltar:
 *
 * - `required` na raiz: caminho vazio, propriedade `delivery_address`
 *   -> `delivery_address`;
 * - `required` aninhado: caminho `delivery_address`, propriedade
 *   `recipient_name` -> `delivery_address.recipient_name`;
 * - `pattern` num campo: caminho `delivery_address.postal_code`, nenhuma
 *   propriedade nomeada -> `delivery_address.postal_code`.
 *
 * Vazio só quando o achado é sobre o corpo inteiro (um `type` que não bate na
 * raiz, por exemplo), que é o único caso em que não há campo a apontar.
 */
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
