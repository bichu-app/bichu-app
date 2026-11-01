import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoIso } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  arestaMorta,
  estadoNoApp,
  habilitaDadoDeConectado,
  nomeParaLer,
  projetarConexao,
  type ArestaGuardada,
  type EstadoGuardado,
} from './conexao.js';

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 86_400_000;
const ISO = (i: Instant) => comoIso(i);

function aresta(
  estado: EstadoGuardado,
  souQuemPediu: boolean,
  opcoes: { expiraEm?: number; descansoAte?: number | null; canalVerificado?: boolean } = {},
): ArestaGuardada {
  return {
    ref: 'Zm9vYmFyMTIzNDU2Nzg5MA',
    estado,
    souQuemPediu,
    pedidoEm: (Number(AGORA) - DIA) as Instant,
    expiraEm: (opcoes.expiraEm ?? Number(AGORA) + 29 * DIA) as Instant,
    descansoAte:
      opcoes.descansoAte === undefined
        ? estado === 'declined'
          ? ((Number(AGORA) + 89 * DIA) as Instant)
          : null
        : opcoes.descansoAte === null
          ? null
          : (opcoes.descansoAte as Instant),
    outraPessoa: {
      apelido: 'maria-silva',
      nomeDeExibicao: 'Maria',
      canalVerificado: opcoes.canalVerificado ?? false,
    },
  };
}

void describe('o aceite é obrigatório para todo dado de conectado', () => {
  void it('ISCA: pendente NÃO habilita dado de conectado, dos dois lados', () => {
    assert.equal(habilitaDadoDeConectado(aresta('pending', true), AGORA), false);
    assert.equal(habilitaDadoDeConectado(aresta('pending', false), AGORA), false);
  });

  void it('CONTRAPESO: depois do aceite, habilita — dos dois lados', () => {
    assert.equal(habilitaDadoDeConectado(aresta('accepted', true), AGORA), true);
    assert.equal(habilitaDadoDeConectado(aresta('accepted', false), AGORA), true);
  });

  void it('sem aresta nenhuma, não habilita — e é este o caso de "público"', () => {
    assert.equal(habilitaDadoDeConectado(undefined, AGORA), false);
  });

  void it('recusado e expirado não habilitam, nem para quem pediu', () => {
    assert.equal(habilitaDadoDeConectado(aresta('declined', true), AGORA), false);
    assert.equal(
      habilitaDadoDeConectado(aresta('pending', false, { expiraEm: Number(AGORA) - 1 }), AGORA),
      false,
    );
  });
});

void describe('a recusa é silenciosa', () => {
  void it('para quem pediu, recusado e pendente projetam o MESMO estado', () => {
    assert.equal(estadoNoApp(aresta('pending', true), AGORA), 'pending_sent');
    assert.equal(estadoNoApp(aresta('declined', true), AGORA), 'pending_sent');
  });

  void it('para quem pediu, o corpo projetado é indistinguível entre os dois', () => {
    const doPendente = projetarConexao(aresta('pending', true), AGORA, ISO);
    const doRecusado = projetarConexao(aresta('declined', true), AGORA, ISO);
    assert.deepEqual(doRecusado, doPendente);
  });

  void it('passada a validade, o recusado DESAPARECE — igual ao não respondido', () => {
    const vencido = { expiraEm: Number(AGORA) - 1 };
    assert.equal(estadoNoApp(aresta('declined', true, vencido), AGORA), undefined);
    assert.equal(estadoNoApp(aresta('pending', true, vencido), AGORA), undefined);
  });

  void it('para quem recusou, a aresta não se projeta — ele já decidiu', () => {
    assert.equal(estadoNoApp(aresta('declined', false), AGORA), undefined);
  });

  void it('nenhum estado do app se chama `declined`, nem `following`', () => {
    const possiveis = [
      estadoNoApp(aresta('pending', true), AGORA),
      estadoNoApp(aresta('pending', false), AGORA),
      estadoNoApp(aresta('declined', true), AGORA),
      estadoNoApp(aresta('accepted', true), AGORA),
    ];
    assert.deepEqual(
      [...new Set(possiveis.filter((e) => e !== undefined))].sort(),
      ['connected', 'pending_received', 'pending_sent'],
    );
  });
});

void describe('a aresta morta é reaproveitada, e só ela', () => {
  void it('pendente vencido e recusa com descanso vencido estão mortas', () => {
    assert.equal(arestaMorta(aresta('pending', true, { expiraEm: Number(AGORA) - 1 }), AGORA), true);
    assert.equal(
      arestaMorta(aresta('declined', true, { descansoAte: Number(AGORA) - 1 }), AGORA),
      true,
    );
  });

  void it('CONTRAPESO: aceita, pendente vivo e recusa em descanso NÃO estão mortas', () => {
    assert.equal(arestaMorta(aresta('accepted', true), AGORA), false);
    assert.equal(arestaMorta(aresta('pending', true), AGORA), false);
    assert.equal(arestaMorta(aresta('declined', true), AGORA), false);
  });

  void it('aceita nunca morre pelo relógio — conexão não expira', () => {
    const antiga = aresta('accepted', true, { expiraEm: Number(AGORA) - 1000 * DIA });
    assert.equal(arestaMorta(antiga, AGORA), false);
    assert.equal(habilitaDadoDeConectado(antiga, AGORA), true);
  });
});

void describe('o apelido é a chave de leitura, e nada quebra com ele nulo', () => {
  void it('com apelido, lê-se `@apelido`', () => {
    assert.equal(nomeParaLer({ apelido: 'maria-silva', nomeDeExibicao: 'Maria', canalVerificado: false }), '@maria-silva');
  });

  void it('sem apelido, cai para o nome de exibição', () => {
    assert.equal(nomeParaLer({ apelido: null, nomeDeExibicao: 'Maria', canalVerificado: false }), 'Maria');
  });

  void it('apelido vazio é tratado como ausente, e não vira `@`', () => {
    assert.equal(nomeParaLer({ apelido: '', nomeDeExibicao: 'Maria', canalVerificado: false }), 'Maria');
  });

  void it('sem os dois, devolve nulo — o servidor não escreve na tela', () => {
    assert.equal(nomeParaLer({ apelido: null, nomeDeExibicao: null, canalVerificado: false }), null);
  });

  void it('a projeção sobrevive aos dois nulos, que é o estado de hoje', () => {
    const semNada: ArestaGuardada = {
      ...aresta('pending', false),
      outraPessoa: { apelido: null, nomeDeExibicao: null, canalVerificado: false },
    };
    const projetada = projetarConexao(semNada, AGORA, ISO);
    assert.deepEqual(projetada?.person, {
      handle: null,
      display_name: null,
      contact_channel_verified: false,
    });
  });
});

void describe('ISCA (f): nenhum identificador interno na projeção', () => {
  const FORMA_DE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  void it('o corpo projetado não contém nada com forma de UUID', () => {
    for (const estado of ['pending', 'accepted', 'declined'] as const) {
      for (const souQuemPediu of [true, false]) {
        const projetada = projetarConexao(aresta(estado, souQuemPediu), AGORA, ISO);
        if (projetada === undefined) continue;
        assert.doesNotMatch(
          JSON.stringify(projetada),
          FORMA_DE_UUID,
          `a projeção de ${estado}/${String(souQuemPediu)} carregou algo com forma de UUID`,
        );
      }
    }
  });

  void it('ISCA: a varredura REPROVA um corpo que carregue UUID num campo novo', () => {
    const comVazamento = {
      ...projetarConexao(aresta('accepted', true), AGORA, ISO),
      person_id: '018f3a2b-0000-7000-8000-0000000000aa',
    };
    assert.match(
      JSON.stringify(comVazamento),
      FORMA_DE_UUID,
      'a isca passou: a expressão de UUID não reconhece um UUID de verdade, ' +
        'então a conferência acima não mede nada.',
    );
  });

  void it('a forma projetada tem exatamente quatro chaves, e nenhuma é de pessoa', () => {
    const projetada = projetarConexao(aresta('accepted', true), AGORA, ISO);
    assert.deepEqual(Object.keys(projetada ?? {}).sort(), [
      'person',
      'ref',
      'requested_at',
      'state',
    ]);
    assert.deepEqual(Object.keys(projetada?.person ?? {}).sort(), [
      'contact_channel_verified',
      'display_name',
      'handle',
    ]);
  });
});
