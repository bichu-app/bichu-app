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
  regiaoNaProporcao,
} from '../../domain/derivadas.js';
import type {
  Derivada,
  PedidoDeDerivada,
  RegiaoDoRecorte,
} from '../../ports/image-processor.js';

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

/**
 * Um WebP ANIMADO de verdade, montado chunk por chunk.
 *
 * **Por que à mão, e não pelo `sharp`.** A forma óbvia é a tira vertical —
 * `sharp({ create: { height: 64 * 3, pageHeight: 64 } }).webp()` — porque o
 * libvips representa animação como páginas empilhadas. Medido nesta instalação
 * (sharp 0.35.4, libvips 8.18.6, libwebp 1.6.0), ela **não produz animação**: a
 * saída tem 76 bytes, nenhum chunk `VP8X`/`ANIM`/`ANMF`, e `metadata()` devolve
 * 64 x 64 com `pages` ausente. O codificador escreveu um quadro só e não
 * avisou. Uma fixture assim deixa o caso vermelho sem defeito nenhum do lado
 * de cá — que é a outra metade do modo de falha que o cabeçalho deste arquivo
 * persegue: verde sem alvo, e vermelho sem culpado.
 *
 * O contêiner animado é o do formato (RIFF/WebP, seção "Animation"): `VP8X` com
 * o bit de animação, `ANIM` com cor de fundo e contagem de voltas, e um `ANMF`
 * por quadro embrulhando o bitstream. O bitstream vem do `sharp`, de um WebP
 * parado — só o contêiner é nosso, e nenhum binário entra no repositório.
 *
 * Confirmado contra o mesmo `metadata()` que a implementação lê: com este
 * arquivo ele devolve `pages: 3`.
 */
async function webpAnimado(lado = 64, quadros = 3): Promise<Buffer> {
  /** Um chunk RIFF: fourcc, tamanho em 32 bits LE, corpo, e byte de alinhamento. */
  function chunk(fourcc: string, corpo: Buffer): Buffer {
    const cabecalho = Buffer.alloc(8);
    cabecalho.write(fourcc, 0, 4, 'ascii');
    cabecalho.writeUInt32LE(corpo.length, 4);
    const alinhamento = corpo.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([cabecalho, corpo, alinhamento]);
  }

  // O bitstream de um quadro, tirado de um WebP parado que o `sharp` sabe
  // escrever: é o `VP8 ` (lossy) ou `VP8L` (lossless) de dentro do arquivo.
  const parado = await base(lado, lado).webp().toBuffer();
  let posicao = 12; // pula `RIFF<tamanho>WEBP`
  let bitstream: { fourcc: string; corpo: Buffer } | undefined;
  while (posicao + 8 <= parado.length) {
    const fourcc = parado.toString('ascii', posicao, posicao + 4);
    const tamanho = parado.readUInt32LE(posicao + 4);
    if (fourcc === 'VP8 ' || fourcc === 'VP8L') {
      bitstream = { fourcc, corpo: parado.subarray(posicao + 8, posicao + 8 + tamanho) };
      break;
    }
    posicao += 8 + tamanho + (tamanho % 2);
  }
  assert.notEqual(bitstream, undefined, 'o WebP parado não trouxe bitstream: a fixture provaria nada');

  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(0b0000_0010, 0); // o bit de ANIMAÇÃO
  vp8x.writeUIntLE(lado - 1, 4, 3); // largura do canvas, menos um
  vp8x.writeUIntLE(lado - 1, 7, 3); // altura do canvas, menos um

  const anim = Buffer.alloc(6);
  anim.writeUInt32LE(0xffff_ffff, 0); // cor de fundo
  anim.writeUInt16LE(0, 4); // voltas: infinitas

  const quadro = (): Buffer => {
    const cabecalho = Buffer.alloc(16);
    cabecalho.writeUIntLE(0, 0, 3); // deslocamento x, em pares de pixel
    cabecalho.writeUIntLE(0, 3, 3); // deslocamento y, em pares de pixel
    cabecalho.writeUIntLE(lado - 1, 6, 3);
    cabecalho.writeUIntLE(lado - 1, 9, 3);
    cabecalho.writeUIntLE(80, 12, 3); // duração do quadro, em ms
    cabecalho.writeUInt8(0, 15); // sem canal alfa, sem descarte
    return chunk('ANMF', Buffer.concat([cabecalho, chunk(bitstream!.fourcc, bitstream!.corpo)]));
  };

  const corpo = Buffer.concat([
    Buffer.from('WEBP', 'ascii'),
    chunk('VP8X', vp8x),
    chunk('ANIM', anim),
    ...Array.from({ length: quadros }, quadro),
  ]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(corpo.length, 4);
  return Buffer.concat([riff, corpo]);
}

void describe('WebP animado: recusa explícita, e não o primeiro quadro em silêncio', () => {
  void it('RECUSA o WebP animado na inspeção', async () => {
    const animado = await webpAnimado();

    // A GUARDA, na forma do resto deste arquivo: antes de cobrar a recusa,
    // confirma que a ENTRADA é de fato animada. Sem ela, uma fixture que
    // perdesse a animação faria o caso reprovar acusando a implementação.
    assert.equal((await sharp(animado).metadata()).pages, 3, 'a fixture não é animada');

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

// ===========================================================================
// O RECORTE ESCOLHIDO PELA PESSOA (cliente, 20/10/2026)
// ===========================================================================
// *"devemos implementar um recurso de ajustar a imagem antes de fazer o crop,
// pois a maioria esta cortando informacao relevante"*.
//
// O que estes casos provam, e cada um prova UMA coisa:
//
//   1. com regiao, o recorte e EXATAMENTE o retangulo pedido -- e nao o que a
//      heuristica acharia;
//   2. sem regiao, nada muda: `attention` continua decidindo, e o que ja esta
//      gravado continua saindo igual;
//   3. **a regiao e medida DEPOIS da rotacao do EXIF** -- a armadilha;
//   4. regiao impossivel e presa na borda, e nao vira excecao no worker;
//   5. a proporcao secundaria sai da regra, e nao de um segundo ajuste.

/**
 * Uma foto em RETRATO com uma marca no alto, e nada mais.
 *
 * A marca e um retangulo de cor chapada nos 25% de cima. Cor chapada de
 * proposito: o que cada caso mede e ONDE o recorte caiu, e para isso basta
 * perguntar a cor do pixel do meio -- que e uma pergunta sem ambiguidade,
 * diferente de "a imagem parece certa".
 */
async function retratoComMarcaNoAlto(): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 1000, channels: 3, background: { r: 20, g: 20, b: 200 } },
  })
    .composite([
      {
        input: {
          create: { width: 600, height: 250, channels: 3, background: { r: 230, g: 30, b: 30 } },
        },
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** A cor do pixel do meio de uma imagem. */
async function corDoMeio(bytes: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  const y = Math.floor(info.height / 2);
  const i = (y * info.width + x) * info.channels;
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
}

const ehVermelho = (c: { r: number; g: number; b: number }): boolean => c.r > 150 && c.b < 100;
const ehAzul = (c: { r: number; g: number; b: number }): boolean => c.b > 150 && c.r < 100;

function comRecorte(
  largura: number,
  altura: number,
  recorte: RegiaoDoRecorte | undefined,
): PedidoDeDerivada {
  return {
    largura,
    altura,
    escada: ESCADA_DA_FAIXA,
    tetoDeBytes: TETO_DE_BYTES_DA_DERIVADA,
    ...(recorte === undefined ? {} : { recorte }),
  };
}

void describe('o recorte escolhido pela pessoa', () => {
  void it('CONTROLE POSITIVO: a fixture tem mesmo a marca no alto e o fundo embaixo', async () => {
    // Sem isto, todos os casos abaixo poderiam estar medindo uma imagem
    // chapada e concordando por acidente.
    const bytes = await retratoComMarcaNoAlto();
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 1000);
    const alto = await sharp(bytes)
      .extract({ left: 0, top: 0, width: 600, height: 200 })
      .jpeg()
      .toBuffer();
    const baixo = await sharp(bytes)
      .extract({ left: 0, top: 700, width: 600, height: 200 })
      .jpeg()
      .toBuffer();
    assert.ok(ehVermelho(await corDoMeio(alto)), 'o alto da fixture devia ser a marca');
    assert.ok(ehAzul(await corDoMeio(baixo)), 'o baixo da fixture devia ser o fundo');
  });

  void it('com regiao no ALTO, a derivada sai da marca', async () => {
    const bytes = await retratoComMarcaNoAlto();
    // Os 20% de cima: dentro da marca.
    const d = await derivada(bytes, comRecorte(400, 225, { x: 0, y: 0, w: 1, h: 0.2 }));
    assert.ok(
      ehVermelho(await corDoMeio(d.bytes)),
      'REPROVA: a regiao pedia o alto e a derivada nao veio da marca.',
    );
  });

  void it('com regiao EMBAIXO, a mesma foto da a outra faixa', async () => {
    // A ISCA NEGATIVA do caso acima: sem ela, um adaptador que ignorasse a
    // regiao e sempre cortasse o alto passaria nos dois.
    const bytes = await retratoComMarcaNoAlto();
    const d = await derivada(bytes, comRecorte(400, 225, { x: 0, y: 0.7, w: 1, h: 0.2 }));
    assert.ok(
      ehAzul(await corDoMeio(d.bytes)),
      'REPROVA: a regiao pedia o pe da foto e a derivada nao veio dele.',
    );
  });

  void it('SEM regiao, nada muda: o corte automatico continua decidindo', async () => {
    const bytes = await retratoComMarcaNoAlto();
    const d = await derivada(bytes, comRecorte(400, 225, undefined));
    assert.equal(d.largura, 400);
    assert.equal(d.altura, 225);
  });

  // =========================================================================
  // A ARMADILHA: a regiao e medida DEPOIS da rotacao do EXIF
  // =========================================================================
  // O servidor chama `.rotate()` antes de cortar. Uma regiao medida sobre a
  // imagem ARMAZENADA, e nao sobre a imagem VISTA, sai com os eixos trocados --
  // e o resultado e um recorte plausivel da parte errada da foto, **sem erro,
  // sem log e sem nada**.
  //
  // Este caso existe porque e o defeito mais provavel de toda a mudanca, e o
  // unico que nenhum tipo pega.
  void it('ARMADILHA -- a regiao vale sobre a imagem VISTA, e nao sobre a armazenada', async () => {
    // A MESMA foto de cima, girada: os pixels ficam DEITADOS (1000 x 600) e o
    // EXIF Orientation 6 manda girar 90 graus ao mostrar. Quem olha ve de novo
    // um retrato 600 x 1000 com a marca no alto.
    const bytes = await sharp(await retratoComMarcaNoAlto())
      .rotate(270)
      // `withMetadata({ orientation })`, e NAO `withExif`. Medido nesta
      // instalacao (sharp 0.35.4 / libvips 8.18.6): `withExif({ IFD0:
      // { Orientation: '6' } })` grava o bloco e o leitor devolve
      // `orientation: 1` -- a fixture sairia sem armadilha nenhuma e o caso
      // passaria por nao ter alvo. A asercao logo abaixo existe exatamente
      // para esse engano nao passar calado.
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer();

    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 1000, 'os pixels precisam estar deitados');
    assert.equal(meta.height, 600, 'os pixels precisam estar deitados');
    assert.equal(
      meta.orientation,
      6,
      'sem o EXIF a armadilha nao existe e o caso nao prova nada',
    );

    // A pessoa viu um RETRATO e enquadrou o alto dele.
    const d = await derivada(bytes, comRecorte(400, 225, { x: 0, y: 0, w: 1, h: 0.2 }));

    assert.ok(
      ehVermelho(await corDoMeio(d.bytes)),
      'REPROVA: a regiao foi aplicada sobre a imagem ARMAZENADA, e nao sobre a ' +
        'imagem VISTA. O recorte saiu de um lugar plausivel e errado -- que e ' +
        'exatamente o defeito que nao acusa sozinho.',
    );
  });

  void it('regiao que estoura a borda e PRESA, e nao vira excecao na fila', async () => {
    // Regiao mal medida pelo cliente nao pode virar excecao: a fila entenderia
    // "culpa nossa" e tentaria cinco vezes.
    //
    // A regiao pedida comeca em 90% e tem 50% de lado: ela sai pela direita e
    // por baixo. Presa, ela vira 60 x 100 px -- o que resta ate a borda.
    //
    // **E a derivada sai MENOR que os 200 x 200 pedidos, de proposito**:
    // `withoutEnlargement` nao amplia, e ampliar 60 px para 200 nao
    // acrescentaria informacao nenhuma. Cobrar 200 aqui seria cobrar a
    // ampliacao que o resto deste arquivo existe para impedir.
    const bytes = await retratoComMarcaNoAlto();
    const d = await derivada(bytes, comRecorte(200, 200, { x: 0.9, y: 0.9, w: 0.5, h: 0.5 }));
    assert.ok(d.largura > 0 && d.altura > 0, 'a derivada precisa existir');
    assert.ok(d.largura <= 200 && d.altura <= 200, 'nao pode ter ampliado');
    // O canto de baixo e fundo, e nao a marca: a janela foi presa no lugar
    // certo, e nao reposicionada para dentro.
    assert.ok(
      ehAzul(await corDoMeio(d.bytes)),
      'REPROVA: a janela presa veio do lugar errado da foto.',
    );
  });

  void it('regiao de area zero nao derruba o worker', async () => {
    const bytes = await retratoComMarcaNoAlto();
    const r = await processador.derivar(bytes, comRecorte(200, 200, { x: 0, y: 0, w: 0, h: 0 }));
    assert.notEqual(typeof r, 'string', 'devia sair derivada, e nao motivo de recusa');
  });

  // =========================================================================
  // DENTRO do recorte da pessoa, a heuristica NAO decide de novo
  // =========================================================================
  // A regiao escolhida quase nunca tem exactamente a proporcao da derivada --
  // ela tem a proporcao PRINCIPAL, e as outras saem dela. Entao, depois do
  // `extract`, ainda sobra um corte pequeno para fechar a geometria.
  //
  // **Quem faz esse corte importa.** Com `attention`, o libvips procura de
  // novo a regiao de maior energia e desliza para FORA do que a pessoa
  // centralizou -- o mesmo defeito, agora escondido dentro do recorte dela e
  // menor, que e justamente o tipo que ninguem nota. Com `centre`, o que
  // sobra sai igual dos dois lados.
  //
  // Este caso existe porque a mutacao provou que faltava: trocar `centre` por
  // `attention` aqui passava verde nos outros casos, porque as fixtures deles
  // sao chapadas e as duas estrategias davam a mesma cor.
  void it('o corte que FECHA a geometria e centrado, e nao por energia', async () => {
    // Uma faixa com tres tercos: ruido de alto contraste a esquerda (o ima da
    // heuristica), verde no meio, azul a direita.
    const ruido = Buffer.alloc(200 * 200 * 3);
    for (let i = 0; i < ruido.length; i += 3) {
      const claro = (i / 3) % 2 === 0;
      ruido[i] = claro ? 250 : 5;
      ruido[i + 1] = claro ? 250 : 5;
      ruido[i + 2] = claro ? 250 : 5;
    }
    const faixa = await sharp({
      create: { width: 600, height: 200, channels: 3, background: { r: 20, g: 200, b: 20 } },
    })
      .composite([
        { input: ruido, raw: { width: 200, height: 200, channels: 3 }, top: 0, left: 0 },
        {
          input: {
            create: { width: 200, height: 200, channels: 3, background: { r: 20, g: 20, b: 220 } },
          },
          top: 0,
          left: 400,
        },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();

    // A faixa colada no meio de um retrato 600 x 1000.
    const bytes = await sharp({
      create: { width: 600, height: 1000, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .composite([{ input: faixa, top: 400, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // A pessoa enquadrou a FAIXA INTEIRA (600 x 200, ou 3:1). A derivada e
    // 100 x 200 (1:2), bem mais estreita: sobra muito corte horizontal para
    // fechar -- e e nele que a heuristica decidiria de novo.
    const d = await derivada(bytes, comRecorte(100, 200, { x: 0, y: 0.4, w: 1, h: 0.2 }));

    const c = await corDoMeio(d.bytes);
    const ehVerde = c.g > 150 && c.r < 100 && c.b < 100;
    assert.ok(
      ehVerde,
      'REPROVA: o corte que fecha a geometria nao foi centrado. A heuristica ' +
        'escolheu de novo DENTRO do recorte da pessoa e deslizou para o ruido ' +
        `de alto contraste. Cor do meio: ${JSON.stringify(c)}`,
    );
  });
});


void describe('a proporcao secundaria sai da regiao, sem segundo ajuste', () => {
  // O original do exemplo e 600 x 1000.
  const proporcaoDoOriginal = 600 / 1000;

  void it('o centro da regiao NAO anda', () => {
    const escolhida: RegiaoDoRecorte = { x: 0, y: 0.3, w: 1, h: 0.3375 };
    const alvo = regiaoNaProporcao(escolhida, 4 / 3, proporcaoDoOriginal);
    const centroY = (r: RegiaoDoRecorte): number => r.y + r.h / 2;
    assert.ok(
      Math.abs(centroY(alvo) - centroY(escolhida)) < 1e-9,
      'o centro da regiao derivada andou',
    );
  });

  void it('ALARGA, e nunca encolhe o lado que ja estava certo', () => {
    const escolhida: RegiaoDoRecorte = { x: 0.1, y: 0.4, w: 0.8, h: 0.27 };
    const alvo = regiaoNaProporcao(escolhida, 1, proporcaoDoOriginal);
    assert.ok(alvo.w >= escolhida.w - 1e-9, 'a largura encolheu');
    assert.ok(alvo.h >= escolhida.h - 1e-9, 'a altura encolheu');
  });

  void it('regiao que nao cabe e PRESA dentro do original, e a proporcao fecha', () => {
    const escolhida: RegiaoDoRecorte = { x: 0, y: 0, w: 1, h: 1 };
    const alvo = regiaoNaProporcao(escolhida, 16 / 9, proporcaoDoOriginal);
    assert.ok(alvo.x >= -1e-9 && alvo.y >= -1e-9, 'saiu da borda');
    assert.ok(alvo.x + alvo.w <= 1 + 1e-9, 'passou da direita');
    assert.ok(alvo.y + alvo.h <= 1 + 1e-9, 'passou de baixo');
  });
});
