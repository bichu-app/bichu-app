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

const RECORTE_SEM_BAIRRO: RecorteDoDiretorio = {
  chamador: '01a15623-b345-709f-ac33-75c9bae66143' as RecorteDoDiretorio['chamador'],
  familia: undefined,
  agora: Date.parse('2026-10-19T21:00:00.000Z') as RecorteDoDiretorio['agora'],
  sort: 'name',
  page: 1,
  limit: 20,
};

const RECORTE_COM_BAIRRO: RecorteDoDiretorio = {
  ...RECORTE_SEM_BAIRRO,
  neighborhood: 'Jardim America',
};

function sqlDaListagem(recorte: RecorteDoDiretorio): string {
  return construtorDaListagem(semBanco, recorte).select(['slug']).compile().sql;
}

function clausulaWhere(sql: string): string {
  const achado = /\swhere\s([\s\S]*)$/i.exec(sql);
  assert.ok(achado?.[1] !== undefined, `SQL sem clausula where: ${sql}`);
  return achado[1];
}

const ENTRADA_DO_JARDIM_AMERICA: EntradaDoDiretorio = {
  slug: 'hospital-mais-pet',
  kinds: ['clinic'],
  entityKind: 'professional',
  displayName: 'Hospital Mais Pet',
  about: null,
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Jardim América',
  phoneE164: '+5511910981784',
  siteUrl: null,
  verificacoes: [],
  distanciaEmMetros: null,
  logoPublicKey: null,
  pontuacao: PONTUACAO_VAZIA,
};

void describe('ISCA: o bairro compara por texto normalizado, nunca por `lower()`', () => {
  void it('o predicado de bairro passa pelas DUAS pontas de `texto_para_busca`', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_BAIRRO));
    assert.match(
      onde,
      /texto_para_busca\(professionals\.neighborhood\) = texto_para_busca\(\$\d+\)/,
      `WHERE compilado: ${onde}`,
    );
  });

  void it('`lower(neighborhood)` NAO aparece mais em predicado nenhum', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_BAIRRO));
    assert.doesNotMatch(onde, /lower\(neighborhood\)/i, `WHERE compilado: ${onde}`);
  });

  void it('o parametro de bairro que chega ao banco e o texto CRU, sem normalizacao em TypeScript', () => {
    const { parameters } = construtorDaListagem(semBanco, RECORTE_COM_BAIRRO)
      .select(['slug'])
      .compile();
    assert.ok(
      parameters.includes('Jardim America'),
      `parametros compilados: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTRAPESO: sem `neighborhood` no recorte, o predicado NAO entra', () => {
    const onde = clausulaWhere(sqlDaListagem(RECORTE_SEM_BAIRRO));
    assert.doesNotMatch(onde, /professionals\.neighborhood/i, `WHERE compilado: ${onde}`);
  });
});

void describe('ISCA: normalizar a comparacao de bairro nao muda o que a resposta DEVOLVE', () => {
  void it('o bairro sai da borda EXATAMENTE como veio do banco, com acento e com maiuscula', () => {
    const saida = projetarEntrada(ENTRADA_DO_JARDIM_AMERICA, (chave) => `https://img/${chave}`);
    assert.equal(saida.neighborhood, 'Jardim América');
    assert.notEqual(saida.neighborhood, 'jardim america');
    assert.notEqual(saida.neighborhood, 'Jardim America');
    assert.notEqual(saida.neighborhood, 'jardim américa');
  });

  void it('GUARDA DA ISCA: o bairro medido tem acento e maiuscula de verdade', () => {
    assert.equal(ENTRADA_DO_JARDIM_AMERICA.neighborhood, 'Jardim América');
    assert.notEqual(
      ENTRADA_DO_JARDIM_AMERICA.neighborhood,
      ENTRADA_DO_JARDIM_AMERICA.neighborhood?.normalize('NFD').replace(/[̀-ͯ]/gu, ''),
    );
  });
});
