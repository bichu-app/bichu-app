import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import type { OperacaoDoContrato } from '../shared/http/contract.js';
import {
  ehOperacaoSemConta,
  inspecionarCabecalhos,
  inspecionarCamposPublicos,
  inspecionarParametrosPublicos,
  type Achado,
} from './portao-contrato-publico.js';

function operacaoDe(
  operationId: string,
  yamlDaOperacao: string,
  security: Record<string, unknown>[],
): { readonly operacao: OperacaoDoContrato; readonly spec: Record<string, unknown> } {
  const raw = parseYaml(yamlDaOperacao) as Record<string, unknown>;
  return {
    spec: {},
    operacao: {
      operationId,
      method: 'get',
      path: `/${operationId}`,
      security,
      securitySchemes: [...new Set(security.flatMap((item) => Object.keys(item)))],
      effects: [],
      hasRateLimit: false,
      raw,
      parameters: [],
    },
  };
}

function camposAchados(achados: readonly Achado[]): string[] {
  return achados.map((achado) => achado.campo).sort();
}

const RESPOSTA_COM_COORDENADA = `
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            lat: { type: number }
            lon: { type: number }
`;

const RESPOSTA_COM_UUID_INTERNO = `
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            id: { type: string, format: uuid }
            case_id: { type: string, format: uuid }
            share_token: { type: string }
`;

void describe('quem o portão percorre', () => {
  void it('percorre operação pública, de tagCode e de finderToken', () => {
    const publica = operacaoDe('publica', 'responses: {}', []);
    const comTag = operacaoDe('comTag', 'responses: {}', [{ tagCode: [] }]);
    const comFinder = operacaoDe('comFinder', 'responses: {}', [{ finderToken: [] }]);

    assert.equal(ehOperacaoSemConta(publica.operacao), true);
    assert.equal(ehOperacaoSemConta(comTag.operacao), true);
    assert.equal(ehOperacaoSemConta(comFinder.operacao), true);
  });

  void it('não percorre operação que exige conta', () => {
    const autenticada = operacaoDe('autenticada', 'responses: {}', [{ bearerAuth: [] }]);
    assert.equal(ehOperacaoSemConta(autenticada.operacao), false);
  });

  void it('percorre a rota de autenticação opcional, porque ela responde sem token também', () => {
    const opcional = operacaoDe('opcional', 'responses: {}', [{ bearerAuth: [] }, {}]);
    assert.equal(ehOperacaoSemConta(opcional.operacao), true);
  });
});

void describe('o que o portão precisa reprovar', () => {
  void it('reprova coordenada em resposta sem conta', () => {
    const { operacao, spec } = operacaoDe('vazaCoordenada', RESPOSTA_COM_COORDENADA, []);
    assert.deepEqual(camposAchados(inspecionarCamposPublicos(spec, [operacao])), ['lat', 'lon']);
  });

  void it('reprova UUID interno e deixa passar token opaco', () => {
    const { operacao, spec } = operacaoDe('vazaId', RESPOSTA_COM_UUID_INTERNO, [
      { finderToken: [] },
    ]);
    const achados = inspecionarCamposPublicos(spec, [operacao]);

    assert.deepEqual(camposAchados(achados), ['case_id', 'id']);
    assert.equal(
      achados.some((achado) => achado.campo === 'share_token'),
      false,
    );
  });

  void it('enxerga o campo proibido dentro de lista e de objeto aninhado', () => {
    const aninhado = `
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            items:
              type: array
              items:
                type: object
                properties:
                  owner:
                    type: object
                    properties:
                      phone: { type: string }
`;
    const { operacao, spec } = operacaoDe('vazaAninhado', aninhado, []);
    assert.deepEqual(camposAchados(inspecionarCamposPublicos(spec, [operacao])), ['phone']);
  });

  void it('não acusa campo parecido com o proibido', () => {
    const parecido = `
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            recipient_email_masked: { type: string }
            email_verified: { type: boolean }
            label: { type: string }
`;
    const { operacao, spec } = operacaoDe('semVazamento', parecido, []);
    assert.deepEqual(inspecionarCamposPublicos(spec, [operacao]), []);
  });
});

void describe('ausência de alvo não é aprovação, e continua não sendo', () => {
  void it('sem página HTML, a conferência devolve zero páginas conferidas e nenhum achado', () => {
    const resultado = inspecionarCabecalhos([]);
    assert.deepEqual(resultado.achados, []);
    assert.equal(resultado.paginasConferidas, 0);
  });

  void it('a capacidade de acusar não depende do contrato real: página nua ainda reprova', () => {
    const paginaSemCabecalho = `
description: pagina sem nenhuma exigencia declarada
responses:
  '200':
    content:
      text/html: { schema: { type: string } }
`;
    const { operacao } = operacaoDe('paginaNua', paginaSemCabecalho, []);
    const resultado = inspecionarCabecalhos([operacao]);

    assert.equal(resultado.paginasConferidas, 1);
    assert.equal(resultado.achados.length, 6, 'os seis itens do critério 5 precisam ser cobrados');
    assert.deepEqual(
      resultado.achados.map((achado) => achado.campo).sort(),
      [
        'Cache-Control: no-store',
        'Content-Security-Policy',
        'Referrer-Policy: no-referrer',
        'X-Content-Type-Options: nosniff',
        'X-Robots-Tag: noindex',
        'og: genérico',
      ].sort(),
    );
  });
});

function operacaoComParametros(
  operationId: string,
  nomes: readonly (readonly [string, string])[],
  security: Record<string, unknown>[] = [],
): OperacaoDoContrato {
  return {
    operationId,
    method: 'get',
    path: `/${operationId}`,
    security,
    securitySchemes: [...new Set(security.flatMap((item) => Object.keys(item)))],
    effects: [],
    hasRateLimit: false,
    raw: {},
    parameters: nomes.map(([name, lugar]) => ({ name, in: lugar, schema: { type: 'string' } })),
  };
}

void describe('o pedido: coordenada, distância e raio em parâmetro de rota sem conta', () => {
  void it('reprova a coordenada crua, em query e em cabeçalho', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('iscaCrua', [
        ['lat', 'query'],
        ['lon', 'query'],
        ['X-Latitude', 'header'],
      ]),
    ]);
    assert.deepEqual(camposAchados(resultado.achados), ['X-Latitude', 'lat', 'lon']);
    assert.ok(resultado.achados.some((a) => a.onde === 'parâmetro (header)'));
  });

  void it('reprova o nome COMPOSTO, que é o que nome exato não alcança', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('iscaComposta', [
        ['center_lat', 'query'],
        ['sw_lon', 'query'],
        ['lat_min', 'query'],
        ['bbox', 'query'],
        ['center', 'query'],
      ]),
    ]);
    assert.deepEqual(camposAchados(resultado.achados), [
      'bbox',
      'center',
      'center_lat',
      'lat_min',
      'sw_lon',
    ]);
  });

  void it('reprova `max_km`, que a lista da RESPOSTA não tem', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('iscaRaio', [
        ['max_km', 'query'],
        ['radius_m', 'query'],
        ['max_distance', 'query'],
        ['dist', 'query'],
      ]),
    ]);
    assert.deepEqual(camposAchados(resultado.achados), [
      'dist',
      'max_distance',
      'max_km',
      'radius_m',
    ]);
  });

  void it('NÃO acusa os filtros que o ADR-0006 manda a listagem usar', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('iscaPermitida', [
        ['page', 'query'],
        ['limit', 'query'],
        ['period', 'query'],
        ['q', 'query'],
        ['city', 'query'],
        ['neighborhood', 'query'],
        ['size', 'query'],
        ['sort', 'query'],
        ['species', 'query'],
        ['cursor', 'query'],
        ['category', 'query'],
        ['subcategory', 'query'],
        ['visibility', 'query'],
        ['admission', 'query'],
        ['when', 'query'],
        ['tag', 'query'],
        ['slug', 'query'],
        ['code', 'query'],
        ['shareToken', 'path'],
        ['cancelToken', 'path'],
        ['alertToken', 'path'],
        ['token', 'path'],
        ['eventSlug', 'path'],
        ['itemSlug', 'path'],
        ['Idempotency-Key', 'header'],
        ['X-Captcha-Token', 'header'],
        ['price_status', 'query'],
        ['publication_state', 'query'],
        ['verification_level', 'query'],
      ]),
    ]);
    assert.deepEqual(
      resultado.achados,
      [],
      'achado falso no pedido: o portão acusou filtro permitido e perde a confiança de quem o lê',
    );
    assert.equal(resultado.parametrosConferidos, 29);
  });

  void it('não acusa palavra inglesa que nomeia outra coisa com naturalidade', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('iscaPalavraComum', [
        ['long_name', 'query'],
        ['bounds_label', 'query'],
        ['within_period', 'query'],
        ['around_text', 'query'],
      ]),
    ]);
    assert.deepEqual(resultado.achados, []);
  });

  void it('operação COM conta pode declarar coordenada: ela não chega aqui', () => {
    const comConta = operacaoComParametros(
      'getPerto',
      [
        ['lat', 'query'],
        ['max_km', 'query'],
      ],
      [{ bearerAuth: [] }],
    );
    assert.equal(ehOperacaoSemConta(comConta), false);
    const semConta = [comConta].filter(ehOperacaoSemConta);
    assert.deepEqual(semConta, []);
  });

  void it('ausência de alvo é REPROVAÇÃO, e não aprovação por omissão', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('semParametroNenhum', []),
    ]);
    assert.equal(resultado.parametrosConferidos, 0);
    assert.equal(resultado.achados.length, 1);
    assert.equal(resultado.achados[0]?.campo, 'nenhum parâmetro para percorrer');
  });

  void it('conta o que percorreu, para que zero não se confunda com aprovado', () => {
    const resultado = inspecionarParametrosPublicos([
      operacaoComParametros('uma', [['page', 'query']]),
      operacaoComParametros('outra', [
        ['limit', 'query'],
        ['city', 'query'],
      ]),
    ]);
    assert.equal(resultado.operacoesConferidas, 2);
    assert.equal(resultado.parametrosConferidos, 3);
    assert.deepEqual(resultado.achados, []);
  });
});
