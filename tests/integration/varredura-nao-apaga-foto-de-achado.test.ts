/**
 * A VARREDURA NÃO APAGA FOTO DE ACHADO — a barreira do SQL, contra Postgres.
 *
 * ## O defeito que este arquivo existe para não deixar voltar
 *
 * `varrerEnviosVencidos` apagava **o objeto da foto de quem acha um pet**, cerca
 * de dez minutos depois de ela subir. Medido duas vezes, com hora, no balde de
 * hml com soft-delete ligado: subida 01:18:44 → apagada 01:29:10; subida
 * 01:33:35 → apagada 01:44:10.
 *
 * A causa não era o filtro errado: era **julgar pelo critério errado**. A
 * consulta de `listarIntencoesVencidas` seleciona `confirmed_at IS NULL AND
 * expires_at < now`, e o comentário dela afirmava que, por isso, "não há risco
 * de apagar o original de uma foto viva". Isso vale para os dois casos que quem
 * escreveu tinha na mesa — **foto de pet e imagem de catálogo, que TÊM operação
 * de confirmação** e portanto saem da lista no instante em que viram foto. A
 * foto do achado é o **terceiro caso**: ela **não tem confirmação no contrato,
 * de propósito**, então `confirmed_at` nunca deixa de ser nulo nela. Ela era
 * **permanentemente elegível**, e não "a desistida".
 *
 * Agravante medido: `found_reports.photo_upload_id` é `ON DELETE SET NULL`
 * (`migrations/20260922000010`), então quando a varredura apagava a linha o
 * aviso **perdia a foto em silêncio**, sem erro em lugar nenhum.
 *
 * ## Por que ESTE arquivo, e não só a suíte unitária
 *
 * `src/modules/media/application/varrer-envios-vencidos.test.ts` mede a guarda
 * do **caso de uso**, que é a segunda barreira, com dublê em memória. Um dublê
 * devolve o que o teste mandar devolver: ele **não alcança a cláusula `WHERE
 * kind NOT IN (...)`**, que é a barreira primária e a que de fato impede o
 * objeto de entrar na lista. Essa cláusula só pode ser medida contra o banco
 * migrado, porque é o Postgres que a executa.
 *
 * As duas barreiras são medidas em arquivos separados de propósito: o defeito
 * nasceu de uma barreira só, defendida por um comentário.
 *
 * ## A decisão que isto implementa (17/10/2026)
 *
 * **Nenhum apagamento automático toca informação de perdido ou achado.** Nas
 * palavras do cliente: *"você só deve apagar as informações, caso o usuário
 * remova o pet ou delete a conta"*. Prazo não é ação de pessoa.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * E a isca que prova que estes casos morde:
 *
 *   node infra/integracao/iscas/rodar-iscas.mjs varredura-apaga-foto-de-achado
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarMediaRepository } from '../../src/modules/media/adapters/persistence/kysely-media-repository.js';
import type { MediaRepository } from '../../src/modules/media/ports/media-repository.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Bem no passado: toda intenção deste arquivo nasce VENCIDA. */
const VENCIMENTO = new Date(Number(AGORA) - DIA);

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: MediaRepository;
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(`INSERT INTO users (id, email, public_ref) VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`, [
    id,
    `varredura-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

async function criarPet(dono: UserId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code,
                       primary_color_code, breed_code, sex)
     VALUES ($1, $2, 'Caramelo', 'dog', 'M', 'caramelo', 'srd_dog', 'male')`,
    [id, dono],
  );
  return id;
}

/**
 * Um aviso de achado. Mínimo que os CHECK aceitam — este arquivo não mede o
 * cruzamento, só precisa de um `found_report_id` de verdade para a intenção
 * pendurar, porque `upload_intents_foto_de_achado_tem_aviso` o exige.
 */
async function criarAchado(relator: UserId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    // `origin = 'stray_report'` e `reporter_user_id` preenchido: é o achado
    // avulso, e é a combinação que o CHECK `found_reports_scan_tem_token`
    // aceita sem token ao portador (quem tem conta autoriza por `bearerAuth`).
    `INSERT INTO found_reports (id, origin, reporter_user_id, species, size, sex,
                                breed_code, primary_color_code, found_at, found_city,
                                retention_until)
     VALUES ($1, 'stray_report', $2, 'dog', 'M', 'male', 'srd_dog', 'caramelo',
             $3, 'São Paulo', $4)`,
    [id, relator, new Date(Number(AGORA) - DIA), new Date(Number(AGORA) + 30 * DIA)],
  );
  return id;
}

/** Uma intenção VENCIDA e NUNCA confirmada, da espécie que o caso pedir. */
async function intencaoVencida(entrada: {
  kind: 'pet_photo' | 'found_report_photo' | 'finder_photo';
  dono: UserId | null;
  petId: string | null;
  achadoId: string | null;
  objectKey: string;
  uploadRef?: string;
}): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO upload_intents (id, user_id, pet_id, found_report_id, kind, object_key,
                                 declared_type, max_bytes, expires_at, confirmed_at, upload_ref)
     VALUES ($1, $2, $3, $4, $5, $6, 'image/jpeg', 5242880, $7, NULL, $8)`,
    [
      id,
      entrada.dono,
      entrada.petId,
      entrada.achadoId,
      entrada.kind,
      entrada.objectKey,
      VENCIMENTO,
      entrada.uploadRef ?? null,
    ],
  );
  return id;
}

async function aindaExiste(id: string): Promise<boolean> {
  const r = await cliente.query('SELECT 1 FROM upload_intents WHERE id = $1', [id]);
  return r.rowCount === 1;
}

void describe(
  'a varredura de envios vencidos NÃO alcança foto de achado',
  { skip: CONEXAO === undefined },
  () => {
    before(async () => {
      banco = createDb(CONEXAO ?? '');
      db = banco.db;
      cliente = new pg.Client({ connectionString: CONEXAO });
      await cliente.connect();
      repo = criarMediaRepository(db);
    });

    after(async () => {
      if (contasCriadas.length > 0) {
        // `users` leva a cascata inteira: pets, avisos e intenções saem com ela.
        await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
      }
      await cliente.end();
      await banco.close();
    });

    void it('CASO 1 — a foto do achado (COM conta) NÃO entra na lista de vencidas', async () => {
      const dono = await criarConta();
      const achado = await criarAchado(dono);
      const foto = await intencaoVencida({
        kind: 'found_report_photo',
        dono,
        petId: null,
        achadoId: achado,
        objectKey: `found-reports/${achado}/original/${randomUUID()}`,
      });

      const vencidas = await repo.listarIntencoesVencidas(AGORA, 500);

      // **ESTA é a asserção que reprova se a varredura voltar a apagar foto de
      // achado.** A linha está vencida e nunca foi confirmada — ela casaria o
      // critério antigo. O que a mantém fora é o filtro por espécie.
      assert.equal(
        vencidas.some((v) => v.id === foto),
        false,
        'a consulta devolveu foto de ACHADO: a varredura vai apagá-la do balde',
      );
      assert.ok(await aindaExiste(foto));
    });

    void it('CASO 2 — a foto do achador SEM conta também não entra', async () => {
      const relator = await criarConta();
      const achado = await criarAchado(relator);
      // `user_id` nulo, e o CHECK `upload_intents_dono_salvo_achador_sem_conta`
      // só admite isso em `finder_photo`. É o caminho de quem avisa sem se
      // cadastrar, e é o que mais depende de nada apagar: não há conta para
      // reclamar depois.
      const foto = await intencaoVencida({
        kind: 'finder_photo',
        dono: null,
        petId: null,
        achadoId: achado,
        objectKey: `found-reports/sem-conta/original/${randomUUID()}`,
        uploadRef: randomUUID().replaceAll('-', '').slice(0, 22),
      });

      const vencidas = await repo.listarIntencoesVencidas(AGORA, 500);

      assert.equal(
        vencidas.some((v) => v.id === foto),
        false,
        'a consulta devolveu foto de achador SEM CONTA',
      );
    });

    void it('CASO 3 — O CONTRAPESO: a foto de pet abandonada CONTINUA sendo limpa', async () => {
      // Sem este caso, a correção poderia ser "a consulta não devolve nada", que
      // passaria os casos 1 e 2 e trocaria um defeito por outro: o envio
      // abandonado de foto de pet é lixo de verdade, invisível e pago, e ele
      // tem de continuar saindo.
      const dono = await criarConta();
      const pet = await criarPet(dono);
      const abandonada = await intencaoVencida({
        kind: 'pet_photo',
        dono,
        petId: pet,
        achadoId: null,
        objectKey: `pets/${pet}/original/${randomUUID()}`,
      });

      const vencidas = await repo.listarIntencoesVencidas(AGORA, 500);
      const achada = vencidas.find((v) => v.id === abandonada);

      assert.ok(achada !== undefined, 'a varredura parou de limpar envio de foto de pet');
      // E a espécie viaja com a linha: é ela que a guarda do caso de uso lê.
      assert.equal(achada.kind, 'pet_photo');
    });

    void it('CASO 4 — na MESMA rodada: a de pet sai, a do achado fica', async () => {
      // Os dois lados numa consulta só, porque é assim que a rodada acontece em
      // produção: um `UNION ALL` com `LIMIT`, e o filtro tem de valer por linha
      // e não por rodada.
      const dono = await criarConta();
      const pet = await criarPet(dono);
      const achado = await criarAchado(dono);

      const dePet = await intencaoVencida({
        kind: 'pet_photo',
        dono,
        petId: pet,
        achadoId: null,
        objectKey: `pets/${pet}/original/${randomUUID()}`,
      });
      const doAchado = await intencaoVencida({
        kind: 'found_report_photo',
        dono,
        petId: null,
        achadoId: achado,
        objectKey: `found-reports/${achado}/original/${randomUUID()}`,
      });

      const ids = (await repo.listarIntencoesVencidas(AGORA, 500)).map((v) => v.id);

      assert.ok(ids.includes(dePet), 'a de pet deveria sair');
      assert.equal(ids.includes(doAchado), false, 'a do achado NÃO deveria sair');
    });

    void it('CASO 5 — nenhuma espécie do achado aparece, em NENHUMA linha da rodada', async () => {
      // A trava de regressão mais larga do arquivo, e a mais barata: qualquer
      // linha de espécie do achado na lista é defeito, independente de quem a
      // criou ou de qual caso deste arquivo a deixou para trás. Ela pega também
      // o dado que já estava no banco antes desta correção.
      const vencidas = await repo.listarIntencoesVencidas(AGORA, 500);
      const infiltradas = vencidas.filter(
        (v) => v.kind === 'found_report_photo' || v.kind === 'finder_photo',
      );

      assert.deepEqual(
        infiltradas,
        [],
        'espécie do achado na lista de vencidas: o balde vai perder foto de achado',
      );
    });
  },
);
