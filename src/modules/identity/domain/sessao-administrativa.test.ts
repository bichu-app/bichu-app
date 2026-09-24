/**
 * Os prazos, a revogacao e a derivacao do anti-CSRF da sessao administrativa
 * (D38, D39), com relogio controlado e sem banco.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../shared/types/brands.js';
import {
  abreSessaoAdministrativa,
  avaliarSessao,
  derivarTokenAntiCsrf,
  ehContaDedicada,
  inatividadeRenovada,
  instanteDaSenha,
  papeisDoPainel,
  prazosDeNovaSessao,
  precisaRenovarUso,
} from './sessao-administrativa.js';

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const T0 = 1_790_000_000_000 as Instant;
const em = (ms: number): Instant => (T0 + ms) as Instant;

void describe('prazos da sessao administrativa (D38)', () => {
  const prazos = prazosDeNovaSessao(T0);

  void it('nasce com 30 min de inatividade e 12 h de teto desde a senha', () => {
    assert.equal(prazos.idleExpiresAt, em(30 * MIN));
    assert.equal(prazos.absoluteExpiresAt, em(12 * HORA));
  });

  void it('31 min sem uso: inativa', () => {
    assert.equal(avaliarSessao({ ...prazos, revokedAt: null }, T0, em(31 * MIN)), 'inativa');
  });

  void it('uso continuo por 12 h 01 min: vencida, mesmo renovando a inatividade a cada minuto', () => {
    let idle = prazos.idleExpiresAt;
    for (let t = MIN; t <= 12 * HORA + MIN; t += MIN) {
      const agora = em(t);
      if (avaliarSessao({ ...prazos, idleExpiresAt: idle, revokedAt: null }, T0, agora) !== 'valida') {
        assert.equal(t, 12 * HORA, 'a sessao caiu antes do teto');
        break;
      }
      idle = inatividadeRenovada(agora, prazos.absoluteExpiresAt);
    }
    assert.equal(
      avaliarSessao({ ...prazos, idleExpiresAt: idle, revokedAt: null }, T0, em(12 * HORA + MIN)),
      'vencida',
    );
  });

  void it('a renovacao nunca passa do teto', () => {
    assert.equal(inatividadeRenovada(em(11 * HORA + 50 * MIN), prazos.absoluteExpiresAt), prazos.absoluteExpiresAt);
  });

  void it('revogada e anterior a barreira nao valem', () => {
    assert.equal(avaliarSessao({ ...prazos, revokedAt: em(MIN) }, T0, em(2 * MIN)), 'revogada');
    assert.equal(avaliarSessao({ ...prazos, revokedAt: null }, em(1), em(2 * MIN)), 'anterior_a_barreira');
  });

  void it('last_seen_at renova no maximo uma vez por minuto', () => {
    assert.equal(precisaRenovarUso(T0, em(59_999)), false);
    assert.equal(precisaRenovarUso(T0, em(MIN)), true);
  });

  void it('a sessao nova nasce do lado valido de uma barreira adiantada ao relogio', () => {
    const barreira = em(700);
    const instante = instanteDaSenha(T0, barreira);
    const nova = prazosDeNovaSessao(instante);
    assert.equal(avaliarSessao({ ...nova, revokedAt: null }, barreira, em(800)), 'valida');
  });
});

void describe('papeis', () => {
  void it('so admin abre o painel na v1; admin e moderator tornam a conta dedicada (D42)', () => {
    assert.equal(abreSessaoAdministrativa(['tutor', 'admin']), true);
    assert.equal(abreSessaoAdministrativa(['tutor', 'moderator']), false);
    assert.equal(ehContaDedicada(['tutor', 'moderator']), true);
    assert.equal(ehContaDedicada(['tutor']), false);
    assert.deepEqual(papeisDoPainel(['tutor', 'admin', 'moderator']), ['admin']);
  });
});

void describe('anti-CSRF derivado do cookie (D39)', () => {
  void it('e estavel para o mesmo cookie, muda com o cookie, e tem pelo menos 32 caracteres', () => {
    const a = derivarTokenAntiCsrf('cookie-a');
    assert.equal(a, derivarTokenAntiCsrf('cookie-a'));
    assert.notEqual(a, derivarTokenAntiCsrf('cookie-b'));
    assert.ok(a.length >= 32);
    assert.ok(!a.includes('cookie-a'));
  });
});
