/**
 * O que se prova aqui é a **ausência** de identificador interno na chave
 * pública, e não o formato dela.
 *
 * O caso central é negativo porque o erro que ele pega é silencioso: uma chave
 * pública com `pets/{petId}/` funcionaria perfeitamente, passaria em qualquer
 * teste de "a foto aparece", e entregaria o `pet_id` a quem clicasse com o botão
 * direito na imagem de um cartaz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TETO_DE_BYTES,
  chaveDaDerivada,
  chaveDoOriginal,
  ehTipoAceito,
} from './chave-de-objeto.js';

const PET = '01a0b47d-ae11-7d5b-9b58-d77530774256';
const FOTO = '01a0b480-0000-7000-8000-000000000001';

void describe('chave da derivada pública', () => {
  void it('NÃO carrega pet_id, foto_id nem user_id', () => {
    const chave = chaveDaDerivada('card', new Uint8Array(16).fill(7), 'webp');
    for (const interno of [PET, FOTO, 'pets/']) {
      assert.ok(!chave.includes(interno), `a chave pública vazou "${interno}": ${chave}`);
    }
  });

  void it('não é adivinhável: dois sorteios dão chaves diferentes', () => {
    const a = chaveDaDerivada('card', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 'webp');
    const b = chaveDaDerivada('card', new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'webp');
    assert.notEqual(a, b);
  });

  void it('sobrevive a URL sem escape: base64url não tem +, / nem =', () => {
    // A chave viaja em cartaz impresso e em mensagem. Um `+` virando espaço no
    // meio do caminho quebraria a foto de um jeito que ninguém reproduz.
    //
    // A conferência olha só a PARTE SORTEADA: a barra que separa o prefixo é a
    // estrutura da chave, e é para estar ali. (Primeira versão deste teste
    // reprovava por causa dela, e o defeito era do teste.)
    const chave = chaveDaDerivada('thumb', new Uint8Array(16).fill(251), 'webp');
    const sorteada = chave.slice(chave.indexOf('/') + 1);
    assert.ok(!/[+=]/.test(sorteada), sorteada);
    assert.ok(!sorteada.includes('/'), sorteada);
  });
});

void describe('chave do original', () => {
  void it('é previsível de propósito: o bucket privado não tem leitura anônima', () => {
    assert.equal(chaveDoOriginal(PET, FOTO), `pets/${PET}/original/${FOTO}`);
  });
});

void describe('tipos aceitos', () => {
  void it('aceita os quatro do contrato', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/heic', 'image/webp']) {
      assert.ok(ehTipoAceito(t), t);
    }
  });

  void it('RECUSA SVG, que é o vetor de XSS servido como imagem', () => {
    // SVG é um documento com script. Servido do domínio de mídia ele não alcança
    // a sessão, mas continua sendo página executável hospedada por nós.
    assert.ok(!ehTipoAceito('image/svg+xml'));
    assert.ok(!ehTipoAceito('text/html'));
    assert.ok(!ehTipoAceito('image/gif'));
  });

  void it('o teto é o do contrato', () => {
    assert.equal(TETO_DE_BYTES, 10_485_760);
  });
});
