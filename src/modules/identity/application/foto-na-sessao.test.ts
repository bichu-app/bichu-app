/**
 * **A FOTO DA PESSOA VIAJA NA SESSÃO, e não só em `getMe`.**
 *
 * Relato do cliente, 20/10/2026, literal: *"o icone do perfil em todas as
 * paginas, não esta sendo substituido pela foto do perfil do usuário"*.
 *
 * ## O DEFEITO QUE ESTE ARQUIVO PRENDE
 *
 * `Me` tem **dois** montadores no servidor. `projetarMeuPerfil` responde
 * `getMe`/`updateMe` e sempre carregou a foto; `projetarConta` responde
 * `SessionResponse.user` -- as rotas de sessão -- e **não a carregava**, embora
 * `api/openapi.yaml` aponte os dois para o MESMO schema `Me`, cujo `photo` está
 * declarado desde 18/10/2026. O contrato prometia e a implementação não
 * entregava.
 *
 * O app desenha o avatar da barra de topo a partir da SESSÃO
 * (`Escopo.sessao.usuario`), e não de `getMe`. Sem a foto ali ele caía na
 * inicial do nome, **em todas as páginas** -- e caía CALADO, porque cair na
 * inicial é desfecho legítimo da cadeia foto → inicial → glifo. Era um defeito
 * que parecia certo, e é por isso que passou.
 *
 * ## POR QUE A IGUALDADE ENTRE AS DUAS PROJEÇÕES É O CASO CENTRAL
 *
 * Um caso que só afirmasse "a sessão tem foto" passaria no dia em que alguém
 * montasse aqui uma SEGUNDA projeção da foto, com outra regra de URL ou outro
 * tratamento de `processing`. A afirmação que não deixa isso acontecer é a de
 * que as duas respondem a MESMA coisa para a mesma conta e a mesma foto --
 * `resposta-do-perfil.ts` é a fonte das duas, e este arquivo cobra que continue
 * sendo.
 *
 * Mesmo arranjo, e mesmo motivo, de `selo-do-dono-nao-diverge.test.ts`: o
 * cabeçalho dele já avisava que um campo em um montador e não no outro faz o
 * dado aparecer depois do login e desaparecer em `Meus dados`. A foto era esse
 * campo, na direção contrária.
 *
 * ## O QUE ESTE ARQUIVO NÃO MEDE
 *
 * Que o app DESENHE a foto. Isso é Flutter, e quem o mede é
 * `app/test/telas/foto_do_usuario_na_barra_test.dart` (o desenho) e
 * `app/test/telas/foto_na_sessao_crua_test.dart` (a foto chegando pela porta
 * que o app realmente lê, e sobrevivendo ao chaveiro).
 */
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
    // `projetarSessao` e quem as quatro rotas de sessao chamam. Um caso so em
    // `projetarConta` passaria com a sessao jogando a foto fora no caminho.
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
    // O caso que impede uma SEGUNDA projecao da foto de nascer aqui. As duas
    // leem `projetarFotoDoPerfil`; no dia em que uma delas passar a montar a URL
    // por conta propria, elas divergem e este caso reprova.
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
    // O app precisa distinguir "ainda processando" de "nao tem": uma URL que
    // daria 404 e a pior das duas respostas.
    const user = projetarConta(
      conta(),
      projetarFotoDoPerfil(foto({ status: 'processing', publicKey: null }), URL_DE_MIDIA),
    );
    assert.equal(user.photo?.status, 'processing');
    assert.equal(user.photo?.url, null);
  });

  void it('CONTROLE POSITIVO — conta SEM foto continua respondendo `null`', () => {
    // A correcao nao pode ter inventado foto para quem nao tem: `null` e o
    // estado de toda conta que nunca cadastrou uma, e e o caminho que desenha a
    // inicial do nome -- que continua certo quando NAO ha foto.
    const user = projetarConta(conta(), projetarFotoDoPerfil(null, URL_DE_MIDIA));
    assert.equal(
      user.photo,
      null,
      'REPROVA: conta sem foto passou a responder algo em `photo`. A cadeia do app ' +
        'e foto -> inicial -> glifo, e `null` e o que a faz cair na inicial.',
    );
  });
});
