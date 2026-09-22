/**
 * Persistência da localização de referência, em PostGIS.
 *
 * ## A autorização está na cláusula `WHERE`, e em lugar nenhum além dela
 *
 * ADR-0021. Toda consulta daqui que toca a localização de alguém traz
 * `user_id = :dono`, e nenhuma delas lê a linha para depois comparar o dono num
 * `if`. A diferença entre as duas formas aparece no dia em que alguém esquece o
 * `if`: a consulta sem `WHERE` devolve a linha de outra pessoa, e o teste que
 * pegaria isso é justamente o que não existe.
 *
 * `construtorD*` existe para que essa afirmação seja **verificável** em vez de
 * combinada: `autorizacao-na-clausula-where.test.ts` compila o SQL destas
 * funções, exige o predicado do dono, e carrega a isca que precisa reprovar.
 *
 * ## O ponto entra e sai por SQL, e a coluna nunca é selecionada crua
 *
 * `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography` grava; `ST_Y`/`ST_X`
 * sobre o `::geometry` leem de volta. **A ordem é (lon, lat)** — `ST_MakePoint`
 * recebe X antes de Y, e trocar os dois é o erro clássico do PostGIS: ele não
 * falha, ele grava o Brasil no meio da Somália. É a mesma ordem de
 * `kysely-lost-case-repository.ts`, e o teste de integração mede a distância
 * para provar que ela está certa.
 *
 * `reference_point` não sai por esse nome em resposta nenhuma, e quem exige
 * isso a cada execução é `localizacao-nao-vaza.test.ts`, que lê o nome da
 * coluna direto da migração em vez de repeti-lo.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { OrigemDaLocalizacao } from '../../domain/localizacao-de-referencia.js';
import type { LocalizacaoDeReferenciaRepository } from '../../ports/localizacao-de-referencia-repository.js';

interface LinhaDaLocalizacao {
  lat: number;
  lon: number;
  precision_m: number;
  source: OrigemDaLocalizacao;
  captured_at: Date;
  expires_at: Date;
}

/**
 * A leitura do dono, como consulta ainda não executada.
 *
 * O `WHERE` de validade vem junto do `WHERE` do dono: uma linha vencida é, para
 * todo efeito de produto, uma linha que não existe (critério 7). É isso que faz
 * a conta sair da base de alerta no instante do vencimento, sem depender de o
 * expurgo do worker ter rodado.
 */
export function construtorDaLeitura(db: DbExecutor, dono: UserId, agora: Instant) {
  return db
    .selectFrom('user_reference_locations')
    .select([
      // `::geometry` antes de `ST_Y`/`ST_X` porque as duas não aceitam
      // `geography`. A conversão não move o ponto: troca só a interpretação do
      // mesmo par de coordenadas.
      sql<number>`ST_Y(reference_point::geometry)`.as('lat'),
      sql<number>`ST_X(reference_point::geometry)`.as('lon'),
      'precision_m',
      'source',
      'captured_at',
      'expires_at',
    ])
    .where('user_id', '=', dono)
    .where('expires_at', '>', comoData(agora));
}

/** O apagamento do dono, como consulta ainda não executada. */
export function construtorDoApagamento(db: DbExecutor, dono: UserId) {
  return db.deleteFrom('user_reference_locations').where('user_id', '=', dono);
}

/**
 * O expurgo de retenção. **Não recebe dono**, e a ausência é deliberada: ele
 * não atende ninguém, varre a tabela por validade vencida e só o worker o
 * chama. Está separado das outras duas justamente para que o teste de
 * autorização possa exigir o predicado do dono em todas elas sem precisar abrir
 * uma exceção — exceção em lista de verificação é por onde a próxima entra.
 */
export function construtorDoExpurgo(db: DbExecutor, agora: Instant) {
  return db.deleteFrom('user_reference_locations').where('expires_at', '<=', comoData(agora));
}

export function criarLocalizacaoDeReferenciaRepository(db: Db): LocalizacaoDeReferenciaRepository {
  return {
    async gravar(dono, localizacao) {
      // SQL cru e não o construtor tipado: `geography` não é um tipo que o
      // modelo do Kysely represente, e a coluna é declarada em `schema.ts` como
      // não selecionável e não inserível de propósito — o único caminho para
      // ela é este, onde `ST_MakePoint` está à vista de quem revisa.
      //
      // `ON CONFLICT DO UPDATE` e não `DELETE` seguido de `INSERT`: dois
      // comandos abrem uma janela em que a conta não tem localização nenhuma, e
      // uma consulta de raio que caísse nessa janela tiraria o tutor do alerta
      // sem ninguém ter pedido. "Sempre a última, sem histórico" (critério 5) é
      // a chave primária da tabela; este `ON CONFLICT` é como ela é honrada.
      await sql`
        INSERT INTO user_reference_locations (
          user_id, reference_point, precision_m, source, captured_at, expires_at
        ) VALUES (
          ${dono},
          ST_SetSRID(ST_MakePoint(${localizacao.lon}, ${localizacao.lat}), 4326)::geography,
          ${localizacao.precisaoEmMetros},
          ${localizacao.origem},
          ${comoData(localizacao.capturadaEm)},
          ${comoData(localizacao.expiraEm)}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          reference_point = EXCLUDED.reference_point,
          precision_m     = EXCLUDED.precision_m,
          source          = EXCLUDED.source,
          captured_at     = EXCLUDED.captured_at,
          expires_at      = EXCLUDED.expires_at
      `.execute(db);
    },

    async buscarValida(dono, agora) {
      const linha = (await construtorDaLeitura(db, dono, agora).executeTakeFirst()) as
        | LinhaDaLocalizacao
        | undefined;
      if (linha === undefined) return null;
      return {
        lat: linha.lat,
        lon: linha.lon,
        precisaoEmMetros: linha.precision_m,
        origem: linha.source,
        capturadaEm: linha.captured_at.getTime() as Instant,
        expiraEm: linha.expires_at.getTime() as Instant,
      };
    },

    async apagar(dono) {
      await construtorDoApagamento(db, dono).execute();
    },

    async expurgarVencidas(agora) {
      const resultado = await construtorDoExpurgo(db, agora).executeTakeFirst();
      return Number(resultado.numDeletedRows);
    },
  };
}
