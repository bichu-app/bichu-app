/**
 * As DUAS LISTAS DE EXCECAO nao divergiram do banco.
 *
 * ===========================================================================
 * POR QUE ESTA ISCA EXISTE
 * ===========================================================================
 *
 * Quem APLICA o agrupamento e a regra do contador e o Postgres: as funcoes
 * `notificacao_nunca_agrupa(text)` e `notificacao_persiste_no_contador(text)`
 * da migracao `20261018000020`. O dominio carrega as MESMAS duas listas, e a
 * duplicacao e deliberada -- o dominio precisa delas para o app saber desenhar,
 * e para esta isca poder existir.
 *
 * Duas listas da mesma coisa divergem. Foi assim que `forbidden` saiu com 401
 * em dois caminhos neste repositorio, e e por isso que `ProblemType` passou a
 * ser gerado do contrato. Aqui nao ha gerador: a migracao e SQL, e TypeScript
 * nao a le em tempo de compilacao. Entao a conferencia e esta -- o teste LE a
 * migracao e compara.
 *
 * O que cada caso pega:
 *
 * 1. um tipo acrescentado a uma lista do dominio e nao a funcao SQL (ou o
 *    contrario) -- o agrupamento da tela discordaria do agrupamento do banco;
 * 2. `TIPOS_DE_AVISO` divergir do `CHECK` de `notification_items.item_kind` --
 *    um tipo que o dominio conhece e o banco recusa estoura na insercao do
 *    gatilho, e um que o banco aceita e o dominio nao conhece chega a borda
 *    como valor fora do `enum` do contrato;
 * 3. o TETO DE COMUNICADOS do dominio divergir do aplicado na funcao -- a
 *    previa diria "resta 1" sobre um teto que o banco ja fechou.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO MORA EM `adapters/persistence/` E NAO EM `domain/`
 * ===========================================================================
 *
 * Ele LE a migracao do disco, e `domain/` e `application/` nao conhecem
 * framework, banco, HTTP nem nuvem -- `src/architecture.rules.mjs` reprova
 * `node:fs` nas duas camadas, e com razao. A conferencia e justamente entre uma
 * constante do dominio e uma definicao de PERSISTENCIA, entao o lugar dela e do
 * lado da persistencia.
 *
 * ===========================================================================
 * POR QUE A LEITURA E POR EXPRESSAO REGULAR, E O QUE ISSO NAO PROVA
 * ===========================================================================
 *
 * O teste nao executa SQL: ele le o TEXTO da migracao. Isso prova que as listas
 * escritas coincidem, e **nao** prova que a funcao faz o que o nome dela diz --
 * isso foi medido em `BEGIN`/`ROLLBACK` contra um Postgres 16 com todas as
 * migracoes aplicadas. Uma reescrita da funcao que mantivesse a lista e mudasse
 * o corpo passaria por aqui, e e por isso que a medicao no banco nao e
 * dispensavel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/**
 * Os valores de `IN (...)` do corpo de uma funcao `notificacao_*`.
 *
 * Ancora no `CREATE FUNCTION` do nome pedido e para no `$$` de fechamento: sem
 * a ancora, a varredura acharia o `IN (...)` do `CHECK` da tabela e as duas
 * conferencias mediriam a mesma coisa.
 */
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

/** Os valores do `CHECK` de `notification_items.item_kind`. */
function tiposDoCheck(sql: string): string[] {
  const inicio = sql.indexOf('notification_items_tipo_conhecido');
  assert.notEqual(inicio, -1, 'REPROVA: nao achei o CHECK de item_kind na migracao');
  const trecho = sql.slice(inicio, inicio + 900);
  return [...trecho.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
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
    // Nao assertamos que sao diferentes: hoje sao iguais. O que este caso
    // registra e que elas sao DUAS, com duas razoes, para quem mudar uma saber
    // que nao mudou a outra.
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
      tiposDoCheck(migracao()).sort(),
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
