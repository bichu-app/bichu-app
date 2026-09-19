/**
 * As chaves de objeto, e por que as duas classes têm formas diferentes.
 *
 * A chave **não é detalhe de armazenamento: é parte do contrato.** O ADR-0007
 * diz isso de forma explícita ao descrever a migração para outro provedor —
 * copiar os objetos sem preservar a chave quebra *todas* as URLs de foto já
 * compartilhadas em cartaz e em conversa mediada. Um cartaz impresso e colado num
 * poste continua apontando para a chave de hoje.
 *
 * ## Privada: 128 bits aleatórios também, e o critério 21 é explícito
 *
 * `pets/{petId}/original/{128 bits}`. A primeira versão deste arquivo usava o
 * UUIDv7 da intenção, e estava **errada**: UUIDv7 carrega carimbo de tempo no
 * prefixo e tem bem menos entropia que 128 bits — quem conhece o `petId` e a
 * janela de tempo enumera as chaves.
 *
 * O bucket privado não tem leitura anônima, então a chave adivinhável não abre
 * o objeto sozinha. Ela abre uma **escrita**: a política assinada restringe a
 * chave por igualdade, mas uma chave previsível é o que permite mirar o prefixo
 * de outro pet caso qualquer outra defesa ceda. O critério 21 fecha isso na
 * origem — e é pelo mesmo motivo que **nome de arquivo do cliente nunca é
 * aceito nem derivado**.
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

/**
 * O que uma DERIVADA pode ser, e por que a lista não é a da entrada.
 *
 * `TIPOS_ACEITOS` é o que o tutor pode enviar; estas duas listas são o que o
 * worker pode gravar. Elas são separadas porque a derivada não é o arquivo que
 * chegou: o critério 14 manda reescrever a imagem em WebP com alternativa
 * JPEG, então HEIC entra e nunca sai. Gravar aceitando a lista da entrada
 * permitiria escrever um `image/heic` que derivada nenhuma produz — e a lista
 * larga é justamente o que não se percebe no dia em que ela deixa de valer.
 *
 * As duas andam juntas: extensão e tipo descrevem o mesmo arquivo, e mexer em
 * uma sem mexer na outra grava `.jpg` servido como `image/webp`.
 */
export const EXTENSOES_DE_DERIVADA = ['webp', 'jpg', 'jpeg'] as const;

export type ExtensaoDeDerivada = (typeof EXTENSOES_DE_DERIVADA)[number];

export function ehExtensaoDeDerivada(extensao: string): extensao is ExtensaoDeDerivada {
  return (EXTENSOES_DE_DERIVADA as readonly string[]).includes(extensao);
}

export const TIPOS_DE_DERIVADA = ['image/webp', 'image/jpeg'] as const;

export type TipoDeDerivada = (typeof TIPOS_DE_DERIVADA)[number];

/**
 * Por IGUALDADE, nunca por prefixo — o mesmo desenho do critério 22 na entrada.
 * `startsWith('image/')` aceitaria `image/svg+xml`, que é documento com script,
 * e o domínio de mídia é separado da origem do app exatamente para conter isso.
 */
export function ehTipoDeDerivada(tipo: string): tipo is TipoDeDerivada {
  return (TIPOS_DE_DERIVADA as readonly string[]).includes(tipo);
}

export function chaveDoOriginal(petId: string, aleatorio: Uint8Array): ObjectKey {
  if (aleatorio.length < 16) {
    // Falha ruidosa: uma chave com menos entropia que o critério exige passaria
    // em todo teste de "a foto sobe" e só seria descoberta por quem a explorasse.
    throw new Error('A chave do original exige 128 bits (16 bytes) de aleatório.');
  }
  return `pets/${petId}/original/${Buffer.from(aleatorio).toString('base64url')}` as ObjectKey;
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
  // A extensão vem do adaptador de imagem e é INTERPOLADA NO CAMINHO uma linha
  // abaixo. `webp/../../../publico/card/x.webp` não é extensão mal formatada: é
  // uma chave que sai do prefixo da variante e pode atravessar do bucket
  // privado para o público. O agravante é a ordem — a assinatura V4 é calculada
  // DEPOIS desta chave existir, então a gravação sairia assinada e válida para
  // o lugar errado, e o armazenamento não teria como recusar.
  //
  // RECUSA, e não saneamento: saneando em silêncio a foto vai parar num caminho
  // que ninguém escreveu, o log registra sucesso, e a chave gravada no banco
  // deixa de ser a chave que o adaptador pediu.
  if (!ehExtensaoDeDerivada(extensao)) {
    throw new Error(
      `Extensão de derivada recusada: ${JSON.stringify(extensao)}. ` +
        `As únicas aceitas são ${EXTENSOES_DE_DERIVADA.join(', ')}.`,
    );
  }
  const nome = Buffer.from(aleatorio).toString('base64url');
  return `${variante}/${nome}.${extensao}` as ObjectKey;
}
