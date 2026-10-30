/** A porta da leitura do perfil de **outra** pessoa (fatia G). */
import type { ObjectKey, UserId } from '../../../shared/types/brands.js';

/** A pessoa, no recorte que não depende da relação com quem olha. */
export interface PessoaVisivel {
  /** A conta, **para o caso de uso perguntar a conexão e a vitrine**. */
  readonly userId: UserId;
  /** O apelido, já normalizado. */
  readonly handle: string;
  /** `users.public_ref`: o endereço opaco que denunciar e bloquear recebem. */
  readonly publicRef: string;
  /**
   * O nome de exibição, **anulável**: a coluna é anulável e 404 por falta de nome
   * faria desaparecer uma conta que existe.
   */
  readonly displayName: string | null;
  /**
   * Quantos pets, **e nada além do número** (emenda 2 do ADR-0010, decisão do
   * cliente de 19/10/2026).
   */
  readonly petsCount: number;
  /**
   * **O SELO DE VALIDADO** (emenda do ADR-0010, 21/10/2026, decisão do cliente): a
   * conta tem um canal de contato confirmado.
   */
  readonly canalVerificado: boolean;
}

/**
 * Uma foto da vitrine como o perfil de outra pessoa a entrega: **menos do que o
 * dono vê**.
 */
export interface FotoDoPerfilDeOutraPessoa {
  /** A derivada da GRADE (320 px). */
  readonly gradeKey: ObjectKey;
  /** A derivada ABERTA (1024 px), para a foto que a pessoa olha grande. */
  readonly abertaKey: ObjectKey;
  /** Rótulo de leitor de tela, **e não legenda**. */
  readonly altText: string | null;
}

export interface PerfilDePessoaRepository {
  /** A pessoa de um apelido, **se ela existe para quem olha**. */
  perfilPorApelido(apelido: string, quemOlha: UserId): Promise<PessoaVisivel | undefined>;

  /** A vitrine de `dono`, **e só quando `quemOlha` é conexão aceita dele**. */
  vitrineDeConexao(
    dono: UserId,
    quemOlha: UserId,
  ): Promise<readonly FotoDoPerfilDeOutraPessoa[]>;
}
