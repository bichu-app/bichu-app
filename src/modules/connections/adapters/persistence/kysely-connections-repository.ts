import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type { ArestaGuardada, EstadoGuardado } from '../../domain/conexao.js';
import {
  DIAS_DE_DESCANSO_APOS_RECUSA,
  DIAS_DE_VALIDADE_DO_PEDIDO,
  TETO_DE_CONEXOES,
  TETO_DE_PEDIDOS_POR_DIA,
  TETO_DE_PENDENTES_ENVIADOS,
  type ContagensDaConta,
} from '../../domain/teto-de-conexoes.js';
import type {
  ArestaComApelido,
  ConnectionsRepository,
  Encerramento,
  NovoPedido,
  PaginaDeConexoes,
  PaginaDePedidos,
  PessoaConectada,
  RecorteDeConexoes,
  RecortePedidos,
} from '../../ports/connections-repository.js';

const instanteComoData = comoData;

const CANAL_VERIFICADO_DO_OUTRO = canalDeContatoConfirmadoNoSql('outro');

const COLUNAS_DA_ARESTA = sql`
      c.ref                                   AS ref,
      c.state                                 AS state,
      (c.requester_user_id = quem.id)         AS sou_quem_pediu,
      c.requested_at                          AS requested_at,
      c.expires_at                            AS expires_at,
      c.rest_until                            AS rest_until,
      outro.display_name                      AS display_name,
      (to_jsonb(outro) ->> 'handle')          AS handle,
      ${CANAL_VERIFICADO_DO_OUTRO}            AS canal_verificado
`;

function juncaoDaAresta(quemChama: UserId) {
  return sql`
    FROM user_connections c
    CROSS JOIN (SELECT ${quemChama}::uuid AS id) quem
    JOIN users outro
      ON outro.id = CASE WHEN c.requester_user_id = quem.id
                         THEN c.addressee_user_id ELSE c.requester_user_id END
    WHERE (c.requester_user_id = quem.id OR c.addressee_user_id = quem.id)
      AND conta_habilitada(c.requester_user_id)
      AND conta_habilitada(c.addressee_user_id)
  `;
}

interface LinhaDaAresta {
  readonly ref: string;
  readonly state: EstadoGuardado;
  readonly sou_quem_pediu: boolean;
  readonly requested_at: Date;
  readonly expires_at: Date;
  readonly rest_until: Date | null;
  readonly display_name: string | null;
  readonly handle: string | null;
  readonly canal_verificado: boolean;
}

function comoAresta(linha: LinhaDaAresta): ArestaGuardada {
  return {
    ref: linha.ref,
    estado: linha.state,
    souQuemPediu: linha.sou_quem_pediu,
    pedidoEm: linha.requested_at.getTime() as Instant,
    expiraEm: linha.expires_at.getTime() as Instant,
    descansoAte: linha.rest_until === null ? null : (linha.rest_until.getTime() as Instant),
    outraPessoa: {
      apelido: linha.handle,
      nomeDeExibicao: linha.display_name,
      canalVerificado: linha.canal_verificado,
    },
  };
}

/**
 * **As três contagens, numa consulta só** — e as três contam a pessoa pelos
 * **dois** lados onde isso faz sentido.
 */
export function construtorDasContagens(
  db: Kysely<Database>,
  pessoa: UserId,
  agora: Instant,
): CompiledQuery<ContagemCrua> {
  const instante = instanteComoData(agora);
  return sql<ContagemCrua>`
    SELECT
      count(*) FILTER (
        WHERE c.state = 'accepted'
          AND (c.requester_user_id = ${pessoa}::uuid OR c.addressee_user_id = ${pessoa}::uuid)
          AND conta_habilitada(c.requester_user_id)
          AND conta_habilitada(c.addressee_user_id)
      ) AS conexoes,
      count(*) FILTER (
        WHERE c.state = 'pending'
          AND c.requester_user_id = ${pessoa}::uuid
          AND c.expires_at > ${instante}::timestamptz
      ) AS pendentes,
      count(*) FILTER (
        WHERE c.requester_user_id = ${pessoa}::uuid
          AND c.requested_at > ${instante}::timestamptz - interval '24 hours'
      ) AS do_dia
    FROM user_connections c
  `.compile(db);
}

interface ContagemCrua {
  readonly conexoes: string | number;
  readonly pendentes: string | number;
  readonly do_dia: string | number;
}

function comoNumero(valor: string | number): number {
  return typeof valor === 'number' ? valor : Number.parseInt(valor, 10);
}

/**
 * **Quantos tutores entraram pelo convite desta conta e viraram conexão aceita**
 * (cliente, 21/10/2026).
 */
export function construtorDaContagemDeConvidados(
  db: Kysely<Database>,
  pessoa: UserId,
): CompiledQuery<{ readonly convidados: string | number }> {
  return sql<{ readonly convidados: string | number }>`
    SELECT count(*) AS convidados
    FROM user_connections c
    WHERE c.state = 'accepted'
      AND c.addressee_user_id = ${pessoa}::uuid
      AND c.origin = 'invite_link'
      AND conta_habilitada(c.requester_user_id)
      AND conta_habilitada(c.addressee_user_id)
      AND EXISTS (
        SELECT 1
        FROM pets p
        JOIN pet_photos f ON f.pet_id = p.id
        WHERE p.owner_user_id = c.requester_user_id
          AND p.deleted_at IS NULL
          AND f.status = 'ready'
          AND f.deleted_at IS NULL
      )
  `.compile(db);
}

export function construtorDaContagemDeConexoes(
  db: Kysely<Database>,
  pessoa: UserId,
): CompiledQuery<{ readonly conexoes: string | number }> {
  return sql<{ readonly conexoes: string | number }>`
    SELECT count(*) AS conexoes
    FROM user_connections c
    WHERE c.state = 'accepted'
      AND (c.requester_user_id = ${pessoa}::uuid OR c.addressee_user_id = ${pessoa}::uuid)
      AND conta_habilitada(c.requester_user_id)
      AND conta_habilitada(c.addressee_user_id)
  `.compile(db);
}

export function construtorDaArestaPorRef(
  db: Kysely<Database>,
  ref: string,
  quemChama: UserId,
): CompiledQuery<LinhaDaAresta> {
  return sql<LinhaDaAresta>`
    SELECT ${COLUNAS_DA_ARESTA}
    ${juncaoDaAresta(quemChama)}
      AND c.ref = ${ref}
  `.compile(db);
}

export function construtorDaArestaDoPar(
  db: Kysely<Database>,
  quemChama: UserId,
  outroLado: UserId,
): CompiledQuery<LinhaDaAresta> {
  return sql<LinhaDaAresta>`
    SELECT ${COLUNAS_DA_ARESTA}
    ${juncaoDaAresta(quemChama)}
      AND (c.requester_user_id = ${outroLado}::uuid OR c.addressee_user_id = ${outroLado}::uuid)
  `.compile(db);
}

/**
 * **O `INSERT` guardado.** Os quatro tetos, o descanso de 90 dias, a conta
 * habilitada dos dois lados e a ausência de linha viva do par estão no `WHERE`
 * desta única instrução.
 */
export function construtorDoPedido(
  db: Kysely<Database>,
  pedido: NovoPedido,
): CompiledQuery<LinhaDaAresta> {
  const instante = instanteComoData(pedido.agora);
  const { quemPede, alvo } = pedido;
  return sql<LinhaDaAresta>`
    WITH inserida AS (
      INSERT INTO user_connections
        (id, ref, requester_user_id, addressee_user_id, state, origin, requested_at, expires_at)
      SELECT
        ${pedido.id}::uuid, ${pedido.ref}, ${quemPede}::uuid, ${alvo}::uuid,
        'pending', ${pedido.origem}, ${instante}::timestamptz,
        ${instante}::timestamptz + interval '${sql.raw(String(DIAS_DE_VALIDADE_DO_PEDIDO))} days'
      WHERE ${quemPede}::uuid <> ${alvo}::uuid
        AND conta_habilitada(${quemPede}::uuid)
        AND conta_habilitada(${alvo}::uuid)
        AND (SELECT count(*) FROM user_connections c
              WHERE c.state = 'accepted'
                AND (c.requester_user_id = ${quemPede}::uuid OR c.addressee_user_id = ${quemPede}::uuid)
            ) < ${TETO_DE_CONEXOES}
        AND (SELECT count(*) FROM user_connections c
              WHERE c.state = 'accepted'
                AND (c.requester_user_id = ${alvo}::uuid OR c.addressee_user_id = ${alvo}::uuid)
            ) < ${TETO_DE_CONEXOES}
        AND (SELECT count(*) FROM user_connections c
              WHERE c.state = 'pending'
                AND c.requester_user_id = ${quemPede}::uuid
                AND c.expires_at > ${instante}::timestamptz
            ) < ${TETO_DE_PENDENTES_ENVIADOS}
        AND (SELECT count(*) FROM user_connections c
              WHERE c.requester_user_id = ${quemPede}::uuid
                AND c.requested_at > ${instante}::timestamptz - interval '24 hours'
            ) < ${TETO_DE_PEDIDOS_POR_DIA}
      ON CONFLICT (pair_low, pair_high) DO UPDATE
        SET ref               = EXCLUDED.ref,
            requester_user_id = EXCLUDED.requester_user_id,
            addressee_user_id = EXCLUDED.addressee_user_id,
            state             = 'pending',
            origin            = EXCLUDED.origin,
            requested_at      = EXCLUDED.requested_at,
            expires_at        = EXCLUDED.expires_at,
            responded_at      = NULL,
            rest_until        = NULL
        WHERE (user_connections.state = 'declined'
                 AND user_connections.rest_until <= ${instante}::timestamptz)
           OR (user_connections.state = 'pending'
                 AND user_connections.expires_at <= ${instante}::timestamptz)
      RETURNING ref, state, requested_at, expires_at, rest_until, requester_user_id, addressee_user_id
    )
    SELECT
      i.ref                                AS ref,
      i.state                              AS state,
      true                                 AS sou_quem_pediu,
      i.requested_at                       AS requested_at,
      i.expires_at                         AS expires_at,
      i.rest_until                         AS rest_until,
      outro.display_name                   AS display_name,
      (to_jsonb(outro) ->> 'handle')       AS handle,
      ${CANAL_VERIFICADO_DO_OUTRO}         AS canal_verificado
    FROM inserida i
    JOIN users outro ON outro.id = i.addressee_user_id
  `.compile(db);
}

/** **O `UPDATE` do aceite.** Três predicados e um teto, todos no `WHERE`: */
export function construtorDoAceite(
  db: Kysely<Database>,
  ref: string,
  quemChama: UserId,
  agora: Instant,
): CompiledQuery<LinhaDaAresta> {
  const instante = instanteComoData(agora);
  return sql<LinhaDaAresta>`
    WITH aceita AS (
      UPDATE user_connections c
      SET state = 'accepted', responded_at = ${instante}::timestamptz
      WHERE c.ref = ${ref}
        AND c.addressee_user_id = ${quemChama}::uuid
        AND c.state = 'pending'
        AND c.expires_at > ${instante}::timestamptz
        AND conta_habilitada(c.requester_user_id)
        AND conta_habilitada(c.addressee_user_id)
        AND (SELECT count(*) FROM user_connections o
              WHERE o.state = 'accepted'
                AND (o.requester_user_id = c.addressee_user_id OR o.addressee_user_id = c.addressee_user_id)
            ) < ${TETO_DE_CONEXOES}
        AND (SELECT count(*) FROM user_connections o
              WHERE o.state = 'accepted'
                AND (o.requester_user_id = c.requester_user_id OR o.addressee_user_id = c.requester_user_id)
            ) < ${TETO_DE_CONEXOES}
      RETURNING ref, state, requested_at, expires_at, rest_until, requester_user_id
    )
    SELECT
      a.ref                                AS ref,
      a.state                              AS state,
      false                                AS sou_quem_pediu,
      a.requested_at                       AS requested_at,
      a.expires_at                         AS expires_at,
      a.rest_until                         AS rest_until,
      outro.display_name                   AS display_name,
      (to_jsonb(outro) ->> 'handle')       AS handle,
      ${CANAL_VERIFICADO_DO_OUTRO}         AS canal_verificado
    FROM aceita a
    JOIN users outro ON outro.id = a.requester_user_id
  `.compile(db);
}

/**
 * **Recusar, cancelar e desfazer, numa escrita só**, com a semântica **derivada**
 * do estado e do papel — nunca recebida de quem chama.
 */
export function construtorDoEncerramento(
  db: Kysely<Database>,
  ref: string,
  quemChama: UserId,
  agora: Instant,
): CompiledQuery<{ readonly feito: Encerramento }> {
  const instante = instanteComoData(agora);
  return sql<{ readonly feito: Encerramento }>`
    WITH alvo AS (
      SELECT c.id,
             CASE
               WHEN c.state = 'accepted' THEN 'undone'
               WHEN c.requester_user_id = ${quemChama}::uuid THEN 'cancelled'
               ELSE 'declined'
             END AS feito
      FROM user_connections c
      WHERE c.ref = ${ref}
        AND (c.requester_user_id = ${quemChama}::uuid OR c.addressee_user_id = ${quemChama}::uuid)
        AND conta_habilitada(c.requester_user_id)
        AND conta_habilitada(c.addressee_user_id)
        AND (c.state = 'accepted' OR (c.state = 'pending' AND c.expires_at > ${instante}::timestamptz))
    ),
    recusada AS (
      UPDATE user_connections c
      SET state = 'declined',
          responded_at = ${instante}::timestamptz,
          rest_until = ${instante}::timestamptz + interval '${sql.raw(String(DIAS_DE_DESCANSO_APOS_RECUSA))} days'
      FROM alvo
      WHERE c.id = alvo.id AND alvo.feito = 'declined'
      RETURNING alvo.feito
    ),
    apagada AS (
      DELETE FROM user_connections c
      USING alvo
      WHERE c.id = alvo.id AND alvo.feito IN ('cancelled', 'undone')
      RETURNING alvo.feito
    )
    SELECT feito FROM recusada
    UNION ALL
    SELECT feito FROM apagada
  `.compile(db);
}

/**
 * **O predicado de par**, para as fatias G e J: *estes dois estão conectados
 * agora?*
 */
export function construtorDoParConectado(
  db: Kysely<Database>,
  um: UserId,
  outro: UserId,
): CompiledQuery<{ readonly conectados: boolean }> {
  return sql<{ readonly conectados: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM user_connections c
      WHERE c.pair_low = least(${um}::uuid, ${outro}::uuid)
        AND c.pair_high = greatest(${um}::uuid, ${outro}::uuid)
        AND c.state = 'accepted'
        AND conta_habilitada(c.requester_user_id)
        AND conta_habilitada(c.addressee_user_id)
    ) AS conectados
  `.compile(db);
}

/**
 * **O contrato com a fatia E.** Apaga o pendente das duas direções e desfaz a
 * conexão do par, **em silêncio**.
 */
export function construtorDoDesfazerPorBloqueio(
  db: Kysely<Database>,
  um: UserId,
  outro: UserId,
): CompiledQuery<{ readonly ref: string }> {
  return sql<{ readonly ref: string }>`
    DELETE FROM user_connections c
    WHERE c.pair_low = least(${um}::uuid, ${outro}::uuid)
      AND c.pair_high = greatest(${um}::uuid, ${outro}::uuid)
    RETURNING c.ref
  `.compile(db);
}

/** **Uma das duas caixas de pedidos — nunca a lista de conexões.** */
export function construtorDosPedidos(
  db: Kysely<Database>,
  quemChama: UserId,
  recorte: RecortePedidos,
): CompiledQuery<LinhaDaAresta & { readonly total: string | number }> {
  const instante = instanteComoData(recorte.agora);
  const recebidos = recorte.direcao === 'received';
  const lado = recebidos
    ? sql`c.addressee_user_id = quem.id AND c.state = 'pending'`
    : sql`c.requester_user_id = quem.id AND c.state IN ('pending', 'declined')`;
  const deslocamento = (recorte.pagina - 1) * recorte.limite;
  return sql<LinhaDaAresta & { readonly total: string | number }>`
    SELECT ${COLUNAS_DA_ARESTA},
      count(*) OVER () AS total
    ${juncaoDaAresta(quemChama)}
      AND ${lado}
      AND c.expires_at > ${instante}::timestamptz
    ORDER BY c.requested_at DESC, c.ref
    LIMIT ${recorte.limite} OFFSET ${deslocamento}
  `.compile(db);
}

interface LinhaDaArestaPorApelido {
  readonly handle: string;
  readonly state: EstadoGuardado;
  readonly sou_quem_pediu: boolean;
  readonly requested_at: Date;
  readonly expires_at: Date;
  readonly rest_until: Date | null;
}

interface LinhaDaConexao {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  readonly connections_count: string | number;
  readonly photo_key: string | null;
  readonly total: string | number;
}

/**
 * **A LISTA DAS PRÓPRIAS CONEXÕES ACEITAS** (cliente, 22/10/2026: *"o usuário pode
 * abrir a lista de usuários que é sua conexão"*).
 */
export function construtorDasConexoes(
  db: Kysely<Database>,
  quemChama: UserId,
  recorte: RecorteDeConexoes,
): CompiledQuery<LinhaDaConexao> {
  const deslocamento = (recorte.pagina - 1) * recorte.limite;
  return sql<LinhaDaConexao>`
    SELECT
      (to_jsonb(outro) ->> 'handle')        AS handle,
      outro.display_name                    AS display_name,
      (SELECT count(*) FROM pets p
         WHERE p.owner_user_id = outro.id AND p.deleted_at IS NULL)
                                            AS pets_count,
      (SELECT count(*) FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND (uc.requester_user_id = outro.id OR uc.addressee_user_id = outro.id)
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))
                                            AS connections_count,
      (SELECT foto.thumb_key FROM catalog_images foto
         WHERE foto.id = outro.photo_image_id
           AND foto.purpose = 'user_photo'
           AND foto.status = 'ready'
           AND foto.thumb_key IS NOT NULL)
                                            AS photo_key,
      count(*) OVER ()                      AS total
    ${juncaoDaAresta(quemChama)}
      AND c.state = 'accepted'
      AND (to_jsonb(outro) ->> 'handle') IS NOT NULL
    ORDER BY outro.display_name ASC, (to_jsonb(outro) ->> 'handle') ASC
    LIMIT ${recorte.limite} OFFSET ${deslocamento}
  `.compile(db);
}

/**
 * **AS ARESTAS ENTRE QUEM CHAMA E UMA LISTA DE APELIDOS**, numa consulta só — o
 * estado da conexão nos resultados da busca (cliente, 22/10/2026).
 */
export function construtorDasArestasPorApelido(
  db: Kysely<Database>,
  quemChama: UserId,
  apelidos: readonly string[],
  agora: Instant,
): CompiledQuery<LinhaDaArestaPorApelido> {
  const instante = instanteComoData(agora);
  return sql<LinhaDaArestaPorApelido>`
    SELECT
      (to_jsonb(outro) ->> 'handle')         AS handle,
      c.state                                AS state,
      (c.requester_user_id = quem.id)        AS sou_quem_pediu,
      c.requested_at                         AS requested_at,
      c.expires_at                           AS expires_at,
      c.rest_until                           AS rest_until
    ${juncaoDaAresta(quemChama)}
      AND (to_jsonb(outro) ->> 'handle') = ANY(${apelidos}::text[])
      AND (c.state = 'accepted' OR c.expires_at > ${instante}::timestamptz)
  `.compile(db);
}

function comoPessoaConectada(linha: LinhaDaConexao): PessoaConectada {
  return {
    apelido: linha.handle,
    nomeDeExibicao: linha.display_name,
    petsCount: comoNumero(linha.pets_count),
    connectionsCount: comoNumero(linha.connections_count),
    photoKey: linha.photo_key,
  };
}

export function criarConnectionsRepository(db: Kysely<Database>): ConnectionsRepository {
  async function umaAresta(consulta: CompiledQuery<LinhaDaAresta>): Promise<ArestaGuardada | undefined> {
    const { rows } = await db.executeQuery(consulta);
    const primeira = rows[0];
    return primeira === undefined ? undefined : comoAresta(primeira);
  }

  return {
    async contagens(pessoa: UserId, agora: Instant): Promise<ContagensDaConta> {
      const { rows } = await db.executeQuery(construtorDasContagens(db, pessoa, agora));
      const linha = rows[0];
      return {
        conexoes: linha === undefined ? 0 : comoNumero(linha.conexoes),
        pendentesEnviados: linha === undefined ? 0 : comoNumero(linha.pendentes),
        pedidosNasUltimas24h: linha === undefined ? 0 : comoNumero(linha.do_dia),
      };
    },

    async contarConexoes(pessoa: UserId): Promise<number> {
      const { rows } = await db.executeQuery(construtorDaContagemDeConexoes(db, pessoa));
      const linha = rows[0];
      return linha === undefined ? 0 : comoNumero(linha.conexoes);
    },

    async contarConvidadosQueEntraram(pessoa: UserId): Promise<number> {
      const { rows } = await db.executeQuery(construtorDaContagemDeConvidados(db, pessoa));
      const linha = rows[0];
      return linha === undefined ? 0 : comoNumero(linha.convidados);
    },

    arestaDoPar: (quemChama: UserId, outroLado: UserId) =>
      umaAresta(construtorDaArestaDoPar(db, quemChama, outroLado)),

    arestaPorRef: (ref: string, quemChama: UserId) =>
      umaAresta(construtorDaArestaPorRef(db, ref, quemChama)),

    pedir: (pedido: NovoPedido) => umaAresta(construtorDoPedido(db, pedido)),

    aceitar: (ref: string, quemChama: UserId, agora: Instant) =>
      umaAresta(construtorDoAceite(db, ref, quemChama, agora)),

    async encerrar(ref: string, quemChama: UserId, agora: Instant): Promise<Encerramento | undefined> {
      const { rows } = await db.executeQuery(construtorDoEncerramento(db, ref, quemChama, agora));
      return rows[0]?.feito;
    },

    async pedidos(quemChama: UserId, recorte: RecortePedidos): Promise<PaginaDePedidos> {
      const { rows } = await db.executeQuery(construtorDosPedidos(db, quemChama, recorte));
      return {
        itens: rows.map(comoAresta),
        total: rows[0] === undefined ? 0 : comoNumero(rows[0].total),
      };
    },

    async arestasPorApelido(
      quemChama: UserId,
      apelidos: readonly string[],
      agora: Instant,
    ): Promise<readonly ArestaComApelido[]> {
      const { rows } = await db.executeQuery(
        construtorDasArestasPorApelido(db, quemChama, apelidos, agora),
      );
      return rows.map((linha) => ({
        apelido: linha.handle,
        aresta: {
          ref: '',
          estado: linha.state,
          souQuemPediu: linha.sou_quem_pediu,
          pedidoEm: linha.requested_at.getTime() as Instant,
          expiraEm: linha.expires_at.getTime() as Instant,
          descansoAte:
            linha.rest_until === null ? null : (linha.rest_until.getTime() as Instant),
          outraPessoa: { apelido: linha.handle, nomeDeExibicao: null, canalVerificado: false },
        },
      }));
    },

    async conexoes(quemChama: UserId, recorte: RecorteDeConexoes): Promise<PaginaDeConexoes> {
      const { rows } = await db.executeQuery(construtorDasConexoes(db, quemChama, recorte));
      return {
        itens: rows.map(comoPessoaConectada),
        total: rows[0] === undefined ? 0 : comoNumero(rows[0].total),
      };
    },

    async estaConectado(um: UserId, outro: UserId): Promise<boolean> {
      const { rows } = await db.executeQuery(construtorDoParConectado(db, um, outro));
      return rows[0]?.conectados === true;
    },

    async desfazerPorBloqueio(um: UserId, outro: UserId): Promise<number> {
      const { rows } = await db.executeQuery(construtorDoDesfazerPorBloqueio(db, um, outro));
      return rows.length;
    },
  };
}
