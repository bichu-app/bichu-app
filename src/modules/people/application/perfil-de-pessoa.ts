import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { LeitorDeConexao } from '../../connections/ports/conexao.js';
import type { ResolvedorDeConvite } from '../../connections/ports/convite-de-conexao.js';
import type {
  FotoDoPerfilDeOutraPessoa,
  PerfilDePessoaRepository,
} from '../ports/perfil-de-pessoa-repository.js';

/** A relação entre quem olha e a pessoa, no vocabulário do contrato. */
export type EstadoDaConexaoNoPerfil =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected';

/** O perfil projetado, **sem URL e sem `UserId`**. */
export interface PerfilDePessoaProjetado {
  readonly handle: string;
  readonly publicRef: string;
  readonly displayName: string | null;
  readonly petsCount: number;
  readonly connectionsCount: number;
  /**
   * **O SELO DE VALIDADO** (emenda do ADR-0010, 21/10/2026, decisão do cliente): a
   * conta tem um canal de contato confirmado.
   */
  readonly canalVerificado: boolean;
  readonly connectionState: EstadoDaConexaoNoPerfil;
  /** O `ref` da **aresta**, nulo quando o estado é `none`. */
  readonly connectionRef: string | null;
  /**
   * **ESTE PERFIL É DE QUEM ESTÁ OLHANDO** (decisão do cliente de 03/11/2026).
   *
   * Ele sai no contrato como `is_self`, e existe porque o aplicativo **não tem
   * como derivá-lo**: `Me` entrega `id` (o uuid de `users.id`) e `handle`, e
   * `PersonProfile` entrega `public_ref` e `handle` -- a interseção dos dois é
   * só o `handle`, que é justamente o campo que a pessoa pode trocar. Comparar
   * apelido no cliente erraria nas duas direções, e a direção ruim é a de falso
   * positivo: sessão com apelido velho que hoje pertence a outra pessoa
   * esconderia `Denunciar` e `Bloquear` do perfil de um estranho de verdade.
   *
   * **E o servidor não está aprendendo um conceito novo aqui.** Ele já recusa
   * tudo que é sobre si mesmo: a busca exclui `u.id <> quemBusca`, pedir
   * conexão lança 404 (`conexao-entre-pessoas.ts`) e bloquear/denunciar devolve
   * `eu_mesmo` com a mensagem *"Este perfil é seu."*. Esta projeção era o
   * ÚNICO lugar que guardava o segredo, e era por isso que a tela desenhava
   * portas que o servidor já recusava.
   */
  readonly souEu: boolean;
  /**
   * A vitrine, **`undefined` quando quem olha não pode ver as fotos** — e não
   * `[]`, que diria "ela não tem foto".
   *
   * **São DUAS condições que a abrem, e não uma** (decisão do cliente de
   * 03/11/2026): conexão aceita, ou **o perfil ser o de quem está olhando**. A
   * segunda entrou porque no próprio perfil ela vinha ausente -- ninguém tem
   * aresta consigo mesmo -- e a tela lia a ausência como "você não é conexão
   * dela", dizendo a frase de estranho sobre as fotos de quem estava olhando.
   */
  readonly vitrine: readonly FotoDoPerfilDeOutraPessoa[] | undefined;
}

export interface DependenciasDoPerfilDePessoa {
  readonly perfis: PerfilDePessoaRepository;
  readonly conexoes: LeitorDeConexao;
  /**
   * O resolvedor de convite, **para a tela de destino do link e do QR** (decisão do
   * cliente de 20/10/2026).
   */
  readonly convites: ResolvedorDeConvite;
  readonly clock: Clock;
}

export class PerfilDePessoa {
  constructor(private readonly deps: DependenciasDoPerfilDePessoa) {}

  /** O perfil de um apelido, visto por `quemOlha`. */
  async porApelido(quemOlha: UserId, apelido: string): Promise<PerfilDePessoaProjetado> {
    const pessoa = await this.deps.perfis.perfilPorApelido(apelido, quemOlha);
    if (pessoa === undefined) throw problemas.naoEncontrado();

    // -----------------------------------------------------------------------
    // O PONTO ÚNICO DE "SOU EU", E ELE É ESTA LINHA
    // -----------------------------------------------------------------------
    //
    // **Tudo que depende de o alvo ser quem olha lê DESTA constante** -- o
    // `is_self` da resposta e a escolha da vitrine. Não há segundo predicado em
    // lugar nenhum: nem no `WHERE` da vitrine própria, nem na borda, nem na
    // tela, que recebe o booleano pronto.
    //
    // **Um interruptor em duas cópias não é um interruptor**, e esta casa já
    // pagou por isso: o predicado da audiência do Mural esteve escrito à mão em
    // quatro lugares, e manter quatro cópias de acordo não é trabalho que
    // alguém faça para sempre. Se um dia "sou eu" precisar mudar de definição,
    // ela muda aqui e em nenhum outro lugar.
    const souEu = pessoa.userId === quemOlha;

    const agora = this.deps.clock.now();
    const [aresta, connectionsCount] = await Promise.all([
      this.deps.conexoes.arestaVivaEntre(quemOlha, pessoa.userId, agora),
      this.deps.conexoes.contarConexoes(pessoa.userId),
    ]);

    const connectionState: EstadoDaConexaoNoPerfil = aresta?.estado ?? 'none';

    // AS DUAS PORTAS DA VITRINE, e a ordem importa: `souEu` é testado PRIMEIRO
    // porque consigo mesmo `connectionState` é sempre `none` -- não existe
    // aresta de uma conta para ela mesma --, então deixá-lo em segundo lugar
    // faria o próprio perfil cair no `undefined` de novo.
    //
    // **PARA TERCEIRO A REGRA NÃO MUDOU UMA LINHA** (decisão do cliente de
    // 19/10/2026, *"ele pode ver nome, quantidade de pets, conexões, mas não as
    // fotos publicadas"*): sem aresta `accepted`, estranho continua recebendo
    // `undefined`. Consertar o próprio perfil afrouxando este ramo seria
    // vazamento, não conserto.
    const vitrine = souEu
      ? await this.deps.perfis.vitrinePropria(quemOlha)
      : connectionState === 'connected'
        ? await this.deps.perfis.vitrineDeConexao(pessoa.userId, quemOlha)
        : undefined;

    return {
      handle: pessoa.handle,
      publicRef: pessoa.publicRef,
      displayName: pessoa.displayName,
      petsCount: pessoa.petsCount,
      connectionsCount,
      canalVerificado: pessoa.canalVerificado,
      connectionState,
      connectionRef: aresta?.ref ?? null,
      souEu,
      vitrine,
    };
  }

  /** **A tela de destino do link de convite e do QR**: o perfil de quem emitiu. */
  async porConvite(quemOlha: UserId, token: string): Promise<PerfilDePessoaProjetado> {
    const convite = await this.deps.convites.resolver(token, quemOlha);
    if (convite === undefined) throw problemas.naoEncontrado();
    return this.porApelido(quemOlha, convite.apelido);
  }
}
