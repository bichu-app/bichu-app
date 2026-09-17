/**
 * Testes do portão de tipos de problema.
 *
 * Quase todos os casos aqui são negativos, e é de propósito: um portão só
 * promete uma coisa, que é **reprovar o que deve reprovar**. Prova negativa que
 * vive numa frase evapora — ninguém consegue reexecutá-la, e ela não acusa no
 * dia em que a regra deixa de funcionar. Por isso as iscas moram no
 * repositório e rodam a cada execução.
 *
 * O último caso é o oposto: ele confere o `api/openapi.yaml` de verdade contra
 * a tabela que o código usa. É esse que reprova quando o contrato ganha um tipo
 * e ninguém roda `npm run generate:types`.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { STATUS_DO_PROBLEMA } from '../shared/types/generated/problem-types.js';
import {
  conferir,
  conferirContraOContrato,
  tabelaDoContrato,
  type TabelaDeStatus,
} from './conferir-tipos-de-problema.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

const CONTRATO_MINIMO = {
  'x-problem-types': [
    { slug: 'forbidden', status: 403 },
    { slug: 'unauthenticated', status: 401 },
  ],
};

void describe('leitura de x-problem-types', () => {
  void it('lê slug e status', () => {
    assert.deepEqual(tabelaDoContrato(CONTRATO_MINIMO, 'isca'), {
      forbidden: 403,
      unauthenticated: 401,
    });
  });

  void it('reprova contrato sem `x-problem-types` em vez de aprovar por ausência', () => {
    assert.throws(() => tabelaDoContrato({ paths: {} }, 'isca'), /x-problem-types/);
  });

  void it('reprova lista vazia', () => {
    assert.throws(() => tabelaDoContrato({ 'x-problem-types': [] }, 'isca'), /x-problem-types/);
  });

  void it('reprova entrada sem status', () => {
    assert.throws(
      () => tabelaDoContrato({ 'x-problem-types': [{ slug: 'forbidden' }] }, 'isca'),
      /status/,
    );
  });

  void it('reprova tipo repetido', () => {
    assert.throws(
      () =>
        tabelaDoContrato(
          { 'x-problem-types': [{ slug: 'forbidden', status: 403 }, { slug: 'forbidden', status: 401 }] },
          'isca',
        ),
      /repetido/,
    );
  });
});

void describe('o que o portão precisa reprovar', () => {
  const contrato: TabelaDeStatus = { forbidden: 403, unauthenticated: 401 };

  void it('acusa tipo que o contrato tem e o código não', () => {
    const achados = conferir(contrato, { forbidden: 403 });
    assert.deepEqual(
      achados.map((achado) => [achado.slug, achado.motivo]),
      [['unauthenticated', 'ausente-no-codigo']],
    );
  });

  void it('acusa tipo que o código tem e o contrato não', () => {
    const achados = conferir(contrato, { forbidden: 403, unauthenticated: 401, inventado: 418 });
    assert.deepEqual(
      achados.map((achado) => [achado.slug, achado.motivo]),
      [['inventado', 'ausente-no-contrato']],
    );
  });

  /**
   * Esta é a isca que reproduz o defeito que deu origem ao portão: `forbidden`
   * saindo com 401. Se ela um dia passar, o portão parou de vigiar exatamente o
   * caso para o qual foi escrito.
   */
  void it('acusa `forbidden` com 401', () => {
    const achados = conferir(contrato, { forbidden: 401, unauthenticated: 401 });
    assert.deepEqual(
      achados.map((achado) => [achado.slug, achado.motivo]),
      [['forbidden', 'status-diferente']],
    );
    assert.match(achados[0]?.detalhe ?? '', /contrato 403, código 401/);
  });

  void it('não acusa nada quando as duas tabelas são iguais', () => {
    assert.deepEqual(conferir(contrato, { ...contrato }), []);
  });
});

void describe('o contrato de verdade', () => {
  void it('encontra `api/openapi.yaml`, ou reprova dizendo que não encontrou', () => {
    assert.ok(
      existsSync(CAMINHO_DA_SPEC),
      `${CAMINHO_DA_SPEC} não existe. Sem a especificação não há conferência possível, ` +
        'e uma conferência que não roda passando por verde é o pior desfecho.',
    );
  });

  void it('o enum do back-end não diverge de `x-problem-types`', () => {
    const divergencias = conferirContraOContrato(CAMINHO_DA_SPEC);
    assert.deepEqual(
      divergencias.map((achado) => achado.detalhe),
      [],
      'Rode `npm run generate:types` e versione o resultado. Se o tipo está errado, ' +
        'o errado é a especificação: corrija api/openapi.yaml e gere de novo.',
    );
  });

  void it('`forbidden` é 403 e nenhum tipo de 401 é ele', () => {
    assert.equal(STATUS_DO_PROBLEMA.forbidden, 403);
    assert.equal(STATUS_DO_PROBLEMA.unauthenticated, 401);
    assert.equal(STATUS_DO_PROBLEMA['invalid-credentials'], 401);
    assert.equal(STATUS_DO_PROBLEMA['token-expired'], 401);
    assert.equal(STATUS_DO_PROBLEMA['reauthentication-required'], 401);
  });
});
