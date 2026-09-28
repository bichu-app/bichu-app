/**
 * A saída de `processing`, medida sem banco: é regra de domínio, não de SQL.
 *
 * O que estes casos protegem é a diferença entre duas coisas que parecem a
 * mesma: a foto que ficou presa porque o processo morreu (tem de sair, em
 * `rejected`, com motivo) e a foto que já tinha desfecho (não pode ser tocada).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TEXTO_DO_PROCESSAMENTO_INTERROMPIDO,
  desistirDaFoto,
} from './desistir-da-foto.js';
import type { MediaRepository } from '../ports/media-repository.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import type { Instant } from '../../../shared/types/brands.js';

interface Recusa {
  readonly foto: string;
  readonly motivo: string;
}

function repositorioDublado(
  foto: { id: string; status: string } | null,
): { repositorio: MediaRepository; recusas: Recusa[] } {
  const recusas: Recusa[] = [];
  const repositorio = {
    buscarParaProcessar(id: string) {
      if (foto === null || foto.id !== id) return Promise.resolve(null);
      return Promise.resolve({
        id: foto.id,
        status: foto.status as 'processing' | 'ready' | 'rejected',
        originalKey: comoObjectKey('pets/0192f0a1b2c34d5e6f708192a3b4c5d6/original/foto.jpg'),
      });
    },
    marcarRecusada(id: string, motivo: string) {
      // O dublê repete a guarda do adaptador de verdade
      // (`kysely-media-repository.ts`: `.where('status', '=', 'processing')`).
      // Sem ela aqui, o teste aprovaria uma chamada que o banco recusaria, e o
      // dublê estaria mais permissivo que a produção — que é como dublê mente.
      if (foto?.status === 'processing') recusas.push({ foto: id, motivo });
      return Promise.resolve();
    },
  } as unknown as MediaRepository;
  return { repositorio, recusas };
}

const clock = { now: (): Instant => 1_759_000_000_000 as Instant };

void describe('desistência da foto por trabalho órfão', () => {
  void it('foto presa em processing sai em rejected, com motivo que não culpa o arquivo', async () => {
    const { repositorio, recusas } = repositorioDublado({ id: 'f1', status: 'processing' });

    const mudou = await desistirDaFoto({ repositorio, clock }, { photo_id: 'f1' });

    assert.equal(mudou, true);
    assert.equal(recusas.length, 1);
    assert.equal(recusas[0]?.motivo, TEXTO_DO_PROCESSAMENTO_INTERROMPIDO);
    // O texto é a única coisa que distingue esta recusa das três do envio, e ele
    // não pode mandar a pessoa trocar de foto: o defeito foi nosso.
    assert.doesNotMatch(TEXTO_DO_PROCESSAMENTO_INTERROMPIDO, /escolha outra|tire uma nova/i);
    assert.match(TEXTO_DO_PROCESSAMENTO_INTERROMPIDO, /nosso/i);
  });

  void it('foto que já ficou PRONTA não é recusada: o processo morreu depois de terminá-la', async () => {
    const { repositorio, recusas } = repositorioDublado({ id: 'f2', status: 'ready' });

    const mudou = await desistirDaFoto({ repositorio, clock }, { photo_id: 'f2' });

    assert.equal(mudou, false);
    assert.equal(recusas.length, 0, 'recusar foto pronta apagaria da tela uma imagem já servida');
  });

  void it('foto já recusada não é recusada de novo', async () => {
    const { repositorio, recusas } = repositorioDublado({ id: 'f3', status: 'rejected' });

    assert.equal(await desistirDaFoto({ repositorio, clock }, { photo_id: 'f3' }), false);
    assert.equal(recusas.length, 0);
  });

  void it('foto apagada entre o envio e a desistência é caso normal, não erro', async () => {
    const { repositorio, recusas } = repositorioDublado(null);

    assert.equal(await desistirDaFoto({ repositorio, clock }, { photo_id: 'sumida' }), false);
    assert.equal(recusas.length, 0);
  });
});
