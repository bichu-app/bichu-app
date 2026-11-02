import { sql, type RawBuilder } from 'kysely';
import type { LeitorDeEvidenciasDeCanal } from '../autorizacao/leitor-de-evidencias-de-canal.js';
import type { AsDuasEvidencias } from '../autorizacao/matriz-de-capacidades.js';
import type { Db } from './pool.js';
import type { UserId } from '../types/brands.js';

/**
 * Os apelidos de `users` que as consultas deste repositório usam.
 *
 * `eu` entrou em 02/11/2026 com a listagem da região (`listPeopleInMyRegion`),
 * que junta `users` DUAS vezes: `u` é a pessoa listada e `eu` é quem chama —
 * a régua do canal confirmado é cobrada **nos dois lados**.
 */
export type ApelidoDeUsuarios = 'a' | 'eu' | 'outro' | 'u' | 'users';

/**
 * A régua **como expressão de SQL**, sobre o apelido de `users` que a consulta já
 * tem.
 */
export function canalDeContatoConfirmadoNoSql<T = boolean>(
  apelido: ApelidoDeUsuarios,
): RawBuilder<T> {
  const t = sql.raw(apelido);
  return sql<T>`(${t}.email_verified_at IS NOT NULL OR ${t}.phone_verified_at IS NOT NULL)`;
}

/**
 * A régua **como predicado de TypeScript**, para quem já tem a conta em memória —
 * hoje, as duas projeções de `Me`.
 */
export function canalDeContatoConfirmado(conta: {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}): boolean {
  return conta.emailVerifiedAt !== null || conta.phoneVerifiedAt !== null;
}

/**
 * **AS DUAS EVIDÊNCIAS, e não "qualquer canal"** (cliente, 02/11/2026).
 *
 * Ele decidiu uma capacidade que exige e-mail **E** telefone: *"outra coisa que o
 * usuário também não consegue fazer se ele não tiver o e-mail e o telefone
 * validado é solicitar a criação da tag que enviamos para o endereço dele"*.
 *
 * **Mora neste arquivo de propósito**, ao lado da disjunção: as duas são regras
 * sobre as MESMAS duas colunas, e separá-las seria o primeiro passo para a
 * segunda definição de "validado" que `portao-regua-do-canal-de-contato` existe
 * para impedir. Quem precisar de uma terceira combinação escreve-a aqui também.
 *
 * **NÃO é mais forte que `canalDeContatoConfirmado` numa escada:** é outra
 * pergunta. A conjunção implica a disjunção, e só por isso as duas parecem
 * ordenáveis hoje — a primeira exigência de "só telefone" não seria comparável
 * com "só e-mail", e nenhuma escada expressaria isso. Ver
 * `shared/autorizacao/matriz-de-capacidades.ts`.
 */
export function osDoisCanaisConfirmados(conta: {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}): boolean {
  return conta.emailVerifiedAt !== null && conta.phoneVerifiedAt !== null;
}

/**
 * **A LEITURA DAS DUAS COLUNAS, e ela mora NESTE arquivo por uma razao medida.**
 *
 * A exigência de conjunção (`os_dois_canais`, cliente de 02/11/2026) não se
 * avalia sobre o booleano da disjunção: `canalDeContatoConfirmadoNoSql` responde
 * *"tem algum canal"*, e disso não sai *"tem os dois"*. Então alguém precisa
 * SELECIONAR as duas colunas.
 *
 * Na primeira versão isto estava num arquivo próprio, e
 * `portao-regua-do-canal-de-contato` **reprovou** — ele recusa qualquer linha de
 * código de `src/` que cite `email_verified_at` e `phone_verified_at` junto, fora
 * desta fonte. O portão estava certo e o arquivo estava errado: o invariante que
 * ele protege é *"as duas colunas se encontram num lugar só"*, e um leitor
 * separado era um segundo lugar — hoje inofensivo, e amanhã o lugar onde a
 * segunda definição de "validado" nasce.
 *
 * **O arquivo agora é a fonte única das regras sobre as duas colunas E da leitura
 * delas.** Quem precisar de uma terceira combinação escreve aqui, ao lado das
 * duas que já existem, e o portão continua sendo verdade.
 *
 * `deleted_at IS NULL` porque conta apagada não tem evidência a oferecer: ela
 * devolve `undefined`, que quem chama lê como *"não há conta"* e **não** como
 * *"sem evidência"* — os dois levam a respostas diferentes.
 */
export function criarLeitorDeEvidenciasDeCanal(db: Db): LeitorDeEvidenciasDeCanal {
  return {
    async evidenciasDaConta(conta: UserId): Promise<AsDuasEvidencias | undefined> {
      const linha = await db
        .selectFrom('users')
        .select(['users.email_verified_at', 'users.phone_verified_at'])
        .where('users.id', '=', conta)
        .where('users.deleted_at', 'is', null)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        emailVerifiedAt: linha.email_verified_at,
        phoneVerifiedAt: linha.phone_verified_at,
      };
    },
  };
}
