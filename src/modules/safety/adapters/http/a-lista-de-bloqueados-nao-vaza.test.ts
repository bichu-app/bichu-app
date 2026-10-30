/** **ISCA (c): A LISTA DE BLOQUEADOS NÃO MOSTRA MAIS DO QUE FOI DECIDIDO.** */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../../shared/types/brands.js';
import type { PessoaQueEuBloqueei } from '../../ports/safety-repository.js';
import { comoRespostaDoBloqueio } from './safety-routes.js';

const BLOQUEADA: PessoaQueEuBloqueei = {
  publicRef: 'Zm9vYmFyYmF6cXV1eHh5',
  handle: 'marina-vet',
  displayName: 'Marina',
  bloqueadoEm: 1_792_000_000_000 as Instant,
};

void describe('ISCA (c): o corpo de uma linha de bloqueado e FECHADO', () => {
  void it('CONTRAPESO -- a linha SAI, com as quatro chaves e os valores certos', () => {
    assert.deepEqual(comoRespostaDoBloqueio(BLOQUEADA), {
      public_ref: 'Zm9vYmFyYmF6cXV1eHh5',
      handle: 'marina-vet',
      display_name: 'Marina',
      blocked_at: '2026-10-14T17:46:40.000Z',
    });
  });

  void it('o conjunto de chaves e FECHADO: quatro, e nenhuma quinta', () => {
    assert.deepEqual(Object.keys(comoRespostaDoBloqueio(BLOQUEADA)).sort(), [
      'blocked_at',
      'display_name',
      'handle',
      'public_ref',
    ]);
  });

  void it('NENHUMA FOTO, em nome nenhum -- e a emenda 3 do ADR-0010', () => {
    const chaves = Object.keys(comoRespostaDoBloqueio(BLOQUEADA));
    for (const proibida of [
      'photo_url',
      'photo_icon_url',
      'avatar_url',
      'thumb_url',
      'grid_url',
      'open_url',
      'image_key',
      'photo',
      'showcase',
    ]) {
      assert.ok(
        !chaves.includes(proibida),
        `\`${proibida}\` põe a foto de uma pessoa bloqueada na tela de quem a bloqueou: ` +
          'a emenda 3 do ADR-0010 liberou a foto SÓ entre conexões aceitas, e bloqueado é ' +
          'o oposto disso',
      );
    }
  });

  void it('NENHUMA CONTAGEM e nenhum estado de conexao', () => {
    const chaves = Object.keys(comoRespostaDoBloqueio(BLOQUEADA));
    for (const proibida of [
      'pets_count',
      'connections_count',
      'connection_state',
      'connection_ref',
      'city',
      'neighbourhood',
      'email',
      'phone',
      'birth_date',
      'last_name',
    ]) {
      assert.ok(!chaves.includes(proibida), `\`${proibida}\` não foi decidido para esta tela`);
    }
  });

  void it('NENHUM UUID, e nada que diga QUEM BLOQUEOU', () => {
    const corpo = JSON.stringify(comoRespostaDoBloqueio(BLOQUEADA));
    assert.ok(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(corpo),
      `um UUID atravessou a borda: ${corpo}`,
    );
    for (const proibida of ['id', 'user_id', 'blocker_user_id', 'blocked_user_id', 'block_id']) {
      assert.ok(
        !Object.keys(comoRespostaDoBloqueio(BLOQUEADA)).includes(proibida),
        `\`${proibida}\` saiu na linha`,
      );
    }
  });

  void it('NADA sobre quem bloqueou QUEM CHAMA, nem como campo nem como valor', () => {
    const chaves = Object.keys(comoRespostaDoBloqueio(BLOQUEADA));
    for (const proibida of ['blocked_me', 'blocks_me', 'mutual', 'blocked_by_them', 'symmetric']) {
      assert.ok(
        !chaves.includes(proibida),
        `\`${proibida}\` conta a quem lê que a outra pessoa também o bloqueou: é o oráculo ` +
          '"ela te bloqueou", e descobrir que foi bloqueado é o que gera retaliação',
      );
    }
  });

  void it('apelido e nome NULOS viajam como `null`, e a chave NAO desaparece', () => {
    const semNome = comoRespostaDoBloqueio({
      ...BLOQUEADA,
      handle: null,
      displayName: null,
    });
    assert.deepEqual(semNome, {
      public_ref: 'Zm9vYmFyYmF6cXV1eHh5',
      handle: null,
      display_name: null,
      blocked_at: '2026-10-14T17:46:40.000Z',
    });
    assert.ok('handle' in semNome && 'display_name' in semNome);
  });
});
