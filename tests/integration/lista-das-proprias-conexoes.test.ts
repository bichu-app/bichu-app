/**
 * **`GET /v1/connections` CONTRA POSTGRES DE VERDADE** — a lista das próprias
 * conexões, autorizada pelo cliente em 22/10/2026: *"o usuário pode abrir a
 * lista de usuários que é sua conexão"*.
 *
 * ## Por que este arquivo existe, e por que ele é de integração
 *
 * Porque o SQL desta fatia é da classe que **passa no compilador e falha na
 * execução**, e as três coisas que ela usa são exatamente as três que o
 * `tsc` não tem como conferir:
 *
 * | O que o SQL faz | Por que o typecheck não alcança |
 * |---|---|
 * | `to_jsonb(outro) ->> 'handle'` | operador de JSON do Postgres dentro de uma `sql` template. Para o TypeScript é texto; o tipo da coluna, a existência do campo e o `NULL` de coluna ausente são do banco |
 * | `= ANY(${apelidos}::text[])` | conversão de vetor. O driver manda um array JS, e o Postgres o lê como `text[]`. **Vetor VAZIO é o caso que mais estoura**, e nenhum tipo o acusa |
 * | três subconsultas correlacionadas | `pets_count`, `connections_count` e `photo_key` referenciam `outro.id` de um `JOIN` que mora em outra `sql` template (`juncaoDaAresta`). Se o alias não alcançasse, o erro é `42P01` em tempo de execução |
 *
 * Os irmãos unitários já existem e **nenhum substitui este**:
 *
 * - `connections/adapters/persistence/autorizacao-na-clausula-where.test.ts` lê
 *   o SQL **compilado** e prova *onde* o predicado mora. Ele não executa nada —
 *   e um SQL sintaticamente válido que o Postgres recusasse passaria lá;
 * - `connections/application/lista-das-proprias-conexoes.test.ts` prova a regra
 *   com a bancada em memória. Ela reproduz o que o SQL **deveria** fazer, e é
 *   justamente essa a suposição que este arquivo tira do caminho;
 * - `connections/adapters/http/lista-de-conexoes-na-borda.test.ts` mede o corpo
 *   e o 404 com o repositório **em memória**.
 *
 * **Nenhum portão deste repositório confere o CORPO da resposta** (nem o
 * validador de contrato, que só olha o corpo da REQUISIÇÃO), então a única
 * forma de provar o que sai é montar o servidor de verdade, com o repositório
 * de verdade, contra o Postgres de verdade, e ler o JSON.
 *
 * ## O CONTROLE POSITIVO, e por que ele vem primeiro
 *
 * Todo caso negativo deste arquivo ("a conta A não vê a lista da B", "pendente
 * não entra") passaria numa consulta que devolvesse **vazio para tudo** — e uma
 * consulta que explodisse e fosse engolida, ou um `WHERE` que casasse nada,
 * produzem exatamente isso. Por isso o primeiro caso é o positivo, e os
 * negativos afirmam o par `(o que tem de aparecer apareceu, o que não podia
 * não apareceu)` na MESMA leitura.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, e o banco é derrubado no fim.
 *
 * ## A massa escreve `users.public_ref` E `users.handle` à mão
 *
 * `public_ref` é `NOT NULL` **sem `DEFAULT`** (`20261018000031`): a aplicação a
 * sorteia no `INSERT`.
 *
 * `users.handle` é **separado de `handles`**, e escrever os dois não é
 * redundância — é o que esta fatia precisa: a **lista** lê `users.handle` (pela
 * costura `to_jsonb`) e a **busca** lê a tabela `handles`. Uma massa que
 * escrevesse só `handles` deixaria a lista vazia e **todos os casos negativos
 * verdes**, que é precisamente o verde-por-vazio que o controle positivo
 * existe para pegar. `users.handle` é FK para `handles.handle`, então a ordem é
 * `handles` primeiro.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarConnectionsRepository } from '../../src/modules/connections/adapters/persistence/kysely-connections-repository.js';
import {
  criarResolvedorDeApelido,
  criarResolvedorDeConvite,
} from '../../src/modules/connections/adapters/persistence/kysely-convites.js';
import { ConexaoEntrePessoas } from '../../src/modules/connections/application/conexao-entre-pessoas.js';
import { criarLeitorDeConexao } from '../../src/modules/connections/application/leitor-de-conexao.js';
import { registrarRotasDeConexao } from '../../src/modules/connections/adapters/http/connection-routes.js';
import { semBloqueioConhecido } from '../../src/modules/connections/ports/leitor-de-bloqueio.js';
import { criarBuscaDePessoasRepository } from '../../src/modules/people/adapters/persistence/kysely-busca-de-pessoas.js';
import { BuscaDePessoas } from '../../src/modules/people/application/busca-de-pessoas.js';
import { registrarRotasDeBuscaDePessoas } from '../../src/modules/people/adapters/http/people-search-routes.js';
import { escoparRotas } from '../../src/shared/http/registrar-rota.js';
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarContadorEmMemoria } from '../../src/shared/http/rate-limit.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { AuditLog } from '../../src/modules/audit/ports/audit-log.js';
import type { AbsoluteUrl, Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DE_MIDIA = 'https://midia.bichu.test' as AbsoluteUrl;
const AGORA = 1_790_000_000_000 as Instant;

/**
 * O sufixo que torna os apelidos desta execução únicos.
 *
 * `handles.handle` é único **global**, e a suíte roda em banco compartilhado
 * com os outros 55 arquivos. Sem o sufixo, duas execuções seguidas (ou duas
 * frentes) colidem na chave primária e o arquivo reprova por massa, não por
 * defeito. A faixa do apelido é 5–20 e o padrão é
 * `^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$`, então o sufixo é hexadecimal minúsculo.
 */
const SUFIXO = randomBytes(3).toString('hex');

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let especie: string;
let porte: string;

const contasCriadas: UserId[] = [];
const apelidosCriados: string[] = [];
const imagensCriadas: string[] = [];

/** 22 símbolos, que é a forma que `users_public_ref_forma` cobra. */
function refPublica(): string {
  return randomUUID().replace(/-/g, '').slice(0, 22);
}

async function criarConta(nome: string | null): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    'INSERT INTO users (id, email, display_name, public_ref) VALUES ($1, $2, $3, $4)',
    [id, `lista-${id}@${DOMINIO_DE_TESTE}`, nome, refPublica()],
  );
  contasCriadas.push(id);
  return id;
}

/**
 * O apelido, **nas DUAS tabelas** — ver o cabeçalho.
 *
 * O apelido entra duas vezes na primeira sentença, com casts explícitos, e isso
 * não é estilo: `handle` é `citext` e `handle_esqueleto(text)` recebe `text`.
 * Com um `$1` nos dois lugares o Postgres recusa a sentença inteira com
 * `42P08 inconsistent types deduced for parameter $1`.
 */
async function darApelido(conta: UserId, base: string): Promise<string> {
  const apelido = `${base}-${SUFIXO}`;
  await cliente.query(
    `INSERT INTO handles (handle, handle_esqueleto, kind, user_id)
     VALUES ($1::citext, handle_esqueleto($2::text), 'pessoa', $3)`,
    [apelido, apelido, conta],
  );
  apelidosCriados.push(apelido);
  // A FK `users_handle_no_espaco_de_nomes` exige que `handles` venha primeiro.
  await cliente.query('UPDATE users SET handle = $1::citext WHERE id = $2', [apelido, conta]);
  return apelido;
}

/** A foto da pessoa, PRONTA, com as duas derivadas. */
async function darFoto(conta: UserId, marca: string): Promise<string> {
  const id = randomUUID();
  const thumb = `thumb/${marca}-176.jpg`;
  await cliente.query(
    `INSERT INTO catalog_images (id, purpose, status, public_key, thumb_key)
     VALUES ($1, 'user_photo', 'ready', $2, $3)`,
    [id, `card/${marca}-512.jpg`, thumb],
  );
  await cliente.query('UPDATE users SET photo_image_id = $1 WHERE id = $2', [id, conta]);
  imagensCriadas.push(id);
  return thumb;
}

/**
 * A foto que **não está pronta** — `processing`.
 *
 * Existe para o caso do nulo explícito: o predicado da consulta é
 * `status = 'ready' AND thumb_key IS NOT NULL`, e sem uma foto neste estado o
 * caso do nulo mediria só "a conta não tem foto nenhuma", que é outro estado.
 */
async function darFotoNaoPronta(conta: UserId): Promise<void> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO catalog_images (id, purpose, status, public_key, thumb_key)
     VALUES ($1, 'user_photo', 'processing', $2, NULL)`,
    [id, `card/processando-${id}.jpg`],
  );
  await cliente.query('UPDATE users SET photo_image_id = $1 WHERE id = $2', [id, conta]);
  imagensCriadas.push(id);
}

async function criarPet(dono: UserId, nome: string): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [id, dono, nome, especie, porte],
  );
  return id;
}

/**
 * A aresta, no estado dado. `requester`/`addressee` na ordem recebida.
 *
 * **`responded_at` E `rest_until` SÃO DERIVADOS DO ESTADO AQUI, e os dois por
 * `CHECK` da tabela** — descobertos em execução, na primeira rodada deste
 * arquivo, com a sentença recusada por
 * `user_connections_descanso_so_na_recusa`:
 *
 * | `CHECK` | O que ele cobra |
 * |---|---|
 * | `user_connections_resposta_coerente` | `(state = 'pending') = (responded_at IS NULL)` |
 * | `user_connections_descanso_so_na_recusa` | `(state = 'declined') = (rest_until IS NOT NULL)` |
 *
 * O segundo é o descanso de 90 dias, e ele é o mecanismo que impede o próximo
 * pedido de nascer pendente e **lavar a recusa**. Uma massa que o omitisse não
 * teria como semear uma recusa — e é por isso que este ajudante o deriva em vez
 * de recebê-lo: um parâmetro a mais seria um parâmetro a esquecer.
 */
async function ligar(
  requester: UserId,
  addressee: UserId,
  state: 'pending' | 'accepted' | 'declined',
): Promise<void> {
  const [baixo, alto] = requester < addressee ? [requester, addressee] : [addressee, requester];
  await cliente.query(
    `INSERT INTO user_connections
       (id, ref, requester_user_id, addressee_user_id, pair_low, pair_high,
        state, origin, expires_at, responded_at, rest_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'anchored_case', now() + interval '30 days',
             CASE WHEN $7 = 'pending' THEN NULL ELSE now() END,
             CASE WHEN $7 = 'declined' THEN now() + interval '90 days' ELSE NULL END)`,
    [randomUUID(), refPublica(), requester, addressee, baixo, alto, state],
  );
}

async function desabilitar(conta: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [conta]);
}

async function reabilitar(conta: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [conta]);
}

const trilhaInerte = { record: () => Promise.resolve() } as unknown as AuditLog;

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

interface PessoaDoCorpo {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: number;
  readonly connections_count: number;
  readonly photo_icon_url: string | null;
  readonly connection_state?: string;
}

/**
 * O SERVIDOR DE VERDADE, com as rotas, o repositório, o Kysely e o Postgres
 * reais. **Só a autenticação é dublada**: a rota lê o `Bearer`, e o dublê
 * devolve a conta que o token nomeia.
 *
 * As DUAS famílias de rota entram no mesmo servidor de propósito: o
 * `connection_state` da busca (22/10/2026) atravessa
 * `LeitorDeConexao.estadosPorApelido`, que é SQL do módulo de conexão lido pelo
 * módulo de pessoas. Montá-las separadas mediria as duas metades e não a
 * costura entre elas.
 */
async function servidorPara(quemChama: UserId) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const contrato = carregarContrato('api/openapi.yaml');
  // **O VIGIA DE PARÂMETROS, que a produção instala (`api.ts:1127`) — e sem ele
  // esta bancada media outra coisa.** Descoberto em execução: sem o vigia,
  // `GET /v1/connections?page=1` devolvia `"page": "1"` no corpo, CADEIA, porque
  // a query chega como texto e a borda a ecoa. Com o vigia, o `schema.querystring`
  // do contrato entra no validador do Fastify e o Ajv converte para `integer`
  // antes do manipulador.
  //
  // A bancada sem ele não media um defeito: media a AUSÊNCIA de uma peça que
  // produção tem. É o mesmo motivo pelo qual
  // `o-piso-da-busca-nao-recusa-na-borda.test.ts` o instala, e lá está escrito:
  // *"instalá-lo aqui é o ponto inteiro da bancada"*.
  vigiarParametrosDasRotas(app, contrato, '/v1');
  const repositorio = criarConnectionsRepository(db);
  const autenticador = { autenticar: () => Promise.resolve({ userId: quemChama }) };
  // `escoparRotas` com o MESMO prefixo de `api.ts`. Medido em outra bancada
  // desta suite: registrando na raiz, a rota responde o 404 do Fastify e o
  // caso passa a medir o 404 errado -- e os dois 404 deste produto sao
  // indistinguiveis de fora de proposito (ADR-0021).
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDeConexao(escopo, {
      conexoes: new ConexaoEntrePessoas({
        conexoes: repositorio,
        convites: criarResolvedorDeConvite(db, { now: () => AGORA }),
        apelidos: criarResolvedorDeApelido(db),
        bloqueios: semBloqueioConhecido,
        trilha: trilhaInerte,
        // Nenhum caminho de ESCRITA e exercido aqui. Os geradores sao reais em
        // vez de marcas de tipo: se uma leitura passar a gerar id, o valor que
        // sai daqui e valido em vez de mentira.
        ids: {
          uuidv7: () => randomUUID(),
          opaqueToken: () => refPublica() as never,
          random128: () => randomBytes(16),
          random80: () => randomBytes(10),
        },
        clock: { now: () => AGORA },
      }),
      autenticador,
      contrato,
      baseDeMidia: BASE_DE_MIDIA,
    });
    registrarRotasDeBuscaDePessoas(escopo, {
      busca: new BuscaDePessoas({
        busca: criarBuscaDePessoasRepository(db),
        // A PORTA DE CONEXAO DE VERDADE, que e o que faz o `connection_state`
        // da busca atravessar SQL e nao um duble.
        conexoes: criarLeitorDeConexao(repositorio),
        clock: { now: () => AGORA },
      }),
      autenticador,
      baseDeMidia: BASE_DE_MIDIA,
    });
  });
  return app;
}

async function pedir(quemChama: UserId, url: string): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url,
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

function listar(quemChama: UserId, consulta = ''): Promise<Resposta> {
  return pedir(quemChama, `/v1/connections${consulta}`);
}

function buscar(quemChama: UserId, termo: string): Promise<Resposta> {
  return pedir(quemChama, `/v1/people?q=${encodeURIComponent(termo)}`);
}

function pessoas(corpo: Record<string, unknown>): readonly PessoaDoCorpo[] {
  return corpo['items'] as readonly PessoaDoCorpo[];
}

function apelidos(corpo: Record<string, unknown>): readonly string[] {
  return pessoas(corpo).map((p) => p.handle);
}

before(async () => {
  assert.ok(
    CONEXAO !== undefined && CONEXAO !== '',
    'DATABASE_URL não está definida. Esta suíte REPROVA sem banco em vez de se pular: ' +
      'um arquivo de integração que se pula sozinho termina verde e ocupa o lugar de um ' +
      'que funcionaria.',
  );
  banco = createDb(CONEXAO);
  db = banco.db;
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  const especies = await cliente.query<{ code: string }>('SELECT code FROM ref_species LIMIT 1');
  const portes = await cliente.query<{ code: string }>('SELECT code FROM ref_sizes LIMIT 1');
  assert.ok(
    especies.rows[0] !== undefined && portes.rows[0] !== undefined,
    'os dados de referência não estão na base: sem eles nenhum pet pode ser criado, e ' +
      'os casos de `pets_count` passariam por não ter olhado para nada',
  );
  especie = especies.rows[0].code;
  porte = portes.rows[0].code;
});

after(async () => {
  // A ORDEM NAO E ARBITRARIA: `handles.user_id` e `ON DELETE SET NULL` e
  // `handles_pessoa_tem_dono` proibe `kind = 'pessoa'` sem dono. Apagar a conta
  // ANTES do apelido viola o `CHECK` e derruba o `after` -- com os casos todos
  // verdes, o que deixa a suite vermelha por causa da limpeza.
  //
  // E `users.handle` e FK para `handles.handle`: a coluna sai PRIMEIRO, senao o
  // `DELETE FROM handles` viola a referencia.
  if (contasCriadas.length > 0) {
    await cliente.query('UPDATE users SET handle = NULL WHERE id = ANY($1::uuid[])', [
      contasCriadas,
    ]);
  }
  if (apelidosCriados.length > 0) {
    await cliente.query('DELETE FROM handles WHERE handle = ANY($1::citext[])', [apelidosCriados]);
  }
  if (contasCriadas.length > 0) {
    // `ON DELETE CASCADE` leva pets, arestas e bloqueios junto.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  if (imagensCriadas.length > 0) {
    await cliente.query('DELETE FROM catalog_images WHERE id = ANY($1::uuid[])', [imagensCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('`GET /v1/connections` contra Postgres: a lista das PRÓPRIAS conexões', () => {
  /**
   * **O CONTROLE POSITIVO, e ele é o primeiro de propósito.**
   *
   * Ele é o único caso deste arquivo que **não pode passar com a consulta
   * vazia**, e é por isso que ele mede as três coisas que o typecheck não
   * alcança de uma vez: o `to_jsonb(outro) ->> 'handle'` devolveu o apelido, as
   * duas subconsultas correlacionadas devolveram NÚMERO (e não a cadeia que o
   * driver entrega para `bigint`), e a terceira montou a URL da `thumb`.
   *
   * Sem ele, todos os casos negativos abaixo passariam numa consulta que
   * estourasse e fosse engolida.
   */
  void it('CONTROLE POSITIVO: a conta lê as PRÓPRIAS conexões aceitas, com os cinco campos', () => {
    return (async () => {
      const ana = await criarConta('Ana Lista');
      const bia = await criarConta('Bia Lista');
      await darApelido(ana, 'ana-lista');
      const apelidoDaBia = await darApelido(bia, 'bia-lista');
      const thumb = await darFoto(bia, 'bia');
      await criarPet(bia, 'Rex');
      await criarPet(bia, 'Mel');
      await ligar(ana, bia, 'accepted');

      const r = await listar(ana);
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      assert.equal(r.corpo['total'], 1, 'o total vem de `count(*) OVER ()` na MESMA consulta');
      const lista = pessoas(r.corpo);
      assert.equal(lista.length, 1, 'a lista NAO pode vir vazia: ha uma conexao aceita semeada');

      const primeira = lista[0] as PessoaDoCorpo;
      // 1. O OPERADOR DE JSON rodou, e devolveu o apelido -- nao `null`.
      assert.equal(
        primeira.handle,
        apelidoDaBia,
        '`to_jsonb(outro) ->> \'handle\'` devolveu outra coisa. É a costura que o ' +
          'cabeçalho do repositório descreve, e ela é do Postgres e não do TypeScript.',
      );
      assert.equal(primeira.display_name, 'Bia Lista');

      // 2. AS DUAS SUBCONSULTAS CORRELACIONADAS rodaram, e vieram como NUMERO.
      //    `count(*)` e `bigint`, e o driver o entrega como CADEIA -- se a
      //    conversao da borda do banco caisse, isto seria `"2"`.
      assert.equal(primeira.pets_count, 2, 'dois pets semeados');
      assert.equal(typeof primeira.pets_count, 'number', '`bigint` tem de virar número');
      assert.equal(primeira.connections_count, 1, 'a Bia tem UMA conexão: a Ana');
      assert.equal(typeof primeira.connections_count, 'number');

      // 3. A TERCEIRA subconsulta alcancou `outro.photo_image_id`, e a borda
      //    montou a URL com a base de midia do ambiente.
      assert.equal(primeira.photo_icon_url, `${BASE_DE_MIDIA}/${thumb}`);

      // E O CONJUNTO EXATO DE CHAVES. Por igualdade, e nao por "nao contem X":
      // uma asercao que so negasse `connection_ref` passaria no dia em que
      // alguem acrescentasse `public_ref`, `city` ou `showcase`.
      assert.deepEqual(Object.keys(primeira).sort(), [
        'connections_count',
        'display_name',
        'handle',
        'pets_count',
        'photo_icon_url',
      ]);
    })();
  });

  /**
   * **O VETOR VAZIO no `= ANY(...::text[])`** — o caso que o coordenador
   * nomeou, e ele é medido pelos **dois** caminhos.
   *
   * `construtorDasArestasPorApelido` recebe a lista de apelidos da página de
   * busca. Com zero apelidos o SQL fica `= ANY(ARRAY[]::text[])`, e as duas
   * formas de errar são opostas: **quebrar** (`42804`, ou o driver recusando o
   * array vazio) ou **devolver tudo** (se alguém trocasse o `ANY` por um
   * predicado que some com a lista vazia).
   *
   * O caminho curto é `LeitorDeConexao.estadosPorApelido`, que atalha em
   * `apelidos.length === 0` e não consulta — e esse atalho é o que **esconde** o
   * problema. Então este caso vai direto ao repositório, **por baixo do
   * atalho**, e exercita a consulta de verdade com o vetor vazio.
   */
  void it('o `= ANY(::text[])` com vetor VAZIO não quebra e não devolve tudo', () => {
    return (async () => {
      const carla = await criarConta('Carla Vazio');
      const dora = await criarConta('Dora Vazio');
      await darApelido(carla, 'carla-vazio');
      await darApelido(dora, 'dora-vazio');
      await ligar(carla, dora, 'accepted');

      const repositorio = criarConnectionsRepository(db);

      // POR BAIXO DO ATALHO: a consulta roda com o vetor vazio.
      const comVazio = await repositorio.arestasPorApelido(carla, [], AGORA);
      assert.deepEqual(
        [...comVazio],
        [],
        'vetor vazio tem de devolver conjunto vazio. Devolver a aresta aqui significaria ' +
          'que o `= ANY` deixou de recortar -- e aí o estado de QUALQUER pessoa sairia na ' +
          'busca, de qualquer uma.',
      );

      // E O CONTRAPESO, na MESMA leitura: com o apelido de verdade a consulta
      // ACHA. Sem isto, o caso de cima passaria por a consulta nunca achar
      // nada -- que e o mesmo verde-por-vazio de sempre.
      const comApelido = await repositorio.arestasPorApelido(carla, ['dora-vazio-' + SUFIXO], AGORA);
      assert.equal(comApelido.length, 1, 'com o apelido certo, a consulta tem de achar a aresta');
      assert.equal(comApelido[0]?.apelido, `dora-vazio-${SUFIXO}`);
      assert.equal(comApelido[0]?.aresta.estado, 'accepted');

      // E o atalho do leitor nao consulta -- medido pelo resultado, nao pela
      // ausencia de chamada: mapa vazio, sem levantar.
      const leitor = criarLeitorDeConexao(repositorio);
      const mapa = await leitor.estadosPorApelido(carla, [], AGORA);
      assert.equal(mapa.size, 0);
    })();
  });

  /**
   * **A ISCA DE VAZAMENTO, EM EXECUÇÃO.** É o caso que o coordenador pediu, e
   * ele é diferente dos dois irmãos: em memória o recorte é um `filter` de
   * TypeScript, e no SQL compilado é um texto que ninguém executou. **Aqui o
   * `WHERE` de verdade corre no Postgres de verdade.**
   *
   * Dois pares disjuntos, e a asserção é o **par**: cada conta vê a própria
   * conexão (positivo) e nenhuma ponta do par alheio (negativo). Sem o lado
   * positivo, uma consulta que devolvesse vazio para todos passaria.
   */
  void it('ISCA DE VAZAMENTO em banco: a conta A não lê NADA da lista da conta B', () => {
    return (async () => {
      const a1 = await criarConta('A1 Vaza');
      const a2 = await criarConta('A2 Vaza');
      const b1 = await criarConta('B1 Vaza');
      const b2 = await criarConta('B2 Vaza');
      const ap1 = await darApelido(a1, 'a-um-vaza');
      const ap2 = await darApelido(a2, 'a-dois-vaza');
      const bp1 = await darApelido(b1, 'b-um-vaza');
      const bp2 = await darApelido(b2, 'b-dois-vaza');
      await ligar(a1, a2, 'accepted');
      await ligar(b1, b2, 'accepted');

      const deA1 = await listar(a1);
      const deB1 = await listar(b1);
      assert.equal(deA1.status, 200);
      assert.equal(deB1.status, 200);

      // O POSITIVO: cada uma ve a PROPRIA.
      assert.deepEqual([...apelidos(deA1.corpo)], [ap2], 'A1 vê a conexão DELA');
      assert.deepEqual([...apelidos(deB1.corpo)], [bp2], 'B1 vê a conexão DELA');

      // O NEGATIVO, na mesma leitura: nenhuma ponta do par alheio atravessa.
      for (const alheio of [bp1, bp2]) {
        assert.ok(
          !apelidos(deA1.corpo).includes(alheio),
          `\`${alheio}\` vazou para a lista de A1: o recorte por quem chama não está ` +
            'correndo no `WHERE`.',
        );
      }
      for (const alheio of [ap1, ap2]) {
        assert.ok(!apelidos(deB1.corpo).includes(alheio), `\`${alheio}\` vazou para B1`);
      }
      // E a propria conta nunca aparece na propria lista.
      assert.ok(!apelidos(deA1.corpo).includes(ap1));
      assert.equal(deA1.corpo['total'], 1, 'o total também é recortado, e não só a página');
    })();
  });

  /**
   * **`pending` e `declined` FORA, pela consulta real.** O predicado é
   * `c.state = 'accepted'`, e a asserção é o par: a aceita aparece, as outras
   * duas não — na mesma leitura, com as três semeadas.
   */
  void it('`pending` e `declined` não entram; só `accepted`', () => {
    return (async () => {
      const dono = await criarConta('Dono Estados');
      const aceita = await criarConta('Aceita');
      const pendente = await criarConta('Pendente');
      const recusada = await criarConta('Recusada');
      await darApelido(dono, 'dono-estados');
      const apAceita = await darApelido(aceita, 'aceita-est');
      const apPendente = await darApelido(pendente, 'pendente-est');
      const apRecusada = await darApelido(recusada, 'recusada-est');
      await ligar(dono, aceita, 'accepted');
      await ligar(dono, pendente, 'pending');
      await ligar(dono, recusada, 'declined');

      const r = await listar(dono);
      assert.equal(r.status, 200);
      assert.deepEqual([...apelidos(r.corpo)], [apAceita], 'só a aceita');
      assert.ok(!apelidos(r.corpo).includes(apPendente), 'pendente é das caixas de PEDIDOS');
      assert.ok(
        !apelidos(r.corpo).includes(apRecusada),
        'recusado não entra, e é indistinguível de nunca ter havido nada',
      );
      assert.equal(r.corpo['total'], 1);
    })();
  });

  /**
   * **CONTA DESABILITADA DE QUALQUER LADO FORA, pela consulta real** — decisão
   * do cliente de 17/10: conta desabilitada *"não é mais encontrada em nenhuma
   * página ou funcionalidade"*.
   *
   * Os **dois** lados são medidos, e os dois importam: `juncaoDaAresta` chama
   * `conta_habilitada` em `c.requester_user_id` **e** em
   * `c.addressee_user_id`, e um defeito que esquecesse um dos dois passaria
   * metade das vezes — dependendo de quem pediu.
   *
   * E **reabilitar devolve a conexão intacta**: a linha não é apagada.
   */
  void it('conta desabilitada sai da lista pelos DOIS lados, e reabilitar a devolve', () => {
    return (async () => {
      const dono = await criarConta('Dono Desab');
      // A conta que RECEBEU o pedido, e a que PEDIU: os dois papéis.
      const recebeu = await criarConta('Recebeu Desab');
      const pediu = await criarConta('Pediu Desab');
      await darApelido(dono, 'dono-desab');
      const apRecebeu = await darApelido(recebeu, 'recebeu-desab');
      const apPediu = await darApelido(pediu, 'pediu-desab');
      await ligar(dono, recebeu, 'accepted'); // dono é requester
      await ligar(pediu, dono, 'accepted'); // dono é addressee

      const antes = await listar(dono);
      assert.deepEqual(
        [...apelidos(antes.corpo)].sort(),
        [apPediu, apRecebeu].sort(),
        'as duas aparecem antes de qualquer desabilitação',
      );

      // O OUTRO LADO desabilitado, no papel de ADDRESSEE da aresta.
      await desabilitar(recebeu);
      const semRecebeu = await listar(dono);
      assert.deepEqual([...apelidos(semRecebeu.corpo)], [apPediu]);
      assert.equal(semRecebeu.corpo['total'], 1, 'o total cai junto');

      // E no papel de REQUESTER.
      await desabilitar(pediu);
      const semNinguem = await listar(dono);
      assert.deepEqual([...apelidos(semNinguem.corpo)], []);

      // E QUEM CHAMA desabilitado: a propria conta deixa de ler.
      await reabilitar(recebeu);
      await reabilitar(pediu);
      await desabilitar(dono);
      const donoDesabilitado = await listar(dono);
      assert.deepEqual(
        [...apelidos(donoDesabilitado.corpo)],
        [],
        'quem desabilitou a própria conta não lê ninguém: `conta_habilitada` vale para ' +
          'quem chama também',
      );

      // REABILITAR DEVOLVE AS DUAS: a linha nao foi apagada.
      await reabilitar(dono);
      const depois = await listar(dono);
      assert.deepEqual([...apelidos(depois.corpo)].sort(), [apPediu, apRecebeu].sort());
    })();
  });

  /**
   * **SEM APELIDO NÃO ENTRA**, e esta é a consequência do `IS NOT NULL` sobre a
   * costura de JSON. Cada linha é uma porta para o perfil, e uma linha sem
   * apelido seria uma porta que não abre.
   *
   * A asserção é o par: a conexão COM apelido aparece, a sem não — e o `total`
   * conta o mesmo conjunto que a página devolve, então a tela nunca promete uma
   * página que não existe.
   */
  void it('conexão SEM apelido não entra, e o `total` conta o mesmo conjunto', () => {
    return (async () => {
      const dono = await criarConta('Dono Sem Apelido');
      const comApelido = await criarConta('Com Apelido');
      const semApelido = await criarConta('Sem Apelido');
      await darApelido(dono, 'dono-semap');
      const ap = await darApelido(comApelido, 'tem-apelido');
      await ligar(dono, comApelido, 'accepted');
      await ligar(dono, semApelido, 'accepted');

      const r = await listar(dono);
      assert.deepEqual([...apelidos(r.corpo)], [ap]);
      assert.equal(
        r.corpo['total'],
        1,
        'o total vem da MESMA consulta que a página: duas consultas seriam duas chances ' +
          'de os predicados divergirem sem nada acusar',
      );
    })();
  });

  /**
   * **A FOTO QUE NÃO ESTÁ PRONTA SAI COMO NULO EXPLÍCITO.** O predicado é
   * `status = 'ready' AND thumb_key IS NOT NULL`, e ele mora na subconsulta — a
   * borda não tem como saber a diferença entre "não há foto" e "a foto não está
   * pronta", nem precisa.
   *
   * **A chave vem SEMPRE**: chave que aparece e desaparece faria o cliente
   * distinguir ausência de nulo sem que a diferença significasse algo.
   */
  void it('foto em `processing` sai como NULO, e a chave vem sempre', () => {
    return (async () => {
      const dono = await criarConta('Dono Foto');
      const processando = await criarConta('Processando');
      await darApelido(dono, 'dono-foto');
      await darApelido(processando, 'processando-f');
      await darFotoNaoPronta(processando);
      await ligar(dono, processando, 'accepted');

      const r = await listar(dono);
      const primeira = pessoas(r.corpo)[0] as PessoaDoCorpo;
      assert.equal(primeira.photo_icon_url, null);
      assert.ok(
        Object.prototype.hasOwnProperty.call(primeira, 'photo_icon_url'),
        'a chave tem de vir, com nulo',
      );
    })();
  });

  /**
   * **`page` e `limit` em execução**, e o `total` do conjunto inteiro.
   *
   * A ordenação é por nome e depois por apelido — a mesma da busca, e pelo
   * mesmo motivo de `handle` ser único: a ordem fica total, e a paginação não
   * repete nem perde linha entre páginas.
   */
  void it('`page` e `limit` pagina de verdade, sem repetir nem perder linha', () => {
    return (async () => {
      const dono = await criarConta('Dono Pagina');
      await darApelido(dono, 'dono-pagina');
      const esperados: string[] = [];
      for (const nome of ['Pag A', 'Pag B', 'Pag C']) {
        const conta = await criarConta(nome);
        esperados.push(await darApelido(conta, `pag-${nome.slice(-1).toLowerCase()}`));
        await ligar(dono, conta, 'accepted');
      }

      const p1 = await listar(dono, '?page=1&limit=2');
      const p2 = await listar(dono, '?page=2&limit=2');
      assert.equal(p1.corpo['total'], 3, 'o total é do CONJUNTO, não da página');
      assert.equal(p2.corpo['total'], 3);
      assert.equal(apelidos(p1.corpo).length, 2);
      assert.equal(apelidos(p2.corpo).length, 1);
      // NENHUMA REPETIDA e NENHUMA PERDIDA: a uniao das duas e o conjunto.
      assert.deepEqual(
        [...apelidos(p1.corpo), ...apelidos(p2.corpo)].sort(),
        [...esperados].sort(),
        'a paginação repetiu ou perdeu linha. A ordem é por nome e depois por apelido, e ' +
          '`handle` é único -- então ela é TOTAL.',
      );
      // **NÚMERO, e não cadeia** -- é o que o vigia de parâmetros garante, e foi
      // esta asserção que acusou a bancada sem ele.
      assert.equal(p1.corpo['page'], 1);
      assert.equal(typeof p1.corpo['page'], 'number');
      assert.equal(p1.corpo['limit'], 2);
      assert.equal(typeof p1.corpo['limit'], 'number');

      // E O TETO DO CONTRATO recusa na borda: `limit: 21` é pedido MALFORMADO,
      // e não incompleto -- ao contrário do piso de três caracteres da busca,
      // que o contrato marca com `x-nao-recusado-na-borda`.
      const acimaDoTeto = await listar(dono, '?limit=21');
      assert.equal(acimaDoTeto.status, 400, '`limit` acima de 20 é 400 na borda');
    })();
  });

  /**
   * **O TOTAL DA LISTA E `connected_count` NÃO DIVERGEM.** Os dois recortam
   * `accepted` com `conta_habilitada` nos dois lados, e a tela mostra os dois
   * juntos — *"Você tem N de 150 conexões"* ao lado da lista. Números
   * diferentes na mesma tela seriam dois predicados divergindo.
   */
  void it('o `total` da lista e `connected_count` do resumo contam o mesmo', () => {
    return (async () => {
      const dono = await criarConta('Dono Resumo');
      await darApelido(dono, 'dono-resumo');
      for (const nome of ['Res A', 'Res B']) {
        const conta = await criarConta(nome);
        await darApelido(conta, `res-${nome.slice(-1).toLowerCase()}`);
        await ligar(dono, conta, 'accepted');
      }

      const lista = await listar(dono);
      const resumo = await pedir(dono, '/v1/connections/summary');
      assert.equal(resumo.status, 200);
      assert.equal(lista.corpo['total'], 2);
      assert.equal(
        lista.corpo['total'],
        resumo.corpo['connected_count'],
        'a lista e o resumo contam conjuntos diferentes, e a tela mostra os dois juntos',
      );
    })();
  });

  /**
   * **NÃO EXISTE ENDEREÇO PARA A LISTA DE TERCEIRO**, e aqui isso se mede no
   * protocolo contra o servidor real: as quatro formas que alguém tentaria
   * respondem **404**, nunca 403 (ADR-0021).
   */
  void it('endereço de lista de TERCEIRO responde 404, e nunca 403', () => {
    return (async () => {
      const quem = await criarConta('Quem Tenta');
      const alvo = await criarConta('Alvo');
      await darApelido(quem, 'quem-tenta');
      const apAlvo = await darApelido(alvo, 'alvo-terc');
      await ligar(quem, alvo, 'accepted');

      for (const tentativa of [
        `/v1/connections/${apAlvo}`,
        `/v1/connections/${apAlvo}/connections`,
        `/v1/people/${apAlvo}/connections`,
        `/v1/connections/of/${apAlvo}`,
      ]) {
        const r = await pedir(quem, tentativa);
        assert.equal(
          r.status,
          404,
          `\`${tentativa}\` respondeu ${String(r.status)}: a lista de TERCEIRO continua ` +
            '"nunca", e a emenda de 22/10/2026 não a abriu.',
        );
      }
    })();
  });

  /**
   * **NENHUM IDENTIFICADOR INTERNO no JSON que SAIU DO BANCO** (ADR-0010 item
   * 6). A varredura é sobre o corpo inteiro e procura os VALORES — um campo
   * chamado `pessoa` que carregasse o UUID passaria por uma conferência de
   * nomes.
   *
   * E nenhum `ref` de aresta: desfazer mora no perfil, não na lista.
   */
  void it('nenhum UUID de conta nem `ref` de aresta aparece no corpo', () => {
    return (async () => {
      const dono = await criarConta('Dono Uuid');
      const outra = await criarConta('Outra Uuid');
      await darApelido(dono, 'dono-uuid');
      await darApelido(outra, 'outra-uuid');
      await ligar(dono, outra, 'accepted');

      const r = await listar(dono);
      const json = JSON.stringify(r.corpo);
      assert.ok(pessoas(r.corpo).length > 0, 'sem linha não há corpo a varrer');
      for (const conta of [dono, outra]) {
        assert.ok(!json.includes(conta), `o UUID de uma conta vazou: ${conta}`);
      }
      // E o `ref` da aresta, lido do banco para a varredura ser sobre o valor
      // REAL e nao sobre um que o caso inventou.
      const refs = await cliente.query<{ ref: string }>(
        `SELECT ref FROM user_connections
          WHERE requester_user_id = $1 OR addressee_user_id = $1`,
        [dono],
      );
      assert.ok(refs.rows.length > 0, 'a massa tem de ter a aresta');
      for (const { ref } of refs.rows) {
        assert.ok(!json.includes(ref), 'o `ref` da aresta vazou: desfazer mora no perfil');
      }
      // E `public_ref`, que existe em `PersonProfile` porque AQUELA tela
      // hospeda denunciar e bloquear -- e esta nao hospeda nenhuma das tres.
      const publicos = await cliente.query<{ public_ref: string }>(
        'SELECT public_ref FROM users WHERE id = $1',
        [outra],
      );
      assert.ok(!json.includes(publicos.rows[0]?.public_ref ?? 'x'), '`public_ref` vazou');
    })();
  });
});

void describe('`connection_state` na busca contra Postgres: o conserto do botão', () => {
  /**
   * **O CONSERTO DO DEFEITO QUE O CLIENTE RELATOU**, em banco e não em dublê:
   * *"após eu ter aceito, ainda aparece para solicitar conexão a um usuário que
   * ja foi adicionado e aceito"*.
   *
   * A cadeia inteira está no caminho: a busca (`kysely-busca-de-pessoas.ts`,
   * com os seis predicados e os dois índices trigrama), o
   * `LeitorDeConexao.estadosPorApelido` (SQL do módulo de conexão, com o `=
   * ANY` e a costura de JSON), a projeção `estadoNoApp` do domínio, e a
   * projeção da borda.
   *
   * **Com conexão aceita semeada, o resultado da busca diz `connected`.**
   */
  void it('CONTROLE POSITIVO: com conexão aceita, a busca devolve `connected`', () => {
    return (async () => {
      const quem = await criarConta('Quem Busca Est');
      const achada = await criarConta('Zuleica Estado');
      await darApelido(quem, 'quem-busca-e');
      const apAchada = await darApelido(achada, 'zuleica-est');
      await ligar(quem, achada, 'accepted');

      const r = await buscar(quem, 'Zuleica');
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      const encontrada = pessoas(r.corpo).find((p) => p.handle === apAchada);
      assert.ok(
        encontrada !== undefined,
        'a busca não achou a pessoa semeada. Sem ela, o caso do estado passaria por não ' +
          'ter olhado para nada -- e os índices trigrama são do banco.',
      );
      assert.equal(
        encontrada.connection_state,
        'connected',
        'é o conserto do defeito: sem este valor a tela desenha `Pedir conexão` ao lado ' +
          'de quem já aceitou.',
      );
      // E o conjunto de chaves passou a SEIS, com `connection_state` dentro.
      assert.deepEqual(Object.keys(encontrada).sort(), [
        'connection_state',
        'connections_count',
        'display_name',
        'handle',
        'pets_count',
        'photo_icon_url',
      ]);
    })();
  });

  /**
   * **`none` PARA QUEM NÃO É CONEXÃO**, e o contrapeso do caso de cima: sem
   * ele, aquele provaria só que a palavra `connected` aparece em algum lugar.
   *
   * As duas pessoas estão na MESMA página de resultado, de propósito: uma
   * implementação que atribuísse o estado pela posição — ou que o aplicasse a
   * todas as linhas — passaria com uma pessoa só e erraria aqui.
   */
  void it('na MESMA página, a conexão sai `connected` e a estranha sai `none`', () => {
    return (async () => {
      const quem = await criarConta('Quem Mistura');
      const conexao = await criarConta('Xavier Conexao');
      const estranha = await criarConta('Xavier Estranha');
      await darApelido(quem, 'quem-mistura');
      const apConexao = await darApelido(conexao, 'xavier-conex');
      const apEstranha = await darApelido(estranha, 'xavier-estra');
      await ligar(quem, conexao, 'accepted');

      const r = await buscar(quem, 'Xavier');
      assert.equal(r.status, 200);
      const lista = pessoas(r.corpo);
      assert.equal(lista.length, 2, 'as duas têm de estar na mesma página');
      assert.equal(
        lista.find((p) => p.handle === apConexao)?.connection_state,
        'connected',
      );
      assert.equal(
        lista.find((p) => p.handle === apEstranha)?.connection_state,
        'none',
        '`none` é a AUSÊNCIA de aresta que se projete, e ela não afirma nada sobre ninguém',
      );
    })();
  });

  /**
   * **OS DOIS PENDENTES, derivados de QUEM PEDIU** — e isto é o que prova que a
   * direção vem do SQL (`c.requester_user_id = quem.id`) e não de um palpite.
   *
   * A MESMA relação, lida pelos dois lados, tem de dar estados diferentes.
   */
  void it('pendente dá `pending_sent` para quem pediu e `pending_received` para quem recebeu', () => {
    return (async () => {
      const pediu = await criarConta('Yolanda Pediu');
      const recebeu = await criarConta('Yolanda Recebeu');
      const apPediu = await darApelido(pediu, 'yolanda-ped');
      const apRecebeu = await darApelido(recebeu, 'yolanda-rec');
      await ligar(pediu, recebeu, 'pending');

      const deQuemPediu = await buscar(pediu, 'Yolanda');
      const deQuemRecebeu = await buscar(recebeu, 'Yolanda');
      assert.equal(
        pessoas(deQuemPediu.corpo).find((p) => p.handle === apRecebeu)?.connection_state,
        'pending_sent',
      );
      assert.equal(
        pessoas(deQuemRecebeu.corpo).find((p) => p.handle === apPediu)?.connection_state,
        'pending_received',
        'a direção é DERIVADA no SQL por comparação com quem chama, e não guardada por leitor',
      );
    })();
  });

  /**
   * **A RECUSA CONTINUA SILENCIOSA, pela projeção real.**
   *
   * `declined` dentro da validade se projeta como `pending_sent` **para quem
   * pediu**, e **desaparece para quem recusou** — os dois pela mesma
   * `estadoNoApp`, que é a função do domínio e não uma segunda regra escrita em
   * SQL. É esta a propriedade que teria caído se eu tivesse derivado o estado
   * dentro da consulta.
   *
   * **`declined` não sai no corpo em nenhum dos dois lados.**
   */
  void it('recusado sai `pending_sent` para quem pediu e `none` para quem recusou', () => {
    return (async () => {
      const pediu = await criarConta('Wanda Pediu');
      const recusou = await criarConta('Wanda Recusou');
      const apPediu = await darApelido(pediu, 'wanda-pediu');
      const apRecusou = await darApelido(recusou, 'wanda-recus');
      await ligar(pediu, recusou, 'declined');

      const deQuemPediu = await buscar(pediu, 'Wanda');
      const deQuemRecusou = await buscar(recusou, 'Wanda');

      assert.equal(
        pessoas(deQuemPediu.corpo).find((p) => p.handle === apRecusou)?.connection_state,
        'pending_sent',
        'para quem pediu, a recusada se projeta como enviada até a validade passar -- é o ' +
          'que faz "ela recusou você" não existir',
      );
      assert.equal(
        pessoas(deQuemRecusou.corpo).find((p) => p.handle === apPediu)?.connection_state,
        'none',
        'quem recusou já decidiu, e guardar a recusa visível seria convidar a desfazê-la',
      );
      for (const corpo of [deQuemPediu.corpo, deQuemRecusou.corpo]) {
        assert.ok(
          !JSON.stringify(corpo).includes('declined'),
          '`declined` saiu no corpo. Ele NÃO existe em `connection_state`, e a recusa é ' +
            'silenciosa.',
        );
      }
    })();
  });

  /**
   * **A LISTA NÃO É RECONSTRUÍVEL PELA BUSCA, e o estado não a abre.**
   *
   * Era este o argumento original do contrato para omitir `connection_state`:
   * *"numa lista, vinte estados por requisição são o material de que uma lista
   * de conexões se faz do lado de fora"*. Ele caiu **para o próprio dono**, e
   * este caso mede o que NÃO caiu: o estado é sempre o par com **quem busca**,
   * e nunca a relação entre duas OUTRAS pessoas.
   *
   * Três contas: quem busca, e duas que são conexões **entre si** e de mais
   * ninguém. A busca de quem está de fora tem de dizer `none` para as duas —
   * mesmo elas sendo conexão uma da outra.
   */
  void it('o estado é sempre o par com QUEM BUSCA, nunca a relação entre dois terceiros', () => {
    return (async () => {
      const deFora = await criarConta('Vitor De Fora');
      const uma = await criarConta('Ursula Uma');
      const outra = await criarConta('Ursula Outra');
      await darApelido(deFora, 'vitor-fora');
      const apUma = await darApelido(uma, 'ursula-uma');
      const apOutra = await darApelido(outra, 'ursula-outr');
      // As DUAS sao conexao entre si, e nenhuma e conexao de quem busca.
      await ligar(uma, outra, 'accepted');

      const r = await buscar(deFora, 'Ursula');
      assert.equal(r.status, 200);
      const lista = pessoas(r.corpo);
      assert.equal(lista.length, 2, 'as duas têm de aparecer na busca');
      for (const apelido of [apUma, apOutra]) {
        assert.equal(
          lista.find((p) => p.handle === apelido)?.connection_state,
          'none',
          `\`${apelido}\` saiu com estado para quem NÃO é conexão dela. O estado é do par ` +
            'com quem busca, e a conexão entre dois terceiros não é assunto de ninguém.',
        );
      }
      // E a lista PROPRIA de quem esta de fora continua vazia: o estado na
      // busca nao abriu lista nenhuma.
      const minha = await listar(deFora);
      assert.deepEqual([...apelidos(minha.corpo)], []);
      assert.equal(minha.corpo['total'], 0);
    })();
  });

  /**
   * **CONTA DESABILITADA NÃO PRODUZ ESTADO**, e não precisa: ela também sai da
   * busca. O caso mede os dois juntos porque a conclusão é a soma deles — a
   * pessoa desaparece, e por isso não há botão errado a desenhar.
   */
  void it('conta desabilitada sai da busca, e por isso não produz estado nenhum', () => {
    return (async () => {
      const quem = await criarConta('Tadeu Busca');
      const saiu = await criarConta('Teodora Saiu');
      await darApelido(quem, 'tadeu-busca');
      const apSaiu = await darApelido(saiu, 'teodora-sai');
      await ligar(quem, saiu, 'accepted');

      const antes = await buscar(quem, 'Teodora');
      assert.ok(
        pessoas(antes.corpo).some((p) => p.handle === apSaiu),
        'a pessoa tem de aparecer antes de desabilitar, senão o caso não mede nada',
      );

      await desabilitar(saiu);
      const depois = await buscar(quem, 'Teodora');
      assert.deepEqual(
        [...apelidos(depois.corpo)],
        [],
        'conta desabilitada "não é mais encontrada em nenhuma página ou funcionalidade"',
      );
      await reabilitar(saiu);
    })();
  });
});
