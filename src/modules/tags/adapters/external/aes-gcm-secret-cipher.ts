import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../../../shared/ports/index.js';

const ALGORITMO = 'aes-256-gcm';
const BYTES_DA_CHAVE = 32;
const BYTES_DO_IV = 12;
const BYTES_DA_ETIQUETA = 16;

export function criarSecretCipher(chave: Buffer): SecretCipher {
  if (chave.length !== BYTES_DA_CHAVE) {
    throw new Error(
      `A cifra do código da tag exige chave de ${String(BYTES_DA_CHAVE)} bytes e ` +
        `recebeu ${String(chave.length)}.`,
    );
  }

  return {
    encrypt(plaintext: string): Promise<Uint8Array> {
      const iv = randomBytes(BYTES_DO_IV);
      const cifra = createCipheriv(ALGORITMO, chave, iv);
      const cifrado = Buffer.concat([cifra.update(plaintext, 'utf8'), cifra.final()]);
      return Promise.resolve(new Uint8Array(Buffer.concat([iv, cifra.getAuthTag(), cifrado])));
    },

    decrypt(ciphertext: Uint8Array): Promise<string> {
      try {
        const bytes = Buffer.from(ciphertext);
        if (bytes.length <= BYTES_DO_IV + BYTES_DA_ETIQUETA) {
          throw new Error('Texto cifrado curto demais para conter IV e etiqueta de autenticação.');
        }
        const iv = bytes.subarray(0, BYTES_DO_IV);
        const etiqueta = bytes.subarray(BYTES_DO_IV, BYTES_DO_IV + BYTES_DA_ETIQUETA);
        const corpo = bytes.subarray(BYTES_DO_IV + BYTES_DA_ETIQUETA);

        const decifra = createDecipheriv(ALGORITMO, chave, iv);
        decifra.setAuthTag(etiqueta);
        return Promise.resolve(
          Buffer.concat([decifra.update(corpo), decifra.final()]).toString('utf8'),
        );
      } catch (erro) {
        return Promise.reject(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
  };
}
