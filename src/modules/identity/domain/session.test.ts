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
  barreiraDeContaNova,
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

/**
 * A barreira da conta recém-criada.
 *
 * Estes casos existem por causa de um defeito medido em 18/09, subindo a pilha
 * de verdade: `POST /v1/auth/register` devolvia um `access_token` que respondia
 * 401 em toda rota autenticada, **sempre**. Não era intermitente e não dependia
 * de carga — era a primeira tela do produto entregando uma sessão morta.
 *
 * O primeiro caso é o que reprova com o código antigo instalado.
 */
void describe('barreira de sessão da conta recém-criada', () => {
  void it('o token emitido NO MESMO SEGUNDO da criação vale', () => {
    // Criação em 20,734 s; o token sai no mesmo segundo, com `iat` = 20.
    const criacao = 1_789_734_320_734 as Instant;
    const iat = Math.floor(criacao / 1000);
    assert.equal(tokenFoiRevogado(iat, barreiraDeContaNova(criacao)), false);
  });

  void it('continua impossível existir token ANTERIOR à criação', () => {
    const criacao = 1_789_734_320_734 as Instant;
    const iatAnterior = Math.floor(criacao / 1000) - 1;
    assert.equal(tokenFoiRevogado(iatAnterior, barreiraDeContaNova(criacao)), true);
  });

  void it('REVOGAÇÃO de verdade continua varrendo o mesmo segundo', () => {
    // A janela de um segundo do SEC-006 não pode reabrir: quem tomou a conta
    // renova em laço no instante em que a vítima troca a senha.
    const revogacao = 1_789_734_320_734 as Instant;
    const iatNoMesmoSegundo = Math.floor(revogacao / 1000);
    assert.equal(tokenFoiRevogado(iatNoMesmoSegundo, revogacao), true);
  });

  void it('truncar é idempotente e nunca sobe o instante', () => {
    for (const ms of [0, 1, 999, 1000, 1001, 1_789_734_320_734]) {
      const uma = barreiraDeContaNova(ms as Instant);
      assert.ok(uma <= ms);
      assert.equal(barreiraDeContaNova(uma), uma);
    }
  });
});
