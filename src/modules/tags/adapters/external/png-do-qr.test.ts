/**
 * ISCA 1: o PNG do QR decodifica de volta para o código certo.
 *
 * **Esta é a isca mais importante da BICHUS-63.** Gerar uma imagem que ninguém
 * consegue ler é o defeito mais caro que esta história pode produzir, porque ele
 * não aparece em nenhuma tela: aparece com a plaquinha prensada, na coleira de
 * um animal, quando alguém o acha na rua e o QR não resolve. E o formato
 * impresso é irreversível (ADR-0004) — a correção seria reimprimir a base
 * inteira.
 *
 * Por isso o teste **não** confere que a biblioteca foi chamada, nem que o PNG
 * tem bytes, nem que a matriz tem o tamanho esperado. Ele rasteriza o arquivo e
 * o entrega a um decodificador **independente do gerador**: `jsQR`, que
 * descende do decodificador do ZXing e não compartilha nenhuma linha com o
 * `qrcode` que escreveu o símbolo. Codificador e decodificador da mesma família
 * podem errar simetricamente e concordar no erro; estes dois não têm como.
 *
 * As provas negativas desligam algo de verdade e conferem que o decodificador
 * reprova. Elas não descrevem o desligamento numa frase: elas o executam, então
 * continuam valendo no dia em que alguém mexer no gerador.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as jsqrModulo from 'jsqr';
import sharp from 'sharp';

import type { AbsoluteUrl, TagCodeCanonical } from '../../../../shared/types/brands.js';
import {
  MODULOS_DE_MARGEM,
  PIXELS_POR_MODULO,
  desenharQr,
  type DesenhoDoQr,
} from '../../domain/qr-da-tag.js';
import { formaImpressaDoCodigo, normalizarCodigoDaTag } from '../../domain/tag-code.js';
import { urlDaTag } from '../../domain/qr-da-tag.js';
import { criarRasterizadorDeQr } from './sharp-rasterizador-de-qr.js';

/** O que se usa do decodificador: os pixels entram, o texto lido sai. */
type Decodificador = (
  pixels: Uint8ClampedArray,
  largura: number,
  altura: number,
) => { readonly data: string } | null;

/**
 * `jsqr` é CommonJS e este projeto é ESM. Sem `esModuleInterop` — que não está
 * ligado neste `tsconfig` e vale para o repositório inteiro —, o `default` do
 * namespace vem tipado como o próprio módulo, embora em tempo de execução ele
 * seja a função. A conversão é uma só, está aqui, e o tipo acima diz exatamente
 * o que o teste consome; ligar a opção do compilador por causa de uma
 * dependência de teste mexeria em toda a compilação.
 */
const jsQR = (jsqrModulo as unknown as { default: Decodificador }).default;

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
 * somam. Quem trava esse comprimento é `domain/qr-da-tag.test.ts`, junto da
 * medida que depende dele.
 */
const BASE_DA_TAG = 'https://tag.teste.inv' as AbsoluteUrl;
const CODIGO = normalizarCodigoDaTag('GQSM-0XHB-T4D9-G31S') as TagCodeCanonical;
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';

const rasterizador = criarRasterizadorDeQr();

function png(conteudo: string): Promise<Buffer> {
  return rasterizador.paraPng(desenharQr(conteudo));
}

/**
 * Decodifica um PNG como um leitor de verdade faria: rasteriza para RGBA e
 * entrega os pixels ao decodificador. Devolve `undefined` quando nenhum símbolo
 * é encontrado — que é o resultado que as provas negativas esperam.
 */
async function decodificar(arquivo: Buffer): Promise<string | undefined> {
  const { data, info } = await sharp(arquivo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lido = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return lido === null ? undefined : lido.data;
}

/**
 * O mesmo desenho com a margem de silêncio trocada. É uma reconstrução local, e
 * a localidade é o ponto: ela permite desligar UMA coisa sem deixar um
 * interruptor dentro do código de produção. Interruptor de teste em produção é
 * uma porta que alguém deixa aberta.
 */
function desenharComMargem(conteudo: string, margem: number): DesenhoDoQr {
  const original = desenharQr(conteudo);
  const lado = original.medida.modulosDoSimbolo;
  const total = (lado + 2 * margem) * PIXELS_POR_MODULO;
  const pixels = new Uint8Array(total * total).fill(255);
  const deslocamentoOriginal = MODULOS_DE_MARGEM * PIXELS_POR_MODULO;
  const deslocamentoNovo = margem * PIXELS_POR_MODULO;
  const simbolo = lado * PIXELS_POR_MODULO;

  for (let y = 0; y < simbolo; y += 1) {
    for (let x = 0; x < simbolo; x += 1) {
      const origem = (y + deslocamentoOriginal) * original.ladoEmPixels + x + deslocamentoOriginal;
      pixels[(y + deslocamentoNovo) * total + x + deslocamentoNovo] = original.pixels[origem] ?? 255;
    }
  }

  return {
    pixels,
    ladoEmPixels: total,
    densidadeEmDpi: original.densidadeEmDpi,
    medida: original.medida,
  };
}

/**
 * Põe o arquivo sobre fundo escuro, com folga em volta.
 *
 * É a plaquinha: o QR não é impresso sozinho numa folha branca infinita, ele
 * divide a arte com fundo e com a linha do código legível. Sem a margem de
 * silêncio o símbolo encosta nessa vizinhança e o leitor deixa de achar os
 * padrões de posicionamento.
 */
async function sobreFundoEscuro(arquivo: Buffer): Promise<Buffer> {
  const { width } = await sharp(arquivo).metadata();
  const lado = (width ?? 0) + 80;
  return sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: arquivo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

void describe('ISCA 1: o QR decodifica de volta para o código certo', () => {
  void it('o PNG gerado decodifica, por um leitor independente, para a URL da tag', async () => {
    // O esperado é escrito por extenso, e não com `urlDaTag`. Comparar o que
    // saiu com o que a MESMA função produziu é tautologia: ela passaria com
    // qualquer coisa que `urlDaTag` decidisse codificar, inclusive a errada.
    // Esta é a cadeia que vai virar plástico, letra por letra.
    const esperado = `${BASE_DA_TAG}/t/GQSM0XHBT4D9G31S`;
    assert.equal(esperado, urlDaTag(BASE_DA_TAG, CODIGO));

    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.equal(
      lido,
      esperado,
      'O PNG não decodificou para a URL da tag. Uma plaquinha impressa a partir ' +
        'deste arquivo não resolveria, e o formato impresso é irreversível.',
    );
  });

  void it('o código extraído do que foi decodificado é o mesmo que entrou', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.ok(lido !== undefined);
    const codigoLido = lido.slice(`${BASE_DA_TAG}/t/`.length);

    assert.equal(codigoLido, CODIGO, 'O código voltou diferente do que foi codificado.');
    // E ele continua sendo um código que a plataforma resolve: a normalização
    // da resolução aplicada ao que saiu do QR devolve o mesmo valor. Sem isto,
    // o QR poderia decodificar "certo" para uma cadeia que a resolução recusa —
    // que é o critério 9 da história, visto do outro lado.
    assert.equal(normalizarCodigoDaTag(codigoLido), CODIGO);
  });

  void it('PROVA NEGATIVA: codificar a forma impressa em vez do canônico reprova aqui', async () => {
    // O engano mais provável de quem mexer neste gerador: mandar para o QR a
    // cadeia que a pessoa lê (`XXXX-XXXX-XXXX-XXXX`) em vez da que a máquina
    // resolve. A asserção da ISCA 1 precisa acusar isso, senão ela aprova o
    // símbolo errado por ele decodificar bem.
    const certo = urlDaTag(BASE_DA_TAG, CODIGO);
    const errado = `${BASE_DA_TAG}/t/${formaImpressaDoCodigo(CODIGO)}`;

    const lido = await decodificar(await png(errado));

    assert.notEqual(
      lido,
      certo,
      'A asserção da ISCA 1 não distingue o código canônico da forma impressa.',
    );
    assert.equal(lido, errado);
  });

  void it('PROVA NEGATIVA: sem a margem de silêncio, o símbolo encostado em tinta não é lido', async () => {
    // A margem protege de UMA coisa concreta: o símbolo encostar em conteúdo
    // escuro. Sobre folha branca o leitor perdoa a falta dela (medido: `jsQR`
    // decodifica um símbolo sem margem nenhuma sobre fundo claro), e é por isso
    // que a prova reproduz a plaquinha de verdade.
    const conteudo = urlDaTag(BASE_DA_TAG, CODIGO);

    const comMargem = await sobreFundoEscuro(
      await rasterizador.paraPng(desenharComMargem(conteudo, MODULOS_DE_MARGEM)),
    );
    const semMargem = await sobreFundoEscuro(
      await rasterizador.paraPng(desenharComMargem(conteudo, 0)),
    );

    assert.equal(
      await decodificar(comMargem),
      conteudo,
      'Com a margem de silêncio o símbolo precisa ser lido mesmo encostado em tinta.',
    );
    assert.equal(
      await decodificar(semMargem),
      undefined,
      'Sem a margem de silêncio o leitor ainda decodificou sobre fundo escuro. ' +
        'Então esta isca não está medindo a margem, e `MODULOS_DE_MARGEM` poderia ' +
        'ir a zero sem que nada acusasse — até a primeira impressão.',
    );
  });

  void it('PROVA NEGATIVA: corrupção além da correção Q quebra a decodificação', async () => {
    // Medido: uma faixa de 1,5 módulo de altura é recuperada pela correção Q,
    // como deve ser. A faixa precisa ULTRAPASSAR os 25% para provar que o leitor
    // lê os módulos, em vez de devolver sempre o que se espera dele.
    const arquivo = await png(urlDaTag(BASE_DA_TAG, CODIGO));
    const { data, info } = await sharp(arquivo)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const corrompido = Buffer.from(data);
    const altura = Math.floor(info.height * 0.4);
    const inicio = Math.floor((info.height - altura) / 2);
    for (let y = inicio; y < inicio + altura; y += 1) {
      corrompido.fill(0, y * info.width * 4, (y + 1) * info.width * 4);
    }

    const lido = jsQR(new Uint8ClampedArray(corrompido), info.width, info.height);
    assert.equal(
      lido === null ? undefined : lido.data,
      undefined,
      'O leitor decodificou uma imagem corrompida além da correção de erro. ' +
        'Então ele não está lendo os módulos, e a ISCA 1 estaria aprovando ' +
        'qualquer coisa.',
    );
  });
});

void describe('ISCA 2: nenhum identificador interno entra na URL codificada', () => {
  void it('o conteúdo do QR é exatamente a URL da tag, e nada mais', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));

    assert.equal(lido, `${BASE_DA_TAG}/t/${CODIGO}`);
  });

  void it('nenhum UUID sobrevive à decodificação', async () => {
    const lido = await decodificar(await png(urlDaTag(BASE_DA_TAG, CODIGO)));
    assert.ok(lido !== undefined);

    // A busca é por FORMA, e não pelos valores conhecidos: um identificador
    // interno que ninguém pensou em listar aqui continua sendo um identificador
    // interno. `pet_id` no QR é o que o ADR-0004 nomeia como "o erro
    // irreversível deste projeto".
    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(
      formaDeUuid.test(lido),
      false,
      `O QR decodificou para '${lido}', que contém algo com forma de UUID.`,
    );
  });

  void it('PROVA NEGATIVA: com o pet na URL, a mesma conferência reprova', async () => {
    // O gerador não é capaz de produzir isto: `urlDaTag` não tem por onde
    // receber um id. A prova é da CONFERÊNCIA — ela precisa acusar quando o
    // identificador está lá, senão ela aprova por não olhar.
    const lido = await decodificar(await png(`${BASE_DA_TAG}/t/${CODIGO}?pet=${PET_ID}`));
    assert.ok(lido !== undefined);

    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(
      formaDeUuid.test(lido),
      true,
      'A conferência de UUID não acusou um UUID escrito na URL. Ela aprovaria o ' +
        'erro irreversível do ADR-0004 em silêncio.',
    );
  });
});

void describe('o arquivo, como ele chega à impressão', () => {
  void it('sai a 300 dpi, com a densidade gravada no próprio PNG', async () => {
    const meta = await sharp(await png(urlDaTag(BASE_DA_TAG, CODIGO))).metadata();

    // Sem a densidade no arquivo a impressão adivinha a escala, e o que ela
    // adivinha (72 ou 96 dpi) põe este QR acima de 85 mm — o dobro da plaquinha.
    assert.equal(meta.density, 300);
    assert.equal(meta.width, 328);
    assert.equal(meta.height, 328);
  });

  void it('PROVA NEGATIVA: um rasterizador que descarte a densidade reprova acima', async () => {
    // O modo de falha silencioso desta porta: produzir os pixels certos e
    // esquecer o `pHYs`. O arquivo abre, parece bom, e imprime no tamanho
    // errado. Esta é a diferença medida entre as duas implementações.
    const desenho = desenharQr(urlDaTag(BASE_DA_TAG, CODIGO));
    const semDensidade = await sharp(Buffer.from(desenho.pixels), {
      raw: { width: desenho.ladoEmPixels, height: desenho.ladoEmPixels, channels: 1 },
    })
      .png()
      .toBuffer();

    const meta = await sharp(semDensidade).metadata();
    assert.notEqual(
      meta.density,
      300,
      'Sem gravar a densidade o PNG ainda saiu com 300 dpi. Então o caso acima ' +
        'não está medindo nada.',
    );
    // E o arquivo sem densidade continua decodificando: o defeito é de TAMANHO
    // impresso, não de legibilidade, e é por isso que ele passaria despercebido.
    assert.equal(await decodificar(semDensidade), urlDaTag(BASE_DA_TAG, CODIGO));
  });
});
