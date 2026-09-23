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
import type {
  FamiliaDeSessao,
  LocalizacaoDeReferenciaRepository,
} from '../../ports/localizacao-de-referencia-repository.js';

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
export function construtorDaLeitura(
  db: DbExecutor,
  dono: UserId,
  familia: FamiliaDeSessao,
  agora: Instant,
) {
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
    // SEC-021: a sessão de aparelho entra ao lado do dono, e pelo mesmo motivo.
    // Sem ela, um aparelho leria a localização que outro aparelho da mesma
    // conta informou, e o `GET` passaria a devolver um lugar em que este
    // aparelho nunca esteve.
    .where('session_family_id', '=', familia)
    .where('expires_at', '>', comoData(agora));
}

/**
 * O apagamento **desta sessão de aparelho**, como consulta ainda não executada.
 *
 * Os dois predicados são obrigatórios e cada um responde por uma coisa: o dono
 * é a autorização (ADR-0021), a família é o alcance. Tirar a família apagaria a
 * localização de todos os aparelhos da pessoa num logout de um só, que é
 * exatamente a ambiguidade que a SEC-021 existe para desfazer.
 */
export function construtorDoApagamento(db: DbExecutor, dono: UserId, familia: FamiliaDeSessao) {
  return db
    .deleteFrom('user_reference_locations')
    .where('user_id', '=', dono)
    .where('session_family_id', '=', familia);
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
    async gravar(dono, familia, localizacao) {
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
      //
      // SEC-021: o alvo do `ON CONFLICT` é o PAR. Deixá-lo em `(user_id)`
      // depois da migração não daria erro de sintaxe nem de execução — daria
      // erro de inferência, porque não há mais restrição única sobre `user_id`
      // sozinho, e o Postgres recusa. A recusa é bem-vinda: um alvo que
      // continuasse casando reescreveria a linha do OUTRO aparelho.
      await sql`
        INSERT INTO user_reference_locations (
          user_id, session_family_id, reference_point, precision_m, source,
          captured_at, expires_at
        ) VALUES (
          ${dono},
          ${familia},
          ST_SetSRID(ST_MakePoint(${localizacao.lon}, ${localizacao.lat}), 4326)::geography,
          ${localizacao.precisaoEmMetros},
          ${localizacao.origem},
          ${comoData(localizacao.capturadaEm)},
          ${comoData(localizacao.expiraEm)}
        )
        ON CONFLICT (user_id, session_family_id) DO UPDATE SET
          reference_point = EXCLUDED.reference_point,
          precision_m     = EXCLUDED.precision_m,
          source          = EXCLUDED.source,
          captured_at     = EXCLUDED.captured_at,
          expires_at      = EXCLUDED.expires_at
      `.execute(db);
    },

    async buscarValida(dono, familia, agora) {
      const linha = (await construtorDaLeitura(db, dono, familia, agora).executeTakeFirst()) as
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

    async apagar(dono, familia) {
      const resultado = await construtorDoApagamento(db, dono, familia).executeTakeFirst();
      return Number(resultado.numDeletedRows);
    },

    async expurgarVencidas(agora) {
      const resultado = await construtorDoExpurgo(db, agora).executeTakeFirst();
      return Number(resultado.numDeletedRows);
    },
  };
}
