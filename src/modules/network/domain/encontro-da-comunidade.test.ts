import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  atingiuTetoDeEncontros,
  bloqueiosParaCriarEncontro,
  errosDoNomeDoLugar,
  TETO_DE_ENCONTROS_ATIVOS,
} from './encontro-da-comunidade.js';

const codigos = (nome: string): string[] =>
  errosDoNomeDoLugar('place.place_name', nome).map((e) => e.code);

void describe('place_name nao aceita endereco embutido', () => {
  void it('ISCA: cada forma de endereco dentro do nome do lugar e recusada', () => {
    for (const nome of [
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

  void it('ISCA: o endurecimento de 17/10 -- s/n, quilometro e numero de quatro digitos', () => {
    for (const nome of [
      'Praca da Matriz, s/n',
      'Praca da Matriz s/nº',
      'Campo sem numero',
      'Rodovia dos Imigrantes km 12',
      'Parque 1578',
    ]) {
      assert.deepEqual(codigos(nome), ['address_in_place_name'], nome);
    }
  });

  void it('ISCA: D59 vale no nome do lugar -- telefone, link, perfil e PIX', () => {
    for (const nome of [
      'Praca do Bairro (11) 98765-4321',
      'Parque bit.ly/encontro',
      'Praca @meuperfil',
      'Quiosque do pix',
    ]) {
      assert.deepEqual(codigos(nome), ['contact_or_payment_detected'], nome);
    }
  });

  void it('ISCA: nome de lugar legitimo PASSA, inclusive com numero e com logradouro', () => {
    for (const nome of [
      'Parque Ibirapuera',
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
      bloqueiosParaCriarEncontro({ temCanalVerificado: false, encontrosAtivos: 0 }),
      ['contact_channel_unverified'],
    );
    assert.deepEqual(
      bloqueiosParaCriarEncontro({ temCanalVerificado: true, encontrosAtivos: 0 }),
      [],
    );
  });

  void it('ISCA: o teto e 3, e ele e o mesmo numero de caso aberto por conta', () => {
    assert.equal(TETO_DE_ENCONTROS_ATIVOS, 3);
    const estado = (n: number) => ({ temCanalVerificado: true, encontrosAtivos: n });
    assert.equal(atingiuTetoDeEncontros(estado(2)), false);
    assert.equal(atingiuTetoDeEncontros(estado(3)), true);
    assert.equal(atingiuTetoDeEncontros(estado(4)), true);
  });
});
