/**
 * **A RÉGUA DO CANAL DE CONTATO, nas duas formas, presa à MESMA tabela de
 * verdade.**
 *
 * `canal-de-contato-confirmado.ts` existe para que "validado" tenha uma
 * definição só. Ter uma fonte não basta: ela tem **duas formas** — a expressão
 * de SQL, para quem deriva o booleano dentro de uma consulta, e o predicado de
 * TypeScript, para quem já tem a conta em memória — e duas formas podem
 * discordar exatamente como as duas cópias discordavam.
 *
 * Então este arquivo prende as duas à mesma tabela, **incluindo a linha que
 * hoje não acontece**: telefone confirmado com e-mail nulo. Nada em `src/`
 * grava `phone_verified_at`, e era justamente por isso que a divergência entre
 * o selo do dono e o selo de terceiro era invisível.
 *
 * ## O QUE ESTE ARQUIVO NÃO MEDE, E QUEM MEDE
 *
 * Ele **não executa SQL**. A igualdade entre a expressão e o predicado é
 * medida aqui por TEXTO (a expressão é a canônica) e por TABELA (o predicado
 * responde o que a expressão responderia); quem a mede **rodando** é
 * `tests/integration/regua-do-selo-nao-diverge.test.ts`, com um Postgres de
 * verdade e uma conta de telefone confirmado.
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

/**
 * As quatro contas possíveis, e o que a régua responde sobre cada uma.
 *
 * **A terceira linha é a razão de ser desta tarefa.** Ela não acontece hoje, e
 * é a única que separa "e-mail" de "e-mail OU telefone": com a régua só de
 * e-mail ela responde `false`, e com a régua certa responde `true`.
 */
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
      // Sem este caso a tabela poderia ser toda `true` menos a primeira linha,
      // e uma régua só de e-mail passaria nela. O que ele exige é que exista
      // **uma** linha em que as duas réguas discordam — e ela é a de telefone
      // sozinho.
      //
      // ISCA: trocar `||` por `&&` em `canalDeContatoConfirmado` reprova duas
      // linhas da tabela; trocar por `conta.emailVerifiedAt !== null` (a régua
      // antiga do selo do dono) reprova SÓ esta, e é para isso que ela existe.
      const soTelefone = TABELA.filter(
        (l) => l.emailVerifiedAt === null && l.phoneVerifiedAt !== null,
      );
      assert.equal(soTelefone.length, 1, 'a linha que separa as duas réguas saiu da tabela');
      assert.equal(soTelefone[0]!.confirmado, true);
      // E a régua ANTIGA (só e-mail) discorda da tabela nesta linha. Escrito
      // como comparação e não como comentário: é o que prova que a tabela mede
      // a diferença, e não só a régua nova.
      const reguaAntiga = (c: { emailVerifiedAt: Date | null }) => c.emailVerifiedAt !== null;
      assert.notEqual(reguaAntiga(soTelefone[0]!), soTelefone[0]!.confirmado);
    });
  });

  void describe('a expressão de SQL', () => {
    for (const apelido of ['a', 'outro', 'u', 'users'] as const) {
      void it(`apelido \`${apelido}\`: o texto é o canônico`, () => {
        // **Texto, e não "contém"**: as varreduras de SQL compilado dos
        // `autorizacao-na-clausula-where.test.ts` cobram a expressão pelo nome
        // COMPLETO das duas colunas, e é esta igualdade que as mantém verdes.
        assert.equal(sqlDe(apelido), textoCanonico(apelido));
      });
    }

    void it('ISCA DA ISCA: a comparação de texto enxerga uma régua trocada', () => {
      // A comparação acima ficaria verde se `textoCanonico` passasse a ser
      // construído a partir da própria expressão. Aqui ela recebe texto
      // mentiroso e tem de recusar.
      for (const mentiroso of [
        '(a.email_verified_at IS NOT NULL AND a.phone_verified_at IS NOT NULL)',
        '(a.email_verified_at IS NOT NULL)',
        '(a.phone_verified_at IS NOT NULL OR a.email_verified_at IS NOT NULL)',
      ]) {
        assert.notEqual(mentiroso, textoCanonico('a'));
      }
    });

    void it('as duas colunas de data NÃO saem na lista de seleção', () => {
      // O que sai é o booleano. "O e-mail dela foi confirmado em março" não é
      // assunto de terceiro, e as duas colunas ficam DENTRO da expressão.
      const texto = sqlDe('u');
      assert.ok(texto.startsWith('('), 'a expressão não está entre parênteses');
      assert.ok(texto.endsWith(')'));
      assert.ok(!texto.includes(' as '), 'a expressão não dá nome a coluna nenhuma');
    });
  });
});
