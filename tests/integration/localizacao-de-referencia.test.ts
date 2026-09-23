/**
 * A coluna geográfica contra Postgres de verdade (BICHUS-92).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * O dublê em memória prova a regra e não prova a coluna. Nada do que está aqui
 * existe fora do banco:
 *
 * - **o tipo `geography(Point, 4326)`** e o fato de a extensão PostGIS estar
 *   instalada. Um `text` guardando `"-23.561,-46.656"` passaria em todo teste
 *   unitário deste repositório e quebraria na primeira consulta de raio;
 * - **o índice GIST**, que é o que faz "tutores num raio de 5 km" não virar
 *   varredura da tabela inteira no segundo seguinte ao toque em "meu pet
 *   sumiu";
 * - **`ST_DWithin` sobre o elipsoide**, que é a conta que decide quem recebe
 *   alerta. Nenhuma aproximação em JavaScript prova que ela acerta;
 * - **a ordem `(lon, lat)` de `ST_MakePoint`**, que é o erro clássico do
 *   PostGIS porque ele não falha: ele grava o Brasil no meio da Somália. Só
 *   medindo a distância de volta é que isso aparece;
 * - **`ON CONFLICT (user_id)`**, que depende da chave primária existir;
 * - **o `ON DELETE CASCADE`**, que é o caminho da exclusão de conta.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose é derivado do caminho do worktree e
 * o banco é derrubado com `-v` no fim. Nada aqui toca a pilha de desenvolvimento.
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE`
 * leva as localizações junto — que é, ele próprio, um dos casos.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { sql } from 'kysely';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarLocalizacaoDeReferenciaRepository } from '../../src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';
import { localizacaoAGravar } from '../../src/modules/identity/domain/localizacao-de-referencia.js';
import {
  comoFamiliaDeSessao,
  type LocalizacaoDeReferenciaRepository,
} from '../../src/modules/identity/ports/localizacao-de-referencia-repository.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;
const RAIO_DO_ALERTA_EM_METROS = 5000;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Avenida Paulista, 1578. O centro de todas as distâncias deste arquivo. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: LocalizacaoDeReferenciaRepository;

/**
 * SEC-021: a sessão de aparelho que os casos "de uma pessoa só" usam.
 *
 * A localização passou a ser do aparelho, então toda chamada carrega a família
 * de refresh. Os casos deste arquivo que falam da COLUNA e da CONSULTA — o tipo
 * geográfico, a ordem `(lon, lat)`, o `ST_DWithin`, o `CASCADE` — continuam
 * falando de uma pessoa com um aparelho só, e amarrá-los todos à mesma família
 * é o que mantém cada um medindo o que ele foi escrito para medir. Os casos que
 * PRECISAM de dois aparelhos chamam `repo` direto, com as duas famílias à
 * vista: um atalho que escondesse a família ali reprovaria pelo motivo errado.
 */
const APARELHO_UNICO = comoFamiliaDeSessao('018f3a2b-0000-7000-8000-00000000d001');

const aparelhoUnico = {
  gravar: (dono: UserId, localizacao: Parameters<LocalizacaoDeReferenciaRepository['gravar']>[2]) =>
    repo.gravar(dono, APARELHO_UNICO, localizacao),
  buscarValida: (dono: UserId, agora: Instant) => repo.buscarValida(dono, APARELHO_UNICO, agora),
  apagar: (dono: UserId) => repo.apagar(dono, APARELHO_UNICO),
};
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus92-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/** Distância real, medida pelo banco, entre a linha gravada e um ponto. */
async function distanciaAte(dono: UserId, ponto: { lat: number; lon: number }): Promise<number> {
  const r = await cliente.query<{ d: string }>(
    `SELECT ST_Distance(
        reference_point,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
      ) AS d
      FROM user_reference_locations WHERE user_id = $1`,
    [dono, ponto.lon, ponto.lat],
  );
  const linha = r.rows[0];
  assert.ok(linha !== undefined, 'não havia linha gravada para medir');
  return Number(linha.d);
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter tocado numa coluna `geography`, que é
    // exatamente o que este arquivo existe para impedir.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede uma coluna `geography` com índice ' +
        'GIST contra Postgres de verdade, e não tem versão em memória. Rode `npm run ' +
        'test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarLocalizacaoDeReferenciaRepository(db);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o esquema é o que a migração promete', () => {
  void it('a extensão PostGIS está instalada', async () => {
    const r = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_extension WHERE extname = 'postgis'`,
    );
    assert.equal(r.rows[0]?.n, '1', 'sem PostGIS a consulta de raio não existe');
  });

  void it('`reference_point` é geography(Point,4326), e não texto', async () => {
    const r = await cliente.query<{ tipo: string }>(
      `SELECT format_type(a.atttypid, a.atttypmod) AS tipo
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'user_reference_locations' AND a.attname = 'reference_point'`,
    );
    assert.equal(
      r.rows[0]?.tipo,
      'geography(Point,4326)',
      'um `text` guardando "lat,lon" passaria em todo teste unitário deste repositório',
    );
  });

  void it('a coluna é NOT NULL: não existe linha sem ponto', async () => {
    const r = await cliente.query<{ notnull: boolean }>(
      `SELECT a.attnotnull AS notnull
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'user_reference_locations' AND a.attname = 'reference_point'`,
    );
    assert.equal(r.rows[0]?.notnull, true);
  });

  void it('existe índice GIST sobre a coluna', async () => {
    const r = await cliente.query<{ def: string }>(
      `SELECT indexdef AS def FROM pg_indexes
        WHERE tablename = 'user_reference_locations' AND indexname = 'user_reference_locations_por_lugar'`,
    );
    const definicao = r.rows[0]?.def ?? '';
    assert.match(definicao, /USING gist/i, 'sem GIST a consulta de 5 km varre a tabela inteira');
    assert.match(definicao, /reference_point/);
  });

  void it('a chave primária é `user_id`: histórico é inexprimível', async () => {
    const r = await cliente.query<{ cols: string }>(
      `SELECT string_agg(a.attname, ',' ORDER BY a.attname) AS cols
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(k.conkey)
        WHERE c.relname = 'user_reference_locations' AND k.contype = 'p'`,
    );
    assert.equal(r.rows[0]?.cols, 'user_id');
  });

  void it('`source` é CHECK e não enum nativo', async () => {
    const r = await cliente.query<{ def: string }>(
      `SELECT pg_get_constraintdef(k.oid) AS def
         FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        WHERE c.relname = 'user_reference_locations'
          AND k.conname = 'user_reference_locations_origem'`,
    );
    assert.match(r.rows[0]?.def ?? '', /device_gps/);
    assert.match(r.rows[0]?.def ?? '', /map_pin/);
  });
});

void describe('o ponto vai e volta sem se mexer, e na ordem certa', () => {
  void it('o que foi gravado é lido de volta exatamente igual', async () => {
    const dono = await criarConta();
    const gravar = localizacaoAGravar(PAULISTA, 'device_gps', AGORA);
    await aparelhoUnico.gravar(dono, gravar);

    const lida = await aparelhoUnico.buscarValida(dono, AGORA);
    assert.ok(lida !== null);
    assert.equal(lida.lat, gravar.lat);
    assert.equal(lida.lon, gravar.lon);
    assert.equal(lida.origem, 'device_gps');
    assert.equal(lida.precisaoEmMetros, 100);
  });

  void it('a ordem é (lon, lat): o ponto está a menos de 100 m de onde deveria', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    const erro = await distanciaAte(dono, PAULISTA);
    assert.ok(
      erro < 100,
      `o ponto gravado está a ${erro.toFixed(0)} m da Paulista. Trocar lat e lon em ` +
        '`ST_MakePoint` não falha: ele grava o Brasil no meio da Somália.',
    );
  });

  void it('duas coordenadas a 30 m uma da outra caem no MESMO ponto gravado', async () => {
    const a = await criarConta();
    const b = await criarConta();
    // 0.0002 grau de latitude são cerca de 22 m.
    await aparelhoUnico.gravar(a, localizacaoAGravar({ lat: -23.5613, lon: -46.6559 }, 'device_gps', AGORA));
    await aparelhoUnico.gravar(b, localizacaoAGravar({ lat: -23.5615, lon: -46.6561 }, 'map_pin', AGORA));

    const r = await cliente.query<{ d: string }>(
      `SELECT ST_Distance(x.reference_point, y.reference_point)::text AS d
         FROM user_reference_locations x, user_reference_locations y
        WHERE x.user_id = $1 AND y.user_id = $2`,
      [a, b],
    );
    assert.equal(
      Number(r.rows[0]?.d),
      0,
      'a quantização não colapsou dois vizinhos, e é para isso que ela existe',
    );
  });
});

void describe('uma linha por conta, sempre a última, sem histórico', () => {
  void it('gravar duas vezes deixa UMA linha, com a segunda coordenada', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));
    await aparelhoUnico.gravar(
      dono,
      localizacaoAGravar({ lat: -22.9519, lon: -43.2105 }, 'map_pin', (AGORA + 1000) as Instant),
    );

    const r = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM user_reference_locations WHERE user_id = $1',
      [dono],
    );
    assert.equal(r.rows[0]?.n, '1', 'apareceu histórico, e o critério 5 proíbe');

    const lida = await aparelhoUnico.buscarValida(dono, (AGORA + 1000) as Instant);
    assert.equal(lida?.lat, -22.952);
    assert.equal(lida?.origem, 'map_pin');
  });
});

void describe('"tutores num raio de 5 km" é calculável, e a conta está certa', () => {
  void it('ST_DWithin encontra quem está a 4 km e ignora quem está a 6 km', async () => {
    const perto = await criarConta();
    const longe = await criarConta();
    // 0.036 grau de latitude são cerca de 4,0 km; 0.054 são cerca de 6,0 km.
    await aparelhoUnico.gravar(
      perto,
      localizacaoAGravar({ lat: PAULISTA.lat + 0.036, lon: PAULISTA.lon }, 'device_gps', AGORA),
    );
    await aparelhoUnico.gravar(
      longe,
      localizacaoAGravar({ lat: PAULISTA.lat + 0.054, lon: PAULISTA.lon }, 'device_gps', AGORA),
    );

    // As distâncias reais, ditas em vez de assumidas.
    const dPerto = await distanciaAte(perto, PAULISTA);
    const dLonge = await distanciaAte(longe, PAULISTA);
    assert.ok(dPerto < RAIO_DO_ALERTA_EM_METROS, `o "perto" mede ${dPerto.toFixed(0)} m`);
    assert.ok(dLonge > RAIO_DO_ALERTA_EM_METROS, `o "longe" mede ${dLonge.toFixed(0)} m`);

    const r = await cliente.query<{ user_id: string }>(
      `SELECT user_id FROM user_reference_locations
        WHERE user_id = ANY($1::uuid[])
          AND expires_at > $2
          AND ST_DWithin(
                reference_point,
                ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
                $5
              )`,
      [[perto, longe], new Date(AGORA), PAULISTA.lon, PAULISTA.lat, RAIO_DO_ALERTA_EM_METROS],
    );
    assert.deepEqual(r.rows.map((l) => l.user_id), [perto]);
  });

  void it('quem tem a localização vencida NÃO entra no raio', async () => {
    const vencido = await criarConta();
    // Capturada há 31 dias, e portanto vencida agora.
    await aparelhoUnico.gravar(
      vencido,
      localizacaoAGravar(PAULISTA, 'device_gps', (AGORA - 31 * DIA) as Instant),
    );

    // Está a algumas dezenas de metros do centro -- o snap da grade --, ou seja,
    // bem dentro dos 5 km. O único motivo possível para ficar de fora é o prazo.
    const distancia = await distanciaAte(vencido, PAULISTA);
    assert.ok(
      distancia < 100,
      `o vencido está a ${distancia.toFixed(0)} m do centro, e o caso precisa dele DENTRO ` +
        'do raio para que a exclusão prove o prazo e não a distância',
    );

    const r = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM user_reference_locations
        WHERE user_id = $1 AND expires_at > $2
          AND ST_DWithin(reference_point, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)`,
      [vencido, new Date(AGORA), PAULISTA.lon, PAULISTA.lat, RAIO_DO_ALERTA_EM_METROS],
    );
    assert.equal(r.rows[0]?.n, '0', 'a conta continuou na base de alerta depois de 30 dias');
    assert.equal(await aparelhoUnico.buscarValida(vencido, AGORA), null);
  });

  void it('o índice GIST é USADO pela consulta de raio', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    // Com três linhas o planejador escolhe varredura sequencial por ser mais
    // barata, e isso não diz nada sobre o índice. Desligar a sequencial força a
    // pergunta que interessa: "existe um plano por índice para ST_DWithin?".
    // Em produção, com a tabela grande, é esse plano que ele escolhe sozinho.
    await cliente.query('BEGIN');
    try {
      await cliente.query('SET LOCAL enable_seqscan = off');
      const r = await cliente.query<Record<string, string>>(
        `EXPLAIN SELECT user_id FROM user_reference_locations
          WHERE ST_DWithin(reference_point, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
        [PAULISTA.lon, PAULISTA.lat, RAIO_DO_ALERTA_EM_METROS],
      );
      // O nome da coluna do `EXPLAIN` é literalmente `QUERY PLAN`, com espaço.
      const plano = r.rows.map((linha) => Object.values(linha).join(' ')).join('\n');
      assert.match(
        plano,
        /user_reference_locations_por_lugar/,
        `ST_DWithin não consegue usar o índice. Plano:\n${plano}`,
      );
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});

void describe('a localização de uma conta não chega a outra (ADR-0021, critério 11)', () => {
  void it('o repositório de B não lê a linha de A', async () => {
    const a = await criarConta();
    const b = await criarConta();
    await aparelhoUnico.gravar(a, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    assert.equal(await aparelhoUnico.buscarValida(b, AGORA), null);
    assert.notEqual(await aparelhoUnico.buscarValida(a, AGORA), null);
  });

  void it('o apagamento de B não toca a linha de A', async () => {
    const a = await criarConta();
    const b = await criarConta();
    await aparelhoUnico.gravar(a, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    await aparelhoUnico.apagar(b);
    assert.notEqual(await aparelhoUnico.buscarValida(a, AGORA), null, 'apagou a linha de outra conta');
  });
});

void describe('exclusão de conta e retenção', () => {
  void it('apagar a conta leva a localização junto (ON DELETE CASCADE)', async () => {
    const dono = await criarConta();
    await aparelhoUnico.gravar(dono, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));
    assert.notEqual(await aparelhoUnico.buscarValida(dono, AGORA), null);

    await cliente.query('DELETE FROM users WHERE id = $1', [dono]);
    const r = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM user_reference_locations WHERE user_id = $1',
      [dono],
    );
    assert.equal(
      r.rows[0]?.n,
      '0',
      'a coordenada sobreviveu à exclusão da conta, e o ADR-0010 diz que ela não sobrevive',
    );
  });

  void it('o expurgo apaga a vencida e deixa a válida', async () => {
    const vencido = await criarConta();
    const valido = await criarConta();
    await aparelhoUnico.gravar(
      vencido,
      localizacaoAGravar(PAULISTA, 'device_gps', (AGORA - 31 * DIA) as Instant),
    );
    await aparelhoUnico.gravar(valido, localizacaoAGravar(PAULISTA, 'device_gps', AGORA));

    const apagadas = await repo.expurgarVencidas(AGORA);
    assert.ok(apagadas >= 1, 'o expurgo não apagou nada, e havia uma linha vencida');

    const r = await cliente.query<{ user_id: string }>(
      'SELECT user_id FROM user_reference_locations WHERE user_id = ANY($1::uuid[])',
      [[vencido, valido]],
    );
    assert.deepEqual(r.rows.map((l) => l.user_id), [valido]);
  });
});

void describe('o banco recusa o que o contrato recusa', () => {
  void it('não aceita uma origem fora do CHECK', async () => {
    const dono = await criarConta();
    await assert.rejects(
      () =>
        sql`
          INSERT INTO user_reference_locations
            (user_id, reference_point, precision_m, source, captured_at, expires_at)
          VALUES (${dono}, ST_SetSRID(ST_MakePoint(-46.656, -23.561), 4326)::geography,
                  100, 'ip_lookup', now(), now() + interval '30 days')
        `.execute(db),
      /user_reference_locations_origem|check/i,
    );
  });

  void it('não aceita validade anterior à captura', async () => {
    const dono = await criarConta();
    await assert.rejects(
      () =>
        sql`
          INSERT INTO user_reference_locations
            (user_id, reference_point, precision_m, source, captured_at, expires_at)
          VALUES (${dono}, ST_SetSRID(ST_MakePoint(-46.656, -23.561), 4326)::geography,
                  100, 'device_gps', now(), now() - interval '1 day')
        `.execute(db),
      /validade_no_futuro|check/i,
    );
  });
});
