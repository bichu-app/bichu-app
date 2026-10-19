/**
 * `criarLeitorDeConexao`: **a primeira implementação de
 * `connections/ports/conexao.ts`**, e os casos que provam que ela projeta o
 * estado pela regra do domínio em vez de uma cópia dela.
 *
 * ## Por que estes casos moram AQUI e não na fatia que consome
 *
 * Porque a regra é desta fatia. A fatia G (o perfil de outra pessoa) recebe a
 * **porta**, e a porta é onde a fronteira da arquitetura corta: um caso em
 * `people/` que montasse `conexoesEmMemoria` estaria importando
 * `connections/adapters/`, e o `eslint` desta casa reprova — com razão, porque
 * seria a fatia G passando a depender de como a conexão guarda as linhas.
 *
 * Então a divisão é: **aqui** se prova que `pending`, `accepted`, expirado,
 * recusado-em-descanso e a própria conta viram o que devem virar; **lá** se
 * prova o recorte do perfil, com a porta dublada.
 *
 * A bancada é `conexoesEmMemoria`, a mesma que a fatia F usa, então
 * `estadoNoApp` é exercitado de verdade.
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

    // A MESMA linha, lida pelos dois lados, devolve estados diferentes: a
    // direção é derivada de quem pergunta, e não guardada por leitor.
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
    // Ninguém apaga pendente expirado: a linha fica, e é a projeção que decide
    // que ela não vale mais. Sem isto, uma aresta morta de 2026 continuaria
    // habilitando dado de conectado para sempre.
    const { banca, leitor } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, expiraEm: AGORA - 1 });
    assert.equal(await leitor.arestaVivaEntre(ANA, BIA, AGORA), undefined);
  });

  void it('ISCA -- RECUSA nao vira estado: ela devolve `undefined` para quem pediu', async () => {
    // **É isto que mantém a recusa silenciosa.** Um valor próprio para
    // recusado seria o *"ela recusou você"* que faz as pessoas aceitarem
    // estranhos para não criar atrito.
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
    // E reabilitar DEVOLVE a conexão intacta: a linha não é apagada.
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

  void it('ISCA -- a porta NAO oferece escrita, e nao ha como alcancar o repositorio por ela', () => {
    // O repositório inteiro tem `pedir`, `aceitar`, `encerrar` e
    // `desfazerPorBloqueio`. **Nada disso atravessa esta porta**, e é por isso
    // que a fatia G pode receber a conexão sem poder mudá-la.
    const { leitor } = bancada();
    assert.deepEqual(Object.keys(leitor).sort(), [
      'arestaVivaEntre',
      'contarConexoes',
      'estaConectado',
    ]);
    for (const escrita of ['pedir', 'aceitar', 'encerrar', 'desfazerPorBloqueio', 'pedidos']) {
      assert.equal(
        (leitor as unknown as Record<string, unknown>)[escrita],
        undefined,
        `\`${escrita}\` vazou pela porta de LEITURA`,
      );
    }
  });
});
