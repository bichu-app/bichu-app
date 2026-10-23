/**
 * A porta de persistência da conexão. **Interna ao módulo**: outro módulo só
 * enxerga `conexao.ts`.
 *
 * ## A autorização mora na cláusula `WHERE` (ADR-0021)
 *
 * Toda operação que toca uma aresta recebe **quem chama**, e quem chama entra no
 * `WHERE` ao lado do `ref`. Não existe "ler a aresta, conferir num `if`, depois
 * escrever": a janela entre a leitura e a escrita é onde a corrida mora, e um
 * caminho novo que esquecesse a leitura abriria o furo sem nenhum teste de
 * comportamento acusar.
 *
 * Consequência direta: **`ref` de aresta alheia, `ref` inexistente, conta
 * desabilitada de qualquer um dos dois lados e par bloqueado são o MESMO
 * `undefined`** — que a borda transforma no mesmo 404, nunca 403.
 *
 * ## UM método devolve as conexões, e ele é DO PRÓPRIO DONO (22/10/2026)
 *
 * Este cabeçalho dizia, até 22/10/2026, que *"não existe método de listar
 * conexões — nem de terceiro, nem do próprio dono"*. **O cliente emendou a
 * própria decisão de 18/10/2026**, literal: *"o usuário pode abrir a lista de
 * usuários que é sua conexão"*. O método é [ConnectionsRepository.conexoes], e
 * a emenda é exata:
 *
 * | | antes | agora |
 * |---|---|---|
 * | as PRÓPRIAS conexões | não existia método | [ConnectionsRepository.conexoes] |
 * | as conexões de TERCEIRO | nunca | **continua não existindo** |
 *
 * **A lista de terceiro não é exprimível nesta porta, e isso não é disciplina:**
 * `conexoes` recebe `quemChama` e devolve as conexões DELE, e não há um segundo
 * argumento de pessoa para alguém passar. Quem quisesse a lista de outra conta
 * teria de **acrescentar parâmetro neste arquivo**, que é exatamente o lugar
 * onde alguém vê.
 *
 * `pedidos` continua devolvendo **pedidos**, que é outra coisa: `accepted` não
 * entra em nenhuma das duas caixas, e é essa linha que mantém as duas listas
 * separadas — a que espera decisão e a que já decidiu.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaGuardada, OrigemDoPedido } from '../domain/conexao.js';
import type { ContagensDaConta } from '../domain/teto-de-conexoes.js';

/** Qual caixa de pedidos. Não há uma terceira, e não há "todos". */
export type DirecaoDoPedido = 'received' | 'sent';

export interface PaginaDePedidos {
  readonly itens: readonly ArestaGuardada[];
  readonly total: number;
}

/**
 * **Uma pessoa na lista das PRÓPRIAS conexões** (cliente, 22/10/2026).
 *
 * Os **cinco** campos são os de `PessoaEncontrada` (a busca), e o limite é o
 * mesmo de propósito: ser conexão aceita não abre campo nesta lista. O que o
 * aceite abre está nas OUTRAS superfícies — a vitrine, o mural, o bairro no
 * perfil —, cada uma com o próprio predicado. O portão
 * `conexao-nao-expoe-lista-nem-identificador.test.ts` compara os dois conjuntos
 * no contrato, por nome.
 *
 * **Nenhum `UserId`, nenhum `public_ref` e nenhum `ref` de aresta.** O que
 * endereça cada linha é o **apelido**, que é o endereço do perfil; e desfazer
 * não mora aqui, então o `ref` da aresta não tem dono nesta forma.
 */
export interface PessoaConectada {
  /** O apelido. **Não anulável**: conexão sem apelido não tem perfil a abrir. */
  readonly apelido: string;
  /** O nome de exibição, **anulável** — a coluna é anulável em `users`. */
  readonly nomeDeExibicao: string | null;
  /** Quantos pets, **e nada além do número** (emenda 2 do ADR-0010). */
  readonly petsCount: number;
  /** Quantas conexões aceitas daquela pessoa. **O número, nunca a lista.** */
  readonly connectionsCount: number;
  /**
   * A chave de objeto da derivada **`thumb`**, ou `null` sem foto pronta.
   *
   * **Chave, e não URL**: o banco guarda chave e a borda monta o endereço com a
   * base de mídia do ambiente (§11.1 proibição 9). A mesma divisão de
   * `PessoaEncontrada.photoKey`.
   */
  readonly photoKey: string | null;
}

/** Uma aresta guardada, com o apelido pelo qual ela foi perguntada. */
export interface ArestaComApelido {
  readonly apelido: string;
  readonly aresta: ArestaGuardada;
}

/** Uma página das próprias conexões aceitas. Numerada, como as irmãs. */
export interface PaginaDeConexoes {
  readonly itens: readonly PessoaConectada[];
  readonly total: number;
}

/** O recorte da lista das próprias conexões. **Sem pessoa, e sem termo.** */
export interface RecorteDeConexoes {
  readonly pagina: number;
  readonly limite: number;
}

export interface RecortePedidos {
  readonly direcao: DirecaoDoPedido;
  readonly pagina: number;
  readonly limite: number;
  readonly agora: Instant;
}

export interface NovoPedido {
  readonly id: string;
  readonly ref: string;
  readonly quemPede: UserId;
  readonly alvo: UserId;
  readonly origem: OrigemDoPedido;
  readonly agora: Instant;
}

/** O que `encerrar` de fato fez. Serve à trilha, **nunca à resposta**. */
export type Encerramento = 'declined' | 'cancelled' | 'undone';

export interface ConnectionsRepository {
  /**
   * As contagens da conta, já recortadas por conta habilitada dos dois lados e
   * por validade do pendente. Alimenta os tetos e o resumo do próprio dono.
   */
  contagens(pessoa: UserId, agora: Instant): Promise<ContagensDaConta>;

  /** Quantas conexões aceitas tem esta conta. Para o teto do OUTRO lado. */
  contarConexoes(pessoa: UserId): Promise<number>;

  /**
   * **Quantos tutores entraram pelo convite desta conta e viraram conexão
   * aceita** — o número da seção `Convide tutores` (cliente, 21/10/2026).
   *
   * A regra são **dois sinais**, e os dois moram na cláusula `WHERE` da
   * consulta: conexão `accepted` com esta conta no destino e `origin` de
   * convite, **e** a outra pessoa com ao menos um pet de foto `ready`.
   *
   * **Método próprio e não um campo a mais em [contagens]**, e a razão é de
   * custo: aquela consulta alimenta os TETOS, que são lidos em cada pedido de
   * conexão, e este número precisa de uma junção com `pets` e `pet_photos` que
   * nenhum teto usa. Pendurá-lo lá faria toda escrita pagar por um número que
   * só uma tela lê.
   */
  contarConvidadosQueEntraram(pessoa: UserId): Promise<number>;

  /** A aresta do par, em qualquer direção, na perspectiva de `quemChama`. */
  arestaDoPar(quemChama: UserId, outro: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /** A aresta por `ref`, **se e só se** quem chama é uma das duas pontas. */
  arestaPorRef(ref: string, quemChama: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /**
   * Cria o pendente. **Os tetos estão no `WHERE` deste `INSERT`**, e é este o
   * nível que vale sob concorrência; `undefined` quando qualquer um deles barrou,
   * quando o par já tem linha viva, ou quando alguma das contas está
   * desabilitada. Quem traduz `undefined` em recusa legível é o caso de uso, que
   * já conferiu as contagens e sabe qual teto bateu.
   */
  pedir(pedido: NovoPedido): Promise<ArestaGuardada | undefined>;

  /**
   * Aceita. Só o **destinatário** de um pendente **vivo** aceita, e os dois
   * predicados estão no `WHERE` junto com o teto de 150 dos dois lados.
   */
  aceitar(ref: string, quemChama: UserId, agora: Instant): Promise<ArestaGuardada | undefined>;

  /**
   * Recusar, cancelar e desfazer, **numa escrita só**, porque do lado de fora as
   * três são "esta aresta deixa de existir para mim" e a diferença é derivada do
   * estado e do papel — não recebida de quem chama. Receber a intenção por
   * argumento deixaria a borda escolher a semântica, e um cliente que mandasse
   * "desfazer" num pendente lavaria a recusa.
   *
   * O pendente **recusado** grava a recusa e o descanso de 90 dias; o pendente
   * **cancelado por quem pediu** e a conexão **desfeita** apagam a linha. A
   * diferença existe por uma razão: apagar a recusa faria o próximo pedido nascer
   * pendente e lavaria a recusa — a mesma decisão que o pedido do encontro
   * privado já tomou (`withdrawNetworkEventJoinRequest`).
   */
  encerrar(ref: string, quemChama: UserId, agora: Instant): Promise<Encerramento | undefined>;

  /** Os pedidos de uma das duas caixas. Nunca conexões. */
  pedidos(quemChama: UserId, recorte: RecortePedidos): Promise<PaginaDePedidos>;

  /**
   * **As conexões ACEITAS de `quemChama` — as dele, e de mais ninguém**
   * (cliente, 22/10/2026: *"o usuário pode abrir a lista de usuários que é sua
   * conexão"*).
   *
   * **Não há argumento de pessoa**, e é isso que torna a lista de terceiro
   * inexprimível em vez de proibida: o único `UserId` que entra é quem chama, e
   * ele entra na cláusula `WHERE` (ADR-0021) como as duas pontas da aresta.
   *
   * Só `accepted`, com `conta_habilitada` nos **dois** lados — o mesmo recorte
   * de [contagens], para que o total desta lista e `connected_count` não possam
   * divergir. Pendente não entra: ele é das caixas de pedidos.
   */
  conexoes(quemChama: UserId, recorte: RecorteDeConexoes): Promise<PaginaDeConexoes>;

  /**
   * **As arestas entre `quemChama` e cada um destes apelidos**, numa consulta
   * só. Serve a `LeitorDeConexao.estadosPorApelido` — o estado da conexão nos
   * resultados da busca (22/10/2026).
   *
   * Devolve a aresta **guardada**, e não o estado do app: a projeção é
   * `estadoNoApp`, e ela é do domínio deste módulo. Uma segunda definição dela
   * em SQL seria a segunda resposta para "a recusa é silenciosa?" — e a segunda
   * é a que alguém esquece de corrigir.
   *
   * O apelido vem no resultado porque é a chave com que quem chama perguntou;
   * **nenhum `UserId` sai**.
   */
  arestasPorApelido(
    quemChama: UserId,
    apelidos: readonly string[],
    agora: Instant,
  ): Promise<readonly ArestaComApelido[]>;

  /** O predicado de par, para as fatias G e J. Ver `ports/conexao.ts`. */
  estaConectado(um: UserId, outro: UserId): Promise<boolean>;

  /** O contrato com a fatia E. Ver `ConexaoSobBloqueio`. */
  desfazerPorBloqueio(um: UserId, outro: UserId, agora: Instant): Promise<number>;
}
