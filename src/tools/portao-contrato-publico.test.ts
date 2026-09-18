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
