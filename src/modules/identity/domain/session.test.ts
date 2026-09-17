/**
 * Testes das regras de sessão (BICHUS-15).
 *
 * O ponto que estes casos existem para travar: a rotação renova a INATIVIDADE e
 * nunca o teto absoluto. Sem isso, um refresh roubado e usado periodicamente
 * vive para sempre, e o defeito não aparece em nenhum teste de caminho feliz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Instant } from '../../../shared/types/brands.js';
import {
  prazosDeNovaFamilia,
  prazosDeRotacao,
  segundosRestantes,
  tokenFoiRevogado,
  type JanelasDeSessao,
} from './session.js';

const DIA = 86_400_000;
const AGORA = 1_760_000_000_000 as Instant;

const JANELAS: JanelasDeSessao = {
  idleTtlSeconds: 30 * 86_400,
  staySignedInIdleTtlSeconds: 180 * 86_400,
  absoluteTtlSeconds: 180 * 86_400,
};

void describe('janelas de sessão', () => {
  void it('abre com 30 dias de inatividade quando "continuar conectado" está desmarcado', () => {
    const prazos = prazosDeNovaFamilia(AGORA, JANELAS, false);
    assert.equal(prazos.expiresAt, AGORA + 30 * DIA);
    assert.equal(prazos.absoluteExpiresAt, AGORA + 180 * DIA);
  });

  void it('abre com 180 dias quando o usuário marcou "continuar conectado"', () => {
    const prazos = prazosDeNovaFamilia(AGORA, JANELAS, true);
    assert.equal(prazos.expiresAt, AGORA + 180 * DIA);
    assert.equal(prazos.absoluteExpiresAt, AGORA + 180 * DIA);
  });

  void it('a rotação herda o teto absoluto em vez de empurrá-lo', () => {
    const abertura = prazosDeNovaFamilia(AGORA, JANELAS, false);

    // Cem dias depois, o aparelho renova normalmente.
    const depois = (AGORA + 100 * DIA) as Instant;
    const rotacionado = prazosDeRotacao(depois, JANELAS, abertura.absoluteExpiresAt, false);

    assert.equal(
      rotacionado.absoluteExpiresAt,
      abertura.absoluteExpiresAt,
      'o teto absoluto é da família e não se renova a cada uso',
    );
    assert.equal(rotacionado.expiresAt, depois + 30 * DIA);
  });

  void it('a inatividade nunca ultrapassa o teto absoluto', () => {
    const abertura = prazosDeNovaFamilia(AGORA, JANELAS, false);

    // A 170 dias, somar 30 de inatividade passaria dos 180 do teto.
    const quaseNoFim = (AGORA + 170 * DIA) as Instant;
    const rotacionado = prazosDeRotacao(quaseNoFim, JANELAS, abertura.absoluteExpiresAt, false);

    assert.equal(
      rotacionado.expiresAt,
      abertura.absoluteExpiresAt,
      'o token novo não pode dizer valer mais do que a família inteira',
    );
  });

  void it('segundosRestantes nunca devolve número negativo', () => {
    assert.equal(segundosRestantes(AGORA, (AGORA + 900_000) as Instant), 900);
    assert.equal(segundosRestantes(AGORA, (AGORA - 900_000) as Instant), 0);
  });
});

void describe('revogação imediata por sessions_invalid_before (SEC-006)', () => {
  const emSegundos = (instante: number): number => Math.floor(instante / 1000);

  void it('recusa o token emitido antes da revogação', () => {
    const revogadoEm = AGORA;
    const tokenAnterior = emSegundos(AGORA - 60_000);
    assert.equal(tokenFoiRevogado(tokenAnterior, revogadoEm), true);
  });

  void it('aceita o token emitido depois da revogação', () => {
    const revogadoEm = AGORA;
    const tokenPosterior = emSegundos(AGORA + 60_000);
    assert.equal(tokenFoiRevogado(tokenPosterior, revogadoEm), false);
  });

  void it('o token do mesmo segundo da revogação cai do lado revogado', () => {
    // `iat` tem granularidade de segundo. Se o empate passasse, sobraria uma
    // janela de um segundo — que é exatamente a que quem tomou a conta usa,
    // porque ele está renovando em laço quando a vítima troca a senha.
    const revogadoEm = (AGORA + 500) as Instant;
    assert.equal(tokenFoiRevogado(emSegundos(AGORA), revogadoEm), true);
  });
});
