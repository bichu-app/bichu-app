import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  camposPendentesDoPerfil,
  podeAbrirCasoDePerdido,
  type PerfilParaConferir,
} from './completude-do-perfil.js';
import { INSTANTE_FIXO, dataFixa } from '../../../shared/time/relogio-de-teste.js';

const VAZIO: PerfilParaConferir = {
  emailVerifiedAt: null,
  phoneE164: null,
  phoneVerifiedAt: null,
  displayName: null,
  referencePostalCode: null,
  referenceCity: null,
};

const QUANDO = dataFixa(INSTANTE_FIXO);

void describe('pode abrir caso de perdido', () => {
  void it('e-mail verificado basta', () => {
    assert.equal(podeAbrirCasoDePerdido({ ...VAZIO, emailVerifiedAt: QUANDO }), true);
  });

  void it('telefone verificado basta, mesmo sem e-mail verificado', () => {
    assert.equal(podeAbrirCasoDePerdido({ ...VAZIO, phoneVerifiedAt: QUANDO }), true);
  });

  void it('TELEFONE PREENCHIDO E NÃO VERIFICADO NÃO BASTA', () => {
    assert.equal(podeAbrirCasoDePerdido({ ...VAZIO, phoneE164: '+5511999998888' }), false);
  });

  void it('perfil vazio não abre caso', () => {
    assert.equal(podeAbrirCasoDePerdido(VAZIO), false);
  });
});

void describe('campos pendentes do perfil', () => {
  void it('perfil vazio pende os quatro, na ordem da consequência', () => {
    assert.deepEqual(camposPendentesDoPerfil(VAZIO), [
      'email_verification',
      'display_name',
      'reference_area',
      'phone',
    ]);
  });

  void it('perfil completo não pende nada', () => {
    assert.deepEqual(
      camposPendentesDoPerfil({
        emailVerifiedAt: QUANDO,
        phoneE164: '+5511999998888',
        phoneVerifiedAt: QUANDO,
        displayName: 'Ana',
        referencePostalCode: '05435-000',
        referenceCity: 'São Paulo',
      }),
      [],
    );
  });

  void it('CEP sozinho já resolve a área de referência', () => {
    const p = camposPendentesDoPerfil({ ...VAZIO, referencePostalCode: '05435-000' });
    assert.ok(!p.includes('reference_area'));
  });

  void it('cidade sozinha também resolve', () => {
    const p = camposPendentesDoPerfil({ ...VAZIO, referenceCity: 'São Paulo' });
    assert.ok(!p.includes('reference_area'));
  });

  void it('nome só de espaços conta como ausente', () => {
    assert.ok(camposPendentesDoPerfil({ ...VAZIO, displayName: '   ' }).includes('display_name'));
  });
});
