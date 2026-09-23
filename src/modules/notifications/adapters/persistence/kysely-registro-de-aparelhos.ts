/**
 * Persistência do aparelho e do token de push.
 *
 * ## A autorização está na cláusula `WHERE`, e em lugar nenhum além dela
 *
 * ADR-0021. Toda consulta daqui que toca o aparelho de alguém **pelo
 * identificador** traz `user_id = :dono` junto, e nenhuma delas lê a linha para
 * depois comparar o dono num `if`. A diferença entre as duas formas só aparece
 * no dia em que alguém mexe no `if` — e aí não existe teste que acuse, porque o
 * `if` era o teste.
 *
 * `construtorD*` existe para que essa afirmação seja **verificável** em vez de
 * combinada: `autorizacao-de-aparelho-na-clausula-where.test.ts` compila o SQL
 * destas funções, exige o predicado do dono, e carrega a isca que precisa
 * reprovar.
 *
 * ## O token nunca é selecionado para fora deste arquivo por engano
 *
 * As leituras que produzem `Aparelho` trazem `push_token`, porque
 * `podeReceberPush` precisa saber se ele existe. O que impede o vazamento não é
 * a ausência dele aqui: é que a resposta HTTP é montada **campo a campo** em
 * `device-routes.ts`, nunca por espalhamento do objeto do domínio, e que
 * `token-de-push-nao-vaza.test.ts` cobra zero ocorrência de `push_token` em
 * qualquer resposta do contrato, com isca.
 *
 * ## `ON CONFLICT` e não `SELECT` seguido de `INSERT` ou `UPDATE`
 *
 * O registro é idempotente pelo token, e dois aparelhos podem mandar o mesmo
 * token em milissegundos de diferença (o app registra na abertura, na mudança
 * de permissão e na rotação do token). Ler para decidir abriria a janela em que
 * os dois leem "não existe" e os dois inserem — e quem resolveria seria o
 * índice único, com um 500 na cara de alguém. `ON CONFLICT` deixa o banco
 * decidir, que é onde a corrida se resolve sem perder.
 */
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

/** As colunas que compõem um `Aparelho`. Uma lista, para as leituras não divergirem. */
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
    // Ordem estável para a tela não embaralhar a cada leitura. `last_seen_at`
    // primeiro porque o aparelho que a pessoa está segurando é o que ela
    // reconhece, e `id` como desempate porque UUIDv7 é ordenável no tempo.
    .orderBy('last_seen_at', 'desc')
    .orderBy('id', 'desc');
}

/**
 * A remoção pelo dono, como consulta ainda não executada.
 *
 * `returning` e não um `SELECT` antes: um comando, uma viagem, e nenhuma janela
 * entre conferir e apagar. O que volta é o que de fato saiu — se a linha era de
 * outra conta, não volta nada, e é esse nada que vira 404.
 */
export function construtorDaRemocaoPeloDono(db: DbExecutor, dono: UserId, aparelhoId: string) {
  return db
    .deleteFrom('user_devices')
    .where('id', '=', aparelhoId)
    .where('user_id', '=', dono)
    .returning(COLUNAS);
}

/**
 * A remoção de TODOS os aparelhos do dono, como consulta ainda não executada.
 *
 * O `WHERE` é a autorização e é só ele (ADR-0021): não há identificador de
 * recurso vindo de fora para conferir, então não há a forma "leia, compare,
 * apague" para escrever errado. O `RETURNING` é o que permite CONTAR o que
 * saiu, e a contagem é o que vai para a trilha de `auth.sessions_revoked` como
 * `devices_removed` — sem ela, o evento diria que a sessão caiu e não diria se
 * o endereço de entrega caiu junto, que é exatamente o SEC-019.
 */
export function construtorDaRemocaoDeTodosDoDono(db: DbExecutor, dono: UserId) {
  return db.deleteFrom('user_devices').where('user_id', '=', dono).returning('id');
}

/**
 * A remoção pelo token recusado pelo FCM. **Não recebe dono** — o argumento
 * está no cabeçalho da porta: o token é a autorização, e ele endereça uma linha
 * só (índice `user_devices_um_token_uma_conta`).
 */
export function construtorDaRemocaoPorToken(db: DbExecutor, token: TokenDeAparelho) {
  return db.deleteFrom('user_devices').where('push_token', '=', token).returning(COLUNAS);
}

/**
 * Os critérios 1 e 4 do ADR-0006, sobre a lista de candidatos.
 *
 * `distinct` porque a pergunta é "esta CONTA é alcançável", e uma conta com três
 * aparelhos alcançáveis é alcançável uma vez. Sem ele, quem contasse as linhas
 * contaria aparelhos e chamaria o resultado de tutores.
 */
export function construtorDosAlcancaveis(db: DbExecutor, candidatos: readonly UserId[]) {
  return db
    .selectFrom('user_devices')
    .select('user_id')
    .distinct()
    .where('user_id', 'in', candidatos)
    // Os DOIS critérios, e os mesmos do predicado parcial do índice
    // `user_devices_alcancaveis` e de `podeReceberPush` no domínio. As três
    // formas são comparadas por `elegibilidade-em-tres-lugares.test.ts`.
    .where('push_permission', '=', 'granted')
    .where('push_token', 'is not', null);
}

/**
 * O endereço de envio, relido no instante do envio.
 *
 * Os mesmos dois critérios da consulta acima, e de propósito: um aparelho que
 * perdeu a permissão entre a montagem da lista e o envio não é "um aparelho com
 * token", é um aparelho que não deve receber. Repetir o predicado aqui é o que
 * faz a releitura valer alguma coisa — sem ele, bastaria a linha existir.
 */
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

      // Quem era o dono do token ANTES. Lido na mesma transação do `INSERT`,
      // porque é a única forma de a trilha saber quem perdeu o aparelho: o
      // `ON CONFLICT` sobrescreve `user_id` e a informação some no mesmo
      // comando que a produz.
      return db.transaction().execute(async (trx) => {
        const anterior =
          entrada.pushToken === null
            ? undefined
            : await trx
                .selectFrom('user_devices')
                .select('user_id')
                .where('push_token', '=', entrada.pushToken)
                .executeTakeFirst();

        // SQL cru e não o construtor tipado por um motivo só: são DOIS
        // `ON CONFLICT` possíveis (o token, e o par conta/plataforma quando não
        // há token) e o Postgres aceita apenas um por comando. Escolher o alvo
        // aqui deixa a escolha à vista de quem revisa, em vez de escondê-la
        // numa expressão condicional de construtor.
        //
        // `COALESCE(user_devices.registered_at, ...)` não aparece: em conflito,
        // `registered_at` é DEIXADO como estava. É o que faz "há quanto tempo
        // este aparelho existe" sobreviver à rotação de token do FCM.
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

        // A LINHA SEM TOKEN DA MESMA CONTA E DA MESMA PLATAFORMA SAI JUNTO.
        //
        // O caso é o fluxo normal do iOS, não uma borda: o SDK só entrega token
        // depois do registro no APNs, então a primeira abertura registra
        // `not_asked` SEM token e a permissão concedida registra o mesmo
        // aparelho COM token. São dois alvos de conflito diferentes, então o
        // segundo registro insere linha nova — e o Perfil passaria a mostrar um
        // iPhone fantasma que ninguém consegue remover porque ele não é um
        // aparelho, é a lembrança de uma pergunta.
        //
        // Colapsar não perde informação acionável: uma linha sem token não é
        // endereço de entrega, é um fato de permissão sobre (pessoa,
        // plataforma) — o mesmo argumento do índice único que a bloqueia em uma
        // por plataforma. Não vai para a trilha como revogação porque não havia
        // endereço para revogar.
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
          // `ON CONFLICT DO UPDATE` sempre devolve linha. Chegar aqui significa
          // que o comando mudou de forma, e o silêncio seria o aparelho não
          // registrado com a resposta 200 na cara do app.
          throw new Error(
            'INSERT ... ON CONFLICT DO UPDATE em user_devices não devolveu linha. ' +
              'O registro não aconteceu, e responder como se tivesse acontecido é a ' +
              'falha silenciosa que a BICHUS-91 existe para não ter.',
          );
        }

        const donoAnterior = anterior?.user_id;
        return {
          aparelho: comoAparelho(linha),
          // Só é reivindicação quando o dono MUDOU. O mesmo token voltando da
          // mesma conta é o caminho comum (o app registra a cada abertura) e
          // não é revogação de nada.
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
      // Lista vazia não vira consulta: `IN ()` é erro de sintaxe no Postgres, e
      // o Kysely compilaria algo que o banco recusa. Nenhum candidato é
      // nenhuma conta alcançável, e isso é resposta e não caso de borda.
      if (candidatos.length === 0) return new Set<UserId>();
      const linhas = await construtorDosAlcancaveis(db, candidatos).execute();
      return new Set(linhas.map((linha) => linha.user_id as UserId));
    },

    async enderecoDeEnvio(aparelhoId) {
      const linha = await construtorDoEnderecoDeEnvio(db, aparelhoId).executeTakeFirst();
      // `TokenDeAparelho` é `string` por decisão da porta ("não é tipo
      // marcado: ele viaja do app ao banco e daqui ao transporte sem ninguém o
      // interpretar"), então não há conversão a fazer aqui.
      if (linha === undefined || linha.push_token === null) return null;
      return linha.push_token;
    },
  };
}
