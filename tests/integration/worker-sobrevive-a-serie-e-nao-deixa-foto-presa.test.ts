/**
 * O WORKER SOBREVIVE À SÉRIE, E NÃO DEIXA FOTO PRESA.
 *
 * Dois defeitos medidos, e cada um tem aqui o caso que reprova sem ele.
 *
 * ====================================================================
 * POR QUE UMA FOTO SÓ APROVA O DEFEITO
 * ====================================================================
 *
 * O limite de 50 megapixels funciona, e a inspeção recusa antes de decodificar:
 * uma foto nunca estourou. O que estourava era a **série** — o cache do libvips
 * retinha memória entre fotos, e a segunda foto grande morria pelo cgroup.
 * Medido no container com o `mem_limit: 448m` da `compose.yaml`, dez fotos do
 * pior caso que a inspeção aceita:
 *
 *   cache ligado (o padrão do sharp) .... 331 → 632 MiB, morto na SEGUNDA, saída 137
 *   cache desligado .................... pico 304 MiB, estável, dez fotos, saída 0
 *
 * ====================================================================
 * E POR QUE UMA FOTO DE 12 MEGAPIXELS TAMBÉM APROVA O DEFEITO
 * ====================================================================
 *
 * Medido, e é o achado que decide a forma deste arquivo: com um JPEG de 12
 * megapixels a série **não** estoura nem com o cache ligado — dez fotos ficam
 * em 89 MiB de pico. O que discrimina é o pior caso que a inspeção ACEITA:
 * 50 megapixels exatos (o teto é `> 50`, não `>=`) em JPEG progressivo, dentro
 * dos 10 MiB que `UploadIntentInput.byte_size` admite.
 *
 * Então a foto deste arquivo não é "uma foto grande": é a maior foto que o
 * produto promete aceitar. Trocá-la por uma menor deixa o caso verde com o
 * defeito de pé.
 *
 * ====================================================================
 * COMO A ISCA REPROVA, E NUNCA PENDURA
 * ====================================================================
 *
 * O trabalho de imagem corre num processo FILHO, e o pai é quem julga. Três
 * formas de reprovar, e nenhuma delas é esperar:
 *
 *   pico de RSS acima do orçamento ....... reprova nomeando o número
 *   filho sai diferente de 0 ............. reprova nomeando a saída (137 é o cgroup)
 *   filho passa do prazo ................. o PAI o mata e reprova
 *
 * O prazo é cumprido com `setTimeout` do próprio Node, e não com `timeout`: o
 * binário não existe nesta máquina, sai 127 e o comando nunca roda — o que
 * deixaria a isca verde por não ter executado nada.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID, randomFillSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarJobQueue } from '../../src/shared/queue/kysely-job-queue.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { criarMediaRepository } from '../../src/modules/media/adapters/persistence/kysely-media-repository.js';
import {
  TEXTO_DO_PROCESSAMENTO_INTERROMPIDO,
  desistirDaFoto,
} from '../../src/modules/media/application/desistir-da-foto.js';
import type { JobQueue } from '../../src/shared/ports/job-queue.js';
import type { PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nada daqui sai para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * O pior caso que `inspecionar` ACEITA: 50.000.000 px exatos.
 *
 * 8000 × 6250. Um pixel a mais e a inspeção recusa por `imagem_grande_demais`,
 * e o caso mediria a recusa em vez da série — que foi o primeiro jeito de esta
 * medição dar errado aqui.
 */
const LARGURA_DO_PIOR_CASO = 8000;
const ALTURA_DO_PIOR_CASO = 6250;

/** Dez, que é o número do relato. */
const FOTOS_NA_SERIE = 10;

/**
 * O ORÇAMENTO DE MEMÓRIA, e ele é mais apertado que a produção de propósito.
 *
 * O `worker` roda com `mem_limit: 448m`. O pico medido com o cache desligado foi
 * 304 MiB, e 384 MiB fica entre os dois: acima do medido com folga para uma
 * máquina mais lenta ou um libvips de outra versão, e abaixo do teto de verdade,
 * para o caso reprovar **antes** de a produção morrer. Orçamento igual ao teto
 * só acusa depois que já doeu.
 *
 * Com o cache ligado a série passa de 600 MiB na segunda foto, então a isca não
 * reprova por pouco.
 */
const ORCAMENTO_DE_RSS_EM_MIB = 384;

/**
 * Prazo do filho. Generoso, porque ele não é o que está sob medição: o pior caso
 * medido foi 4,2 s por foto, e dez fotos com folga de máquina carregada cabem
 * aqui. Ele existe só para que "pendurou" seja uma reprovação e não uma espera.
 */
const PRAZO_DO_FILHO_EM_MS = 180_000;

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let fila: JobQueue;
let diretorio: string;
let caminhoDaFoto: string;

const contasCriadas: UserId[] = [];
const ids = criarIdGenerator(() => systemClock.now());

/**
 * O pior caso aceito, gerado agora e em processo PRÓPRIO.
 *
 * Gerar aqui alocaria 143 MiB de pixels crus dentro do processo que depois vai
 * medir memória, e a medição passaria a incluir o preparo. O filho gera, escreve
 * e morre; quem mede nasce limpo.
 */
async function gerarPiorCasoAceito(destino: string): Promise<void> {
  const canais = 3;
  const cru = Buffer.allocUnsafe(LARGURA_DO_PIOR_CASO * ALTURA_DO_PIOR_CASO * canais);
  const bloco = Buffer.allocUnsafe(1 << 20);
  randomFillSync(bloco);
  for (let o = 0; o < cru.length; o += bloco.length) {
    bloco.copy(cru, o, 0, Math.min(bloco.length, cru.length - o));
  }
  // `blur` antes do JPEG: ruído puro em 50 megapixels dá 37 MiB e o contrato nem
  // aceitaria o envio (`byte_size` máximo de 10 MiB). Foto de verdade tem
  // gradiente, então o ruído entra suavizado e o arquivo cabe.
  const bytes = await sharp(cru, {
    raw: { width: LARGURA_DO_PIOR_CASO, height: ALTURA_DO_PIOR_CASO, channels: canais },
  })
    .blur(6)
    .jpeg({ quality: 82, progressive: true })
    .toBuffer();

  assert.ok(
    bytes.length <= 10_485_760,
    `a foto do pior caso tem ${String(Math.round(bytes.length / 1024))} KiB e o contrato ` +
      'aceita no máximo 10 MiB em `UploadIntentInput.byte_size`. Uma foto que o produto não ' +
      'aceitaria não é o pior caso aceito.',
  );
  await writeFile(destino, bytes);
}

/** O programa que o filho roda: a série, pelo adaptador do produto. */
function programaDaSerie(): string {
  return [
    "import { readFileSync } from 'node:fs';",
    "import { criarImageProcessor } from '../../dist/modules/media/adapters/external/sharp-image-processor.js';",
    'const bytes = readFileSync(process.argv[2]);',
    'const quantas = Number(process.argv[3]);',
    'const imagens = criarImageProcessor();',
    'let picoMiB = 0;',
    'for (let i = 1; i <= quantas; i += 1) {',
    '  const inspecao = await imagens.inspecionar(bytes);',
    "  if (typeof inspecao === 'string') {",
    "    console.log(JSON.stringify({ evento: 'recusada', i, motivo: inspecao }));",
    '    process.exit(3);',
    '  }',
    '  await imagens.derivar(bytes, 1024);',
    '  await imagens.derivar(bytes, 160);',
    '  const rss = Math.round(process.memoryUsage.rss() / 1048576);',
    '  if (rss > picoMiB) picoMiB = rss;',
    "  console.log(JSON.stringify({ evento: 'foto', i, rssMiB: rss, picoMiB }));",
    '}',
    "console.log(JSON.stringify({ evento: 'fim', picoMiB }));",
  ].join('\n');
}

interface DesfechoDoFilho {
  readonly saida: number | null;
  readonly sinal: string | null;
  readonly picoMiB: number;
  readonly fotos: number;
  readonly prazoEstourado: boolean;
  readonly saidaCrua: string;
}

/** Roda o filho e devolve o desfecho. Nunca pendura: o prazo é do pai. */
async function rodarSerieEmProcessoFilho(programa: string): Promise<DesfechoDoFilho> {
  const caminhoDoPrograma = join(diretorio, `serie-${randomUUID().slice(0, 8)}.mjs`);
  await writeFile(caminhoDoPrograma, programa);

  const filho = spawn(
    process.execPath,
    [caminhoDoPrograma, caminhoDaFoto, String(FOTOS_NA_SERIE)],
    { cwd: join(import.meta.dirname, '..', '..', 'tests', 'integration'), stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let texto = '';
  filho.stdout.on('data', (p: Buffer) => { texto += p.toString(); });
  filho.stderr.on('data', (p: Buffer) => { texto += p.toString(); });

  let prazoEstourado = false;
  const relogio = setTimeout(() => {
    prazoEstourado = true;
    filho.kill('SIGKILL');
  }, PRAZO_DO_FILHO_EM_MS);

  const { saida, sinal } = await new Promise<{ saida: number | null; sinal: string | null }>(
    (resolve) => {
      filho.once('close', (codigo, sinalDeMorte) => {
        clearTimeout(relogio);
        resolve({ saida: codigo, sinal: sinalDeMorte });
      });
    },
  );

  let picoMiB = 0;
  let fotos = 0;
  for (const linha of texto.split('\n')) {
    if (!linha.startsWith('{')) continue;
    const evento = JSON.parse(linha) as { evento: string; picoMiB?: number };
    if (evento.evento === 'foto') fotos += 1;
    if (typeof evento.picoMiB === 'number' && evento.picoMiB > picoMiB) picoMiB = evento.picoMiB;
  }

  return { saida, sinal, picoMiB, fotos, prazoEstourado, saidaCrua: texto };
}

async function criarFotoEmProcessamento(): Promise<{ foto: string; pet: PetId }> {
  const tutor = randomUUID() as UserId;
  const pet = randomUUID() as PetId;
  const foto = randomUUID();
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    tutor,
    `orfao-${tutor}@${DOMINIO_DE_TESTE}`,
  ]);
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, 'Pet do orfao', 'dog', 'M')`,
    [pet, tutor],
  );
  await cliente.query(
    `INSERT INTO pet_photos (id, pet_id, original_key, status)
     VALUES ($1, $2, $3, 'processing')`,
    [foto, pet, `pets/${pet.replace(/-/g, '')}/original/foto.jpg`],
  );
  contasCriadas.push(tutor);
  return { foto, pet };
}

async function estadoDoTrabalho(
  id: string,
): Promise<{ status: string; orphan_recoveries: number; last_error: string | null }> {
  const r = await cliente.query<{ status: string; orphan_recoveries: number; last_error: string | null }>(
    'SELECT status, orphan_recoveries, last_error FROM jobs WHERE id = $1',
    [id],
  );
  const linha = r.rows[0];
  assert.ok(linha !== undefined, `o trabalho ${id} desapareceu da tabela`);
  return linha;
}

async function estadoDaFoto(id: string): Promise<{ status: string; rejection_reason: string | null }> {
  const r = await cliente.query<{ status: string; rejection_reason: string | null }>(
    'SELECT status, rejection_reason FROM pet_photos WHERE id = $1',
    [id],
  );
  const linha = r.rows[0];
  assert.ok(linha !== undefined, `a foto ${id} desapareceu da tabela`);
  return linha;
}

void before(async () => {
  // Verificação que não consegue verificar REPROVA. Pular aqui deixaria verde
  // exatamente o arquivo que existe para acusar um worker que morre.
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo exercita a recuperação de trabalho ' +
        'órfão contra Postgres de verdade. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  fila = criarJobQueue(db, ids);

  diretorio = await mkdtemp(join(tmpdir(), 'bichu-serie-'));
  caminhoDaFoto = join(diretorio, 'pior-caso-aceito.jpg');
  await gerarPiorCasoAceito(caminhoDaFoto);
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
  await rm(diretorio, { recursive: true, force: true });
});

void describe('o worker sobrevive à série, e não deixa foto presa', () => {
  void it(
    '1 — dez fotos do pior caso ACEITO em série, e o processo sobrevive dentro do orçamento',
    { timeout: PRAZO_DO_FILHO_EM_MS + 60_000 },
    async () => {
      const desfecho = await rodarSerieEmProcessoFilho(programaDaSerie());

      assert.equal(
        desfecho.prazoEstourado,
        false,
        `o processo da série passou de ${String(PRAZO_DO_FILHO_EM_MS)} ms e foi morto pelo ` +
          'pai. Isca que pendura não vale: a reprovação é esta mensagem, e não a espera.',
      );
      assert.equal(
        desfecho.saida,
        0,
        `o processo da série saiu com ${String(desfecho.saida)} (sinal ${String(desfecho.sinal)}). ` +
          '137 é o cgroup matando por memória, que é exatamente o defeito: o cache do libvips ' +
          'retém memória entre fotos e a segunda foto grande morre. Saída do filho:\n' +
          desfecho.saidaCrua,
      );
      assert.equal(
        desfecho.fotos,
        FOTOS_NA_SERIE,
        `só ${String(desfecho.fotos)} das ${String(FOTOS_NA_SERIE)} fotos completaram. ` +
          'Uma foto que completa aprova o defeito; o que ele derruba é a série.',
      );
      assert.ok(
        desfecho.picoMiB <= ORCAMENTO_DE_RSS_EM_MIB,
        `o pico de memória foi ${String(desfecho.picoMiB)} MiB, contra o orçamento de ` +
          `${String(ORCAMENTO_DE_RSS_EM_MIB)} MiB. O \`worker\` roda com \`mem_limit: 448m\`: ` +
          'este orçamento é mais apertado de propósito, para o caso acusar antes de a produção ' +
          `morrer. Com o cache do libvips ligado a medição passa de 600 MiB na segunda foto.\n${
            desfecho.saidaCrua}`,
      );
    },
  );

  void it(
    '2 — processo MORTO no meio do trabalho, e a foto NÃO fica presa em processing',
    async () => {
      const { foto } = await criarFotoEmProcessamento();
      const trabalho = await fila.enqueue('media.process_upload', { photo_id: foto });

      // A reserva de verdade: é ela que põe a linha em `running` com `locked_at`.
      const reservados = await fila.claim(1);
      assert.ok(
        reservados.some((t) => t.id === trabalho),
        'a reserva não pegou o trabalho que este caso acabou de enfileirar',
      );
      assert.equal((await estadoDoTrabalho(trabalho)).status, 'running');

      // ISTO é "o processo morreu no meio": ninguém vai chamar `complete` nem
      // `fail`, porque quem faria isso não existe mais. Sem varredura de órfão,
      // esta linha fica `running` para sempre e a foto `processing` para sempre.
      assert.equal((await estadoDaFoto(foto)).status, 'processing');

      // O prazo vem por parâmetro, e por isso o caso não espera cinco minutos.
      // O prazo de produção (300 s) é decisão de `worker.ts`, e o caso 3 é quem
      // prova que um prazo é respeitado.
      const criterios = { prazoEmMs: 0, tetoDeOrfandade: 2, limite: 20 };

      const primeira = await fila.recuperarOrfaos(criterios);
      const recuperadoUma = primeira.find((t) => t.id === trabalho);
      assert.ok(recuperadoUma !== undefined, 'a primeira varredura não achou o órfão');
      assert.equal(recuperadoUma.orfandades, 1);
      assert.equal(
        recuperadoUma.desistiu,
        false,
        'a primeira orfandade não pode ser final: implantação e matador de memória por ' +
          'trabalho vizinho matam o processo por motivo que não é a foto.',
      );
      assert.equal((await estadoDoTrabalho(trabalho)).status, 'pending');
      assert.equal(
        (await estadoDaFoto(foto)).status,
        'processing',
        'com tentativa restando, a foto continua processando: ela ainda vai ser feita.',
      );

      // A segunda morte segurando a MESMA carga. Reservar de novo e morrer de
      // novo é a assinatura da carga, não do ambiente.
      await cliente.query(
        "UPDATE jobs SET status = 'running', locked_at = now() - interval '1 hour' WHERE id = $1",
        [trabalho],
      );
      const segunda = await fila.recuperarOrfaos(criterios);
      const recuperadoDuas = segunda.find((t) => t.id === trabalho);
      assert.ok(recuperadoDuas !== undefined, 'a segunda varredura não achou o órfão');
      assert.equal(recuperadoDuas.orfandades, 2);
      assert.equal(recuperadoDuas.desistiu, true, 'na segunda orfandade o trabalho é final');

      const depois = await estadoDoTrabalho(trabalho);
      assert.equal(depois.status, 'failed');
      assert.match(
        depois.last_error ?? '',
        /trabalho orfao/,
        'o motivo tem de ficar gravado: é por ele que se conta, no banco, quantas vezes o ' +
          'worker morreu com trabalho na mão.',
      );

      // E AGORA A PARTE QUE O TUTOR VÊ. Sem esta chamada a foto fica presa, o
      // trabalho está `failed` e ninguém no mundo sabe: é o silêncio inteiro.
      const desistiu = await desistirDaFoto(
        { repositorio: criarMediaRepository(db), clock: systemClock },
        { photo_id: foto },
      );
      assert.equal(desistiu, true);

      const fotoDepois = await estadoDaFoto(foto);
      assert.notEqual(
        fotoDepois.status,
        'processing',
        'A FOTO FICOU PRESA EM `processing`. O trabalho terminou em `failed` e a tela do ' +
          'tutor continua girando para sempre, sem erro e sem alarme.',
      );
      assert.equal(fotoDepois.status, 'rejected');
      assert.equal(fotoDepois.rejection_reason, TEXTO_DO_PROCESSAMENTO_INTERROMPIDO);
    },
  );

  void it(
    '3 — trabalho reservado AGORA não é roubado de quem o está fazendo',
    async () => {
      const { foto } = await criarFotoEmProcessamento();
      const trabalho = await fila.enqueue('media.process_upload', { photo_id: foto });
      await fila.claim(1);
      assert.equal((await estadoDoTrabalho(trabalho)).status, 'running');

      // Prazo de produção. A reserva tem segundos de idade, não minutos.
      const recuperados = await fila.recuperarOrfaos({
        prazoEmMs: 5 * 60 * 1000,
        tetoDeOrfandade: 2,
        limite: 20,
      });

      assert.equal(
        recuperados.some((t) => t.id === trabalho),
        false,
        'um trabalho que acabou de ser reservado foi recuperado como órfão. Prazo que não ' +
          'espera rouba trabalho legítimo no meio, e aí duas fotos são processadas ao mesmo ' +
          'tempo num processo dimensionado para uma.',
      );
      const depois = await estadoDoTrabalho(trabalho);
      assert.equal(depois.status, 'running');
      assert.equal(depois.orphan_recoveries, 0);
    },
  );
});
