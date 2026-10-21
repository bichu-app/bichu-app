/**
 * O filtro de BAIRRO do diretorio compara SEM ACENTO, e a resposta continua
 * devolvendo o bairro COM acento.
 *
 * ## O defeito
 *
 * ```
 * GET /v1/directory/entries                               -> "neighborhood":"Jardim América"
 * GET /v1/directory/entries?neighborhood=Jardim%20America -> {"items":[],"total":0}
 * ```
 *
 * O predicado era `lower(neighborhood) = lower($1)`: baixa a caixa e **nao
 * tira o acento**. Quem digitava `Jardim America` nao achava nada, e a tela
 * nao dizia que o filtro falhou -- ela desenhava o estado vazio do recorte,
 * que AFIRMA que nao ha profissional naquele bairro.
 *
 * E o MESMO defeito que a cidade tinha ate 19/10/2026, no mesmo
 * `construtorDaListagem`, duas linhas abaixo. A cidade foi corrigida naquele
 * dia (`cidade-do-diretorio-normaliza-acento.test.ts`) e o bairro ficou de pe,
 * porque o pedido daquele dia era so a cidade. Enquanto ele ficou de pe, o
 * produto tinha DUAS regras de comparacao de bairro: a listagem publica de
 * perdidos ja comparava por
 * `texto_para_busca(lost_cases.last_seen_neighborhood) = texto_para_busca($1)`
 * (`kysely-listagem-publica-de-perdidos.ts`), entao o mesmo texto digitado do
 * mesmo jeito achava o pet perdido no bairro e nao achava o veterinario dele.
 *
 * ## Por que o instrumento e o SQL COMPILADO, e nao a rota
 *
 * O teste HTTP do diretorio poe duble no lugar da porta de persistencia: um
 * predicado que comparasse acento continuaria verde la, porque o duble nao
 * compara nada. E a camada de persistencia so e exercitada contra banco na
 * suite de integracao, que nao roda neste portao.
 *
 * Aqui se le o SQL que o adaptador de fato compila, com o compilador do
 * Postgres e sem banco -- mesmo instrumento do arquivo da cidade e de
 * `listagem-publica-de-perdidos-sem-id-interno.test.ts`.
 *
 * **O comportamento foi medido a mao contra um Postgres 16 com 20 000 linhas
 * publicadas e 100 em `Jardim América`** (19/10/2026): com o predicado velho,
 * `Jardim America` devolvia 0 linhas e `Jardim América` devolvia 100, por Seq
 * Scan nas duas grafias; com o novo e o indice
 * `professionals_bairro_normalizado`, as duas grafias devolvem 100 por Bitmap
 * Index Scan e `min(neighborhood)` continua sendo `Jardim América`.
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

const RECORTE_SEM_BAIRRO: RecorteDoDiretorio = {
  chamador: '01a15623-b345-709f-ac33-75c9bae66143' as RecorteDoDiretorio['chamador'],
  // `undefined` porque este arquivo mede a NORMALIZACAO DE ACENTO do filtro de
  // bairro, e nao distancia: sem aparelho nao ha ponto de referencia, a
  // distancia sai nula e a ordem sai por nome -- que e o que `sort` abaixo ja
  // pede. Campo acrescentado na mescla do terceiro lote de 20/10/2026, quando a
  // correcao do ponto por aparelho (SEC-021) tornou `familia` obrigatoria e
  // anulavel para forcar cada chamador a decidir.
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

/**
 * O SQL dos PREDICADOS da listagem.
 *
 * A lista de saida aqui e minima de proposito: o que a resposta devolve nao se
 * mede neste `select` -- ele e escrito pelo proprio teste, e conferi-lo seria
 * o teste medindo a si mesmo. Quem mede a saida e a segunda isca deste
 * arquivo, por `projetarEntrada`, que e a borda de verdade.
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

/** Uma entrada publicada em `Jardim América`, com o acento e a maiuscula. */
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
};

void describe('ISCA: o bairro compara por texto normalizado, nunca por `lower()`', () => {
  void it('o predicado de bairro passa pelas DUAS pontas de `texto_para_busca`', () => {
    // As duas pontas: a coluna e o parametro. Normalizar so um lado e o
    // defeito que o `lower(neighborhood) = lower($1)` tinha pela metade --
    // ele normalizava a caixa dos dois e o acento de nenhum.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_BAIRRO));
    assert.match(
      onde,
      /texto_para_busca\(professionals\.neighborhood\) = texto_para_busca\(\$\d+\)/,
      `WHERE compilado: ${onde}`,
    );
  });

  void it('`lower(neighborhood)` NAO aparece mais em predicado nenhum', () => {
    // Sem este caso, acrescentar a comparacao normalizada SEM tirar a antiga
    // passaria: as duas no `WHERE` com `and` fariam `Jardim America`
    // continuar devolvendo zero, porque a velha nunca casa.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_COM_BAIRRO));
    assert.doesNotMatch(onde, /lower\(neighborhood\)/i, `WHERE compilado: ${onde}`);
  });

  void it('o parametro de bairro que chega ao banco e o texto CRU, sem normalizacao em TypeScript', () => {
    // A normalizacao mora na funcao do banco, e so nela: uma segunda
    // definicao em TypeScript divergiria da expressao do indice
    // `professionals_bairro_normalizado` e o planejador deixaria de casar os
    // dois -- correto e lento, sem erro.
    const { parameters } = construtorDaListagem(semBanco, RECORTE_COM_BAIRRO)
      .select(['slug'])
      .compile();
    assert.ok(
      parameters.includes('Jardim America'),
      `parametros compilados: ${JSON.stringify(parameters)}`,
    );
  });

  void it('CONTRAPESO: sem `neighborhood` no recorte, o predicado NAO entra', () => {
    // Sem este caso, um predicado posto sempre -- comparando com nulo e
    // descartando a tabela inteira -- passaria nos tres de cima.
    const onde = clausulaWhere(sqlDaListagem(RECORTE_SEM_BAIRRO));
    assert.doesNotMatch(onde, /professionals\.neighborhood/i, `WHERE compilado: ${onde}`);
  });
});

void describe('ISCA: normalizar a comparacao de bairro nao muda o que a resposta DEVOLVE', () => {
  void it('o bairro sai da borda EXATAMENTE como veio do banco, com acento e com maiuscula', () => {
    // **O instrumento e `projetarEntrada`, e nao a lista de saida do SQL.**
    //
    // Conferir um `select` escrito pelo proprio teste nao mediria nada: a
    // projecao da rota mora em `criarDirectoryRepository`, e o teste estaria
    // conferindo a sua propria string. Foi o portao cego que a isca da cidade
    // teve de desfazer, e ele nao se repete aqui.
    //
    // `projetarEntrada` E a borda: e dela que sai o corpo de
    // `DirectoryEntrySummary`.
    const saida = projetarEntrada(ENTRADA_DO_JARDIM_AMERICA, (chave) => `https://img/${chave}`);
    assert.equal(saida.neighborhood, 'Jardim América');
    // Dito de outro jeito, para pegar tambem uma normalizacao parcial: o
    // bairro que sai NAO e a forma comparavel.
    assert.notEqual(saida.neighborhood, 'jardim america');
    assert.notEqual(saida.neighborhood, 'Jardim America');
    assert.notEqual(saida.neighborhood, 'jardim américa');
  });

  void it('GUARDA DA ISCA: o bairro medido tem acento e maiuscula de verdade', () => {
    // Sem esta guarda, uma massa que trouxesse `neighborhood: 'jardim
    // america'` faria os `notEqual` de cima passarem por coincidencia, sem
    // provar nada sobre a borda.
    assert.equal(ENTRADA_DO_JARDIM_AMERICA.neighborhood, 'Jardim América');
    assert.notEqual(
      ENTRADA_DO_JARDIM_AMERICA.neighborhood,
      ENTRADA_DO_JARDIM_AMERICA.neighborhood?.normalize('NFD').replace(/[̀-ͯ]/gu, ''),
    );
  });
});
