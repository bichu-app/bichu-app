/**
 * A leitura de apoio da sugestao do diretorio: a conta que chama tem canal de
 * contato VERIFICADO?
 *
 * Mora aqui, e nao no `DirectorySuggestionRepository`, pelo motivo escrito no
 * cabecalho daquela porta: ela e a ESCRITA da fila, com um metodo so, e ele nao
 * le. Mesmo arranjo de `modules/transfers/.../kysely-consultas-de-apoio.ts`.
 *
 * ## A condicao e COPIA da de `estadoParaCriarEncontro`
 *
 * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`: e-mail OU
 * telefone, e preenchido-e-nao-verificado nao conta. Na pratica isso e e-mail,
 * porque nada em `src/` grava `phone_verified_at` -- a coluna existe e so e
 * zerada. A condicao e a mesma de proposito: duas definicoes de "validado" sao
 * duas reguas, e a mesma conta seria validada numa tela e nao na outra.
 *
 * `deleted_at IS NULL` acompanha, como nas consultas de apoio da transferencia:
 * conta excluida nao tem canal para onde responder.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { CanalDeContatoDoChamador } from '../../application/sugestao-do-diretorio.js';

export function criarCanalDeContatoDoChamador(db: Db): CanalDeContatoDoChamador {
  return {
    async temCanalVerificado(conta: UserId): Promise<boolean> {
      const linha = await db
        .selectFrom('users')
        .select('users.id')
        .where('users.id', '=', conta)
        .where('users.deleted_at', 'is', null)
        .where((eb) =>
          eb.or([
            eb('users.email_verified_at', 'is not', null),
            eb('users.phone_verified_at', 'is not', null),
          ]),
        )
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
