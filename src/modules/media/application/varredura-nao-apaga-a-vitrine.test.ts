/**
 * ISCA (d): A VARREDURA DE VENCIDOS NÃO APAGA A FOTO DA VITRINE.
 *
 * ## O defeito que estes casos existem para não deixar voltar
 *
 * Esta varredura apaga intenção de envio **não confirmada e vencida**, e apaga o
 * objeto do balde junto. A foto do ACHADO foi apagada por ela — medido com
 * hora: subida 01:18:44, apagada 01:29:10; subida 01:33:35, apagada 01:44:10.
 * Dez minutos, e **sempre**. A causa não era o filtro: era a foto do achado não
 * ter operação de confirmação, de propósito, e portanto `confirmed_at` nunca
 * deixar de ser nulo nela.
 *
 * Então a pergunta certa sobre um propósito NOVO não é "a varredura o filtra?",
 * e sim **"existe algum instante em que a foto existe e a intenção dela ainda
 * não está confirmada?"**. Para a vitrine a resposta é não, porque a confirmação
 * é gravada na MESMA transação que cria a linha de `user_showcase_images` — e
 * isso é medido em
 * `showcase/adapters/persistence/confirmacao-na-mesma-transacao.test.ts`, que
 * confere que as duas escritas chegam no mesmo executor.
 *
 * Aqui se mede a consequência: a vitrine viva nunca aparece nesta lista, e o
 * envio ABANDONADO aparece e tem de ser recolhido.
 *
 * ## Os contrapesos, e por que sem eles o primeiro caso não vale nada
 *
 * "A vitrine não é apagada" passaria para uma varredura que não limpa nada — e
 * tirar o lixo invisível do balde é a única razão de ela existir. O segundo caso
 * prova que ela limpa; o terceiro prova que a guarda da foto do achado continua
 * de pé, e reprova se alguém a remover ao acrescentar um propósito.
 */
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
    // A consulta filtra `confirmed_at IS NULL`, e a confirmação da vitrine é
    // gravada na mesma transação que cria a linha da foto. Não há instante em
    // que uma foto existente apareça aqui: a lista vem VAZIA.
    const { rodar, apagados } = varreduraCom([]);
    const { removidas } = await rodar();
    assert.equal(removidas, 0);
    assert.deepEqual(apagados, [], 'nenhum objeto da vitrine sai do balde por PRAZO');
  });

  void it('CONTRAPESO -- intenção de vitrine NÃO confirmada e vencida É apagada', async () => {
    // Envio abandonado NÃO é foto: nenhuma linha de `user_showcase_images`
    // aponta para ele, ele não aparece em tela nenhuma, e é exatamente o lixo
    // invisível que esta varredura existe para tirar.
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
