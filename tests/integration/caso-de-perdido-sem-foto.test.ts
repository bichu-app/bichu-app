/**
 * **UM CASO DE PERDIDO SEM FOTO, ABERTO E RENDERIZADO EM CADA SUPERFÍCIE
 * PÚBLICA, CONTRA POSTGRES DE VERDADE.**
 *
 * ## A decisão, e o risco que ela cria
 *
 * O cliente, em 03/11/2026: *"quando o tutor vai registrar que o seu pet foi
 * perdido, se o pet não tiver foto cadastrada, o botão avisar agora não fica
 * habilitado"*. Era trava declarada, com a razão escrita. Com as três saídas na
 * mesa — manter a trava com um caminho para a foto, tirar a trava, ou abrir e
 * cobrar a foto depois — ele escolheu **tirar a trava**: pet perdido é questão
 * de horas, e o custo aceito é que o cartaz público nasce sem a coisa que faz
 * um vizinho reconhecer o animal.
 *
 * Tirando a trava, **passa a existir um estado que a trava impedia**: caso
 * aberto sem foto. O risco não é o `if` removido, é toda superfície pública que
 * assumia a foto. É isso que este arquivo mede.
 *
 * ## Por que não pode ser unitário
 *
 * As três superfícies públicas são consultas. O que decide se um caso sem foto
 * **aparece** ou **desaparece** é o tipo da junção com `pet_photos` (`LEFT` ou
 * `INNER`), e o que decide se ele quebra é se `card_key`/`thumb_key` chegam
 * nulos ou se a consulta os filtra. Nada disso existe fora do banco: um dublê
 * de repositório devolve o que o teste mandou devolver, e passaria com junção
 * de qualquer tipo. A trava em si também é SQL — um `EXISTS` sobre `pet_photos`
 * em `kysely-lost-case-repository.ts`.
 *
 * ## A isca, e a prova de que ela reprova ANTES do conserto
 *
 * Medido em 03/11/2026, Node v22, contra a pilha efêmera deste worktree, sobre
 * a base `fb8e5c2d`:
 *
 * | o que foi medido | base `fb8e5c2d` | depois |
 * |---|---|---|
 * | placar da suíte inteira | 941 em 70, **936 passaram, 5 reprovaram** | 941 em 70, 941 passaram |
 * | os CINCO casos deste arquivo | **todos os 5 reprovaram** | todos os 5 passam |
 *
 * A causa, uma só, no `before`: `AppError: pet-photo-missing: Seu pet precisa
 * de uma foto`, lançado de `problemaDoBloqueio` dentro de
 * `LostCaseService.abrir`. Os cinco saíram como `test did not finish before
 * its parent and was cancelled`, com o `describe` nomeando o erro -- ou seja,
 * **o teste não conseguia nem montar a massa**, porque abrir um caso sem foto
 * era proibido. É a reprovação do tipo certo. Caso que passa dos dois lados
 * não mede nada.
 *
 * A variante rodada contra a base difere deste arquivo em UMA linha: a
 * asserção `previa.avisos` do último caso saiu, porque o campo não existe em
 * `fb8e5c2d` e sem isso o arquivo não compilaria lá. A asserção que sobrou
 * (`blockers` vazio) mede o que a base faz -- e ela também reprovaria, porque
 * a base põe `pet_photo_missing` em `blockers`.
 *
 * ## O que este arquivo NÃO mede
 *
 * A tela. O app é medido em `app/test/`, e o cartaz do site não existe ainda
 * (`web/src/pages/` não tem `/p/` nem `/cartaz/` em 03/11/2026).
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas saem no `after`, e o `ON DELETE CASCADE` leva pets e
 * casos junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { criarLostCaseRepository } from '../../src/modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import { criarAlcancePorPostGIS } from '../../src/modules/lostfound/adapters/persistence/kysely-alcance-por-postgis.js';
import { criarRegistroDeDisparos } from '../../src/modules/lostfound/adapters/persistence/kysely-registro-de-disparos.js';
import { criarLeituraPublicaDoCaso } from '../../src/modules/lostfound/adapters/persistence/kysely-leitura-publica-do-caso.js';
import { criarListagemPublicaDePerdidos } from '../../src/modules/lostfound/adapters/persistence/kysely-listagem-publica-de-perdidos.js';
import { criarJobQueue } from '../../src/shared/queue/kysely-job-queue.js';
import { LostCaseService } from '../../src/modules/lostfound/application/lost-case-service.js';
import { LeituraPublicaDoCasoService } from '../../src/modules/lostfound/application/leitura-publica-do-caso.js';
import { ListagemPublicaDePerdidosService } from '../../src/modules/lostfound/application/listagem-publica-de-perdidos.js';
import { registrarRotasDaLeituraPublicaDoCaso } from '../../src/modules/lostfound/adapters/http/leitura-publica-do-caso-routes.js';
import { registrarRotaDaListagemDePerdidos } from '../../src/modules/lostfound/adapters/http/listagem-publica-de-perdidos-routes.js';
import { escoparRotas } from '../../src/shared/http/registrar-rota.js';
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarContadorEmMemoria } from '../../src/shared/http/rate-limit.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { BasesPublicas } from '../../src/modules/lostfound/domain/projecao-publica-do-caso.js';
import type { AbsoluteUrl, Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let casos: LostCaseService;

const contasCriadas: string[] = [];

const AGORA = new Date('2026-11-03T12:00:00.000Z') as unknown as Instant;
const ONTEM = new Date('2026-11-02T12:00:00.000Z') as unknown as Instant;

const BASE_DE_PROBLEMA = 'https://dominio-a-definir.com.br/problems' as unknown as AbsoluteUrl;
const BASES: BasesPublicas = {
  baseDaWeb: 'https://bichu.app' as unknown as AbsoluteUrl,
  baseDeMidia: 'https://midia.bichu.app' as unknown as AbsoluteUrl,
};

/**
 * A cidade deste arquivo é ÚNICA por execução: a listagem pública é global, e
 * sem recorte próprio uma asserção de presença passaria por causa de massa de
 * outro arquivo.
 */
const CIDADE = `Cidade-${randomUUID().slice(0, 8)}`;

/** Conta com e-mail VERIFICADO: o canal continua sendo bloqueio, e não é o que medimos aqui. */
async function criarContaVerificada(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, email_verified_at, public_ref, display_name, status)
     VALUES ($1, $2, $3, $4, 'Tutor de teste', 'active')`,
    [
      id,
      `sem-foto-${id}@exemplo-de-teste.invalid`,
      AGORA,
      randomUUID().replace(/-/g, '').slice(0, 22),
    ],
  );
  contasCriadas.push(id);
  return id;
}

/** Um pet com ZERO linhas em `pet_photos`. É o estado que a trava proibia. */
async function criarPetSemFoto(dono: UserId, nome: string): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code, status)
     VALUES ($1, $2, $3, 'dog', 'M', 'active')`,
    [id, dono, nome],
  );
  return id;
}

/**
 * **CONTROLE POSITIVO DA MASSA**: se houver qualquer linha em `pet_photos`, este
 * arquivo não está medindo o que diz medir.
 */
async function exigirPetSemNenhumaFoto(pet: PetId): Promise<void> {
  const { rows } = await cliente.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM pet_photos WHERE pet_id = $1',
    [pet],
  );
  assert.equal(rows[0]?.n, '0', 'a massa deste arquivo exige pet com ZERO fotos');
}

function servicoDeCasos(): LostCaseService {
  const ids = criarIdGenerator(() => Date.now());
  return new LostCaseService({
    repositorio: criarLostCaseRepository(db),
    ids,
    clock: { now: () => AGORA },
    // A trilha é dublada DE PROPÓSITO: o que este arquivo mede é a abertura e as
    // leituras públicas. A gravação da trilha tem bancada própria.
    trilha: { record: () => Promise.resolve() },
    alcance: criarAlcancePorPostGIS(db),
    disparos: criarRegistroDeDisparos(db),
    fila: criarJobQueue(db, ids),
    transferencias: { cancelarPorCasoAberto: () => Promise.resolve() },
    conversaDaCorrespondencia: { aoConfirmarCorrespondencia: () => Promise.resolve() },
  });
}

/** O servidor de verdade, com as DUAS rotas públicas e o vigia de parâmetros que a produção instala. */
async function servidorPublico() {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const contrato = carregarContrato('api/openapi.yaml');
  vigiarParametrosDasRotas(app, contrato, '/v1');
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDaLeituraPublicaDoCaso(escopo, {
      leitura: new LeituraPublicaDoCasoService(criarLeituraPublicaDoCaso(db), BASES),
      autenticador: { autenticar: () => Promise.reject(new Error('nao usado')) },
    });
    registrarRotaDaListagemDePerdidos(escopo, {
      listagem: new ListagemPublicaDePerdidosService(criarListagemPublicaDePerdidos(db), BASES, {
        now: () => AGORA,
      }),
    });
  });
  await app.ready();
  return app;
}

async function pegar(url: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const app = await servidorPublico();
  const r = await app.inject({ method: 'GET', url });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

void describe(
  'um caso de perdido SEM FOTO, aberto e lido em cada superfície pública',
  {
    skip:
      CONEXAO === undefined
        ? 'sem DATABASE_URL: a pilha efemera nao esta de pe'
        : false,
  },
  () => {
    let shareToken: string;

    before(async () => {
      assert.ok(CONEXAO !== undefined);
      banco = createDb(CONEXAO);
      db = banco.db;
      cliente = new pg.Client({ connectionString: CONEXAO });
      await cliente.connect();
      casos = servicoDeCasos();

      const dono = await criarContaVerificada();
      const pet = await criarPetSemFoto(dono, 'Caramelo sem foto');
      await exigirPetSemNenhumaFoto(pet);

      // **ESTA LINHA É A REPROVAÇÃO NA BASE.** Em `fb8e5c2d` ela lança
      // `AppError: pet-photo-missing`, e os quatro casos abaixo morrem no
      // `before` por não haver caso para ler.
      const { caso } = await casos.abrir(
        pet,
        {
          lastSeenAt: ONTEM,
          city: CIDADE,
          neighborhood: 'Vila Madalena',
          shareToPublicList: true,
        },
        { userId: dono, correlationId: randomUUID(), ip: undefined },
      );
      shareToken = caso.shareToken;
    });

    after(async () => {
      if (contasCriadas.length > 0) {
        await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
      }
      await cliente.end();
      await banco.close();
    });

    void it('o caso sem foto ABRE, e nasce com `share_token` para a rua', () => {
      assert.ok(shareToken.length > 0, 'sem share_token não há cartaz nem link para divulgar');
    });

    void it('a página pública do caso responde 200, e `photo_url` é NULO e não ausente', async () => {
      const { status, corpo } = await pegar(`/v1/public/lost-cases/${shareToken}`);

      assert.equal(status, 200, 'o caso sem foto NÃO pode desaparecer da rota pública');
      assert.equal(corpo['photo_url'], null);
      assert.ok('photo_url' in corpo, 'nulo declarado é diferente de campo que sumiu');
      // O que o vizinho PRECISA para reconhecer sem foto continua inteiro.
      assert.equal(corpo['species'], 'dog');
      assert.equal(corpo['size'], 'M');
      assert.ok(typeof corpo['pet_display_name'] === 'string');
    });

    void it('o CARTAZ responde 200 sem foto, com o link curto que vai no papel', async () => {
      const { status, corpo } = await pegar(`/v1/public/lost-cases/${shareToken}/poster`);

      assert.equal(status, 200, 'cartaz é a superfície de rua: sem foto ele ainda tem de sair');
      assert.equal(corpo['photo_url'], null);
      assert.ok(typeof corpo['short_url'] === 'string' && corpo['short_url'] !== '');
    });

    void it('a LISTAGEM pública traz o caso sem foto, e não o esconde', async () => {
      const { status, corpo } = await pegar(
        `/v1/public/lost-pets?city=${encodeURIComponent(CIDADE)}`,
      );

      assert.equal(status, 200);
      const itens = corpo['items'] as readonly Record<string, unknown>[];
      // ISCA: com junção INNER em `pet_photos`, ou com um `photo IS NOT NULL`
      // no `WHERE`, esta lista voltaria VAZIA e o caso teria desaparecido da
      // única vitrine que ele tem.
      assert.equal(itens.length, 1, 'o caso sem foto tem de aparecer na listagem pública');
      assert.equal(itens[0]?.['photo_url'], null);
      assert.equal(itens[0]?.['share_token'], shareToken);
    });

    void it('a prévia põe a falta de foto em `warnings`, e `blockers` fica VAZIO', async () => {
      const dono = await criarContaVerificada();
      const pet = await criarPetSemFoto(dono, 'Outro sem foto');
      await exigirPetSemNenhumaFoto(pet);

      const previa = await casos.previa(pet, undefined, {
        userId: dono,
        correlationId: randomUUID(),
        ip: undefined,
      });

      // O defeito de 03/11 era exatamente este: a falta de foto em `blockers`,
      // onde todo consumidor que decide por `blockers.length > 0` trava.
      assert.deepEqual(previa.bloqueios, []);
      assert.deepEqual(previa.avisos, ['pet_photo_missing']);
    });
  },
);
