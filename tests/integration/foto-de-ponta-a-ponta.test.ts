/**
 * A FOTO, de ponta a ponta, contra armazenamento de objeto de verdade
 * (BICHUS-245; critérios 21, 22 e 26 de BICHUS-87 que o QA deixou em aberto).
 *
 * ## Por que este arquivo existe
 *
 * Até ele, a pilha efêmera de integração subia `db`, `mail`, `migracao` e
 * `testes`, e mais nada. Os 358 casos de integração **nunca falavam com
 * armazenamento**, e nenhum byte de foto subia em teste automatizado nenhum: o
 * `.env.integracao` apontava `OBJECT_STORAGE_ENDPOINT` para um host que não
 * resolve, de propósito e com comentário explicando.
 *
 * Isso explica um defeito de produção: **o aplicativo nunca subiu foto
 * nenhuma** — a função de envio foi escrita e nunca chamada. Ficou assim sem
 * ninguém notar porque **não existia teste capaz de notar**. Nenhuma isca podia
 * pegar: não havia onde a foto chegar.
 *
 * Os testes de unidade do adaptador (`s3-object-storage.*.test.ts`) provam a
 * aritmética da assinatura V4 e a forma da política, com `fetch` dublado. São
 * bons e não provam nada do que está aqui: nenhum deles descobre que o
 * armazenamento **recusou** o envio, que a política assinada diverge do que o
 * servidor exige, ou que a derivada não chegou ao balde. Assinatura que confere
 * com o dublê e não confere com o servidor sai igual nos dois.
 *
 * ## O caminho que este arquivo exercita é o do produto
 *
 * Não há dublê em lugar nenhum da corrente. É o mesmo `MediaService` que a rota
 * HTTP usa, o mesmo `criarObjectStorage` que `api.ts` e `worker.ts` instanciam,
 * o mesmo `criarMediaRepository` sobre o Postgres migrado, e o mesmo
 * `processarFoto` que o worker chama:
 *
 * 1. `autorizarEnvioDeFoto` devolve a autorização assinada;
 * 2. **o teste age como o cliente** e envia os bytes direto ao armazenamento,
 *    pelo formulário que a autorização mandou, sem passar pelo backend — que é
 *    o desenho do ADR-0007;
 * 3. `confirmarFoto` faz o `head` de verdade e enfileira o trabalho;
 * 4. `processarFoto` lê o original, deriva `card` e `thumb` e **grava as duas**;
 * 5. as derivadas são lidas de volta do balde público.
 *
 * O caso 1 falha se qualquer elo dessa corrente parar de acontecer.
 *
 * ## Isca conferida
 *
 * A isca desta issue tem forma obrigatória: **tirar a chamada de envio do
 * caminho do produto, reproduzindo o defeito que passou despercebido**, rodar,
 * e ver reprovar. Ela está em `infra/integracao/iscas/isca-sem-envio.mjs`, que
 * apaga o `await deps.armazenamento.put('publico', chaveDoCard, ...)` de
 * `processar-foto.ts` — a única linha que faz um byte de derivada sair do
 * processo.
 *
 * O roteiro exige que o arquivo MUDE antes de rodar: SHA-256 antes e depois,
 * `git diff` não vazio, e a substituição precisa casar **exatamente uma vez**.
 * As três conferências existem porque as duas formas de a isca mentir já
 * aconteceram nesta casa: substituição que casa no bloco errado (duas funções
 * com texto idêntico) e substituição que não casa nada — e nos dois casos a
 * suíte verde vira "a isca não pega".
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * Fora da pilha não roda, e é de propósito: `objeto` é um nome da rede do
 * compose, e a pilha não publica porta nenhuma no hospedeiro.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { criarObjectStorage } from '../../src/modules/media/adapters/external/s3-object-storage.js';
import { criarImageProcessor } from '../../src/modules/media/adapters/external/sharp-image-processor.js';
import { criarMediaRepository } from '../../src/modules/media/adapters/persistence/kysely-media-repository.js';
import { MediaService } from '../../src/modules/media/application/media-service.js';
import { processarFoto } from '../../src/modules/media/application/processar-foto.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { MediaRepository } from '../../src/modules/media/ports/media-repository.js';
import type { ObjectStorage } from '../../src/modules/media/ports/object-storage.js';
import { comoObjectKey } from '../../src/modules/media/domain/chave-de-objeto.js';
import type { ObjectKey, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nada daqui sai para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Identifica esta execução nos dados que ela cria. */
const EXECUCAO = randomUUID().slice(0, 8);

const config = loadAppConfig();

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repositorio: MediaRepository;
let armazenamento: ObjectStorage;
let midia: MediaService;

const contasCriadas: UserId[] = [];
/** Tudo que este arquivo gravou no armazenamento, para o `after` apagar. */
const objetosCriados: { classe: 'privado' | 'publico'; chave: ObjectKey }[] = [];

const ids = criarIdGenerator(() => systemClock.now());

/**
 * O endereço público do objeto, montado como um estranho o montaria.
 *
 * Path-style porque é o que o MinIO serve e o que `OBJECT_STORAGE_FORCE_PATH_STYLE`
 * declara. Sem assinatura NENHUMA: é essa a pergunta dos casos de segurança —
 * o que um navegador qualquer consegue ler apontando para o balde.
 */
function urlAnonima(balde: string, chave: string): string {
  const base = new URL(config.objectStorage.endpoint ?? '');
  base.pathname = `/${balde}/${chave}`;
  return base.toString();
}

function urlDaListagem(balde: string): string {
  const base = new URL(config.objectStorage.endpoint ?? '');
  base.pathname = `/${balde}/`;
  return base.toString();
}

/**
 * Um JPEG de verdade, gerado agora.
 *
 * `sharp` e não um literal em base64: o worker lê os **bytes reais** e recusa o
 * que não for imagem, então um literal colado aqui viraria um caso que reprova
 * por um motivo que não é o deste arquivo no dia em que a biblioteca mudar de
 * versão. E o tamanho precisa ser maior que a largura do `card` (1024 px) para
 * que a derivação de fato reduza, em vez de devolver o original.
 */
async function jpegDeVerdade(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function criarTutorComPet(): Promise<{ tutor: UserId; pet: PetId }> {
  const tutor = randomUUID() as UserId;
  const pet = randomUUID() as PetId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    tutor,
    `bichus245-${tutor}@${DOMINIO_DE_TESTE}`,
  ]);
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, tutor, `Pet ${EXECUCAO}`],
  );
  contasCriadas.push(tutor);
  return { tutor, pet };
}

/**
 * Envia os bytes como o CLIENTE envia: `multipart/form-data` com os campos
 * assinados e o arquivo por último.
 *
 * A ordem não é estética. Na política de POST assinada, o armazenamento para de
 * ler no campo `file`: tudo que vier depois dele é ignorado, e um campo
 * assinado que ficasse para trás faria o envio ser recusado com `AccessDenied`
 * sem dizer qual campo faltou.
 */
async function enviarComoOCliente(
  url: string,
  campos: Readonly<Record<string, string>>,
  bytes: Buffer,
  contentType: string,
): Promise<Response> {
  const forma = new FormData();
  for (const [nome, valor] of Object.entries(campos)) forma.append(nome, valor);
  forma.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), 'foto.jpg');
  return fetch(url, { method: 'POST', body: forma });
}

void before(async () => {
  // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
  // a suíte ficar verde sem nunca ter subido um byte, que é exatamente o
  // estado que este arquivo existe para encerrar.
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo exercita a foto de ponta a ponta ' +
        'contra Postgres e armazenamento de objeto de verdade, e não tem versão em ' +
        'memória. Rode `npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  const endpoint = config.objectStorage.endpoint;
  if (endpoint === undefined || endpoint === '') {
    throw new Error(
      'OBJECT_STORAGE_ENDPOINT está vazio. Vazio significa "o endpoint padrão do ' +
        'provedor", que nesta pilha não existe: o armazenamento é o serviço `objeto` ' +
        'de `infra/integracao/compose.integracao.yaml`. Rode `npm run test:integration`.',
    );
  }

  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  repositorio = criarMediaRepository(db);
  // `criarObjectStorage` e não um dublê: o que está sob teste É o adaptador
  // conversando com o servidor. Um armazenamento de mentira aqui mediria um
  // caminho que ninguém roda, e é assim que um teste de integração vira teste
  // de unidade com contêiner em volta.
  armazenamento = criarObjectStorage(config.objectStorage);
  midia = new MediaService({ repositorio, armazenamento, ids, clock: systemClock });
});

void after(async () => {
  for (const { classe, chave } of objetosCriados) {
    try {
      await armazenamento.delete(classe, chave);
    } catch {
      // A pilha é derrubada com `down -v` e o `/data` do armazenamento é
      // tmpfs: nada sobrevive de qualquer forma. Falhar a limpeza aqui
      // trocaria o veredito dos casos por um erro de arrumação.
    }
  }
  if (contasCriadas.length > 0) {
    // `ON DELETE CASCADE` leva pets, intenções e fotos junto.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('BICHUS-245 — a foto sobe, chega e volta, pelo caminho do produto', () => {
  void it('a pilha desta execução tem armazenamento de objeto, e ele responde', async () => {
    // Guarda contra a forma mais fácil de o arquivo inteiro virar teatro. Sem
    // ela, um endpoint que não resolve faria os casos abaixo reprovarem por
    // `ENOTFOUND` — uma falha que ninguém associa a "o armazenamento não está
    // na pilha", que foi justamente o estado anterior a esta issue.
    const resposta = await fetch(`${config.objectStorage.endpoint ?? ''}/minio/health/live`);
    assert.equal(
      resposta.status,
      200,
      `o armazenamento em ${String(config.objectStorage.endpoint)} não respondeu à sonda de ` +
        `saúde. Os casos abaixo medem bytes atravessando a rede até ele; sem ele não há o ` +
        `que medir, e verde aqui seria confiança falsa.`,
    );
  });

  void it(
    '1 — o byte sobe pelo caminho do produto e a derivada volta do balde público',
    async () => {
      const { tutor, pet } = await criarTutorComPet();
      const bytes = await jpegDeVerdade();

      // ETAPA 1: a autorização, pelo serviço que a rota HTTP usa.
      const { uploadId, autorizacao } = await midia.autorizarEnvioDeFoto(
        pet,
        tutor,
        'image/jpeg',
        bytes.byteLength,
      );
      assert.equal(autorizacao.metodo, 'POST', 'o caminho de hoje é POST com política assinada');
      const campos = autorizacao.campos;
      assert.ok(campos !== undefined, 'a autorização POST veio sem os campos do formulário');
      const chaveNoFormulario = campos['key'];
      assert.ok(chaveNoFormulario !== undefined, 'a autorização não trouxe a chave do objeto');
      // `comoObjectKey` e nao `as`: o campo do formulario e entrada, e a marca
      // so sai pela porta que confere a forma (BICHUS-134). Um `as` aqui
      // prometeria ao compilador que alguem validou, e ninguem validou.
      const chaveDoOriginal = comoObjectKey(chaveNoFormulario);
      objetosCriados.push({ classe: 'privado', chave: chaveDoOriginal });

      // ETAPA 2: o CLIENTE envia direto ao armazenamento. O backend não vê os
      // bytes — é o desenho do ADR-0007, e é a etapa que nenhum teste de
      // unidade alcança.
      const envio = await enviarComoOCliente(autorizacao.url, campos, bytes, 'image/jpeg');
      assert.ok(
        envio.status === 204 || envio.status === 200,
        `o armazenamento RECUSOU o envio com ${String(envio.status)}. A política assinada ` +
          `em \`s3-object-storage.ts\` e o que o servidor exige divergiram, e nenhum teste ` +
          `de unidade vê isso: com \`fetch\` dublado, assinatura certa e assinatura errada ` +
          `saem iguais. Corpo: ${(await envio.text()).slice(0, 600)}`,
      );

      // ETAPA 3: a confirmação. Ela faz `head` de verdade no armazenamento.
      const foto = await midia.confirmarFoto(pet, tutor, uploadId, true);
      assert.equal(foto.status, 'processing', 'a foto nasce `processing`, nunca `ready`');
      assert.equal(foto.originalKey, chaveDoOriginal, 'a foto guardou outra chave');

      // ETAPA 4: o worker. Mesmas dependências de `bin/worker.ts`.
      const resultado = await processarFoto(
        { repositorio, armazenamento, imagens: criarImageProcessor(), ids, clock: systemClock },
        { photo_id: foto.id },
      );
      assert.equal(
        resultado.tipo,
        'pronta',
        `o processamento não terminou pronto: ${JSON.stringify(resultado)}`,
      );

      // ETAPA 5: a derivada existe no balde público e é LIDA DE VOLTA.
      //
      // É aqui que a isca pega. Com a chamada de envio da derivada removida de
      // `processar-foto.ts` — o defeito exato que passou despercebido, a função
      // escrita e nunca chamada — tudo acima continua passando: a foto fica
      // `ready`, o banco guarda as chaves, e o único lugar em que a ausência
      // aparece é aqui, lendo o objeto de volta.
      const pronta = await repositorio.buscarFoto(pet, foto.id, tutor);
      assert.ok(pronta !== null, 'a foto sumiu do banco depois do processamento');
      assert.equal(pronta.status, 'ready', 'a foto não chegou a `ready`');
      const chaveDoCard = pronta.cardKey;
      const chaveDoThumb = pronta.thumbKey;
      assert.ok(chaveDoCard !== null, 'a foto pronta não tem chave de `card`');
      assert.ok(chaveDoThumb !== null, 'a foto pronta não tem chave de `thumb`');
      objetosCriados.push({ classe: 'publico', chave: chaveDoCard });
      objetosCriados.push({ classe: 'publico', chave: chaveDoThumb });

      for (const [variante, chave] of [
        ['card', chaveDoCard],
        ['thumb', chaveDoThumb],
      ] as const) {
        const cabecalho = await armazenamento.head('publico', chave);
        assert.ok(
          cabecalho !== null,
          `o banco diz que a derivada \`${variante}\` está em \`${chave}\`, e o objeto NÃO ` +
            `ESTÁ LÁ. A foto foi marcada \`ready\` sem que um byte de derivada saísse do ` +
            `processo: a rota pública vai servir o endereço de um objeto que não existe, e ` +
            `o cartaz impresso com essa URL aponta para um 404. É este o defeito que passou ` +
            `despercebido — a função de envio escrita e nunca chamada — e é ele que só um ` +
            `caso com armazenamento de verdade consegue acusar.`,
        );
        assert.ok(
          cabecalho.contentLength > 0,
          `a derivada \`${variante}\` chegou com zero byte, que é envio que falhou e passou`,
        );

        // Os bytes de volta, e eles precisam ser uma imagem de verdade: um
        // objeto do tamanho certo com conteúdo errado passaria no `head`.
        const devolvidos = await armazenamento.get('publico', chave);
        const inspecao = await criarImageProcessor().inspecionar(devolvidos);
        assert.ok(
          typeof inspecao !== 'string',
          `o que voltou de \`${chave}\` não é imagem que este sistema aceite: ` +
            JSON.stringify(inspecao),
        );
        assert.ok(
          inspecao.largura <= (variante === 'card' ? 1024 : 160),
          `a derivada \`${variante}\` voltou com ${String(inspecao.largura)} px de largura: ` +
            `ela não foi reduzida, e o que subiu foi o original com outro nome`,
        );
      }
    },
  );

  void it('2 — o original é legível pelo dono, por URL assinada e só por ela', async () => {
    const { tutor, pet } = await criarTutorComPet();
    const bytes = await jpegDeVerdade();
    const { autorizacao } = await midia.autorizarEnvioDeFoto(pet, tutor, 'image/jpeg', bytes.byteLength);
    const campos = autorizacao.campos;
    assert.ok(campos !== undefined);
    const chaveNoFormulario = campos['key'];
    assert.ok(chaveNoFormulario !== undefined, 'a autorização não trouxe a chave');
    const chave = comoObjectKey(chaveNoFormulario);
    objetosCriados.push({ classe: 'privado', chave });

    const envio = await enviarComoOCliente(autorizacao.url, campos, bytes, 'image/jpeg');
    assert.ok(envio.status === 204 || envio.status === 200, `envio recusado: ${String(envio.status)}`);

    const assinada = await armazenamento.getSignedReadUrl('privado', chave, 60);
    const comAssinatura = await fetch(assinada);
    assert.equal(
      comAssinatura.status,
      200,
      `a URL assinada de leitura não abriu o original (${String(comAssinatura.status)}). O ` +
        `dono da foto precisa conseguir ver o que ele mesmo enviou; sem isto o caso 3 abaixo ` +
        `ficaria verde por um motivo errado — "ninguém lê" em vez de "só o dono lê".`,
    );
    assert.equal(
      (await comAssinatura.arrayBuffer()).byteLength,
      bytes.byteLength,
      'o original voltou com tamanho diferente do que subiu',
    );
  });

  void it(
    '3 — o balde privado RECUSA leitura anônima do original (critério 22)',
    async () => {
      const { tutor, pet } = await criarTutorComPet();
      const bytes = await jpegDeVerdade();
      const { autorizacao } = await midia.autorizarEnvioDeFoto(pet, tutor, 'image/jpeg', bytes.byteLength);
      const campos = autorizacao.campos;
      assert.ok(campos !== undefined);
      const chaveNoFormulario = campos['key'];
      assert.ok(chaveNoFormulario !== undefined, 'a autorização não trouxe a chave');
      const chave = comoObjectKey(chaveNoFormulario);
      objetosCriados.push({ classe: 'privado', chave });

      const envio = await enviarComoOCliente(autorizacao.url, campos, bytes, 'image/jpeg');
      assert.ok(envio.status === 204 || envio.status === 200, `envio recusado: ${String(envio.status)}`);

      // O objeto EXISTE. Esta linha é o que separa "recusou" de "não achou": um
      // caso que pedisse uma chave inventada passaria com o balde inteiro
      // aberto, porque 404 e 403 são os dois "não recebi os bytes".
      const cabecalho = await armazenamento.head('privado', chave);
      assert.ok(cabecalho !== null, 'o original não está no balde privado; o caso perdeu o objeto');

      const anonima = await fetch(urlAnonima(config.objectStorage.bucketPrivate, chave));
      assert.notEqual(
        anonima.status,
        200,
        `QUALQUER PESSOA LÊ O ORIGINAL DE ${String(chave)} SEM CREDENCIAL NENHUMA. O original ` +
          `é o arquivo com EXIF intacto, e o EXIF de foto de celular carrega a coordenada da ` +
          `casa do tutor — é por isso que o ADR-0007 manda o balde privado nascer sem leitura ` +
          `anônima. O worker só remove o EXIF nas derivadas; o original guarda o dele para ` +
          `sempre. Este caso é o inverso do teste comum: verde aqui é o balde RECUSANDO.`,
      );
      assert.ok(
        anonima.status === 403 || anonima.status === 401,
        `o balde privado respondeu ${String(anonima.status)} à leitura anônima, e o esperado ` +
          `é 403. Não é 200, então não houve vazamento — mas um código diferente indica que ` +
          `a política mudou de forma, e quem lê este caso precisa saber disso.`,
      );
    },
  );

  void it('4 — o original NÃO está no balde público (critério 22)', async () => {
    const { tutor, pet } = await criarTutorComPet();
    const bytes = await jpegDeVerdade();
    const { uploadId, autorizacao } = await midia.autorizarEnvioDeFoto(
      pet,
      tutor,
      'image/jpeg',
      bytes.byteLength,
    );
    const campos = autorizacao.campos;
    assert.ok(campos !== undefined);
    const chaveNoFormulario = campos['key'];
    assert.ok(chaveNoFormulario !== undefined, 'a autorização não trouxe a chave');
    const chave = comoObjectKey(chaveNoFormulario);
    objetosCriados.push({ classe: 'privado', chave });

    // A URL de envio aponta para o balde PRIVADO, e isso é a primeira metade do
    // critério: o cliente não recebe autorização para escrever no público.
    assert.ok(
      autorizacao.url.includes(config.objectStorage.bucketPrivate),
      `a autorização de envio manda o cliente escrever em ${autorizacao.url}, que não é o ` +
        `balde privado. O original nasceria no balde de leitura anônima, com EXIF e tudo.`,
    );
    assert.ok(
      !autorizacao.url.includes(config.objectStorage.bucketPublic),
      'a autorização de envio aponta para o balde público',
    );

    const envio = await enviarComoOCliente(autorizacao.url, campos, bytes, 'image/jpeg');
    assert.ok(envio.status === 204 || envio.status === 200, `envio recusado: ${String(envio.status)}`);
    await midia.confirmarFoto(pet, tutor, uploadId, true);

    // A segunda metade, e a que só o armazenamento de verdade responde: a mesma
    // chave, pedida ao balde público sem credencial nenhuma. O público concede
    // `s3:GetObject` anônimo de propósito (é assim que o domínio de mídia serve
    // a derivada sem assinatura), então um 200 aqui seria o original exposto ao
    // mundo — e não um detalhe de configuração.
    const noPublico = await fetch(urlAnonima(config.objectStorage.bucketPublic, chave));
    assert.notEqual(
      noPublico.status,
      200,
      `O ORIGINAL ESTÁ NO BALDE PÚBLICO, em ${String(chave)}, e o balde público concede ` +
        `\`s3:GetObject\` anônimo. Qualquer pessoa com a chave baixa o arquivo com EXIF — ` +
        `a coordenada da casa do tutor. A separação física dos dois baldes é a proteção ` +
        `inteira do original: não há política por objeto que a substitua.`,
    );

    // E o objeto de fato existe — no lugar certo. Sem esta linha o caso
    // passaria com o envio inteiro quebrado, que é a forma silenciosa de uma
    // prova negativa virar decoração.
    const noPrivado = await armazenamento.head('privado', chave);
    assert.ok(
      noPrivado !== null,
      'o original não está no balde privado. O caso acima então não provou separação ' +
        'nenhuma: ele mediu a ausência de um objeto que nunca subiu.',
    );
  });

  void it('5 — nenhum dos dois baldes lista o conteúdo para anônimo (BICHUS-134)', async () => {
    // Achado de 19/09 no mínimo hospedado: `GET .../bichu-media-public/`
    // devolvia `ListBucketResult`. O balde estava vazio; se houvesse foto,
    // estaria tudo listado.
    //
    // Isto não é zelo: a derivada pública é servida SEM assinatura, e o que a
    // protege é a chave carregar 128 bits de CSPRNG. Com listagem anônima os
    // 128 bits deixam de valer — ninguém precisa adivinhar o que pode pedir.
    for (const [rotulo, balde] of [
      ['privado', config.objectStorage.bucketPrivate],
      ['público', config.objectStorage.bucketPublic],
    ] as const) {
      const resposta = await fetch(urlDaListagem(balde));
      const corpo = await resposta.text();
      assert.ok(
        !(resposta.status === 200 && corpo.includes('ListBucketResult')),
        `o balde ${rotulo} (\`${balde}\`) LISTA o conteúdo para quem não tem credencial ` +
          `nenhuma. A chave da derivada carrega 128 bits de CSPRNG justamente porque ela é ` +
          `servida sem assinatura; com a listagem aberta, a entropia não protege nada e a ` +
          `foto de qualquer pet fica a uma requisição de distância. Use ` +
          `\`mc anonymous set-json\` com \`s3:GetObject\` sozinho, nunca ` +
          `\`mc anonymous set download\`, que concede \`s3:ListBucket\` junto. ` +
          `Resposta: ${String(resposta.status)} ${corpo.slice(0, 300)}`,
      );
    }
  });
});
