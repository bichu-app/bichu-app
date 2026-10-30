/** Cifra de segredo em repouso. */
export interface SecretCipher {
  encrypt(plaintext: string): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<string>;
}
