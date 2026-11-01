import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { LocalizacaoDeReferencia } from '../domain/localizacao-de-referencia.js';

/** A família de refresh que identifica a sessão de um aparelho. */
export type FamiliaDeSessao = string & { readonly __familiaDeSessao: unique symbol };

/** Converte o `sid` do token, ou o `family_id` do refresh, no tipo da porta. */
export function comoFamiliaDeSessao(valor: string): FamiliaDeSessao {
  return valor as FamiliaDeSessao;
}

export interface LocalizacaoDeReferenciaRepository {
  /** Grava a localização, substituindo a anterior. */
  gravar(
    dono: UserId,
    familia: FamiliaDeSessao,
    localizacao: LocalizacaoDeReferencia,
  ): Promise<void>;

  /** A localização **ainda válida deste aparelho**, ou `null`. */
  buscarValida(
    dono: UserId,
    familia: FamiliaDeSessao,
    agora: Instant,
  ): Promise<LocalizacaoDeReferencia | null>;

  /** Apaga a linha **deste aparelho**. */
  apagar(dono: UserId, familia: FamiliaDeSessao): Promise<number>;

  /** Apaga as linhas já vencidas, em qualquer conta. */
  expurgarVencidas(agora: Instant): Promise<number>;
}
