/**
 * Porta da leitura do perfil público do pet, pelo endereço (`/@{slug}`).
 *
 * Mesma regra da leitura pública do caso: a interface não tem onde carregar
 * `id`, `owner_user_id`, telefone, e-mail nem endereço, porque nenhum desses
 * campos pertence ao perfil público (`PublicPetProfile` no contrato). O jeito
 * mais barato de um dado não vazar é ele não chegar até a rota.
 *
 * A porta devolve `undefined` para quatro casos que respondem igual (404):
 * slug que não existe, perfil desligado pelo tutor, pet excluído e pet falecido
 * ou arquivado. O contrato manda o perfil desligado responder 404, e os outros
 * três seguem o mesmo caminho para não contar a um estranho o que aconteceu com
 * o animal.
 */
export type EspecieDoPerfil = 'dog' | 'cat' | 'other';
export type PorteDoPerfil = 'P' | 'M' | 'G' | 'GG';

export interface PerfilPublicoDoPet {
  readonly slug: string;
  readonly nome: string;
  readonly especie: EspecieDoPerfil;
  readonly porte: PorteDoPerfil;
  /** Rótulo da lista quando há código; o texto do tutor quando não há. */
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  readonly marcas: string | null;
  /** Chave da derivada `card` da foto principal pronta. Nula sem foto pronta. */
  readonly chaveDaFoto: string | null;
  /** Há caso de perdido ABERTO para este pet. */
  readonly estaPerdido: boolean;
}

export interface LeituraDoPerfilPublico {
  porSlug(slug: string): Promise<PerfilPublicoDoPet | undefined>;
}
