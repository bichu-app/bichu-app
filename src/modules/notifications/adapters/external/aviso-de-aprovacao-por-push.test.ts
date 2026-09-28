/**
 * A entrega do push de pedido aprovado a cada aparelho da conta: so o titulo no
 * fio, aparelho que sumiu revogado na hora, falha do transporte contada, e
 * titulo com cara de endereco barrado pela porteira antes de qualquer envio.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PushNaoEnviadoError, type MensagemDePush, type ResultadoDoEnvio } from '../../ports/push-sender.js';
import type { Aparelho } from '../../domain/aparelho.js';
import { criarAvisoDeAprovacaoPorPush } from './aviso-de-aprovacao-por-push.js';

function montar(respostas: Record<string, ResultadoDoEnvio | 'falha'>) {
  const enviados: MensagemDePush[] = [];
  const revogados: string[] = [];
  const entrega = criarAvisoDeAprovacaoPorPush({
    aparelhos: {
      listarDoDono: () => Promise.resolve(Object.keys(respostas).map((id) => ({ id }) as unknown as Aparelho)),
      enderecoDeEnvio: (id) => Promise.resolve(id === 'sem-token' ? null : `token-${id}`),
    },
    push: {
      transporte: 'teste',
      enviar: (m) => {
        enviados.push(m);
        const r = respostas[m.token.replace('token-', '')];
        if (r === 'falha') return Promise.reject(new PushNaoEnviadoError('cota', true, 'teste'));
        return Promise.resolve(r ?? 'aceito');
      },
    },
    revogarPorTokenRecusado: (t) => {
      revogados.push(t);
      return Promise.resolve(true);
    },
  });
  return { entrega, enviados, revogados };
}

void describe('aviso de pedido aprovado por push', () => {
  void it('entrega a cada aparelho, so com o titulo; revoga o que sumiu e conta a falha', async () => {
    const { entrega, enviados, revogados } = montar({ a: 'aceito', b: 'aparelho-sumiu', c: 'falha', 'sem-token': 'aceito' });
    const r = await entrega.avisar('conta-1', 'Encontro de galgos');
    assert.deepEqual(r, { aceitos: 1, falhos: 1, semAparelho: false });
    assert.deepEqual(revogados, ['token-b']);
    assert.equal(enviados.length, 3);
    for (const m of enviados) {
      assert.equal(m.corpo, 'Encontro de galgos');
      assert.deepEqual(m.dados, { tipo: 'pedidoAprovado' });
    }
  });

  void it('conta sem aparelho: nada sai, e o desfecho diz isso', async () => {
    const { entrega, enviados } = montar({});
    assert.deepEqual(await entrega.avisar('conta-1', 'Encontro'), { aceitos: 0, falhos: 0, semAparelho: true });
    assert.equal(enviados.length, 0);
  });

  void it('ISCA: titulo com cara de endereco e barrado antes de qualquer envio', async () => {
    const { entrega, enviados } = montar({ a: 'aceito' });
    const r = await entrega.avisar('conta-1', 'Encontro na Rua das Flores, 120');
    assert.deepEqual(r, { aceitos: 0, falhos: 1, semAparelho: false });
    assert.equal(enviados.length, 0);
  });
});
