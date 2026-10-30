/**
 * `criarLeitorDeConexao`: **a primeira implementação de
 * `connections/ports/conexao.ts`**, e os casos que provam que ela projeta o estado
 * pela regra do domínio em vez de uma cópia dela.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  conexoesEmMemoria,
  type PessoaDeTeste,
} from '../adapters/persistence/conexoes-em-memoria-de-teste.js';
import { criarLeitorDeConexao } from './leitor-de-conexao.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

const ANA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const BIA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CARLA = '018f3a2b-0000-7000-8000-0000000000cc' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

const PESSOAS: readonly PessoaDeTeste[] = [
  { id: ANA, apelido: 'ana-tutora', nomeDeExibicao: 'Ana', habilitada: true },
  { id: BIA, apelido: 'bia-vet', nomeDeExibicao: 'Bia', habilitada: true },
  { id: CARLA, apelido: 'carla-ong', nomeDeExibicao: 'Carla', habilitada: true },
];

function bancada() {
  const banca = conexoesEmMemoria(PESSOAS, AGORA);
  return { banca, leitor: criarLeitorDeConexao(banca.repositorio) };
}

void describe('criarLeitorDeConexao', () => {
  void it('sem aresta nenhuma devolve `undefined` -- e e isso que vira `none`', async () => {
    const { leitor } = bancada();
    assert.equal(await leitor.arestaVivaEntre(ANA, BIA, AGORA), undefined);
  });

  void it('pendente que EU recebi e `pending_received`; o que EU mandei e `pending_sent`', async () => {
    const { banca, leitor } = bancada();
    const ref = banca.semear({ pedinte: BIA, destinatario: ANA });

    assert.deepEqual(await leitor.arestaVivaEntre(ANA, BIA, AGORA), {
      estado: 'pending_received',
      ref,
    });
    assert.deepEqual(await leitor.arestaVivaEntre(BIA, ANA, AGORA), {
      estado: 'pending_sent',
      ref,
    });
  });

  void it('aceita e `connected` pelos dois lados', async () => {
    const { banca, leitor } = bancada();
    const ref = banca.semear({ pedinte: BIA, destinatario: ANA, estado: 'accepted' });
    assert.deepEqual(await leitor.arestaVivaEntre(ANA, BIA, AGORA), { estado: 'connected', ref });
    assert.deepEqual(await leitor.arestaVivaEntre(BIA, ANA, AGORA), { estado: 'connected', ref });
  });

  void it('ISCA -- pendente EXPIRADO devolve `undefined`, e nao um pendente eterno', async () => {
    const { banca, leitor } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, expiraEm: AGORA - 1 });
    assert.equal(await leitor.arestaVivaEntre(ANA, BIA, AGORA), undefined);
  });

  void it('ISCA -- RECUSA nao vira estado: ela devolve `undefined` para quem pediu', async () => {
    const { banca, leitor } = bancada();
    banca.semear({
      pedinte: ANA,
      destinatario: BIA,
      estado: 'declined',
      expiraEm: AGORA - 1,
      descansoAte: AGORA + 1_000,
    });
    assert.equal(await leitor.arestaVivaEntre(ANA, BIA, AGORA), undefined);
  });

  void it('a propria conta devolve `undefined` SEM consultar o repositorio', async () => {
    const { banca, leitor } = bancada();
    assert.equal(await leitor.arestaVivaEntre(ANA, ANA, AGORA), undefined);
    assert.equal(banca.linhas.length, 0);
  });

  void it('conta DESABILITADA de qualquer lado tira a aresta da leitura', async () => {
    const { banca, leitor } = bancada();
    banca.semear({ pedinte: BIA, destinatario: ANA, estado: 'accepted' });
    banca.desabilitar(BIA);
    assert.equal(await leitor.arestaVivaEntre(ANA, BIA, AGORA), undefined);
    banca.reabilitar(BIA);
    assert.equal((await leitor.arestaVivaEntre(ANA, BIA, AGORA))?.estado, 'connected');
  });

  void it('`contarConexoes` e `estaConectado` passam direto, e contam so o aceito', async () => {
    const { banca, leitor } = bancada();
    banca.semear({ pedinte: BIA, destinatario: ANA, estado: 'accepted' });
    banca.semear({ pedinte: CARLA, destinatario: ANA });

    assert.equal(await leitor.contarConexoes(ANA), 1, 'pendente nao e conexao');
    assert.equal(await leitor.estaConectado(ANA, BIA), true);
    assert.equal(await leitor.estaConectado(ANA, CARLA), false);
  });

  /**
   * **A porta tem QUATRO métodos desde 22/10/2026, e eram três.**
   * `estadosPorApelido` entrou com a decisão do cliente que autorizou a lista das
   * próprias conexões, e ela serve ao estado do par nos resultados da busca.
   */
  void it('ISCA -- a porta NAO oferece escrita NEM a lista, e nao ha como alcancar o repositorio', () => {
    const { leitor } = bancada();
    assert.deepEqual(Object.keys(leitor).sort(), [
      'arestaVivaEntre',
      'contarConexoes',
      'estaConectado',
      'estadosPorApelido',
    ]);
    for (const escrita of [
      'pedir',
      'aceitar',
      'encerrar',
      'desfazerPorBloqueio',
      'pedidos',
      'conexoes',
      'arestasPorApelido',
    ]) {
      assert.equal(
        (leitor as unknown as Record<string, unknown>)[escrita],
        undefined,
        `\`${escrita}\` vazou pela porta de LEITURA`,
      );
    }
  });
});
