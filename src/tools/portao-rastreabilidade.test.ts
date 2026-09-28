/**
 * Testes do portão da matriz de rastreabilidade (ADR-0027 item 18).
 *
 * Três camadas: a matriz de verdade contra o contrato de verdade, que precisa
 * aprovar; a isca permanente, que precisa reprovar pelos quatro motivos; e
 * variações pequenas, cada uma com um defeito só, para provar que cada regra
 * enxerga sozinha e não só em conjunto.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { ACHADOS_DA_ISCA, CONTRATO, ISCA, MATRIZ, executar, inspecionar } from './portao-rastreabilidade.js';

type Mapa = Record<string, unknown>;
const ler = (caminho: string): Mapa => parseYaml(readFileSync(caminho, 'utf8')) as Mapa;
const spec = ler(CONTRATO);
const clonar = (m: Mapa): Mapa => JSON.parse(JSON.stringify(m)) as Mapa;

void describe('a matriz de verdade', () => {
  void it('concorda com o contrato, e tem o que conferir', () => {
    const r = inspecionar(spec, ler(MATRIZ));
    assert.deepEqual(r.achados, [], `divergências:\n${r.achados.join('\n')}`);
    assert.ok(r.telas > 0, 'a matriz ficou sem telas');
    assert.ok(r.resolvidas > 100, `só ${r.resolvidas} referências resolvidas: a leitura encolheu`);
  });

  void it('o executável aprova de ponta a ponta, com a isca junto', () => {
    assert.equal(executar(process.cwd()), 0);
  });
});

void describe('a isca permanente', () => {
  void it('reprova pelos quatro motivos declarados', () => {
    const r = inspecionar(spec, ler(ISCA));
    for (const esperado of ACHADOS_DA_ISCA) {
      assert.ok(r.achados.some((a) => a.includes(esperado)), `a isca deixou de reprovar por: ${esperado}`);
    }
    assert.ok(r.resolvidas >= 1, 'o controle positivo da isca (req:title) deixou de resolver');
  });
});

void describe('cada regra, sozinha', () => {
  const base = ler(MATRIZ);

  void it('operação administrativa nova, fora da matriz, reprova', () => {
    const s = clonar(spec);
    (s['paths'] as Mapa)['/admin/isca'] = { get: { operationId: 'iscaAdministrativa', responses: {} } };
    const r = inspecionar(s, base);
    assert.ok(r.achados.some((a) => a.includes('iscaAdministrativa')));
  });

  void it('valor de lista fechada que some do contrato reprova', () => {
    const s = clonar(spec);
    const schemas = (s['components'] as Mapa)['schemas'] as Mapa;
    (schemas['EventPriceUnit'] as Mapa)['enum'] = ['per_dog', 'per_person'];
    const r = inspecionar(s, base);
    assert.ok(r.achados.some((a) => a.includes('enum:EventPriceUnit.per_pair')));
    assert.ok(r.achados.some((a) => a.includes('correspondencias.EventPriceUnit')));
  });

  void it('parâmetro de consulta que some reprova', () => {
    const m = clonar(base);
    const tela = (m['telas'] as Mapa[])[2] as Mapa;
    ((tela['operacoes'] as Mapa[])[0] as Mapa)['usa'] = ['query:filtro_que_nao_existe'];
    const r = inspecionar(spec, m);
    assert.ok(r.achados.some((a) => a.includes('query:filtro_que_nao_existe')));
  });

  void it('matriz sem telas reprova, em vez de aprovar por ausência', () => {
    const r = inspecionar(spec, { versao: 1, telas: [] });
    assert.ok(r.achados.some((a) => a.includes('nenhuma tela')));
  });
});
