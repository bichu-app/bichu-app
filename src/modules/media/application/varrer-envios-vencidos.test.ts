/**
 * A varredura dos envios vencidos.
 *
 * O caso central é de **ordem**, e não de resultado: o objeto sai antes da
 * linha. A ordem inversa também "funciona" — a linha some, a varredura termina
 * feliz — e deixa no bucket um objeto que ninguém consegue nomear, porque a
 * chave dele só vivia naquela linha. É um defeito que nenhum teste de resultado
 * pega, e que só aparece na fatura.
 *
 * ## A ISCA DA FOTO DO ACHADO (os quatro últimos casos)
 *
 * Os casos de `A FOTO DO ACHADO NÃO É APAGADA` existem para reprovar se a
 * varredura voltar a apagar foto de achado. Eles não são hipótese: a varredura
 * apagava, e foi medido com hora — subida 01:18:44, apagada 01:29:10; subida
 * 01:33:35, apagada 01:44:10. Dez minutos, e **sempre**, porque a foto do
 * achado não tem operação de confirmação no contrato (de propósito) e portanto
 * `confirmed_at` nunca deixava de ser nulo nela.
 *
 * Eles medem a guarda do CASO DE USO, que é a segunda barreira. A primeira é a
 * cláusula `WHERE kind NOT IN (...)` da consulta, e **esta suíte não a alcança**
 * — um dublê em memória devolve o que eu mandar devolver, e é por isso que
 * estes casos entregam a foto do achado ao caso de uso **de propósito**,
 * simulando a consulta regredida. A barreira do SQL é medida contra Postgres de
 * verdade em `tests/integration/varredura-nao-apaga-foto-de-achado.test.ts`, e
 * desarmada pela isca `varredura-apaga-foto-de-achado` de
 * `infra/integracao/iscas/rodar-iscas.mjs`.
 *
 * As duas barreiras são medidas separadamente porque o defeito nasceu de uma
 * barreira só, defendida por um comentário que afirmava não haver risco.
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
    // A chave só vive na linha: apagá-la primeiro perderia o único ponteiro
    // para o objeto, e ele viraria lixo que ninguém consegue nomear.
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
    // A segunda foi processada mesmo com a primeira falhando.
    assert.ok(passos.includes('objeto:i-2'), 'a rodada parou na primeira falha');
    // E a que falhou continua na fila: a linha não foi tocada.
    assert.deepEqual(restantes.map((v) => v.id), ['i-1']);
  });

  void describe('A FOTO DO ACHADO NÃO É APAGADA (decisão do cliente, 17/10/2026)', () => {
    // As duas espécies do achado, entregues ao caso de uso DE PROPÓSITO: é
    // assim que a consulta se comportava quando o defeito existia, e é o
    // cenário que a guarda tem de recusar.
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
      // NENHUMA chamada ao armazenamento. Este é o caso que reprova se a
      // varredura voltar a apagar a foto de quem achou um pet.
      assert.deepEqual(passos, [], 'a varredura APAGOU foto de achado');
    });

    void it('NÃO apaga a linha da intenção do achado', async () => {
      const { deps, restantes } = montar({ lista: [...DO_ACHADO] });
      await varrerEnviosVencidos(deps);
      // A linha é o ÚNICO ponteiro para o objeto, e `found_reports.photo_upload_id`
      // é `ON DELETE SET NULL`: apagá-la fazia o aviso perder a foto em
      // silêncio, sem erro em lugar nenhum.
      assert.deepEqual(
        restantes.map((v) => v.id),
        ['a-1', 'a-2'],
        'a intenção do achado foi descartada',
      );
    });

    void it('conta as protegidas, e NÃO as conta como removidas nem como falhas', async () => {
      const { deps } = montar({ lista: [...DO_ACHADO] });
      // `protegidas` é ALARME e não estatística: em produção a consulta já
      // exclui as duas espécies, então qualquer número diferente de zero aqui
      // significa que a cláusula `WHERE kind NOT IN (...)` regrediu.
      assert.deepEqual(await varrerEnviosVencidos(deps), {
        examinadas: 2,
        removidas: 0,
        falhas: 0,
        protegidas: 2,
      });
    });

    void it('a foto de pet na MESMA rodada continua sendo limpa', async () => {
      // O contrapeso, e ele importa tanto quanto a guarda: uma correção que
      // parasse de limpar o envio abandonado de foto de pet trocaria um defeito
      // por outro, e o balde cresceria com lixo que ninguém prometeu guardar.
      const misturada: IntencaoVencida[] = [
        DO_ACHADO[0] as IntencaoVencida,
        { id: 'p-1', objectKey: comoObjectKey('pets/p/original/eee'), kind: 'pet_photo' },
        // `products/original/{nome}`, TRÊS segmentos: a imagem de catálogo não
        // tem segmento de dono. Estava escrito `products/x/original/fff`, uma
        // forma que este sistema nunca escreve e que `comoObjectKey` recusa com
        // razão — o caso morria na montagem da massa, antes de medir qualquer
        // coisa. Autoridades: ADR-0007 Emenda 1 item 2 (prefixo por categoria
        // como PRIMEIRO segmento, derivada `{categoria}/{thumb|card}/{128
        // bits}.{ext}`, "sem identificador de dono") e
        // `src/modules/media/domain/chave-de-objeto.ts`, cujo único ramo de
        // original de catálogo é `segmentos.length === 3 && categoria &&
        // segmentos[1] === 'original'`. O único produtor dessa chave é
        // `chaveDoOriginalDeCatalogo`, chamado em
        // `src/modules/media/application/preparar-envio-de-catalogo.ts:45`.
        { id: 'c-1', objectKey: comoObjectKey('products/original/fff'), kind: 'catalog_image' },
      ];
      const { deps, passos, restantes } = montar({ lista: misturada });

      assert.deepEqual(await varrerEnviosVencidos(deps), {
        examinadas: 3,
        removidas: 2,
        falhas: 0,
        protegidas: 1,
      });
      // A ordem objeto-antes-da-linha vale para as que são apagadas de verdade.
      assert.deepEqual(passos, ['objeto:p-1', 'linha:p-1', 'objeto:c-1', 'linha:c-1']);
      // E só a do achado sobrou.
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
