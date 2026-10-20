/**
 * A higiene da foto do achado — e o que estes casos protegem é um vazamento de
 * coordenada de GPS.
 *
 * O caminho da foto de achado não passava por worker nenhum: o tipo era aceito
 * pela declaração do cliente e o EXIF ficava no arquivo. As asserções daqui são
 * as quatro que importam:
 *
 * 1. os BYTES decidem o formato, e o `declared_type` não é consultado;
 * 2. a derivada vai para o bucket **privado**, nunca para o público;
 * 3. **o original É apagado, e NUNCA antes de a versão limpa estar gravada**
 *    (decisão do cliente, 17/10/2026: *"pode apagar o original e guardar só o
 *    arquivo 2"*) — é a invariante da JANELA DE PERDA, no `describe` próprio
 *    mais abaixo;
 * 4. recusa é FINAL e com motivo; falha de armazenamento LANÇA, para a fila
 *    adiar.
 *
 * **Escritos e não executados** nesta entrega: o cliente pediu para não rodar
 * suíte unitária nem de integração.
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
    // A ORDEM dos eventos é o que estes casos medem, e é por isso que `delete`
    // entra na mesma lista que `put` e `pronta:` em vez de num contador
    // próprio: a invariante não é "apagou", é "apagou DEPOIS".
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
    // O prefixo compartilhado é o que faz política de bucket, ciclo de vida e
    // o expurgo dos 30 dias do ADR-0010 alcançarem o original e a derivada
    // juntos. Dois prefixos para a mesma foto é um sobrevivente do expurgo.
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
    // SEC-001: o id do aviso não sai para o achador sem conta, e a chave da
    // derivada precisa combinar com a do original, que já usa o rótulo.
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
    // ======================================================================
    // A isca que importa mais que todas as outras deste arquivo.
    // ======================================================================
    //
    // O cliente decidiu (17/10/2026) que o original é apagado e a versão limpa
    // fica no lugar: *"pode apagar o original e guardar só o arquivo 2"*. A
    // troca é segura por UMA razão e só por ela — **a ordem**. A versão limpa
    // sobe, é GRAVADA em `sanitized_key`, e só então o original sai.
    //
    // Invertida, a mesma operação perde a foto de quem achou um pet: apagado o
    // original antes de a limpa estar gravada, um processo que morra no meio
    // deixa a intenção em `'pendente'` com o original já fora do balde — e a
    // readiação faz `head` nele, acha `null`, marca `'ausente'` (estado FINAL)
    // e o aviso fica sem foto nenhuma, para sempre, sem erro em lugar nenhum.
    //
    // Nenhum teste de RESULTADO pega isso: as duas ordens terminam com a
    // versão limpa no balde e a linha `'pronta'`. Só a ordem denuncia.
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
      // O banco cai na hora de gravar `sanitized_key`. Neste instante a única
      // cópia alcançável é o original, e ele tem de ficar.
      const { deps, eventos } = montar({ marcarLanca: true });

      await assert.rejects(() => higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO }));
      assert.ok(
        !eventos.some((e) => e.startsWith('delete:')),
        'apagou o original com a versão limpa NÃO gravada: a foto foi perdida',
      );
    });

    void it('falha DEPOIS de gravar a limpa: a limpa fica, e o trabalho não se diz feito', async () => {
      // O armazenamento recusa a exclusão. A foto está SEGURA (as duas cópias
      // existem), mas o metadado com a coordenada não saiu — então o caso de
      // uso LANÇA em vez de devolver `higienizada`. Engolir a falha deixaria o
      // arquivo com a coordenada no balde para sempre e sem nada acusando.
      const { deps, eventos } = montar({ deleteLanca: true });

      await assert.rejects(
        () => higienizarFotoDoAchado(deps, { upload_intent_id: ENVIO }),
        'engoliu a falha da exclusão: a coordenada de GPS fica no balde em silêncio',
      );
      // E a limpa continua gravada: a readiação encontra `'pronta'`.
      assert.ok(eventos.some((e) => e.startsWith(`pronta:${ENVIO}:`)));
    });

    void it('a readiação com `pronta` CONSERTA o original que sobrou', async () => {
      // É isto que torna o `throw` do caso anterior produtivo em vez de só
      // ruidoso. `'pronta'` garante (pelo CHECK `upload_intents_higiene_coerente`)
      // que a versão limpa está gravada, então apagar o original é seguro — e
      // idempotente, porque o `delete` da porta trata 404 como sucesso.
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
      // E não reprocessa: nada de `put` nem de `pronta:` numa linha já pronta.
      assert.ok(!eventos.some((e) => e.startsWith('put:')), 'reprocessou uma foto já pronta');
    });

    for (const status of ['recusada', 'ausente'] as const) {
      void it(`\`${status}\`: o original é a ÚNICA cópia, e NÃO é apagado`, async () => {
        // A assimetria é a invariante inteira: nestes dois estados NÃO existe
        // versão limpa (o CHECK exige `sanitized_key IS NULL` nos dois), então
        // o original é a única cópia da foto. Apagá-lo aqui seria perder a foto
        // — exatamente o defeito que esta correção existe para impedir.
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
    // É o caso do HEIC sem decodificador HEVC. Como exceção, a fila tentaria
    // cinco vezes a mesma foto que nunca vai abrir.
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
    // O trabalho reentregue não reescreve ESTADO. A exclusão idempotente do
    // original que sobrou NÃO é reescrita de estado: ela é o conserto.
    //
    // A asserção antiga (`deepEqual(eventos, [])`) afirmava o contrário e
    // contradizia, NESTE MESMO ARQUIVO, o caso "a readiação com `pronta`
    // CONSERTA o original que sobrou" (no `describe` da janela de perda), que
    // exige `delete:privado:{original}` exatamente neste cenário — `status:
    // 'pronta'` na reentrada — e passa. As duas não podem valer juntas, e a de
    // `[]` é a errada: com ela, o `throw` de `descartarOriginalComGps` seria só
    // ruído, e o arquivo com a coordenada de GPS ficaria no balde para sempre,
    // que é o vazamento que este módulo existe para fechar.
    //
    // Apagar aqui é seguro porque `'pronta'` PROVA que a versão limpa está
    // gravada: CHECK `upload_intents_higiene_coerente` da migração
    // `20261001000006_higiene-da-foto-do-achado-e-derivadas-por-layout.sql`
    // (linha 77 — `sanitize_status = 'pronta' AND sanitized_key IS NOT NULL`).
    //
    // A lista continua EXATA, e não afrouxada: a exclusão do original é o único
    // evento permitido. Nenhum `put:`, `pronta:`, `recusada:`, `ausente:`,
    // `head:` nem `get:` — uma linha já pronta não é reprocessada.
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
