/**
 * Testes do portão de contrato (BICHUS-55).
 *
 * O critério 2 da história é o motivo deste arquivo existir: **um portão que não
 * consegue verificar precisa reprovar.** Por isso os casos abaixo são quase
 * todos negativos — eles provam que o portão REPROVA o que deve reprovar, que é
 * a única coisa que um portão promete.
 *
 * O portão também carrega uma isca interna que roda a cada execução. Este
 * arquivo é a segunda camada: ele varia a isca, coisa que a interna não faz.
 */
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
    // `bearerAuth` mais `{}` é autenticação opcional: existe um caminho sem
    // conta, e é justamente esse que precisa ser olhado.
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
    // `share_token` termina em `_token` e não é UUID: o endereço público É o
    // token, e reprová-lo tornaria o desenho do contrato impossível.
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
    // `recipient_email_masked` é mascarado de propósito e existe no contrato.
    // Portão que acusa o remédio perde a confiança de quem o lê, e o próximo
    // achado verdadeiro é lido como ruído.
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
    // Desde o ADR-0017 o contrato não tem resposta `text/html`, e reprovar por
    // isso seria o portão cobrar uma coisa que foi removida por decisão. O que
    // NÃO pode acontecer é a ausência virar aprovação: quem lê o resultado
    // precisa conseguir separar os dois casos, e por isso a contagem sai junto
    // com os achados em vez de um `Achado[]` que some com a informação.
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

// ---------------------------------------------------------------------------
// O LADO DO PEDIDO.
//
// O portão nasceu olhando só a resposta declarada. Medido em 19/10/2026, na
// `feat/pets-por-distancia`: acrescentar `distance_m` ao schema
// `PublicLostPet` reprovava com dois achados, e acrescentar `lat`, `lon` e
// `radius_m` como PARÂMETROS de `listPublicLostPets` APROVAVA, exit 0.
//
// Aceitar um centro escolhido por quem chama transforma a rota pública num
// oráculo de posição: variando o centro e lendo a ORDEM da página dá para
// trilaterar o ponto de cada caso sem um único número de coordenada aparecer
// na resposta. ADR-0006 e ADR-0010 itens 4 e 5.
//
// A isca interna do portão já cobra esta família a cada execução, e a isca de
// `infra/verificacao/iscas/` a cobra na esteira. Este arquivo é a camada que
// VARIA a isca, que é o que as duas não fazem.
// ---------------------------------------------------------------------------

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
    // Cabeçalho é pedido também: um oráculo não fica menos oráculo por trocar
    // de lugar dentro do pedido.
    assert.ok(resultado.achados.some((a) => a.onde === 'parâmetro (header)'));
  });

  void it('reprova o nome COMPOSTO, que é o que nome exato não alcança', () => {
    // Esta é a razão de o casamento ser por segmento. Na resposta, nome exato
    // basta; no pedido não, e `max_km` do contrato de verdade é a prova.
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
    // O caso que decidiu a lista ser própria e não a `CAMPOS_PROIBIDOS`.
    // `max_km` é o nome que esta casa já usa para raio
    // (`listNearbyNetworkEvents`), e ele não está na lista da resposta — com
    // razão, porque nunca aparece numa resposta. Se alguém trocar a lista
    // própria do pedido pela da resposta, este caso reprova.
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
    // Portão que reprova tudo não distingue nada e é retirado na primeira
    // sexta-feira. Estes são os nomes medidos nas 37 operações sem conta do
    // contrato de hoje, e nenhum pode produzir achado.
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
    // `long`, `around`, `within` e `bounds` ficaram FORA da lista de propósito.
    // Se alguém os acrescentar, este caso reprova e obriga a medir o custo.
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
    // `previewLostCaseReach` e `listNearbyNetworkEvents` declaram `lat`, `lon`
    // e `max_km` hoje, e são produto. Quem filtra é `ehOperacaoSemConta`, e o
    // caso existe para fixar que o filtro é ele e não esta varredura.
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
    // A regra do arquivo. Se nenhuma operação sem conta declarar parâmetro, a
    // varredura não percorreu nada, e um verde dela não diz nada.
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
