/** O caso de uso da **busca de pessoas** (decisão do cliente de 20/10/2026). */
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
 * O estado da conexão como a BORDA o declara: os três de `ConnectionAppState` mais
 * `none`.
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
  /** A porta de conexão, para o estado do par em cada resultado (22/10/2026). */
  readonly conexoes: LeitorDeConexao;
  readonly clock: Clock;
}

/**
 * A página vazia, **e ela é a mesma instância de resposta para os dois casos** em
 * que não há busca a fazer: campo ausente/vazio e termo abaixo do piso.
 */
export const PAGINA_VAZIA: PaginaDeBuscaDePessoas = { itens: [], total: 0 };

/** A página vazia **com estado**, que é o que a borda recebe desde 22/10/2026. */
export const PAGINA_VAZIA_COM_ESTADO: PaginaDaBuscaComEstado = { itens: [], total: 0 };

export class BuscaDePessoas {
  constructor(private readonly deps: DependenciasDaBuscaDePessoas) {}

  /** Buscar pessoas por nome ou apelido. */
  async buscar(
    quemBusca: UserId,
    consulta: string | undefined,
    pagina: number,
    limite: number,
  ): Promise<PaginaDaBuscaComEstado> {
    const termo = termoDeBusca(consulta);
    if (termo === undefined) return PAGINA_VAZIA_COM_ESTADO;

    const pagina_ = await this.deps.busca.buscar(termo, quemBusca, pagina, limite);
    const estados = await this.deps.conexoes.estadosPorApelido(
      quemBusca,
      pagina_.itens.map((pessoa) => pessoa.handle),
      this.deps.clock.now(),
    );
    return {
      itens: pagina_.itens.map((pessoa) => ({
        ...pessoa,
        estadoDaConexao: estados.get(pessoa.handle) ?? 'none',
      })),
      total: pagina_.total,
    };
  }
}
