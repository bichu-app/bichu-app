/**
 * **ISCA (c): A LISTA DE BLOQUEADOS NÃO MOSTRA MAIS DO QUE FOI DECIDIDO.**
 *
 * ## Por que o corpo é medido aqui, e não num portão
 *
 * Porque **nenhum portão deste repositório confere o CORPO da resposta**: o
 * Fastify valida a REQUISIÇÃO, e o contrato é lido por varredura de declaração.
 * Um campo que alguém implemente e esqueça de declarar atravessa os dois — e
 * esse é o caminho real do vazamento. A única forma de medir o corpo em suíte é
 * chamar a projeção, que é por isso que `comoRespostaDoBloqueio` é exportada.
 *
 * É a mesma forma de `people/adapters/http` com `comoResposta`.
 *
 * ## O QUE CADA LINHA MOSTRA, E POR QUE SÓ ISSO
 *
 * A lista mostra pessoas com quem quem chama **não tem vínculo nenhum** — ela
 * bloqueou justamente para não ter. O recorte é o mínimo que identifica alguém
 * **para a própria pessoa que o bloqueou**:
 *
 * | Chave | Por que ela está aqui |
 * |---|---|
 * | `public_ref` | é o endereço que `unblockUser` recebe. Sem ele a linha não tem botão |
 * | `display_name` | é o que a própria pessoa que bloqueou reconhece |
 * | `handle` | é o identificador ESTÁVEL: `display_name` muda, e dois homônimos bloqueados ficariam indistinguíveis |
 * | `blocked_at` | é o ato de QUEM CHAMA, e não dado da outra pessoa. Dá a ordem fixa da lista |
 *
 * **Nenhum dos três campos de pessoa é campo novo.** `handle`, `public_ref` e
 * `display_name` são exatamente os três que a **emenda 2 do ADR-0010**
 * (19/10/2026) já libera a qualquer chamador com conta em `getPersonProfile`.
 * Esta lista não abre nada que aquela emenda não tenha aberto, e é por isso que
 * ela **não pediu emenda nova**.
 *
 * **A FOTO NÃO ESTÁ AQUI, e esta é a ausência que mais importa.** A **emenda 3
 * do ADR-0010** (19/10/2026) liberou a foto de perfil em UMA superfície — o
 * participante da conversa mediada — e **apenas entre conexões aceitas**. Uma
 * lista de bloqueados é o oposto de conexão aceita. Foto, apelido e nome juntos
 * são o perfil de uma conexão, e isso não é o que esta tela é.
 */
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
    // Sem ele, todos os casos de omissão abaixo passariam num mundo em que a
    // projeção devolve `{}` — que é a forma mais fácil de um teste de omissão
    // ficar verde sem ter medido nada.
    assert.deepEqual(comoRespostaDoBloqueio(BLOQUEADA), {
      public_ref: 'Zm9vYmFyYmF6cXV1eHh5',
      handle: 'marina-vet',
      display_name: 'Marina',
      blocked_at: '2026-10-14T17:46:40.000Z',
    });
  });

  void it('o conjunto de chaves e FECHADO: quatro, e nenhuma quinta', () => {
    // Âncora no CONJUNTO e não em "não contém X": lista de proibidos falha
    // exatamente no item que ninguém previu, e falha para verde. Campo novo
    // nesta linha é decisão do cliente, e este caso é onde ela aparece.
    assert.deepEqual(Object.keys(comoRespostaDoBloqueio(BLOQUEADA)).sort(), [
      'blocked_at',
      'display_name',
      'handle',
      'public_ref',
    ]);
  });

  void it('NENHUMA FOTO, em nome nenhum -- e a emenda 3 do ADR-0010', () => {
    // A emenda 3 abriu a foto de perfil em UMA superfície, a conversa mediada,
    // e **só entre conexões aceitas**. Bloqueado é o oposto de conexão aceita.
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
    // `pets_count` e `connections_count` são o sinal de CONFIANÇA de um perfil,
    // e a pergunta desta tela não é "quem é esta pessoa" — é "qual das pessoas
    // que eu bloqueei é esta". Contagem não identifica ninguém.
    //
    // `connection_state` convidaria a uma religação que `unblockUser` não faz:
    // desbloquear devolve visibilidade, e não a conexão.
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
    // `blocker_user_id` é sempre quem chama: projetá-lo não contaria nada novo
    // a quem lê e poria um UUID interno na borda (ADR-0010 item 6).
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
    // Esta é a metade simétrica, e ela não tem representação nenhuma na
    // superfície: nem lista, nem contagem, nem booleano. Um `blocked_me: false`
    // aqui seria o oráculo escrito por extenso.
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
    // A chave vem SEMPRE. Omiti-la obrigaria a tela a distinguir "não tem nome"
    // de "o servidor esqueceu", e a linha de quem não tem apelido precisa
    // existir — senão aquela pessoa fica bloqueada para sempre, que é o defeito
    // que esta operação conserta.
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
