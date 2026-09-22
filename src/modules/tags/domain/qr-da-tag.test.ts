/**
 * O desenho do QR, e a medida que ele terá no papel.
 *
 * Este arquivo prova o que o **domínio** decide, e por isso não carrega
 * biblioteca de imagem nenhuma: as decisões que viram plástico — nível de
 * correção, margem de silêncio, escala, o que cabe na plaquinha — são
 * aritmética sobre a matriz do símbolo, e se provam sem rasterizar nada.
 *
 * **A prova de que o arquivo decodifica de volta está em
 * `adapters/external/png-do-qr.test.ts`**, onde a rasterização mora. Ela é a
 * isca mais importante desta história, e a separação é da arquitetura (§11.1
 * mantém `sharp` fora de `domain/`), não uma escolha de conveniência.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AbsoluteUrl, TagCodeCanonical } from '../../../shared/types/brands.js';
import {
  LARGURA_UTIL_DA_PLAQUINHA_EM_MM,
  MODULOS_DE_MARGEM,
  MODULO_MINIMO_EM_MM,
  PIXELS_POR_MODULO,
  RESOLUCAO_EM_DPI,
  desenharQr,
  medidaImpressa,
  urlDaTag,
} from './qr-da-tag.js';
import { formaImpressaDoCodigo, normalizarCodigoDaTag } from './tag-code.js';

/**
 * A base da tag nos testes: o **tamanho** da base de produção, não o nome dela.
 *
 * O portão de portabilidade recusa host de produção literal no código, e tem
 * razão — quem fixa o endereço é `TAG_BASE_URL`, nunca uma constante. Mas a
 * medida que a BICHUS-103 pede depende do **comprimento** do payload, e não do
 * nome do host: é ele que decide a versão do símbolo e, por consequência, quanto
 * o QR ocupa na plaquinha.
 *
 * Então a base daqui tem exatamente os 21 caracteres que `https://` mais o host
 * público da tag de hoje (`tag.` mais o domínio de cinco letras mais `.app`)
 * somam. O caso abaixo trava esse comprimento: encurtar ou alongar esta
 * constante reprova, porque passaria a medir outra plaquinha.
 */
const COMPRIMENTO_DA_BASE_DE_PRODUCAO = 21;
const BASE_DA_TAG = 'https://tag.teste.inv' as AbsoluteUrl;

/** Código de 16 caracteres com símbolo de verificação válido (BICHUS-154). */
const CODIGO = normalizarCodigoDaTag('GQSM-0XHB-T4D9-G31S') as TagCodeCanonical;

void describe('urlDaTag: uma função só para o QR e para o texto legível', () => {
  void it('monta `{base}/t/{código canônico}`, sem os hífens da forma impressa', () => {
    const url = urlDaTag(BASE_DA_TAG, CODIGO);

    assert.equal(url, `${BASE_DA_TAG}/t/${CODIGO}`);
    // O agrupado é para a pessoa ler; o canônico é o que a máquina resolve.
    // Trocar um pelo outro aqui muda o payload e a versão do símbolo, e isso
    // só apareceria depois de prensado.
    assert.equal(url.includes(formaImpressaDoCodigo(CODIGO)), false);
    assert.equal(url.endsWith(CODIGO), true);
  });

  void it('não há espaço por onde um identificador interno entrar', () => {
    // A assinatura é a garantia: `urlDaTag` recebe a base e o código, e nada
    // mais. `pet_id` no QR é o que o ADR-0004 nomeia como "o erro irreversível
    // deste projeto", e ele não é exprimível por esta função.
    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(formaDeUuid.test(urlDaTag(BASE_DA_TAG, CODIGO)), false);
  });
});

void describe('a medida impressa, contra a plaquinha da BICHUS-103', () => {
  void it('a base desta bancada tem o comprimento da base de produção', () => {
    // Sem este caso, alguém encurta a base do teste, a versão do símbolo cai
    // para 3, todos os números abaixo mudam junto, e a suíte fica verde medindo
    // uma plaquinha que não existe. É o modo exato de uma medida travada
    // deixar de travar coisa nenhuma.
    assert.equal(BASE_DA_TAG.length, COMPRIMENTO_DA_BASE_DE_PRODUCAO);
  });

  void it('com 16 caracteres o símbolo cabe nos 44 mm úteis, e a medida fica escrita', () => {
    const medida = medidaImpressa(urlDaTag(BASE_DA_TAG, CODIGO));

    // Estes números são a resposta que a BICHUS-103 pede, e ficam travados
    // aqui: mexer no gerador, na escala ou na base sem refazer a conta reprova.
    //
    // A base (21) mais `/t/` (3) mais 16 = 40 bytes. A Emenda 1 do ADR-0004
    // calculou 28 bytes supondo a forma sem esquema (`bichu.app/t/`), que é a
    // que vai IMPRESSA em texto; o QR leva a URL absoluta, porque leitor de
    // câmera precisa do esquema para abrir o endereço. Com 40 bytes o símbolo
    // sai na versão 4 em vez da 3, e continua cabendo com folga.
    assert.equal(medida.bytesDoPayload, 40);
    assert.equal(medida.versao, 4);
    assert.equal(medida.modulosDoSimbolo, 33);
    assert.equal(medida.modulosComMargem, 33 + 2 * MODULOS_DE_MARGEM);
    assert.equal(medida.ladoEmPixels, 41 * PIXELS_POR_MODULO);

    assert.equal(medida.ladoEmMilimetros.toFixed(2), '27.77');
    assert.equal(medida.moduloEmMilimetros.toFixed(3), '0.677');
    assert.ok(
      medida.ladoEmMilimetros < LARGURA_UTIL_DA_PLAQUINHA_EM_MM,
      `O QR mede ${medida.ladoEmMilimetros.toFixed(2)} mm e não cabe nos ` +
        `${String(LARGURA_UTIL_DA_PLAQUINHA_EM_MM)} mm úteis.`,
    );
    assert.ok(medida.moduloEmMilimetros > MODULO_MINIMO_EM_MM);
  });

  void it('sobra largura para o que mais for impresso ao lado do QR', () => {
    const medida = medidaImpressa(urlDaTag(BASE_DA_TAG, CODIGO));
    const sobra = LARGURA_UTIL_DA_PLAQUINHA_EM_MM - medida.ladoEmMilimetros;

    // 16,23 mm. Quem compuser a folha impressa (a linha `bichu.app/t/…` e o
    // código agrupado) tem esta medida como orçamento, e ela está aqui para não
    // precisar ser recalculada de memória.
    assert.equal(sobra.toFixed(2), '16.23');
  });

  void it('PROVA NEGATIVA: uma base longa demais recusa o desenho em vez de produzi-lo', () => {
    // `TAG_BASE_URL` é variável de ambiente. Uma base longa empurra o símbolo
    // para uma versão que não cabe na plaquinha, e isso não apareceria em tela
    // nenhuma: apareceria na guilhotina.
    const baseLonga = `https://${'t'.repeat(180)}.exemplo.invalid` as AbsoluteUrl;

    assert.throws(
      () => desenharQr(urlDaTag(baseLonga, CODIGO)),
      /44 mm úteis/u,
      'Uma base que estoura a plaquinha precisa recusar, e não produzir um ' +
        'desenho que sai cortado da impressão.',
    );
  });

  void it('PROVA NEGATIVA: a mesma base longa é medível — quem reprova é a guarda', () => {
    // A guarda acusa; a medida em si não. Isto separa as duas coisas e mostra
    // que a reprovação acima vem da conferência, e não de o gerador falhar
    // sozinho, que é o modo de uma prova negativa passar a valer por engano.
    const baseLonga = `https://${'t'.repeat(180)}.exemplo.invalid` as AbsoluteUrl;
    const medida = medidaImpressa(urlDaTag(baseLonga, CODIGO));

    assert.ok(medida.versao > 4);
    assert.ok(medida.ladoEmMilimetros > LARGURA_UTIL_DA_PLAQUINHA_EM_MM);
  });
});

void describe('desenharQr: o mapa de pixels que atravessa a porta', () => {
  void it('tem o lado da medida, a densidade de impressão e dois valores só', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));

    assert.equal(desenho.ladoEmPixels, desenho.medida.ladoEmPixels);
    assert.equal(desenho.pixels.length, desenho.ladoEmPixels ** 2);
    assert.equal(desenho.densidadeEmDpi, RESOLUCAO_EM_DPI);

    // Sem meio-tom. Antisserrilhado na fronteira do módulo é o que faz
    // impressão barata borrar o limiar e o leitor errar.
    assert.deepEqual([...new Set(desenho.pixels)].sort((a, b) => a - b), [0, 255]);
  });

  void it('a margem de silêncio está pintada de claro, nas quatro bordas', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const lado = desenho.ladoEmPixels;
    const margem = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;

    const claro = (x: number, y: number): boolean => desenho.pixels[y * lado + x] === 255;

    for (let i = 0; i < lado; i += 1) {
      for (let d = 0; d < margem; d += 1) {
        assert.ok(claro(i, d), `topo escuro em (${String(i)}, ${String(d)})`);
        assert.ok(claro(i, lado - 1 - d), `base escura em (${String(i)}, ${String(d)})`);
        assert.ok(claro(d, i), `esquerda escura em (${String(d)}, ${String(i)})`);
        assert.ok(claro(lado - 1 - d, i), `direita escura em (${String(d)}, ${String(i)})`);
      }
    }
  });

  void it('cada módulo escuro é um bloco inteiro, e não um pixel solto', () => {
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const lado = desenho.ladoEmPixels;

    // O padrão de posicionamento superior esquerdo começa logo após a margem e
    // é escuro na borda externa. Basta conferir o canto: com a escala errada,
    // ele não seria um bloco de `PIXELS_POR_MODULO` pixels cheios.
    const inicio = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;
    for (let dy = 0; dy < PIXELS_POR_MODULO; dy += 1) {
      for (let dx = 0; dx < PIXELS_POR_MODULO; dx += 1) {
        assert.equal(desenho.pixels[(inicio + dy) * lado + inicio + dx], 0);
      }
    }
    // E o pixel imediatamente antes dele é claro: a margem termina exatamente ali.
    assert.equal(desenho.pixels[(inicio - 1) * lado + inicio - 1], 255);
  });
});
