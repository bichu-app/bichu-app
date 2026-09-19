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
import { posix } from 'node:path';
import {
  TETO_DE_BYTES,
  chaveDaDerivada,
  chaveDoOriginal,
  ehTipoAceito,
  ehTipoDeDerivada,
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
  void it('carrega o petId no prefixo e 128 bits de aleatório no nome', () => {
    const chave = chaveDoOriginal(PET, new Uint8Array(16).fill(9));
    assert.ok(chave.startsWith(`pets/${PET}/original/`), chave);
    assert.equal(chave.slice(`pets/${PET}/original/`.length).length, 22);
  });

  void it('RECUSA aleatório curto, em vez de gerar chave fraca em silêncio', () => {
    // Uma chave com menos entropia que o critério 21 exige passaria em todo
    // teste de "a foto sobe" e só apareceria para quem a explorasse.
    assert.throws(() => chaveDoOriginal(PET, new Uint8Array(8)), /128 bits/);
  });

  void it('NÃO deriva do identificador da intenção, que é enumerável', () => {
    // UUIDv7 tem carimbo de tempo no prefixo: quem conhece o petId e a janela
    // de tempo enumera as chaves. Foi o erro da primeira versão deste arquivo.
    const chave = chaveDoOriginal(PET, new Uint8Array(16).fill(3));
    assert.ok(!chave.includes(FOTO), chave);
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

/**
 * A extensão da derivada, que é o campo que VIRA CAMINHO (BICHUS-133).
 *
 * O que se prova aqui não é a mensagem do erro: é que **nenhuma chave sai do
 * prefixo da variante**. A afirmação é sobre a chave e não sobre a exceção de
 * propósito — uma implementação que saneasse a extensão em silêncio também não
 * lançaria, e gravaria a foto num caminho que ninguém escreveu.
 */
const ALEATORIO = new Uint8Array(16).fill(42);

/** A chave, ou `null` quando a geração recusou. */
function chaveOuNada(variante: 'thumb' | 'card', extensao: string): string | null {
  try {
    return chaveDaDerivada(variante, ALEATORIO, extensao);
  } catch {
    return null;
  }
}

/**
 * O primeiro segmento DEPOIS de resolver `..`, que é onde o objeto grava de
 * verdade. Comparar o texto cru diria "começa com `card/`" para uma chave que
 * o armazenamento resolve para `publico/`.
 */
function prefixoEfetivo(chave: string): string {
  return posix.normalize(chave).split('/')[0] ?? '';
}

const EXTENSOES_HOSTIS = [
  // A do relato: escapa do prefixo da variante e do bucket privado para o
  // público, com a assinatura V4 calculada depois — gravação válida no lugar
  // errado, que o armazenamento não tem como recusar.
  'webp/../../../publico/card/x.webp',
  '../thumb/x.webp',
  'webp/x.webp',
  'webp/..',
  '.webp',
  '',
  // Caixa alta: a lista é por IGUALDADE, e `WEBP` não é `webp`. Extensão que
  // ninguém gera hoje não passa por ser parecida com uma que gera.
  'WEBP',
];

void describe('extensão da derivada', () => {
  void it('nenhuma extensão hostil produz chave fora do prefixo da variante', () => {
    for (const hostil of EXTENSOES_HOSTIS) {
      const chave = chaveOuNada('card', hostil);
      assert.ok(
        chave === null || prefixoEfetivo(chave) === 'card',
        `a chave escapou do prefixo da variante: ${String(chave)}`,
      );
      assert.equal(chave, null, `saneou em silêncio em vez de recusar: ${String(chave)}`);
    }
  });

  void it('RECUSA com a extensão no texto, para o defeito aparecer no log', () => {
    assert.throws(
      () => chaveDaDerivada('card', ALEATORIO, 'webp/../../../publico/card/x.webp'),
      /Extensão de derivada recusada/,
    );
  });

  void it('a extensão legítima continua passando — recusar tudo não é defesa', () => {
    // O contrapeso. Sem ele, uma implementação que recusasse toda extensão
    // passaria nos casos acima e quebraria o processamento inteiro em silêncio.
    for (const boa of ['webp', 'jpg', 'jpeg']) {
      const chave = chaveDaDerivada('card', ALEATORIO, boa);
      assert.equal(prefixoEfetivo(chave), 'card', chave);
      assert.ok(chave.endsWith(`.${boa}`), chave);
    }
    assert.equal(prefixoEfetivo(chaveDaDerivada('thumb', ALEATORIO, 'webp')), 'thumb');
  });
});

void describe('tipo da derivada — o que pode ser GRAVADO', () => {
  void it('aceita os dois que o worker produz', () => {
    // Contrapeso do lado da gravação: o caminho feliz precisa continuar existindo.
    assert.ok(ehTipoDeDerivada('image/webp'));
    assert.ok(ehTipoDeDerivada('image/jpeg'));
  });

  void it('RECUSA por igualdade, e o prefixo `image/` não é critério', () => {
    // `starts-with: image/` aceitaria `image/svg+xml`, que é documento com
    // script servido pelo domínio de mídia — o mesmo erro que o critério 22
    // proíbe na entrada.
    for (const ruim of ['image/svg+xml', 'text/html', 'image/', 'image/webp; charset=utf-8', 'IMAGE/WEBP']) {
      assert.ok(!ehTipoDeDerivada(ruim), ruim);
    }
  });

  void it('RECUSA image/heic, que entra mas nunca sai', () => {
    // Aceito no ENVIO e impossível como derivada: o worker reescreve tudo em
    // WebP. Gravar HEIC seria a lista da entrada vazando para a saída.
    assert.ok(ehTipoAceito('image/heic'));
    assert.ok(!ehTipoDeDerivada('image/heic'));
  });
});
