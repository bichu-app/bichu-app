/**
 * A decisão humana sobre a correspondência, contra Postgres de verdade
 * (BICHUS-86, critérios 4, 5 e 12).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * Cada item abaixo é uma coisa que a suíte unitária inteira aprova com o
 * mecanismo desligado:
 *
 * - **`match_candidates_decisao_tem_autor` NÃO exige que o autor seja o tutor.**
 *   O comentário da migração diz que quem decide é o tutor; o `CHECK` cobra
 *   *uma pessoa e um instante*, e qualquer `users.id` satisfaz os dois. O
 *   primeiro caso deste arquivo executa o `UPDATE` de um terceiro escrito à mão
 *   e mostra que **o banco aceita** — e é por isso que a autorização precisa
 *   estar na cláusula `WHERE` da aplicação, e não ser deduzida da DDL.
 * - **o filtro `m.status = 'rejected'` de `paresParaCruzar`.** Ele está escrito
 *   em `kysely-found-report-repository.ts` desde a BICHUS-35 e até esta história
 *   **nunca eliminou nada**, porque nenhum caminho do produto escrevia o valor.
 *   Só executando o cruzamento depois de uma rejeição real é que se vê se o
 *   filtro eliminatório 6 da seção 4.10 existe de fato.
 * - **`conversations` nascendo do `INSERT ... SELECT` a partir do pet do CASO**,
 *   com `case_id` derivado dentro da própria escrita, e os CHECK de dois lados
 *   distintos por trás.
 * - **o `coalesce` do nome de quem achou**, que junta duas colunas de duas
 *   tabelas. Um dublê devolve a string que lhe entregarem.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera e o banco é derrubado com `-v` no fim. Nada aqui toca a
 * pilha de desenvolvimento. O que sobrevive à execução: nada — as contas são
 * apagadas no `after` e o `ON DELETE CASCADE` leva pets, casos, achados,
 * candidatos e conversas junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarLostCaseRepository } from '../../src/modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import { criarFoundReportRepository } from '../../src/modules/found/adapters/persistence/kysely-found-report-repository.js';
import { criarConversationRepository } from '../../src/modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import type { LostCaseRepository } from '../../src/modules/lostfound/ports/lost-case-repository.js';
import type { FoundReportRepository } from '../../src/modules/found/ports/found-report-repository.js';
import type { ConversationRepository } from '../../src/modules/messaging/ports/conversation-repository.js';
import type {
  CaseId,
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** Avenida Paulista, 1578. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let casos: LostCaseRepository;
let achados: FoundReportRepository;
let conversas: ConversationRepository;
const contasCriadas: UserId[] = [];

async function criarConta(nome: string | null = null): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)', [
    id,
    `bichus86-${id}@${DOMINIO_DE_TESTE}`,
    nome,
  ]);
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId, nome = 'Nina'): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code,
                       primary_color_code, breed_code, sex)
     VALUES ($1,$2,$3,'dog','M','caramelo','srd_dog','female')`,
    [id, dono, nome],
  );
  return id;
}

async function abrirCaso(dono: UserId, pet: PetId): Promise<CaseId> {
  const id = randomUUID() as CaseId;
  await cliente.query(
    `INSERT INTO lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_point,
                             last_seen_city, share_token)
     VALUES ($1,$2,$3,$4,$5::geography,'São Paulo',$6)`,
    [
      id,
      pet,
      dono,
      new Date(Number(AGORA) - 2 * DIA),
      `SRID=4326;POINT(${String(PAULISTA.lon)} ${String(PAULISTA.lat)})`,
      `share-${randomUUID()}`,
    ],
  );
  return id;
}

/** O achado AVULSO: sem plaquinha, sem pet, com conta e SEM token. */
async function criarAchadoAvulso(relator: UserId): Promise<FoundReportId> {
  const gravado = await achados.criar({
    id: randomUUID() as FoundReportId,
    reporterUserId: relator,
    especie: 'dog',
    porte: 'M',
    sexo: 'female',
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
    observacao: 'Estava com coleira vermelha.',
    caseId: null,
    retencaoAte: (Number(AGORA) + 30 * DIA) as Instant,
  });
  return gravado.id as FoundReportId;
}

/** Um candidato SUGERIDO para o par, que é tudo o que o cruzamento produz. */
async function sugerir(caso: CaseId, achado: FoundReportId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO match_candidates
       (id, case_id, found_report_id, score, matched_attributes, distance_m,
        link_origin, strategy_version)
     VALUES ($1,$2,$3,0.780,'{"porte":0.30,"cor":0.25,"tempo":0}'::jsonb,800,
             'attribute_match','v1')`,
    [id, caso, achado],
  );
  return id;
}

/** O cenário inteiro: tutor com caso aberto, relator com conta, par sugerido. */
async function cenario(nomeDoRelator: string | null = 'Ana Paula Ribeiro'): Promise<{
  tutor: UserId;
  pet: PetId;
  caso: CaseId;
  relator: UserId;
  achado: FoundReportId;
  candidato: string;
}> {
  const tutor = await criarConta('Leandro Panegassi');
  const pet = await criarPet(tutor);
  const caso = await abrirCaso(tutor, pet);
  const relator = await criarConta(nomeDoRelator);
  const achado = await criarAchadoAvulso(relator);
  return { tutor, pet, caso, relator, achado, candidato: await sugerir(caso, achado) };
}

async function statusDoCandidato(
  candidato: string,
): Promise<{ status: string; decided_by_user_id: string | null } | undefined> {
  const r = await cliente.query<{ status: string; decided_by_user_id: string | null }>(
    'SELECT status, decided_by_user_id FROM match_candidates WHERE id = $1',
    [candidato],
  );
  return r.rows[0];
}

/**
 * Abre a conversa do jeito que `LostCaseService` a abre ao confirmar.
 *
 * A fiação de verdade está em `bin/api.ts` e passa por `ConversationService`;
 * aqui o que interessa é a escrita, que é a parte que o banco decide.
 */
async function abrirPorConfirmacao(
  achado: FoundReportId,
  pet: PetId,
  relator: UserId,
): Promise<void> {
  await conversas.abrirPorAviso({
    id: randomUUID() as ConversationId,
    foundReportId: achado,
    petId: pet,
    achadorComConta: relator,
  });
}

void describe('a decisão humana sobre o candidato (BICHUS-86)', { skip: CONEXAO === undefined }, () => {
  before(async () => {
    banco = createDb(CONEXAO ?? '');
    db = banco.db;
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();
    casos = criarLostCaseRepository(db);
    achados = criarFoundReportRepository(db);
    conversas = criarConversationRepository(db);
  });

  after(async () => {
    if (contasCriadas.length > 0) {
      await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
    }
    await cliente.end();
    await banco.close();
  });

  void describe('quem decide é o tutor do caso, e quem garante isso é o WHERE', () => {
    void it('O BANCO SOZINHO DEIXA UM TERCEIRO DECIDIR — e é por isso que o WHERE existe', async () => {
      // **A medição que justifica a história inteira.** O comentário de
      // `20260922000003_achado-avulso-e-correspondencia.sql` diz que quem decide
      // é o tutor. O CHECK `match_candidates_decisao_tem_autor` cobra apenas uma
      // pessoa e um instante — e a linha abaixo, escrita por uma conta que não
      // tem nada a ver com o caso, ENTRA.
      //
      // Este caso não prova o produto: ele prova que a justificativa escrita na
      // migração não é cumprida pela DDL, e que remover o predicado da
      // aplicação não acordaria o banco.
      const { caso, candidato } = await cenario();
      const estranho = await criarConta('Terceiro');

      await cliente.query(
        `UPDATE match_candidates
            SET status = 'confirmed', decided_by_user_id = $2, decided_at = now()
          WHERE id = $1`,
        [candidato, estranho],
      );

      const linha = await statusDoCandidato(candidato);
      assert.equal(
        linha?.decided_by_user_id,
        estranho,
        'o banco passou a recusar o decisor que não é tutor. Se isso virou verdade em ' +
          'DDL, ótimo — mas então esta asserção precisa mudar junto com a migração, e ' +
          'não ficar verde por acaso',
      );
      assert.ok(caso);
    });

    void it('a CONSULTA DA APLICAÇÃO recusa o terceiro, e recusa por ausência', async () => {
      const { caso, candidato } = await cenario();
      const estranho = await criarConta('Terceiro');

      const decidido = await casos.decidirCandidato({
        caso,
        candidato,
        dono: estranho,
        decisao: 'confirmed',
        agora: AGORA,
      });

      assert.equal(
        decidido,
        null,
        'um terceiro decidiu a correspondência do caso de outra pessoa pela consulta ' +
          'da aplicação. O `WHERE` é a única coisa que impede isso: o banco aceita',
      );
      const linha = await statusDoCandidato(candidato);
      assert.equal(linha?.status, 'suggested', 'a linha foi alterada mesmo assim');
      assert.equal(linha?.decided_by_user_id, null);
    });

    void it('o tutor decide, e a linha sai de `suggested` com autor e instante', async () => {
      const { tutor, caso, candidato } = await cenario();

      const decidido = await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });

      assert.ok(decidido !== null, 'o tutor não conseguiu decidir o próprio candidato');
      assert.equal(decidido.status, 'confirmed');
      assert.equal(decidido.nomeDoPet, 'Nina');
      // A lista é `matched_attributes` com peso zero de fora: o que vai para o
      // cartão é *o que bateu*, e `tempo: 0` não bateu.
      assert.deepEqual([...decidido.atributosQuePontuaram].sort(), ['cor', 'porte']);
      const linha = await statusDoCandidato(candidato);
      assert.equal(linha?.decided_by_user_id, tutor);
    });

    void it('o candidato de outro caso do MESMO tutor não é decidido por este endereço', async () => {
      // O `caseId` do caminho é filtro A MAIS. Sem ele, a decisão entraria pelo
      // endereço errado e a trilha registraria o caso errado.
      const primeiro = await cenario();
      const outroPet = await criarPet(primeiro.tutor, 'Bidu');
      const outroCaso = await abrirCaso(primeiro.tutor, outroPet);

      const decidido = await casos.decidirCandidato({
        caso: outroCaso,
        candidato: primeiro.candidato,
        dono: primeiro.tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });

      assert.equal(decidido, null);
      assert.equal((await statusDoCandidato(primeiro.candidato))?.status, 'suggested');
    });

    void it('caso encerrado não aceita mais decisão', async () => {
      const { tutor, caso, candidato } = await cenario();
      // Pelo caminho de verdade: `lost_cases_encerrado_tem_desfecho` recusa um
      // `status` encerrado sem `closed_at` e sem `closure_outcome`, e um UPDATE
      // à mão aqui estaria testando um estado que o produto não produz.
      const encerrado = await casos.encerrar({
        caso,
        dono: tutor,
        desfecho: 'reunited',
        canal: 'bichu_alert',
        nota: undefined,
        agora: AGORA,
      });
      assert.ok(encerrado !== null, 'o caso do cenário não encerrou');

      const decidido = await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });

      assert.equal(decidido, null);
    });
  });

  void describe('confirmar abre a conversa; rejeitar não abre', () => {
    void it('confirmada, a conversa nasce com os dois lados e cai no caso que casou', async () => {
      const { tutor, pet, caso, relator, achado, candidato } = await cenario();

      const decidido = await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });
      assert.ok(decidido !== null);
      await abrirPorConfirmacao(decidido.foundReportId, decidido.petId, relator);

      const linha = await cliente.query<{
        tutor_user_id: string;
        finder_user_id: string | null;
        case_id: string | null;
      }>(
        'SELECT tutor_user_id, finder_user_id, case_id FROM conversations WHERE found_report_id = $1',
        [achado],
      );
      assert.equal(linha.rows[0]?.tutor_user_id, tutor, 'o tutor continua saindo do pet');
      assert.equal(
        linha.rows[0]?.finder_user_id,
        relator,
        'sem token, quem não estiver em `finder_user_id` não volta à conversa nunca mais',
      );
      assert.equal(linha.rows[0]?.case_id, caso, 'a conversa precisa cair no caso que casou');
      assert.ok(pet);
    });

    void it('rejeitado, nenhuma conversa existe para aquele achado', async () => {
      const { tutor, caso, achado, candidato } = await cenario();

      const decidido = await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'rejected',
        agora: AGORA,
      });

      assert.equal(decidido?.status, 'rejected');
      assert.equal(
        await conversas.porAviso(achado),
        undefined,
        'rejeitar abriu o canal com quem o tutor acabou de dizer que não achou o pet dele',
      );
    });

    void it('o candidato apenas SUGERIDO não abriu conversa nenhuma', async () => {
      // O cruzamento sugere e nada mais (critério 20). Sem este caso, o anterior
      // não prova nada: ele mediria uma conversa que já não existia.
      const { achado } = await cenario();
      assert.equal(await conversas.porAviso(achado), undefined);
    });
  });

  void describe('REJEITADO NÃO VOLTA, e o filtro do cruzamento passa a eliminar', () => {
    void it('o cruzamento traz o par enquanto ninguém rejeitou', async () => {
      // A metade sem a qual o caso seguinte não prova nada: se o par não
      // aparecesse nem antes, "sumiu depois da rejeição" seria silêncio.
      const { caso, achado } = await cenario();

      const pares = await achados.paresParaCruzar(achado);
      const par = pares.find((p) => p.caso.caseId === caso);
      assert.ok(par !== undefined, 'o par nem chegou ao cruzamento: o cenário está errado');
      assert.equal(
        par.achado.jaRejeitadoPorHumano,
        false,
        'o par nasceu marcado como rejeitado, e o caso seguinte mediria o estado errado',
      );
    });

    void it('depois da rejeição, `jaRejeitadoPorHumano` fica VERDADEIRO', async () => {
      // **O filtro eliminatório 6 da seção 4.10 passa a existir de verdade.**
      // `m.status = 'rejected'` está escrito em `paresParaCruzar` desde a
      // BICHUS-35 e até aqui nunca eliminou nada, porque nenhum caminho do
      // produto escrevia o valor.
      const { tutor, caso, achado, candidato } = await cenario();
      await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'rejected',
        agora: AGORA,
      });

      const pares = await achados.paresParaCruzar(achado);
      const par = pares.find((p) => p.caso.caseId === caso);
      assert.ok(par !== undefined);
      assert.equal(
        par.achado.jaRejeitadoPorHumano,
        true,
        'o par rejeitado voltou ao cruzamento como se ninguém tivesse decidido nada. ' +
          '"Rejeitado não volta" (seção 4.10) deixou de valer',
      );
    });

    void it('a confirmação NÃO marca o par como rejeitado', async () => {
      // O filtro é sobre `rejected`, e não sobre "já decidido": confirmar em um
      // caso não remove o achado dos outros (seção 4.10).
      const { tutor, caso, achado, candidato } = await cenario();
      await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });

      const par = (await achados.paresParaCruzar(achado)).find((p) => p.caso.caseId === caso);
      assert.equal(par?.achado.jaRejeitadoPorHumano, false);
    });

    void it('recalcular NÃO desfaz a rejeição, e a segunda decisão não passa', async () => {
      const { tutor, caso, achado, candidato } = await cenario();
      await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'rejected',
        agora: AGORA,
      });

      // O cruzamento reprocessa o mesmo par: `ON CONFLICT ... DO UPDATE WHERE
      // status = 'suggested'` não alcança a linha decidida.
      await achados.sugerirCorrespondencias([
        {
          caseId: caso,
          foundReportId: achado,
          score: 0.95,
          atributosQuePontuaram: { porte: 0.3 },
          distanciaEmMetros: 100,
          linkOrigin: 'attribute_match',
          versaoDaEstrategia: 'v1',
        },
      ]);
      assert.equal((await statusDoCandidato(candidato))?.status, 'rejected');

      // E o tutor tampouco desfaz pela operação: a escrita só sai de `suggested`.
      const segunda = await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });
      assert.equal(segunda, null, 'a rejeição foi desfeita pela própria operação de decisão');
    });

    void it('o reenvio da fila offline lê a MESMA decisão, e só para o tutor', async () => {
      const { tutor, caso, candidato } = await cenario();
      const estranho = await criarConta('Terceiro');
      await casos.decidirCandidato({
        caso,
        candidato,
        dono: tutor,
        decisao: 'confirmed',
        agora: AGORA,
      });

      const relido = await casos.candidatoDecididoDoTutor(caso, candidato, tutor);
      assert.equal(relido?.status, 'confirmed');
      assert.equal(
        await casos.candidatoDecididoDoTutor(caso, candidato, estranho),
        null,
        'a leitura do reenvio relaxou a autorização e virou um oráculo sobre o caso alheio',
      );
    });
  });

  void describe('o nome de quem achou, quando quem achou tem conta', () => {
    void it('a conversa do achado avulso NÃO sai com o nome nulo', async () => {
      // **O buraco que vem junto com esta rota.**
      // `construtorDaLeituraDoChamador` lia só `found_reports.finder_display_name`,
      // que é o campo do formulário de quem NÃO tem conta — e o `INSERT` do
      // achado avulso não o escreve, de propósito. Sem o `coalesce`, o tutor via
      // `Quem achou` na conversa de uma pessoa com conta e nome preenchido.
      const { tutor, pet, relator, achado } = await cenario('Ana Paula Ribeiro');

      const semNomeNoFormulario = await cliente.query<{ finder_display_name: string | null }>(
        'SELECT finder_display_name FROM found_reports WHERE id = $1',
        [achado],
      );
      assert.equal(
        semNomeNoFormulario.rows[0]?.finder_display_name,
        null,
        'o achado avulso passou a escrever `finder_display_name`, e então este caso ' +
          'mede o caminho errado: ele existe justamente porque a coluna fica nula',
      );

      await abrirPorConfirmacao(achado, pet, relator);
      const conversa = await conversas.porAviso(achado);
      assert.ok(conversa !== undefined, 'a conversa do achado avulso não foi aberta');

      const lida = await conversas.buscarDoChamador(conversa, tutor);
      assert.equal(
        lida?.nomeDoAchador,
        'Ana Paula Ribeiro',
        'o tutor recebeu o nome nulo de quem achou o pet dele, e a tela mostrou ' +
          '`Quem achou` para uma pessoa que tem conta e nome preenchido',
      );
    });

    void it('o nome do FORMULÁRIO continua ganhando, e a resposta de hoje não muda', async () => {
      // A ordem do `coalesce`. No caminho da plaquinha o nome do formulário já é
      // o que a rota devolve; invertê-lo trocaria o nome que a pessoa escolheu
      // dar naquele aviso pelo nome do cadastro dela.
      const { tutor, pet, relator, achado } = await cenario('Ana Paula Ribeiro');
      await cliente.query('UPDATE found_reports SET finder_display_name = $2 WHERE id = $1', [
        achado,
        'Aninha do 302',
      ]);

      await abrirPorConfirmacao(achado, pet, relator);
      const conversa = await conversas.porAviso(achado);
      assert.ok(conversa !== undefined);
      assert.equal(
        (await conversas.buscarDoChamador(conversa, tutor))?.nomeDoAchador,
        'Aninha do 302',
      );
    });

    void it('achador SEM conta continua com o nome do formulário, e a conversa não some', async () => {
      // O `LEFT JOIN` é `LEFT` por isto: um `INNER` faria a conversa do achador
      // anônimo — que é a maioria no caminho da plaquinha — DESAPARECER da lista
      // do tutor, porque `conversations.finder_user_id` é nulo lá.
      const { tutor, pet, achado } = await cenario();
      await cliente.query('UPDATE found_reports SET finder_display_name = $2 WHERE id = $1', [
        achado,
        'Quem passava na rua',
      ]);
      await conversas.abrirPorAviso({
        id: randomUUID() as ConversationId,
        foundReportId: achado,
        petId: pet,
        achadorComConta: null,
      });

      const conversa = await conversas.porAviso(achado);
      assert.ok(
        conversa !== undefined,
        'a conversa do achador sem conta sumiu: o LEFT JOIN do nome virou INNER',
      );
      assert.equal(
        (await conversas.buscarDoChamador(conversa, tutor))?.nomeDoAchador,
        'Quem passava na rua',
      );
    });
  });
});
