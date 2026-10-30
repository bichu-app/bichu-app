/** **O CORPO que as rotas do Mural devolvem, medido na projeção.** */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type { ComentarioVisivel, PublicacaoNaLinha } from '../../ports/publicacoes-repository.js';
import { comoComentario, comoPublicacaoDaLinha } from './publicacao-routes.js';

const BASE_DE_MIDIA = 'https://midia.exemplo/derivadas' as AbsoluteUrl;

function publicacao(canalVerificado: boolean): PublicacaoNaLinha {
  return {
    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
    corpo: 'o Bidu no parque',
    criadaEm: new Date('2026-10-21T12:00:00.000Z'),
    foto: null,
    handle: 'marina-vet',
    displayName: 'Marina',
    autorThumbKey: null,
    canalVerificado,
    curtidas: 0,
    comentarios: 0,
    curtiEu: false,
    minha: false,
  };
}

function comentario(canalVerificado: boolean): ComentarioVisivel {
  return {
    ref: 'CcDdEeFfGgHhIiJjKkLlM1',
    corpo: 'que lindo!',
    criadoEm: new Date('2026-10-21T12:01:00.000Z'),
    handle: 'joana',
    displayName: 'Joana',
    autorThumbKey: null,
    canalVerificado,
    meu: false,
  };
}

function autorDe(corpo: Record<string, unknown>): Record<string, unknown> {
  return corpo['author'] as Record<string, unknown>;
}

void describe('O SELO DE VALIDADO chega ao CORPO, e não só ao `SELECT`', () => {
  void it('com canal confirmado, `contact_channel_verified` sai `true` na publicação', () => {
    const corpo = comoPublicacaoDaLinha(publicacao(true), BASE_DE_MIDIA);
    assert.equal(autorDe(corpo)['contact_channel_verified'], true);
  });

  void it('ISCA -- sem canal confirmado sai `false`, e a chave CONTINUA presente', () => {
    const corpo = comoPublicacaoDaLinha(publicacao(false), BASE_DE_MIDIA);
    const autor = autorDe(corpo);
    assert.ok(Object.hasOwn(autor, 'contact_channel_verified'));
    assert.equal(autor['contact_channel_verified'], false);
  });

  void it('o comentário usa o MESMO `PublicationAuthor`, e o selo prova isso', () => {
    for (const valor of [true, false]) {
      const autor = autorDe(comoComentario(comentario(valor), BASE_DE_MIDIA));
      assert.equal(autor['contact_channel_verified'], valor);
    }
  });

  void it('a lista de chaves do AUTOR é FECHADA, e tem exatamente quatro', () => {
    for (const corpo of [
      comoPublicacaoDaLinha(publicacao(true), BASE_DE_MIDIA),
      comoComentario(comentario(true), BASE_DE_MIDIA),
    ]) {
      assert.deepEqual(Object.keys(autorDe(corpo)).sort(), [
        'contact_channel_verified',
        'display_name',
        'handle',
        'photo_icon_url',
      ]);
    }
  });

  void it('o selo é BOOLEANO, e nunca a data nem o endereço', () => {
    const autor = autorDe(comoPublicacaoDaLinha(publicacao(true), BASE_DE_MIDIA));
    assert.equal(typeof autor['contact_channel_verified'], 'boolean');
    for (const proibida of [
      'email',
      'email_verified_at',
      'phone',
      'phone_e164',
      'phone_verified_at',
      'verified_at',
      'verified_channel',
    ]) {
      assert.ok(
        !Object.hasOwn(autor, proibida),
        `\`${proibida}\` apareceu no autor: o que sai é o booleano`,
      );
    }
  });

  void it('CONTRAPESO -- a projeção não é um objeto vazio, e os outros campos continuam lá', () => {
    const corpo = comoPublicacaoDaLinha(publicacao(true), BASE_DE_MIDIA);
    assert.deepEqual(Object.keys(corpo).sort(), [
      'author',
      'body',
      'comment_count',
      'created_at',
      'image',
      'like_count',
      'liked_by_me',
      'mine',
      'ref',
    ]);
    assert.equal(corpo['body'], 'o Bidu no parque');
    assert.equal(autorDe(corpo)['display_name'], 'Marina');
  });
});
