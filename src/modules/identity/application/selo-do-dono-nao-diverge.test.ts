/**
 * **O SELO QUE O DONO VÊ DE SI É O MESMO QUE OS OUTROS VEEM DELE.**
 *
 * Decisão do cliente, 21/10/2026, literal: *"Unificar agora, nas duas — a mesma
 * régua (e-mail OU telefone) nos dois lugares, antes de telefone existir."*
 *
 * ## O DEFEITO QUE ESTE ARQUIVO PRENDE
 *
 * `Me.email_verified` era o selo do DONO, e é só e-mail.
 * `contact_channel_verified` é o selo que os OUTROS veem, e é e-mail **OU**
 * telefone. As duas respostas coincidem em toda conta que existe hoje, porque
 * nada em `src/` grava `phone_verified_at` — **e é por isso que a divergência
 * era invisível**. No dia em que telefone confirmar, a mesma conta apareceria
 * validada para os outros e não para si, e ninguém ia lembrar que a causa era
 * essa.
 *
 * Então o caso que define esta tarefa **finge o futuro**: ele monta a conta de
 * telefone confirmado com e-mail nulo, que hoje não acontece, e exige que o
 * dono veja o selo. Um teste só com as contas de hoje passaria com as duas
 * réguas de volta.
 *
 * ## AS DUAS PROJEÇÕES DO DONO SÃO DUAS, E ELAS TAMBÉM PODEM DIVERGIR
 *
 * `Me` tem **dois** montadores no servidor, e isso não é redundância
 * acidental: `projetarMeuPerfil` responde `getMe`/`updateMe` (e carrega a
 * foto), e `projetarConta` responde `SessionResponse.user` — as cinco rotas de
 * sessão. Um campo novo em um e não no outro faz o selo aparecer depois do
 * login e desaparecer ao abrir `Meus dados`. Os casos deste arquivo cobram os
 * dois com a mesma tabela.
 *
 * ## O QUE ESTE ARQUIVO NÃO MEDE
 *
 * A igualdade com o lado de TERCEIRO, que é derivado no **SQL**. Aqui só existe
 * TypeScript. Quem mede os dois lados com um Postgres de verdade é
 * `tests/integration/regua-do-selo-nao-diverge.test.ts`; o que prende a
 * expressão de SQL à mesma tabela de verdade é
 * `src/shared/db/canal-de-contato-confirmado.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { Conta } from '../ports/identity-repository.js';
import { projetarMeuPerfil } from '../domain/resposta-do-perfil.js';
import { projetarConta } from './session-view.js';

const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;
const EM = Date.UTC(2026, 9, 21, 12, 0, 0) as Instant;

function conta(mudanca: Partial<Conta> = {}): Conta {
  return {
    id: '0192a3b4-0000-7000-8000-00000000aaaa' as UserId,
    email: 'tutor@exemplo-de-teste.invalid',
    emailVerifiedAt: null,
    displayName: 'Maria',
    handle: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: comoData(Date.UTC(2026, 9, 1, 12, 0, 0) as Instant),
    ...mudanca,
  };
}

/** As duas projeções de `Me`, com o mesmo nome que o contrato usa. */
const PROJECOES: ReadonlyArray<{
  readonly nome: string;
  readonly montar: (c: Conta) => Record<string, unknown>;
}> = [
  {
    nome: 'projetarMeuPerfil (getMe / updateMe)',
    montar: (c) => projetarMeuPerfil(c, null, URL_DE_MIDIA),
  },
  {
    nome: 'projetarConta (SessionResponse.user)',
    montar: (c) => projetarConta(c, null) as unknown as Record<string, unknown>,
  },
];

/**
 * A MESMA tabela de `canal-de-contato-confirmado.test.ts`, e a terceira linha é
 * a razão de ser desta tarefa.
 *
 * `selo` é o que `contact_channel_verified` tem de responder; `email` é o que
 * `email_verified` tem de responder. **As duas colunas diferem numa linha só**,
 * e é essa linha que separa as duas réguas.
 */
const TABELA: ReadonlyArray<{
  readonly nome: string;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
  readonly selo: boolean;
  readonly email: boolean;
}> = [
  { nome: 'nenhum canal', emailVerifiedAt: null, phoneVerifiedAt: null, selo: false, email: false },
  {
    nome: 'só e-mail',
    emailVerifiedAt: comoData(EM),
    phoneVerifiedAt: null,
    selo: true,
    email: true,
  },
  {
    nome: 'SÓ TELEFONE (hoje não acontece)',
    emailVerifiedAt: null,
    phoneVerifiedAt: comoData(EM),
    selo: true,
    email: false,
  },
  {
    nome: 'os dois',
    emailVerifiedAt: comoData(EM),
    phoneVerifiedAt: comoData(EM),
    selo: true,
    email: true,
  },
];

void describe('o selo do dono não diverge do selo que os outros veem', () => {
  for (const projecao of PROJECOES) {
    void describe(projecao.nome, () => {
      for (const linha of TABELA) {
        void it(`${linha.nome}: selo=${String(linha.selo)}`, () => {
          const projetada = projecao.montar(
            conta({
              emailVerifiedAt: linha.emailVerifiedAt,
              phoneVerifiedAt: linha.phoneVerifiedAt,
            }),
          );
          assert.equal(
            projetada['contact_channel_verified'],
            linha.selo,
            'o selo do dono tem de responder pela régua de e-mail OU telefone, ' +
              'a mesma de `PublicationAuthor`, `PersonProfile` e `ConnectionPerson`',
          );
        });
      }
    });
  }

  void it(
    'ISCA — A RÉGUA QUE DIVERGIA: telefone confirmado, e-mail nulo, e o dono ' +
      'vê o selo nas DUAS projeções',
    () => {
      // **ESTE É O CASO QUE REPROVA SE AS DUAS RÉGUAS DIVERGIREM.**
      //
      // ISCA: voltar `contact_channel_verified` a
      // `conta.emailVerifiedAt !== null` (a régua antiga do selo do dono) em
      // `resposta-do-perfil.ts` ou em `session-view.ts` compila, passa em toda
      // conta que existe hoje, e reprova AQUI.
      const comTelefone = conta({ emailVerifiedAt: null, phoneVerifiedAt: comoData(EM) });
      for (const projecao of PROJECOES) {
        const projetada = projecao.montar(comTelefone);
        assert.equal(
          projetada['contact_channel_verified'],
          true,
          `${projecao.nome}: o telefone desta conta está confirmado e o dono não ` +
            `vê o selo. Os outros veem — os três schemas de terceiro leem a régua ` +
            `de e-mail OU telefone.`,
        );
      }
    },
  );

  void it('`email_verified` NÃO foi redefinido: ele continua falando do e-mail', () => {
    // A metade que impede "unificar" de virar licença para o campo mentir.
    // Campo de contrato com nome que fala de e-mail tem de responder sobre
    // e-mail — a tela usa este booleano na linha "E-mail confirmado / E-mail
    // ainda não confirmado" ao lado do endereço, e a pendência
    // `email_verification` sai dele.
    //
    // ISCA: apontar `email_verified` para a régua unificada passaria em todos
    // os casos acima e reprovaria aqui.
    for (const projecao of PROJECOES) {
      for (const linha of TABELA) {
        const projetada = projecao.montar(
          conta({
            emailVerifiedAt: linha.emailVerifiedAt,
            phoneVerifiedAt: linha.phoneVerifiedAt,
          }),
        );
        assert.equal(
          projetada['email_verified'],
          linha.email,
          `${projecao.nome}, ${linha.nome}: \`email_verified\` respondeu sobre ` +
            `outra coisa que não o e-mail`,
        );
      }
    }
    // E as duas colunas DIFEREM em alguma linha, senão o caso acima mediria a
    // mesma régua duas vezes e passaria com os dois campos unificados.
    assert.ok(
      TABELA.some((l) => l.selo !== l.email),
      'a tabela não tem nenhuma linha em que o selo e o e-mail discordam: ela ' +
        'não separa os dois campos',
    );
  });

  void it('as DUAS projeções respondem o mesmo sobre a mesma conta', () => {
    // Um campo novo em um montador e não no outro faz o selo aparecer depois do
    // login e desaparecer ao abrir `Meus dados`.
    for (const linha of TABELA) {
      const c = conta({
        emailVerifiedAt: linha.emailVerifiedAt,
        phoneVerifiedAt: linha.phoneVerifiedAt,
      });
      const doPerfil = projetarMeuPerfil(c, null, URL_DE_MIDIA);
      const daSessao = projetarConta(c, null) as unknown as Record<string, unknown>;
      assert.equal(
        doPerfil['contact_channel_verified'],
        daSessao['contact_channel_verified'],
        `${linha.nome}: \`getMe\` e \`SessionResponse.user\` discordam sobre o selo`,
      );
      assert.equal(doPerfil['email_verified'], daSessao['email_verified']);
      assert.equal(doPerfil['can_open_lost_case'], daSessao['can_open_lost_case']);
    }
  });
});
