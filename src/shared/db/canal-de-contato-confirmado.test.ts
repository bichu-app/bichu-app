/**
 * **A RÉGUA DO CANAL DE CONTATO, nas duas formas, presa à MESMA tabela de
 * verdade.**
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canalDeContatoConfirmado,
  canalDeContatoConfirmadoNoSql,
  type ApelidoDeUsuarios,
} from './canal-de-contato-confirmado.js';
import { bancoDeMentira } from './banco-de-teste-que-devolve-linha.js';

const EM = new Date('2026-10-21T12:00:00.000Z');

/** As quatro contas possíveis, e o que a régua responde sobre cada uma. */
const TABELA: ReadonlyArray<{
  readonly nome: string;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
  readonly confirmado: boolean;
}> = [
  { nome: 'nenhum canal', emailVerifiedAt: null, phoneVerifiedAt: null, confirmado: false },
  { nome: 'só e-mail', emailVerifiedAt: EM, phoneVerifiedAt: null, confirmado: true },
  { nome: 'SÓ TELEFONE', emailVerifiedAt: null, phoneVerifiedAt: EM, confirmado: true },
  { nome: 'os dois', emailVerifiedAt: EM, phoneVerifiedAt: EM, confirmado: true },
];

/** A expressão canônica, escrita à mão, por apelido. */
function textoCanonico(apelido: string): string {
  return `(${apelido}.email_verified_at IS NOT NULL OR ${apelido}.phone_verified_at IS NOT NULL)`;
}

function sqlDe(apelido: ApelidoDeUsuarios): string {
  const { db } = bancoDeMentira<Record<string, never>>(() => []);
  return canalDeContatoConfirmadoNoSql(apelido).compile(db).sql;
}

void describe('a régua do canal de contato tem UMA definição', () => {
  void describe('o predicado de TypeScript', () => {
    for (const linha of TABELA) {
      void it(`${linha.nome}: ${String(linha.confirmado)}`, () => {
        assert.equal(
          canalDeContatoConfirmado({
            emailVerifiedAt: linha.emailVerifiedAt,
            phoneVerifiedAt: linha.phoneVerifiedAt,
          }),
          linha.confirmado,
        );
      });
    }

    void it('ISCA DA ISCA: a tabela SEPARA e-mail de e-mail-OU-telefone', () => {
      const soTelefone = TABELA.filter(
        (l) => l.emailVerifiedAt === null && l.phoneVerifiedAt !== null,
      );
      assert.equal(soTelefone.length, 1, 'a linha que separa as duas réguas saiu da tabela');
      assert.equal(soTelefone[0]!.confirmado, true);
      const reguaAntiga = (c: { emailVerifiedAt: Date | null }) => c.emailVerifiedAt !== null;
      assert.notEqual(reguaAntiga(soTelefone[0]!), soTelefone[0]!.confirmado);
    });
  });

  void describe('a expressão de SQL', () => {
    for (const apelido of ['a', 'outro', 'u', 'users'] as const) {
      void it(`apelido \`${apelido}\`: o texto é o canônico`, () => {
        assert.equal(sqlDe(apelido), textoCanonico(apelido));
      });
    }

    void it('ISCA DA ISCA: a comparação de texto enxerga uma régua trocada', () => {
      for (const mentiroso of [
        '(a.email_verified_at IS NOT NULL AND a.phone_verified_at IS NOT NULL)',
        '(a.email_verified_at IS NOT NULL)',
        '(a.phone_verified_at IS NOT NULL OR a.email_verified_at IS NOT NULL)',
      ]) {
        assert.notEqual(mentiroso, textoCanonico('a'));
      }
    });

    void it('as duas colunas de data NÃO saem na lista de seleção', () => {
      const texto = sqlDe('u');
      assert.ok(texto.startsWith('('), 'a expressão não está entre parênteses');
      assert.ok(texto.endsWith(')'));
      assert.ok(!texto.includes(' as '), 'a expressão não dá nome a coluna nenhuma');
    });
  });
});
