/**
 * O bloqueio de marcar como perdido, e o aviso de cadastro incompleto.
 *
 * O caso que mais importa é negativo e sutil: **telefone preenchido e não
 * verificado não destrava nada.** É o erro fácil de escrever (`phoneE164 !==
 * null`) e ele produz exatamente o desastre que a regra existe para impedir —
 * um caso aberto cujo tutor ninguém alcança.
 */
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

// Data determinística: a regra de lint proíbe `new Date()` na camada pura,
// inclusive nos testes, e por um motivo bom — teste que lê o relógio da máquina
// falha às 23h59 do último dia do mês, numa execução que ninguém reproduz.
const QUANDO = dataFixa(INSTANTE_FIXO);

void describe('pode abrir caso de perdido', () => {
  void it('e-mail verificado basta', () => {
    assert.equal(podeAbrirCasoDePerdido({ ...VAZIO, emailVerifiedAt: QUANDO }), true);
  });

  void it('telefone verificado basta, mesmo sem e-mail verificado', () => {
    // A disjunção é deliberada: exigir os dois travaria o fluxo no pior momento
    // possível, com a pessoa tendo acabado de perder o animal.
    assert.equal(podeAbrirCasoDePerdido({ ...VAZIO, phoneVerifiedAt: QUANDO }), true);
  });

  void it('TELEFONE PREENCHIDO E NÃO VERIFICADO NÃO BASTA', () => {
    // Contato não verificado é contato que não sabemos se alcança alguém. Um
    // caso aberto assim dispara alerta para vizinhos, publica o animal numa
    // lista pública, e o aviso de quem achar cai no vazio.
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
    // Exigir os três campos de endereço transformaria "complete seu cadastro"
    // numa lista que ninguém termina.
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
