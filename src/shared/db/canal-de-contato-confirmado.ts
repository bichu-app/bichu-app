/**
 * **A RÉGUA DE "CANAL DE CONTATO CONFIRMADO", NUMA FONTE SÓ.**
 *
 * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`: e-mail
 * **OU** telefone, e preenchido-e-não-verificado não conta. Na prática isso é
 * e-mail, porque nada em `src/` grava `phone_verified_at` — a coluna existe e
 * só é zerada.
 *
 * ## POR QUE ESTE ARQUIVO EXISTE (21/10/2026)
 *
 * Decisão do cliente: *"Unificar agora, nas duas — a mesma régua (e-mail OU
 * telefone) nos dois lugares, antes de telefone existir."*
 *
 * Até hoje a condição era **copiada** em cada lugar que precisava dela, e cada
 * cópia trazia um comentário dizendo que a cópia era deliberada *"porque duas
 * definições de validado são duas réguas"*. O raciocínio estava certo e a
 * execução era o próprio risco que ele descrevia: a régua estava escrita em
 * **oito** lugares no SQL e em **dois** no TypeScript, e uma delas já divergia —
 * `Me.email_verified`, o selo que o DONO vê de si, era só e-mail, enquanto
 * `contact_channel_verified`, o selo que os OUTROS veem dele, era e-mail OU
 * telefone.
 *
 * As duas coincidiam porque `phone_verified_at` nunca é gravado. **No dia em
 * que telefone confirmar, a mesma conta apareceria validada para os outros e
 * não para si** — e ninguém ia lembrar que a causa era esta.
 *
 * Então a régua passa a ter **uma** fonte, em duas formas que este arquivo
 * mantém lado a lado de propósito: a expressão de SQL, para quem deriva o
 * booleano dentro de uma consulta, e o predicado de TypeScript, para quem já
 * tem a conta em memória. Ver `regua-do-canal-de-contato.test.ts`, que prende
 * as duas formas à MESMA tabela de verdade — inclusive à linha que hoje não
 * acontece (telefone confirmado, e-mail não).
 *
 * ## O QUE SAI É O BOOLEANO, E NUNCA A DATA NEM QUAL DOS DOIS CANAIS
 *
 * As duas colunas de verificação ficam **dentro** da expressão e nunca na lista
 * de seleção: "o e-mail dela foi confirmado em março" não é assunto de
 * terceiro. É por isso que `canal_verificado` entra nas listas FECHADAS de
 * apelido de saída que os `autorizacao-na-clausula-where.test.ts` cobram, e
 * `email_verified_at` não.
 */
import { sql, type RawBuilder } from 'kysely';

/**
 * Os apelidos de `users` que as consultas deste repositório usam.
 *
 * **Lista fechada, e não `string`**, por duas razões: um apelido fora da lista
 * não compila, e a interpolação abaixo é `sql.raw` — texto, não parâmetro —
 * porque `(?.email_verified_at ...)` não é SQL. Com `string` aberto o tipo
 * deixaria de ser a conferência que ele é aqui.
 */
export type ApelidoDeUsuarios = 'a' | 'outro' | 'u' | 'users';

/**
 * A régua **como expressão de SQL**, sobre o apelido de `users` que a consulta
 * já tem.
 *
 * O texto emitido é **idêntico** ao que as oito cópias emitiam, caractere por
 * caractere — e isso não é coincidência, é o que mantém verdes as varreduras de
 * SQL compilado dos `autorizacao-na-clausula-where.test.ts`, que cobram a
 * expressão pelo nome completo das duas colunas.
 *
 * **O parâmetro de tipo existe por causa de UM chamador**, e não por gosto: a
 * cláusula `where` do Kysely pede `SqlBool` (`boolean | 0 | 1`) e as listas de
 * seleção pedem `boolean`, que é o tipo que as interfaces de linha declaram. O
 * padrão é `boolean` para que só o caso de filtro precise dizer algo.
 *
 * **`COALESCE` não é necessário e por isso não está aqui**: onde ela é derivada
 * o apelido vem de `INNER JOIN users`, então a linha existe, e
 * `x IS NOT NULL OR y IS NOT NULL` é `boolean` e nunca `NULL`.
 */
export function canalDeContatoConfirmadoNoSql<T = boolean>(
  apelido: ApelidoDeUsuarios,
): RawBuilder<T> {
  const t = sql.raw(apelido);
  return sql<T>`(${t}.email_verified_at IS NOT NULL OR ${t}.phone_verified_at IS NOT NULL)`;
}

/**
 * A régua **como predicado de TypeScript**, para quem já tem a conta em
 * memória — hoje, as duas projeções de `Me`.
 *
 * A forma do parâmetro é um recorte e não `Conta` inteira: quem chama passa a
 * conta, e um recorte de duas propriedades deixa claro que **só estas duas**
 * decidem.
 */
export function canalDeContatoConfirmado(conta: {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}): boolean {
  return conta.emailVerifiedAt !== null || conta.phoneVerifiedAt !== null;
}
