/**
 * A FOTO DE PESSOA NÃO SAI EM RESPOSTA PÚBLICA — medido NO CONTRATO.
 *
 * Mora em `src/tools/` e não junto da projeção porque **lê `api/openapi.yaml` do
 * disco**, e `domain/` não conhece arquivo (o `eslint` deste repositório recusa
 * `node:fs` ali, e com razão). Os vizinhos deste diretório fazem o mesmo: os
 * portões de contrato público, administrativo e de colunas que não saem leem a
 * especificação daqui.
 *
 * ## Por que a regra é medida assim
 *
 * Ela é de OMISSÃO: "a foto do usuário sai em `Me` e em nenhuma outra resposta".
 * Omissão não se mede exercitando a única superfície que deve mostrar o campo —
 * se mede varrendo as outras e provando que nenhuma o declara. Um caso que
 * chamasse `getMe` e achasse a foto passaria igual num mundo em que a foto
 * também sai na conversa mediada.
 *
 * A projeção em si (a URL nula enquanto processa, o selo derivado) é medida em
 * `src/modules/identity/domain/foto-do-usuario-e-selo.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const contrato = readFileSync('api/openapi.yaml', 'utf8');

void describe('a foto de pessoa não sai em resposta pública (contrato)', () => {
  void it('`MyPhoto` é referenciado em UM lugar só, e esse lugar é `Me`', () => {
    const referencias = contrato.match(/#\/components\/schemas\/MyPhoto\b/g) ?? [];
    assert.equal(referencias.length, 1, 'duas referências significam uma segunda superfície');

    // E a referência está dentro de `Me`: o trecho entre `Me:` e o schema
    // seguinte é onde ela tem de cair.
    const inicioDoMe = contrato.indexOf('\n    Me:\n');
    const inicioDoProximo = contrato.indexOf('\n    MeUpdate:\n');
    assert.ok(inicioDoMe > 0 && inicioDoProximo > inicioDoMe);
    const blocoDoMe = contrato.slice(inicioDoMe, inicioDoProximo);
    assert.match(blocoDoMe, /#\/components\/schemas\/MyPhoto\b/);
  });

  void it('`Conversation.participants` continua dizendo por extenso que não traz foto de perfil', () => {
    // Não é prosa decorativa: é a decisão registrada que impede alguém
    // "completar" a conversa mediada com a foto da pessoa. Se a frase sair, a
    // decisão saiu com ela, e este caso reprova.
    const frases = contrato.match(/telefone, e-mail nem foto de perfil/g) ?? [];
    assert.equal(frases.length, 2, 'a conversa do tutor e a do achador, as duas');
  });

  void it('nenhuma outra resposta do contrato declara um campo `photo` de pessoa', () => {
    // `photo_url` da foto de PET e `photo_upload_id` (campo de escrita) são
    // outra coisa e continuam valendo. O que esta isca proíbe é um segundo
    // `photo:` que referencie a foto de pessoa.
    const ocorrencias = contrato.match(/^\s+photo:\s*$/gm) ?? [];
    // Duas: `Me.photo` e `AdminDirectoryEntry.photo` (a foto do LUGAR, que é de
    // estabelecimento e sai só na superfície administrativa). Uma terceira é
    // superfície nova e precisa de decisão do cliente.
    assert.equal(ocorrencias.length, 2, 'um `photo:` a mais é uma superfície a mais');
  });

  void it('não existe campo de escrita de selo: `MeUpdate` aceita foto e NÃO aceita validação', () => {
    const inicio = contrato.indexOf('\n    MeUpdate:\n');
    const fim = contrato.indexOf('\n    Device:\n', inicio);
    assert.ok(inicio > 0 && fim > inicio);
    const bloco = contrato.slice(inicio, fim);

    assert.match(bloco, /photo_upload_id/, 'a foto é escrita por aqui');
    // Um campo de selo no corpo de escrita deixaria qualquer conta se declarar
    // validada, que é o mesmo defeito do `verification_level` do profissional:
    // perfil que declara o próprio nível torna a verificação decorativa.
    assert.ok(!bloco.includes('email_verified'), 'selo não é campo de escrita');
    assert.ok(!bloco.includes('verified:'), 'selo não é campo de escrita');
  });
});
