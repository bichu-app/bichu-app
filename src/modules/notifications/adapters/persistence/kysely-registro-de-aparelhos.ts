/** Persistência do aparelho e do token de push. */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  Aparelho,
  PermissaoDePush,
  PlataformaDoAparelho,
} from '../../domain/aparelho.js';
import type {
  RegistroDeAparelhos,
  ResultadoDoRegistro,
} from '../../ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../../ports/push-sender.js';

/** As colunas que compõem um `Aparelho`. */
const COLUNAS = [
  'id',
  'user_id',
  'platform',
  'push_token',
  'push_permission',
  'app_version',
  'os_version',
  'registered_at',
  'last_seen_at',
] as const;

interface LinhaDoAparelho {
  id: string;
  user_id: string;
  platform: PlataformaDoAparelho;
  push_token: string | null;
  push_permission: PermissaoDePush;
  app_version: string | null;
  os_version: string | null;
  registered_at: Date;
  last_seen_at: Date;
}

function comoAparelho(linha: LinhaDoAparelho): Aparelho {
  return {
    id: linha.id,
    dono: linha.user_id as UserId,
    plataforma: linha.platform,
    pushToken: linha.push_token,
    permissao: linha.push_permission,
    versaoDoApp: linha.app_version,
    versaoDoSistema: linha.os_version,
    registradoEm: linha.registered_at.getTime() as Instant,
    vistoEm: linha.last_seen_at.getTime() as Instant,
  };
}

/** A listagem do dono, como consulta ainda não executada. */
export function construtorDaListagem(db: DbExecutor, dono: UserId) {
  return db
    .selectFrom('user_devices')
    .select(COLUNAS)
    .where('user_id', '=', dono)
    .orderBy('last_seen_at', 'desc')
    .orderBy('id', 'desc');
}

/** A remoção pelo dono, como consulta ainda não executada. */
export function construtorDaRemocaoPeloDono(db: DbExecutor, dono: UserId, aparelhoId: string) {
  return db
    .deleteFrom('user_devices')
    .where('id', '=', aparelhoId)
    .where('user_id', '=', dono)
    .returning(COLUNAS);
}

/** A remoção de TODOS os aparelhos do dono, como consulta ainda não executada. */
export function construtorDaRemocaoDeTodosDoDono(db: DbExecutor, dono: UserId) {
  return db.deleteFrom('user_devices').where('user_id', '=', dono).returning('id');
}

/** A remoção pelo token recusado pelo FCM. */
export function construtorDaRemocaoPorToken(db: DbExecutor, token: TokenDeAparelho) {
  return db.deleteFrom('user_devices').where('push_token', '=', token).returning(COLUNAS);
}

/** Os critérios 1 e 4 do ADR-0006, sobre a lista de candidatos. */
export function construtorDosAlcancaveis(db: DbExecutor, candidatos: readonly UserId[]) {
  return db
    .selectFrom('user_devices')
    .select('user_id')
    .distinct()
    .where('user_id', 'in', candidatos)
    .where('push_permission', '=', 'granted')
    .where('push_token', 'is not', null);
}

/** O endereço de envio, relido no instante do envio. */
export function construtorDoEnderecoDeEnvio(db: DbExecutor, aparelhoId: string) {
  return db
    .selectFrom('user_devices')
    .select('push_token')
    .where('id', '=', aparelhoId)
    .where('push_permission', '=', 'granted')
    .where('push_token', 'is not', null);
}

export function criarRegistroDeAparelhos(
  db: Db,
  ids: { uuidv7(): string },
): RegistroDeAparelhos {
  return {
    async registrar(dono, entrada, agora): Promise<ResultadoDoRegistro> {
      const quando = comoData(agora);

      return db.transaction().execute(async (trx) => {
        const anterior =
          entrada.pushToken === null
            ? undefined
            : await trx
                .selectFrom('user_devices')
                .select('user_id')
                .where('push_token', '=', entrada.pushToken)
                .executeTakeFirst();

        const alvo =
          entrada.pushToken === null
            ? sql`(user_id, platform) WHERE push_token IS NULL`
            : sql`(push_token) WHERE push_token IS NOT NULL`;

        const inserida = await sql<LinhaDoAparelho>`
          INSERT INTO user_devices (
            id, user_id, platform, push_token, push_permission,
            app_version, os_version, registered_at, last_seen_at
          ) VALUES (
            ${ids.uuidv7()},
            ${dono},
            ${entrada.plataforma},
            ${entrada.pushToken},
            ${entrada.permissao},
            ${entrada.versaoDoApp},
            ${entrada.versaoDoSistema},
            ${quando},
            ${quando}
          )
          ON CONFLICT ${alvo} DO UPDATE SET
            user_id         = EXCLUDED.user_id,
            platform        = EXCLUDED.platform,
            push_token      = EXCLUDED.push_token,
            push_permission = EXCLUDED.push_permission,
            app_version     = EXCLUDED.app_version,
            os_version      = EXCLUDED.os_version,
            last_seen_at    = EXCLUDED.last_seen_at
          RETURNING
            id, user_id, platform, push_token, push_permission,
            app_version, os_version, registered_at, last_seen_at
        `.execute(trx);

        if (entrada.pushToken !== null) {
          await trx
            .deleteFrom('user_devices')
            .where('user_id', '=', dono)
            .where('platform', '=', entrada.plataforma)
            .where('push_token', 'is', null)
            .execute();
        }

        const linha = inserida.rows[0];
        if (linha === undefined) {
          throw new Error(
            'INSERT ... ON CONFLICT DO UPDATE em user_devices não devolveu linha. ' +
              'O registro não aconteceu, e responder como se tivesse acontecido é a ' +
              'falha silenciosa que a BICHUS-91 existe para não ter.',
          );
        }

        const donoAnterior = anterior?.user_id;
        return {
          aparelho: comoAparelho(linha),
          reivindicadoDe:
            donoAnterior === undefined || donoAnterior === dono
              ? null
              : (donoAnterior as UserId),
        };
      });
    },

    async listarDoDono(dono) {
      const linhas = (await construtorDaListagem(db, dono).execute()) as LinhaDoAparelho[];
      return linhas.map(comoAparelho);
    },

    async revogarDoDono(dono, aparelhoId) {
      const linha = (await construtorDaRemocaoPeloDono(
        db,
        dono,
        aparelhoId,
      ).executeTakeFirst()) as LinhaDoAparelho | undefined;
      return linha === undefined ? null : comoAparelho(linha);
    },

    async revogarTodosDoDono(dono) {
      const linhas = await construtorDaRemocaoDeTodosDoDono(db, dono).execute();
      return linhas.length;
    },

    async revogarPorToken(token) {
      const linha = (await construtorDaRemocaoPorToken(db, token).executeTakeFirst()) as
        | LinhaDoAparelho
        | undefined;
      return linha === undefined ? null : comoAparelho(linha);
    },

    async contasAlcancaveisPorPush(candidatos) {
      if (candidatos.length === 0) return new Set<UserId>();
      const linhas = await construtorDosAlcancaveis(db, candidatos).execute();
      return new Set(linhas.map((linha) => linha.user_id as UserId));
    },

    async enderecoDeEnvio(aparelhoId) {
      const linha = await construtorDoEnderecoDeEnvio(db, aparelhoId).executeTakeFirst();
      if (linha === undefined || linha.push_token === null) return null;
      return linha.push_token;
    },
  };
}
