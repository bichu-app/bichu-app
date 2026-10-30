export type FormatoReal = 'jpeg' | 'png' | 'webp' | 'heic';

/**
 * Cada assinatura é `{ deslocamento, bytes }`, porque nem todo formato começa no
 * byte zero: HEIC e o `ftyp` do contêiner ISO-BMFF começam no byte 4.
 */
interface Assinatura {
  readonly formato: FormatoReal;
  readonly deslocamento: number;
  readonly bytes: readonly number[];
  /** Conferência extra depois da assinatura, quando ela não basta. */
  readonly confirma?: (b: Buffer) => boolean;
}

const ASSINATURAS: readonly Assinatura[] = [
  { formato: 'jpeg', deslocamento: 0, bytes: [0xff, 0xd8, 0xff] },
  { formato: 'png', deslocamento: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    formato: 'webp',
    deslocamento: 0,
    bytes: [0x52, 0x49, 0x46, 0x46],
    confirma: (b) => b.length >= 12 && b.toString('ascii', 8, 12) === 'WEBP',
  },
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
