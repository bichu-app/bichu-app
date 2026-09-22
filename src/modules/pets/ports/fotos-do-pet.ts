/**
 * O que o cadastro precisa saber sobre foto, e **nada além**.
 *
 * A porta é declarada aqui, do lado de quem consome, e não importada de
 * `media/ports/`. São três linhas de interface contra um acoplamento: o cadastro
 * não precisa conhecer intenção de envio, chave de objeto, bucket nem
 * armazenamento — ele precisa responder "esta ficha tem foto, e em que estado".
 *
 * Quem satisfaz esta porta é o repositório de mídia, e a ligação entre os dois
 * acontece em `bin/api.ts`, que é o único lugar do sistema que conhece os dois
 * lados. O dia em que a foto vier de outro serviço, muda a linha da fiação.
 *
 * A leitura é **em lote, por lista de pets**, e isso não é otimização
 * prematura: `listMyPets` devolve a lista inteira do tutor, e uma consulta por
 * pet transformaria a tela inicial em N+1 no caminho mais percorrido do app.
 */
import type { PetId } from '../../../shared/types/brands.js';

export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

/** A foto como a ficha do pet a mostra. Sem chave, sem bucket, sem intenção. */
export interface FotoResumida {
  readonly id: string;
  readonly status: StatusDaFoto;
  readonly isPrimary: boolean;
  /** Nulas enquanto o worker não gerou as derivadas. Ausência é o valor honesto. */
  readonly thumbUrl: string | null;
  readonly cardUrl: string | null;
  readonly createdAt: Date;
}

export interface FotosDoPet {
  /** Mapa de `petId` para as fotos dele. Pet sem foto simplesmente não aparece. */
  porPets(pets: readonly PetId[]): Promise<ReadonlyMap<string, readonly FotoResumida[]>>;
}
