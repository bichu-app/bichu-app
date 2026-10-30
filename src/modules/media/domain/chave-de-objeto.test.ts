/**
 * O que se prova aqui é a **ausência** de identificador interno na chave pública,
 * e não o formato dela.
 */
import assert from 'node:assert/strict';
import { TETO_DE_BYTES_DO_ENVIO } from './derivadas.js';
import { describe, it } from 'node:test';
import { posix } from 'node:path';
import {
  TETO_DE_BYTES,
  chaveDaDerivada,
  chaveDaFotoHigienizada,
  chaveDoOriginal,
  comoObjectKey,
  ehTipoAceito,
  ehTipoDeDerivada,
} from './chave-de-objeto.js';

const PET = '01a0b47d-ae11-7d5b-9b58-d77530774256';
const FOTO = '01a0b480-0000-7000-8000-000000000001';

void describe('chave da derivada pública', () => {
  void it('NÃO carrega pet_id, foto_id nem user_id', () => {
    const chave = chaveDaDerivada('card', new Uint8Array(16).fill(7), 'webp');
    for (const interno of [PET, FOTO, `pets/${PET}`]) {
      assert.ok(!chave.includes(interno), `a chave pública vazou "${interno}": ${chave}`);
    }
    assert.match(chave, /^pets\/card\/[A-Za-z0-9_-]+\.webp$/);
  });

  void it('não é adivinhável: dois sorteios dão chaves diferentes', () => {
    const a = chaveDaDerivada('card', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 'webp');
    const b = chaveDaDerivada('card', new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'webp');
    assert.notEqual(a, b);
  });

  void it('sobrevive a URL sem escape: base64url não tem +, / nem =', () => {
    const chave = chaveDaDerivada('thumb', new Uint8Array(16).fill(251), 'webp');
    const sorteada = chave.slice(chave.lastIndexOf('/') + 1);
    assert.ok(!/[+=]/.test(sorteada), sorteada);
    assert.ok(!sorteada.includes('/'), sorteada);
  });

  void it('RECUSA aleatório curto — é ela que não tem assinatura protegendo', () => {
    for (const curto of [0, 1, 8, 15]) {
      assert.throws(
        () => chaveDaDerivada('card', new Uint8Array(curto), 'webp'),
        /128 bits/,
        `aceitou ${curto} bytes de aleatório`,
      );
    }
  });

  void it('16 bytes continuam gerando chave — recusar tudo não é defesa', () => {
    for (const variante of ['card', 'thumb'] as const) {
      const chave = chaveDaDerivada(variante, new Uint8Array(16).fill(5), 'webp');
      assert.ok(chave.startsWith(`pets/${variante}/`), chave);
      assert.equal(chave.slice(`pets/${variante}/`.length, chave.indexOf(".")).length, 22);
    }
  });
});

void describe('chave do original', () => {
  void it('carrega o petId no prefixo e 128 bits de aleatório no nome', () => {
    const chave = chaveDoOriginal(PET, new Uint8Array(16).fill(9));
    assert.ok(chave.startsWith(`pets/${PET}/original/`), chave);
    assert.equal(chave.slice(`pets/${PET}/original/`.length).length, 22);
  });

  void it('RECUSA aleatório curto, em vez de gerar chave fraca em silêncio', () => {
    assert.throws(() => chaveDoOriginal(PET, new Uint8Array(8)), /128 bits/);
  });

  void it('NÃO deriva do identificador da intenção, que é enumerável', () => {
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
    assert.ok(!ehTipoAceito('image/svg+xml'));
    assert.ok(!ehTipoAceito('text/html'));
    assert.ok(!ehTipoAceito('image/gif'));
  });

  void it('o teto é o do contrato: 5 MiB, o MESMO em todos os caminhos', () => {
    assert.equal(TETO_DE_BYTES, 5_242_880);
    assert.equal(TETO_DE_BYTES, TETO_DE_BYTES_DO_ENVIO);
  });
});

/** A extensão da derivada, que é o campo que VIRA CAMINHO (BICHUS-133). */
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
 * verdade.
 */
function prefixoEfetivo(chave: string): string {
  return posix.normalize(chave).split('/').slice(0, 2).join('/');
}

const EXTENSOES_HOSTIS = [
  'webp/../../../publico/card/x.webp',
  '../thumb/x.webp',
  'webp/x.webp',
  'webp/..',
  '.webp',
  '',
  'WEBP',
];

void describe('extensão da derivada', () => {
  void it('nenhuma extensão hostil produz chave fora do prefixo da variante', () => {
    for (const hostil of EXTENSOES_HOSTIS) {
      const chave = chaveOuNada('card', hostil);
      assert.ok(
        chave === null || prefixoEfetivo(chave) === 'pets/card',
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
    for (const boa of ['webp', 'jpg', 'jpeg']) {
      const chave = chaveDaDerivada('card', ALEATORIO, boa);
      assert.equal(prefixoEfetivo(chave), 'pets/card', chave);
      assert.ok(chave.endsWith(`.${boa}`), chave);
    }
    assert.equal(prefixoEfetivo(chaveDaDerivada('thumb', ALEATORIO, 'webp')), 'pets/thumb');
  });
});

void describe('tipo da derivada — o que pode ser GRAVADO', () => {
  void it('aceita os dois que o worker produz', () => {
    assert.ok(ehTipoDeDerivada('image/webp'));
    assert.ok(ehTipoDeDerivada('image/jpeg'));
  });

  void it('RECUSA por igualdade, e o prefixo `image/` não é critério', () => {
    for (const ruim of ['image/svg+xml', 'text/html', 'image/', 'image/webp; charset=utf-8', 'IMAGE/WEBP']) {
      assert.ok(!ehTipoDeDerivada(ruim), ruim);
    }
  });

  void it('RECUSA image/heic, que entra mas nunca sai', () => {
    assert.ok(ehTipoAceito('image/heic'));
    assert.ok(!ehTipoDeDerivada('image/heic'));
  });
});

/** A marca, ou `null` quando a conferência recusou. */
function chaveOuNulo(valor: string): string | null {
  try {
    return comoObjectKey(valor);
  } catch {
    return null;
  }
}

const ORIGINAL_BOA = `pets/${PET}/original/KioqKioqKioqKioqKioqKg`;
const DERIVADA_BOA = 'card/KioqKioqKioqKioqKioqKg.webp';

const CHAVES_HOSTIS = [
  'card/../../etc/senha',
  '../thumb/x.webp',
  'card/./x.webp',
  `pets/${PET}/original/..`,
  '/card/x.webp',
  'card/x.webp/',
  'card//x.webp',
  'card/%2e%2e/x.webp',
  'card/x%2e%2e.webp',
  'card/x y.webp',
  'card/café.webp',
  'card\\..\\x.webp',
  'publico/x.webp',
  'card/x.webp/extra',
  `pets/${PET}/x.webp`,
  'card/semextensao',
  'card/.webp',
  'card/x.',
  '',
];

void describe('comoObjectKey — a marca que agora exige forma', () => {
  void it('nenhuma chave aceita resolve para fora do que está escrito', () => {
    for (const hostil of CHAVES_HOSTIS) {
      const chave = chaveOuNulo(hostil);
      assert.ok(
        chave === null || posix.normalize(chave) === chave,
        `aceitou chave que o caminho resolve para outro lugar: ${String(chave)}`,
      );
      assert.equal(chave, null, `normalizou em silêncio em vez de recusar: ${String(chave)}`);
    }
  });

  void it('a travessia sai mesmo do bucket quando a URL é montada', () => {
    const url = new URL('https://midia.invalid/bucket/');
    url.pathname = '/bucket/card/../../etc/senha';
    assert.equal(url.pathname, '/etc/senha');
    assert.equal(chaveOuNulo('card/../../etc/senha'), null);
  });

  void it('RECUSA com a chave no texto, para a linha ruim aparecer no log', () => {
    assert.throws(() => comoObjectKey('card/../../etc/senha'), /Chave de objeto recusada/);
    assert.throws(() => comoObjectKey('card/../../etc/senha'), /etc\/senha/);
  });

  void it('as duas formas que já estão gravadas continuam passando', () => {
    for (const boa of [ORIGINAL_BOA, DERIVADA_BOA, 'thumb/KioqKioqKioqKioqKioqKg.jpg']) {
      assert.equal(comoObjectKey(boa), boa);
    }
  });

  void it('não prende a leitura às regras de ESCRITA de hoje', () => {
    assert.equal(comoObjectKey(`pets/${PET}/original/${FOTO}`), `pets/${PET}/original/${FOTO}`);
    assert.equal(comoObjectKey('card/abc.png'), 'card/abc.png');
  });

  void it('é a porta por onde a própria geração passa', () => {

    assert.throws(() => chaveDoOriginal('../outro', ALEATORIO), /Chave de objeto recusada/);
    assert.throws(() => chaveDoOriginal('a/b', ALEATORIO), /Chave de objeto recusada/);

    const varianteTorta = 'card/../..' as unknown as 'card';
    assert.throws(
      () => chaveDaDerivada(varianteTorta, ALEATORIO, 'webp'),
      /Chave de objeto recusada/,
    );

    assert.ok(String(chaveDaDerivada('card', ALEATORIO, 'webp')).startsWith('pets/card/'));
    assert.ok(String(chaveDoOriginal(PET, ALEATORIO)).startsWith(`pets/${PET}/original/`));
  });

  void it('o TETO de 1024 é o do armazenamento, e ele recusa', () => {
    const noTeto = `card/${'a'.repeat(1024 - 'card/'.length - '.webp'.length)}.webp`;
    assert.equal(noTeto.length, 1024);
    assert.equal(comoObjectKey(noTeto), noTeto);

    const umAcima = `card/${'a'.repeat(1025 - 'card/'.length - '.webp'.length)}.webp`;
    assert.equal(umAcima.length, 1025);
    assert.throws(() => comoObjectKey(umAcima), /recusada \(tamanho\)/);

    assert.throws(() => comoObjectKey(''), /recusada \(tamanho\)/);
  });
});

/** As formas de chave que entraram nesta entrega, e o que cada uma protege. */
void describe('a variante `banner` e a derivada higienizada do achado', () => {
  const ALEATORIO = new Uint8Array(16).fill(7);

  void it('`banner` é uma variante de derivada pública como as outras duas', () => {
    const chave = chaveDaDerivada('banner', ALEATORIO, 'jpeg', 'events');
    assert.ok(chave.startsWith('events/banner/'));
    assert.ok(chave.endsWith('.jpeg'));
  });

  void it('a variante fora da lista não monta chave nenhuma', () => {
    assert.throws(() =>
      // @ts-expect-error — é exatamente isto que a união fechada impede, e o
      // teste existe para o dia em que alguém trocar o tipo por `string`.
      chaveDaDerivada('../../publico', ALEATORIO, 'jpeg', 'events'),
    );
  });

  void it('a higienizada do achado fica no MESMO prefixo do original', () => {
    const chave = chaveDaFotoHigienizada('1111-2222', ALEATORIO, 'jpeg');
    assert.ok(chave.startsWith('found-reports/1111-2222/sanitized/'));
  });

  void it('a de quem não tem conta usa o rótulo, e nunca um UUID (SEC-001)', () => {
    const chave = chaveDaFotoHigienizada('sem-conta', ALEATORIO, 'jpeg');
    assert.equal(chave.startsWith('found-reports/sem-conta/sanitized/'), true);
  });

  void it('RECUSA extensão hostil, que viraria travessia no caminho', () => {
    assert.throws(() => chaveDaFotoHigienizada('1111', ALEATORIO, '../../publico/card/x.jpeg'));
  });

  void it('RECUSA aleatório fraco: a chave é o que não se adivinha', () => {
    assert.throws(() => chaveDaFotoHigienizada('1111', new Uint8Array(4), 'jpeg'));
  });

  void it('`comoObjectKey` aceita a forma higienizada, e só com 4 segmentos', () => {
    assert.equal(
      comoObjectKey('found-reports/1111/sanitized/abc.jpeg'),
      'found-reports/1111/sanitized/abc.jpeg',
    );
    assert.throws(() => comoObjectKey('found-reports/sanitized/abc.jpeg'));
    assert.throws(() => comoObjectKey('found-reports/1111/sanitized/sub/abc.jpeg'));
  });
});
