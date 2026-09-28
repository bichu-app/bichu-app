/**
 * P19, a metade do contrato: o portao contra o `api/openapi.yaml` de verdade, e
 * as iscas que ele precisa reprovar, cada uma pelo motivo dela. Roda na suite
 * unitaria, entao reprova no job `codigo` sem precisar de fiacao nova.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { inspecionar } from './portao-teaser-do-privado.js';

type Objeto = Record<string, unknown>;

function contratoReal(): Objeto {
  return parseYaml(readFileSync(resolve(process.cwd(), 'api/openapi.yaml'), 'utf8')) as Objeto;
}

function esquemas(spec: Objeto): Objeto {
  return (spec['components'] as Objeto)['schemas'] as Objeto;
}

void describe('P19 no contrato de verdade', () => {
  void it('aprova o api/openapi.yaml', () => {
    assert.deepEqual(inspecionar(contratoReal()), []);
  });
});

void describe('as iscas do P19, cada uma pelo motivo dela', () => {
  void it('ISCA -- campo novo no teaser (`neighborhood`) reprova', () => {
    const spec = contratoReal();
    const teaser = esquemas(spec)['NetworkEventPrivateTeaser'] as Objeto;
    (teaser['properties'] as Objeto)['neighborhood'] = { type: 'string' };
    const falhas = inspecionar(spec);
    assert.ok(falhas.some((f) => f.includes('lista permitida')), falhas.join('\n'));
  });

  void it('ISCA -- teaser sem additionalProperties: false reprova', () => {
    const spec = contratoReal();
    delete (esquemas(spec)['NetworkEventPrivateTeaser'] as Objeto)['additionalProperties'];
    assert.ok(inspecionar(spec).some((f) => f.includes('additionalProperties')));
  });

  void it('ISCA -- o detalhe devolvendo o publico sem o teaser reprova', () => {
    const spec = contratoReal();
    esquemas(spec)['NetworkEvent'] = { $ref: '#/components/schemas/NetworkEventPublic' };
    const falhas = inspecionar(spec);
    assert.ok(
      falhas.some((f) => f.includes('getNetworkEvent devolve NetworkEventPublic')),
      falhas.join('\n'),
    );
  });

  void it('ISCA -- "meus pedidos" devolvendo os detalhes privados reprova', () => {
    const spec = contratoReal();
    const item = esquemas(spec)['MyNetworkEventJoinRequest'] as Objeto;
    (item['properties'] as Objeto)['event'] = {
      $ref: '#/components/schemas/NetworkEventPrivateDetails',
    };
    const falhas = inspecionar(spec);
    assert.ok(
      falhas.some((f) => f.includes('listMyNetworkEventJoinRequests alcanca')),
      falhas.join('\n'),
    );
  });

  void it('ISCA -- sem o teaser no contrato, o portao reprova em vez de aprovar o vazio', () => {
    const spec = contratoReal();
    delete esquemas(spec)['NetworkEventPrivateTeaser'];
    assert.ok(inspecionar(spec).some((f) => f.includes('nao existe')));
  });
});
