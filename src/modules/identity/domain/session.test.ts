import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Instant } from '../../../shared/types/brands.js';
import {
  barreiraDeContaNova,
  instanteDeEmissaoDoAcesso,
  instanteDeRevogacao,
  prazosDeNovaFamilia,
  prazosDeRotacao,
  refreshFoiRevogado,
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
    const revogadoEm = (AGORA + 500) as Instant;
    assert.equal(tokenFoiRevogado(emSegundos(AGORA), revogadoEm), true);
  });
});

void describe('barreira de sessão da conta recém-criada', () => {
  void it('o token emitido NO MESMO SEGUNDO da criação vale', () => {
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

void describe('emissão que espera a virada do segundo (BICHUS-132)', () => {
  const emSegundos = (instante: number): number => Math.floor(instante / 1000);

  void it('o token emitido no MESMO SEGUNDO da redefinição nasce VALENDO', () => {
    const redefinidaEm = 1_789_734_320_734 as Instant;
    const login = 1_789_734_320_834 as Instant;

    const iat = emSegundos(instanteDeEmissaoDoAcesso(login, redefinidaEm));
    assert.equal(
      tokenFoiRevogado(iat, redefinidaEm),
      false,
      'a primeira tela depois da redefinição não pode responder 401',
    );
  });

  void it('o empurrão é de no máximo um segundo, e para a virada exata', () => {
    const redefinidaEm = 1_789_734_320_734 as Instant;
    const login = 1_789_734_320_834 as Instant;

    assert.equal(instanteDeEmissaoDoAcesso(login, redefinidaEm), 1_789_734_321_000);
    assert.ok(instanteDeEmissaoDoAcesso(login, redefinidaEm) - login <= 1000);
  });

  void it('a REVOGAÇÃO não se move: o arredondamento para cima continua inteiro', () => {
    const revogacao = 1_789_734_320_734 as Instant;
    assert.equal(tokenFoiRevogado(emSegundos(revogacao), revogacao), true);
    assert.equal(tokenFoiRevogado(emSegundos(revogacao) - 1, revogacao), true);
  });

  void it('nada de token ANTERIOR passa a valer por causa do empurrão', () => {
    const redefinidaEm = 1_789_734_320_734 as Instant;
    const login = 1_789_734_320_834 as Instant;
    const empurrado = instanteDeEmissaoDoAcesso(login, redefinidaEm);

    for (const anterior of [
      emSegundos(redefinidaEm),
      emSegundos(redefinidaEm) - 1,
      emSegundos(redefinidaEm) - 60,
    ]) {
      assert.ok(anterior < emSegundos(empurrado), 'o token velho segue em outro segundo');
      assert.equal(tokenFoiRevogado(anterior, redefinidaEm), true);
    }
  });

  void it('sem revogação recente, a emissão sai na hora — ninguém espera à toa', () => {
    const login = 1_789_734_320_834 as Instant;
    const velha = (login - 60_000) as Instant;
    assert.equal(instanteDeEmissaoDoAcesso(login, velha), login);

    assert.equal(instanteDeEmissaoDoAcesso(login, barreiraDeContaNova(login)), login);
  });
});

void describe('instanteDeRevogacao(): a barreira alcança o `iat` empurrado', () => {
  const emSegundos = (instante: number): number => Math.floor(instante / 1000);

  const VIRADA = 1_789_734_320_000 as Instant;
  const PRIMEIRA = (VIRADA + 288) as Instant;
  const LOGIN = (VIRADA + 400) as Instant;
  const SEGUNDA = (VIRADA + 900) as Instant;

  void it('A ISCA: o token emitido entre as duas revogações cai na segunda', () => {
    const iat = emSegundos(instanteDeEmissaoDoAcesso(LOGIN, PRIMEIRA));
    assert.equal(
      tokenFoiRevogado(iat, instanteDeRevogacao(SEGUNDA, PRIMEIRA)),
      true,
      'a segunda revogação tem de alcançar o token emitido depois da primeira',
    );
  });

  void it('e o token emitido DEPOIS da segunda continua valendo', () => {
    const barreira = instanteDeRevogacao(SEGUNDA, PRIMEIRA);
    const iatNovo = emSegundos(instanteDeEmissaoDoAcesso((VIRADA + 950) as Instant, barreira));
    assert.equal(tokenFoiRevogado(iatNovo, barreira), false);
  });

  void it('sem revogação recente, grava `agora` ao milissegundo e nada se move', () => {
    const velha = (VIRADA - 60_000) as Instant;
    assert.equal(instanteDeRevogacao(SEGUNDA, velha), SEGUNDA);
    assert.equal(instanteDeRevogacao(SEGUNDA, 0 as Instant), SEGUNDA);
    assert.equal(instanteDeRevogacao(SEGUNDA, barreiraDeContaNova(velha)), SEGUNDA);
  });

  void it('o empurrão é de no máximo um segundo, e só quando aperta', () => {
    const barreira = instanteDeRevogacao(SEGUNDA, PRIMEIRA);
    assert.ok(barreira > SEGUNDA, 'precisa passar da virada que a emissão usou');
    assert.ok(barreira - SEGUNDA <= 1000, 'e nunca mais do que a virada seguinte');
    assert.equal(barreira, 1_789_734_321_001);
  });

  void it('nenhuma revogação afrouxa: o token anterior continua recusado', () => {
    const barreira = instanteDeRevogacao(SEGUNDA, PRIMEIRA);
    for (const anterior of [emSegundos(VIRADA), emSegundos(VIRADA) - 1, emSegundos(VIRADA) - 3600]) {
      assert.equal(tokenFoiRevogado(anterior, barreira), true);
    }
    assert.ok(barreira >= SEGUNDA, 'a barreira nunca anda para trás do relógio da revogação');
  });
});

void describe('refreshFoiRevogado(): SEC-006 do lado do refresh', () => {
  const REDEFINIDA_EM = 1_789_734_320_734 as Instant;

  void it('recusa o refresh nascido antes da barreira, mesmo por 1 ms', () => {
    assert.equal(refreshFoiRevogado((REDEFINIDA_EM - 1) as Instant, REDEFINIDA_EM), true);
    assert.equal(refreshFoiRevogado((REDEFINIDA_EM - 3_600_000) as Instant, REDEFINIDA_EM), true);
  });

  void it('deixa passar o refresh nascido depois da barreira', () => {
    assert.equal(refreshFoiRevogado((REDEFINIDA_EM + 1) as Instant, REDEFINIDA_EM), false);
  });

  void it('o empate SOBREVIVE, ao contrário do que vale para o token de acesso', () => {
    assert.equal(refreshFoiRevogado(REDEFINIDA_EM, REDEFINIDA_EM), false);

    assert.equal(tokenFoiRevogado(Math.floor(REDEFINIDA_EM / 1000), REDEFINIDA_EM), true);
  });

  void it('conta sem revogação nenhuma: todo refresh passa', () => {
    assert.equal(refreshFoiRevogado(REDEFINIDA_EM, 0 as Instant), false);
  });
});
