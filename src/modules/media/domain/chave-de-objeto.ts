/**
 * As chaves de objeto, e por que as duas classes têm formas diferentes.
 *
 * A chave **não é detalhe de armazenamento: é parte do contrato.** O ADR-0007
 * diz isso de forma explícita ao descrever a migração para outro provedor —
 * copiar os objetos sem preservar a chave quebra *todas* as URLs de foto já
 * compartilhadas em cartaz e em conversa mediada. Um cartaz impresso e colado num
 * poste continua apontando para a chave de hoje.
 *
 * ## Privada: previsível, porque ninguém a alcança sem assinatura
 *
 * `pets/{petId}/original/{fotoId}` — legível para quem opera, e não precisa ser
 * secreta: o bucket privado nasce sem leitura anônima, e cada leitura é uma URL
 * assinada de minutos.
 *
 * ## Pública: 128 bits aleatórios, porque não há assinatura para protegê-la
 *
 * A derivada pública é servida pelo domínio de mídia com cache longo e **sem
 * assinatura** — assinar inviabilizaria o cache, que é o motivo de ela existir.
 * O que impede alguém de enumerar as fotos do produto é a chave não ser
 * adivinhável.
 *
 * `petId` e `fotoId` **não entram** na chave pública, e essa ausência é
 * deliberada: a chave viaja em cartaz, em mensagem e em página pública, e o
 * ADR-0010 item 6 proíbe identificador interno em superfície pública **sem
 * exceção**. Uma chave pública que carregasse `pets/{petId}/` entregaria o
 * `pet_id` a qualquer pessoa que clicasse com o botão direito na foto.
 */
import type { ObjectKey } from '../../../shared/types/brands.js';

/** Os únicos tipos aceitos. SVG não é aceito em nenhuma hipótese (ADR-0007). */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

export function ehTipoAceito(tipo: string): tipo is TipoAceito {
  return (TIPOS_ACEITOS as readonly string[]).includes(tipo);
}

export const TETO_DE_BYTES = 10 * 1024 * 1024;

export function chaveDoOriginal(petId: string, fotoId: string): ObjectKey {
  return `pets/${petId}/original/${fotoId}` as ObjectKey;
}

/**
 * A chave da derivada pública, a partir de 16 bytes de CSPRNG.
 *
 * Trocar a foto gera chave nova e apaga a antiga — é assim que "trocar a foto"
 * se torna visível para quem já tinha o endereço antigo, em vez de o conteúdo
 * mudar debaixo de uma URL que alguém guardou.
 */
export function chaveDaDerivada(
  variante: 'thumb' | 'card',
  aleatorio: Uint8Array,
  extensao: string,
): ObjectKey {
  const nome = Buffer.from(aleatorio).toString('base64url');
  return `${variante}/${nome}.${extensao}` as ObjectKey;
}
