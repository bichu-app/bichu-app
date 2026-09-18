/**
 * A cifra do código da tag.
 *
 * O caso que justifica o modo autenticado é o de adulteração, e ele é o único
 * que uma implementação em CBC passaria "funcionando": decifrar bytes trocados
 * devolveria alguma coisa, e essa alguma coisa acabaria impressa numa plaquinha.
 * Aqui ela precisa **falhar**.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criarSecretCipher } from './aes-gcm-secret-cipher.js';

const CHAVE = Buffer.alloc(32, 7);
const OUTRA_CHAVE = Buffer.alloc(32, 9);
const CODIGO = '7K2F9QJB3XR05TWD8MNCVH1234';

void describe('cifra do código da tag', () => {
  void it('decifra o que cifrou', async () => {
    const cifra = criarSecretCipher(CHAVE);
    assert.equal(await cifra.decrypt(await cifra.encrypt(CODIGO)), CODIGO);
  });

  void it('o texto cifrado não contém o código', async () => {
    const cifrado = await criarSecretCipher(CHAVE).encrypt(CODIGO);
    assert.doesNotMatch(Buffer.from(cifrado).toString('latin1'), new RegExp(CODIGO));
  });

  void it('cifrar duas vezes o mesmo código dá resultados diferentes', async () => {
    // IV novo a cada cifragem. Igual significaria IV fixo, e IV repetido em GCM
    // não vaza só o padrão: vaza a chave de autenticação.
    const cifra = criarSecretCipher(CHAVE);
    const a = Buffer.from(await cifra.encrypt(CODIGO));
    const b = Buffer.from(await cifra.encrypt(CODIGO));
    assert.equal(a.equals(b), false);
  });

  void it('recusa texto cifrado adulterado em vez de devolver bytes', async () => {
    const cifra = criarSecretCipher(CHAVE);
    const cifrado = Buffer.from(await cifra.encrypt(CODIGO));
    const ultimo = cifrado.length - 1;
    cifrado[ultimo] = (cifrado[ultimo] ?? 0) ^ 0xff;
    await assert.rejects(() => cifra.decrypt(cifrado));
  });

  void it('recusa a chave errada', async () => {
    const cifrado = await criarSecretCipher(CHAVE).encrypt(CODIGO);
    await assert.rejects(() => criarSecretCipher(OUTRA_CHAVE).decrypt(cifrado));
  });

  void it('recusa chave do tamanho errado em vez de cifrar mais fraco', () => {
    assert.throws(() => criarSecretCipher(Buffer.alloc(16, 7)), /32 bytes/);
  });

  void it('recusa texto curto demais para conter IV e etiqueta', async () => {
    await assert.rejects(() => criarSecretCipher(CHAVE).decrypt(new Uint8Array(8)));
  });
});
