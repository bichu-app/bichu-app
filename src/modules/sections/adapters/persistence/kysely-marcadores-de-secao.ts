/**
 * `section_list_views` -- o marcador de "ja vi" por area (BICHUS-278).
 *
 * ## SEM MARCADOR, TUDO CONTA
 *
 * Ausencia de linha = nunca viu a area, e nesse estado **todo** item publicado
 * conta. Na primeira abertura do app isso pode dar um numero grande; o selo
 * pinta `9+` e o rotulo acessivel diz o numero inteiro. O contrario -- nascer
 * com o marcador em `now()` -- esconderia de quem acabou de instalar tudo o que
 * a comunidade ja tem, que e precisamente o conteudo que faz a pessoa voltar.
 */
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  MarcadoresDeSecao,
  SecaoComContador,
} from '../../ports/marcadores-de-secao.js';

export function criarMarcadoresDeSecao(db: Db): MarcadoresDeSecao {
  return {
    async ler(chamador: UserId): Promise<Partial<Record<SecaoComContador, Instant>>> {
      const linhas = await db
        .selectFrom('section_list_views')
        .select(['section', 'seen_at'])
        .where('user_id', '=', chamador)
        .execute();
      const mapa: Partial<Record<SecaoComContador, Instant>> = {};
      for (const linha of linhas) {
        mapa[linha.section] = linha.seen_at.getTime() as Instant;
      }
      return mapa;
    },

    async marcarVista(
      chamador: UserId,
      secao: SecaoComContador,
      agora: Instant,
    ): Promise<void> {
      const quando = comoData(agora);
      // `ON CONFLICT` e nao `SELECT` + `INSERT`/`UPDATE`: duas abas abertas em
      // dois aparelhos chamam isto ao mesmo tempo, e o caminho em dois passos
      // perderia a corrida com violacao de chave primaria.
      await db
        .insertInto('section_list_views')
        .values({ user_id: chamador, section: secao, seen_at: quando })
        .onConflict((oc) =>
          oc.columns(['user_id', 'section']).doUpdateSet({ seen_at: quando }),
        )
        .execute();
    },
  };
}
