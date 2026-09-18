/**
 * O que os BYTES dizem que o arquivo é.
 *
 * O critério 14 de `BICHUS-87` é literal: *"valida os bytes reais por números
 * mágicos e **nunca** o `Content-Type` declarado"*. O tipo declarado é escolhido
 * por quem envia, e quem envia pode ser qualquer pessoa com uma autorização de
 * upload — inclusive alguém que declara `image/jpeg` e envia um HTML.
 *
 * Isto é escrito à mão, e não delegado à biblioteca de imagem, de propósito:
 * é um controle de segurança, e controle de segurança que mora dentro de
 * dependência de terceiro muda de comportamento numa atualização de versão que
 * ninguém leu. Aqui ele é quinze linhas auditáveis.
 *
 * **SVG não aparece nesta lista, e a ausência é a regra** (critério 15, ADR-0007):
 * SVG é um documento com script, não uma imagem. Servido do domínio de mídia ele
 * não alcança a sessão, mas continua sendo página executável hospedada por nós,
 * e é assim que ele entraria: declarado como `image/svg+xml`, que "parece" uma
 * imagem para qualquer lista feita por analogia de nome.
 */

export type FormatoReal = 'jpeg' | 'png' | 'webp' | 'heic';

/**
 * Cada assinatura é `{ deslocamento, bytes }`, porque nem todo formato começa
 * no byte zero: HEIC e o `ftyp` do contêiner ISO-BMFF começam no byte 4.
 */
interface Assinatura {
  readonly formato: FormatoReal;
  readonly deslocamento: number;
  readonly bytes: readonly number[];
  /** Conferência extra depois da assinatura, quando ela não basta. */
  readonly confirma?: (b: Buffer) => boolean;
}

const ASSINATURAS: readonly Assinatura[] = [
  // JPEG: SOI. Não há variante.
  { formato: 'jpeg', deslocamento: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG: assinatura de 8 bytes, incluindo o CRLF que detecta transferência
  // corrompida por modo texto.
  { formato: 'png', deslocamento: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: contêiner RIFF, e o que decide é o `WEBP` no byte 8 — sem ele, um
  // RIFF é um .wav.
  {
    formato: 'webp',
    deslocamento: 0,
    bytes: [0x52, 0x49, 0x46, 0x46],
    confirma: (b) => b.length >= 12 && b.toString('ascii', 8, 12) === 'WEBP',
  },
  // HEIC: `ftyp` no byte 4, e a marca do byte 8 diz qual variante. `mif1` e
  // `msf1` entram porque é o que a câmera do iPhone produz de verdade.
  {
    formato: 'heic',
    deslocamento: 4,
    bytes: [0x66, 0x74, 0x79, 0x70],
    confirma: (b) =>
      b.length >= 12 && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(
        b.toString('ascii', 8, 12),
      ),
  },
];

/** `null` quando os bytes não são nenhum formato aceito. */
export function formatoRealDe(bytes: Buffer): FormatoReal | null {
  for (const a of ASSINATURAS) {
    const fim = a.deslocamento + a.bytes.length;
    if (bytes.length < fim) continue;
    let bate = true;
    for (let i = 0; i < a.bytes.length; i += 1) {
      if (bytes[a.deslocamento + i] !== a.bytes[i]) {
        bate = false;
        break;
      }
    }
    if (!bate) continue;
    if (a.confirma !== undefined && !a.confirma(bytes)) continue;
    return a.formato;
  }
  return null;
}
