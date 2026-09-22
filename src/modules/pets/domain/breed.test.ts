/**
 * A regra dos dois campos de raça.
 *
 * O caso central é negativo e é o motivo de o arquivo existir: **texto livre
 * com raça da lista precisa ser recusado**. Um teste que só confirmasse "aceita
 * outro_dog com texto" passaria com a regra invertida instalada.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conferirRaca, ehCodigoOutro, rotuloDaRaca } from './breed.js';

void describe('conferência da raça', () => {
  void it('aceita raça da lista sem texto livre', () => {
    assert.equal(conferirRaca({ breedCode: 'shih_tzu', breedFreeText: null }), null);
  });

  void it('aceita outro_* com texto livre', () => {
    assert.equal(conferirRaca({ breedCode: 'outro_dog', breedFreeText: 'Akita' }), null);
  });

  void it('aceita ausência total: raça é opcional', () => {
    assert.equal(conferirRaca({ breedCode: null, breedFreeText: null }), null);
  });

  void it('RECUSA texto livre junto de raça da lista', () => {
    // "Shih Tzu" no código e "poodle" no texto são duas respostas para uma
    // pergunta, e ninguém consegue resolver a divergência depois.
    assert.equal(
      conferirRaca({ breedCode: 'shih_tzu', breedFreeText: 'poodle' }),
      'texto_livre_com_codigo_da_lista',
    );
  });

  void it('RECUSA texto livre sem código nenhum', () => {
    assert.equal(
      conferirRaca({ breedCode: null, breedFreeText: 'Akita' }),
      'texto_livre_sem_codigo',
    );
  });

  void it('RECUSA outro_* sem texto: diz que não está na lista e não diz qual é', () => {
    assert.equal(
      conferirRaca({ breedCode: 'outro_cat', breedFreeText: null }),
      'codigo_outro_sem_texto',
    );
    assert.equal(
      conferirRaca({ breedCode: 'outro_cat', breedFreeText: '   ' }),
      'codigo_outro_sem_texto',
    );
  });

  void it('os três códigos "outro" são reconhecidos, e só eles', () => {
    for (const c of ['outro_dog', 'outro_cat', 'outro_other']) assert.ok(ehCodigoOutro(c));
    for (const c of ['outro', 'outros', 'srd', null, undefined]) assert.ok(!ehCodigoOutro(c));
  });
});

void describe('rótulo da raça', () => {
  void it('raça da lista usa o rótulo da lista, e ignora texto que não deveria existir', () => {
    assert.equal(rotuloDaRaca({ breedCode: 'shih_tzu', breedFreeText: null }, 'Shih Tzu'), 'Shih Tzu');
  });

  void it('outro_* usa o texto da pessoa, e não o rótulo genérico da lista', () => {
    // Se devolvesse o rótulo da lista aqui, toda ficha de raça fora da lista
    // diria "Outra", que é a informação que o campo existe para evitar.
    assert.equal(rotuloDaRaca({ breedCode: 'outro_dog', breedFreeText: 'Akita' }, 'Outra'), 'Akita');
  });

  void it('sem raça nenhuma, o rótulo é nulo e não é string vazia', () => {
    assert.equal(rotuloDaRaca({ breedCode: null, breedFreeText: null }, null), null);
    assert.equal(rotuloDaRaca({ breedCode: null, breedFreeText: null }, undefined), null);
  });
});
