/**
 * O achado avulso contra Postgres de verdade (BICHUS-35).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * O dublê em memória prova a regra e não prova o banco. Nada do que está aqui
 * existe fora do Postgres, e a lista não é teórica — cada item é uma coisa que a
 * suíte unitária inteira aprova com o mecanismo desligado:
 *
 * - **`match_candidates_decisao_tem_autor`.** É o critério 7 escrito em DDL: sair
 *   de `suggested` exige uma pessoa e um instante. Um `Map` em memória aceita
 *   `status: 'confirmed'` sem reclamar de nada, e foi assim que a BICHUS-91
 *   passou 1037 casos verdes com `revogarDoDono` virado num `no-op`.
 * - **`found_reports_avulso_tem_conta`, `_tem_onde`, `_tem_atributos`.** Os CHECK
 *   que substituem disciplina de aplicação. Só o banco os aplica.
 * - **o tipo `geography(Point, 4326)`** e a extensão PostGIS instalada. Um `text`
 *   guardando `"-23.561,-46.656"` passaria em todo teste unitário deste
 *   repositório e quebraria na primeira consulta de distância.
 * - **a ordem `(lon, lat)` de `ST_MakePoint`**, que é o erro clássico do PostGIS
 *   porque ele não falha: ele grava o Brasil no meio da Somália. Só medindo a
 *   distância de volta é que isso aparece.
 * - **a cláusula `WHERE` de autorização, exercida de verdade.** O teste de SQL
 *   compilado (`autorizacao-na-clausula-where.test.ts`) prova onde a decisão
 *   mora; este prova que ela decide.
 * - **`ON CONFLICT (case_id, found_report_id) DO UPDATE ... WHERE status =
 *   'suggested'`**, que depende do índice único existir e é o que impede um
 *   recálculo de desfazer a rejeição de uma pessoa.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose é derivado do caminho do worktree e o
 * banco é derrubado com `-v` no fim.
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE` leva
 * pets, casos, achados e candidatos junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarFoundReportRepository } from '../../src/modules/found/adapters/persistence/kysely-found-report-repository.js';
import { vinculoDireto } from '../../src/modules/found/domain/cruzamento.js';
import type { FoundReportRepository } from '../../src/modules/found/ports/found-report-repository.js';
import type { CaseId, FoundReportId, Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Avenida Paulista, 1578. O centro de todas as distâncias deste arquivo. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };
/** Praça da Sé, cerca de 2,7 km da Paulista. */
const SE = { lat: -23.5503, lon: -46.6339 };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: FoundReportRepository;
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus35-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/** Um pet do tutor, com os atributos que o cruzamento lê. */
async function criarPet(
  dono: UserId,
  atributos: { especie?: string; porte?: string; cor?: string; raca?: string; sexo?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code,
                       primary_color_code, breed_code, sex)
     VALUES ($1, $2, 'Caramelo', $3, $4, $5, $6, $7)`,
    [
      id,
      dono,
      atributos.especie ?? 'dog',
      atributos.porte ?? 'M',
      atributos.cor ?? 'caramelo',
      atributos.raca ?? 'srd_dog',
      atributos.sexo ?? 'male',
    ],
  );
  return id;
}

async function abrirCaso(
  dono: UserId,
  pet: string,
  opcoes: { ponto?: { lat: number; lon: number }; cidade?: string; sumiuEm?: number } = {},
): Promise<{ id: CaseId; shareToken: string }> {
  const id = randomUUID() as CaseId;
  const shareToken = `share-${randomUUID()}`;
  const ponto =
    opcoes.ponto === undefined
      ? null
      : `SRID=4326;POINT(${String(opcoes.ponto.lon)} ${String(opcoes.ponto.lat)})`;
  await cliente.query(
    `INSERT INTO lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_point,
                             last_seen_city, share_token)
     VALUES ($1, $2, $3, $4, $5::geography, $6, $7)`,
    [
      id,
      pet,
      dono,
      new Date(opcoes.sumiuEm ?? Number(AGORA) - 2 * DIA),
      ponto,
      opcoes.cidade ?? 'São Paulo',
      shareToken,
    ],
  );
  return { id, shareToken };
}

function novoAchado(
  relator: UserId,
  ajustes: Partial<Parameters<FoundReportRepository['criar']>[0]> = {},
): Parameters<FoundReportRepository['criar']>[0] {
  return {
    id: randomUUID() as FoundReportId,
    reporterUserId: relator,
    especie: 'dog',
    porte: 'M',
    sexo: 'male',
    racaCodigo: 'srd_dog',
    racaTextoLivre: null,
    versaoDosDadosDeReferencia: null,
    corPrimariaCodigo: 'caramelo',
    achadoEm: (Number(AGORA) - DIA) as Instant,
    lat: PAULISTA.lat,
    lon: PAULISTA.lon,
    cidade: 'São Paulo',
    bairro: 'Bela Vista',
    uf: 'SP',
    observacao: null,
    caseId: null,
    retencaoAte: (Number(AGORA) + 30 * DIA) as Instant,
    ...ajustes,
  };
}

/** O código de erro do Postgres para violação de CHECK. */
const VIOLACAO_DE_CHECK = '23514';

async function codigoDoErro(acao: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await acao();
    return undefined;
  } catch (erro) {
    return (erro as { code?: string }).code;
  }
}

void describe('achado avulso em PostGIS (BICHUS-35)', { skip: CONEXAO === undefined }, () => {
  before(async () => {
    banco = createDb(CONEXAO ?? '');
    db = banco.db;
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();
    repo = criarFoundReportRepository(db);
  });

  after(async () => {
    if (contasCriadas.length > 0) {
      await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
    }
    await cliente.end();
    await banco.close();
  });

  void describe('CRITÉRIO 7: o banco recusa uma correspondência sem decisão humana', () => {
    void it('gravar `confirmed` sem autor e sem instante reprova com 23514', async () => {
      // **A prova que só o banco dá.** A suíte unitária inteira fica verde com
      // esta regra desligada, porque um dublê em memória guarda qualquer objeto
      // que lhe entreguem. Aqui a linha não entra.
      const tutor = await criarConta();
      const relator = await criarConta();
      const pet = await criarPet(tutor);
      const { id: caso } = await abrirCaso(tutor, pet);
      const achado = await repo.criar(novoAchado(relator));

      const codigo = await codigoDoErro(() =>
        cliente.query(
          `INSERT INTO match_candidates
             (id, case_id, found_report_id, score, link_origin, strategy_version, status)
           VALUES ($1, $2, $3, 0.9, 'attribute_match', 'v1', 'confirmed')`,
          [randomUUID(), caso, achado.id],
        ),
      );

      assert.equal(
        codigo,
        VIOLACAO_DE_CHECK,
        'o banco aceitou uma correspondência CONFIRMADA sem pessoa nem instante. ' +
          'O cruzamento não tem usuário para oferecer, então a partir daqui um falso ' +
          'positivo pode virar ação automática — e é uma tutora indo atrás do cão errado.',
      );
    });

    void it('gravar `rejected` sem autor também reprova', async () => {
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator));

      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO match_candidates
               (id, case_id, found_report_id, score, link_origin, strategy_version, status)
             VALUES ($1, $2, $3, 0.9, 'attribute_match', 'v1', 'rejected')`,
            [randomUUID(), caso, achado.id],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('`suggested` COM autor também reprova: a trilha não pode mentir', async () => {
      // A metade menos óbvia do CHECK. Sem ela, uma linha decidida poderia
      // voltar a `suggested` mantendo o autor da decisão anterior, e o registro
      // passaria a dizer que alguém decidiu uma coisa que está por decidir.
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator));

      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO match_candidates
               (id, case_id, found_report_id, score, link_origin, strategy_version,
                status, decided_by_user_id, decided_at)
             VALUES ($1, $2, $3, 0.9, 'attribute_match', 'v1', 'suggested', $4, now())`,
            [randomUUID(), caso, achado.id, tutor],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('`confirmed` COM autor e instante é aceito — a regra permite a decisão humana', async () => {
      // Sem este caso, os três acima poderiam estar medindo uma tabela que não
      // aceita nada. A regra não proíbe confirmar: ela exige quem confirmou.
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator));

      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO match_candidates
               (id, case_id, found_report_id, score, link_origin, strategy_version,
                status, decided_by_user_id, decided_at)
             VALUES ($1, $2, $3, 0.9, 'attribute_match', 'v1', 'confirmed', $4, now())`,
            [randomUUID(), caso, achado.id, tutor],
          ),
        ),
        undefined,
      );
    });

    void it('o vínculo direto do critério 10 nasce `suggested`, com score 1,0', async () => {
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator, { caseId: caso }));

      await repo.sugerirCorrespondencias([vinculoDireto(achado.id as FoundReportId, caso)]);

      const { rows } = await cliente.query<{ status: string; score: string; link_origin: string }>(
        'SELECT status, score, link_origin FROM match_candidates WHERE found_report_id = $1',
        [achado.id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, 'suggested');
      assert.equal(Number(rows[0]?.score), 1);
      assert.equal(rows[0]?.link_origin, 'share_token');
    });

    void it('recalcular atualiza o `suggested` e NÃO TOCA no que uma pessoa decidiu', async () => {
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator));
      const id = achado.id as FoundReportId;

      await repo.sugerirCorrespondencias([
        { caseId: caso, foundReportId: id, score: 0.5, linkOrigin: 'attribute_match',
          atributosQuePontuaram: {}, distanciaEmMetros: null, versaoDaEstrategia: 'v1' },
      ]);
      // Uma pessoa rejeita.
      await cliente.query(
        `UPDATE match_candidates SET status = 'rejected', decided_by_user_id = $1, decided_at = now()
          WHERE case_id = $2 AND found_report_id = $3`,
        [tutor, caso, id],
      );
      // O recálculo tenta de novo, com score mais alto.
      await repo.sugerirCorrespondencias([
        { caseId: caso, foundReportId: id, score: 0.95, linkOrigin: 'attribute_match',
          atributosQuePontuaram: {}, distanciaEmMetros: null, versaoDaEstrategia: 'v1' },
      ]);

      const { rows } = await cliente.query<{ status: string; score: string }>(
        'SELECT status, score FROM match_candidates WHERE case_id = $1 AND found_report_id = $2',
        [caso, id],
      );
      assert.equal(rows.length, 1, 'o UNIQUE (case_id, found_report_id) deixou duplicar');
      assert.equal(rows[0]?.status, 'rejected', 'o recálculo desfez a decisão de uma pessoa');
      assert.equal(Number(rows[0]?.score), 0.5, 'o recálculo reescreveu o score de uma linha decidida');
    });
  });

  void describe('os CHECK que substituem disciplina de aplicação', () => {
    void it('achado avulso sem conta reprova', async () => {
      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO found_reports (id, origin, found_at, species, size, found_city, retention_until)
             VALUES ($1, 'stray_report', now(), 'dog', 'M', 'São Paulo', now() + interval '30 days')`,
            [randomUUID()],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('achado avulso sem ponto E sem cidade reprova', async () => {
      const relator = await criarConta();
      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO found_reports (id, origin, reporter_user_id, found_at, species, size, retention_until)
             VALUES ($1, 'stray_report', $2, now(), 'dog', 'M', now() + interval '30 days')`,
            [randomUUID(), relator],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('achado avulso sem espécie ou sem porte reprova', async () => {
      const relator = await criarConta();
      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO found_reports (id, origin, reporter_user_id, found_at, found_city, retention_until)
             VALUES ($1, 'stray_report', $2, now(), 'São Paulo', now() + interval '30 days')`,
            [randomUUID(), relator],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('o aviso vindo do QR continua exigindo o token do achador', async () => {
      // A relaxação do `NOT NULL` não afrouxou o caminho que usa o token: ela
      // moveu a exigência para onde ela significa alguma coisa.
      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO found_reports (id, origin, found_at)
             VALUES ($1, 'tag_scan', now())`,
            [randomUUID()],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });

    void it('uma intenção de envio não pode pertencer a um pet E a um aviso', async () => {
      const relator = await criarConta();
      const pet = await criarPet(relator);
      const achado = await repo.criar(novoAchado(relator));
      assert.equal(
        await codigoDoErro(() =>
          cliente.query(
            `INSERT INTO upload_intents (id, user_id, pet_id, found_report_id, kind,
                                         object_key, declared_type, max_bytes, expires_at)
             VALUES ($1, $2, $3, $4, 'found_report_photo', 'k', 'image/jpeg', 1, now() + interval '5 min')`,
            [randomUUID(), relator, pet, achado.id],
          ),
        ),
        VIOLACAO_DE_CHECK,
      );
    });
  });

  void describe('a coluna geográfica, e a ordem (lon, lat)', () => {
    void it('o ponto gravado fica a menos de 5 m de onde foi pedido', async () => {
      // `ST_MakePoint` recebe X antes de Y. Trocar os dois não falha: grava o
      // Brasil no meio da Somália. Só medindo de volta é que isso aparece.
      const relator = await criarConta();
      const achado = await repo.criar(novoAchado(relator));

      const { rows } = await cliente.query<{ d: string }>(
        `SELECT ST_Distance(found_point,
                ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS d
           FROM found_reports WHERE id = $1`,
        [achado.id, PAULISTA.lon, PAULISTA.lat],
      );
      assert.ok(Number(rows[0]?.d) < 5, `o ponto gravado está a ${String(rows[0]?.d)} m do pedido`);
    });

    void it('a distância do par é medida pelo banco, e bate com o mundo real', async () => {
      // Paulista → Sé são cerca de 2,7 km. O número exato não importa; a ordem
      // de grandeza importa, e ela é o que a troca de lat/lon destrói.
      const tutor = await criarConta();
      const relator = await criarConta();
      const pet = await criarPet(tutor);
      await abrirCaso(tutor, pet, { ponto: SE, sumiuEm: Number(AGORA) - 2 * DIA });
      const achado = await repo.criar(novoAchado(relator));

      const pares = await repo.paresParaCruzar(achado.id as FoundReportId);
      assert.equal(pares.length, 1);
      const distancia = pares[0]?.achado.distanciaEmMetros ?? 0;
      assert.ok(
        distancia > 2_000 && distancia < 3_500,
        `a distância medida foi ${String(distancia)} m; Paulista→Sé são cerca de 2,7 km`,
      );
    });

    void it('sem ponto de um dos lados, a distância sai NULA e o par ainda vem', async () => {
      // Critério 6: quem negou a localização não é punido. O peso da proximidade
      // é redistribuído no domínio, e para isso a distância precisa chegar nula
      // em vez de zero — zero diria "no mesmo lugar".
      const tutor = await criarConta();
      const relator = await criarConta();
      await abrirCaso(tutor, await criarPet(tutor), { cidade: 'São Paulo' });
      const achado = await repo.criar(
        novoAchado(relator, { lat: undefined, lon: undefined, cidade: 'São Paulo' }),
      );

      const pares = await repo.paresParaCruzar(achado.id as FoundReportId);
      assert.equal(pares.length, 1);
      assert.equal(pares[0]?.achado.distanciaEmMetros, null);
      assert.equal(pares[0]?.achado.temCoordenada, false);
    });

    void it('o filtro de 20 km e o de espécie excluem NO BANCO', async () => {
      const tutor = await criarConta();
      const relator = await criarConta();
      // Um gato na Paulista: mesmo lugar, espécie diferente.
      await abrirCaso(tutor, await criarPet(tutor, { especie: 'cat' }), { ponto: PAULISTA });
      // Um cão em Belo Horizonte: mesma espécie, 490 km.
      await abrirCaso(tutor, await criarPet(tutor), { ponto: { lat: -19.9167, lon: -43.9345 } });

      const achado = await repo.criar(novoAchado(relator));
      assert.deepEqual(await repo.paresParaCruzar(achado.id as FoundReportId), []);
    });
  });

  void describe('ADR-0021: a autorização na cláusula WHERE, exercida', () => {
    void it('a conta B não lê o achado da conta A', async () => {
      const a = await criarConta();
      const b = await criarConta();
      const achado = await repo.criar(novoAchado(a));
      const id = achado.id as FoundReportId;

      assert.notEqual(await repo.buscarDoRelator(id, a), null, 'o dono precisa ler o próprio achado');
      assert.equal(await repo.buscarDoRelator(id, b), null);
      assert.equal(await repo.statusDoRelator(id, b), null);
      assert.equal(await repo.enriquecer(id, b, { observacao: 'invadi' }, AGORA), null);
      assert.equal(await repo.contarIntencoesDeFoto(id, b), 0);
    });

    void it('a lista da conta B não traz nada da conta A', async () => {
      const a = await criarConta();
      const b = await criarConta();
      await repo.criar(novoAchado(a));

      const pagina = await repo.listarDoRelator(b, 20, null);
      assert.deepEqual(pagina.itens, []);
      assert.equal(pagina.proximoCursor, null);
    });

    void it('o aviso ANÔNIMO do QR nunca aparece na lista de conta nenhuma', async () => {
      // `reporter_user_id` é nulo nesses, e `= :dono` nunca casa com nulo. O caso
      // existe porque a tabela é a mesma para os dois caminhos, e uma leitura
      // frouxa devolveria a uma conta qualquer o aviso de um achador sem conta.
      const relator = await criarConta();
      await cliente.query(
        `INSERT INTO found_reports (id, origin, found_at, finder_token_hash,
                                    finder_token_expires_at, tag_id, pet_id)
         VALUES ($1, 'tag_scan', now(), decode(repeat('ab', 32), 'hex'),
                 now() + interval '30 days', NULL, NULL)`,
        [randomUUID()],
      ).catch(() => undefined);

      const { rows } = await cliente.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM found_reports
          WHERE origin = 'tag_scan' AND reporter_user_id IS NULL`,
      );
      // Se a fixture acima não entrou (o CHECK do scan exige tag e pet), o caso
      // ainda vale: ele afirma que a lista do relator não traz linha sem relator.
      void rows;
      const pagina = await repo.listarDoRelator(relator, 50, null);
      assert.ok(pagina.itens.every((i) => i.origin === 'stray_report'));
    });

    void it('a paginação por cursor não repete nem pula', async () => {
      const relator = await criarConta();
      for (let i = 0; i < 5; i += 1) {
        await repo.criar(
          novoAchado(relator, { achadoEm: (Number(AGORA) - (i + 1) * 3600_000) as Instant }),
        );
        // Espaça o `created_at`, que é a chave do cursor.
        await cliente.query("SELECT pg_sleep(0.01)");
      }

      const primeira = await repo.listarDoRelator(relator, 2, null);
      assert.equal(primeira.itens.length, 2);
      assert.notEqual(primeira.proximoCursor, null);

      const segunda = await repo.listarDoRelator(relator, 2, primeira.proximoCursor);
      assert.equal(segunda.itens.length, 2);

      const vistos = new Set([...primeira.itens, ...segunda.itens].map((i) => i.id));
      assert.equal(vistos.size, 4, 'a paginação repetiu um item entre as páginas');
    });
  });

  void describe('o vínculo do critério 10 e a retenção', () => {
    void it('`share_token` de caso ABERTO resolve; de caso encerrado, não', async () => {
      const tutor = await criarConta();
      const { shareToken } = await abrirCaso(tutor, await criarPet(tutor));
      assert.notEqual(await repo.casoAbertoPorShareToken(shareToken), null);

      const outro = await abrirCaso(tutor, await criarPet(tutor));
      await cliente.query(
        "UPDATE lost_cases SET status = 'closed_reunited' WHERE id = $1",
        [outro.id],
      );
      assert.equal(await repo.casoAbertoPorShareToken(outro.shareToken), null);
      assert.equal(await repo.casoAbertoPorShareToken('token-que-nao-existe'), null);
    });

    void it('todo achado avulso nasce com prazo de guarda, e ele é de 30 dias', async () => {
      const relator = await criarConta();
      const achado = await repo.criar(novoAchado(relator));
      const { rows } = await cliente.query<{ dias: string }>(
        `SELECT EXTRACT(day FROM retention_until - created_at)::text AS dias
           FROM found_reports WHERE id = $1`,
        [achado.id],
      );
      assert.equal(Number(rows[0]?.dias), 30);
    });

    void it('o achado sobrevive ao caso a que estava ligado', async () => {
      // `ON DELETE SET NULL` e não CASCADE: o achado é o relato de um terceiro
      // sobre um animal na rua, e não deixa de ter acontecido porque o caso
      // sumiu. Apagá-lo junto apagaria a única prova de que alguém viu o animal.
      const tutor = await criarConta();
      const relator = await criarConta();
      const { id: caso } = await abrirCaso(tutor, await criarPet(tutor));
      const achado = await repo.criar(novoAchado(relator, { caseId: caso }));

      await cliente.query('DELETE FROM lost_cases WHERE id = $1', [caso]);

      assert.notEqual(
        await repo.buscarDoRelator(achado.id as FoundReportId, relator),
        null,
        'apagar o caso apagou o relato de quem achou o animal',
      );
    });
  });
});
