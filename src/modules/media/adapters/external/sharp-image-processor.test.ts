/**
 * As três fixtures de metadado do critério 20 de `BICHUS-87`.
 *
 * Foto de celular carrega GPS. GPS é **a casa do tutor**, e a derivada é
 * servida publicamente — é o vazamento mais grave que este produto pode ter, e
 * ele é invisível: a imagem aparece certinha na tela com a coordenada dentro.
 *
 * O critério pede três fixtures (GPS em EXIF, GPS em XMP, e IPTC) e que a
 * verificação **reprove** se a derivada tiver qualquer um dos três. E pede mais
 * uma coisa, que é a que dá valor às outras: *"se as fixtures não forem
 * encontradas, o job falha com o motivo"*.
 *
 * Aqui isso vira uma guarda explícita: **antes** de olhar a derivada, cada caso
 * confirma que a ENTRADA de fato carrega o metadado. Sem essa guarda, uma
 * fixture que perdesse o GPS numa mudança de biblioteca faria a suíte passar
 * provando nada — verde por ausência de alvo, que é o modo de falha que este
 * projeto persegue em todos os portões.
 *
 * A remoção não é uma lista de campos conhecidos: a imagem é **reescrita a
 * partir dos pixels** e nada é copiado. Lista de campos esquece o campo que
 * ainda não existia quando ela foi escrita.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp, { type Sharp } from 'sharp';
import { criarImageProcessor } from './sharp-image-processor.js';
import {
  ESCADA_DA_FAIXA,
  ESCADA_ENXUTA,
  FORMATO_DAS_DERIVADAS,
  TETO_DE_BYTES_DA_DERIVADA,
} from '../../domain/derivadas.js';
import type { Derivada, PedidoDeDerivada } from '../../ports/image-processor.js';

const processador = criarImageProcessor();

function base(largura = 200, altura = 150): Sharp {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 120, g: 90, b: 60 } } });
}

/** Coordenada de verdade, em São Paulo: é o que não pode sobreviver. */
const LAT = '23/1 33/1 0/1';
const LON = '46/1 38/1 0/1';

async function comGpsEmExif(): Promise<Buffer> {
  return base()
    .withExif({
      IFD0: { Software: 'Bichu' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: LAT, GPSLongitudeRef: 'W', GPSLongitude: LON },
    })
    .jpeg()
    .toBuffer();
}

async function comGpsEmXmp(): Promise<Buffer> {
  const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
    'exif:GPSLatitude="23,33.000000S" exif:GPSLongitude="46,38.000000W"/>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="r"?>';
  return base().withXmp(xmp).jpeg().toBuffer();
}

/**
 * IPTC não tem escritor no `sharp`, então o segmento é montado à mão: APP13
 * com o bloco `8BIM` de id `0x0404` e um dataset IIM de legenda.
 */
async function comIptc(): Promise<Buffer> {
  const jpeg = await base().jpeg().toBuffer();
  const dado = Buffer.from('Foto tirada em Vila Madalena, Sao Paulo');
  const iim = Buffer.concat([
    Buffer.from([0x1c, 0x02, 0x78, (dado.length >> 8) & 0xff, dado.length & 0xff]),
    dado,
  ]);
  const iimPar = iim.length % 2 === 1 ? Buffer.concat([iim, Buffer.alloc(1)]) : iim;
  const bim = Buffer.concat([
    Buffer.from('8BIM'),
    Buffer.from([0x04, 0x04]),
    Buffer.from([0x00, 0x00]),
    Buffer.from([
      (iim.length >>> 24) & 0xff,
      (iim.length >>> 16) & 0xff,
      (iim.length >>> 8) & 0xff,
      iim.length & 0xff,
    ]),
    iimPar,
  ]);
  const corpo = Buffer.concat([Buffer.from('Photoshop 3.0\0'), bim]);
  const tamanho = corpo.length + 2;
  const app13 = Buffer.concat([Buffer.from([0xff, 0xed, (tamanho >> 8) & 0xff, tamanho & 0xff]), corpo]);
  return Buffer.concat([jpeg.subarray(0, 2), app13, jpeg.subarray(2)]);
}

/** O que a derivada não pode ter, conferido de dois jeitos independentes. */
async function conferirDerivadaLimpa(derivada: Buffer, marcas: readonly string[]): Promise<void> {
  const meta = await sharp(derivada).metadata();
  assert.equal(meta.exif, undefined, 'a derivada carrega bloco EXIF');
  assert.equal(meta.xmp, undefined, 'a derivada carrega bloco XMP');
  assert.equal(meta.iptc, undefined, 'a derivada carrega bloco IPTC');

  // Segunda conferência, por bytes: se um dia o leitor de metadado mudar de
  // comportamento, a busca crua continua pegando a coordenada.
  for (const marca of marcas) {
    assert.ok(!derivada.includes(Buffer.from(marca)), `a derivada contém "${marca}"`);
  }
}


/**
 * A derivada, ou um erro de teste com o motivo.
 *
 * `derivar` passou a devolver `MotivoDeRecusa` no lugar de lançar quando o
 * decodificador não abre os pixels (o caso do HEIC sem decodificador HEVC), e
 * cada teste daqui espera uma derivada. Esta função é o lugar onde "veio motivo
 * em vez de derivada" falha nomeando o motivo, em vez de quinze `as` espalhados.
 */
async function derivada(bytes: Buffer, pedido: PedidoDeDerivada): Promise<Derivada> {
  const r = await processador.derivar(bytes, pedido);
  if (typeof r === 'string') assert.fail(`esperava derivada e veio o motivo "${r}"`);
  return r;
}

/** O pedido mais simples: largura, sem corte, escada e teto do ponto único. */
function semCorte(largura: number): PedidoDeDerivada {
  return { largura, escada: ESCADA_DA_FAIXA, tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA };
}

void describe('ISCA 1 — GPS em EXIF', () => {
  void it('a fixture REALMENTE tem EXIF, senão o teste não prova nada', async () => {
    const meta = await sharp(await comGpsEmExif()).metadata();
    assert.notEqual(meta.exif, undefined, 'fixture sem EXIF: verificação sem alvo');
  });

  void it('a derivada sai sem EXIF e sem a coordenada', async () => {
    const d = await derivada(await comGpsEmExif(), semCorte(1024));
    await conferirDerivadaLimpa(d.bytes, ['GPS', 'Bichu']);
  });
});

void describe('ISCA 2 — GPS em XMP', () => {
  void it('a fixture REALMENTE tem XMP com a coordenada', async () => {
    const bytes = await comGpsEmXmp();
    const meta = await sharp(bytes).metadata();
    assert.notEqual(meta.xmp, undefined, 'fixture sem XMP: verificação sem alvo');
    assert.ok(bytes.includes(Buffer.from('GPSLatitude')), 'fixture sem a coordenada');
  });

  void it('a derivada sai sem XMP e sem a coordenada', async () => {
    const d = await derivada(await comGpsEmXmp(), semCorte(1024));
    await conferirDerivadaLimpa(d.bytes, ['GPSLatitude', 'xmpmeta', 'adobe:ns:meta']);
  });
});

void describe('ISCA 3 — IPTC', () => {
  void it('a fixture REALMENTE tem IPTC com o texto', async () => {
    const bytes = await comIptc();
    const meta = await sharp(bytes).metadata();
    assert.notEqual(meta.iptc, undefined, 'fixture sem IPTC: verificação sem alvo');
    assert.ok(bytes.includes(Buffer.from('Vila Madalena')), 'fixture sem o texto');
  });

  void it('a derivada sai sem IPTC e sem o texto', async () => {
    const d = await derivada(await comIptc(), semCorte(1024));
    await conferirDerivadaLimpa(d.bytes, ['Vila Madalena', '8BIM', 'Photoshop 3.0']);
  });
});

void describe('inspeção: o que os bytes dizem, e o teto de 50 megapixels', () => {
  void it('devolve formato e dimensões de um JPEG de verdade', async () => {
    const r = await processador.inspecionar(await base(200, 150).jpeg().toBuffer());
    assert.deepEqual(r, { formato: 'jpeg', largura: 200, altura: 150, megapixels: 0.03 });
  });

  void it('RECUSA SVG, mesmo sendo formato que a biblioteca abre', async () => {
    // O libvips ABRE SVG. Quem recusa é a nossa lista de números mágicos, e é
    // por isso que ela vem antes da biblioteca e não depois.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    assert.equal(await processador.inspecionar(svg), 'formato_nao_aceito');
  });

  void it('RECUSA acima de 50 megapixels, sem decodificar', async () => {
    // 8000x7000 = 56 MP. O arquivo comprimido é pequeno; decodificado seriam
    // ~168 MB. É a bomba de descompressão, e ela é recusada pelo cabeçalho.
    const grande = await sharp({
      create: { width: 8000, height: 7000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg({ quality: 1 })
      .toBuffer();
    assert.equal(await processador.inspecionar(grande), 'imagem_grande_demais');
  });

  void it('RECUSA arquivo truncado em vez de entregar meia imagem', async () => {
    const jpeg = await base().jpeg().toBuffer();
    assert.equal(await processador.inspecionar(jpeg.subarray(0, 20)), 'imagem_ilegivel');
  });
});

void describe('derivação: tamanho e formato', () => {
  void it('o card cabe em 1024 px e o thumb em 176 px', async () => {
    const original = await base(2000, 1500).jpeg().toBuffer();
    const card = await derivada(original, semCorte(1024));
    const thumb = await derivada(original, semCorte(176));
    assert.equal(card.largura, 1024);
    assert.equal(thumb.largura, 176);
    // O formato é o do PONTO ÚNICO, e a asserção lê de lá de propósito: o
    // cliente pediu JPEG e pode voltar atrás, e um `'image/jpeg'` escrito aqui
    // faria a troca de uma constante reprovar um teste que não fala de formato.
    assert.equal(card.contentType, FORMATO_DAS_DERIVADAS.contentType);
    assert.equal(card.extensao, FORMATO_DAS_DERIVADAS.extensao);
  });

  void it('NÃO amplia uma foto pequena: 400 px não vira 1024 esticado', async () => {
    const pequena = await base(400, 300).jpeg().toBuffer();
    const card = await derivada(pequena, semCorte(1024));
    assert.equal(card.largura, 400, 'ampliar não acrescenta informação e triplica o arquivo');
  });

  void it('CORTA na proporção pedida quando o pedido traz altura', async () => {
    // 2000 x 1500 é 4:3; o pedido é 1 : 1,1 (retrato), a proporção da moldura.
    // Sem corte a saída sairia 4:3 e a moldura cortaria no cliente — que é o
    // que o cliente pediu para deixarmos de fazer.
    const original = await base(2000, 1500).jpeg().toBuffer();
    const d = await derivada(original, {
      largura: 1024,
      altura: 1126,
      escada: ESCADA_DA_FAIXA,
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    assert.equal(d.largura, 1024);
    assert.equal(d.altura, 1126);
  });

  void it('o original NÃO é tocado: derivar duas vezes dá o mesmo original', async () => {
    // O corte é da derivada. Se `derivar` mutasse o buffer de entrada, a
    // segunda chamada receberia a imagem já cortada — e seria assim que o
    // cachorro perderia a cabeça sem ninguém ver.
    const original = await base(2000, 1500).jpeg().toBuffer();
    const copia = Buffer.from(original);
    await derivada(original, { largura: 400, altura: 440, escada: ESCADA_ENXUTA, tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA });
    assert.ok(original.equals(copia), 'derivar mutou os bytes do original');
  });
});

void describe('a escada de qualidade, e o teto de 500 KB', () => {
  void it('cabe no teto e registra o degrau em que parou', async () => {
    const original = await base(3000, 2000).jpeg({ quality: 100 }).toBuffer();
    const d = await derivada(original, {
      largura: 1280,
      altura: 720,
      escada: ESCADA_DA_FAIXA,
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    assert.ok(
      d.bytes.length <= TETO_DE_BYTES_DA_DERIVADA,
      `derivada de ${String(d.bytes.length)} bytes acima do teto de ${String(TETO_DE_BYTES_DA_DERIVADA)}`,
    );
    assert.ok(ESCADA_DA_FAIXA.includes(d.qualidade), 'a qualidade precisa ser um degrau da escada');
    assert.equal(d.acimaDoTeto, false);
  });

  void it('PARA NO PRIMEIRO QUE CABE: a escada não desce além do necessário', async () => {
    // Um teto folgado tem de sair no PRIMEIRO degrau. Uma implementação que
    // percorresse a escada inteira entregaria a pior qualidade que cabe em vez
    // da melhor, e o teste de bytes não veria diferença.
    const original = await base(800, 600).jpeg().toBuffer();
    const d = await derivada(original, {
      largura: 320,
      altura: 352,
      escada: ESCADA_DA_FAIXA,
      tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    });
    assert.equal(d.qualidade, ESCADA_DA_FAIXA[0]);
  });

  void it('com teto impossível, entrega o último degrau e ACUSA em vez de borrar mais', async () => {
    const original = await base(2000, 1500).jpeg({ quality: 100 }).toBuffer();
    const d = await derivada(original, {
      largura: 1280,
      altura: 720,
      escada: ESCADA_DA_FAIXA,
      tetoDeBytes: 1024,
    });
    assert.equal(d.qualidade, ESCADA_DA_FAIXA[ESCADA_DA_FAIXA.length - 1]);
    assert.equal(d.acimaDoTeto, true, 'estourar o teto em silêncio é o que não pode acontecer');
  });
});

void describe('WebP animado: recusa explícita, e não o primeiro quadro em silêncio', () => {
  void it('RECUSA o WebP animado na inspeção', async () => {
    // Um WebP de VÁRIOS QUADROS. O libvips representa animação como páginas
    // empilhadas na vertical, e `pageHeight` diz onde cada quadro termina: uma
    // tira de 64 x 192 com páginas de 64 são três quadros. É a forma de
    // produzir um animado sem trazer binário de fixture para o repositório.
    const animado = await sharp({
      create: {
        width: 64,
        height: 64 * 3,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
        pageHeight: 64,
      },
    })
      .webp({ loop: 0 })
      .toBuffer();

    assert.equal(await processador.inspecionar(animado), 'imagem_animada');
  });

  void it('ACEITA o WebP parado: a recusa é da animação, não do formato', async () => {
    const parado = await base(200, 150).webp().toBuffer();
    const r = await processador.inspecionar(parado);
    assert.equal(typeof r === 'string' ? r : r.formato, 'webp');
  });
});

void describe('HEIC: o cabeçalho abre e o pixel não (medido nesta instalação)', () => {
  void it('a derivação devolve MOTIVO em vez de lançar', async () => {
    // Um HEIC de verdade não dá para gerar aqui — este `sharp` não codifica
    // HEVC. O que este teste prova é o contrato: entrada que passa a inspeção
    // e não decodifica sai como recusa FINAL, e não como exceção que a fila
    // tenta cinco vezes. O `ftypheic` com corpo inválido é o caminho mais curto
    // para esse estado.
    const falso = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    const r = await processador.derivar(falso, semCorte(1024));
    assert.equal(typeof r, 'string', 'precisa devolver motivo, nunca lançar');
  });
});
