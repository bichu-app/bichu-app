import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { varrerEnviosVencidos } from './varrer-envios-vencidos.js';
import type { IntencaoVencida, MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import { relogioParado } from '../../../shared/time/relogio-de-teste.js';

const ENVIO = '018f7c1e-7a2b-7c3d-9e4f-000000000001';
const CHAVE_DA_VITRINE = comoObjectKey('people/original/AAAAAAAAAAAAAAAAAAAAAA');
const CHAVE_DO_ACHADO = comoObjectKey('found-reports/x/original/AAAAAAAAAAAAAAAAAAAAAA');

function varreduraCom(vencidas: readonly IntencaoVencida[]): {
  rodar: () => Promise<{ removidas: number; protegidas: number }>;
  apagados: string[];
} {
  const apagados: string[] = [];
  const repositorio = {
    listarIntencoesVencidas: () => Promise.resolve(vencidas),
    descartarIntencao: () => Promise.resolve(),
  } as unknown as MediaRepository;
  const armazenamento = {
    delete: (_classe: string, chave: string) => {
      apagados.push(chave);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;
  return {
    rodar: async () => {
      const r = await varrerEnviosVencidos({ repositorio, armazenamento, clock: relogioParado() });
      return { removidas: r.removidas, protegidas: r.protegidas };
    },
    apagados,
  };
}

void describe('a varredura de vencidos e a vitrine de fotos', () => {
  void it('ISCA -- a foto da vitrine que EXISTE nunca chega à varredura', async () => {
    const { rodar, apagados } = varreduraCom([]);
    const { removidas } = await rodar();
    assert.equal(removidas, 0);
    assert.deepEqual(apagados, [], 'nenhum objeto da vitrine sai do balde por PRAZO');
  });

  void it('CONTRAPESO -- intenção de vitrine NÃO confirmada e vencida É apagada', async () => {
    const { rodar, apagados } = varreduraCom([
      { id: ENVIO, objectKey: CHAVE_DA_VITRINE, kind: 'catalog_image' },
    ]);
    const { removidas, protegidas } = await rodar();
    assert.equal(removidas, 1, 'sem este caso, o anterior passaria para uma varredura que não limpa nada');
    assert.equal(protegidas, 0);
    assert.deepEqual(apagados, [CHAVE_DA_VITRINE]);
  });

  void it('CONTRAPESO -- a guarda da foto do ACHADO continua intacta', async () => {
    const { rodar, apagados } = varreduraCom([
      { id: ENVIO, objectKey: CHAVE_DO_ACHADO, kind: 'found_report_photo' },
    ]);
    const { removidas, protegidas } = await rodar();
    assert.equal(removidas, 0, 'nenhum apagamento automático toca informação de achado');
    assert.equal(protegidas, 1, 'a guarda do caso de uso é a segunda barreira, e ela conta');
    assert.deepEqual(apagados, []);
  });
});
