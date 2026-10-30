/**
 * SÓ O REENCONTRADO GANHA NOME: os outros quatro motivos do 410 público continuam
 * fundidos.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import { casoDaLinha, type LinhaDoCasoPublico } from './kysely-leitura-publica-do-caso.js';

const TOKEN = 'k3J9-share-token-opaco-0001';
/** 2026-09-20T18:30:00.000Z */
const VISTO_EM = 1_789_929_000_000 as Instant;

/**
 * Uma linha da consulta. O pet nasce **de pé** -- vivo, não excluído, não
 * arquivado --, porque o estado hostil de cada caso é escrito por extenso em quem
 * o usa, e não herdado do molde.
 */
function linha(parcial: Partial<LinhaDoCasoPublico> = {}): LinhaDoCasoPublico {
  return {
    share_token: TOKEN,
    status: 'open',
    last_seen_at: comoData(VISTO_EM),
    last_seen_city: 'São Paulo',
    last_seen_neighborhood: null,
    description: null,
    name: 'Thor',
    species_code: 'dog',
    size_code: 'M',
    breed_free_text: null,
    distinctive_marks: null,
    care_notes: null,
    pet_status: 'active',
    breed_label: null,
    color_label: null,
    card_key: null,
    pet_excluido: false,
    do_chamador: false,
    ...parcial,
  };
}

/** Os três jeitos de o ANIMAL não estar de pé, mais o jeito de estar. */
const CONDICOES_DO_PET: readonly { rotulo: string; linha: Partial<LinhaDoCasoPublico> }[] = [
  { rotulo: 'pet de pé', linha: {} },
  { rotulo: 'pet EXCLUÍDO', linha: { pet_excluido: true } },
  { rotulo: 'pet FALECIDO', linha: { pet_status: 'deceased' } },
  { rotulo: 'pet ARQUIVADO', linha: { pet_status: 'archived' } },
];

/** Os desfechos de caso que chegam ao 410. */
type DesfechoDoCaso = LinhaDoCasoPublico['status'];

const DESFECHOS_ENCERRADOS: readonly DesfechoDoCaso[] = [
  'closed_reunited',
  'closed_not_found',
  'closed_false_alarm',
];

/** O único par (desfecho, pet) que a decisão do cliente autoriza a falar. */
const O_PAR_QUE_FALA: { desfecho: DesfechoDoCaso; pet: string } = {
  desfecho: 'closed_reunited',
  pet: 'pet de pé',
};

void describe('só o reencontrado ganha nome: o cruzamento (desfecho × pet)', () => {
  void it('o reencontrado com o pet de pé é o ÚNICO par que liga `reencontrado`', () => {
    let ligados = 0;

    for (const desfecho of DESFECHOS_ENCERRADOS) {
      for (const pet of CONDICOES_DO_PET) {
        const caso = casoDaLinha(linha({ status: desfecho, ...pet.linha }));
        const deveriaFalar =
          desfecho === O_PAR_QUE_FALA.desfecho && pet.rotulo === O_PAR_QUE_FALA.pet;

        assert.equal(
          caso.reencontrado,
          deveriaFalar,
          deveriaFalar
            ? `REPROVA: ${desfecho} com ${pet.rotulo} é o caso que o cliente mandou ` +
                'agradecer, e ele não liga `reencontrado`. A página de agradecimento ' +
                'nunca aparece, que era o defeito relatado três vezes.'
            : `REPROVA: ${desfecho} com ${pet.rotulo} liga \`reencontrado\`, e a ` +
                'autorização de 28/10/2026 não cobre esse motivo. Esta linha diria ' +
                '"já foi encontrado, não se preocupe" para um caso em que isso é ' +
                'falso, cruel ou assunto privado do tutor.',
        );

        if (caso.reencontrado) ligados += 1;

        assert.equal(caso.aberto, false, `REPROVA: ${desfecho} respondeu como caso ABERTO.`);
      }
    }

    assert.equal(
      ligados,
      1,
      'REPROVA: o cruzamento ligou `reencontrado` ' +
        `${String(ligados)} vezes, e tem de ligar exatamente uma. Zero significa que ` +
        'nenhuma linha fala e as asserções negativas não provam nada.',
    );
  });

  void it('o pet que voltou para casa e DEPOIS morreu não é agradecido', () => {
    const caso = casoDaLinha(linha({ status: 'closed_reunited', pet_status: 'deceased' }));
    assert.equal(
      caso.reencontrado,
      false,
      'REPROVA: o cartaz de um pet que voltou e depois morreu agradece a ' +
        'preocupação e diz que ele está em casa. É mentira, e é cruel.',
    );
  });

  void it('`closed_not_found` não vira reencontro: o animal não voltou', () => {
    const caso = casoDaLinha(linha({ status: 'closed_not_found' }));
    assert.equal(
      caso.reencontrado,
      false,
      'REPROVA: o caso que terminou SEM o animal diria que ele foi encontrado.',
    );
  });

  void it('o caso ABERTO com o pet de pé não é nenhum dos dois 410', () => {
    const caso = casoDaLinha(linha());
    assert.equal(caso.aberto, true);
    assert.equal(
      caso.reencontrado,
      false,
      'REPROVA: um caso ABERTO se diz reencontrado. A pessoa que podia ajudar a ' +
        'procurar seria mandada embora com um agradecimento.',
    );
  });

  void it('nenhum dos dois campos deduz o outro: `closed_reunited` fecha o caso', () => {
    const reencontrado = casoDaLinha(linha({ status: 'closed_reunited' }));
    assert.deepEqual(
      [reencontrado.aberto, reencontrado.reencontrado],
      [false, true],
      'REPROVA: o reencontrado não é um caso aberto nem o inverso de um.',
    );

    const excluido = casoDaLinha(linha({ status: 'closed_reunited', pet_excluido: true }));
    assert.deepEqual(
      [excluido.aberto, excluido.reencontrado],
      [false, false],
      'REPROVA: `reencontrado` foi deduzido de `!aberto`, e o pet excluído ' +
        'passou a ser agradecido -- um assunto privado do tutor na mão de um estranho.',
    );
  });
});
