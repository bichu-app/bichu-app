/**
 * Normalização Unicode e a conferência de endereço: a ordem é a defesa inteira.
 *
 * ## O achado
 *
 * `smtp-mailer.test.ts` já mede que **nenhum** ponto de código produz CR ou LF
 * sob qualquer forma de normalização, e conclui — corretamente — que um passo
 * de normalização antes da conferência seria rito sem efeito contra quebra de
 * linha.
 *
 * Só que quebra de linha não é a classe inteira. A classe recusada inclui `;`,
 * `,`, `:`, `<`, `>` e o espaço, e **82 pontos de código passam na conferência
 * e viram um caractere proibido depois de normalizados**. O mais afiado é
 * `U+037E`, a interrogação grega, que vira `U+003B` — o ponto e vírgula, que
 * separa endereços numa lista de cabeçalho.
 *
 * **E ele não precisa de NFKC para isso: `U+037E` vira `;` já sob NFC**, que é
 * a forma canônica e sem perda, a que um sistema bem-comportado aplica sem
 * anunciar. O relato original falava em NFKC/NFKD; a medição deste arquivo é
 * mais dura que o relato, e é ela que vale.
 *
 * ## Por que isso não é uma vulnerabilidade hoje
 *
 * Porque nada normaliza depois da conferência. O único tratamento que o
 * endereço recebe é `normalizarEmail` (`trim` + `toLowerCase`), ele roda
 * **antes** da validação, e o caso abaixo mede que nenhuma das duas conversões
 * de caixa produz caractere proibido a partir de um que passava.
 *
 * ## Então por que este arquivo existe
 *
 * Porque "nada normaliza depois" é uma propriedade do código de hoje, e ela
 * cairia em silêncio. Um adaptador de provedor que chamasse `.normalize('NFC')`
 * ao montar o JSON do Postmark, uma coluna que normalizasse na gravação, uma
 * biblioteca de IDNA no domínio: qualquer um deles reabre o furo **sem tocar
 * numa linha da conferência**, e nenhum teste existente ficaria vermelho.
 *
 * Uma frase num comentário dizendo "não normalize depois" evapora. Estes casos
 * medem, e a obrigação está escrita em `ports/mailer.ts`, que é onde quem
 * escrever o próximo transporte vai olhar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailTemFormaValida, normalizarEmail } from './email.js';
import { motivoDaRecusaDeEndereco } from './gramatica-de-endereco.js';

const FORMAS = ['NFC', 'NFD', 'NFKC', 'NFKD'] as const;

function ponto(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Os pontos de código que a conferência **aceita** e que a normalização
 * transforma em algo que ela **recusaria**. Recalculado a cada execução a
 * partir da conferência viva, e não lido de uma lista: uma lista congelada
 * deixaria de acusar exatamente quando a classe recusada mudasse.
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
    // A garantia que protege o produto hoje, e a única que o nosso código pode
    // dar sozinho. `normalizarEmail` faz `trim` e `toLowerCase`, e roda ANTES
    // da validação: se alguma conversão de caixa produzisse `;` ou espaço a
    // partir de um caractere aceito, a ordem atual já não bastaria.
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
    // O que impede a classe de furos inteira: entre normalizar e validar não
    // existe passo nenhum, e entre validar e enviar também não. Se um dia
    // `normalizarEmail` ganhar um `.normalize()`, este caso continua válido —
    // e é o de cima que acusa se a transformação virar perigosa.
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
    // Este caso NÃO descreve um defeito nosso. Ele mantém viva a medição que
    // sustenta o aviso do `ports/mailer.ts`: no dia em que ela der zero, o
    // aviso vira folclore e alguém o apaga por parecer paranoia.
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
    // A demonstração concreta, em duas linhas, do que o aviso da porta descreve.
    const comGrego = 'tutora;x@exemplo.test';
    assert.equal(emailTemFormaValida(comGrego), true, 'o caractere grego é aceito, e isso está certo');
    assert.equal(
      emailTemFormaValida(comGrego.normalize('NFC')),
      false,
      'normalizado, o mesmo endereço carrega um separador de lista de endereços',
    );
  });
});
