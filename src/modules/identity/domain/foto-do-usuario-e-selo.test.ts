/** AS ISCAS (d) E (e) DA FOTO DO PRÓPRIO USUÁRIO (cliente, 18/10/2026). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { Conta, FotoDoPerfil } from '../ports/identity-repository.js';
import { projetarFotoDoPerfil, projetarMeuPerfil } from './resposta-do-perfil.js';

const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;

/** O instante da verificação, pela porta do tempo: `domain/` não constrói data. */
const VERIFICADO_EM = Date.UTC(2026, 9, 2, 10, 0, 0) as Instant;

function conta(mudanca: Partial<Conta> = {}): Conta {
  return {
    id: '0192a3b4-0000-7000-8000-00000000aaaa' as UserId,
    email: 'tutor@exemplo.invalid',
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

const PRONTA: FotoDoPerfil = {
  status: 'ready',
  publicKey: 'people/card/KioqKioqKioqKioqKioqKg.jpeg',
  rejectionReason: null,
};

void describe('(d) a foto do usuário não sai em resposta pública', () => {

  void it('a foto do usuário NÃO aparece na projeção pública de nada: a função que a monta é só esta', () => {
    const projetada = projetarMeuPerfil(conta(), PRONTA, URL_DE_MIDIA);
    assert.ok('photo' in projetada, 'o dono vê a foto');
    assert.equal(projetarMeuPerfil(conta(), null, URL_DE_MIDIA)['photo'], null);
  });

  void it('a URL é nula enquanto processa e quando recusada, e nunca é um endereço que daria 404', () => {
    assert.equal(
      projetarFotoDoPerfil({ status: 'processing', publicKey: null, rejectionReason: null }, URL_DE_MIDIA)?.url,
      null,
    );
    const recusada = projetarFotoDoPerfil(
      { status: 'rejected', publicKey: 'people/card/x.jpeg', rejectionReason: 'não é imagem' },
      URL_DE_MIDIA,
    );
    assert.equal(recusada?.url, null, 'recusada com chave ainda não serve');
    assert.equal(recusada?.rejection_reason, 'não é imagem');
    assert.equal(
      projetarFotoDoPerfil(PRONTA, URL_DE_MIDIA)?.url,
      'https://img.bichu.test/people/card/KioqKioqKioqKioqKioqKg.jpeg',
    );
  });
});

void describe('(e) o selo só aparece para quem tem a validação', () => {
  void it('conta VERIFICADA: `email_verified` é verdadeiro', () => {
    const projetada = projetarMeuPerfil(
      conta({ emailVerifiedAt: comoData(VERIFICADO_EM) }),
      PRONTA,
      URL_DE_MIDIA,
    );
    assert.equal(projetada['email_verified'], true);
  });

  void it('CONTRAPESO: conta NÃO verificada, com a MESMA foto, é falso', () => {
    const projetada = projetarMeuPerfil(conta({ emailVerifiedAt: null }), PRONTA, URL_DE_MIDIA);
    assert.equal(projetada['email_verified'], false);
  });

  void it('o selo NÃO está dentro do objeto da foto: ele é da CONTA', () => {
    const foto = projetarFotoDoPerfil(PRONTA, URL_DE_MIDIA);
    assert.ok(foto !== null);
    assert.deepEqual(Object.keys(foto).sort(), ['rejection_reason', 'status', 'url']);
    assert.ok(!('verified' in foto));
    assert.ok(!('badge' in foto));
    assert.ok(!('selo' in foto));
  });

  void it('o selo vale SEM foto também: validação é da pessoa, não da imagem', () => {
    const semFoto = projetarMeuPerfil(
      conta({ emailVerifiedAt: comoData(VERIFICADO_EM) }),
      null,
      URL_DE_MIDIA,
    );
    assert.equal(semFoto['email_verified'], true);
    assert.equal(semFoto['photo'], null);
  });

});
