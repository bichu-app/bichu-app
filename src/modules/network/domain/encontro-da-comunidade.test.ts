/**
 * As regras da proposta de encontro pela comunidade (ADR-0025 emenda 3), sem
 * banco e sem servidor.
 *
 * Cada caso aqui e ISCA no sentido do projeto: desligar o mecanismo que ele
 * guarda faz o caso reprovar. Em particular, `errosDoNomeDoLugar` fecha um furo
 * MEDIDO -- `street_address` sai so em resposta autenticada, e dois encontros
 * do painel tem o endereco escrito dentro de `place_name`, que sai na agenda
 * publica. Se a conferencia virar so tamanho, a primeira lista abaixo passa a
 * aceitar endereco e o teste reprova.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  atingiuTetoDeRevisao,
  bloqueiosParaCriarEncontro,
  errosDoNomeDoLugar,
  TETO_DE_ENCONTROS_EM_REVISAO,
} from './encontro-da-comunidade.js';

const codigos = (nome: string): string[] =>
  errosDoNomeDoLugar('place.place_name', nome).map((e) => e.code);

void describe('place_name nao aceita endereco embutido', () => {
  void it('ISCA: cada forma de endereco dentro do nome do lugar e recusada', () => {
    for (const nome of [
      // A forma exata dos dois encontros medidos em producao.
      'Praca do Bairro - Avenida Brasil, 200',
      'Parque Municipal, 1500',
      'Quadra da escola nº 42',
      'Area de lazer no 7',
      'Clube do bairro num. 15',
      'Praca #90',
      'Av. Brasil 1578',
      'Rua das Flores 12',
      'Rodovia Raposo Tavares km 23',
      'Parque, CEP 01310-100',
      'Parque 01310100',
      'Condominio Jardim',
      'Salao do bloco 2',
      'Garagem do apto 51',
    ]) {
      assert.deepEqual(codigos(nome), ['address_in_place_name'], nome);
    }
  });

  void it('ISCA: nome de lugar legitimo PASSA, inclusive com numero e com logradouro', () => {
    for (const nome of [
      'Parque Ibirapuera',
      // Logradouro sozinho e como o lugar se chama: recusa-lo obrigaria a
      // pessoa a mentir o nome.
      'Avenida Paulista',
      'Rua 25 de Marco',
      'Praca 14 de Janeiro',
      'Quadra 302 Norte',
      'Parque Villa-Lobos',
      'Praia do Forte',
    ]) {
      assert.deepEqual(codigos(nome), [], nome);
    }
  });

  void it('tamanho e controle bidirecional continuam valendo, e vem antes', () => {
    assert.deepEqual(codigos('P'), ['length']);
    assert.deepEqual(codigos('x'.repeat(81)), ['length']);
    assert.deepEqual(codigos('Parque ‮euqraP'), ['bidi_control']);
  });
});

void describe('quem pode criar, e quantos', () => {
  void it('ISCA: sem canal verificado o bloqueio existe; com canal, nao', () => {
    assert.deepEqual(
      bloqueiosParaCriarEncontro({ temCanalVerificado: false, encontrosEmRevisao: 0 }),
      ['contact_channel_unverified'],
    );
    assert.deepEqual(
      bloqueiosParaCriarEncontro({ temCanalVerificado: true, encontrosEmRevisao: 0 }),
      [],
    );
  });

  void it('ISCA: o teto e 3, e ele e o mesmo numero de caso aberto por conta', () => {
    assert.equal(TETO_DE_ENCONTROS_EM_REVISAO, 3);
    const estado = (n: number) => ({ temCanalVerificado: true, encontrosEmRevisao: n });
    assert.equal(atingiuTetoDeRevisao(estado(2)), false);
    assert.equal(atingiuTetoDeRevisao(estado(3)), true);
    assert.equal(atingiuTetoDeRevisao(estado(4)), true);
  });
});
