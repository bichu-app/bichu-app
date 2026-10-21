/**
 * A leitura de apoio da sugestao do diretorio: a conta que chama tem canal de
 * contato VERIFICADO?
 *
 * Mora aqui, e nao no `DirectorySuggestionRepository`, pelo motivo escrito no
 * cabecalho daquela porta: ela e a ESCRITA da fila, com um metodo so, e ele nao
 * le. Mesmo arranjo de `modules/transfers/.../kysely-consultas-de-apoio.ts`.
 *
 * ## A condicao VEM DA FONTE UNICA, e nao e mais copiada
 *
 * `canalDeContatoConfirmadoNoSql` (`shared/db/canal-de-contato-confirmado.ts`)
 * e a unica definicao de "canal de contato confirmado" do repositorio desde
 * 21/10/2026. Este cabecalho dizia antes que a condicao era *copia* da de
 * `estadoParaCriarEncontro` e que a copia era deliberada; o raciocinio estava
 * certo -- duas definicoes de "validado" sao duas reguas -- e a execucao era o
 * proprio risco, porque a regua estava escrita em oito lugares e uma delas ja
 * divergia (`Me.email_verified`, o selo do DONO, era so e-mail).
 *
 * Na pratica isso e e-mail, porque nada em `src/` grava `phone_verified_at` --
 * a coluna existe e so e zerada.
 *
 * `deleted_at IS NULL` acompanha, como nas consultas de apoio da transferencia:
 * conta excluida nao tem canal para onde responder.
 */
import type { SqlBool } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
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
        .where(canalDeContatoConfirmadoNoSql<SqlBool>('users'))
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
