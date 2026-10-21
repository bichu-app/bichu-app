/**
 * **O CORPO REAL DE `listPublicationComments`, e a pessoa que ele mostra.**
 *
 * ## O defeito que este arquivo mede, e por que ele nao e detalhe
 *
 * Medido em 20/10/2026. `construtorDaPublicacaoVisivel` aplica o predicado de
 * conexao entre quem le e o autor **DA PUBLICACAO**; `construtorDosComentarios`
 * filtrava **so por bloqueio**. Os dois juntos deixam um estado que nenhuma
 * emenda autorizou:
 *
 *   A e conexao de B. C e conexao de B. **A e C nao sao conexoes.**
 *   C comenta na publicacao de B. A abre os comentarios.
 *
 * A publicacao esta certa -- ela e de B, que e conexao de A. O **comentario**
 * nao: ele trazia `photo_icon_url` de C, que para A e um estranho.
 *
 * O argumento de que o Mural satisfaz o predicado da Emenda 3 *"por
 * construcao"* cobre `getMyTimeline`, onde o autor da publicacao E o conjunto
 * que o `WHERE` admitiu. Ele **nao** cobre esta rota: o autor do COMENTARIO nao
 * passa por aquele `WHERE`, e so a publicacao passou. E a propria Emenda 5
 * existe porque *"satisfazer o critério não é estar nomeado, e ler o
 * complemento de uma regra como a regra é invenção de quem implementa"*.
 *
 * A regra que vale aqui: **Emenda 5 item 2** -- *"a foto nao sai para quem nao
 * e conexao aceita"* --, com o limite da **Emenda 2** para o resto (nome sai;
 * nenhum identificador interno, ADR-0010 item 6).
 *
 * ## Por que este arquivo e de INTEGRACAO
 *
 * **Nenhum portao deste repositorio confere o CORPO da resposta.** O validador
 * de contrato confere o corpo da REQUISICAO; a resposta sai como a borda a
 * monta, e um campo a mais nela nao reprova nada. Entao a unica forma de provar
 * o que sai e montar o servidor de verdade, com o repositorio de verdade,
 * contra o Postgres de verdade, e ler o JSON.
 *
 * `adapters/persistence/autorizacao-na-clausula-where.test.ts` e o irmao
 * unitario: ele le o SQL compilado e prova **onde** o predicado mora. Os dois
 * sao necessarios, pela mesma divisao que
 * `foto-na-conversa-entre-conexoes.test.ts` registra -- o unitario reprova o
 * `if` que substituisse a clausula `WHERE`; este reprova o campo que sai para
 * quem nao devia.
 *
 * ## As duas direcoes, e o contrapeso
 *
 * Um conserto que simplesmente parasse de ler a foto do autor do comentario
 * deixaria estas iscas de omissao todas verdes -- e apagaria a Emenda 5 da
 * superficie onde ela VALE. Por isso o caso de conexao aceita exige a foto
 * PRESENTE e na derivada certa, e o contrapeso conta os campos do autor: campo
 * a mais reprova tanto quanto campo a menos.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## A massa e de teste, e se anuncia como tal
 *
 * Contas `@exemplo-de-teste.invalid` (`.invalid` e reservado por RFC 2606:
 * nenhum e-mail sai daqui para o mundo) e apelidos `massatesteNN`. Nenhuma
 * conta e nenhuma senha de pessoa real passa por este arquivo.
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
/**
 * O CONTRATO, carregado UMA VEZ para o arquivo inteiro.
 *
 * `carregarContrato` analisa um YAML de ~20 mil linhas. Carregando-o por
 * servidor -- e ha um servidor por caso -- este arquivo era o mais pesado da
 * suite, e os 52 arquivos rodam em PARALELO dentro de um container de
 * `mem_limit: 1g`. Medido: com a carga por servidor, o processo deste arquivo
 * morria no meio da lista, em caso DIFERENTE a cada execucao (depois do 4o numa,
 * depois do 5o na outra) e sem mensagem -- a assinatura de processo derrubado por
 * limite, e nao de assercao reprovada. Uma carga por arquivo resolve sem mexer no
 * teto, que e a regra desta casa para falta de memoria.
 */
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

async function criarConta(nome: string): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    'INSERT INTO users (id, email, display_name, public_ref) VALUES ($1, $2, $3, $4)',
    [id, `comentario-${id}@${DOMINIO_DE_TESTE}`, nome, refPublica()],
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
 * `public_key` (a `card` de 512) entra de proposito: se a consulta trocasse de
 * derivada, o caso de conexao aceita acusaria pela URL, e nao por ausencia.
 */
async function darFoto(conta: UserId, marca: string): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO catalog_images (id, purpose, status, public_key, thumb_key)
     VALUES ($1, 'user_photo', 'ready', $2, $3)`,
    [id, `card/${marca}-512.jpg`, `thumb/${marca}-176.jpg`],
  );
  await cliente.query('UPDATE users SET photo_image_id = $1 WHERE id = $2', [id, conta]);
  imagensCriadas.push(id);
  return `thumb/${marca}-176.jpg`;
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

/** A publicacao, escrita direto: o que esta suite mede e a LEITURA. */
async function publicar(autor: UserId, corpo: string): Promise<string> {
  const ref = refPublica();
  await cliente.query(
    'INSERT INTO user_publications (id, author_user_id, public_ref, body) VALUES ($1,$2,$3,$4)',
    [randomUUID(), autor, ref, corpo],
  );
  return ref;
}

async function comentar(publicacaoRef: string, autor: UserId, corpo: string): Promise<string> {
  const ref = refPublica();
  await cliente.query(
    `INSERT INTO publication_comments (id, publication_id, author_user_id, public_ref, body)
     SELECT $1, p.id, $2, $3, $4 FROM user_publications p WHERE p.public_ref = $5`,
    [randomUUID(), autor, ref, corpo, publicacaoRef],
  );
  return ref;
}

/**
 * O preparador de envio **nao e dublado para passar**: ele LANCA.
 *
 * Nenhuma leitura o alcanca, e e isso que este objeto afirma. Um dublê que
 * devolvesse valor plausivel deixaria um caminho de escrita que chegasse aqui
 * por acidente terminar verde contra nada.
 */
const enviosQueNinguemChama: PreparadorDeEnvioDeCatalogo = {
  preparar: () =>
    Promise.reject(new Error('nenhuma LEITURA de comentario prepara envio de imagem')),
};

/** O gerador de ids, um para o arquivo. Nenhuma LEITURA o exercita. */
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
}

interface Comentario {
  readonly ref: string;
  readonly body: string;
  readonly created_at: string;
  readonly author: Autor;
  readonly mine: boolean;
}

/**
 * O SERVIDOR DE VERDADE, com a rota de verdade e o repositorio de verdade.
 *
 * `quemChama` entra pelo autenticador. Nada mais e dublado -- o serviço, o
 * repositorio, o Kysely, o Postgres e a projecao da borda sao os reais, e e
 * essa cadeia inteira que precisa estar no caminho para o corpo medido ser o
 * corpo servido.
 */
async function servidorPara(quemChama: UserId) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  // `escoparRotas` com o MESMO prefixo de `api.ts`, e nao registro na raiz:
  // registrado na raiz, a rota responde o 404 DO FASTIFY, e o caso passa a
  // medir o 404 errado. Os dois 404 deste produto sao indistinguiveis de fora
  // de proposito (ADR-0021).
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDoMural(escopo, {
      mural: new Mural({
        envios: enviosQueNinguemChama,
        publicacoes: criarPublicacoesRepository(db, ids),
        registrarIntencao: () =>
          Promise.reject(new Error('nenhuma LEITURA de comentario registra intencao')),
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

async function lerComentarios(quemChama: UserId, publicacaoRef: string): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url: `/v1/publications/${publicacaoRef}/comments`,
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

function comentarios(corpo: Record<string, unknown>): readonly Comentario[] {
  return corpo['items'] as readonly Comentario[];
}

function porCorpo(corpo: Record<string, unknown>, texto: string): Comentario {
  const achado = comentarios(corpo).find((c) => c.body === texto);
  assert.ok(achado !== undefined, `a resposta nao tem o comentario \`${texto}\``);
  return achado;
}

/** Imprime o corpo medido, para ele ser COLADO no relatorio em vez de descrito. */
function registrar(rotulo: string, r: Resposta): void {
  console.log(
    `\n[CORPO MEDIDO] ${rotulo}\n  status: ${String(r.status)}\n  items: ${JSON.stringify(
      comentarios(r.corpo),
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
    // `ON DELETE CASCADE` leva publicacoes, comentarios, arestas e bloqueios.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  if (imagensCriadas.length > 0) {
    await cliente.query('DELETE FROM catalog_images WHERE id = ANY($1::uuid[])', [imagensCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o corpo real de `listPublicationComments`: a foto do autor do comentario', () => {
  void it('ISCA -- DOIS CONHECIDOS DO MESMO AMIGO: o nome sai, a FOTO NAO', () => {
    return (async () => {
      // O CENARIO MEDIDO, e ele e o estado comum do produto -- nao a borda: B
      // publica, A e C sao conexoes de B, A e C nao se conhecem, C comenta.
      //
      // A publicacao esta CERTA na resposta: ela e de B, que e conexao de A. O
      // comentario e que nao pode trazer o rosto de C.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const c = await criarConta('Caio');
      const apelidoDeC = await darApelido(c);
      await darFoto(c, 'caio-estranho');
      await ligar(b, a, 'accepted');
      await ligar(b, c, 'accepted');
      // A e C NAO sao ligados, e e esta ausencia que o caso mede.

      const publicacao = await publicar(b, 'passeio no parque hoje');
      await comentar(publicacao, c, 'que foto linda');

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo o comentario de C (conhecidos do mesmo amigo B)', r);

      assert.equal(r.status, 200);
      const visto = porCorpo(r.corpo, 'que foto linda');
      assert.equal(
        visto.author.photo_icon_url,
        null,
        'A FOTO VAZOU para quem nao e conexao aceita: Emenda 5 item 2 do ADR-0010',
      );
      // O NOME CONTINUA SAINDO, e isto nao e concessao: a Emenda 2 da o nome de
      // outra pessoa a quem NAO e conexao dela, e sem autor o comentario fica
      // anonimo numa conversa entre conhecidos.
      assert.equal(visto.author.display_name, 'Caio');
      assert.equal(visto.author.handle, apelidoDeC, 'sem o apelido o toque nao tem destino');
      assert.equal(visto.mine, false);
    })();
  });

  void it('ISCA -- CONEXAO ACEITA: a foto SAI, e e a derivada `thumb` de 176 px', () => {
    return (async () => {
      // A DIRECAO OPOSTA, e sem ela o conserto poderia ser "parar de ler a
      // foto": isso deixaria a isca de cima verde e apagaria a Emenda 5 da
      // superficie onde ela VALE.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const apelidoDeB = await darApelido(b);
      const chave = await darFoto(b, 'bianca-conexao');
      await ligar(b, a, 'accepted');

      const publicacao = await publicar(b, 'olha quem acordou');
      await comentar(publicacao, b, 'ela dormiu a tarde toda');

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo o comentario de B, que E conexao dela', r);

      const visto = porCorpo(r.corpo, 'ela dormiu a tarde toda');
      assert.equal(
        visto.author.photo_icon_url,
        `${BASE_DE_MIDIA}/${chave}`,
        'A FOTO NAO SAIU para uma conexao aceita: a Emenda 5 a autoriza aqui',
      );
      assert.match(
        String(visto.author.photo_icon_url),
        /-176\.jpg$/,
        'a derivada servida nao e a `thumb` de 176 px: a `card` de 512 e 4,27x a celula de 40 dp',
      );
      assert.ok(
        !String(visto.author.photo_icon_url).includes('-512'),
        'a `card` de 512 px saiu no lugar da `thumb`',
      );
      assert.equal(visto.author.handle, apelidoDeB);
    })();
  });

  void it('ISCA -- O PROPRIO comentario: a foto de quem chama sai, como na linha do tempo', () => {
    return (async () => {
      // O ramo `autor = quem chama` do recorte. Sem ele, quem comenta na
      // publicacao de um amigo veria o proprio cartao sem rosto -- e o recorte
      // da linha do tempo tem esse mesmo ramo, pela mesma razao.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const chaveDeA = await darFoto(a, 'alice-propria');
      await ligar(b, a, 'accepted');

      const publicacao = await publicar(b, 'domingo de sol');
      await comentar(publicacao, a, 'que inveja boa');

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo o PROPRIO comentario', r);

      const meu = porCorpo(r.corpo, 'que inveja boa');
      assert.equal(meu.mine, true);
      assert.equal(meu.author.photo_icon_url, `${BASE_DE_MIDIA}/${chaveDeA}`);
    })();
  });

  void it('ISCA -- PEDIDO PENDENTE nao e aceite: nada de foto antes do `accepted`', () => {
    return (async () => {
      // *"ja aceitaram conexao"*. Um defeito que lesse a aresta sem olhar o
      // `state` entregaria o rosto a quem apenas mandou um pedido.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const d = await criarConta('Diego');
      await darApelido(d);
      await darFoto(d, 'diego-pendente');
      await ligar(b, a, 'accepted');
      await ligar(b, d, 'accepted');
      await ligar(d, a, 'pending');

      const publicacao = await publicar(b, 'alguem viu o Tobias');
      await comentar(publicacao, d, 'vi ele na praca ontem');

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo o comentario de D, com pedido PENDENTE entre os dois', r);
      assert.equal(
        porCorpo(r.corpo, 'vi ele na praca ontem').author.photo_icon_url,
        null,
        'pendente trouxe foto',
      );
    })();
  });

  void it('ISCA -- conta DESABILITADA do autor do comentario: perde a foto, sendo conexao', () => {
    return (async () => {
      // `conta_habilitada` das duas pontas esta DENTRO do predicado, entao o
      // lado que saiu perde a foto sem nenhum `if` no dominio.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const e = await criarConta('Elisa');
      await darApelido(e);
      await darFoto(e, 'elisa-desabilitada');
      await ligar(b, a, 'accepted');
      await ligar(e, a, 'accepted');
      await ligar(b, e, 'accepted');

      const publicacao = await publicar(b, 'feira de adocao sabado');
      await comentar(publicacao, e, 'vou levar a Lola');
      await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [e]);

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo comentario de conexao com conta DESABILITADA', r);
      assert.equal(
        porCorpo(r.corpo, 'vou levar a Lola').author.photo_icon_url,
        null,
        'a foto de uma conta desabilitada saiu',
      );
    })();
  });

  void it('CONTRAPESO -- BLOQUEIO: o comentario do bloqueado SOME, e o resto fica', () => {
    return (async () => {
      // A unica ferramenta que a pessoa tem sobre comentario alheio hoje, e ela
      // nao foi tocada pelo conserto: bloquear o autor some com os comentarios
      // dele. Este caso existe para provar que o predicado de foto nao comeu o
      // de bloqueio nem virou o unico recorte da consulta.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const f = await criarConta('Fabio');
      await ligar(b, a, 'accepted');
      await ligar(b, f, 'accepted');

      const publicacao = await publicar(b, 'quem indica adestrador');
      await comentar(publicacao, f, 'tenho um contato');
      await comentar(publicacao, b, 'manda aqui');
      await bloquear(a, f);

      const r = await lerComentarios(a, publicacao);
      registrar('A lendo a lista com F BLOQUEADO', r);
      assert.equal(comentarios(r.corpo).length, 1, 'o comentario do bloqueado continuou na lista');
      assert.equal(comentarios(r.corpo)[0]?.body, 'manda aqui');
    })();
  });

  void it('CONTRAPESO -- o AUTOR tem TRES campos, e a lista e FECHADA', () => {
    return (async () => {
      // **Campo a mais reprova tanto quanto campo a menos.** Sem este caso, uma
      // projecao que passasse a devolver `public_ref`, `id` ou contagem de pets
      // junto com o autor atravessaria todas as iscas acima -- elas olham um
      // campo por vez. ADR-0010 item 6 e item 7, e Emenda 5 itens 5 e 6.
      const b = await criarConta('Bianca');
      const a = await criarConta('Alice');
      const c = await criarConta('Caio');
      await darApelido(c);
      await darFoto(c, 'caio-contrapeso');
      await ligar(b, a, 'accepted');
      await ligar(b, c, 'accepted');

      const publicacao = await publicar(b, 'cachorro novo na rua');
      await comentar(publicacao, c, 'alguem conhece o dono');

      const r = await lerComentarios(a, publicacao);
      const visto = porCorpo(r.corpo, 'alguem conhece o dono');

      assert.deepEqual(
        Object.keys(visto).sort(),
        ['author', 'body', 'created_at', 'mine', 'ref'],
        'o comentario ganhou ou perdeu campo em relacao ao contrato',
      );
      assert.deepEqual(
        Object.keys(visto.author).sort(),
        ['display_name', 'handle', 'photo_icon_url'],
        'o autor do comentario ganhou ou perdeu campo: `PublicationAuthor` tem TRES',
      );
      // NENHUM IDENTIFICADOR INTERNO em lugar nenhum do corpo (ADR-0010 item 6).
      const texto = JSON.stringify(r.corpo);
      assert.ok(
        !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto),
        'um UUID saiu no corpo da resposta de comentarios',
      );
      // E a pagina continua respondendo o que a tela precisa: a contagem e o
      // cursor. Sem isto, uma resposta vazia passaria pelas iscas de ausencia.
      assert.equal(r.corpo['comment_count'], 1);
      assert.equal(r.corpo['next_cursor'], null);
    })();
  });
});
