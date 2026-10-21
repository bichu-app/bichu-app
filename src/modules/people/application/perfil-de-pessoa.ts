/**
 * O caso de uso do **perfil de outra pessoa** (fatia G).
 *
 * ## A decisão que ele implementa
 *
 * Cliente, 19/10/2026, literal: *"ele pode ver nome, quantidade de pets,
 * conexões, mas não as fotos publicadas e nem a timeline do usuário"*. É a
 * emenda 2 do ADR-0010, e este arquivo é onde ela vira recorte.
 *
 * | | Quem **não** é conexão | Conexão aceita |
 * |---|---|---|
 * | nome, contagem de pets, contagem de conexões | vê | vê |
 * | vitrine de fotos | **não** | vê |
 * | nome, miniatura, slug ou link de pet | **nunca** | **nunca** |
 * | cidade, bairro, telefone, e-mail, nascimento | nunca | nunca |
 * | timeline, publicação, curtida, contador | não existe | não existe |
 *
 * ## Por que a timeline não é uma ausência a preencher
 *
 * Ela **não existe no produto**, e não ficou para depois: a migração
 * `20261018000030` registra a decisão por extenso — *"uma timeline de quem você
 * segue É a lista de presença com hora... Encerrado, não se reabre"*. Não há
 * tabela de publicação, não há schema, não há campo aqui e não há como um
 * aparecer sem alguém reabrir aquela decisão.
 *
 * ## Por que a contagem de pets é segura e a lista não seria
 *
 * O item 7 do ADR-0010 proíbe *"outros pets do mesmo tutor, e qualquer coisa que
 * permita agrupá-los"* porque **agrupar entrega a casa**: com os pets nomeados,
 * um caso de perdido de um deles localiza os outros. A contagem agrupa no
 * sentido de afirmar "são três", e é por isso que ela precisou de emenda — mas
 * ela não é navegável: não há ficha a alcançar a partir dela.
 *
 * ## Por que `none` é um valor e não uma ausência
 *
 * `connection_state` vem sempre, e `none` cobre junto "nunca houve nada", "o
 * pedido expirou" e "a recusa está em descanso". A fusão é a mesma do 204 de
 * `endConnection`: um valor próprio para recusado seria o *"ela recusou você"*
 * que faz as pessoas aceitarem estranhos para não criar atrito.
 *
 * ## O 404, e por que ele não é decidido aqui
 *
 * `perfilPorApelido` devolve `undefined` para apelido inexistente, apelido
 * reservado, apelido de **pet**, conta desabilitada, par bloqueado e perfil
 * denunciado por quem olha — **os seis no `WHERE`** (ADR-0021). Este arquivo
 * levanta `naoEncontrado()` para o `undefined` e não tem um segundo ramo: não há
 * aqui um `if` que escolha entre 404 e 403, e não há caminho que produza 403.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { LeitorDeConexao } from '../../connections/ports/conexao.js';
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

/**
 * O perfil projetado, **sem URL e sem `UserId`**.
 *
 * As chaves de objeto saem daqui e a URL é montada na borda, a partir do domínio
 * de mídia: o banco guarda chave e não URL (§11.1 proibição 9), e montar a URL
 * aqui amarraria o caso de uso ao provedor do dia.
 */
export interface PerfilDePessoaProjetado {
  readonly handle: string;
  readonly publicRef: string;
  readonly displayName: string | null;
  readonly petsCount: number;
  readonly connectionsCount: number;
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
  readonly connectionState: EstadoDaConexaoNoPerfil;
  /** O `ref` da **aresta**, nulo quando o estado é `none`. Nunca de uma pessoa. */
  readonly connectionRef: string | null;
  /**
   * A vitrine, **`undefined` quando o estado não é `connected`** — e não `[]`.
   *
   * A diferença é o que a borda precisa para omitir a chave: lista vazia diria
   * "ela não tem foto", que é uma afirmação sobre a vitrine de alguém que quem
   * olha não pode ver. Conexão **com** vitrine vazia chega como `[]`.
   */
  readonly vitrine: readonly FotoDoPerfilDeOutraPessoa[] | undefined;
}

export interface DependenciasDoPerfilDePessoa {
  readonly perfis: PerfilDePessoaRepository;
  readonly conexoes: LeitorDeConexao;
  readonly clock: Clock;
}

export class PerfilDePessoa {
  constructor(private readonly deps: DependenciasDoPerfilDePessoa) {}

  /**
   * O perfil de um apelido, visto por `quemOlha`.
   *
   * **O apelido chega como a borda o recebeu**, e a normalização é do banco:
   * `handles.handle` é `citext` e a coluna de `users` também, então `@Maria` e
   * `@maria` são a mesma chave sem este arquivo saber disso. Normalizar aqui
   * seria a segunda definição da regra, e a segunda divergiria do `CHECK`.
   */
  async porApelido(quemOlha: UserId, apelido: string): Promise<PerfilDePessoaProjetado> {
    const pessoa = await this.deps.perfis.perfilPorApelido(apelido, quemOlha);
    // UM caminho de recusa, e ele é 404. Os seis motivos já vieram fundidos do
    // `WHERE`; não há o que distinguir aqui, e é por isso que não há um segundo
    // `throw` neste método.
    if (pessoa === undefined) throw problemas.naoEncontrado();

    const agora = this.deps.clock.now();
    const [aresta, connectionsCount] = await Promise.all([
      this.deps.conexoes.arestaVivaEntre(quemOlha, pessoa.userId, agora),
      this.deps.conexoes.contarConexoes(pessoa.userId),
    ]);

    const connectionState: EstadoDaConexaoNoPerfil = aresta?.estado ?? 'none';

    // **A VITRINE SÓ É PEDIDA QUANDO O ESTADO É `connected`**, e as duas metades
    // desta linha são necessárias e nenhuma substitui a outra:
    //
    // 1. aqui, a consulta não acontece — não se gasta leitura para jogar fora, e
    //    quem lê este arquivo vê o recorte;
    // 2. no `WHERE` de `vitrineDeConexao`, o predicado de conexão aceita impede
    //    que uma chamada feita por engano (um caminho novo, um refator) devolva
    //    foto. É a segunda metade que sobrevive a alguém mexer nesta linha, e é
    //    ela que a isca de SQL mede.
    const vitrine =
      connectionState === 'connected'
        ? await this.deps.perfis.vitrineDeConexao(pessoa.userId, quemOlha)
        : undefined;

    return {
      handle: pessoa.handle,
      publicRef: pessoa.publicRef,
      displayName: pessoa.displayName,
      // **A CONTAGEM, e só ela.** `PessoaVisivel` não tem campo de pet para
      // copiar além deste, e isso é o item 7 do ADR-0010 escrito no tipo.
      petsCount: pessoa.petsCount,
      connectionsCount,
      // O SELO DE VALIDADO, lido da MESMA consulta do perfil. **Não é uma
      // segunda leitura e não é um `if` daqui**: a condição mora no `SELECT` de
      // `construtorDoPerfilPorApelido`, e é por isso que ela não pode divergir
      // do recorte de seis predicados que já admitiu a pessoa.
      canalVerificado: pessoa.canalVerificado,
      connectionState,
      connectionRef: aresta?.ref ?? null,
      vitrine,
    };
  }
}
