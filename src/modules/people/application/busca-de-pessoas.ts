/**
 * O caso de uso da **busca de pessoas** (decisão do cliente de 20/10/2026).
 *
 * > *"vamos implementar a busca pelo usuário"*
 *
 * ## Esta busca é uma reversão declarada, e não uma brecha
 *
 * Até 20/10/2026 este produto **recusava busca de pessoas por escrito**, em
 * quatro lugares: no plano (4-C.5 recusou até a rota de *disponibilidade* de
 * apelido), na migração `20261018000030`, na porta
 * `connections/ports/convite-de-conexao.ts` (*"seria busca de pessoas pela porta
 * de trás, e um oráculo de existência de apelido"*) e na emenda 2 do ADR-0010.
 * O cliente reverteu a decisão, **com freios que ele mesmo listou**, e os freios
 * são o que este arquivo e os seus vizinhos implementam:
 *
 * | Freio | Onde ele mora |
 * |---|---|
 * | mínimo de 3 caracteres | `termoDeBusca`, e o piso é o do índice trigrama |
 * | campo vazio nunca lista ninguém | `termoDeBusca` + esta classe, e a porta não é chamada |
 * | teto de consultas por conta | `x-rate-limit` `[account, q]` no contrato, aplicado por `registrar-rota.ts` |
 * | nome e contagens, nunca foto | `PessoaEncontrada`, que não tem campo de foto |
 * | 404 e nunca 403 | a cláusula `WHERE`, com os seis predicados |
 *
 * **O freio que não é visível neste arquivo é o mais importante**: a busca não
 * devolve quem bloqueou quem busca, quem desabilitou a conta nem quem quem busca
 * denunciou — e isso está na cláusula `WHERE` de
 * `kysely-busca-de-pessoas.ts`, não aqui. Um filtro nesta camada seria a segunda
 * cópia da regra, e a segunda é a que alguém esquece de repetir na terceira
 * rota.
 *
 * ## Por que o piso não vira erro
 *
 * Consulta curta e campo vazio devolvem **página vazia**, e nunca 400. A razão
 * está no cabeçalho de `termo-de-busca.ts`: a tela chama a busca a cada tecla, e
 * um erro vermelho no meio de alguém escrevendo `maria` seria o produto
 * discutindo com quem digita. Erro é para pedido malformado; dois caracteres são
 * **incompletos**, não malformados.
 *
 * ## O ESTADO DA CONEXÃO ENTROU EM 22/10/2026, E ELE CONSERTA UM DEFEITO
 *
 * O cliente relatou, por escrito: *"após eu ter aceito, ainda aparece para
 * solicitar conexão a um usuário que ja foi adicionado e aceito"*. A causa era
 * **estrutural e não um `if` esquecido na tela**: `PersonSearchResult` omitia
 * `connection_state` de propósito, e a razão escrita no contrato era
 * *"numa lista, vinte estados por requisição são o material de que uma lista de
 * conexões se faz do lado de fora"*.
 *
 * **Esse argumento caiu, e caiu por decisão do próprio cliente.** Em 22/10/2026
 * ele autorizou a lista das próprias conexões (`listMyConnections`): o dono já
 * obtém o conjunto das suas conexões por uma rota legítima, então devolvê-lo
 * recortado nos resultados da busca **dele** não entrega nada novo. O defeito
 * passou a ter conserto possível no mesmo dia em que a lista passou a existir.
 *
 * **O que o estado NÃO abre, e isto é a medição:**
 *
 * | | |
 * |---|---|
 * | é sempre o par com **quem busca** | nunca a relação entre duas outras pessoas, então não é a lista de conexões de terceiro |
 * | `pending_sent` e `pending_received` | já estavam em `listMyConnectionRequests`, nas duas caixas |
 * | `connected` | já está em `listMyConnections` desde 22/10/2026 |
 * | ausência (`none` na borda) | funde "nunca houve nada", "o pendente expirou" e "a recusa está em descanso" — não afirma nada sobre ninguém |
 * | **nunca `declined`** | a projeção é `estadoNoApp`, a MESMA do perfil: a recusa sai como `pending_sent` para quem pediu enquanto a validade corre, e depois desaparece |
 *
 * E **uma consulta para a página inteira**, não uma por resultado: ver
 * `LeitorDeConexao.estadosPorApelido`.
 *
 * ## O que este arquivo não tem
 *
 * Nenhuma leitura sem termo, nenhuma sugestão de "quem você talvez conheça",
 * nenhuma ordenação por relevância e nenhuma contagem de seguidor. **E nenhuma
 * escrita**: buscar não cria aresta. Quem pede conexão a partir de um resultado
 * chama `requestConnection` com o apelido, e lá o aceite continua obrigatório.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { LeitorDeConexao } from '../../connections/ports/conexao.js';
import { termoDeBusca } from '../domain/termo-de-busca.js';
import type {
  BuscaDePessoasRepository,
  PaginaDeBuscaDePessoas,
  PessoaEncontrada,
} from '../ports/busca-de-pessoas-repository.js';

/**
 * O estado da conexão como a BORDA o declara: os três de `ConnectionAppState`
 * mais `none`.
 *
 * **`none` é a AUSÊNCIA de aresta que se projete**, e ele existe aqui e não em
 * `EstadoNoApp` pela mesma razão que o contrato dá para `PersonProfile`: na
 * caixa de pedidos "nenhuma relação" não é um estado possível, e acrescentá-lo
 * lá mudaria aquela superfície.
 */
export type EstadoDaConexaoNaBusca = 'none' | 'pending_sent' | 'pending_received' | 'connected';

/** Uma pessoa encontrada **com o estado do par**, desde 22/10/2026. */
export interface PessoaEncontradaComEstado extends PessoaEncontrada {
  readonly estadoDaConexao: EstadoDaConexaoNaBusca;
}

export interface PaginaDaBuscaComEstado {
  readonly itens: readonly PessoaEncontradaComEstado[];
  readonly total: number;
}

export interface DependenciasDaBuscaDePessoas {
  readonly busca: BuscaDePessoasRepository;
  /**
   * A porta de conexão, para o estado do par em cada resultado (22/10/2026).
   *
   * **`connections/ports/conexao.ts` e nada mais**, que é a única camada de
   * `connections` que este módulo enxerga (`src/architecture.rules.mjs`): a
   * lista de conexões de alguém não existe nela, e o que se pergunta é sempre o
   * par com quem busca.
   */
  readonly conexoes: LeitorDeConexao;
  readonly clock: Clock;
}

/**
 * A página vazia, **e ela é a mesma instância de resposta para os dois casos**
 * em que não há busca a fazer: campo ausente/vazio e termo abaixo do piso.
 *
 * Exportada para que as iscas afirmem a forma exata que a borda devolve sem
 * montarem a própria — uma isca que construísse `{ itens: [], total: 0 }` à mão
 * passaria a medir outro objeto no dia em que este ganhasse um campo.
 */
export const PAGINA_VAZIA: PaginaDeBuscaDePessoas = { itens: [], total: 0 };

/**
 * A página vazia **com estado**, que é o que a borda recebe desde 22/10/2026.
 *
 * Exportada pela mesma razão de [PAGINA_VAZIA]: uma isca que construísse
 * `{ itens: [], total: 0 }` à mão passaria a medir outro objeto no dia em que
 * este ganhasse um campo.
 */
export const PAGINA_VAZIA_COM_ESTADO: PaginaDaBuscaComEstado = { itens: [], total: 0 };

export class BuscaDePessoas {
  constructor(private readonly deps: DependenciasDaBuscaDePessoas) {}

  /**
   * Buscar pessoas por nome ou apelido.
   *
   * **`undefined` de `termoDeBusca` não chama a porta**, e as duas metades desta
   * decisão importam:
   *
   * 1. a consulta não acontece — não se paga uma varredura de tabela para jogar
   *    o resultado fora, e quem lê este método vê o recorte;
   * 2. a porta **não é chamada**, e é isso que faz "listar todos" ser
   *    inexprimível em vez de proibido: `buscar` exige `termo: string`, então
   *    não existe a chamada que listaria. Um `if` que passasse `''` adiante
   *    dependeria de a consulta se comportar bem com termo vazio; aqui ela nem
   *    recebe a oportunidade.
   */
  async buscar(
    quemBusca: UserId,
    consulta: string | undefined,
    pagina: number,
    limite: number,
  ): Promise<PaginaDaBuscaComEstado> {
    const termo = termoDeBusca(consulta);
    // Campo vazio e campo curto caem aqui, nos dois na MESMA pagina vazia, e
    // nenhum deles levanta. **Nao existe "listar todos"**: sem consulta, sem
    // resultado -- e sem resultado nao ha estado a perguntar.
    if (termo === undefined) return PAGINA_VAZIA_COM_ESTADO;

    const pagina_ = await this.deps.busca.buscar(termo, quemBusca, pagina, limite);
    // **UMA consulta para a pagina inteira**, com os apelidos que a busca
    // devolveu -- e nao uma por resultado. Pagina vazia nao consulta nada: a
    // porta devolve o mapa vazio sem ir ao banco.
    const estados = await this.deps.conexoes.estadosPorApelido(
      quemBusca,
      pagina_.itens.map((pessoa) => pessoa.handle),
      this.deps.clock.now(),
    );
    return {
      itens: pagina_.itens.map((pessoa) => ({
        ...pessoa,
        // **Ausencia vira `none`**, e os tres motivos vem fundidos de
        // `estadoNoApp`: nunca houve nada, o pendente expirou, e a recusa esta
        // em descanso. Distinguir qualquer um deles aqui seria desfazer a
        // fusao que o leitor fez de proposito.
        estadoDaConexao: estados.get(pessoa.handle) ?? 'none',
      })),
      total: pagina_.total,
    };
  }
}
