import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MOTIVOS_DE_FOTO,
  MOTIVOS_DE_PERFIL,
  MOTIVOS_DE_PUBLICACAO,
  TAMANHO_MAXIMO_DO_RELATO,
  validarDenuncia,
} from './motivos-da-denuncia.js';

void describe('as três listas fechadas de motivo', () => {
  void it('os tamanhos são 5, 6 e 5, e os números são do desenho', () => {
    assert.equal(MOTIVOS_DE_PERFIL.length, 5);
    assert.equal(MOTIVOS_DE_FOTO.length, 6);
    assert.equal(MOTIVOS_DE_PUBLICACAO.length, 5);
  });

  void it('a lista de publicação é a específica deste produto', () => {
    assert.ok(MOTIVOS_DE_PUBLICACAO.includes('false_lost_pet_info'));
    assert.ok(!(MOTIVOS_DE_PERFIL as readonly string[]).includes('false_lost_pet_info'));
    assert.ok(!(MOTIVOS_DE_FOTO as readonly string[]).includes('false_lost_pet_info'));
  });

  void it('CONTRAPESO: o motivo da lista do alvo é ACEITO, nos três', () => {
    assert.equal(validarDenuncia('profile', { reason: 'harassment' }).denuncia?.motivo, 'harassment');
    assert.equal(validarDenuncia('photo', { reason: 'child_at_risk' }).denuncia?.motivo, 'child_at_risk');
    assert.equal(
      validarDenuncia('publication', { reason: 'false_lost_pet_info' }).denuncia?.motivo,
      'false_lost_pet_info',
    );
  });

  void it('motivo inventado é RECUSADO, apontando o campo', () => {
    const { denuncia, erros } = validarDenuncia('profile', { reason: 'nao_gostei' });
    assert.equal(denuncia, undefined);
    assert.deepEqual(
      erros.map((e) => ({ field: e.field, code: e.code })),
      [{ field: 'reason', code: 'required' }],
    );
  });

  void it('O CASO QUE IMPORTA: motivo de OUTRA lista é recusado igual', () => {
    assert.equal(validarDenuncia('profile', { reason: 'nudity_or_sexual' }).denuncia, undefined);
    assert.equal(validarDenuncia('publication', { reason: 'minor_suspected' }).denuncia, undefined);
    assert.equal(validarDenuncia('photo', { reason: 'false_lost_pet_info' }).denuncia, undefined);
  });

  void it('motivo ausente é recusado: não existe denúncia sem motivo', () => {
    assert.equal(validarDenuncia('profile', {}).denuncia, undefined);
    assert.equal(validarDenuncia('profile', undefined).denuncia, undefined);
    assert.equal(validarDenuncia('profile', { reason: 0 }).denuncia, undefined);
  });

  void it('o relato é opcional, aparado, e vazio é o mesmo que ausente', () => {
    assert.equal(validarDenuncia('profile', { reason: 'other' }).denuncia?.relato, null);
    assert.equal(validarDenuncia('profile', { reason: 'other', detail: '   ' }).denuncia?.relato, null);
    assert.equal(validarDenuncia('profile', { reason: 'other', detail: ' oi ' }).denuncia?.relato, 'oi');
  });

  void it('relato acima do teto e com os sinais de HTML são recusados', () => {
    const longo = 'a'.repeat(TAMANHO_MAXIMO_DO_RELATO + 1);
    assert.equal(validarDenuncia('profile', { reason: 'other', detail: longo }).erros[0]?.code, 'too_long');
    const noLimite = 'a'.repeat(TAMANHO_MAXIMO_DO_RELATO);
    assert.equal(validarDenuncia('profile', { reason: 'other', detail: noLimite }).denuncia?.relato, noLimite);
    assert.equal(
      validarDenuncia('profile', { reason: 'other', detail: '<b>' }).erros[0]?.code,
      'html_not_allowed',
    );
  });

  void it('ISCA POR DESLIGAMENTO: a conferência frouxa ACEITA o que esta recusa', () => {
    const uniao = new Set<string>([...MOTIVOS_DE_PERFIL, ...MOTIVOS_DE_FOTO, ...MOTIVOS_DE_PUBLICACAO]);
    const frouxa = (motivo: string): boolean => uniao.has(motivo);

    for (const [alvo, motivo] of [
      ['profile', 'nudity_or_sexual'],
      ['publication', 'minor_suspected'],
      ['photo', 'false_lost_pet_info'],
    ] as const) {
      assert.ok(frouxa(motivo), `a isca precisa de um motivo que exista no produto: ${motivo}`);
      assert.equal(
        validarDenuncia(alvo, { reason: motivo }).denuncia,
        undefined,
        `${motivo} passou em ${alvo}: a conferência deixou de ser por alvo e virou por alcance`,
      );
    }
  });
});
