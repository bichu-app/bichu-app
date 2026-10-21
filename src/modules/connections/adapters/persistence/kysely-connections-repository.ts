/**
 * A persistência da conexão. **Toda autorização está na cláusula `WHERE`**
 * (ADR-0021), e os tetos que valem sob concorrência estão lá também.
 *
 * ## Os construtores são exportados, e é de propósito
 *
 * Cada operação tem um `construtorDe...` que devolve a consulta **compilada**.
 * A suíte unitária não tem banco: ela compila com o `DummyDriver` e **lê o SQL**,
 * que é o único jeito de provar que quem chama está no `WHERE` em vez de num
 * `if` que alguém pode esquecer num caminho novo. É a forma que
 * `bloqueio-do-chamador-na-clausula-where.test.ts` já usa nesta casa.
 *
 * ## `conta_habilitada` entra nos DOIS lados de toda leitura
 *
 * `conta_habilitada(uuid)` (`20261017000013`) carrega a decisão do cliente de
 * 17/10: conta desabilitada *"não é mais encontrada em nenhuma página ou
 * funcionalidade"*. Aqui ela vale para quem chama **e** para o outro lado: a
 * conexão de quem desabilitou **some** da leitura e da contagem, sem fantasma e
 * sem marca, e **a linha não é apagada** — reabilitar devolve a conexão intacta.
 *
 * ## O apelido, lido por uma costura que não quebra com a coluna ausente
 *
 * O apelido (`users.handle`, faixa 5–20, único global em `citext`) é a chave de
 * leitura de uma pessoa, e é o que sai — nunca o identificador interno. Ele vive
 * em `feat/idade-minima-cadastro` e **não está em `origin/development`**
 * (medido em 18/10/2026: nenhuma ref além daquela tem a migração). Então a
 * leitura usa `to_jsonb(u) ->> 'handle'`:
 *
 * - **hoje**, sem a coluna, devolve `NULL`, e o domínio cai para o nome de
 *   exibição — que é exatamente o que "o apelido é opcional, nada pode quebrar
 *   com nulo" pede;
 * - **quando a migração do apelido descer**, a mesma consulta passa a devolver o
 *   apelido, **sem uma linha de código mudar**.
 *
 * O custo é materializar a linha de `users` em JSON por registro, e as leituras
 * daqui são de no máximo 20 linhas por página. A alternativa — declarar a coluna
 * e selecioná-la — derrubaria toda leitura de conexão com erro de SQL na base de
 * hoje, o que é pior que lento.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
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
  ConnectionsRepository,
  Encerramento,
  NovoPedido,
  PaginaDePedidos,
  RecortePedidos,
} from '../../ports/connections-repository.js';

/**
 * A conversão mora em `shared/time/clock.ts`; aqui ela só é usada.
 *
 * **Todo instante entra no SQL com `::timestamptz` explícito**, e isso não é
 * zelo: sem o molde, o Postgres não infere o tipo do parâmetro e resolve
 * `$n - interval '24 hours'` como `interval - interval`, o que faz
 * `requested_at > $n - interval` reprovar com *"operator does not exist:
 * timestamp with time zone > interval"*. Medido em 18/10/2026 exercitando a
 * consulta num Postgres de verdade; nenhum teste de SQL compilado acusaria isso.
 */
const instanteComoData = comoData;

/**
 * As colunas que uma aresta projeta, **e só elas**.
 *
 * `requester_user_id` e `addressee_user_id` **não** estão na lista: elas são
 * predicado de `WHERE`, nunca saída. O que sai no lugar da direção é
 * `sou_quem_pediu`, derivado **no SQL** por comparação com quem chama — derivado
 * e não recebido, pela mesma razão de `conversations.blocked_by_role`: um valor
 * de direção vindo de fora faria a leitura acreditar em quem chama.
 */
const COLUNAS_DA_ARESTA = sql`
      c.ref                                   AS ref,
      c.state                                 AS state,
      (c.requester_user_id = quem.id)         AS sou_quem_pediu,
      c.requested_at                          AS requested_at,
      c.expires_at                            AS expires_at,
      c.rest_until                            AS rest_until,
      outro.display_name                      AS display_name,
      (to_jsonb(outro) ->> 'handle')          AS handle
`;

/** A junção que resolve "a outra ponta", com `conta_habilitada` nos dois lados. */
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
}

function comoAresta(linha: LinhaDaAresta): ArestaGuardada {
  return {
    ref: linha.ref,
    estado: linha.state,
    souQuemPediu: linha.sou_quem_pediu,
    pedidoEm: linha.requested_at.getTime() as Instant,
    expiraEm: linha.expires_at.getTime() as Instant,
    descansoAte: linha.rest_until === null ? null : (linha.rest_until.getTime() as Instant),
    outraPessoa: { apelido: linha.handle, nomeDeExibicao: linha.display_name },
  };
}

/**
 * **As três contagens, numa consulta só** — e as três contam a pessoa pelos
 * **dois** lados onde isso faz sentido.
 *
 * `conexoes` conta `accepted` em que ela é pedinte **ou** destinatária, porque a
 * conexão é simétrica: contar só um lado deixaria uma conta crescer sem limite
 * por aceite. `pendentes` conta só o que ela **enviou** e ainda vale.
 * `do_dia` conta o que ela criou nas últimas 24 h, **qualquer que seja o estado
 * hoje** — recusado e cancelado contam, senão cancelar seria a forma de burlar o
 * teto diário.
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

/** `count(*)` vem como `bigint`, e o driver o entrega como texto. */
function comoNumero(valor: string | number): number {
  return typeof valor === 'number' ? valor : Number.parseInt(valor, 10);
}

/**
 * **Quantos tutores entraram pelo convite desta conta e viraram conexão
 * aceita** (cliente, 21/10/2026).
 *
 * ## A REGRA SÃO DOIS SINAIS, E OS DOIS ESTÃO NESTE `WHERE`
 *
 * 1. **`state = 'accepted'` com esta conta no DESTINO e `origin = 'invite_link'`.**
 *    Por que o destino, e não qualquer lado: quem usa um convite é quem PEDE, e
 *    o único convite que leva ao perfil desta conta é o DELA — resolver um
 *    token devolve o perfil de quem o emitiu, e pedir por token pede conexão
 *    **com o emissor**. Então origem de convite com esta conta como
 *    destinatária quer dizer, sem ambiguidade, *entrou pelo meu convite*.
 *
 *    **E é por isso que não há FK de convite em `user_connections`**: ela não
 *    faria falta aqui, e guardar qual convite gerou qual aresta seria guardar a
 *    lista de quem usou o link de alguém — o que o contrato recusa.
 *
 * 2. **Ao menos um pet com foto `ready`.** É o freio anti-abuso: uma conta
 *    criada à toa para inflar o contador de alguém não tem pet com foto
 *    aprovada. E é o MESMO sinal que a vitrine já usa, o que evita uma segunda
 *    definição de "conta de verdade".
 *
 * `conta_habilitada` nos dois lados, como em todas as contagens desta casa:
 * conta desabilitada sai do número e a linha **não** é apagada — reabilitar
 * devolve a contagem.
 *
 * **`EXISTS` e não `JOIN`**, e a diferença não é de estilo: uma junção com
 * `pet_photos` multiplicaria a aresta por foto pronta, e quem tem três fotos
 * contaria três vezes. `EXISTS` responde sim/não e para na primeira.
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
 *
 * Por que aqui e não só no domínio: dois pedidos simultâneos passam pela
 * conferência do domínio, e **só esta cláusula barra o segundo**. `ON CONFLICT
 * DO NOTHING` sobre `user_connections_um_par_uma_linha` fecha a corrida que
 * sobraria entre o `NOT EXISTS` e o `INSERT` — o índice é a última palavra, e é
 * ele que garante **uma linha por par**.
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
      (to_jsonb(outro) ->> 'handle')       AS handle
    FROM inserida i
    JOIN users outro ON outro.id = i.addressee_user_id
  `.compile(db);
}

/**
 * **O `UPDATE` do aceite.** Três predicados e um teto, todos no `WHERE`:
 *
 * 1. `ref` é a aresta;
 * 2. **quem chama é o DESTINATÁRIO** — quem pede não aceita o próprio pedido;
 * 3. o pendente está **vivo** (`expires_at > agora`) e é `pending` — aceitar um
 *    recusado lavaria a recusa, e aceitar um expirado ressuscitaria um pedido
 *    que a outra pessoa já considera morto;
 * 4. os **dois** lados abaixo do teto de 150.
 *
 * Nenhum deles é um `if` antes da escrita, e é isso que impede um caminho novo
 * de abrir o furo sem nenhum teste de comportamento acusar.
 */
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
      (to_jsonb(outro) ->> 'handle')       AS handle
    FROM aceita a
    JOIN users outro ON outro.id = a.requester_user_id
  `.compile(db);
}

/**
 * **Recusar, cancelar e desfazer, numa escrita só**, com a semântica
 * **derivada** do estado e do papel — nunca recebida de quem chama.
 *
 * - **recusa** (pendente, quem chama é o destinatário): a linha **fica**, vira
 *   `declined` e ganha o descanso de 90 dias. Apagá-la faria o próximo pedido
 *   nascer pendente e **lavaria a recusa** — é a mesma decisão de
 *   `withdrawNetworkEventJoinRequest`.
 * - **cancelamento** (pendente, quem chama pediu) e **desfazer** (aceita,
 *   qualquer um dos dois): a linha **sai**. Cancelar o próprio pedido não é uma
 *   recusa de ninguém, e desfazer é decisão dos dois lados por igual.
 *
 * O `CASE` no `RETURNING` é o que diz à trilha qual dos três aconteceu; a
 * **resposta HTTP é vazia nos três**, e é isso que mantém a recusa silenciosa.
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
 *
 * Simétrico pelo par canônico, e com `conta_habilitada` nos dois lados: conta
 * desabilitada responde `false`, que é o que "não é mais encontrada em nenhuma
 * página ou funcionalidade" quer dizer aqui.
 *
 * **Sem aceite, `false`.** É este `state = 'accepted'` que faz o aceite ser
 * obrigatório para todo dado de conectado — não um `if` numa tela.
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
 *
 * Uma instrução, simétrica pelo par canônico, e **sem `state` no `WHERE`**: o
 * bloqueio alcança pendente, aceita e recusada por igual. A recusada sai junto
 * porque o descanso de 90 dias existe para conter pedido repetido, e o bloqueio
 * já contém mais do que isso — deixá-la seria guardar um prazo sobre uma relação
 * que não existe mais.
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

/**
 * **Uma das duas caixas de pedidos — nunca a lista de conexões.**
 *
 * `received` traz `pending` vivo em que quem chama é o destinatário.
 * `sent` traz `pending` **e `declined`** vivos em que quem chama é o pedinte, e
 * é aí que a recusa fica silenciosa: as duas se projetam como "enviado" e a
 * recusada desaparece quando `expires_at` passa, igual a um pedido que ninguém
 * respondeu.
 *
 * **`accepted` não entra em nenhuma das duas**, e esta é a linha que impede a
 * lista de conexões de nascer por descuido dentro de uma caixa de pedidos.
 */
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
