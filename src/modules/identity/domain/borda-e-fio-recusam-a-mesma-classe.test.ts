import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { emailTemFormaValida } from './email.js';
import { conferirDestinatario } from '../adapters/external/smtp-mailer.js';

function oFioRecusa(endereco: string): boolean {
  try {
    conferirDestinatario(endereco);
    return false;
  } catch {
    return true;
  }
}

function aBordaRecusa(endereco: string): boolean {
  return !emailTemFormaValida(endereco);
}

const MOLDES = [
  { nome: 'parte local', montar: (ch: string): string => `a${ch}@b.test` },
  { nome: 'domínio', montar: (ch: string): string => `a@b${ch}.test` },
] as const;

const ARROBA = 0x40;

void describe('BICHUS-198 — a borda e o fio recusam a mesma classe', () => {
  for (const molde of MOLDES) {
    void it(`todo ponto de código decide igual dos dois lados (injetado na ${molde.nome})`, () => {
      const divergentes: string[] = [];

      for (let cp = 0; cp <= 0x10ffff; cp++) {
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        if (cp === ARROBA) continue;

        const endereco = molde.montar(String.fromCodePoint(cp));
        if (aBordaRecusa(endereco) !== oFioRecusa(endereco)) {
          divergentes.push(
            `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ` +
              `(borda ${aBordaRecusa(endereco) ? 'recusa' : 'aceita'}, ` +
              `fio ${oFioRecusa(endereco) ? 'recusa' : 'aceita'})`,
          );
        }
      }

      assert.deepEqual(
        divergentes.slice(0, 20),
        [],
        `a borda e o fio discordam em ${String(divergentes.length)} ponto(s) de código. ` +
          'Se a borda ficou mais frouxa, a conta volta a nascer antes de o envio falhar (BICHUS-198). ' +
          'Se ficou mais rígida, o cadastro recusa endereço que o envio entregaria.',
      );
    });
  }

  void it('o `@` a mais é a única divergência, e ela é da borda, por estrutura', () => {
    for (const molde of MOLDES) {
      const endereco = molde.montar('@');
      assert.equal(aBordaRecusa(endereco), true, `a borda precisa recusar ${endereco}`);
      assert.equal(oFioRecusa(endereco), false, `o fio não tem opinião sobre ${endereco}`);
    }
  });

  void it('a varredura enxerga alguma coisa — uma varredura vazia aprovaria qualquer implementação', () => {
    for (const molde of MOLDES) {
      assert.equal(oFioRecusa(molde.montar(';')), true, `${molde.nome}: o fio precisa recusar o ';'`);
      assert.equal(aBordaRecusa(molde.montar(';')), true, `${molde.nome}: a borda precisa recusar o ';'`);
      assert.equal(oFioRecusa(molde.montar('x')), false, `${molde.nome}: o fio aceita letra`);
      assert.equal(aBordaRecusa(molde.montar('x')), false, `${molde.nome}: a borda aceita letra`);
    }
  });

  void it('a recusa da borda não depende de ordem: o endereço do relato da issue não passa', () => {
    assert.equal(emailTemFormaValida('a@b.test;x'), false);
  });

  void it('endereço legítimo continua passando na borda', () => {
    for (const endereco of [
      'ana.paula+bichu@exemplo.test',
      "o'brien@exemplo.test",
      'joao_silva-99@sub.exemplo.com.br',
      'conta!#$%&*+-/=?^_`{|}~@exemplo.test',
      'maria@exemplo.com.br',
    ]) {
      assert.equal(emailTemFormaValida(endereco), true, endereco);
    }
  });
});
