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

/** A leitura do dono, como consulta ainda não executada. */
export function construtorDaLeitura(
  db: DbExecutor,
  dono: UserId,
  familia: FamiliaDeSessao,
  agora: Instant,
) {
  return db
    .selectFrom('user_reference_locations')
    .select([
      sql<number>`ST_Y(reference_point::geometry)`.as('lat'),
      sql<number>`ST_X(reference_point::geometry)`.as('lon'),
      'precision_m',
      'source',
      'captured_at',
      'expires_at',
    ])
    .where('user_id', '=', dono)
    .where('session_family_id', '=', familia)
    .where('expires_at', '>', comoData(agora));
}

/** O apagamento **desta sessão de aparelho**, como consulta ainda não executada. */
export function construtorDoApagamento(db: DbExecutor, dono: UserId, familia: FamiliaDeSessao) {
  return db
    .deleteFrom('user_reference_locations')
    .where('user_id', '=', dono)
    .where('session_family_id', '=', familia);
}

/**
 * O expurgo de retenção. **Não recebe dono**, e a ausência é deliberada: ele não
 * atende ninguém, varre a tabela por validade vencida e só o worker o chama.
 */
export function construtorDoExpurgo(db: DbExecutor, agora: Instant) {
  return db.deleteFrom('user_reference_locations').where('expires_at', '<=', comoData(agora));
}

export function criarLocalizacaoDeReferenciaRepository(db: Db): LocalizacaoDeReferenciaRepository {
  return {
    async gravar(dono, familia, localizacao) {
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
