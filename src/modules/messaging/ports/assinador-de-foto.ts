/** A assinatura da URL de leitura da foto da conversa, como a BORDA precisa dela. */
import type { AbsoluteUrl } from '../../../shared/types/brands.js';

export type AssinadorDeFoto = (chave: string) => Promise<AbsoluteUrl>;
