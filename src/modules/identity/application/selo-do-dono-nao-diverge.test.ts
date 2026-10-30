/** **O SELO QUE O DONO VÊ DE SI É O MESMO QUE OS OUTROS VEEM DELE.** */
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
 * A MESMA tabela de `canal-de-contato-confirmado.test.ts`, e a terceira linha é a
 * razão de ser desta tarefa.
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
    assert.ok(
      TABELA.some((l) => l.selo !== l.email),
      'a tabela não tem nenhuma linha em que o selo e o e-mail discordam: ela ' +
        'não separa os dois campos',
    );
  });

  void it('as DUAS projeções respondem o mesmo sobre a mesma conta', () => {
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
