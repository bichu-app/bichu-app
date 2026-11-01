import type { Instant, UserId } from '../../../shared/types/brands.js';

/** O endereço público e opaco de uma pessoa (`users.public_ref`). */
export type RefPublicoDaPessoa = string;

/** O desfecho de uma escrita que depende de o alvo existir **para quem chama**. */
export type DesfechoDaEscrita = 'feito' | 'ausente' | 'eu_mesmo';

export interface EntradaDaDenuncia {
  readonly motivo: string;
  readonly relato: string | null;
}

/** UMA LINHA DA LISTA DE QUEM EU BLOQUEEI. */
export interface PessoaQueEuBloqueei {
  readonly publicRef: RefPublicoDaPessoa;
  /** Anulável: o bloqueio é endereçado por `public_ref`, não pelo apelido. */
  readonly handle: string | null;
  readonly displayName: string | null;
  /** `user_blocks.created_at` da linha de quem chama. */
  readonly bloqueadoEm: Instant;
}

/** Uma página da lista de quem eu bloqueei. */
export interface PaginaDeBloqueios {
  readonly items: readonly PessoaQueEuBloqueei[];
  readonly total: number;
}

export interface SafetyRepository {
  /** **QUEM EU BLOQUEEI. Nunca quem me bloqueou.** */
  quemEuBloqueei(
    chamador: UserId,
    pagina: { readonly page: number; readonly limit: number },
  ): Promise<PaginaDeBloqueios>;

  /** Bloqueia, **idempotente**: bloquear de novo não cria linha e não é erro. */
  bloquear(chamador: UserId, alvo: RefPublicoDaPessoa, agora: Instant): Promise<DesfechoDaEscrita>;

  /** Desbloqueia, **idempotente**. */
  desbloquear(chamador: UserId, alvo: RefPublicoDaPessoa): Promise<DesfechoDaEscrita>;

  /** Denuncia um PERFIL. Repetir soma em `repeat_count` e não cria linha. */
  denunciarPerfil(
    chamador: UserId,
    alvo: RefPublicoDaPessoa,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;

  /** Denuncia uma FOTO, endereçada pela chave da derivada pública. */
  denunciarFoto(
    chamador: UserId,
    chaveDaFoto: string,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;

  /** Denuncia uma PUBLICAÇÃO. */
  denunciarPublicacao(
    chamador: UserId,
    refDaPublicacao: string,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;
}
