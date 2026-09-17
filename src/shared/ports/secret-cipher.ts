/**
 * Cifra de segredo em repouso.
 *
 * Usada pelo texto cifrado do código da tag (ADR-0004), que existe apenas para
 * reimprimir o QR e é **apagado na revogação**.
 *
 * Hoje: AES-256-GCM com chave de ambiente (`SECRET_CIPHER_KEY`). Amanhã: o
 * serviço de chaves do provedor, sem que quem chama mude. É uma porta, e não
 * uma chamada direta, exatamente para que o gerenciamento de chave gerenciado
 * não vire dependência do domínio (§11.1, proibição 5).
 */
export interface SecretCipher {
  encrypt(plaintext: string): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<string>;
}
