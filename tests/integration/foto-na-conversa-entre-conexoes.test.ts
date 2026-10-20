/**
 * **O CORPO REAL DA RESPOSTA, nos cinco estados da emenda 3 do ADR-0010.**
 *
 * ## Por que este arquivo existe, e por que ele é de integração
 *
 * Decisão do cliente, 19/10/2026: *"a foto aparece SÓ quando as duas pessoas já
 * aceitaram conexão"*. Em conversa de achado com um estranho, e em qualquer
 * conversa com quem não é conexão aceita, ela **não** aparece.
 *
 * **Nenhum portão deste repositório confere o CORPO da resposta.** O validador
 * de contrato confere o corpo da REQUISIÇÃO; a resposta sai como a borda a
 * monta, e um campo a mais nela não reprova nada. Então a única forma de provar
 * o que sai é **montar o servidor de verdade, com o repositório de verdade,
 * contra o Postgres de verdade, e ler o JSON**. É o que este arquivo faz, e é
 * daqui que saem os corpos colados no relatório da entrega.
 *
 * `adapters/persistence/conexao-aceita-na-clausula-where.test.ts` é o irmão
 * unitário: ele lê o SQL compilado e prova **onde** o predicado mora. Ele não
 * executa nada. Os dois são necessários, e nenhum substitui o outro:
 *
 * - o unitário reprova o `if` que substituísse a cláusula `WHERE` — o SQL
 *   mudaria. Mas ele passaria num mundo em que o Postgres interpretasse o
 *   predicado de outro jeito, ou em que a borda descartasse o campo;
 * - este reprova o campo que não sai, o que sai errado e o que sai para quem
 *   não devia. Mas ele passaria com a decisão num `if` da aplicação — e aí o
 *   próximo caminho que esquecesse o `if` vazaria.
 *
 * ## Os dois sentidos do par, e por que eles não são simetria decorativa
 *
 * O caso de conexão aceita é medido **nas duas direções**: o tutor lendo a
 * conversa e o achador com conta lendo a MESMA conversa. Um defeito que
 * atribuísse a foto sempre ao item `finder` passaria por um lado e desenharia,
 * pelo outro, a foto de uma pessoa como se fosse de outra.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose sai do caminho do worktree e o banco
 * é derrubado com `-v` no fim.
 *
 * ## A massa escreve `users.public_ref` à mão, de propósito
 *
 * A coluna é `NOT NULL` **sem `DEFAULT`** (`20261018000031`): a aplicação a
 * sorteia no `INSERT`. Toda fixture que a omite morre com violação de `NOT
 * NULL`, e isso é uma das causas-raiz que outra frente está consertando nas
 * massas antigas desta suíte. Aqui ela é escrita, e por isso este arquivo não
 * depende daquele conserto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarConversationRepository } from '../../src/modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import { ConversationService } from '../../src/modules/messaging/application/conversation-service.js';
import { registrarRotasDeConversas } from '../../src/modules/messaging/adapters/http/conversation-routes.js';
import { escoparRotas } from '../../src/shared/http/registrar-rota.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarContadorEmMemoria } from '../../src/shared/http/rate-limit.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { Idempotencia } from '../../src/shared/http/idempotency.js';
import type { AuditLog } from '../../src/modules/audit/ports/audit-log.js';
import type {
  AbsoluteUrl,
  ConversationId,
  OpaqueToken,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DE_MIDIA = 'https://midia.bichu.test' as AbsoluteUrl;
const AGORA = 1_790_000_000_000 as Instant;

/** O alfabeto de `pet_tags.code_suffix`: base32 de Crockford. */
const ALFABETO_DA_PLAQUINHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let especie: string;
let porte: string;
const contasCriadas: UserId[] = [];
const avisosCriados: FoundReportId[] = [];
const apelidosCriados: string[] = [];
const imagensCriadas: string[] = [];

/** 22 símbolos de base64url, que é a forma que `users_public_ref_forma` cobra. */
function refPublica(): string {
  return randomUUID().replace(/-/g, '').slice(0, 22);
}

async function criarConta(nome: string | null): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    'INSERT INTO users (id, email, display_name, public_ref) VALUES ($1, $2, $3, $4)',
    [id, `emenda3-${id}@${DOMINIO_DE_TESTE}`, nome, refPublica()],
  );
  contasCriadas.push(id);
  return id;
}

/** O apelido da pessoa: é ele que dá endereço ao toque no ícone. */
async function darApelido(conta: UserId, apelido: string): Promise<string> {
  // O APELIDO ENTRA DUAS VEZES, com casts explicitos, e isso nao e estilo:
  // `handle` e `citext` e `handle_esqueleto(text)` recebe `text`. Com um `$1`
  // nos dois lugares o Postgres recusa a sentenca inteira com
  // `42P08 inconsistent types deduced for parameter $1` -- medido.
  await cliente.query(
    `INSERT INTO handles (handle, handle_esqueleto, kind, user_id)
     VALUES ($1::citext, handle_esqueleto($2::text), 'pessoa', $3)`,
    [apelido, apelido, conta],
  );
  apelidosCriados.push(apelido);
  return apelido;
}

/**
 * A foto da pessoa, PRONTA, com as duas derivadas.
 *
 * `purpose = 'user_photo'` e `thumb_key` preenchida: é a `thumb` de 176 px que
 * o ícone da conversa pede. `public_key` (a `card` de 512) também entra, e é de
 * propósito — se a consulta trocasse de derivada, o caso abaixo acusaria pela
 * URL, e não por ausência de valor.
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

async function criarPet(dono: UserId, nome: string): Promise<PetId> {
  const id = randomUUID() as PetId;
  await cliente.query(
    'INSERT INTO pets (id, owner_user_id, name, species_code, size_code) VALUES ($1,$2,$3,$4,$5)',
    [id, dono, nome, especie, porte],
  );
  return id;
}

async function criarPlaquinha(pet: PetId): Promise<string> {
  const id = randomUUID();
  const resumo = createHash('sha256').update(`tag-${id}`).digest();
  const sufixo = [...resumo.subarray(0, 4)]
    .map((b) => ALFABETO_DA_PLAQUINHA[b % ALFABETO_DA_PLAQUINHA.length])
    .join('');
  await cliente.query(
    'INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix) VALUES ($1,$2,$3,$4)',
    [id, pet, resumo, sufixo],
  );
  return id;
}

/**
 * A conversa DE ACHADO, que é a única espécie de conversa que existe.
 *
 * **Toda conversa deste produto nasce de um aviso** (`conversations.found_report_id`
 * é `NOT NULL` e `UNIQUE`): não há `POST /conversations` e não há mensagem direta
 * entre desconhecidos. É por isso que "conversa de achado" não é um recorte a
 * mais sobre "não é conexão" — é o mesmo conjunto, mais a interseção em que as
 * duas pessoas por acaso já se aceitaram.
 */
async function abrirConversaDeAchado(
  pet: PetId,
  achadorComConta: UserId | null,
  nomeDoAchador: string | null,
): Promise<ConversationId> {
  const aviso = randomUUID() as FoundReportId;
  const tag = await criarPlaquinha(pet);
  await cliente.query(
    `INSERT INTO found_reports
       (id, origin, tag_id, pet_id, finder_display_name,
        finder_token_hash, finder_token_expires_at, found_at)
     VALUES ($1, 'tag_scan', $2, $3, $4, $5, now() + interval '30 days', now())`,
    [aviso, tag, pet, nomeDoAchador, createHash('sha256').update(aviso).digest()],
  );
  avisosCriados.push(aviso);
  const conversa = randomUUID() as ConversationId;
  await cliente.query(
    `INSERT INTO conversations (id, found_report_id, pet_id, tutor_user_id, finder_user_id)
     SELECT $1, $2, p.id, p.owner_user_id, $3 FROM pets p WHERE p.id = $4`,
    [conversa, aviso, achadorComConta, pet],
  );
  return conversa;
}

/** A idempotência não é exercida aqui: nenhuma rota de LEITURA a usa. */
const idempotenciaInerte: Idempotencia = {
  reservar: () => Promise.resolve(undefined),
  concluir: () => Promise.resolve(),
  liberar: () => Promise.resolve(),
};

const trilhaInerte = {
  registrar: () => Promise.resolve(),
} as unknown as AuditLog;

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

interface Participante {
  readonly role: string;
  readonly display_name: string;
  readonly handle: string | null;
  readonly photo_icon_url: string | null;
}

/**
 * O SERVIDOR DE VERDADE, com as rotas de verdade e o repositório de verdade.
 *
 * `quemChama` entra pelo autenticador: a rota lê o `Bearer`, e o dublê de
 * autenticação devolve a conta que o token nomeia. Nada mais é dublado — o
 * serviço, o repositório, o Kysely, o Postgres e a projeção da borda são os
 * reais, e é essa cadeia inteira que precisa estar no caminho para o corpo
 * medido ser o corpo servido.
 */
async function servidorPara(quemChama: UserId) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  // `escoparRotas` com o MESMO prefixo de `api.ts`, e nao registro na raiz.
  //
  // Medido: registrando na raiz, `GET /v1/conversations/{id}` responde **404
  // do Fastify** -- rota inexistente --, e o caso passa a medir o 404 errado.
  // Os dois 404 deste produto sao indistinguiveis de fora de propósito
  // (ADR-0021), e e exatamente por isso que uma bancada que erre o prefixo
  // fica verde em todo caso de ausencia e vermelha em todo caso de presenca,
  // sem dizer por que.
  await escoparRotas(app, '/v1', (escopo) => {
  registrarRotasDeConversas(escopo, {
    conversas: new ConversationService({
      repositorio: criarConversationRepository(db),
      // O gerador de ids NÃO é exercido por nenhuma das duas LEITURAS. Ele está
      // aqui porque o serviço o exige no construtor, e um objeto completo é mais
      // honesto do que uma marca de tipo: se um caminho de leitura passar a
      // gerar id, o valor que sai daqui é real.
      ids: {
        uuidv7: () => randomUUID(),
        opaqueToken: () => refPublica() as unknown as OpaqueToken,
        random128: () => randomBytes(16),
        random80: () => randomBytes(10),
      },
      clock: { now: () => AGORA },
      trilha: trilhaInerte,
    }),
    autenticador: { autenticar: () => Promise.resolve({ userId: quemChama }) },
    contrato: carregarContrato('api/openapi.yaml'),
    idempotencia: idempotenciaInerte,
    clock: { now: () => AGORA },
    baseDeMidia: BASE_DE_MIDIA,
  });
  });
  return app;
}

async function lerConversa(quemChama: UserId, conversa: ConversationId): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url: `/v1/conversations/${conversa}`,
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

async function listarConversas(quemChama: UserId): Promise<Resposta> {
  const app = await servidorPara(quemChama);
  await app.ready();
  const r = await app.inject({
    method: 'GET',
    url: '/v1/conversations',
    headers: { authorization: 'Bearer token-de-teste' },
  });
  await app.close();
  return { status: r.statusCode, corpo: JSON.parse(r.body) as Record<string, unknown> };
}

function participantes(corpo: Record<string, unknown>): readonly Participante[] {
  return corpo['participants'] as readonly Participante[];
}

function lado(corpo: Record<string, unknown>, papel: string): Participante {
  const achado = participantes(corpo).find((p) => p.role === papel);
  assert.ok(achado !== undefined, `a resposta não tem o participante \`${papel}\``);
  return achado;
}

/** Imprime o corpo medido, para ele ser COLADO no relatório em vez de descrito. */
function registrar(rotulo: string, r: Resposta): void {
  console.log(
    `\n[CORPO MEDIDO] ${rotulo}\n  status: ${String(r.status)}\n  participants: ${JSON.stringify(
      participantes(r.corpo),
    )}`,
  );
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
      'todos os casos abaixo passariam por não ter olhado para nada',
  );
  especie = especies.rows[0].code;
  porte = portes.rows[0].code;
});

after(async () => {
  // A ORDEM AQUI NÃO É ARBITRÁRIA, e ela custou uma execução: `handles.user_id`
  // é `ON DELETE SET NULL`, e `handles_pessoa_tem_dono` proíbe
  // `kind = 'pessoa'` sem dono. Apagar a conta ANTES do apelido viola o
  // `CHECK` e derruba o `after` -- com os casos todos verdes, o que deixa a
  // suite vermelha por causa da limpeza. Apelido primeiro, conta depois.
  if (apelidosCriados.length > 0) {
    await cliente.query('DELETE FROM handles WHERE handle = ANY($1::citext[])', [apelidosCriados]);
  }
  if (contasCriadas.length > 0) {
    // `ON DELETE CASCADE` leva pets, conversas, arestas e bloqueios junto.
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  if (avisosCriados.length > 0) {
    await cliente.query('DELETE FROM found_reports WHERE id = ANY($1::uuid[])', [avisosCriados]);
  }
  if (imagensCriadas.length > 0) {
    await cliente.query('DELETE FROM catalog_images WHERE id = ANY($1::uuid[])', [imagensCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o corpo real de `getConversation`: a foto só sai entre conexões aceitas', () => {
  void it('ISCA (b) -- conversa de ACHADO com NÃO-CONEXÃO: sem foto, mesmo tendo conta', () => {
    return (async () => {
      // O CASO CENTRAL DA REGRA ORIGINAL, e o estado mais comum do produto: o
      // estranho que escaneou a plaquinha. Ele TEM conta aqui, de propósito --
      // "não tem conta" seria um caso fácil demais, porque não haveria o que
      // projetar. Com conta, com nome e com FOTO PRONTA, e ainda assim nada
      // sai: é o golpe do falso achador que esta ausência protege.
      const tutor = await criarConta('Leandro Panegassi');
      const estranho = await criarConta('Ana Paula Ribeiro');
      await darApelido(estranho, `estranho-${refPublica().slice(0, 8).toLowerCase()}`);
      await darFoto(estranho, 'estranho');
      const pet = await criarPet(tutor, 'Aurora');
      const conversa = await abrirConversaDeAchado(pet, estranho, null);

      const r = await lerConversa(tutor, conversa);
      registrar('(b) achado com NÃO-conexão, lido pelo tutor', r);

      assert.equal(r.status, 200);
      const outro = lado(r.corpo, 'finder');
      assert.equal(outro.display_name, 'Ana', 'o primeiro nome continua saindo');
      assert.equal(outro.photo_icon_url, null, 'A FOTO VAZOU para quem não é conexão aceita');
      assert.equal(outro.handle, null, 'O APELIDO VAZOU para quem não é conexão aceita');
    })();
  });

  void it('ISCA (c) -- CONEXÃO ACEITA: a foto sai, e é a derivada `thumb` de 176 px', () => {
    return (async () => {
      const tutor = await criarConta('Leandro Panegassi');
      const amiga = await criarConta('Marina Souza');
      const apelido = await darApelido(amiga, `amiga-${refPublica().slice(0, 8).toLowerCase()}`);
      const chave = await darFoto(amiga, 'amiga');
      await ligar(tutor, amiga, 'accepted');
      const pet = await criarPet(tutor, 'Tobias');
      const conversa = await abrirConversaDeAchado(pet, amiga, null);

      const r = await lerConversa(tutor, conversa);
      registrar('(c) conexão ACEITA, lido pelo tutor', r);

      assert.equal(r.status, 200);
      const outro = lado(r.corpo, 'finder');
      assert.equal(outro.photo_icon_url, `${BASE_DE_MIDIA}/${chave}`);
      assert.match(
        String(outro.photo_icon_url),
        /-176\.jpg$/,
        'a derivada servida não é a `thumb` de 176 px: a `card` de 512 é 4,3x a célula de 40 dp',
      );
      assert.ok(
        !String(outro.photo_icon_url).includes('-512'),
        'a `card` de 512 px saiu no lugar da `thumb`',
      );
      assert.equal(outro.handle, apelido, 'sem o apelido o toque não tem destino');

      // E O PRÓPRIO LADO NÃO RECEBE NADA: a foto do dono já sai em `getMe`.
      const euMesmo = lado(r.corpo, 'tutor');
      assert.equal(euMesmo.photo_icon_url, null);
      assert.equal(euMesmo.handle, null);
    })();
  });

  void it('ISCA (c) -- nos DOIS SENTIDOS: o achador conectado vê a foto do tutor', () => {
    return (async () => {
      // A conexão é simétrica, e quem PEDIU não decide quem vê. Aqui a aresta
      // nasce do lado do achador (`requester = achador`), e quem lê é o
      // achador: as duas assimetrias possíveis estão exercidas de uma vez.
      const tutor = await criarConta('Leandro Panegassi');
      const amigo = await criarConta('Bruno Alves');
      const apelidoDoTutor = await darApelido(
        tutor,
        `tutor-${refPublica().slice(0, 8).toLowerCase()}`,
      );
      const chaveDoTutor = await darFoto(tutor, 'tutor');
      await ligar(amigo, tutor, 'accepted');
      const pet = await criarPet(tutor, 'Mel');
      const conversa = await abrirConversaDeAchado(pet, amigo, null);

      const r = await lerConversa(amigo, conversa);
      registrar('(c) conexão ACEITA, lido pelo ACHADOR (sentido inverso)', r);

      assert.equal(r.status, 200);
      const outro = lado(r.corpo, 'tutor');
      assert.equal(outro.photo_icon_url, `${BASE_DE_MIDIA}/${chaveDoTutor}`);
      assert.equal(outro.handle, apelidoDoTutor);
      const euMesmo = lado(r.corpo, 'finder');
      assert.equal(euMesmo.photo_icon_url, null);
      assert.equal(euMesmo.handle, null);
    })();
  });

  void it('ISCA (e) -- PAR BLOQUEADO: a conversa CONTINUA, e a foto não sai', () => {
    return (async () => {
      // O estado que a conversa mediada tem de único: **ela atravessa o
      // bloqueio**. Em toda outra superfície o par bloqueado responde 404; aqui
      // a conversa continua legível, porque o tutor precisa ler o que foi dito
      // sobre o pet dele. Então a foto não pode depender só do `EXISTS` da
      // aresta -- e este caso mede a corrida: a aresta `accepted` fica de pé,
      // o bloqueio é escrito, e é `NOT bloqueio_entre` que fecha.
      const tutor = await criarConta('Leandro Panegassi');
      const indesejado = await criarConta('Carlos Dias');
      await darApelido(indesejado, `carlos-${refPublica().slice(0, 8).toLowerCase()}`);
      await darFoto(indesejado, 'carlos');
      await ligar(tutor, indesejado, 'accepted');
      const pet = await criarPet(tutor, 'Nina');
      const conversa = await abrirConversaDeAchado(pet, indesejado, null);
      await bloquear(tutor, indesejado);

      const r = await lerConversa(tutor, conversa);
      registrar('(e) par BLOQUEADO (aresta `accepted` de pé), lido pelo tutor', r);

      assert.equal(r.status, 200, 'a conversa mediada atravessa o bloqueio, de propósito');
      const outro = lado(r.corpo, 'finder');
      assert.equal(outro.photo_icon_url, null, 'A FOTO SAIU para um par bloqueado');
      assert.equal(outro.handle, null, 'O APELIDO SAIU para um par bloqueado — o toque teria destino');

      // E no sentido inverso do bloqueio, que é o que torna `bloqueio_entre`
      // simétrico em vez de direcional: quem foi bloqueado também não vê.
      const inverso = await lerConversa(indesejado, conversa);
      registrar('(e) par BLOQUEADO, lido por quem FOI bloqueado', inverso);
      assert.equal(lado(inverso.corpo, 'tutor').photo_icon_url, null);
      assert.equal(lado(inverso.corpo, 'tutor').handle, null);
    })();
  });

  void it('ISCA -- PEDIDO PENDENTE não é aceite: nada sai antes do `accepted`', () => {
    return (async () => {
      // *"já aceitaram conexão"*. Pendente é o estado em que uma das duas ainda
      // não decidiu, e um defeito que lesse a aresta sem olhar o `state`
      // entregaria o rosto a quem apenas mandou um pedido — que é exatamente o
      // que um falso achador faria.
      const tutor = await criarConta('Leandro Panegassi');
      const pedinte = await criarConta('Diego Matos');
      await darApelido(pedinte, `diego-${refPublica().slice(0, 8).toLowerCase()}`);
      await darFoto(pedinte, 'diego');
      await ligar(pedinte, tutor, 'pending');
      const pet = await criarPet(tutor, 'Pipoca');
      const conversa = await abrirConversaDeAchado(pet, pedinte, null);

      const r = await lerConversa(tutor, conversa);
      registrar('pedido PENDENTE, lido pelo tutor', r);
      assert.equal(lado(r.corpo, 'finder').photo_icon_url, null, 'pendente trouxe foto');
      assert.equal(lado(r.corpo, 'finder').handle, null, 'pendente trouxe apelido');
    })();
  });

  void it('ISCA -- conta DESABILITADA do outro lado: perde o nome E a foto, sendo conexão', () => {
    return (async () => {
      // `conta_habilitada` das duas pontas está DENTRO do predicado de conexão,
      // então o lado que saiu perde a foto sem nenhum `if` no domínio. O nome
      // já caía para o rótulo neutro; a foto acompanha.
      const tutor = await criarConta('Leandro Panegassi');
      const quemSaiu = await criarConta('Elisa Prado');
      await darApelido(quemSaiu, `elisa-${refPublica().slice(0, 8).toLowerCase()}`);
      await darFoto(quemSaiu, 'elisa');
      await ligar(tutor, quemSaiu, 'accepted');
      const pet = await criarPet(tutor, 'Lola');
      const conversa = await abrirConversaDeAchado(pet, quemSaiu, null);
      await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [quemSaiu]);

      const r = await lerConversa(tutor, conversa);
      registrar('conta DESABILITADA do outro lado, lido pelo tutor', r);
      const outro = lado(r.corpo, 'finder');
      assert.equal(outro.display_name, 'Quem achou', 'o lado que saiu continua despersonalizado');
      assert.equal(outro.photo_icon_url, null, 'a foto de uma conta desabilitada saiu');
      assert.equal(outro.handle, null, 'o apelido de uma conta desabilitada saiu');
    })();
  });

  void it('ISCA (a) -- a LISTA obedece à mesma regra: as duas rotas, um construtor', () => {
    return (async () => {
      // `listConversations` e `getConversation` passam pelo MESMO
      // `construtorDaLeituraDoChamador`. Este caso registra a consequência
      // medida, em vez de confiar nela: a lista é a superfície que o cliente
      // pediu (*"a foto do usuário como ícone das conversas"*), e um recorte que
      // valesse só na conversa aberta deixaria a lista inteira vazando.
      const tutor = await criarConta('Leandro Panegassi');
      const amiga = await criarConta('Marina Souza');
      const estranho = await criarConta('Ana Paula Ribeiro');
      const apelidoDaAmiga = await darApelido(
        amiga,
        `marina-${refPublica().slice(0, 8).toLowerCase()}`,
      );
      await darFoto(amiga, 'marina-lista');
      await darApelido(estranho, `ana-${refPublica().slice(0, 8).toLowerCase()}`);
      await darFoto(estranho, 'ana-lista');
      await ligar(tutor, amiga, 'accepted');
      await abrirConversaDeAchado(await criarPet(tutor, 'Tobias'), amiga, null);
      await abrirConversaDeAchado(await criarPet(tutor, 'Aurora'), estranho, null);

      const r = await listarConversas(tutor);
      assert.equal(r.status, 200);
      const itens = r.corpo['items'] as readonly Record<string, unknown>[];
      assert.equal(itens.length, 2, 'a lista não trouxe as duas conversas');
      console.log(
        `\n[CORPO MEDIDO] (a) LISTA do tutor (uma conexão, um estranho)\n  status: ${String(
          r.status,
        )}\n  participants por item: ${JSON.stringify(itens.map((i) => participantes(i)))}`,
      );

      const comFoto = itens.filter((i) => lado(i, 'finder').photo_icon_url !== null);
      assert.equal(comFoto.length, 1, 'exatamente UMA das duas conversas tem foto');
      assert.equal(lado(comFoto[0] as Record<string, unknown>, 'finder').handle, apelidoDaAmiga);
    })();
  });
});
