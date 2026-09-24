/**
 * A validade do token do achador, o cursor sem id e a forma do token.
 * Domínio puro: sem servidor, sem banco, sem rede.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  codificarCursorDoAchador,
  decodificarCursorDoAchador,
  desfechoParaQuemAchou,
  tokenBemFormado,
  tokenDoAchadorVale,
} from './acesso-do-achador.js';

const DIA = 24 * 60 * 60 * 1000;
const AVISO = Date.parse('2026-09-01T12:00:00Z');
const EXPIRA = comoData((AVISO + 30 * DIA) as Instant);

function em(dias: number): Instant {
  return (AVISO + dias * DIA) as Instant;
}

void describe('"valido enquanto o caso estiver aberto mais 30 dias"', () => {
  void it('sem caso, vale os 30 dias do aviso e para no 31º', () => {
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso: null }, em(29)), true);
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso: null }, em(31)), false);
  });

  void it('com o caso ABERTO, continua valendo depois do 30º dia', () => {
    // É o caso que a coluna sozinha erraria: o animal ainda está na rua, e a
    // conversa pararia de funcionar exatamente quando mais importa.
    const caso = { aberto: true, encerradoEm: null, desfecho: null };
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso }, em(90)), true);
  });

  void it('com o caso encerrado, vale mais 30 dias a partir do encerramento', () => {
    const caso = { aberto: false, encerradoEm: comoData(em(60)), desfecho: 'reunited' as const };
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso }, em(89)), true);
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso }, em(91)), false);
  });

  void it('caso encerrado cedo não encurta os 30 dias do aviso', () => {
    const caso = { aberto: false, encerradoEm: comoData(em(1)), desfecho: 'reunited' as const };
    assert.equal(tokenDoAchadorVale({ expiraEm: EXPIRA, caso }, em(29)), true);
  });
});

void describe('o desfecho para quem ajudou', () => {
  void it('o reencontro é contado com o nome do pet', () => {
    assert.match(desfechoParaQuemAchou('reunited', 'Aurora'), /Aurora voltou para casa/);
  });

  void it('os outros desfechos não contam o estado do caso de outra pessoa', () => {
    const naoEncontrado = desfechoParaQuemAchou('not_found', 'Aurora');
    const alarmeFalso = desfechoParaQuemAchou('false_alarm', 'Aurora');
    assert.equal(naoEncontrado, alarmeFalso);
    assert.doesNotMatch(naoEncontrado, /Aurora/);
  });
});

void describe('o cursor do achador não carrega id', () => {
  void it('ida e volta pela posição', () => {
    assert.equal(decodificarCursorDoAchador(codificarCursorDoAchador(40)), 40);
  });

  void it('decodificado, é só a posição: nenhum UUID dentro', () => {
    const cru = Buffer.from(codificarCursorDoAchador(40), 'base64url').toString('utf8');
    assert.doesNotMatch(cru, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  void it('o cursor do lado com conta, que traz o id, não é aceito aqui', () => {
    const doOutroLado = Buffer.from(
      '2026-09-23T10:00:00.000Z|018f3a2b-0000-7000-8000-0000000000cc',
      'utf8',
    ).toString('base64url');
    assert.equal(decodificarCursorDoAchador(doOutroLado), undefined);
    assert.equal(decodificarCursorDoAchador('lixo'), undefined);
    assert.equal(decodificarCursorDoAchador(undefined), undefined);
  });
});

void describe('a forma do token', () => {
  void it('43 caracteres de base64url, que é o que `opaqueToken` produz', () => {
    assert.equal(tokenBemFormado('a'.repeat(43)), true);
    assert.equal(tokenBemFormado('a'.repeat(42)), false);
    assert.equal(tokenBemFormado(`${'a'.repeat(42)}=`), false);
    assert.equal(tokenBemFormado(`${'a'.repeat(42)}'`), false);
  });
});
