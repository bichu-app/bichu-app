/**
 * O que acontece com a linha da vitrine DEPOIS que ela chega do banco.
 *
 * ## Por que este arquivo existe
 *
 * Ele não existia, e a ausência tinha consequência medida: `kysely-store-
 * repository.ts` não aparecia em relatório de cobertura NENHUM — nem no
 * unitário, que não o carregava, nem no de integração, porque
 * `tests/integration/vitrine-da-loja.test.ts` fala com o Postgres por um
 * cliente `pg` cru e nunca importa o adaptador. Para o SonarCloud, arquivo de
 * fonte sem dado de cobertura é arquivo com 0%, e ele não reclama: publica o
 * número.
 *
 * O que morde aqui é a **composição do endereço**. Desde que a migração
 * `20260922000009` passou a guardar CAMINHO em vez de URL, é este adaptador
 * que junta o `host` do parceiro ao caminho do item. Desligar a composição —
 * devolver `linha.target_path` cru, como o código fazia antes — não quebra
 * tipo nenhum, não muda o contrato e faria o aplicativo abrir `/bola-pop` como
 * se fosse endereço. O caso `o destino sai absoluto` é quem reprova isso, pelo
 * nome.
 *
 * ## Por que dá para fazer isso sem Postgres
 *
 * Mesmo desenho de `kysely-media-repository.test.ts`: o Kysely separa o
 * dialeto do construtor de consulta, então trocando só o motor por um que
 * devolve linhas combinadas o adaptador roda INTEIRO — as mesmas cláusulas, o
 * mesmo `.select()`, o mesmo mapeamento de linha para `ItemDaVitrine`. O que o
 * dublê não cobre é o que só o banco responde (se a coluna existe, se o índice
 * é usado), e isso continua em `tests/integration/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { RecorteDaVitrine } from '../../ports/store-repository.js';
import {
  comoDataSimples,
  construtorDaVitrine,
  criarStoreRepository,
  escaparCuringas,
} from './kysely-store-repository.js';

/**
 * Um `Db` que compila a consulta de verdade e devolve os lotes combinados.
 *
 * Pedir mais consultas do que o teste preparou é ERRO e não lote vazio: lote
 * vazio faria um adaptador que consultasse a tabela errada passar calado.
 */
function bancoQueDevolve(...lotes: readonly (readonly unknown[])[]): Db {
  const fila = [...lotes];

  const conexao: DatabaseConnection = {
    executeQuery: <R,>(): Promise<QueryResult<R>> => {
      const proximo = fila.shift();
      if (proximo === undefined) {
        return Promise.reject(new Error('O adaptador fez mais consultas do que o teste preparou.'));
      }
      return Promise.resolve({ rows: proximo as R[], numAffectedRows: BigInt(proximo.length) });
    },
    streamQuery: () => {
      throw new Error('A vitrine não faz streaming.');
    },
  };

  const motor: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(conexao),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };

  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => motor,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

/**
 * O mesmo compilador do Postgres, sem conexão. Serve para LER o SQL que o
 * construtor produz: SQL escrito à mão no teste seria o atalho que parece
 * equivalente e esconde exatamente o que se foi conferir.
 */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const RECORTE: RecorteDaVitrine = { sort: 'curadoria', page: 1, limit: 20 };

/** A derivada de imagem de catalogo, que o item desta massa nao tem. */
const URL_DE_MIDIA = (chave: string): string => `https://midia.example/${chave}`;

/** Especie, tags e imagens da pagina: tres consultas, vazias nesta massa. */
const COMPLEMENTOS_VAZIOS: readonly (readonly unknown[])[] = [[], [], []];

function linhaDaVitrine(sobrescrever: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '0192a3b4-0000-7000-8000-000000000001',
    slug: 'bola-pop',
    title: 'Bola Pop',
    summary: 'Bola de borracha atóxica que flutua.',
    category: 'toy',
    image_path: '/vitrine/bola-pop.jpg',
    target_path: '/bola-pop-borracha',
    partner_slug: 'patas-do-bairro',
    partner_name: 'Patas do Bairro',
    partner_host: 'patas-do-bairro.example',
    price_amount: 990,
    price_currency: 'BRL',
    price_checked_at: new Date(Date.UTC(2026, 8, 1)),
    ...sobrescrever,
  };
}

async function umItem(sobrescrever: Record<string, unknown> = {}) {
  const repo = criarStoreRepository(
    bancoQueDevolve([{ total: '1' }], [linhaDaVitrine(sobrescrever)], ...COMPLEMENTOS_VAZIOS),
    URL_DE_MIDIA,
  );
  const pagina = await repo.listarVitrine(RECORTE);
  const item = pagina.itens[0];
  assert.ok(item !== undefined, 'o adaptador não devolveu a linha que o banco entregou');
  return item;
}

void describe('o endereço do item é COMPOSTO, e o host não vem do item', () => {
  void it('o destino sai absoluto, em https, no host do parceiro', async () => {
    const item = await umItem();
    assert.equal(item.targetUrl, 'https://patas-do-bairro.example/bola-pop-borracha');
  });

  void it('a imagem sai absoluta pelo mesmo caminho', async () => {
    const item = await umItem();
    assert.equal(item.imageUrl, 'https://patas-do-bairro.example/vitrine/bola-pop.jpg');
  });

  void it('item sem imagem continua sem imagem, e não vira o host sozinho', async () => {
    // Compor sobre `null` produziria `https://<host>null`, que é uma URL
    // válida e uma imagem quebrada em todo cartão sem foto.
    const item = await umItem({ image_path: null });
    assert.equal(item.imageUrl, null);
  });

  void it('trocar o parceiro troca o host dos dois endereços', async () => {
    // É o que prova que o host vem da JUNÇÃO e não do item: o caminho é o
    // mesmo e o endereço muda.
    const item = await umItem({ partner_host: 'mundo-pet.example' });
    assert.equal(item.targetUrl, 'https://mundo-pet.example/bola-pop-borracha');
    assert.equal(item.imageUrl, 'https://mundo-pet.example/vitrine/bola-pop.jpg');
  });
});

void describe('a linha vira `ItemDaVitrine` sem perder nem inventar campo', () => {
  void it('o total é o do recorte, lido da consulta de contagem', async () => {
    const repo = criarStoreRepository(
      bancoQueDevolve([{ total: '7' }], [linhaDaVitrine()], ...COMPLEMENTOS_VAZIOS),
      URL_DE_MIDIA,
    );
    const pagina = await repo.listarVitrine(RECORTE);
    assert.equal(pagina.total, 7);
  });

  void it('a contagem ausente é zero, e não `NaN`', async () => {
    const repo = criarStoreRepository(bancoQueDevolve([], []), URL_DE_MIDIA);
    const pagina = await repo.listarVitrine(RECORTE);
    assert.equal(pagina.total, 0);
    assert.deepEqual(pagina.itens, []);
  });

  void it('o preço chega como número inteiro, mesmo vindo do driver como texto', async () => {
    // O driver do Postgres devolve `numeric`/`bigint` como string. Sem a
    // conversão, o centavo viraria texto e a projeção o entregaria assim.
    const item = await umItem({ price_amount: '124990' });
    assert.equal(item.priceAmount, 124_990);
  });

  void it('o parceiro chega desmembrado nos três campos que a projeção usa', async () => {
    const item = await umItem();
    assert.equal(item.partnerSlug, 'patas-do-bairro');
    assert.equal(item.partnerName, 'Patas do Bairro');
    assert.equal(item.partnerHost, 'patas-do-bairro.example');
  });
});

void describe('`comoDataSimples` lê a data pura em UTC', () => {
  void it('a `Date` de meia-noite UTC não anda um dia para trás', () => {
    // O defeito que esta função existe para impedir: em fuso negativo, ler a
    // data por componentes locais devolveria o dia anterior, e o preço
    // passaria a ter sido consultado um dia antes — aproximando o vencimento
    // em silêncio.
    assert.equal(comoDataSimples(new Date(Date.UTC(2026, 8, 1))), '2026-09-01');
  });

  void it('o texto é cortado no dia, sem passar por fuso nenhum', () => {
    assert.equal(comoDataSimples('2026-09-01T23:59:59.000Z'), '2026-09-01');
  });

  void it('nulo continua nulo: item sem preço não tem data', () => {
    assert.equal(comoDataSimples(null), null);
  });
});

void describe('`escaparCuringas` procura o que a pessoa digitou, e não um padrão', () => {
  void it('escapa `%`, que casaria a vitrine inteira', () => {
    assert.equal(escaparCuringas('50%'), '50\\%');
  });

  void it('escapa `_`, que casa qualquer caractere', () => {
    assert.equal(escaparCuringas('bola_pop'), 'bola\\_pop');
  });

  void it('a barra invertida vem PRIMEIRO, senão ela duplica a que acabou de entrar', () => {
    assert.equal(escaparCuringas('\\%'), '\\\\\\%');
  });

  void it('termo sem curinga atravessa intacto', () => {
    assert.equal(escaparCuringas('ração úmida'), 'ração úmida');
  });
});

void describe('o item retirado e o parceiro desativado ficam fora pela cláusula WHERE', () => {
  void it('a consulta carrega os DOIS predicados de `active`', () => {
    // Filtrar depois, num `if`, é o que quebra no dia em que alguém esquece o
    // `if`. O predicado é lido do SQL que o próprio Kysely compila.
    const { sql } = construtorDaVitrine(semBanco, RECORTE).compile();
    assert.match(sql, /"i"\."active"\s*=\s*\$\d+/, `o predicado do item sumiu. SQL: ${sql}`);
    assert.match(sql, /"p"\."active"\s*=\s*\$\d+/, `o predicado do parceiro sumiu. SQL: ${sql}`);
  });

  void it('a junção é pela identidade INTERNA do parceiro (ADR-0024)', () => {
    const { sql } = construtorDaVitrine(semBanco, RECORTE).compile();
    assert.match(sql, /"p"\."id"\s*=\s*"i"\."partner_id"/, `a junção mudou de coluna. SQL: ${sql}`);
    assert.doesNotMatch(
      sql,
      /"p"\."slug"\s*=\s*"i"\./,
      'a junção voltou a ser pelo endereço público, que é o que o critério 2 da BICHUS-19 proíbe',
    );
  });

  void it('a categoria entra no WHERE quando o recorte a traz, e só então', () => {
    const comum = construtorDaVitrine(semBanco, RECORTE).compile().sql;
    assert.doesNotMatch(comum, /"i"\."category"/);
    const filtrada = construtorDaVitrine(semBanco, { ...RECORTE, category: 'food' }).compile();
    assert.match(filtrada.sql, /"i"\."category"\s*=\s*\$\d+/);
    assert.ok(filtrada.parameters.includes('food'));
  });

  void it('o termo de busca entra escapado e nos dois campos', () => {
    const { sql, parameters } = construtorDaVitrine(semBanco, { ...RECORTE, q: '50%' }).compile();
    assert.match(sql, /ilike/i, `a busca sumiu do SQL: ${sql}`);
    assert.ok(
      parameters.includes('%50\\%%'),
      `o termo não foi escapado antes de virar padrão: ${JSON.stringify(parameters)}`,
    );
  });

  void it('termo vazio não vira filtro que casa tudo', () => {
    const { sql } = construtorDaVitrine(semBanco, { ...RECORTE, q: '' }).compile();
    assert.doesNotMatch(sql, /ilike/i, `string vazia virou filtro: ${sql}`);
  });
});
