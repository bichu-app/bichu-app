/** O processamento da foto de pet, nas quatro decisões que entraram nesta entrega. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { processarFoto } from './processar-foto.js';
import type { Derivada, ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import type { FotoDoPet, MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import { comoData } from '../../../shared/time/clock.js';
import {
  DERIVADAS_DA_FOTO_DE_PET,
  DIMENSAO_MINIMA_DA_FOTO_DE_PET,
  FORMATO_DAS_DERIVADAS,
  TETO_DE_BYTES_DA_DERIVADA,
} from '../domain/derivadas.js';
import type { Instant } from '../../../shared/types/brands.js';

const AGORA = 1_760_000_000_000 as Instant;
const FOTO = '01a0b480-0000-7000-8000-000000000001';

interface Cenario {
  readonly status?: FotoDoPet['status'];
  readonly largura?: number;
  readonly altura?: number;
  readonly inspecao?: MotivoDeRecusa;
  readonly derivada?: MotivoDeRecusa;
  readonly acimaDoTeto?: boolean;
}

function montar(cenario: Cenario): {
  deps: Parameters<typeof processarFoto>[0];
  eventos: string[];
  pedidos: { largura: number; altura?: number; tetoDeBytes: number }[];
} {
  const eventos: string[] = [];
  const pedidos: { largura: number; altura?: number; tetoDeBytes: number }[] = [];

  const repositorio = {
    buscarParaProcessar: () =>
      Promise.resolve({
        id: FOTO,
        status: cenario.status ?? 'processing',
        rejectionReason: null,
        isPrimary: true,
        originalKey: comoObjectKey('pets/1111/original/abc'),
        thumbKey: null,
        cardKey: null,
        createdAt: comoData(AGORA),
      }),
    marcarPronta: (entrada: { thumbKey: string; cardKey: string }) => {
      eventos.push(`pronta:${entrada.thumbKey}:${entrada.cardKey}`);
      return Promise.resolve();
    },
    marcarRecusada: (_id: string, motivo: string) => {
      eventos.push(`recusada:${motivo}`);
      return Promise.resolve();
    },
  } as unknown as MediaRepository;

  const armazenamento = {
    get: () => Promise.resolve(Buffer.from('bytes')),
    put: (classe: string, chave: string) => {
      eventos.push(`put:${classe}:${chave}`);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;

  const imagens: ImageProcessor = {
    inspecionar: () =>
      Promise.resolve(
        cenario.inspecao ?? {
          formato: 'jpeg',
          largura: cenario.largura ?? 2000,
          altura: cenario.altura ?? 1500,
          megapixels: 3,
        },
      ),
    derivar: (_bytes, pedido) => {
      pedidos.push({
        largura: pedido.largura,
        ...(pedido.altura === undefined ? {} : { altura: pedido.altura }),
        tetoDeBytes: pedido.tetoDeBytes,
      });
      if (cenario.derivada !== undefined) return Promise.resolve(cenario.derivada);
      const d: Derivada = {
        bytes: Buffer.from('d'),
        contentType: FORMATO_DAS_DERIVADAS.contentType,
        extensao: FORMATO_DAS_DERIVADAS.extensao,
        largura: pedido.largura,
        altura: pedido.altura ?? pedido.largura,
        qualidade: pedido.escada[0] ?? 82,
        acimaDoTeto: cenario.acimaDoTeto ?? false,
      };
      return Promise.resolve(d);
    },
  };

  return {
    deps: {
      repositorio,
      armazenamento,
      imagens,
      ids: {
        uuidv7: () => 'nao-usado',
        random128: () => new Uint8Array(16).fill(5),
        random80: () => new Uint8Array(10),
        opaqueToken: () => {
          throw new Error('nao usado');
        },
      },
      clock: { now: () => AGORA },
    },
    eventos,
    pedidos,
  };
}

void describe('as derivadas vêm do PONTO ÚNICO, e não de números daqui', () => {
  void it('pede exatamente as derivadas que `DERIVADAS_DA_FOTO_DE_PET` declara', () => {
    const { deps, pedidos } = montar({});
    return processarFoto(deps, { photo_id: FOTO }).then(() => {
      assert.deepEqual(
        pedidos.map((p) => p.largura),
        DERIVADAS_DA_FOTO_DE_PET.map((d) => d.largura),
      );
      assert.deepEqual(
        pedidos.map((p) => p.altura),
        DERIVADAS_DA_FOTO_DE_PET.map((d) => d.altura),
      );
    });
  });

  void it('passa o teto de 500 KB em TODAS, inclusive na miniatura', () => {
    const { deps, pedidos } = montar({});
    return processarFoto(deps, { photo_id: FOTO }).then(() => {
      for (const p of pedidos) assert.equal(p.tetoDeBytes, TETO_DE_BYTES_DA_DERIVADA);
    });
  });

  void it('sobe as duas ANTES de marcar `ready`', async () => {
    const { deps, eventos } = montar({});
    await processarFoto(deps, { photo_id: FOTO });
    const pronta = eventos.findIndex((e) => e.startsWith('pronta:'));
    assert.equal(eventos.filter((e) => e.startsWith('put:')).length, 2);
    for (const [i, e] of eventos.entries()) {
      if (e.startsWith('put:')) assert.ok(i < pronta, 'derivada subiu depois de `ready`');
    }
  });

  void it('as derivadas vão para o bucket PÚBLICO: é a foto do próprio tutor', async () => {
    const { deps, eventos } = montar({});
    await processarFoto(deps, { photo_id: FOTO });
    for (const e of eventos.filter((x) => x.startsWith('put:'))) {
      assert.ok(e.startsWith('put:publico:'), e);
    }
  });

  void it('relata bytes e degrau de qualidade de cada derivada', async () => {
    const { deps } = montar({});
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'pronta');
    if (r.tipo !== 'pronta') return;
    assert.equal(r.derivadas.length, DERIVADAS_DA_FOTO_DE_PET.length);
    for (const d of r.derivadas) {
      assert.ok(d.bytes > 0);
      assert.ok(d.qualidade > 0);
      assert.equal(typeof d.acimaDoTeto, 'boolean');
    }
  });

  void it('derivada que estourou o teto é RELATADA, e não escondida', async () => {
    const { deps } = montar({ acimaDoTeto: true });
    const r = await processarFoto(deps, { photo_id: FOTO });
    if (r.tipo !== 'pronta') return assert.fail('esperava `pronta`');
    assert.ok(r.derivadas.every((d) => d.acimaDoTeto));
  });
});

void describe('a dimensão mínima, que não existia', () => {
  void it(`RECUSA abaixo de ${String(DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura)} px, com o número no motivo`, async () => {
    const { deps, eventos } = montar({ largura: 100, altura: 100 });
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'recusada');
    if (r.tipo === 'recusada') assert.equal(r.motivo, 'imagem_pequena_demais');
    const recusa = eventos.find((e) => e.startsWith('recusada:'));
    assert.match(recusa ?? '', new RegExp(String(DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura)));
    assert.ok(!eventos.some((e) => e.startsWith('put:')), 'nada sobe quando a recusa é final');
  });

  void it('recusa quando só a ALTURA está abaixo: as duas contam', async () => {
    const { deps } = montar({ largura: 2000, altura: 300 });
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'recusada');
  });

  void it('ACEITA exatamente no mínimo: "pelo menos" inclui o próprio número', async () => {
    const { deps } = montar({
      largura: DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura,
      altura: DIMENSAO_MINIMA_DA_FOTO_DE_PET.altura,
    });
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'pronta');
  });

  void it('a foto grande demais continua recebendo o motivo DELA', async () => {
    const { deps } = montar({ inspecao: 'imagem_grande_demais' });
    const r = await processarFoto(deps, { photo_id: FOTO });
    if (r.tipo !== 'recusada') return assert.fail('esperava recusa');
    assert.equal(r.motivo, 'imagem_grande_demais');
  });
});

void describe('o motivo chega gravado, em texto para a tela', () => {
  for (const motivo of [
    'formato_nao_aceito',
    'imagem_grande_demais',
    'imagem_ilegivel',
    'imagem_animada',
    'formato_nao_decodificavel',
  ] as const) {
    void it(`${motivo} tem texto, e não é o código`, async () => {
      const { deps, eventos } = montar({ inspecao: motivo });
      await processarFoto(deps, { photo_id: FOTO });
      const recusa = eventos.find((e) => e.startsWith('recusada:'));
      assert.ok(recusa !== undefined, 'a recusa precisa ser gravada');
      assert.ok(!recusa.includes(motivo), 'o código do motivo não é texto de tela');
      assert.ok(recusa.length > 'recusada:'.length + 20, 'texto curto demais para explicar');
    });
  }

  void it('o decodificador que desiste é recusa FINAL, e não exceção', async () => {
    const { deps } = montar({ derivada: 'formato_nao_decodificavel' });
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'recusada');
  });
});

void describe('reentrega e estado final', () => {
  void it('foto que não está `processing` é IGNORADA', async () => {
    const { deps, eventos } = montar({ status: 'ready' });
    const r = await processarFoto(deps, { photo_id: FOTO });
    assert.equal(r.tipo, 'ignorada');
    assert.deepEqual(eventos, []);
  });
});
