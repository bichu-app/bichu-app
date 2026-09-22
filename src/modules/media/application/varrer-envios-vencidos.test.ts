/**
 * A varredura dos envios vencidos.
 *
 * O caso central é de **ordem**, e não de resultado: o objeto sai antes da
 * linha. A ordem inversa também "funciona" — a linha some, a varredura termina
 * feliz — e deixa no bucket um objeto que ninguém consegue nomear, porque a
 * chave dele só vivia naquela linha. É um defeito que nenhum teste de resultado
 * pega, e que só aparece na fatura.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { varrerEnviosVencidos } from './varrer-envios-vencidos.js';
import type { IntencaoVencida, MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import type { ObjectKey } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import { relogioParado } from '../../../shared/time/relogio-de-teste.js';

const vencidas: IntencaoVencida[] = [
  { id: 'i-1', objectKey: comoObjectKey('pets/p/original/aaa') },
  { id: 'i-2', objectKey: comoObjectKey('pets/p/original/bbb') },
];

function montar(opcoes: { falhaAoApagar?: string } = {}): {
  deps: Parameters<typeof varrerEnviosVencidos>[0];
  passos: string[];
  restantes: IntencaoVencida[];
} {
  const passos: string[] = [];
  const restantes = [...vencidas];

  const repositorio = {
    listarIntencoesVencidas: () => Promise.resolve([...restantes]),
    descartarIntencao: (id: string) => {
      passos.push(`linha:${id}`);
      const i = restantes.findIndex((v) => v.id === id);
      if (i >= 0) restantes.splice(i, 1);
      return Promise.resolve();
    },
  } as unknown as MediaRepository;

  const armazenamento = {
    delete: (_classe: string, chave: ObjectKey) => {
      const id = vencidas.find((v) => v.objectKey === chave)?.id ?? '?';
      if (opcoes.falhaAoApagar === id) return Promise.reject(new Error('armazenamento fora do ar'));
      passos.push(`objeto:${id}`);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;

  return { deps: { repositorio, armazenamento, clock: relogioParado() }, passos, restantes };
}

void describe('varredura de envios vencidos', () => {
  void it('apaga O OBJETO ANTES DA LINHA, para cada intenção', async () => {
    const { deps, passos } = montar();
    await varrerEnviosVencidos(deps);
    // A chave só vive na linha: apagá-la primeiro perderia o único ponteiro
    // para o objeto, e ele viraria lixo que ninguém consegue nomear.
    assert.deepEqual(passos, ['objeto:i-1', 'linha:i-1', 'objeto:i-2', 'linha:i-2']);
  });

  void it('conta o que examinou e o que removeu', async () => {
    const { deps } = montar();
    assert.deepEqual(await varrerEnviosVencidos(deps), { examinadas: 2, removidas: 2, falhas: 0 });
  });

  void it('uma falha NÃO derruba a rodada, e a linha fica para a próxima', async () => {
    const { deps, passos, restantes } = montar({ falhaAoApagar: 'i-1' });
    const r = await varrerEnviosVencidos(deps);

    assert.deepEqual(r, { examinadas: 2, removidas: 1, falhas: 1 });
    // A segunda foi processada mesmo com a primeira falhando.
    assert.ok(passos.includes('objeto:i-2'), 'a rodada parou na primeira falha');
    // E a que falhou continua na fila: a linha não foi tocada.
    assert.deepEqual(restantes.map((v) => v.id), ['i-1']);
  });

  void it('sem nada vencido, não chama o armazenamento', async () => {
    const { deps, passos, restantes } = montar();
    restantes.length = 0;
    assert.deepEqual(await varrerEnviosVencidos(deps), { examinadas: 0, removidas: 0, falhas: 0 });
    assert.deepEqual(passos, []);
  });
});
