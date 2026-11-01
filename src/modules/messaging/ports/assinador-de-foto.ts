import type { AbsoluteUrl } from '../../../shared/types/brands.js';

export type AssinadorDeFoto = (chave: string) => Promise<AbsoluteUrl>;
