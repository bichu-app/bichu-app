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

  /**
   * **A PRÓPRIA VITRINE, quando o perfil pedido é o de quem está olhando**
   * (decisão do cliente de 03/11/2026, *"pode corrigir isso também"*).
   *
   * Ela existe porque [vitrineDeConexao] exige aresta `accepted` no `WHERE` e
   * **ninguém tem aresta consigo mesmo**: no próprio perfil a vitrine vinha
   * vazia, e a tela lia "vazia" como "você não é conexão dela" e dizia a frase
   * de estranho sobre as fotos de quem estava olhando.
   *
   * **A ASSINATURA É A DEFESA, e por isso ela recebe UM id só.** Ela não aceita
   * um `dono` separado de um `quemOlha`, então **não existe forma de pedir por
   * ela a vitrine de terceiro** -- a pior coisa que uma chamada errada pode
   * fazer é devolver as fotos de quem chamou, que ele já pode ver. A variante
   * `(dono, quemOlha)` com um booleano de dispensa seria a forma que vaza.
   *
   * **QUEM DECIDE QUAL DAS DUAS CHAMAR NÃO É ELA.** A decisão é a comparação
   * única de `PerfilDePessoa.porApelido`, e escrever aqui um segundo
   * `dono === quemOlha` seria a segunda noção de "sou eu" -- a classe de
   * defeito que o predicado da audiência do Mural já pagou em quatro cópias.
   */
  vitrinePropria(quemOlha: UserId): Promise<readonly FotoDoPerfilDeOutraPessoa[]>;
}
