/** O predicado de elegibilidade, e a distinção que ele NÃO pode perder. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';
import {
  contaEAlcancavelPorPush,
  podeReceberPush,
  type Aparelho,
  type PermissaoDePush,
} from './aparelho.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;
const TOKEN = 'fcm-token-de-teste' as TokenDeAparelho;

function aparelho(
  permissao: PermissaoDePush,
  pushToken: TokenDeAparelho | null,
  id = 'aparelho-1',
): Aparelho {
  return {
    id,
    dono: DONO,
    plataforma: 'android',
    pushToken,
    permissao,
    versaoDoApp: '1.0.0',
    versaoDoSistema: '14',
    registradoEm: AGORA,
    vistoEm: AGORA,
  };
}

/** As seis combinações possíveis, e a resposta certa de cada uma. */
const TABELA: readonly {
  permissao: PermissaoDePush;
  token: TokenDeAparelho | null;
  alcancavel: boolean;
}[] = [
  { permissao: 'granted', token: TOKEN, alcancavel: true },
  { permissao: 'granted', token: null, alcancavel: false },
  { permissao: 'denied', token: TOKEN, alcancavel: false },
  { permissao: 'denied', token: null, alcancavel: false },
  { permissao: 'not_asked', token: TOKEN, alcancavel: false },
  { permissao: 'not_asked', token: null, alcancavel: false },
];

void describe('podeReceberPush: os critérios 1 e 4 do ADR-0006, e só eles', () => {
  for (const caso of TABELA) {
    const rotulo = `${caso.permissao} ${caso.token === null ? 'sem token' : 'com token'}`;
    void it(`${rotulo} ⇒ ${String(caso.alcancavel)}`, () => {
      assert.equal(podeReceberPush(aparelho(caso.permissao, caso.token)), caso.alcancavel);
    });
  }

  void it('exatamente UMA das seis combinações é alcançável', () => {
    const alcancaveis = TABELA.filter((caso) =>
      podeReceberPush(aparelho(caso.permissao, caso.token)),
    );
    assert.equal(alcancaveis.length, 1, 'o predicado deixou de distinguir os seis estados');
    assert.equal(alcancaveis[0]?.permissao, 'granted');
  });
});

void describe('not_asked é um estado distinto de denied (critério 2)', () => {
  void it('os dois recusam push, e os dois continuam REGISTRADOS', () => {
    const negado = aparelho('denied', TOKEN);
    const naoPerguntado = aparelho('not_asked', TOKEN);
    assert.equal(podeReceberPush(negado), false);
    assert.equal(podeReceberPush(naoPerguntado), false);
    assert.notEqual(negado.permissao, naoPerguntado.permissao);
  });
});

void describe('a conta é alcançável quando ALGUM aparelho dela é', () => {
  void it('um aparelho negado e um concedido: a conta é alcançável', () => {
    assert.equal(
      contaEAlcancavelPorPush([
        aparelho('denied', TOKEN, 'a'),
        aparelho('granted', TOKEN, 'b'),
      ]),
      true,
    );
  });

  void it('três aparelhos, nenhum concedido: a conta NÃO entra na conta (critério 6)', () => {
    assert.equal(
      contaEAlcancavelPorPush([
        aparelho('denied', TOKEN, 'a'),
        aparelho('not_asked', TOKEN, 'b'),
        aparelho('granted', null, 'c'),
      ]),
      false,
    );
  });

  void it('conta sem aparelho nenhum não é alcançável', () => {
    assert.equal(contaEAlcancavelPorPush([]), false);
  });
});
