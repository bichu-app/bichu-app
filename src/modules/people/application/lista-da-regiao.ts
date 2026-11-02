import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { LeitorDeConexao } from '../../connections/ports/conexao.js';
import type { PessoaDaRegiao } from '../ports/lista-da-regiao-repository.js';
import type { ListaDaRegiaoRepository } from '../ports/lista-da-regiao-repository.js';
import type { EstadoDaConexaoNaBusca } from './busca-de-pessoas.js';

/** Uma pessoa da região **com o estado do par**, que é o que a borda recebe. */
export interface PessoaDaRegiaoComEstado extends PessoaDaRegiao {
  readonly estadoDaConexao: EstadoDaConexaoNaBusca;
}

export interface PaginaDaRegiaoComEstado {
  readonly itens: readonly PessoaDaRegiaoComEstado[];
  readonly total: number;
}

export interface DependenciasDaListaDaRegiao {
  readonly lista: ListaDaRegiaoRepository;
  /**
   * A porta de conexão, para o estado do par em cada item.
   *
   * **A MESMA porta e o MESMO método da busca** (`estadosPorApelido`), e não uma
   * segunda leitura: é uma consulta para a página inteira, e nenhuma pessoa a
   * mais entra na lista por causa dela.
   */
  readonly conexoes: LeitorDeConexao;
  readonly clock: Clock;
}

/** A página vazia. */
export const PAGINA_VAZIA_DA_REGIAO: PaginaDaRegiaoComEstado = { itens: [], total: 0 };

/**
 * **A LISTAGEM DE USUÁRIOS DA MESMA REGIÃO, POR ADESÃO EXPLÍCITA** (decisão do
 * cliente, 02/11/2026).
 *
 * **Não existe `termo` nesta classe, e a ausência é a decisão 2 do cliente**: o
 * piso de três caracteres, o campo vazio que não lista ninguém e o teto por
 * consulta continuam sendo da busca, que não mudou em nada. Aceitar um termo
 * aqui seria uma segunda busca de pessoas sem nenhum dos freios da primeira.
 *
 * **Não existe região nesta classe tampouco**: ela sai da conta de quem chama,
 * dentro da consulta. Ver `ListaDaRegiaoRepository.listar`.
 */
export class ListaDaRegiao {
  constructor(private readonly deps: DependenciasDaListaDaRegiao) {}

  async listar(
    quemVe: UserId,
    pagina: number,
    limite: number,
  ): Promise<PaginaDaRegiaoComEstado> {
    const pagina_ = await this.deps.lista.listar(quemVe, pagina, limite);

    // A página vazia não gasta a consulta de estados. Ela é o caso COMUM, e não
    // o excepcional: quem não aderiu recebe vazio, quem não tem região de
    // referência recebe vazio, e a lista nasceu vazia para todo mundo.
    if (pagina_.itens.length === 0) return PAGINA_VAZIA_DA_REGIAO;

    const estados = await this.deps.conexoes.estadosPorApelido(
      quemVe,
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
