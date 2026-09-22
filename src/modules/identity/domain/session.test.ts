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
  instanteDeEmissaoDoAcesso,
  instanteDeRevogacao,
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

/**
 * A emissão que espera a virada do segundo (BICHUS-132).
 *
 * O defeito que estes casos travam tem vítima com nome: é a pessoa que acabou
 * de recuperar uma conta tomada. Ela redefine a senha, entra no mesmo segundo,
 * e a primeira tela responde "sua sessão terminou". Tenta de novo e funciona —
 * mas já levou o susto exatamente no momento em que mais precisava acreditar
 * que a conta voltou a ser dela.
 *
 * O primeiro caso é a isca: ele reprova com o código antigo instalado. Os
 * outros são o contrapeso, e existem porque uma "correção" que simplesmente
 * afrouxasse `tokenFoiRevogado` passaria no primeiro e devolveria ao invasor a
 * janela de um segundo que o arredondamento existe para tirar.
 */
void describe('emissão que espera a virada do segundo (BICHUS-132)', () => {
  const emSegundos = (instante: number): number => Math.floor(instante / 1000);

  void it('o token emitido no MESMO SEGUNDO da redefinição nasce VALENDO', () => {
    // Redefinição em 20,734 s; a pessoa entra 100 ms depois, no mesmo segundo.
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
    // O custo é o teto do que a pessoa espera: nunca mais do que a virada.
    const redefinidaEm = 1_789_734_320_734 as Instant;
    const login = 1_789_734_320_834 as Instant;

    assert.equal(instanteDeEmissaoDoAcesso(login, redefinidaEm), 1_789_734_321_000);
    assert.ok(instanteDeEmissaoDoAcesso(login, redefinidaEm) - login <= 1000);
  });

  void it('a REVOGAÇÃO não se move: o arredondamento para cima continua inteiro', () => {
    // O contrapeso principal. Quem tomou a conta está renovando em laço no
    // instante em que a vítima troca a senha; o token que ele recebeu no mesmo
    // segundo da revogação continua caindo do lado revogado. É `tokenFoiRevogado`
    // que garante isso, e ele não foi tocado.
    const revogacao = 1_789_734_320_734 as Instant;
    assert.equal(tokenFoiRevogado(emSegundos(revogacao), revogacao), true);
    assert.equal(tokenFoiRevogado(emSegundos(revogacao) - 1, revogacao), true);
  });

  void it('nada de token ANTERIOR passa a valer por causa do empurrão', () => {
    // O empurrão move a emissão, e só a emissão. Um `iat` que já existia — o do
    // token que o invasor tem na mão — não ganha nada com ele.
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
    // O caso de todo dia: quem entra sem ter redefinido senha nenhuma não paga
    // nem um milissegundo. Sem este caso, "some sempre um segundo" passaria.
    const login = 1_789_734_320_834 as Instant;
    const velha = (login - 60_000) as Instant;
    assert.equal(instanteDeEmissaoDoAcesso(login, velha), login);

    // E a conta recém-criada, cuja barreira já vem truncada ao segundo, também
    // não paga: `barreiraDeContaNova` e este empurrão não se atropelam.
    assert.equal(instanteDeEmissaoDoAcesso(login, barreiraDeContaNova(login)), login);
  });
});

/**
 * A barreira que a revogação grava (SEC-006, duas revogações no mesmo segundo).
 *
 * O primeiro caso é a ISCA em forma de aritmética: com a barreira gravada em
 * `agora` cru — o que o produto fazia — o token que a emissão empurrou para a
 * virada do segundo sobrevive à revogação seguinte. Os outros são o contrapeso:
 * fora desse aperto, `instanteDeRevogacao` não pode mudar absolutamente nada,
 * porque o que ela grava é lido também pelo lado do refresh.
 */
void describe('instanteDeRevogacao(): a barreira alcança o `iat` empurrado', () => {
  const emSegundos = (instante: number): number => Math.floor(instante / 1000);

  /** Virada exata, para a aritmética ficar legível. */
  const VIRADA = 1_789_734_320_000 as Instant;
  const PRIMEIRA = (VIRADA + 288) as Instant;
  const LOGIN = (VIRADA + 400) as Instant;
  const SEGUNDA = (VIRADA + 900) as Instant;

  void it('A ISCA: o token emitido entre as duas revogações cai na segunda', () => {
    // Com `agora` cru — `tokenFoiRevogado(iat, SEGUNDA)` — este `assert` é
    // FALSO: as duas revogações arredondam para a mesma virada e o token passa.
    const iat = emSegundos(instanteDeEmissaoDoAcesso(LOGIN, PRIMEIRA));
    assert.equal(
      tokenFoiRevogado(iat, instanteDeRevogacao(SEGUNDA, PRIMEIRA)),
      true,
      'a segunda revogação tem de alcançar o token emitido depois da primeira',
    );
  });

  void it('e o token emitido DEPOIS da segunda continua valendo', () => {
    // O contrapeso direto: uma barreira que recusasse tudo passaria na isca.
    const barreira = instanteDeRevogacao(SEGUNDA, PRIMEIRA);
    const iatNovo = emSegundos(instanteDeEmissaoDoAcesso((VIRADA + 950) as Instant, barreira));
    assert.equal(tokenFoiRevogado(iatNovo, barreira), false);
  });

  void it('sem revogação recente, grava `agora` ao milissegundo e nada se move', () => {
    // Este é o caso de toda revogação do produto, e ele NÃO pode mudar: o mesmo
    // valor é lido pelo lado do refresh, onde a comparação é em milissegundo e
    // o empate sobrevive de propósito (BICHUS-77). Um `agora + 1` genérico
    // mataria esse empate sem ninguém ter decidido isso.
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
    // O contrapeso de BICHUS-132 visto daqui. Empurrar a barreira para a frente
    // não pode devolver validade a nada — e não devolve, porque ela só cresce.
    const barreira = instanteDeRevogacao(SEGUNDA, PRIMEIRA);
    for (const anterior of [emSegundos(VIRADA), emSegundos(VIRADA) - 1, emSegundos(VIRADA) - 3600]) {
      assert.equal(tokenFoiRevogado(anterior, barreira), true);
    }
    assert.ok(barreira >= SEGUNDA, 'a barreira nunca anda para trás do relógio da revogação');
  });
});
