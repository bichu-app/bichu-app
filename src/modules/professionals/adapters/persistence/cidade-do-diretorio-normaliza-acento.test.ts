/**
 * O filtro de cidade do diretorio compara SEM ACENTO, e a resposta continua
 * devolvendo a cidade COM acento.
 *
 * ## O defeito, medido na homologacao em 19/10/2026 com conta valida
 *
 * ```
 * GET /v1/directory/entries                  -> 200 [{... "city":"São Paulo" ...}] total 1
 * GET /v1/directory/entries?city=Sao%20Paulo -> 200 {"items":[],"total":0}
 * ```
 *
 * O predicado era `lower(city) = lower($1)`: baixa a caixa e **nao tira o
 * acento**. Quem digitava `Sao Paulo` nao achava nada, e a tela nao dizia que
 * o filtro falhou -- ela desenhava o estado vazio do recorte, que AFIRMA que
 * nao ha profissional naquela regiao.
 *
 * ## Por que o instrumento e o SQL COMPILADO, e nao a rota
 *
 * O teste HTTP do diretorio poe duble no lugar da porta de persistencia: um
 * predicado que comparasse acento continuaria verde la, porque o duble nao
 * compara nada. E a camada de persistencia so e exercitada contra banco na
 * suite de integracao, que nao roda neste portao.
 *
 * Aqui se le o SQL que o adaptador de fato compila, com o compilador do
 * Postgres e sem banco -- mesmo instrumento de
 * `listagem-publica-de-perdidos-sem-id-interno.test.ts`, que e justamente o
 * arquivo que ja cobrava esta mesma normalizacao do OUTRO lado do produto.
 *
 * **O comportamento foi medido a mao contra um Postgres 16 com 20 000 linhas
 * publicadas e 100 em `São Paulo`** (19/10/2026): com o predicado velho,
 * `Sao Paulo` devolvia 0 linhas e `São Paulo` devolvia 100; com o novo, as
 * duas grafias devolvem 100 e `min(city)` continua sendo `São Paulo`.
 */
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
  // SEC-021: este arquivo compila o SQL do FILTRO de cidade, que nao toca o
  // ponto de referencia. Sem aparelho o ponto e `null::geography`, e e o
  // recorte mais simples que ainda exercita o que ele mede.
  familia: undefined,
  sort: 'name',
  page: 1,
  limit: 20,
};

const RECORTE_COM_CIDADE: RecorteDoDiretorio = {
  ...RECORTE_SEM_CIDADE,
  city: 'Sao Paulo',
};

/**
 * O SQL dos PREDICADOS da listagem.
 *
 * A lista de saida aqui e minima de proposito: o que a resposta devolve nao se
 * mede neste `select` -- ele e escrito pelo proprio teste, e conferi-lo seria
 * o teste medindo a si mesmo. Quem mede a saida e a isca (e), por
 * `projetarEntrada`, que e a borda de verdade.
 */
function sqlDaListagem(recorte: RecorteDoDiretorio): string {
  return construtorDaListagem(semBanco, recorte).select(['slug']).compile().sql;
}

/** O trecho depois do primeiro `where`: os predicados, e nada mais. */
function clausulaWhere(sql: string): string {
  const achado = /\swhere\s([\s\S]*)$/i.exec(sql);
  assert.ok(achado?.[1] !== undefined, `SQL sem clausula where: ${sql}`);
  return achado[1];
}

/** Uma entrada publicada em `São Paulo`, com o til e a maiuscula. */
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
};

void describe('ISCA (d): a cidade compara por texto normalizado, nunca por `lower()`', () => {
  void it('o predicado de cidade passa pelas DUAS pontas de `texto_para_busca`', () => {
    // As duas pontas: a coluna e o parametro. Normalizar so um lado e o
    // defeito que o `lower(city) = lower($1)` tinha pela metade -- ele
    // normalizava a caixa dos dois e o acento de nenhum.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_CIDADE));
    assert.match(
      onde,
      /texto_para_busca\(professionals\.city\) = texto_para_busca\(\$\d+\)/,
      `WHERE compilado: ${onde}`,
    );
  });

  void it('`lower(city)` NAO aparece mais em predicado nenhum', () => {
    // Sem este caso, acrescentar a comparacao normalizada SEM tirar a antiga
    // passaria: as duas no `WHERE` com `and` fariam `Sao Paulo` continuar
    // devolvendo zero, porque a velha nunca casa.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_CIDADE));
    assert.doesNotMatch(onde, /lower\(city\)/i, `WHERE compilado: ${onde}`);
  });

  void it('o parametro que chega ao banco e o texto CRU, sem normalizacao em TypeScript', () => {
    // A normalizacao mora na funcao do banco, e so nela: uma segunda
    // definicao em TypeScript divergiria da expressao do indice e o
    // planejador deixaria de casar os dois -- correto e lento, sem erro.
    const { parameters } = construtorDaListagem(semBanco, RECORTE_COM_CIDADE)
      .select(['slug'])
      .compile();
    assert.ok(
      parameters.includes('Sao Paulo'),
      `parametros compilados: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTRAPESO: sem `city` no recorte, o predicado NAO entra', () => {
    // Sem este caso, um predicado posto sempre -- comparando com nulo e
    // descartando a tabela inteira -- passaria nos tres de cima.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_SEM_CIDADE));
    assert.doesNotMatch(onde, /professionals\.city/i, `WHERE compilado: ${onde}`);
  });
});

void describe('ISCA (e): normalizar a COMPARACAO nao muda o que a resposta DEVOLVE', () => {
  void it('a cidade sai da borda EXATAMENTE como veio do banco, com til e com maiuscula', () => {
    // **O instrumento e `projetarEntrada`, e nao a lista de saida do SQL.**
    //
    // A primeira versao desta isca compilava um `select` escrito pelo proprio
    // teste e conferia que `city` saia cru -- e isso nao media nada: a
    // projecao da rota mora em `criarDirectoryRepository`, e o teste estava
    // conferindo a sua propria string. Portao cego exatamente da forma que
    // este repositorio ja pagou sete vezes nesta rodada.
    //
    // `projetarEntrada` E a borda: e dela que sai o corpo de
    // `DirectoryEntrySummary`. Medido na homologacao: a resposta devolve
    // `"city":"São Paulo"`, e `applied_filters` devolve o que foi digitado.
    const saida = projetarEntrada(ENTRADA_DE_SAO_PAULO, (chave) => `https://img/${chave}`);
    assert.equal(saida.city, 'São Paulo');
    // Dito de outro jeito, para pegar tambem uma normalizacao parcial: a
    // cidade que sai NAO e a forma comparavel.
    assert.notEqual(saida.city, 'sao paulo');
    assert.notEqual(saida.city, 'Sao Paulo');
    assert.notEqual(saida.city, 'são paulo');
  });

  void it('GUARDA DA ISCA: a cidade medida tem acento e maiuscula de verdade', () => {
    // Sem esta guarda, uma massa que trouxesse `city: 'sao paulo'` faria os
    // `notEqual` de cima passarem por coincidencia, sem provar nada sobre a
    // borda.
    assert.equal(ENTRADA_DE_SAO_PAULO.city, 'São Paulo');
    assert.notEqual(
      ENTRADA_DE_SAO_PAULO.city,
      ENTRADA_DE_SAO_PAULO.city?.normalize('NFD').replace(/[\u0300-\u036f]/gu, ''),
    );
  });
});
