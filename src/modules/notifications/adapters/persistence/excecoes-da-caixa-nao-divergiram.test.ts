import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { TETO_DIARIO_DE_COMUNICADOS } from '../../domain/comunicado.js';
import {
  TIPOS_DE_AVISO,
  TIPOS_QUE_NUNCA_AGRUPAM,
  TIPOS_QUE_PERSISTEM_NO_CONTADOR,
} from '../../domain/caixa.js';

const CAMINHO_DA_MIGRACAO = resolve(
  process.cwd(),
  'migrations/20261018000020_caixa-de-notificacoes-e-comunicado.sql',
);

function migracao(): string {
  return readFileSync(CAMINHO_DA_MIGRACAO, 'utf8');
}

function valoresDaFuncao(sql: string, nome: string): string[] {
  const inicio = sql.indexOf(`CREATE FUNCTION ${nome}(`);
  assert.notEqual(
    inicio,
    -1,
    `REPROVA: a funcao ${nome} nao existe na migracao. Se ela foi renomeada, esta isca ficou ` +
      'cega e precisa acompanhar o nome novo -- uma isca que nao acha o alvo aprova tudo em silencio',
  );
  const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
  const lista = /IN \(([^)]*)\)/.exec(corpo);
  assert.ok(lista, `REPROVA: nao achei a lista IN (...) no corpo de ${nome}`);
  return [...lista[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

function tiposDoCheck(): string[] {
  const dir = resolve(process.cwd(), 'migrations');
  const candidatas = readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .reverse();
  for (const nome of candidatas) {
    const sql = readFileSync(resolve(dir, nome), 'utf8');
    const descida = sql.indexOf('-- Down Migration');
    const subida = descida === -1 ? sql : sql.slice(0, descida);
    const inicio = subida.lastIndexOf('CHECK (item_kind IN (');
    if (inicio === -1) continue;
    assert.ok(
      subida.includes('notification_items_tipo_conhecido'),
      `REPROVA: ${nome} define o CHECK de item_kind sem a restricao nomeada ` +
        '`notification_items_tipo_conhecido`. A restricao foi renomeada, e `conjunto-exato-dos-' +
        'checks.test.ts` procura o nome antigo no catalogo -- ele reprovaria dizendo que a ' +
        'restricao desapareceu',
    );
    const fim = subida.indexOf('))', inicio);
    assert.notEqual(fim, -1, `REPROVA: o CHECK de item_kind em ${nome} nao fecha`);
    const valores = [...subida.slice(inicio, fim).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    assert.ok(valores.length > 0, `REPROVA: o CHECK de item_kind em ${nome} esta sem valores`);
    return valores;
  }
  assert.fail(
    'REPROVA: nenhuma migracao define a lista do CHECK de item_kind. Se a coluna foi renomeada, ' +
      'esta isca ficou cega e precisa acompanhar o nome novo -- uma isca que nao acha o alvo ' +
      'aprova tudo em silencio',
  );
}

void describe('as excecoes da caixa nao divergiram do banco', () => {
  void it('1. TIPOS_QUE_NUNCA_AGRUPAM e a funcao notificacao_nunca_agrupa dizem o mesmo', () => {
    assert.deepEqual(
      [...TIPOS_QUE_NUNCA_AGRUPAM].sort(),
      valoresDaFuncao(migracao(), 'notificacao_nunca_agrupa').sort(),
      'REPROVA: a lista do dominio e a da funcao SQL divergiram. O agrupamento da tela passaria ' +
        'a discordar do agrupamento que o banco aplica, e o sintoma seria "2 avisos de plaquinha" ' +
        'escondendo qual pet -- que e o defeito que a excecao existe para impedir',
    );
  });

  void it('1b. TIPOS_QUE_PERSISTEM_NO_CONTADOR e a funcao irma dizem o mesmo', () => {
    assert.deepEqual(
      [...TIPOS_QUE_PERSISTEM_NO_CONTADOR].sort(),
      valoresDaFuncao(migracao(), 'notificacao_persiste_no_contador').sort(),
      'REPROVA: a lista do dominio e a da funcao SQL divergiram. Plaquinha e achado deixariam ' +
        'de atravessar o zero do contador, e o aviso de um pet na rua sumiria do numero ao abrir ' +
        'a lista -- que e o unico custo irreversivel desta caixa',
    );
  });

  void it('1c. as duas listas sao SEPARADAS, mesmo coincidindo hoje', () => {
    assert.deepEqual(
      [...TIPOS_QUE_NUNCA_AGRUPAM].sort(),
      [...TIPOS_QUE_PERSISTEM_NO_CONTADOR].sort(),
      'As duas listas deixaram de coincidir. Isto NAO e necessariamente um defeito -- elas sao ' +
        'duas regras com duas razoes. Confira se a mudanca foi intencional e atualize este caso',
    );
  });

  void it('2. TIPOS_DE_AVISO e o CHECK de item_kind dizem o mesmo', () => {
    assert.deepEqual(
      [...TIPOS_DE_AVISO].sort(),
      tiposDoCheck().sort(),
      'REPROVA: os tipos do dominio e os do CHECK divergiram. Um tipo que o dominio conhece e o ' +
        'banco recusa estoura na insercao do gatilho; um que o banco aceita e o dominio nao ' +
        'conhece chega a borda como valor fora do enum do contrato',
    );
  });

  void it('3. o teto de comunicados do dominio e o mesmo aplicado na funcao', () => {
    const sql = migracao();
    const inicio = sql.indexOf('CREATE FUNCTION comunicado_disparar(');
    assert.notEqual(inicio, -1, 'REPROVA: nao achei comunicado_disparar na migracao');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    const teto = /v_hoje >= (\d+)/.exec(corpo);
    assert.ok(teto, 'REPROVA: nao achei a comparacao do teto no corpo de comunicado_disparar');
    assert.equal(
      Number(teto[1]),
      TETO_DIARIO_DE_COMUNICADOS,
      'REPROVA: o teto do dominio e o aplicado no banco divergiram. A pre-visualizacao diria ' +
        '"resta 1" sobre um teto que o banco ja fechou, e o operador descobriria pelo 409',
    );
  });
});
