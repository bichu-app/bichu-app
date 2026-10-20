/**
 * A consulta da listagem pública de perdidos não lê id interno nem dado do
 * tutor, e **os quatro predicados de publicação estão lá** — o SQL compilado
 * prova as duas coisas.
 *
 * O teste HTTP (`adapters/http/listagem-publica-de-perdidos.test.ts`) prova que
 * a resposta não carrega o que não deve. Ele não enxerga esta camada: com dublê
 * no lugar da porta, uma consulta que esquecesse `conta_habilitada` ou
 * `share_to_public_list` continuaria verde lá, e a listagem pública mostraria o
 * caso de uma conta desabilitada. Aqui se lê o SQL que o adaptador de fato
 * compila, com o compilador do Postgres e sem banco (mesmo instrumento de
 * `leitura-publica-do-caso-sem-dado-do-tutor.test.ts`).
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
import type { RecorteDePerdidos } from '../../ports/listagem-publica-de-perdidos.js';
import {
  construtorDaListagemPublicaDePerdidos,
  inicioDaJanela,
} from './kysely-listagem-publica-de-perdidos.js';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const AGORA = new Date('2026-10-18T12:00:00.000Z');

/**
 * O recorte MÍNIMO: só a cidade, que é o único obrigatório do contrato.
 *
 * **Sem `janela`, e essa é a forma que a página de pets abre** desde o pedido
 * do cliente de 18/10/2026. O recorte com janela virou um caso à parte
 * (`RECORTE_COM_JANELA`), para o mínimo ser o que a rota de fato recebe quando
 * ninguém escolheu nada.
 */
const RECORTE_MINIMO: RecorteDePerdidos = {
  // `aberto` é o conjunto que a ausência de `case_state` escolhe (20/10/2026).
  conjunto: 'aberto',
  cidade: 'São Paulo',
  pagina: 1,
  limite: 20,
  agora: AGORA,
};

const RECORTE_COM_JANELA: RecorteDePerdidos = { ...RECORTE_MINIMO, janela: '30d' };

/**
 * O recorte em que a tela de fato ABRE desde 19/10/2026: **sem cidade e sem
 * janela**. É o `const RecorteDePerdidos()` do app, e os 20 mais recentes de
 * qualquer cidade.
 */
const RECORTE_SEM_CIDADE: RecorteDePerdidos = {
  conjunto: 'aberto',
  pagina: 1,
  limite: 20,
  agora: AGORA,
};

const RECORTE_CHEIO: RecorteDePerdidos = {
  ...RECORTE_COM_JANELA,
  bairro: 'Vila Mariana',
  especie: 'dog',
  porte: 'P',
  termo: 'Mel',
};

/** O trecho entre `select` e o primeiro `from`: o que a consulta devolve. */
function listaDeSaida(sql: string): string {
  const achado = /^select\s+([\s\S]*?)\s+from\s+"lost_cases"/i.exec(sql);
  assert.ok(achado !== null, `não achei a lista de saída. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

/** Só a cláusula `WHERE` do SQL compilado. */
function clausulaWhere(sql: string): string {
  const achado = /\swhere\s([\s\S]*)$/i.exec(sql);
  assert.ok(achado !== null, `não achei o \`WHERE\`. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

/** A consulta da PÁGINA, com a lista de colunas que de fato sai. */
function sqlDaPagina(recorte: RecorteDePerdidos): string {
  return construtorDaListagemPublicaDePerdidos(semBanco, recorte)
    .select([
      'lost_cases.share_token as share_token',
      'lost_cases.last_seen_at as last_seen_at',
      'lost_cases.last_seen_city as last_seen_city',
      'lost_cases.last_seen_neighborhood as last_seen_neighborhood',
      'pets.name as name',
      'pets.species_code as species_code',
      'pets.size_code as size_code',
      'pets.breed_free_text as breed_free_text',
      'ref_breeds.label as breed_label',
      'ref_colors.label as color_label',
      'pet_photos.thumb_key as thumb_key',
    ])
    .compile().sql;
}

/**
 * Colunas que não podem ser SAÍDA desta consulta. `owner_user_id` fica de fora
 * desta lista porque ele aparece, legitimamente, dentro de
 * `conta_habilitada(...)` no `WHERE`; o caso próprio abaixo cobra que ele só
 * apareça assim.
 */
const SAIDAS_PROIBIDAS: readonly RegExp[] = [
  /"lost_cases"\."id"/,
  /"pets"\."id"/,
  /"pet_id"/,
  /"last_seen_point"/,
  /"last_seen_state"/,
  /"microchip_number"/,
  /"sinpatinhas_id"/,
  /"original_key"/,
  /"card_key"/,
  /"users"/,
  /"email/,
  /"phone/,
];

void describe('a listagem pública de perdidos não seleciona id interno nem dado do tutor', () => {
  for (const [rotulo, recorte] of [
    ['recorte mínimo', RECORTE_MINIMO],
    ['recorte cheio', RECORTE_CHEIO],
  ] as const) {
    void it(`${rotulo}: a lista de saída não tem coluna proibida`, () => {
      const sql = sqlDaPagina(recorte);
      const saida = listaDeSaida(sql);
      for (const proibida of SAIDAS_PROIBIDAS) {
        assert.doesNotMatch(saida, proibida, `coluna proibida na saída. SQL compilado: ${sql}`);
      }
    });

    void it(`${rotulo}: a consulta não junta \`users\``, () => {
      assert.doesNotMatch(sqlDaPagina(recorte), /"users"/);
    });

    void it(`${rotulo}: a coordenada não é lida nem filtrada`, () => {
      // Nem na saída, nem no `WHERE`: não há geocodificação (ADR-0006) e um
      // ponto por caso permitiria montar o mapa que a privacidade impede.
      assert.doesNotMatch(sqlDaPagina(recorte), /last_seen_point/);
    });

    void it(`${rotulo}: \`owner_user_id\` aparece SÓ dentro de \`conta_habilitada\``, () => {
      const sql = sqlDaPagina(recorte);
      const ocorrencias = sql.match(/owner_user_id/g) ?? [];
      assert.equal(ocorrencias.length, 1, `SQL compilado: ${sql}`);
      assert.match(sql, /conta_habilitada\(lost_cases\.owner_user_id\)/);
    });
  }

  void it('a foto vem da derivada `thumb`, e nunca da `card` de 1024 px', () => {
    // 121 KiB de imagem decodificada por cartão contra 4,42 MiB: é a diferença
    // entre 2,37 MiB e 88 MiB numa página de vinte. A `card` é do cartaz.
    const sql = sqlDaPagina(RECORTE_MINIMO);
    assert.match(sql, /"pet_photos"\."thumb_key"/);
    assert.doesNotMatch(sql, /card_key/);
  });
});

void describe('os quatro predicados de publicação estão no `WHERE`', () => {
  void it('caso aberto, publicado na lista, conta habilitada e pet vivo', () => {
    const sql = sqlDaPagina(RECORTE_MINIMO);
    assert.match(sql, /"lost_cases"\."status" = \$\d+/, `SQL compilado: ${sql}`);
    assert.match(sql, /"lost_cases"\."share_to_public_list" = \$\d+/, `SQL compilado: ${sql}`);
    assert.match(sql, /conta_habilitada\(lost_cases\.owner_user_id\)/, `SQL compilado: ${sql}`);
    assert.match(sql, /"pets"\."deleted_at" is null/, `SQL compilado: ${sql}`);
    assert.match(sql, /"pets"\."status" not in/, `SQL compilado: ${sql}`);
  });

  void it('os parâmetros dos predicados são os valores certos, e nessa ordem', () => {
    const { parameters } = construtorDaListagemPublicaDePerdidos(
      semBanco,
      RECORTE_MINIMO,
    ).compile();
    // Os dois primeiros são da JUNÇÃO da foto (`is_primary` e `status`), que
    // vem antes do `WHERE` no SQL compilado; depois `open`, `true` e os dois
    // estados de pet sem caso público. A ordem é medida e não suposta: a
    // primeira versão desta isca contava do `WHERE` e reprovou.
    assert.deepEqual(parameters.slice(0, 6), [
      true,
      'ready',
      'open',
      true,
      'deceased',
      'archived',
    ]);
  });

  void it('a cidade e o bairro comparam por texto normalizado, nunca por `=` cru', () => {
    const sql = sqlDaPagina(RECORTE_CHEIO);
    assert.match(
      sql,
      /texto_para_busca\(lost_cases\.last_seen_city\) = texto_para_busca\(\$\d+\)/,
    );
    assert.match(
      sql,
      /texto_para_busca\(lost_cases\.last_seen_neighborhood\) = texto_para_busca\(\$\d+\)/,
    );
  });

  void it('o termo de busca usa `padrao_de_busca`, que neutraliza `%` e `_`', () => {
    // Sem isso, `q=%` devolveria a tabela inteira numa varredura completa.
    assert.match(sqlDaPagina(RECORTE_CHEIO), /texto_para_busca\(pets\.name\) like padrao_de_busca/i);
  });

  void it('sem bairro, sem espécie, sem porte e sem termo, os predicados NÃO entram', () => {
    // Confere o `WHERE`, e não o SQL inteiro: `species_code` e `size_code` são
    // colunas de SAÍDA desta consulta, então procurá-las no texto todo reprova
    // sempre — foi assim que esta isca reprovou na primeira rodada.
    const onde = clausulaWhere(sqlDaPagina(RECORTE_MINIMO));
    assert.doesNotMatch(onde, /last_seen_neighborhood\) = texto_para_busca/);
    assert.doesNotMatch(onde, /"pets"\."species_code"/);
    assert.doesNotMatch(onde, /"pets"\."size_code"/);
    assert.doesNotMatch(onde, /padrao_de_busca/);
  });

  void it('CONTRAPESO: com o recorte cheio, os quatro predicados ENTRAM', () => {
    // Sem este caso o de cima passaria com um `WHERE` que ignora os filtros.
    const onde = clausulaWhere(sqlDaPagina(RECORTE_CHEIO));
    assert.match(onde, /last_seen_neighborhood\) = texto_para_busca/);
    assert.match(onde, /"pets"\."species_code"/);
    assert.match(onde, /"pets"\."size_code"/);
    assert.match(onde, /padrao_de_busca/);
  });

  void it('a ordem é `last_seen_at desc` com o `share_token` como desempate estável', () => {
    // Sem desempate, `offset` devolve ordem arbitrária entre casos com o mesmo
    // instante, e a página 2 repete ou pula caso.
    const sql = sqlDaPagina(RECORTE_MINIMO);
    assert.match(
      `${sql} ${construtorDaListagemPublicaDePerdidos(semBanco, RECORTE_MINIMO)
        .select('lost_cases.share_token')
        .orderBy('lost_cases.last_seen_at', 'desc')
        .orderBy('lost_cases.share_token', 'asc')
        .compile().sql}`,
      /order by "lost_cases"\."last_seen_at" desc, "lost_cases"\."share_token" asc/,
    );
  });
});

void describe('a ausência de `period` é janela ABERTA, e não 30 dias', () => {
  /**
   * ISCA: a prova de ponta desta camada. Reponha `janela: '30d'` em
   * `RECORTE_MINIMO` (ou volte o `.where('lost_cases.last_seen_at', ...)` para
   * fora do `if` no adaptador) e este caso reprova pelo nome.
   *
   * Por que ler o SQL e não o resultado: o predicado que não existe não
   * aparece em contagem nenhuma. A única forma de afirmar "a consulta não
   * recorta por data" é olhar a cláusula que ela compila.
   */
  void it('ISCA: recorte sem janela não compila predicado de `last_seen_at`', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_MINIMO));
    assert.doesNotMatch(
      onde,
      /"lost_cases"\."last_seen_at"/,
      `janela aberta não pode recortar por data. WHERE compilado: ${onde}`,
    );
  });

  void it('CONTRAPESO: com janela, o predicado de `last_seen_at` está lá', () => {
    // Sem este caso, tirar a janela de TODA consulta passaria pela isca acima.
    assert.match(
      clausulaWhere(sqlDaPagina(RECORTE_COM_JANELA)),
      /"lost_cases"\."last_seen_at" >= \$/,
    );
  });

  /**
   * ISCA (a) no nível do SQL: o pedido do cliente de 19/10/2026 (*"o campo
   * cidade do filtro da página pet não deve ser obrigatório"*).
   *
   * **Este caso era o oposto até hoje**, e vale registrar o que ele afirmava:
   * *"a cidade continua recortando mesmo sem janela: não é listagem
   * nacional"*, com o comentário *"o ADR-0010 não quer um inventário nacional
   * de animais perdidos"*. **Essa frase não está no ADR-0010.** Foi conferida
   * antes de sair: o que o ADR-0010 exige são os itens 4 e 5 e a linha *"o
   * nível máximo de precisão geográfica em superfície pública é bairro e
   * cidade"* — tudo sobre a PRECISÃO do que sai, e a projeção pública não
   * mudou uma propriedade. Nenhum item daquela lista fala do ESCOPO da
   * listagem, e a obrigatoriedade era leitura do código, não do documento.
   *
   * O que a ausência de cidade amplia de verdade é ENUMERAÇÃO, e a contenção
   * não mudou: os três tetos por `ip` do contrato, a paginação de 20 e o
   * predicado `share_to_public_list`.
   *
   * DESLIGANDO: tire o `if (recorte.cidade !== undefined)` do adaptador e
   * este caso reprova pelo nome.
   */
  void it('ISCA: recorte sem cidade não compila predicado de `last_seen_city`', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_SEM_CIDADE));
    assert.doesNotMatch(
      onde,
      /last_seen_city/,
      `geografia aberta não pode recortar por cidade. WHERE compilado: ${onde}`,
    );
  });

  void it('CONTRAPESO: com cidade, o predicado normalizado está lá', () => {
    // Sem este caso, tirar a cidade de TODA consulta passaria pela isca acima —
    // e a folha de filtro passaria a mentir para quem digitou uma cidade.
    assert.match(
      clausulaWhere(sqlDaPagina(RECORTE_MINIMO)),
      /texto_para_busca\(lost_cases\.last_seen_city\) = texto_para_busca\(\$/,
    );
  });

  /**
   * A ORDEM NÃO SE PROVA NESTE ARQUIVO, E ISSO FOI MEDIDO.
   *
   * `sqlDaPagina` compila `construtorDaListagemPublicaDePerdidos`, que é a
   * consulta BASE — predicados e junções. O `ORDER BY last_seen_at DESC,
   * share_token ASC`, o `LIMIT` e o `OFFSET` moram em
   * `criarListagemPublicaDePerdidos`, depois do construtor, e **não aparecem no
   * SQL que este ajudante compila**: uma isca escrita aqui para
   * `/order by .* last_seen_at desc/` reprovou de imediato em 19/10/2026.
   *
   * Escrever o `ORDER BY` à mão dentro de `sqlDaPagina` faria o caso passar
   * medindo a cópia do próprio teste. A prova de que "os 20 últimos pets" são
   * os mais recentes **pela data** mora em
   * `tests/integration/listagem-publica-de-perdidos.test.ts`, contra Postgres,
   * no caso 'ISCA: os 20 do recorte padrão sao os mais RECENTES, pela data'.
   */
  /**
   * ISCA do ADR-0006 na camada que toca o banco: **nada nesta consulta
   * converte coordenada em nome de cidade, nem o contrário.**
   *
   * Ancorada no SQL que o construtor COMPILA, e não num comentário: a consulta
   * não pode mencionar a coluna de coordenada nem função geoespacial nenhuma.
   * Se alguém acrescentar `ST_Distance`, `ST_DWithin`, um `ST_Y`/`ST_X` para
   * derivar rótulo, ou simplesmente ler `last_seen_point`, este caso reprova.
   *
   * O ADR-0006 proíbe as duas direções com todas as letras: *"não há serviço
   * de geocodificação contratado"* (coordenada não vira rótulo), e *"CEP e
   * bairro são rótulo de exibição e filtro de listagem, não fonte de
   * coordenada"* (rótulo não vira coordenada).
   *
   * DESLIGANDO: acrescente `last_seen_point` à lista de seleção do adaptador,
   * ou um `ST_Distance` à ordenação, e este caso reprova pelo nome.
   */
  void it('ISCA: a consulta não toca coordenada nem função geoespacial', () => {
    for (const [rotulo, recorte] of [
      ['sem cidade', RECORTE_SEM_CIDADE],
      ['com cidade', RECORTE_MINIMO],
      ['cheio', RECORTE_CHEIO],
    ] as const) {
      const sql = sqlDaPagina(recorte);
      // **A EXPRESSÃO É SENSÍVEL À CAIXA E ANCORADA EM `\b`, e isso foi um
      // defeito medido.** A primeira versão usava `/ST_[A-Za-z]/i`, e ela
      // reprovava sempre: `lost_cases` contém `st_c`. Achado falso é como
      // portão perde a confiança de quem o lê, e aqui ele reprovaria o arquivo
      // inteiro por um nome de tabela.
      assert.doesNotMatch(
        sql,
        /last_seen_point|reference_point|geohash|::geometry|\bgeography\b|\bST_(Distance|DWithin|MakePoint|SetSRID|AsText|X|Y|Point)\b/,
        `o recorte "${rotulo}" trouxe geoespacial para a listagem pública. SQL: ${sql}`,
      );
    }
  });
});

void describe('a janela sai do relógio injetado, e não do `now()` do banco', () => {
  void it('`24h`, `7d` e `30d` recuam as horas que o contrato declara', () => {
    assert.equal(
      inicioDaJanela(AGORA, '24h').toISOString(),
      '2026-10-17T12:00:00.000Z',
    );
    assert.equal(inicioDaJanela(AGORA, '7d').toISOString(), '2026-10-11T12:00:00.000Z');
    assert.equal(inicioDaJanela(AGORA, '30d').toISOString(), '2026-09-18T12:00:00.000Z');
  });

  void it('o SQL não chama `now()`: dois relógios na mesma decisão é falha falsa', () => {
    // `RECORTE_COM_JANELA` e não `RECORTE_MINIMO`: o mínimo não tem janela, e
    // uma consulta sem predicado de data nenhum passaria por este caso sem
    // provar nada sobre de onde a data vem.
    assert.doesNotMatch(sqlDaPagina(RECORTE_COM_JANELA), /now\(\)/i);
  });
});
