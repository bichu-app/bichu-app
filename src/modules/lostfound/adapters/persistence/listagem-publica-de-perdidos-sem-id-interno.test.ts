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

const RECORTE_MINIMO: RecorteDePerdidos = {
  conjunto: 'aberto',
  cidade: 'São Paulo',
  pagina: 1,
  limite: 20,
  agora: AGORA,
};

const RECORTE_COM_JANELA: RecorteDePerdidos = { ...RECORTE_MINIMO, janela: '30d' };

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

function listaDeSaida(sql: string): string {
  const achado = /^select\s+([\s\S]*?)\s+from\s+"lost_cases"/i.exec(sql);
  assert.ok(achado !== null, `não achei a lista de saída. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

function clausulaWhere(sql: string): string {
  const achado = /\swhere\s([\s\S]*)$/i.exec(sql);
  assert.ok(achado !== null, `não achei o \`WHERE\`. SQL compilado: ${sql}`);
  return achado[1] ?? '';
}

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
    assert.match(sqlDaPagina(RECORTE_CHEIO), /texto_para_busca\(pets\.name\) like padrao_de_busca/i);
  });

  void it('sem bairro, sem espécie, sem porte e sem termo, os predicados NÃO entram', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_MINIMO));
    assert.doesNotMatch(onde, /last_seen_neighborhood\) = texto_para_busca/);
    assert.doesNotMatch(onde, /"pets"\."species_code"/);
    assert.doesNotMatch(onde, /"pets"\."size_code"/);
    assert.doesNotMatch(onde, /padrao_de_busca/);
  });

  void it('CONTRAPESO: com o recorte cheio, os quatro predicados ENTRAM', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_CHEIO));
    assert.match(onde, /last_seen_neighborhood\) = texto_para_busca/);
    assert.match(onde, /"pets"\."species_code"/);
    assert.match(onde, /"pets"\."size_code"/);
    assert.match(onde, /padrao_de_busca/);
  });

  void it('a ordem é `last_seen_at desc` com o `share_token` como desempate estável', () => {
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
  void it('ISCA: recorte sem janela não compila predicado de `last_seen_at`', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_MINIMO));
    assert.doesNotMatch(
      onde,
      /"lost_cases"\."last_seen_at"/,
      `janela aberta não pode recortar por data. WHERE compilado: ${onde}`,
    );
  });

  void it('CONTRAPESO: com janela, o predicado de `last_seen_at` está lá', () => {
    assert.match(
      clausulaWhere(sqlDaPagina(RECORTE_COM_JANELA)),
      /"lost_cases"\."last_seen_at" >= \$/,
    );
  });

  void it('ISCA: recorte sem cidade não compila predicado de `last_seen_city`', () => {
    const onde = clausulaWhere(sqlDaPagina(RECORTE_SEM_CIDADE));
    assert.doesNotMatch(
      onde,
      /last_seen_city/,
      `geografia aberta não pode recortar por cidade. WHERE compilado: ${onde}`,
    );
  });

  void it('CONTRAPESO: com cidade, o predicado normalizado está lá', () => {
    assert.match(
      clausulaWhere(sqlDaPagina(RECORTE_MINIMO)),
      /texto_para_busca\(lost_cases\.last_seen_city\) = texto_para_busca\(\$/,
    );
  });

  void it('ISCA: a consulta não toca coordenada nem função geoespacial', () => {
    for (const [rotulo, recorte] of [
      ['sem cidade', RECORTE_SEM_CIDADE],
      ['com cidade', RECORTE_MINIMO],
      ['cheio', RECORTE_CHEIO],
    ] as const) {
      const sql = sqlDaPagina(recorte);
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
    assert.doesNotMatch(sqlDaPagina(RECORTE_COM_JANELA), /now\(\)/i);
  });
});
