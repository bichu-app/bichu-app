/**
 * A mensagem de abertura (critério 2), e o que ela **não** deixa passar.
 *
 * O caso que mais importa aqui é o do recado: `found_reports.notes` guarda o
 * que o achador digitou, sem redação nenhuma, porque a coluna nasceu antes
 * desta história. Quando aquele texto atravessa para o tutor, ele vira mensagem
 * do canal mediado — e o primeiro recado é o mais provável de todos a conter um
 * telefone, porque quem o escreve está com o animal na mão e quer resolver.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import { primeiraMensagemDoSistema } from './primeira-mensagem.js';

/** 22/09/2026, 15h30 em São Paulo (18:30Z). */
const emIso = (texto: string): Date => comoData(Date.parse(texto) as Instant);

const ESCANEADO = emIso('2026-09-22T18:30:00.000Z');
const MESMO_DIA = emIso('2026-09-22T22:00:00.000Z');
const DIA_SEGUINTE = emIso('2026-09-23T14:00:00.000Z');

const BASE = {
  nomeDoPet: 'Aurora',
  escaneadoEm: ESCANEADO,
  agora: MESMO_DIA,
  rotuloDaArea: null,
  recado: null,
};

void describe('o texto do critério 2', () => {
  void it('diz quem escaneou, o pet e a hora', () => {
    const { texto } = primeiraMensagemDoSistema(BASE);
    assert.equal(texto, 'Alguém escaneou a tag da Aurora hoje às 15:30.');
  });

  void it('no dia seguinte deixa de dizer "hoje" e diz a data', () => {
    // Um aviso lido no dia seguinte dizendo "hoje" manda o tutor procurar o
    // animal na hora errada. Parece detalhe de texto e custa uma tarde.
    const { texto } = primeiraMensagemDoSistema({ ...BASE, agora: DIA_SEGUINTE });
    assert.equal(texto, 'Alguém escaneou a tag da Aurora em 22/09 às 15:30.');
  });

  void it('acrescenta a região quando ela existe', () => {
    const { texto } = primeiraMensagemDoSistema({ ...BASE, rotuloDaArea: 'Pinheiros, São Paulo' });
    assert.match(texto, /Região: Pinheiros, São Paulo\./);
  });

  void it('sem região, não inventa linha vazia', () => {
    for (const area of [null, '', '   ']) {
      const { texto } = primeiraMensagemDoSistema({ ...BASE, rotuloDaArea: area });
      assert.ok(!texto.includes('Região'), `linha de região apareceu com ${JSON.stringify(area)}`);
    }
  });
});

void describe('o recado do achador atravessa REDIGIDO', () => {
  void it('telefone no recado não chega ao tutor', () => {
    const { texto, retirados } = primeiraMensagemDoSistema({
      ...BASE,
      recado: 'achei ela na praça, me liga 11 98765-4321',
    });
    assert.deepEqual(
      retirados.map((r) => r.kind),
      ['phone'],
    );
    assert.doesNotMatch(texto, /9876/, `o telefone sobreviveu: ${texto}`);
    assert.match(texto, /achei ela na praça/, 'a redação engoliu o recado inteiro');
  });

  void it('e-mail e endereço no recado também não chegam', () => {
    const { texto } = primeiraMensagemDoSistema({
      ...BASE,
      recado: 'manda email pra ana@exemplo.com, estou na Rua das Acacias, 120',
    });
    assert.doesNotMatch(texto, /ana@exemplo\.com/);
    assert.doesNotMatch(texto, /Acacias, 120/);
  });

  void it('ISCA NEGATIVA — recado sem dado de contato sobrevive inteiro', () => {
    // Metade da prova é esta. Uma redação que engole "ele está mancando da pata
    // de trás" cumpre a promessa de privacidade destruindo a informação pela
    // qual a mensagem existe.
    const recado = 'ele está mancando da pata de trás e bebeu água às 14h';
    const { texto, retirados } = primeiraMensagemDoSistema({ ...BASE, recado });
    assert.deepEqual(retirados, []);
    assert.match(texto, /Recado de quem achou: ele está mancando da pata de trás e bebeu água às 14h/);
  });

  void it('recado vazio não vira linha', () => {
    for (const recado of [null, '', '   ']) {
      const { texto } = primeiraMensagemDoSistema({ ...BASE, recado });
      assert.ok(!texto.includes('Recado'), `linha de recado apareceu com ${JSON.stringify(recado)}`);
    }
  });
});

void describe('ISCA — a mensagem inteira nunca carrega contato nem coordenada', () => {
  void it('nada que pareça telefone, e-mail ou coordenada sai daqui', () => {
    const { texto } = primeiraMensagemDoSistema({
      ...BASE,
      rotuloDaArea: 'Pinheiros, São Paulo',
      recado: 'zap 11987654321, email ana@exemplo.com, Rua X, 10, CEP 01310-100',
    });
    assert.doesNotMatch(texto, /@/, `sobrou arroba: ${texto}`);
    assert.doesNotMatch(texto, /\d{8,}/, `sobrou sequência longa de dígitos: ${texto}`);
    assert.doesNotMatch(texto, /-?\d{1,2}\.\d{4,}/, `sobrou algo com cara de coordenada: ${texto}`);
  });
});
