/**
 * Cifra de segredo em repouso: AES-256-GCM com chave de ambiente.
 *
 * Implementa a porta `SecretCipher` (shared/ports). O único segredo que passa
 * por aqui hoje é o código da tag, e ele tem um uso e um só: **reimprimir o QR**
 * (ADR-0004). A resolução nunca decifra nada — ela busca pelo `code_hash`.
 *
 * GCM e não CBC: o modo autenticado recusa texto cifrado adulterado em vez de
 * devolver bytes que parecem um código. Sem isso, quem conseguisse escrever na
 * coluna conseguiria escolher o que sai na reimpressão.
 *
 * O formato gravado é `iv (12) || tag (16) || cifrado`, nesta ordem e sem
 * cabeçalho de versão. Formato é decisão de hoje, e trocá-lo exigirá migrar as
 * linhas existentes; o valor não é recuperável de outro lugar, então o campo
 * de versão entra quando houver a segunda cifra, e não antes — byte
 * especulativo em coluna é o que ninguém remove depois.
 *
 * A chave vive em `TAG_CODE_KEY`, 32 bytes em hexadecimal. Amanhã ela vem do
 * serviço de chaves do provedor sem que nada acima desta camada mude, que é o
 * motivo de a porta existir.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../../../shared/ports/index.js';

const ALGORITMO = 'aes-256-gcm';
const BYTES_DA_CHAVE = 32;
const BYTES_DO_IV = 12;
const BYTES_DA_ETIQUETA = 16;

export function criarSecretCipher(chave: Buffer): SecretCipher {
  // A configuração já recusa a subida com chave do tamanho errado. A conferência
  // aqui é a que vale para quem construir a cifra por outro caminho — teste,
  // script, um segundo ponto de entrada —, e ela custa uma comparação.
  if (chave.length !== BYTES_DA_CHAVE) {
    throw new Error(
      `A cifra do código da tag exige chave de ${String(BYTES_DA_CHAVE)} bytes e ` +
        `recebeu ${String(chave.length)}.`,
    );
  }

  return {
    encrypt(plaintext: string): Promise<Uint8Array> {
      // IV novo a cada cifragem. Reaproveitar IV em GCM não vaza só o padrão:
      // vaza a chave de autenticação, e aí a cifra deixa de ser cifra.
      const iv = randomBytes(BYTES_DO_IV);
      const cifra = createCipheriv(ALGORITMO, chave, iv);
      const cifrado = Buffer.concat([cifra.update(plaintext, 'utf8'), cifra.final()]);
      return Promise.resolve(new Uint8Array(Buffer.concat([iv, cifra.getAuthTag(), cifrado])));
    },

    /**
     * A falha sai como **promessa rejeitada**, nunca como exceção síncrona.
     *
     * A porta declara `Promise<string>`, e função que promete devolver promessa
     * e lança antes de devolvê-la quebra quem trata o erro com `.catch()`: o
     * `catch` nunca chega a ser instalado. Quem usa `await` não percebe a
     * diferença, e é por isso que ela passa despercebida até o primeiro chamador
     * que não usa.
     */
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
        // `final()` lança quando a etiqueta não confere, e é isso que separa GCM
        // de CBC aqui: devolver texto não autenticado faria bytes trocados
        // virarem um código impresso numa plaquinha.
        return Promise.resolve(
          Buffer.concat([decifra.update(corpo), decifra.final()]).toString('utf8'),
        );
      } catch (erro) {
        return Promise.reject(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
  };
}
