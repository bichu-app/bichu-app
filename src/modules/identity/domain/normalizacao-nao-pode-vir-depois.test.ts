/** Normalização Unicode e a conferência de endereço: a ordem é a defesa inteira. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailTemFormaValida, normalizarEmail } from './email.js';
import { motivoDaRecusaDeEndereco } from './gramatica-de-endereco.js';

const FORMAS = ['NFC', 'NFD', 'NFKC', 'NFKD'] as const;

function ponto(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Os pontos de código que a conferência **aceita** e que a normalização transforma
 * em algo que ela **recusaria**.
 */
function perigososSobNormalizacao(): { cp: number; forma: string; vira: string }[] {
  const achados: { cp: number; forma: string; vira: string }[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const caractere = String.fromCodePoint(cp);
    if (motivoDaRecusaDeEndereco(caractere) !== null) continue;
    for (const forma of FORMAS) {
      const normalizado = caractere.normalize(forma);
      if (motivoDaRecusaDeEndereco(normalizado) !== null) {
        achados.push({ cp, forma, vira: [...normalizado].map((c) => ponto(c.codePointAt(0) ?? 0)).join(' ') });
        break;
      }
    }
  }
  return achados;
}

void describe('BICHUS-198 — normalizar DEPOIS de conferir reabriria o furo', () => {
  void it('a conversão de caixa do `normalizarEmail` não cria caractere proibido — este é o passo que de fato roda', () => {
    const culpados: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const caractere = String.fromCodePoint(cp);
      if (motivoDaRecusaDeEndereco(caractere) !== null) continue;
      if (
        motivoDaRecusaDeEndereco(caractere.toLowerCase()) !== null ||
        motivoDaRecusaDeEndereco(caractere.toUpperCase()) !== null
      ) {
        culpados.push(ponto(cp));
      }
    }

    assert.deepEqual(
      culpados.slice(0, 20),
      [],
      'uma conversão de caixa passou a produzir caractere proibido: `normalizarEmail` ' +
        'roda antes da validação, então a validação precisaria passar a rodar depois dele.',
    );
  });

  void it('o endereço que a validação aprovou é o MESMO texto que `normalizarEmail` produziu', () => {
    for (const bruto of ['  Tutora@Exemplo.Test  ', 'ANA.PAULA+Bichu@Exemplo.COM.BR']) {
      const normalizado = normalizarEmail(bruto);
      assert.equal(emailTemFormaValida(normalizado), true, normalizado);
      assert.equal(
        normalizarEmail(normalizado),
        normalizado,
        'normalizar de novo precisa ser inócuo: se não for, existe um passo escondido',
      );
    }
  });

  void it('há pontos de código que passam e viram proibido sob normalização — medido, não afirmado', () => {
    const perigosos = perigososSobNormalizacao();

    assert.ok(
      perigosos.length > 0,
      'nenhum ponto de código normaliza para caractere proibido. Se isso passou a ser ' +
        'verdade de verdade, o aviso sobre normalização em `ports/mailer.ts` pode sair — ' +
        'mas confira a medição antes de acreditar nela.',
    );

    const gregoInterrogacao = perigosos.find((p) => p.cp === 0x037e);
    assert.ok(
      gregoInterrogacao !== undefined,
      '`U+037E` deixou de normalizar para `U+003B`. Era o caso mais afiado do aviso.',
    );
    assert.equal(gregoInterrogacao.vira, 'U+003B', 'a interrogação grega vira ponto e vírgula');
    assert.equal(
      gregoInterrogacao.forma,
      'NFC',
      'e vira já sob NFC, a forma canônica — não é preciso NFKC para reabrir o furo',
    );
  });

  void it('`U+037E` passa na conferência e o `;` que ele viraria não passa — é essa diferença que a ordem protege', () => {
    const comGrego = 'tutora;x@exemplo.test';
    assert.equal(emailTemFormaValida(comGrego), true, 'o caractere grego é aceito, e isso está certo');
    assert.equal(
      emailTemFormaValida(comGrego.normalize('NFC')),
      false,
      'normalizado, o mesmo endereço carrega um separador de lista de endereços',
    );
  });
});
