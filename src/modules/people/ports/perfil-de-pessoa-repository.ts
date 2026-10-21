/**
 * A porta da leitura do perfil de **outra** pessoa (fatia G).
 *
 * ## Toda autorização é a cláusula `WHERE` (ADR-0021)
 *
 * Os dois métodos recebem **quem olha** como argumento obrigatório, e nenhum
 * deles tem uma variante sem ele. A consulta que devolveria o perfil de uma
 * conta desabilitada, de um par bloqueado ou de um perfil que quem olha
 * denunciou **não existe deste lado da porta** — e é essa ausência, e não um
 * `if` numa camada acima, que faz o 404 valer em todo caminho novo.
 *
 * O mesmo vale, com mais peso, para [vitrineDeConexao]: ela recebe o dono **e**
 * quem olha, e o predicado de conexão aceita está no `WHERE` da própria
 * consulta das fotos. Pedir `listar(dono)` de `showcase/ports` e decidir aqui
 * em cima quem pode ver seria a segunda cópia da regra — e a segunda é a que
 * alguém esquece de repetir na terceira rota.
 *
 * ## O que esta porta NÃO oferece, e não pode ganhar
 *
 * - **Nenhuma busca, nenhuma listagem, nenhuma coleção de pessoas.** O
 *   argumento é **um** apelido, que quem chama já tem na mão, e a resposta é no
 *   máximo **uma** pessoa. Não existe rota de disponibilidade de apelido (plano
 *   4-C.5) e a descoberta por link está morta (plano 4-B.1).
 * - **Nenhum atributo de pet.** [PessoaVisivel] carrega `petsCount` e mais
 *   nada: não há campo de nome, de slug, de espécie nem de foto de pet, e por
 *   isso não há como a projeção vazar um sem alguém **acrescentar campo aqui**.
 *   É a emenda 2 do ADR-0010 escrita no tipo: o item 7 abriu a contagem, e a
 *   contagem é o que o tipo sabe dizer.
 * - **Nenhuma lista de conexões.** `connectionsCount` é número, e a contagem
 *   vem de `connections/ports/conexao.ts`, onde a lista também não existe.
 * - **Nenhum `UserId` em saída pública.** `userId` sai daqui porque quem
 *   consome é o caso de uso, que o usa para perguntar a conexão ao módulo
 *   vizinho; ele **não atravessa a borda HTTP** — o que sai é o apelido e
 *   `publicRef`.
 * - **Nenhuma escrita.** Não há método que grave, e o perfil de outra pessoa
 *   não é editável por ninguém além dela.
 */
import type { ObjectKey, UserId } from '../../../shared/types/brands.js';

/** A pessoa, no recorte que não depende da relação com quem olha. */
export interface PessoaVisivel {
  /**
   * A conta, **para o caso de uso perguntar a conexão e a vitrine**. Não sai em
   * resposta nenhuma: o ADR-0010 item 6 proíbe UUID em saída, e os portões
   * `portao-colunas-que-nao-saem` e `portao-contrato-publico` cobram isso.
   */
  readonly userId: UserId;
  /** O apelido, já normalizado. É o identificador público da pessoa. */
  readonly handle: string;
  /** `users.public_ref`: o endereço opaco que denunciar e bloquear recebem. */
  readonly publicRef: string;
  /**
   * O nome de exibição, **anulável**: a coluna é anulável e 404 por falta de
   * nome faria desaparecer uma conta que existe. Quem desenha cai para
   * `@handle`.
   */
  readonly displayName: string | null;
  /**
   * Quantos pets, **e nada além do número** (emenda 2 do ADR-0010, decisão do
   * cliente de 19/10/2026). Conta pet não apagado.
   */
  readonly petsCount: number;
  /**
   * **O SELO DE VALIDADO** (emenda do ADR-0010, 21/10/2026, decisão do
   * cliente): a conta tem um canal de contato confirmado.
   *
   * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`, a **MESMA**
   * régua dos quatro `409 contact-channel-unverified`. Duas definições de
   * "validado" seriam duas réguas, e a mesma conta sairia validada numa tela e
   * não na outra. **Na prática é e-mail**: nada em `src/` grava
   * `phone_verified_at`.
   *
   * **Não anulável** — a conta ou confirmou um canal ou não confirmou, e um
   * terceiro estado faria a tela escolher um lado. **Só o booleano**: nem o
   * endereço, nem a data, nem qual dos dois canais.
   *
   * **Sai nos quatro estados de conexão**, ao contrário da vitrine: o selo é
   * atributo da conta e não conteúdo que a pessoa publicou para quem aceitou.
   */
  readonly canalVerificado: boolean;
}

/**
 * Uma foto da vitrine como o perfil de outra pessoa a entrega: **menos do que o
 * dono vê**.
 *
 * Sem `status`, sem `rejectionReason`, sem `position` e sem `uploadId`. Os dois
 * primeiros são estado de moderação da vitrine do dono — motivo de recusa é
 * assunto entre o dono e quem modera — e os dois últimos são de edição, que só
 * o dono faz. Foto que não está `ready` **não entra na lista**: a consulta a
 * recusa no `WHERE`, então não há estado a desenhar, e a ordem é a da resposta.
 *
 * As duas chaves não são anuláveis aqui, ao contrário de `FotoDaVitrine`: foto
 * em `processing` carrega o EXIF do celular, e servi-la a um terceiro
 * entregaria a coordenada de onde ela foi tirada (ADR-0010 item 4).
 */
export interface FotoDoPerfilDeOutraPessoa {
  /** A derivada da GRADE (320 px). É ela que a grade pede, nunca a aberta. */
  readonly gradeKey: ObjectKey;
  /** A derivada ABERTA (1024 px), para a foto que a pessoa olha grande. */
  readonly abertaKey: ObjectKey;
  /** Rótulo de leitor de tela, **e não legenda**. Opcional. */
  readonly altText: string | null;
}

export interface PerfilDePessoaRepository {
  /**
   * A pessoa de um apelido, **se ela existe para quem olha**.
   *
   * `undefined` funde todos os motivos, e a fusão é a regra e não economia
   * (ADR-0021): apelido inexistente, apelido reservado, apelido de **pet**,
   * conta desabilitada de qualquer um dos dois lados, par bloqueado em qualquer
   * direção e perfil que quem olha denunciou. Um valor por motivo viraria um
   * código de erro por motivo, e a diferença entre eles é a informação que o
   * desenho não dá.
   */
  perfilPorApelido(apelido: string, quemOlha: UserId): Promise<PessoaVisivel | undefined>;

  /**
   * A vitrine de `dono`, **e só quando `quemOlha` é conexão aceita dele**.
   *
   * Lista vazia quando não é conexão **e** quando é conexão sem foto: as duas
   * são o mesmo valor aqui de propósito, porque distinguir exigiria que esta
   * consulta contasse algo sobre uma vitrine que quem olha não pode ver. Quem
   * decide o que a ausência significa é o caso de uso, pelo estado da conexão
   * que ele já tem na mão — e é por isso que `showcase` é **ausente** no
   * contrato quando o estado não é `connected`, em vez de `[]`.
   */
  vitrineDeConexao(
    dono: UserId,
    quemOlha: UserId,
  ): Promise<readonly FotoDoPerfilDeOutraPessoa[]>;
}
