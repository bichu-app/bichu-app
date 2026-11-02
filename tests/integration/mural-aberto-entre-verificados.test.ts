/**
 * **O CORPO REAL DE `getMyTimeline`, depois da abertura da audiencia.**
 *
 * ## A decisao que este arquivo mede
 *
 * **Decisao do cliente, 02/11/2026.** O Mural deixou de ser so entre conexoes e
 * passou a mostrar a publicacao de toda a base, **desde que as duas pontas
 * estejam verificadas**: so ve quem tem canal de contato confirmado, e so
 * aparece quem tem. O motivo, dito por ele: no comeco nao havera volume, e a
 * secao ficaria parada se cada publicacao so alcancasse quem ja e conexao.
 *
 * A trava da verificacao e **nova**. Ate 02/11/2026 o sinal
 * (`contact_channel_verified`) era lido e exibido como selo, e nao entrava em
 * `WHERE` nenhum. Ele passou a entrar porque abrir o Mural para a base inteira
 * abre o vetor de spam no mesmo movimento.
 *
 * O interruptor que volta a regra antiga e `MURAL_SO_ENTRE_CONEXOES`, em
 * `src/shared/db/audiencia-da-publicacao.ts`: **uma linha**.
 *
 * ## Por que este arquivo e de INTEGRACAO, e por que ele nao existia antes
 *
 * **Nenhum portao deste repositorio confere o CORPO da resposta**, e a cobertura
 * da linha do tempo era INTEIRA por inspecao do SQL compilado
 * (`autorizacao-na-clausula-where.test.ts`). Aquele irmao unitario prova **onde**
 * o predicado mora; ele nao prova o que o Postgres devolve. Abrir a audiencia
 * sem rede de integracao era entregar a mudanca sem ninguem medir o efeito.
 *
 * ## A isca que pesa mais: o BLOQUEIO entre ESTRANHOS
 *
 * Com a audiencia por conexao, `NOT bloqueio_entre` **nunca era alcancado**
 * entre duas pessoas sem relacao: a conexao ja filtrava antes dele. Aberta a
 * audiencia, ele passa a ser a **UNICA** protecao entre duas pessoas sem
 * relacao nenhuma. O caso que o mede le o efeito por `SELECT` cru, e nao so
 * pela resposta: a resposta vazia tem varias causas possiveis, e o `SELECT`
 * mostra que a linha existe, que o bloqueio existe, e que e ele que a tira.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## A massa e de teste, e se anuncia como tal
 *
 * Contas `@exemplo-de-teste.invalid` (`.invalid` e reservado por RFC 2606:
 * nenhum e-mail sai daqui para o mundo) e apelidos `massatesteNN`. Nenhuma conta
 * e nenhuma senha de pessoa real passa por este arquivo.
 *
 * `users.public_ref` e escrita a mao: a coluna e `NOT NULL` **sem `DEFAULT`**
 * (`20261018000031`), e a aplicacao a sorteia no `INSERT`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarPublicacoesRepository } from '../../src/modules/publications/adapters/persistence/kysely-publicacoes.js';
import { Mural } from '../../src/modules/publications/application/mural-service.js';
import { registrarRotasDoMural } from '../../src/modules/publications/adapters/http/publicacao-routes.js';
import { escoparRotas } from '../../src/shared/http/registrar-rota.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarContadorEmMemoria } from '../../src/shared/http/rate-limit.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { PreparadorDeEnvioDeCatalogo } from '../../src/modules/media/ports/imagem-de-catalogo.js';
import type { IdGenerator } from '../../src/shared/ports/index.js';
import type {
  AbsoluteUrl,
  OpaqueToken,
  Instant,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo-de-teste.invalid';
const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DE_MIDIA = 'https://midia.bichu.test' as AbsoluteUrl;
const AGORA = 1_790_000_000_000 as Instant;

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
/** O CONTRATO, carregado UMA VEZ: ha um servidor por caso, e ele e pesado. */
let contrato: ReturnType<typeof carregarContrato>;
const contasCriadas: UserId[] = [];
const apelidosCriados: string[] = [];
const imagensCriadas: string[] = [];
let contador = 0;

/** 22 simbolos de base64url, que e a forma que `users_public_ref_forma` cobra. */
function refPublica(): string {
  return randomUUID().replace(/-/g, '').slice(0, 22);
}

/** `massatesteNN`, que e o padrao de apelido da massa de teste desta casa. */
function apelidoDaMassa(): string {
  contador += 1;
  return `massateste${String(contador).padStart(2, '0')}-${refPublica().slice(0, 6).toLowerCase()}`;
}

/**
 * A conta, e `verificada` e PARAMETRO -- nao padrao.
 *
 * Os dois valores sao medidos neste arquivo, nas duas direcoes: verificado que
 * aparece e nao verificado que nao aparece. Um padrao faria metade das iscas
 * depender de um valor implicito.
 */
async function criarConta(nome: string, verificada: boolean): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, display_name, public_ref, email_verified_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() ELSE NULL END)`,
    [id, `mural-${id}@${DOMINIO_DE_TESTE}`, nome, refPublica(), verificada],
  );
  contasCriadas.push(id);
  return id;
}

/** O apelido da pessoa: e ele que da endereco ao toque no autor. */
async function darApelido(conta: UserId): Promise<string> {
  const apelido = apelidoDaMassa();
  // O APELIDO ENTRA DUAS VEZES, com casts explicitos: `handle` e `citext` e
  // `handle_esqueleto(text)` recebe `text`. Com um `$1` nos dois lugares o
  // Postgres recusa a sentenca inteira com `42P08`.
  await cliente.query(
    `INSERT INTO handles (handle, handle_esqueleto, kind, user_id)
     VALUES ($1::citext, handle_esqueleto($2::text), 'pessoa', $3)`,
    [apelido, apelido, conta],
  );
  apelidosCriados.push(apelido);
  return apelido;
}

/**
 * A foto da pessoa, PRONTA, com as DUAS derivadas.
 *
 * Ela existe aqui para o caso da Emenda 5: a publicacao de estranho tem de sair
 * COM `photo_icon_url: null` **tendo o autor foto pronta**. Sem foto no banco o
 * `null` nao provaria nada.
 */
async function darFoto(conta: UserId, marca: string): Promise<void> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO catalog_images (id, purpose, status, public_key, thumb_key)
     VALUES ($1, 'user_photo', 'ready', $2, $3)`,
    [id, `card/${marca}-512.jpg`, `thumb/${marca}-176.jpg`],
  );
  await cliente.query('UPDATE users SET photo_image_id = $1 WHERE id = $2', [id, conta]);
  imagensCriadas.push(id);
}

/** A aresta, no estado dado. `requester`/`addressee` na ordem recebida. */
async function ligar(
  requester: UserId,
  addressee: UserId,
  state: 'pending' | 'accepted' | 'declined',
): Promise<void> {
  const [baixo, alto] = requester < addressee ? [requester, addressee] : [addressee, requester];
  await cliente.query(
    `INSERT INTO user_connections
       (id, ref, requester_user_id, addressee_user_id, pair_low, pair_high,
        state, origin, expires_at, responded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'anchored_case', now() + interval '30 days',
             CASE WHEN $7 = 'pending' THEN NULL ELSE now() END)`,
    [randomUUID(), refPublica(), requester, addressee, baixo, alto, state],
  );
}

async function bloquear(quem: UserId, alvo: UserId): Promise<void> {
  await cliente.query(
    'INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id) VALUES ($1,$2,$3)',
    [randomUUID(), quem, alvo],
  );
}

/** A denuncia, que OCULTA a publicacao **para quem denunciou** e so para ele. */
async function denunciar(publicacaoRef: string, quem: UserId): Promise<void> {
  await cliente.query(
    `INSERT INTO publication_reports (id, publication_ref, reporter_user_id, reason)
     VALUES ($1, $2, $3, 'spam_or_repetition')`,
    [randomUUID(), publicacaoRef, quem],
  );
}

/** Desabilitar a conta e marcar `deleted_at`: e o que `conta_habilitada` le. */
async function desabilitar(conta: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [conta]);
}

/** A publicacao, escrita direto: o que esta suite mede e a LEITURA. */
async function publicar(autor: UserId, corpo: string): Promise<string> {
  const ref = refPublica();
  await cliente.query(
    'INSERT INTO user_publications (id, author_user_id, public_ref, body) VALUES ($1,$2,$3,$4)',
    [randomUUID(), autor, ref, corpo],
  );
  return ref;
}

/**
 * O preparador de envio **nao e dublado para passar**: ele LANCA. Nenhuma
 * leitura o alcanca, e e isso que este objeto afirma.
 */
const enviosQueNinguemChama: PreparadorDeEnvioDeCatalogo = {
  preparar: () => Promise.reject(new Error('nenhuma LEITURA da linha do tempo prepara envio')),
};

const ids: IdGenerator = {
  uuidv7: () => randomUUID(),
  opaqueToken: () => refPublica() as unknown as OpaqueToken,
  random128: () => randomBytes(16),
  random80: () => randomBytes(10),
};

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

interface Autor {
  readonly handle: string | null;
  readonly display_name: string;
  readonly photo_icon_url: string | null;
  readonly contact_channel_verified: boolean;
}

interface Publicacao {
  readonly ref: string;
  readonly body: string;
  readonly author: Autor;
  readonly mine: boolean;
}

/**
 * O SERVIDOR DE VERDADE, com a rota de verdade e o repositorio de verdade.
 *
 * `quemChama` entra pelo autenticador. Nada mais e dublado -- o servico, o
 * repositorio, o Kysely, o Postgres e a projecao da borda sao os reais.
 */
async function servidorPara(quemChama: UserId) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  // `escoparRotas` com o MESMO prefixo de `api.ts`: registrado na raiz, a rota
  // responde o 404 DO FASTIFY e o caso passa a medir o 404 errado.
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDoMural(escopo, {
      mural: new Mural({
        envios: enviosQueNinguemChama,
        publicacoes: criarPublicacoesRepository(db, ids),
        registrarIntencao: () =>
          Promise.reject(new Error('nenhuma LEITURA da linha do tempo registra intencao')),
        db,
        ids,
        clock: { now: () => AGORA },
      }),
      autenticador: { autenticar: () => Promise.resolve({ userId: quemChama }) },
      contrato,
      baseDeMidia: BASE_DE_MIDIA,
    });
  });
  return app;
}

async function lerALinha(quemChama: UserId): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url: '/v1/timeline',
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

function itens(corpo: Record<string, unknown>): readonly Publicacao[] {
  return corpo['items'] as readonly Publicacao[];
}

function corpos(corpo: Record<string, unknown>): readonly string[] {
  return itens(corpo).map((p) => p.body);
}

/** Imprime o corpo medido, para ele ser COLADO no relatorio em vez de descrito. */
function registrar(rotulo: string, r: Resposta): void {
  console.log(
    `\n[CORPO MEDIDO] ${rotulo}\n  status: ${String(r.status)}\n  items: ${JSON.stringify(
      itens(r.corpo),
    )}`,
  );
}

before(async () => {
  assert.ok(
    CONEXAO !== undefined && CONEXAO !== '',
    'DATABASE_URL nao esta definida. Esta suite REPROVA sem banco em vez de se pular: ' +
      'um arquivo de integracao que se pula sozinho termina verde e ocupa o lugar de um ' +
      'que funcionaria.',
  );
  contrato = carregarContrato('api/openapi.yaml');
  banco = createDb(CONEXAO);
  db = banco.db;
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

after(async () => {
  // A ORDEM NAO E ARBITRARIA: `handles.user_id` e `ON DELETE SET NULL`, e
  // `handles_pessoa_tem_dono` proibe `kind = 'pessoa'` sem dono. Apagar a conta
  // ANTES do apelido viola o `CHECK` e derruba o `after` com os casos verdes.
  if (apelidosCriados.length > 0) {
    await cliente.query('DELETE FROM handles WHERE handle = ANY($1::citext[])', [apelidosCriados]);
  }
  if (contasCriadas.length > 0) {
    // `ON DELETE CASCADE` leva publicacoes, comentarios, arestas, bloqueios e
    // denuncias.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  if (imagensCriadas.length > 0) {
    await cliente.query('DELETE FROM catalog_images WHERE id = ANY($1::uuid[])', [imagensCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o corpo real de `getMyTimeline`: o Mural aberto entre verificados', () => {
  void it('ISCA 1 -- DOIS ESTRANHOS VERIFICADOS: a publicacao APARECE, e e a mudanca de 02/11/2026', async () => {
    const autor = await criarConta('Autora estranha', true);
    const leitor = await criarConta('Leitor estranho', true);
    await darApelido(autor);
    const ref = await publicar(autor, 'estranho verificado aparece');

    // NENHUMA ARESTA. Este e o estado que, ate 02/11/2026, devolvia lista
    // vazia -- e e por ele que a decisao do cliente existe.
    const semAresta = await cliente.query<{ readonly n: string }>(
      `SELECT count(*)::text AS n FROM user_connections
        WHERE (requester_user_id = $1 AND addressee_user_id = $2)
           OR (requester_user_id = $2 AND addressee_user_id = $1)`,
      [autor, leitor],
    );
    assert.equal(semAresta.rows[0]?.n, '0', 'o arranjo criou aresta: o caso mediria conexao');

    const r = await lerALinha(leitor);
    registrar('ISCA 1: dois estranhos verificados', r);
    assert.equal(r.status, 200);
    assert.ok(
      corpos(r.corpo).includes('estranho verificado aparece'),
      'a publicacao de ESTRANHO VERIFICADO nao apareceu: a decisao do cliente de ' +
        '02/11/2026 foi desfeita, e o Mural voltou a ser so entre conexoes',
    );
    assert.equal(itens(r.corpo).find((p) => p.ref === ref)?.mine, false);
  });

  void it('ISCA 2 -- AUTOR NAO VERIFICADO: nao aparece para mais ninguem', async () => {
    const autor = await criarConta('Autor sem verificar', false);
    const leitor = await criarConta('Leitora verificada', true);
    await darApelido(autor);
    await publicar(autor, 'autor nao verificado nao aparece');

    const r = await lerALinha(leitor);
    registrar('ISCA 2: autor nao verificado', r);
    assert.ok(
      !corpos(r.corpo).includes('autor nao verificado nao aparece'),
      'a publicacao de autor NAO VERIFICADO apareceu: a trava da verificacao e das ' +
        'DUAS pontas, e sem a ponta do autor o Mural fica aberto ao vetor de spam ' +
        'que a leitura escolhida pelo cliente fecha',
    );
  });

  void it('ISCA 3 -- QUEM OLHA NAO VERIFICADO: nao ve NADA de ninguem', async () => {
    const autor = await criarConta('Autora verificada', true);
    const leitor = await criarConta('Leitor sem verificar', false);
    await darApelido(autor);
    await publicar(autor, 'nao chega a quem nao verificou');

    const r = await lerALinha(leitor);
    registrar('ISCA 3: quem olha nao verificado', r);
    assert.equal(r.status, 200, 'quem nao verificou recebe 200 com lista vazia, e nunca 403');
    assert.ok(
      !corpos(r.corpo).includes('nao chega a quem nao verificou'),
      'quem NAO confirmou canal de contato recebeu publicacao: a trava e das duas pontas',
    );
    // E e por isso que o estado vazio do aplicativo tem de DIZER o motivo: esta
    // resposta e indistinguivel de "ninguem publicou" vista de fora.
    assert.deepEqual(itens(r.corpo), [], 'quem nao verificou tem de receber lista VAZIA');
  });

  void it('ISCA 4 -- A PROPRIA publicacao aparece ao autor NAO VERIFICADO', async () => {
    const autor = await criarConta('Autor que publica sem verificar', false);
    await darApelido(autor);
    await publicar(autor, 'a minha sai para mim mesmo');

    const r = await lerALinha(autor);
    registrar('ISCA 4: a propria, autor nao verificado', r);
    assert.ok(
      corpos(r.corpo).includes('a minha sai para mim mesmo'),
      'quem publicou NAO VIU o que publicou. A perna do proprio autor existe ' +
        'justamente para isso: sem ela, publicar e voltar ao Mural entrega o estado ' +
        'vazio, que e o problema que a decisao de 02/11/2026 quis resolver',
    );
    assert.equal(itens(r.corpo)[0]?.mine, true);
  });

  void it('ISCA 5 -- BLOQUEIO ENTRE ESTRANHOS: a UNICA protecao que resta, lida por SELECT cru', async () => {
    const autor = await criarConta('Autor bloqueado', true);
    const leitor = await criarConta('Leitora que bloqueou', true);
    await darApelido(autor);
    const ref = await publicar(autor, 'bloqueado entre estranhos nao sai');

    // (a) A LINHA EXISTE, e esta VIVA. Sem este controle positivo, a resposta
    // vazia do fim nao distingue "o bloqueio filtrou" de "nada foi escrito".
    const existe = await cliente.query<{ readonly n: string }>(
      `SELECT count(*)::text AS n FROM user_publications
        WHERE public_ref = $1 AND deleted_at IS NULL`,
      [ref],
    );
    assert.equal(existe.rows[0]?.n, '1', 'a publicacao do arranjo nao existe no banco');

    // (b) ELES NAO SAO CONEXAO. Ate 02/11/2026 este predicado nem era
    // alcancado neste cenario: a conexao filtrava antes dele.
    const arestas = await cliente.query<{ readonly n: string }>(
      `SELECT count(*)::text AS n FROM user_connections
        WHERE (requester_user_id = $1 AND addressee_user_id = $2)
           OR (requester_user_id = $2 AND addressee_user_id = $1)`,
      [autor, leitor],
    );
    assert.equal(arestas.rows[0]?.n, '0', 'o arranjo criou aresta: o bloqueio nao seria o unico filtro');

    // (c) SEM O BLOQUEIO, ELA SAI -- medido, e nao suposto. Este e o contraste
    // que faz o caso medir o BLOQUEIO e nao a audiencia.
    const antes = await lerALinha(leitor);
    registrar('ISCA 5 (c): antes do bloqueio', antes);
    assert.ok(
      corpos(antes.corpo).includes('bloqueado entre estranhos nao sai'),
      'a publicacao nao saiu nem ANTES do bloqueio: o caso mediria a audiencia',
    );

    await bloquear(leitor, autor);

    // (d) O BLOQUEIO EXISTE, e `bloqueio_entre` o VE. Le-se a funcao do banco
    // diretamente: e ela que a clausula `WHERE` chama.
    const bloqueio = await cliente.query<{ readonly entre: boolean }>(
      'SELECT bloqueio_entre($1::uuid, $2::uuid) AS entre',
      [autor, leitor],
    );
    assert.equal(bloqueio.rows[0]?.entre, true, '`bloqueio_entre` nao enxerga o bloqueio escrito');

    // (e) O EFEITO, por SELECT CRU sobre a mesma regra que a rota usa: a linha
    // continua viva e deixa de qualificar.
    const efeito = await cliente.query<{ readonly viva: boolean; readonly qualifica: boolean }>(
      `SELECT (p.deleted_at IS NULL) AS viva,
              (NOT bloqueio_entre(p.author_user_id, $2::uuid)) AS qualifica
         FROM user_publications p WHERE p.public_ref = $1`,
      [ref, leitor],
    );
    assert.equal(efeito.rows[0]?.viva, true, 'a publicacao foi APAGADA: o bloqueio nao apaga nada');
    assert.equal(
      efeito.rows[0]?.qualifica,
      false,
      'a linha continua qualificando com o bloqueio de pe: `NOT bloqueio_entre` deixou ' +
        'de filtrar, e com a audiencia aberta ele e a UNICA protecao entre duas ' +
        'pessoas sem relacao nenhuma',
    );

    // (f) E a RESPOSTA concorda com o `SELECT`.
    const depois = await lerALinha(leitor);
    registrar('ISCA 5 (f): depois do bloqueio', depois);
    assert.ok(
      !corpos(depois.corpo).includes('bloqueado entre estranhos nao sai'),
      'a publicacao de quem foi BLOQUEADO saiu na linha do tempo',
    );
  });

  void it('ISCA 6 -- DENUNCIADA: continua oculta para quem denunciou, e so para ele', async () => {
    const autor = await criarConta('Autor denunciado', true);
    const quemDenuncia = await criarConta('Leitora que denunciou', true);
    const outro = await criarConta('Terceiro verificado', true);
    await darApelido(autor);
    const ref = await publicar(autor, 'denunciada some para quem denunciou');

    await denunciar(ref, quemDenuncia);

    const dele = await lerALinha(quemDenuncia);
    registrar('ISCA 6: para quem denunciou', dele);
    assert.ok(
      !corpos(dele.corpo).includes('denunciada some para quem denunciou'),
      'a publicacao DENUNCIADA continuou aparecendo para quem a denunciou',
    );

    // O CONTRAPESO, e sem ele a isca passaria num mundo em que a denuncia apaga
    // o conteudo de todo mundo -- que e o que a 20261018000032 proibe.
    const doOutro = await lerALinha(outro);
    registrar('ISCA 6 (contrapeso): para quem NAO denunciou', doOutro);
    assert.ok(
      corpos(doOutro.corpo).includes('denunciada some para quem denunciou'),
      'a denuncia de UMA pessoa escondeu a publicacao de TERCEIRO: a ocultacao e do ' +
        'denunciante, e nao da fila',
    );
  });

  void it('ISCA 7 -- CONTA DESABILITADA do autor: nao aparece, mesmo verificada', async () => {
    const autor = await criarConta('Autora desabilitada', true);
    const leitor = await criarConta('Leitor verificado', true);
    await darApelido(autor);
    const ref = await publicar(autor, 'conta desabilitada nao aparece');

    // SEM A DESABILITACAO, ELA SAI -- o contraste que faz o caso medir
    // `conta_habilitada` e nao a audiencia.
    const antes = await lerALinha(leitor);
    assert.ok(
      corpos(antes.corpo).includes('conta desabilitada nao aparece'),
      'a publicacao nao saiu nem com a conta habilitada: o caso mediria outra coisa',
    );

    await desabilitar(autor);

    // `conta_habilitada` e a funcao que a clausula `WHERE` chama: le-se ela.
    const habilitada = await cliente.query<{ readonly ok: boolean }>(
      'SELECT conta_habilitada($1::uuid) AS ok',
      [autor],
    );
    assert.equal(habilitada.rows[0]?.ok, false, '`conta_habilitada` nao enxerga `deleted_at`');

    const depois = await lerALinha(leitor);
    registrar('ISCA 7: conta desabilitada', depois);
    assert.ok(
      !corpos(depois.corpo).includes('conta desabilitada nao aparece'),
      'a publicacao de CONTA DESABILITADA voltou ao Mural. Ate 02/11/2026 a ' +
        'conferencia vinha de dentro do `EXISTS` das conexoes, sobre as duas pontas ' +
        'do par; abrir a audiencia sem reintroduzi-la sobre o AUTOR a perde em ' +
        'SILENCIO -- e esta e a perda silenciosa que este caso mede',
    );
    assert.ok(ref.length === 22);
  });

  void it('EMENDA 5 -- a publicacao de ESTRANHO aparece, e sai SEM a foto do autor', async () => {
    const autor = await criarConta('Autor estranho com foto', true);
    const leitor = await criarConta('Leitor sem relacao', true);
    await darApelido(autor);
    // A FOTO EXISTE E ESTA PRONTA: sem ela no banco, o `null` medido abaixo nao
    // provaria nada -- seria ausencia de foto, e nao foto retida.
    await darFoto(autor, `estranho-${refPublica().slice(0, 8)}`);
    await publicar(autor, 'estranho aparece sem foto');

    const r = await lerALinha(leitor);
    registrar('EMENDA 5: estranho com foto pronta', r);
    const item = itens(r.corpo).find((p) => p.body === 'estranho aparece sem foto');
    assert.ok(item !== undefined, 'a publicacao do estranho verificado nao apareceu');
    assert.equal(
      item.author.photo_icon_url,
      null,
      'a FOTO de um ESTRANHO saiu na linha do tempo. A Emenda 5 do ADR-0010 autorizou ' +
        '`photo_icon_url` aqui com tres razoes, e a SEGUNDA e que o golpe do falso ' +
        'achador e praticado por ESTRANHO, e estranho nao e `accepted` -- "a consulta ' +
        'que traria a foto dele nao existe". Abrir a audiencia fez essa consulta ' +
        'existir; deixar a foto passar junto estende foto de pessoa a estranho POR ' +
        'ANALOGIA, que e o que aquela emenda proibe sem o cliente nomear a superficie',
    );
    // E o resto do autor SAI: a emenda retem a foto, e nao o nome.
    assert.equal(item.author.display_name, 'Autor estranho com foto');
    assert.equal(item.author.contact_channel_verified, true);
  });

  void it('CONTRAPESO da Emenda 5 -- a CONEXAO ACEITA continua recebendo a foto', async () => {
    const autor = await criarConta('Autora conectada', true);
    const leitor = await criarConta('Leitor conectado', true);
    await darApelido(autor);
    const marca = `conectada-${refPublica().slice(0, 8)}`;
    await darFoto(autor, marca);
    await ligar(autor, leitor, 'accepted');
    await publicar(autor, 'conexao aceita recebe a foto');

    const r = await lerALinha(leitor);
    registrar('CONTRAPESO Emenda 5: conexao aceita', r);
    const item = itens(r.corpo).find((p) => p.body === 'conexao aceita recebe a foto');
    assert.ok(item !== undefined, 'a publicacao da conexao aceita nao apareceu');
    assert.equal(
      item.author.photo_icon_url,
      `${BASE_DE_MIDIA}/thumb/${marca}-176.jpg`,
      'a foto NAO saiu para quem E conexao aceita. Sem este contrapeso, um conserto ' +
        'que simplesmente parasse de ler a foto do autor deixaria a isca da Emenda 5 ' +
        'verde e APAGARIA a emenda da superficie onde ela VALE',
    );
  });
});
