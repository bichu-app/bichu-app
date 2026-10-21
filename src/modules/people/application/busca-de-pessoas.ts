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
 * ## O que este arquivo não tem
 *
 * Nenhuma leitura sem termo, nenhuma sugestão de "quem você talvez conheça",
 * nenhuma ordenação por relevância e nenhuma contagem de seguidor. **E nenhuma
 * escrita**: buscar não cria aresta. Quem pede conexão a partir de um resultado
 * chama `requestConnection` com o apelido, e lá o aceite continua obrigatório.
 */
import type { UserId } from '../../../shared/types/brands.js';
import { termoDeBusca } from '../domain/termo-de-busca.js';
import type {
  BuscaDePessoasRepository,
  PaginaDeBuscaDePessoas,
} from '../ports/busca-de-pessoas-repository.js';

export interface DependenciasDaBuscaDePessoas {
  readonly busca: BuscaDePessoasRepository;
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
  ): Promise<PaginaDeBuscaDePessoas> {
    const termo = termoDeBusca(consulta);
    // Campo vazio e campo curto caem aqui, nos dois na MESMA pagina vazia, e
    // nenhum deles levanta. **Nao existe "listar todos"**: sem consulta, sem
    // resultado.
    if (termo === undefined) return PAGINA_VAZIA;
    return this.deps.busca.buscar(termo, quemBusca, pagina, limite);
  }
}
