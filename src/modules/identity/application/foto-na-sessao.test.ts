/** **A FOTO DA PESSOA VIAJA NA SESSÃO, e não só em `getMe`.** */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { Conta, FotoDoPerfil } from '../ports/identity-repository.js';
import { projetarFotoDoPerfil, projetarMeuPerfil } from '../domain/resposta-do-perfil.js';
import { projetarConta, projetarSessao, type ParDeTokens } from './session-view.js';

/** A MESMA função que a composição monta de `MEDIA_PUBLIC_BASE_URL`. */
const URL_DE_MIDIA = (chave: string): string => `https://midia.bichu.test/${chave}`;

/** A derivada `card`, como o worker a grava: `people/card/` + bits aleatórios. */
const CHAVE_DA_FOTO = 'people/card/9f8e7d6c5b4a3210.jpeg';
const URL_DA_FOTO = `https://midia.bichu.test/${CHAVE_DA_FOTO}`;

const AGORA = Date.UTC(2026, 9, 21, 12, 0, 0) as Instant;

function conta(mudanca: Partial<Conta> = {}): Conta {
  return {
    id: '0192a3b4-0000-7000-8000-00000000bbbb' as UserId,
    email: 'tutora@exemplo-de-teste.invalid',
    emailVerifiedAt: comoData(Date.UTC(2026, 9, 2, 12, 0, 0) as Instant),
    displayName: 'Marina',
    handle: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: comoData(Date.UTC(2026, 9, 1, 12, 0, 0) as Instant),
    ...mudanca,
  };
}

function foto(mudanca: Partial<FotoDoPerfil> = {}): FotoDoPerfil {
  return {
    status: 'ready',
    publicKey: CHAVE_DA_FOTO,
    rejectionReason: null,
    ...mudanca,
  };
}

const PAR: ParDeTokens = {
  accessToken: 'access-de-15-minutos',
  expiresInSeconds: 900,
  refreshToken: 'refresh-que-vale-pela-conta',
  refreshExpiresAt: (AGORA + 2_592_000_000) as Instant,
};

void describe('a foto da pessoa na projeção que o app lê para a barra', () => {
  void it('ISCA — `SessionResponse.user.photo` traz a URL da foto pronta', () => {
    const projetada = projetarFotoDoPerfil(foto(), URL_DE_MIDIA);
    const user = projetarConta(conta(), projetada);

    assert.notEqual(
      user.photo,
      null,
      'REPROVA: `SessionResponse.user.photo` saiu nulo com a conta tendo foto ' +
        '`ready`. E a porta por onde o app monta o avatar da barra de topo: sem ' +
        'ela ele cai na inicial do nome em TODAS as paginas, calado, porque cair ' +
        'na inicial e desfecho legitimo da cadeia foto -> inicial -> glifo.',
    );
    assert.equal(
      user.photo?.url,
      URL_DA_FOTO,
      'REPROVA: a URL da foto na sessao nao e a que `urlDeMidia` monta. O app le ' +
        '`Me.photo.url` INTEIRA e nao monta chave de armazenamento (ADR-0010 item 6).',
    );
    assert.equal(user.photo?.status, 'ready');
  });

  void it('ISCA — a sessão INTEIRA leva a foto, e não só a projeção da conta', () => {
    const sessao = projetarSessao(
      conta(),
      PAR,
      AGORA,
      projetarFotoDoPerfil(foto(), URL_DE_MIDIA),
    );
    assert.equal(
      sessao.user.photo?.url,
      URL_DA_FOTO,
      'REPROVA: a foto nao chegou a `SessionResponse.user.photo`. Sao as rotas de ' +
        'sessao (cadastro, login, renovacao e confirmacao de e-mail) que enchem a ' +
        'sessao do app, e e dela que o avatar da barra sai.',
    );
  });

  void it('ISCA — as DUAS projeções de `Me` respondem a MESMA foto', () => {
    const c = conta();
    const f = foto();
    const doPerfil = projetarMeuPerfil(c, f, URL_DE_MIDIA) as unknown as {
      photo: unknown;
    };
    const daSessao = projetarConta(c, projetarFotoDoPerfil(f, URL_DE_MIDIA));

    assert.deepEqual(
      daSessao.photo,
      doPerfil.photo,
      'REPROVA: `getMe` e `SessionResponse.user` discordam sobre a foto da MESMA ' +
        'conta. O contrato aponta os dois para o schema `Me`, e duas projecoes da ' +
        'mesma foto divergiriam -- a que divergisse seria a da sessao, que e a ' +
        'menos olhada das duas e a que o app usa para a barra.',
    );
  });

  void it('a foto AINDA PROCESSANDO viaja com `url` nula, e não como ausência', () => {
    const user = projetarConta(
      conta(),
      projetarFotoDoPerfil(foto({ status: 'processing', publicKey: null }), URL_DE_MIDIA),
    );
    assert.equal(user.photo?.status, 'processing');
    assert.equal(user.photo?.url, null);
  });

  void it('CONTROLE POSITIVO — conta SEM foto continua respondendo `null`', () => {
    const user = projetarConta(conta(), projetarFotoDoPerfil(null, URL_DE_MIDIA));
    assert.equal(
      user.photo,
      null,
      'REPROVA: conta sem foto passou a responder algo em `photo`. A cadeia do app ' +
        'e foto -> inicial -> glifo, e `null` e o que a faz cair na inicial.',
    );
  });
});
