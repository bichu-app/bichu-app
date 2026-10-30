/** A varredura dos envios vencidos. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { varrerEnviosVencidos } from './varrer-envios-vencidos.js';
import type { IntencaoVencida, MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import type { ObjectKey } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import { relogioParado } from '../../../shared/time/relogio-de-teste.js';

const vencidas: IntencaoVencida[] = [
  { id: 'i-1', objectKey: comoObjectKey('pets/p/original/aaa'), kind: 'pet_photo' },
  { id: 'i-2', objectKey: comoObjectKey('pets/p/original/bbb'), kind: 'pet_photo' },
];

function montar(opcoes: { falhaAoApagar?: string; lista?: IntencaoVencida[] } = {}): {
  deps: Parameters<typeof varrerEnviosVencidos>[0];
  passos: string[];
  restantes: IntencaoVencida[];
} {
  const passos: string[] = [];
  const lista = opcoes.lista ?? vencidas;
  const restantes = [...lista];

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
      const id = lista.find((v) => v.objectKey === chave)?.id ?? '?';
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
    assert.deepEqual(passos, ['objeto:i-1', 'linha:i-1', 'objeto:i-2', 'linha:i-2']);
  });

  void it('conta o que examinou e o que removeu', async () => {
    const { deps } = montar();
    assert.deepEqual(await varrerEnviosVencidos(deps), {
      examinadas: 2,
      removidas: 2,
      falhas: 0,
      protegidas: 0,
    });
  });

  void it('uma falha NÃO derruba a rodada, e a linha fica para a próxima', async () => {
    const { deps, passos, restantes } = montar({ falhaAoApagar: 'i-1' });
    const r = await varrerEnviosVencidos(deps);

    assert.deepEqual(r, { examinadas: 2, removidas: 1, falhas: 1, protegidas: 0 });
    assert.ok(passos.includes('objeto:i-2'), 'a rodada parou na primeira falha');
    assert.deepEqual(restantes.map((v) => v.id), ['i-1']);
  });

  void describe('A FOTO DO ACHADO NÃO É APAGADA (decisão do cliente, 17/10/2026)', () => {
    const DO_ACHADO: IntencaoVencida[] = [
      {
        id: 'a-1',
        objectKey: comoObjectKey('found-reports/r-1/original/ccc'),
        kind: 'found_report_photo',
      },
      {
        id: 'a-2',
        objectKey: comoObjectKey('found-reports/sem-conta/original/ddd'),
        kind: 'finder_photo',
      },
    ];

    void it('NÃO apaga o objeto da foto do achado, nas DUAS espécies', async () => {
      const { deps, passos } = montar({ lista: [...DO_ACHADO] });
      await varrerEnviosVencidos(deps);
      assert.deepEqual(passos, [], 'a varredura APAGOU foto de achado');
    });

    void it('NÃO apaga a linha da intenção do achado', async () => {
      const { deps, restantes } = montar({ lista: [...DO_ACHADO] });
      await varrerEnviosVencidos(deps);
      assert.deepEqual(
        restantes.map((v) => v.id),
        ['a-1', 'a-2'],
        'a intenção do achado foi descartada',
      );
    });

    void it('conta as protegidas, e NÃO as conta como removidas nem como falhas', async () => {
      const { deps } = montar({ lista: [...DO_ACHADO] });
      assert.deepEqual(await varrerEnviosVencidos(deps), {
        examinadas: 2,
        removidas: 0,
        falhas: 0,
        protegidas: 2,
      });
    });

    void it('a foto de pet na MESMA rodada continua sendo limpa', async () => {
      const misturada: IntencaoVencida[] = [
        DO_ACHADO[0] as IntencaoVencida,
        { id: 'p-1', objectKey: comoObjectKey('pets/p/original/eee'), kind: 'pet_photo' },
        { id: 'c-1', objectKey: comoObjectKey('products/original/fff'), kind: 'catalog_image' },
      ];
      const { deps, passos, restantes } = montar({ lista: misturada });

      assert.deepEqual(await varrerEnviosVencidos(deps), {
        examinadas: 3,
        removidas: 2,
        falhas: 0,
        protegidas: 1,
      });
      assert.deepEqual(passos, ['objeto:p-1', 'linha:p-1', 'objeto:c-1', 'linha:c-1']);
      assert.deepEqual(
        restantes.map((v) => v.id),
        ['a-1'],
      );
    });
  });

  void it('sem nada vencido, não chama o armazenamento', async () => {
    const { deps, passos, restantes } = montar();
    restantes.length = 0;
    assert.deepEqual(await varrerEnviosVencidos(deps), {
      examinadas: 0,
      removidas: 0,
      falhas: 0,
      protegidas: 0,
    });
    assert.deepEqual(passos, []);
  });
});
