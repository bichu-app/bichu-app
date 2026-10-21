/**
 * O ENDERECO DE ENTREGA GUARDADO NA CONTA, contra Postgres de verdade:
 * **so o dono le, e nada apaga por prazo.**
 *
 * ## A decisao que este arquivo protege
 *
 * O cliente autorizou a tabela em **21/10/2026**, nas palavras dele: *"um
 * endereco de entrega salvo na conta, reusado em todo pedido e editavel num
 * lugar so"*. E essa decisao que destrava a proibicao de acrescentar tabela do
 * ADR-0011 secao 5.5.
 *
 * ## Por que este arquivo nao pode ser unitario
 *
 * `src/tools/endereco-guardado-nao-sai-em-publico.test.ts` mede o CONTRATO e o
 * TEXTO da consulta, e um duble em memoria mede a regra que eu mesmo escrevi.
 * Nenhum dos dois prova o que so o banco sabe:
 *
 * - **a leitura de OUTRA CONTA nao devolve linha.** A autorizacao mora na
 *   clausula `WHERE` (ADR-0021), e `WHERE` e coisa de banco. Um duble que
 *   devolvesse `null` para outra conta provaria o duble;
 * - **`user_id` e CHAVE PRIMARIA**, entao a mesma conta nao tem dois enderecos
 *   -- "um endereco por conta" e a forma da tabela e nao uma regra de
 *   aplicacao, e e o `ON CONFLICT (user_id) DO UPDATE` que depende dela;
 * - **os nove `CHECK`** sao, caractere por caractere, os de
 *   `collar_tag_requests`. Isso nao e estetica: e a condicao para o endereco
 *   guardado poder PREENCHER o pedido. Se esta tabela aceitasse um
 *   `street_number` que a outra recusa, o endereco guardado nasceria capaz de
 *   produzir um pedido que o banco rejeita, e a pessoa descobriria isso no
 *   botao de pedir. **Aqui as duas tabelas sao exercitadas com os MESMOS
 *   valores de borda**, e um caso reprova se elas discordarem;
 * - **o `ON DELETE CASCADE`**, que e a UNICA forma de apagamento que este
 *   endereco tem (cliente, 17/10/2026);
 * - **a ausencia de coluna de prazo**, que e decisao e nao esquecimento.
 *
 * ## Como rodar
 *
 *     npm run test:integration
 *
 * A pilha e efemera e o banco e derrubado no fim. Nada aqui toca a pilha de
 * desenvolvimento.
 *
 * ## O que sobrevive a execucao
 *
 * Nada. As contas criadas sao apagadas no `after`, e o `ON DELETE CASCADE` leva
 * os enderecos junto -- que e, ele proprio, um dos casos.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { KyselyEnderecoGuardado } from '../../src/modules/tags/adapters/persistence/kysely-endereco-guardado.js';
import type { EnderecoGuardadoRepository } from '../../src/modules/tags/ports/endereco-guardado.js';
import type { EnderecoDeEntrega } from '../../src/modules/tags/ports/pedido-de-plaquinha.js';
import type { UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo-de-teste.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: EnderecoGuardadoRepository;

const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, public_ref) VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `endereco-guardado-${id}@${DOMINIO_DE_TESTE}`],
  );
  contasCriadas.push(id);
  return id;
}

/** Um endereco valido. Cada campo distinguivel, para o caso ver QUAL voltou. */
function enderecoDe(marca: string): EnderecoDeEntrega {
  return {
    destinatario: `Quem Recebe ${marca}`,
    telefone: '+5511912345678',
    cep: '04538132',
    logradouro: `Rua ${marca}`,
    numero: '900G',
    complemento: `conjunto ${marca}`,
    bairro: `Bairro ${marca}`,
    cidade: `Cidade ${marca}`,
    uf: 'SP',
  };
}

/**
 * Um pet de verdade do dono.
 *
 * **Existe porque a primeira versao do grupo de bordas media errado.** Ela
 * inseria em `collar_tag_requests` com `pet_id` NULO, para nao precisar de pet,
 * e com isso o `INSERT` morria em `23502` (violacao de `NOT NULL`) ANTES de o
 * Postgres avaliar qualquer `CHECK` de endereco. O codigo lia "nao foi `23514`,
 * logo o endereco passou", e os SETE casos de recusa reprovaram dizendo que as
 * tabelas discordavam -- quando o que discordava era a medicao.
 *
 * Com um pet real, a UNICA coisa que pode derrubar aquele `INSERT` sao as
 * travas do endereco, que e o que o grupo existe para comparar.
 */
async function criarPet(dono: UserId): Promise<string> {
  const pet = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, dono, `Pet do endereco ${pet.slice(0, 8)}`],
  );
  return pet;
}

async function quantosEnderecos(dono: UserId): Promise<number> {
  const r = await cliente.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM user_delivery_addresses WHERE user_id = $1',
    [dono],
  );
  return Number(r.rows[0]?.n ?? '-1');
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificacao que nao consegue verificar precisa REPROVAR. Pular aqui faria
    // a suite ficar verde sem nunca ter tocado na tabela, que e exatamente o
    // que este arquivo existe para impedir.
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo mede a clausula `WHERE` que ' +
        'autoriza a leitura do endereco residencial contra Postgres de verdade, e ' +
        'nao tem versao em memoria. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = new KyselyEnderecoGuardado(db);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('a tabela e o que a migracao promete', () => {
  void it('`user_id` e a CHAVE PRIMARIA, e nao ha coluna `id`', async () => {
    const chave = await cliente.query<{ coluna: string }>(
      `SELECT a.attname AS coluna
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'user_delivery_addresses'::regclass AND i.indisprimary`,
    );
    assert.deepEqual(
      chave.rows.map((l) => l.coluna),
      ['user_id'],
      '"um endereco por conta" deixou de ser a FORMA da tabela',
    );

    const colunas = await cliente.query<{ coluna: string }>(
      `SELECT column_name AS coluna FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_delivery_addresses'`,
    );
    const nomes = colunas.rows.map((l) => l.coluna);
    assert.ok(nomes.length > 0, 'a tabela nao tem coluna nenhuma: nada abaixo mede nada');
    assert.ok(
      !nomes.includes('id'),
      'a tabela ganhou coluna `id`. A ausencia e deliberada: o recurso e singular ' +
        'em `/v1/me/delivery-address` e nenhum identificador interno vai para ' +
        'caminho de rota (ADR-0010 item 6)',
    );
  });

  void it('NAO HA COLUNA DE PRAZO, de expiracao nem de apagamento programado', async () => {
    // A decisao do cliente de 17/10/2026 e literal: *"voce so deve apagar as
    // informacoes, caso o usuario remova o pet ou delete a conta"*. Este caso
    // existe porque uma constante de prazo que ninguem le ja fez mais de uma
    // pessoa neste projeto concluir que havia divida de implementacao -- e uma
    // COLUNA de prazo faria pior.
    const colunas = await cliente.query<{ coluna: string }>(
      `SELECT column_name AS coluna FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_delivery_addresses'`,
    );
    const nomes = colunas.rows.map((l) => l.coluna).sort();
    assert.deepEqual(
      nomes,
      [
        'city',
        'complement',
        'neighborhood',
        'postal_code',
        'recipient_name',
        'recipient_phone',
        'state',
        'street',
        'street_number',
        'updated_at',
        'user_id',
      ],
      'o conjunto de colunas mudou. Coluna nova aqui e dado pessoal novo, ou um ' +
        'prazo que a decisao de 17/10 nao autoriza -- e nos dois casos passa por aqui',
    );
    for (const proibida of ['expires_at', 'purge_at', 'delete_after', 'retention_until']) {
      assert.ok(!nomes.includes(proibida), `coluna de prazo \`${proibida}\``);
    }
  });

  void it('nao ha coordenada nem indice espacial (ADR-0006)', async () => {
    const r = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_delivery_addresses'
          AND (data_type IN ('geography', 'geometry')
               OR column_name IN ('lat', 'lon', 'latitude', 'longitude'))`,
    );
    assert.equal(r.rows[0]?.n, '0', 'o endereco guardado virou coordenada');
  });
});

void describe('so o DONO le o endereco guardado', () => {
  void it('ISCA DE VAZAMENTO -- a conta vizinha le `null`, e nao o endereco da outra', async () => {
    const dono = await criarConta();
    const vizinha = await criarConta();

    const gravado = await repo.guardar(dono, enderecoDe('Do Dono'));
    assert.equal(gravado.logradouro, 'Rua Do Dono');

    // CONTROLE POSITIVO. Sem ele, "a vizinha le null" seria verdade num mundo
    // em que NINGUEM le nada -- um `WHERE` que casa com nada, uma tabela vazia,
    // uma conexao errada. A leitura do dono tem de ACHAR.
    const doDono = await repo.doChamador(dono);
    assert.ok(
      doDono !== null,
      'CONTROLE POSITIVO: o DONO nao le o proprio endereco. Sem isto, o `null` da ' +
        'vizinha nao prova autorizacao -- prova que nada funciona',
    );
    assert.equal(doDono.logradouro, 'Rua Do Dono');

    const daVizinha = await repo.doChamador(vizinha);
    assert.equal(
      daVizinha,
      null,
      'a conta vizinha leu o endereco RESIDENCIAL de outra pessoa. A autorizacao ' +
        'deste endereco mora na clausula `WHERE` (ADR-0021), e um `WHERE` que ' +
        'falta devolve a residencia de quem nao pediu',
    );
  });

  void it('ISCA DE VAZAMENTO -- nenhum campo do endereco do dono aparece na leitura da vizinha', async () => {
    // Varredura por SENTINELA sobre o corpo bruto, e nao campo a campo: a forma
    // do ADR-0027 item 12.12. Uma asercao campo a campo nao enxerga um campo
    // novo que alguem acrescente amanha.
    const dono = await criarConta();
    const vizinha = await criarConta();

    const sentinela = 'ISCA-RESIDENCIA-DO-DONO';
    await repo.guardar(dono, {
      ...enderecoDe('X'),
      destinatario: sentinela,
      logradouro: sentinela,
      bairro: sentinela,
      cidade: sentinela,
      complemento: sentinela,
    });

    // CONTROLE POSITIVO: a varredura TEM de achar as sentinelas na leitura do
    // dono. Uma varredura que nao enxerga a sentinela aprovaria qualquer coisa.
    const corpoDoDono = JSON.stringify(await repo.doChamador(dono));
    assert.ok(
      corpoDoDono.includes(sentinela),
      'CONTROLE POSITIVO: a varredura nao acha a sentinela nem onde ela ESTA. ' +
        'Ela esta cega, e o caso abaixo nao vale nada',
    );

    const corpoDaVizinha = JSON.stringify(await repo.doChamador(vizinha));
    assert.ok(
      !corpoDaVizinha.includes(sentinela),
      `a leitura da conta vizinha carrega a sentinela da residencia do dono: ${corpoDaVizinha}`,
    );
  });

  void it('guardar pela conta vizinha nao toca a linha do dono', async () => {
    const dono = await criarConta();
    const vizinha = await criarConta();

    await repo.guardar(dono, enderecoDe('Do Dono'));
    await repo.guardar(vizinha, enderecoDe('Da Vizinha'));

    const doDono = await repo.doChamador(dono);
    assert.equal(doDono?.logradouro, 'Rua Do Dono', 'a escrita da vizinha sobrescreveu o dono');
    const daVizinha = await repo.doChamador(vizinha);
    assert.equal(daVizinha?.logradouro, 'Rua Da Vizinha');
    assert.equal(await quantosEnderecos(dono), 1);
    assert.equal(await quantosEnderecos(vizinha), 1);
  });
});

void describe('um endereco por conta, e guardar de novo SOBRESCREVE', () => {
  void it('o segundo `guardar` nao cria segunda linha', async () => {
    const dono = await criarConta();
    await repo.guardar(dono, enderecoDe('Primeira'));
    await repo.guardar(dono, enderecoDe('Segunda'));

    assert.equal(
      await quantosEnderecos(dono),
      1,
      'a conta ficou com dois enderecos. O cliente pediu *"um endereco de entrega ' +
        'salvo na conta"*, no singular, e `user_id` e a chave primaria justamente ' +
        'para que isso nao dependa de ninguem lembrar',
    );
    const atual = await repo.doChamador(dono);
    assert.equal(atual?.logradouro, 'Rua Segunda', 'a sobrescrita nao pegou');
  });

  void it('`updated_at` avanca na sobrescrita, e NAO e carimbo de expiracao', async () => {
    const dono = await criarConta();
    await repo.guardar(dono, enderecoDe('Antes'));
    const antes = await cliente.query<{ t: Date }>(
      'SELECT updated_at AS t FROM user_delivery_addresses WHERE user_id = $1',
      [dono],
    );
    await repo.guardar(dono, enderecoDe('Depois'));
    const depois = await cliente.query<{ t: Date }>(
      'SELECT updated_at AS t FROM user_delivery_addresses WHERE user_id = $1',
      [dono],
    );
    const t0 = antes.rows[0]?.t;
    const t1 = depois.rows[0]?.t;
    assert.ok(t0 !== undefined && t1 !== undefined);
    assert.ok(t1.getTime() >= t0.getTime(), '`updated_at` andou para tras');
  });

  void it('o complemento nulo sobrescreve um complemento que existia', async () => {
    // Quem se muda de um apartamento para uma casa precisa conseguir TIRAR o
    // complemento. Um `ON CONFLICT` que so escrevesse campo nao-nulo deixaria
    // "conjunto 91" colado no endereco novo, e a encomenda iria para um
    // conjunto que nao existe no endereco novo.
    const dono = await criarConta();
    await repo.guardar(dono, { ...enderecoDe('Com'), complemento: 'conjunto 91' });
    const guardado = await repo.guardar(dono, { ...enderecoDe('Sem'), complemento: null });
    assert.equal(guardado.complemento, null);
    const lido = await repo.doChamador(dono);
    assert.equal(lido?.complemento, null, 'o complemento antigo sobreviveu a mudanca de casa');
  });
});

void describe('as travas do banco sao as MESMAS da tabela do pedido', () => {
  /**
   * Os valores de borda, e o que cada um exercita.
   *
   * **A identidade com `collar_tag_requests` e a razao deste grupo existir**: o
   * endereco guardado tem de poder preencher o pedido. Um valor aceito aqui e
   * recusado la produziria um endereco guardado que gera um pedido que o banco
   * rejeita -- e a pessoa descobriria isso no botao de pedir.
   */
  const BORDAS: ReadonlyArray<{
    readonly nome: string;
    readonly endereco: (base: EnderecoDeEntrega) => EnderecoDeEntrega;
    readonly aceita: boolean;
  }> = [
    { nome: 'CEP com hifen', endereco: (b) => ({ ...b, cep: '04538-13' }), aceita: false },
    { nome: 'CEP com sete digitos', endereco: (b) => ({ ...b, cep: '0453813' }), aceita: false },
    { nome: 'telefone sem +55', endereco: (b) => ({ ...b, telefone: '11912345678' }), aceita: false },
    { nome: 'UF com tres letras', endereco: (b) => ({ ...b, uf: 'SPX' }), aceita: false },
    { nome: 'destinatario de 1 caractere', endereco: (b) => ({ ...b, destinatario: 'A' }), aceita: false },
    { nome: 'numero vazio', endereco: (b) => ({ ...b, numero: '' }), aceita: false },
    { nome: 'complemento vazio (texto)', endereco: (b) => ({ ...b, complemento: '' }), aceita: false },
    // Os que PRECISAM passar: sem eles o grupo provaria so que o banco recusa
    // coisas, e um `CHECK` que recusa tudo passaria.
    { nome: 'numero `s/n`', endereco: (b) => ({ ...b, numero: 's/n' }), aceita: true },
    { nome: 'numero `KM 32`', endereco: (b) => ({ ...b, numero: 'KM 32' }), aceita: true },
    { nome: 'telefone de 10 digitos', endereco: (b) => ({ ...b, telefone: '+551132345678' }), aceita: true },
    { nome: 'sem complemento', endereco: (b) => ({ ...b, complemento: null }), aceita: true },
  ];

  for (const borda of BORDAS) {
    void it(`\`${borda.nome}\`: as duas tabelas concordam`, async () => {
      const dono = await criarConta();
      const endereco = borda.endereco(enderecoDe('Borda'));

      let aceitouNoGuardado = true;
      try {
        await repo.guardar(dono, endereco);
      } catch {
        aceitouNoGuardado = false;
      }

      // A MESMA linha, na tabela do PEDIDO, por SQL cru -- com PET DE VERDADE,
      // para que a unica coisa capaz de derrubar este `INSERT` sejam as travas
      // do endereco. Ver `criarPet` para o que a versao anterior media errado.
      const pet = await criarPet(dono);
      // **`ref` UNICO por insercao.** A versao anterior usava um literal fixo,
      // e `collar_tag_requests_ref_unico` e UNIQUE: a primeira borda ACEITA
      // tomava o valor e as seguintes morriam em `23505`. Foi a assercao de
      // "a recusa tem de ser do CHECK", logo abaixo, que pegou isso -- sem ela
      // as tres ultimas bordas teriam passado por motivo errado.
      const refDoPedido = randomUUID().replace(/-/gu, '').slice(0, 22);
      let aceitouNoPedido = true;
      let codigoDoErroDoPedido: string | undefined;
      try {
        await cliente.query(
          `INSERT INTO collar_tag_requests
             (id, ref, pet_id, requested_by, recipient_name, recipient_phone,
              postal_code, street, street_number, complement, neighborhood, city, state)
           VALUES (gen_random_uuid(), $12,
                   $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            pet,
            dono,
            endereco.destinatario,
            endereco.telefone,
            endereco.cep,
            endereco.logradouro,
            endereco.numero,
            endereco.complemento,
            endereco.bairro,
            endereco.cidade,
            endereco.uf,
            refDoPedido,
          ],
        );
      } catch (erro) {
        aceitouNoPedido = false;
        codigoDoErroDoPedido = (erro as { code?: string }).code;
      }

      // **A RECUSA TEM DE SER DO `CHECK`, e nao de outra coisa.** Sem esta
      // linha, um `NOT NULL` ou uma chave estrangeira quebrada passaria por
      // "o endereco foi recusado" e o grupo ficaria verde medindo o erro
      // errado -- que e exatamente o defeito da primeira versao dele.
      if (!aceitouNoPedido) {
        assert.equal(
          codigoDoErroDoPedido,
          '23514',
          `o \`INSERT\` no pedido falhou com \`${String(codigoDoErroDoPedido)}\` e nao ` +
            `com \`23514\` (violacao de CHECK). A recusa nao veio das travas do ` +
            `endereco, e a comparacao abaixo estaria medindo outro erro`,
        );
      }

      assert.equal(
        aceitouNoGuardado,
        borda.aceita,
        `\`user_delivery_addresses\` ${aceitouNoGuardado ? 'aceitou' : 'recusou'} ` +
          `\`${borda.nome}\`, e o esperado era ${borda.aceita ? 'aceitar' : 'recusar'}`,
      );
      assert.equal(
        aceitouNoPedido,
        aceitouNoGuardado,
        `AS DUAS TABELAS DISCORDAM sobre \`${borda.nome}\`: o endereco guardado ` +
          `${aceitouNoGuardado ? 'aceita' : 'recusa'} e o pedido ` +
          `${aceitouNoPedido ? 'aceita' : 'recusa'}. Com isso o endereco guardado ` +
          `pode produzir um pedido que o banco rejeita, e a pessoa descobre no botao`,
      );
    });
  }
});

void describe('o endereco sai com a CONTA, e so com ela', () => {
  void it('apagar a conta apaga o endereco (`ON DELETE CASCADE`)', async () => {
    const dono = await criarConta();
    await repo.guardar(dono, enderecoDe('Vai Cair'));
    assert.equal(await quantosEnderecos(dono), 1, 'CONTROLE POSITIVO: a linha existia');

    await cliente.query('DELETE FROM users WHERE id = $1', [dono]);

    assert.equal(
      await quantosEnderecos(dono),
      0,
      'o endereco sobreviveu a conta. O `ON DELETE CASCADE` de `user_id` e a UNICA ' +
        'forma de apagamento que este endereco tem (cliente, 17/10/2026), e sem ele ' +
        'a residencia de uma pessoa que fechou a conta fica no banco',
    );
  });
});
