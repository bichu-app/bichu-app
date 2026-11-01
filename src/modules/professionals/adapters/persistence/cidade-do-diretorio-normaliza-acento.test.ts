import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { RecorteDoDiretorio } from '../../ports/directory-repository.js';
import { construtorDaListagem } from './kysely-directory-repository.js';
import {
  type EntradaDoDiretorio,
  projetarEntrada,
} from '../../domain/entrada-do-diretorio.js';
import { PONTUACAO_VAZIA } from '../../domain/avaliacao-do-local.js';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const RECORTE_SEM_CIDADE: RecorteDoDiretorio = {
  chamador: '01a15623-b345-709f-ac33-75c9bae66143' as RecorteDoDiretorio['chamador'],
  agora: Date.parse('2026-10-19T21:00:00.000Z') as RecorteDoDiretorio['agora'],
  familia: undefined,
  sort: 'name',
  page: 1,
  limit: 20,
};

const RECORTE_COM_CIDADE: RecorteDoDiretorio = {
  ...RECORTE_SEM_CIDADE,
  city: 'Sao Paulo',
};

function sqlDaListagem(recorte: RecorteDoDiretorio): string {
  return construtorDaListagem(semBanco, recorte).select(['slug']).compile().sql;
}

function clausulaWhere(sql: string): string {
  const achado = /\swhere\s([\s\S]*)$/i.exec(sql);
  assert.ok(achado?.[1] !== undefined, `SQL sem clausula where: ${sql}`);
  return achado[1];
}

const ENTRADA_DE_SAO_PAULO: EntradaDoDiretorio = {
  slug: 'hospital-mais-pet',
  kinds: ['clinic'],
  entityKind: 'professional',
  displayName: 'Hospital Mais Pet',
  about: null,
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Brooklin',
  phoneE164: '+5511910981784',
  siteUrl: null,
  verificacoes: [],
  distanciaEmMetros: null,
  logoPublicKey: null,
  pontuacao: PONTUACAO_VAZIA,
};

void describe('ISCA (d): a cidade compara por texto normalizado, nunca por `lower()`', () => {
  void it('o predicado de cidade passa pelas DUAS pontas de `texto_para_busca`', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_CIDADE));
    assert.match(
      onde,
      /texto_para_busca\(professionals\.city\) = texto_para_busca\(\$\d+\)/,
      `WHERE compilado: ${onde}`,
    );
  });

  void it('`lower(city)` NAO aparece mais em predicado nenhum', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_CIDADE));
    assert.doesNotMatch(onde, /lower\(city\)/i, `WHERE compilado: ${onde}`);
  });

  void it('o parametro que chega ao banco e o texto CRU, sem normalizacao em TypeScript', () => {
    const { parameters } = construtorDaListagem(semBanco, RECORTE_COM_CIDADE)
      .select(['slug'])
      .compile();
    assert.ok(
      parameters.includes('Sao Paulo'),
      `parametros compilados: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTRAPESO: sem `city` no recorte, o predicado NAO entra', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_SEM_CIDADE));
    assert.doesNotMatch(onde, /professionals\.city/i, `WHERE compilado: ${onde}`);
  });
});

void describe('ISCA (e): normalizar a COMPARACAO nao muda o que a resposta DEVOLVE', () => {
  void it('a cidade sai da borda EXATAMENTE como veio do banco, com til e com maiuscula', () => {
    const saida = projetarEntrada(ENTRADA_DE_SAO_PAULO, (chave) => `https://img/${chave}`);
    assert.equal(saida.city, 'São Paulo');
    assert.notEqual(saida.city, 'sao paulo');
    assert.notEqual(saida.city, 'Sao Paulo');
    assert.notEqual(saida.city, 'são paulo');
  });

  void it('GUARDA DA ISCA: a cidade medida tem acento e maiuscula de verdade', () => {
    assert.equal(ENTRADA_DE_SAO_PAULO.city, 'São Paulo');
    assert.notEqual(
      ENTRADA_DE_SAO_PAULO.city,
      ENTRADA_DE_SAO_PAULO.city?.normalize('NFD').replace(/[\u0300-\u036f]/gu, ''),
    );
  });
});
