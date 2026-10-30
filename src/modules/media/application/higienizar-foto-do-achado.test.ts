/**
 * A higiene da foto do achado — e o que estes casos protegem é um vazamento de
 * coordenada de GPS.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { higienizarFotoDoAchado } from './higienizar-foto-do-achado.js';
import type { Derivada, ImageProcessor, MotivoDeRecusa } from '../ports/image-processor.js';
import type { FotoDoAchadoParaHigienizar, FotosDoAchadoDoWorker } from '../ports/fotos-do-achado.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import type { Instant, ObjectKey } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import { FORMATO_DAS_DERIVADAS } from '../domain/derivadas.js';

const AGORA = 1_760_000_000_000 as Instant;
const ORIGINAL = comoObjectKey('found-reports/11111111-1111-1111-1111-111111111111/original/abc');
const ORIGINAL_SEM_CONTA = comoObjectKey('found-reports/sem-conta/original/abc');

interface Cenario {
  readonly foto?: FotoDoAchadoParaHigienizar | null;
  readonly inspecao?: MotivoDeRecusa | { formato: 'jpeg'; largura: number; altura: number; megapixels: number };
  readonly derivada?: MotivoDeRecusa | Derivada;
  readonly contentLength?: number;
  readonly getLanca?: boolean;
  /** O armazenamento recusa a exclusão do original. */
  readonly deleteLanca?: boolean;
  /** O banco cai na hora de gravar `sanitized_key`. */
  readonly marcarLanca?: boolean;
}

function montar(cenario: Cenario): {
  deps: Parameters<typeof higienizarFotoDoAchado>[0];
  eventos: string[];
} {
  const eventos: string[] = [];
  const foto: FotoDoAchadoParaHigienizar | null =
    cenario.foto === undefined
      ? {
          uploadIntentId: '22222222-2222-2222-2222-222222222222',
          dono: '11111111-1111-1111-1111-111111111111',
          originalKey: ORIGINAL,
          status: 'pendente',
        }
      : cenario.foto;

  const fotos: FotosDoAchadoDoWorker = {
    paraHigienizar: () => Promise.resolve(foto),
    pendentes: () => Promise.resolve([]),
    marcarHigienizada: (id, chave) => {
      if (cenario.marcarLanca === true) return Promise.reject(new Error('banco fora do ar'));
      eventos.push(`pronta:${id}:${chave}`);
      return Promise.resolve();
    },
    marcarRecusada: (id, motivo) => {
      eventos.push(`recusada:${id}:${motivo}`);
      return Promise.resolve();
    },
    marcarAusente: (id) => {
      eventos.push(`ausente:${id}`);
      return Promise.resolve();
    },
  };

  const armazenamento = {
    head: (classe: string) => {
      eventos.push(`head:${classe}`);
      return Promise.resolve(
        cenario.contentLength === 0
          ? null
          : { contentLength: cenario.contentLength ?? 1024, contentType: 'image/jpeg', etag: 'e' },
      );
    },
    get: (classe: string) => {
      eventos.push(`get:${classe}`);
      if (cenario.getLanca === true) return Promise.reject(new Error('balde fora do ar'));
      return Promise.resolve(Buffer.from('bytes'));
    },
    put: (classe: string, chave: ObjectKey) => {
      eventos.push(`put:${classe}:${chave}`);
      return Promise.resolve();
    },
    delete: (classe: string, chave: ObjectKey) => {
      if (cenario.deleteLanca === true) return Promise.reject(new Error('balde fora do ar'));
      eventos.push(`delete:${classe}:${chave}`);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;

  const imagens: ImageProcessor = {
    inspecionar: () =>
      Promise.resolve(
        cenario.inspecao ?? { formato: 'jpeg', largura: 1600, altura: 1200, megapixels: 1.92 },
      ),
    derivar: () =>
      Promise.resolve(
        cenario.derivada ?? {
          bytes: Buffer.from('derivada'),
          contentType: FORMATO_DAS_DERIVADAS.contentType,
          extensao: FORMATO_DAS_DERIVADAS.extensao,
          largura: 1024,
          altura: 1126,
          qualidade: 86,
          acimaDoTeto: false,
        },
      ),
  };

  return {
    deps: {
      fotos,
      armazenamento,
      imagens,
      ids: {
        uuidv7: () => 'nao-usado',
        random128: () => new Uint8Array(16).fill(9),
        random80: () => new Uint8Array(10),
        opaqueToken: () => {
          throw new Error('nao usado');
        },
      },
      clock: { now: () => AGORA },
    },
    eventos,
  };
}

void describe('higiene da foto do achado: o caminho feliz', () => {
  void it('grava a derivada no bucket PRIVADO, e nunca no público', async () => {
    const { deps, eventos } = montar({});
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'higienizada');
    const puts = eventos.filter((e) => e.startsWith('put:'));
    assert.equal(puts.length, 1);
    assert.ok(puts[0]?.startsWith('put:privado:'), `derivada foi para ${String(puts[0])}`);
    assert.ok(
      !eventos.some((e) => e.startsWith('put:publico')),
      'a foto do achador nunca ganha derivada pública (critério 9)',
    );
  });

  void it('a chave da derivada fica no MESMO prefixo do original', async () => {
    const { deps, eventos } = montar({});
    await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    const put = eventos.find((e) => e.startsWith('put:privado:'));
    assert.ok(
      put?.includes('found-reports/11111111-1111-1111-1111-111111111111/sanitized/'),
      `chave inesperada: ${String(put)}`,
    );
  });

  void it('a foto de quem NÃO tem conta usa o rótulo `sem-conta`, não o UUID', async () => {
    const { deps, eventos } = montar({
      foto: {
        uploadIntentId: '33333333-3333-3333-3333-333333333333',
        dono: 'sem-conta',
        originalKey: ORIGINAL_SEM_CONTA,
        status: 'pendente',
      },
    });
    await higienizarFotoDoAchado(deps, {
      upload_intent_id: '33333333-3333-3333-3333-333333333333',
    });
    const put = eventos.find((e) => e.startsWith('put:privado:'));
    assert.ok(put?.includes('found-reports/sem-conta/sanitized/'), `chave: ${String(put)}`);
  });

  void describe('A JANELA DE PERDA: nunca existe um instante sem nenhuma cópia', () => {
    const ENVIO = '22222222-2222-2222-2222-222222222222';

    void it('a ordem é: sobe a limpa, GRAVA a chave, e SÓ ENTÃO apaga o original', async () => {
      const { deps, eventos } = montar({});
      await higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO });

      const subiu = eventos.findIndex((e) => e.startsWith('put:privado:'));
      const gravou = eventos.findIndex((e) => e.startsWith(`pronta:${ENVIO}:`));
      const apagou = eventos.findIndex((e) => e === `delete:privado:${String(ORIGINAL)}`);

      assert.ok(subiu >= 0, 'a versão limpa não subiu');
      assert.ok(gravou >= 0, 'a chave da versão limpa não foi gravada');
      assert.ok(apagou >= 0, 'o original NÃO foi apagado: a coordenada de GPS ficou no balde');
      assert.ok(subiu < gravou, 'gravou a chave ANTES de a versão limpa subir');
      assert.ok(
        gravou < apagou,
        'APAGOU O ORIGINAL ANTES DE GRAVAR A VERSÃO LIMPA: há uma janela em que a foto não existe',
      );
    });

    void it('falha ANTES de gravar a limpa: o original NÃO é apagado', async () => {
      const { deps, eventos } = montar({ marcarLanca: true });

      await assert.rejects(() => higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO }));
      assert.ok(
        !eventos.some((e) => e.startsWith('delete:')),
        'apagou o original com a versão limpa NÃO gravada: a foto foi perdida',
      );
    });

    void it('falha DEPOIS de gravar a limpa: a limpa fica, e o trabalho não se diz feito', async () => {
      const { deps, eventos } = montar({ deleteLanca: true });

      await assert.rejects(
        () => higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO }),
        'engoliu a falha da exclusão: a coordenada de GPS fica no balde em silêncio',
      );
      assert.ok(eventos.some((e) => e.startsWith(`pronta:${ENVIO}:`)));
    });

    void it('a readiação com `pronta` CONSERTA o original que sobrou', async () => {
      const { deps, eventos } = montar({
        foto: {
          uploadIntentId: ENVIO,
          dono: '11111111-1111-1111-1111-111111111111',
          originalKey: ORIGINAL,
          status: 'pronta',
        },
      });

      const r = await higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO });

      assert.equal(r.tipo, 'ignorada');
      assert.ok(
        eventos.includes(`delete:privado:${String(ORIGINAL)}`),
        'a readiação não apagou o original que sobrou: a coordenada de GPS fica para sempre',
      );
      assert.ok(!eventos.some((e) => e.startsWith('put:')), 'reprocessou uma foto já pronta');
    });

    for (const status of ['recusada', 'ausente'] as const) {
      void it(`\`${status}\`: o original é a ÚNICA cópia, e NÃO é apagado`, async () => {
        const { deps, eventos } = montar({
          foto: {
            uploadIntentId: ENVIO,
            dono: '11111111-1111-1111-1111-111111111111',
            originalKey: ORIGINAL,
            status,
          },
        });

        await higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO });

        assert.ok(
          !eventos.some((e) => e.startsWith('delete:')),
          `apagou o original em \`${status}\`, onde ele é a única cópia que existe`,
        );
      });
    }
  });

  void it('confere o CABEÇALHO antes de baixar os bytes', async () => {
    const { deps, eventos } = montar({});
    await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.ok(
      eventos.indexOf('head:privado') < eventos.indexOf('get:privado'),
      'ler 5 MB para descobrir que não há 5 MB é o caminho caro para a mesma resposta',
    );
  });
});

void describe('higiene da foto do achado: as recusas são finais', () => {
  void it('arquivo que não é imagem vira `recusada`, com motivo, e não volta à fila', async () => {
    const { deps, eventos } = montar({ inspecao: 'formato_nao_aceito' });
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'recusada');
    assert.ok(eventos.some((e) => e.startsWith('recusada:')));
    assert.ok(!eventos.some((e) => e.startsWith('put:')), 'nada sobe quando a recusa é final');
  });

  void it('o decodificador que desiste é recusa, não exceção', async () => {
    const { deps } = montar({ derivada: 'formato_nao_decodificavel' });
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'recusada');
  });

  void it('o objeto que nunca chegou vira `ausente`, e isso é final', async () => {
    const { deps, eventos } = montar({ contentLength: 0 });
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'ausente');
    assert.ok(eventos.some((e) => e.startsWith('ausente:')));
  });

  void it('a intenção já higienizada é IGNORADA: estado final não volta', async () => {
    const { deps, eventos } = montar({
      foto: {
        uploadIntentId: '22222222-2222-2222-2222-222222222222',
        dono: 'sem-conta',
        originalKey: ORIGINAL_SEM_CONTA,
        status: 'pronta',
      },
    });
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'ignorada');
    assert.deepEqual(
      eventos,
      [`delete:privado:${String(ORIGINAL_SEM_CONTA)}`],
      'o trabalho reentregue reescreveu estado, ou deixou de apagar o original que sobrou',
    );
  });

  void it('a intenção que não existe mais é IGNORADA, e não falha', async () => {
    const { deps } = montar({ foto: null });
    const r = await higienizarFotoDoAchado(deps, {
      upload_intent_id: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(r.tipo, 'ignorada');
  });
});

void describe('higiene da foto do achado: armazenamento fora do ar é culpa nossa', () => {
  void it('LANÇA quando o `get` falha, para a fila adiar e tentar de novo', async () => {
    const { deps, eventos } = montar({ getLanca: true });
    await assert.rejects(
      higienizarFotoDoAchado(deps, {
        upload_intent_id: '22222222-2222-2222-2222-222222222222',
      }),
    );
    assert.ok(
      !eventos.some((e) => e.startsWith('recusada:')),
      'balde fora do ar não é culpa do arquivo, e não vira recusa final',
    );
  });
});
