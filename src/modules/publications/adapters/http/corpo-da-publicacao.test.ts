/**
 * **O CORPO que as rotas do Mural devolvem, medido na projeção.**
 *
 * ## Por que este arquivo nasceu (21/10/2026)
 *
 * **Nenhum portão deste repositório confere o CORPO de uma resposta.** Os casos
 * de `autorizacao-na-clausula-where.test.ts` medem o SQL — quais colunas a
 * consulta seleciona — e param aí. Entre a coluna selecionada e a chave que
 * chega ao aplicativo há uma projeção escrita à mão, e até esta data ela não
 * tinha medição nenhuma: `photo_icon_url` podia sumir de
 * `comoPublicacaoDaLinha` e a suíte inteira continuava verde, porque a lista de
 * seleção do SQL continuava correta.
 *
 * A frente do selo de validado precisava de uma isca que dissesse *"com canal
 * confirmado o selo aparece"* **no corpo**, e não só no `SELECT`. É este o
 * arquivo.
 *
 * ## Por que a projeção e não uma requisição injetada
 *
 * Subir Fastify, autenticar e injetar mediria a mesma função com três camadas
 * de ruído em cima, e cada uma delas tem caso próprio em outro lugar. A
 * projeção é pura: ela recebe o que o repositório devolve e o `AbsoluteUrl` da
 * mídia, e devolve o objeto. É a mesma decisão — e a mesma redação — de
 * `comoResposta` em `people/adapters/http/person-profile-routes.ts` e de
 * `projetarMeuPerfil` em `identity/domain/resposta-do-perfil.ts`.
 */
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
    // **`false` e não chave ausente.** `contact_channel_verified` é obrigatório
    // no contrato; omitir a chave faria o aplicativo ler `undefined`, que não é
    // "não validado" e sim "não sei" — e o estado "não sei" não existe nesta
    // pergunta.
    const corpo = comoPublicacaoDaLinha(publicacao(false), BASE_DE_MIDIA);
    const autor = autorDe(corpo);
    assert.ok(Object.hasOwn(autor, 'contact_channel_verified'));
    assert.equal(autor['contact_channel_verified'], false);
  });

  void it('o comentário usa o MESMO `PublicationAuthor`, e o selo prova isso', () => {
    // O reuso do schema está escrito no contrato e no cabeçalho de
    // `comoComentario`. **Um caso que medisse só a publicação deixaria o
    // comentário livre para divergir** — e foi exatamente assim que
    // `photo_icon_url` quase ganhou um hospedeiro que o portão não vigiava.
    for (const valor of [true, false]) {
      const autor = autorDe(comoComentario(comentario(valor), BASE_DE_MIDIA));
      assert.equal(autor['contact_channel_verified'], valor);
    }
  });

  void it('a lista de chaves do AUTOR é FECHADA, e tem exatamente quatro', () => {
    // Âncora no CONJUNTO e não em "não contém X": lista de proibidos falha
    // exatamente no item que ninguém previu, e falha para verde. Campo novo em
    // `PublicationAuthor` é decisão do cliente e emenda ao ADR-0010 — este caso
    // é onde ela aparece no corpo.
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
    // "O e-mail dela foi confirmado em março" não é assunto de terceiro, e dizer
    // QUAL dos dois canais entregaria que a pessoa tem telefone cadastrado.
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
    // Sem este caso, uma projeção que devolvesse `{ author: { ... } }` e mais
    // nada passaria nos cinco acima. É o mesmo tipo de prova positiva que os
    // portões de varredura desta casa exigem de si mesmos.
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
