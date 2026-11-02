/**
 * **`GET /v1/region/people` CONTRA POSTGRES DE VERDADE** — a listagem de
 * usuários da mesma região, por ADESÃO EXPLÍCITA (cliente, 02/11/2026:
 * *"trazer a listagem de usuarios que estao na mesma regiao dele e que as
 * pessoas podem adicionar"*).
 *
 * As duas escolhas dele, entre perguntas fechadas:
 *
 *  1. **só quem optar aparece**, com a adesão DESLIGADA por padrão. Ele recusou
 *     listar todo mundo **sabendo que a lista começa menor**;
 *  2. **o piso de 3 caracteres da busca FICA** — `searchPeople` não muda.
 *
 * ## Por que este arquivo é de integração, e o que o irmão unitário não alcança
 *
 * `people/adapters/persistence/lista-da-regiao-na-clausula-where.test.ts` lê o
 * SQL **compilado** e prova *onde* cada predicado mora. Ele não executa nada, e
 * três coisas desta fatia só existem no banco:
 *
 * | O que o SQL usa | Por que o typecheck não alcança |
 * |---|---|
 * | `texto_para_busca(...)` dos DOIS lados | é função do banco, `IMMUTABLE STRICT`. A **propagação do nulo** — cidade nula não casa nada — é semântica de SQL, e nenhum tipo a acusa |
 * | duas junções de `users` (`u` e `eu`) | o alias `eu` vive numa `sql` template. Se não alcançasse, o erro é `42P01` em execução |
 * | `region_listing_opted_in_at` | a coluna é da migração `20261102000001`. Um `tsc` verde sobre um banco sem a coluna é `42703` em execução |
 *
 * **Nenhum portão deste repositório confere o CORPO da resposta** (nem o
 * validador de contrato, que só olha o corpo da REQUISIÇÃO), então a única
 * forma de provar o que sai é montar o servidor de verdade, com o repositório
 * de verdade, contra o Postgres de verdade, e ler o JSON.
 *
 * ## O CONTROLE POSITIVO VEM PRIMEIRO, e aqui ele é obrigatório
 *
 * Esta listagem responde **página vazia** em quatro situações diferentes, de
 * propósito. Isso significa que *todo* caso negativo deste arquivo passaria numa
 * consulta que devolvesse vazio para tudo — um `WHERE` que não casa nada, ou uma
 * coluna inexistente engolida. Por isso o primeiro caso é o positivo, e cada
 * negativo afirma o PAR `(o que tem de aparecer apareceu, o que não podia não
 * apareceu)` na MESMA leitura.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, e o banco é derrubado no fim.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarConnectionsRepository } from '../../src/modules/connections/adapters/persistence/kysely-connections-repository.js';
import { criarLeitorDeConexao } from '../../src/modules/connections/application/leitor-de-conexao.js';
import { criarListaDaRegiaoRepository } from '../../src/modules/people/adapters/persistence/kysely-lista-da-regiao.js';
import { ListaDaRegiao } from '../../src/modules/people/application/lista-da-regiao.js';
import { registrarRotasDaListaDaRegiao } from '../../src/modules/people/adapters/http/lista-da-regiao-routes.js';
import { escoparRotas } from '../../src/shared/http/registrar-rota.js';
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarContadorEmMemoria } from '../../src/shared/http/rate-limit.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { AbsoluteUrl, Instant, PetId, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = 1_790_000_000_000 as Instant;

/**
 * O sufixo que torna os apelidos **e a cidade** desta execução únicos.
 *
 * O apelido porque `handles.handle` é único global e a suíte roda em banco
 * compartilhado. **A CIDADE pelo mesmo motivo, e este é o mais importante
 * aqui**: a listagem casa por cidade, e uma cidade fixa faria este arquivo ler
 * as contas semeadas pelos outros arquivos da suíte — o total deixaria de ser
 * previsível e os casos passariam a reprovar por massa alheia.
 */
const SUFIXO = randomBytes(3).toString('hex');

const CIDADE = `Vila Medida ${SUFIXO}`;
const UF = 'SP';

/** Outra cidade, no MESMO estado: é o par que prova que o estado não basta. */
const OUTRA_CIDADE = `Vila Vizinha ${SUFIXO}`;

/** A MESMA cidade, em OUTRO estado: o par que prova que a cidade não basta. */
const OUTRA_UF = 'MG';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let especie: string;
let porte: string;

const contasCriadas: UserId[] = [];
const apelidosCriados: string[] = [];

/** 22 símbolos, que é a forma que `users_public_ref_forma` cobra. */
function refPublica(): string {
  return randomUUID().replace(/-/g, '').slice(0, 22);
}

interface Semeadura {
  readonly nome: string | null;
  readonly cidade?: string | null;
  readonly uf?: string | null;
  /** Aderiu a aparecer na lista? **O padrão é NÃO**, como a decisão do cliente. */
  readonly aderiu?: boolean;
  /** Canal de contato confirmado? O padrão é SIM, para o caso medir uma coisa só. */
  readonly verificado?: boolean;
}

async function criarConta(base: string, s: Semeadura): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users
       (id, email, display_name, public_ref, email_verified_at,
        reference_city, reference_state, region_listing_opted_in_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      `regiao-${id}@${DOMINIO_DE_TESTE}`,
      s.nome,
      refPublica(),
      (s.verificado ?? true) ? new Date(Number(AGORA)) : null,
      s.cidade === undefined ? CIDADE : s.cidade,
      s.uf === undefined ? UF : s.uf,
      (s.aderiu ?? false) ? new Date(Number(AGORA)) : null,
    ],
  );
  contasCriadas.push(id);
  await darApelido(id, base);
  return id;
}

/**
 * O apelido, **nas DUAS tabelas**.
 *
 * O apelido entra duas vezes com casts explícitos, e isso não é estilo:
 * `handle` é `citext` e `handle_esqueleto(text)` recebe `text`. Com um `$1` nos
 * dois lugares o Postgres recusa com `42P08`.
 */
async function darApelido(conta: UserId, base: string): Promise<string> {
  const apelido = `${base}-${SUFIXO}`;
  // **A GUARDA DE FORMA, e ela existe porque a ausência dela custou uma
  // execução inteira.** `handles_formato` cobra
  // `^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$` — no MÁXIMO 20 caracteres —, e o sufixo
  // come 7 deles. Sem esta linha, uma base de 14 caracteres reprova com
  // `23514 handles_formato` no meio do `INSERT`, e a mensagem fala da restrição
  // e não da base: o caso parece defeito do produto. Medido em 02/11/2026, em
  // três casos deste arquivo de uma vez.
  assert.ok(
    apelido.length <= 20,
    `a base \`${base}\` mais o sufixo dá ${apelido.length} caracteres, e ` +
      '`handles_formato` para em 20. Encurte a base: o sufixo é obrigatório porque ' +
      '`handles.handle` é único global e a suíte roda em banco compartilhado.',
  );
  await cliente.query(
    `INSERT INTO handles (handle, handle_esqueleto, kind, user_id)
     VALUES ($1::citext, handle_esqueleto($2::text), 'pessoa', $3)`,
    [apelido, apelido, conta],
  );
  apelidosCriados.push(apelido);
  await cliente.query('UPDATE users SET handle = $1::citext WHERE id = $2', [apelido, conta]);
  return apelido;
}

/** Liga ou desliga a adesão. **É esta escrita que prova a revogação.** */
async function adesao(conta: UserId, ligada: boolean): Promise<void> {
  await cliente.query('UPDATE users SET region_listing_opted_in_at = $1 WHERE id = $2', [
    ligada ? new Date(Number(AGORA)) : null,
    conta,
  ]);
}

async function criarPet(dono: UserId, nome: string): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [id, dono, nome, especie, porte],
  );
  return id;
}

async function ligarConexao(
  requester: UserId,
  addressee: UserId,
  state: 'pending' | 'accepted',
): Promise<void> {
  const [baixo, alto] = requester < addressee ? [requester, addressee] : [addressee, requester];
  await cliente.query(
    `INSERT INTO user_connections
       (id, ref, requester_user_id, addressee_user_id, pair_low, pair_high,
        state, origin, expires_at, responded_at, rest_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'anchored_case', now() + interval '30 days',
             CASE WHEN $7 = 'pending' THEN NULL ELSE now() END, NULL)`,
    [randomUUID(), refPublica(), requester, addressee, baixo, alto, state],
  );
}

async function bloquear(quem: UserId, bloqueado: UserId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    'INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id) VALUES ($1,$2,$3)',
    [id, quem, bloqueado],
  );
  return id;
}

async function desbloquear(id: string): Promise<void> {
  await cliente.query('DELETE FROM user_blocks WHERE id = $1', [id]);
}

async function desabilitar(conta: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [conta]);
}

async function reabilitar(conta: UserId): Promise<void> {
  await cliente.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [conta]);
}

interface Resposta {
  readonly status: number;
  readonly cabecalhos: Record<string, unknown>;
  readonly corpo: Record<string, unknown>;
}

interface PessoaDoCorpo {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: number;
  readonly connections_count: number;
  readonly connection_state: string;
}

/**
 * O SERVIDOR DE VERDADE, com a rota, o repositório, o Kysely e o Postgres
 * reais. **Só a autenticação é dublada.**
 *
 * A PORTA DE CONEXÃO É A DE VERDADE (`criarLeitorDeConexao`), e não um dublê: é
 * ela que faz o `connection_state` de cada item atravessar SQL do módulo de
 * conexão lido pelo módulo de pessoas. Com um dublê, a costura entre os dois
 * módulos — que é o que mais quebra aqui — não seria medida.
 */
async function servidorPara(quemChama: UserId) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const contrato = carregarContrato('api/openapi.yaml');
  // **O VIGIA DE PARÂMETROS, que a produção instala — e sem ele esta bancada
  // mediria outra coisa**: a query chega como texto, e sem o vigia `page=2`
  // volta no corpo como cadeia em vez de inteiro. Medido em outra bancada desta
  // suíte, e registrado lá: *"bancada sem a fiação que produção tem"*.
  vigiarParametrosDasRotas(app, contrato, '/v1');
  await escoparRotas(app, '/v1', (escopo) => {
    registrarRotasDaListaDaRegiao(escopo, {
      lista: new ListaDaRegiao({
        lista: criarListaDaRegiaoRepository(db),
        conexoes: criarLeitorDeConexao(criarConnectionsRepository(db)),
        clock: { now: () => AGORA },
      }),
      autenticador: { autenticar: () => Promise.resolve({ userId: quemChama }) },
    });
  });
  return app;
}

async function listar(quemChama: UserId, consulta = ''): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url: `/v1/region/people${consulta}`,
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return {
    status: r.statusCode,
    cabecalhos: r.headers,
    corpo: JSON.parse(r.body) as Record<string, unknown>,
  };
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
  // A ORDEM NÃO É ARBITRÁRIA: `handles.user_id` é `ON DELETE SET NULL` e
  // `handles_pessoa_tem_dono` proíbe `kind = 'pessoa'` sem dono. E
  // `users.handle` é FK para `handles.handle`, então a coluna sai PRIMEIRO.
  if (contasCriadas.length > 0) {
    await cliente.query('UPDATE users SET handle = NULL WHERE id = ANY($1::uuid[])', [
      contasCriadas,
    ]);
  }
  if (apelidosCriados.length > 0) {
    await cliente.query('DELETE FROM handles WHERE handle = ANY($1::citext[])', [apelidosCriados]);
  }
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('a listagem da região: o CONTROLE POSITIVO', () => {
  void it('quem aderiu VÊ quem aderiu na mesma cidade, com os cinco campos', async () => {
    const eu = await criarConta('eu-positivo', { nome: 'Eu Positivo', aderiu: true });
    const vizinha = await criarConta('vizinha-ade', { nome: 'Ana Vizinha', aderiu: true });
    await criarPet(vizinha, 'Rex');
    await criarPet(vizinha, 'Mel');
    await ligarConexao(vizinha, eu, 'pending');

    const r = await listar(eu);
    assert.equal(r.status, 200);
    assert.ok(
      apelidos(r.corpo).includes(`vizinha-ade-${SUFIXO}`),
      'a vizinha que ADERIU não apareceu. Sem este caso, todos os negativos deste ' +
        'arquivo passariam numa consulta que devolve vazio para tudo.',
    );

    const dela = pessoas(r.corpo).find((p) => p.handle === `vizinha-ade-${SUFIXO}`);
    assert.ok(dela !== undefined);
    assert.equal(dela.display_name, 'Ana Vizinha');
    assert.equal(dela.pets_count, 2, 'a contagem de pets não veio do banco');
    assert.equal(dela.connections_count, 0, 'pendente NÃO é conexão aceita');
    assert.equal(
      dela.connection_state,
      'pending_received',
      'o estado do par não atravessou a porta de conexão: ela pediu, e eu recebi',
    );
    assert.deepEqual(
      Object.keys(dela).sort(),
      ['connection_state', 'connections_count', 'display_name', 'handle', 'pets_count'],
      '`RegionPerson` é fechado em CINCO campos. Um campo a mais aqui é um campo a mais ' +
        'na resposta, e `photo_icon_url` em particular é o que esta lista não tem.',
    );
  });

  void it('a resposta sai com `private, no-store`, porque desligar vale na hora', async () => {
    const eu = await criarConta('eu-nostore', { nome: 'Eu Cache', aderiu: true });
    const r = await listar(eu);
    assert.equal(
      r.cabecalhos['cache-control'],
      'private, no-store',
      'uma resposta guardada manteria na tela de alguém uma pessoa que acabou de sair ' +
        'da lista — e a adesão é revogável',
    );
  });
});

void describe('A ADESÃO É REVOGÁVEL, E DESLIGAR VALE NA HORA', () => {
  void it('liga: aparece. desliga: NÃO aparece mais. liga de novo: volta', async () => {
    const eu = await criarConta('eu-revoga', { nome: 'Eu Revoga', aderiu: true });
    const ela = await criarConta('ela-revoga', { nome: 'Ela Revoga', aderiu: false });
    const alvo = `ela-revoga-${SUFIXO}`;

    const desligada = await listar(eu);
    assert.ok(
      !apelidos(desligada.corpo).includes(alvo),
      'a adesão nasce DESLIGADA (decisão do cliente), e quem não ligou não aparece',
    );

    await adesao(ela, true);
    const ligada = await listar(eu);
    assert.ok(
      apelidos(ligada.corpo).includes(alvo),
      'ligar a adesão não a fez aparecer: o predicado não está sendo lido na consulta',
    );

    await adesao(ela, false);
    const revogada = await listar(eu);
    assert.ok(
      !apelidos(revogada.corpo).includes(alvo),
      'DESLIGAR NÃO VALEU: a pessoa continuou na lista depois de revogar a adesão. ' +
        'O predicado é lido na consulta a cada requisição, e a resposta sai `no-store` ' +
        'justamente para que não haja onde uma lista velha sobreviver.',
    );

    await adesao(ela, true);
    assert.ok(
      apelidos((await listar(eu)).corpo).includes(alvo),
      'religar não a trouxe de volta: a revogação apagou mais do que a escolha',
    );
  });

  void it('RECIPROCIDADE: quem NÃO aderiu recebe página vazia (recomendação reversível)', async () => {
    const eu = await criarConta('eu-sem-adesao', { nome: 'Eu Sem Adesão', aderiu: false });
    await criarConta('tem-adesao', { nome: 'Tem Adesão', aderiu: true });

    const vazia = await listar(eu);
    assert.equal(vazia.status, 200, 'é página vazia e NUNCA 403: 403 seria o oráculo que ' +
      'diz "existe gente aí, mas não para você"');
    assert.equal(pessoas(vazia.corpo).length, 0);
    assert.equal(vazia.corpo['total'], 0);

    // E O PAR, na mesma massa: ligando a MINHA adesão, a lista aparece. Sem esta
    // metade, o caso acima passaria numa consulta que devolve vazio para tudo.
    await adesao(eu, true);
    const cheia = await listar(eu);
    assert.ok(
      apelidos(cheia.corpo).includes(`tem-adesao-${SUFIXO}`),
      'ligar a MINHA adesão não me deu a lista: o predicado de reciprocidade não é o que ' +
        'está filtrando, e o vazio acima vinha de outro lugar',
    );
  });
});

void describe('os outros predicados, cada um com o seu PAR', () => {
  void it('REGIÃO: outra cidade não entra, e outro estado na mesma cidade também não', async () => {
    const eu = await criarConta('eu-regiao', { nome: 'Eu Região', aderiu: true });
    await criarConta('mesma-cidade', { nome: 'Mesma Cidade', aderiu: true });
    await criarConta('outra-cidade', {
      nome: 'Outra Cidade',
      aderiu: true,
      cidade: OUTRA_CIDADE,
    });
    await criarConta('outro-estado', { nome: 'Outro Estado', aderiu: true, uf: OUTRA_UF });

    const r = await listar(eu);
    const vistos = apelidos(r.corpo);
    assert.ok(vistos.includes(`mesma-cidade-${SUFIXO}`), 'a conta da MESMA região não apareceu');
    assert.ok(
      !vistos.includes(`outra-cidade-${SUFIXO}`),
      'uma conta de OUTRA cidade entrou na lista',
    );
    assert.ok(
      !vistos.includes(`outro-estado-${SUFIXO}`),
      'uma conta da MESMA cidade em OUTRO estado entrou: há muitas `Santa Maria` no ' +
        'Brasil, e é por isso que o predicado é cidade E estado',
    );
  });

  void it('SEM REGIÃO: quem não tem cidade não aparece, e quem não tem cidade não vê', async () => {
    const semCidade = await criarConta('sem-cidade', {
      nome: 'Sem Cidade',
      aderiu: true,
      cidade: null,
    });
    const eu = await criarConta('eu-com-cidade', { nome: 'Eu Com Cidade', aderiu: true });
    await criarConta('com-cidade', { nome: 'Com Cidade', aderiu: true });

    const minha = await listar(eu);
    assert.ok(
      apelidos(minha.corpo).includes(`com-cidade-${SUFIXO}`),
      'o par positivo falhou: a lista está vazia por outro motivo',
    );
    assert.ok(
      !apelidos(minha.corpo).includes(`sem-cidade-${SUFIXO}`),
      'quem não tem cidade apareceu. `texto_para_busca` é STRICT: nulo devolve nulo, e ' +
        '`NULL = NULL` não é verdadeiro — este caso mede essa propagação, que nenhum ' +
        'tipo do TypeScript acusa',
    );

    const dela = await listar(semCidade);
    assert.equal(
      pessoas(dela.corpo).length,
      0,
      'quem não tem região de referência recebeu alguém: sem cidade não há com o que casar',
    );
  });

  void it('VERIFICADO: conta sem canal de contato confirmado não aparece', async () => {
    const eu = await criarConta('eu-verif', { nome: 'Eu Verificado', aderiu: true });
    await criarConta('nao-verif', { nome: 'Não Verificado', aderiu: true, verificado: false });
    await criarConta('sim-verif', { nome: 'Sim Verificado', aderiu: true });

    const vistos = apelidos((await listar(eu)).corpo);
    assert.ok(vistos.includes(`sim-verif-${SUFIXO}`), 'o par positivo falhou');
    assert.ok(
      !vistos.includes(`nao-verif-${SUFIXO}`),
      'conta sem canal de contato confirmado entrou na lista. A régua é a MESMA do selo ' +
        '(`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), numa fonte só',
    );
  });

  void it('VERIFICADO de QUEM OLHA: conta não verificada não vê a lista', async () => {
    const eu = await criarConta('eu-nao-verif', {
      nome: 'Eu Não Verificado',
      aderiu: true,
      verificado: false,
    });
    await criarConta('tem-verif-par', { nome: 'Tem Verificado', aderiu: true });

    assert.equal(
      pessoas((await listar(eu)).corpo).length,
      0,
      'uma conta não verificada leu a lista: a régua vale nos DOIS lados',
    );

    // O PAR: verificando a MINHA conta, a lista aparece.
    await cliente.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [eu]);
    assert.ok(
      apelidos((await listar(eu)).corpo).includes(`tem-verif-par-${SUFIXO}`),
      'verificar a minha conta não me deu a lista: o vazio acima vinha de outro lugar',
    );
  });

  void it('CONTA DESABILITADA: não aparece, e reabilitada volta', async () => {
    const eu = await criarConta('eu-habil', { nome: 'Eu Habilitado', aderiu: true });
    const dela = await criarConta('sera-desab', { nome: 'Será Desabilitada', aderiu: true });
    const alvo = `sera-desab-${SUFIXO}`;

    assert.ok(apelidos((await listar(eu)).corpo).includes(alvo), 'o par positivo falhou');

    await desabilitar(dela);
    assert.ok(
      !apelidos((await listar(eu)).corpo).includes(alvo),
      'conta desabilitada apareceu. Decisão de 17/10/2026: ela *não é mais encontrada em ' +
        'nenhuma página ou funcionalidade*, e ser listado é literalmente ser encontrado',
    );

    await reabilitar(dela);
    assert.ok(
      apelidos((await listar(eu)).corpo).includes(alvo),
      'reabilitar não a trouxe de volta: o predicado não é `deleted_at`',
    );
  });

  void it('CONTA DESABILITADA de quem olha: ela não lê a lista', async () => {
    const eu = await criarConta('eu-sera-desab', { nome: 'Eu Desabilitado', aderiu: true });
    await criarConta('outra-habil', { nome: 'Outra Habilitada', aderiu: true });

    assert.ok(
      apelidos((await listar(eu)).corpo).includes(`outra-habil-${SUFIXO}`),
      'o par positivo falhou',
    );
    await desabilitar(eu);
    assert.equal(
      pessoas((await listar(eu)).corpo).length,
      0,
      'conta desabilitada leu a lista: `conta_habilitada` entra nos DOIS lados',
    );
    await reabilitar(eu);
  });

  void it('BLOQUEIO: filtra NOS DOIS SENTIDOS, e desbloquear devolve', async () => {
    const eu = await criarConta('eu-bloqueio', { nome: 'Eu Bloqueio', aderiu: true });
    const euBloqueio = await criarConta('eu-bloqueei', { nome: 'Eu Bloqueei', aderiu: true });
    const meBloqueou = await criarConta('me-bloqueou', { nome: 'Me Bloqueou', aderiu: true });

    const antes = apelidos((await listar(eu)).corpo);
    assert.ok(antes.includes(`eu-bloqueei-${SUFIXO}`), 'o par positivo falhou (sentido 1)');
    assert.ok(antes.includes(`me-bloqueou-${SUFIXO}`), 'o par positivo falhou (sentido 2)');

    const b1 = await bloquear(eu, euBloqueio);
    const b2 = await bloquear(meBloqueou, eu);

    const depois = apelidos((await listar(eu)).corpo);
    assert.ok(
      !depois.includes(`eu-bloqueei-${SUFIXO}`),
      'quem EU bloqueei continuou na minha lista',
    );
    assert.ok(
      !depois.includes(`me-bloqueou-${SUFIXO}`),
      'quem ME bloqueou continuou na minha lista. `bloqueio_entre` é SIMÉTRICA de ' +
        'propósito: sem a simetria, quem foi bloqueado continuaria vendo quem o ' +
        'bloqueou — que é a situação de quem bloqueia por estar sendo perseguido',
    );

    await desbloquear(b1);
    await desbloquear(b2);
    const voltou = apelidos((await listar(eu)).corpo);
    assert.ok(voltou.includes(`eu-bloqueei-${SUFIXO}`), 'desbloquear não devolveu (sentido 1)');
    assert.ok(voltou.includes(`me-bloqueou-${SUFIXO}`), 'desbloquear não devolveu (sentido 2)');
  });

  void it('QUEM OLHA NÃO APARECE PARA SI MESMO', async () => {
    const eu = await criarConta('eu-nao-vejo', { nome: 'Eu Não Me Vejo', aderiu: true });
    await criarConta('outra-me-vejo', { nome: 'Outra', aderiu: true });

    const vistos = apelidos((await listar(eu)).corpo);
    assert.ok(vistos.includes(`outra-me-vejo-${SUFIXO}`), 'o par positivo falhou');
    assert.ok(
      !vistos.includes(`eu-nao-vejo-${SUFIXO}`),
      'eu apareci na minha própria lista: a conta não se conecta consigo mesma, e o ' +
        'único botão de um item é `Pedir conexão`',
    );
  });

  void it('`connection_state` vem de conexão ACEITA, e `connections_count` a conta', async () => {
    const eu = await criarConta('eu-estado', { nome: 'Eu Estado', aderiu: true });
    const conectada = await criarConta('conectada-est', { nome: 'Conectada', aderiu: true });
    await ligarConexao(eu, conectada, 'accepted');

    const dela = pessoas((await listar(eu)).corpo).find(
      (p) => p.handle === `conectada-est-${SUFIXO}`,
    );
    assert.ok(dela !== undefined, 'a conexão aceita saiu da lista: aceitar não tira ninguém dela');
    assert.equal(
      dela.connection_state,
      'connected',
      'o estado não chegou: sem ele a lista desenharia `Pedir conexão` ao lado de quem ' +
        'já é conexão aceita, que é o defeito que o cliente relatou em 22/10/2026',
    );
    assert.equal(dela.connections_count, 1, 'a contagem de conexões aceitas não veio do banco');
  });
});

void describe('a paginação, e o total que a acompanha', () => {
  void it('`page` e `limit` são INTEIROS no corpo, e o total é o do conjunto inteiro', async () => {
    const eu = await criarConta('eu-pagina', { nome: 'Eu Página', aderiu: true });
    await criarConta('pag-a', { nome: 'A Primeira', aderiu: true });
    await criarConta('pag-b', { nome: 'B Segunda', aderiu: true });
    await criarConta('pag-c', { nome: 'C Terceira', aderiu: true });

    const primeira = await listar(eu, '?page=1&limit=2');
    assert.equal(primeira.corpo['page'], 1, '`page` voltou como CADEIA: o vigia de parâmetros ' +
      'não converteu, e esta bancada deixou de ter a fiação que produção tem');
    assert.equal(primeira.corpo['limit'], 2);
    assert.equal(pessoas(primeira.corpo).length, 2, 'o teto da página não foi respeitado');
    assert.ok(
      (primeira.corpo['total'] as number) >= 3,
      'o total conta o conjunto INTEIRO e não a página: ele sai da MESMA consulta, por ' +
        '`count(*) OVER ()`',
    );

    const segunda = await listar(eu, '?page=2&limit=2');
    assert.equal(segunda.corpo['page'], 2);
    assert.equal(
      segunda.corpo['total'],
      primeira.corpo['total'],
      'o total mudou entre páginas da MESMA massa: página e total discordando é o que ' +
        'duas consultas separadas produziriam',
    );
    const daPrimeira = new Set(apelidos(primeira.corpo));
    for (const a of apelidos(segunda.corpo)) {
      assert.ok(!daPrimeira.has(a), `\`${a}\` apareceu nas DUAS páginas: o deslocamento não andou`);
    }
  });

  void it('a ordem é NOME e depois apelido, e nunca bairro', async () => {
    const eu = await criarConta('eu-ordem', { nome: 'Eu Ordem', aderiu: true });
    // **OS DOIS NOMES CAEM NO TOPO DA PRIMEIRA PÁGINA DE PROPÓSITO, e isto não
    // é estilo.** A primeira versão deste caso usava `Abel` e `Zulmira`, e
    // reprovou: a esta altura o arquivo já semeou mais de trinta contas na
    // MESMA cidade, a página é de 20, e `Zulmira` caiu fora dela — o caso
    // acusava a ordem quando o que faltava era a página. `Aaa`/`Aab` ficam nas
    // primeiras posições sob qualquer colação, e a ordem relativa entre eles é
    // o que este caso mede.
    await criarConta('ord-z', { nome: 'Aab Ordem', aderiu: true });
    await criarConta('ord-a', { nome: 'Aaa Ordem', aderiu: true });

    const nomes = pessoas((await listar(eu)).corpo)
      .map((p) => p.display_name)
      .filter((n): n is string => n !== null && n.endsWith(' Ordem'));
    assert.deepEqual(
      nomes,
      ['Aaa Ordem', 'Aab Ordem'],
      'a ordem não é por nome ascendente. Ela é a MESMA da busca, e NÃO é por bairro: ' +
        'ordenar por bairro entregaria o bairro pela POSIÇÃO mesmo sem campo de bairro ' +
        'na resposta',
    );
  });
});
