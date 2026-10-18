/**
 * A porta de ESCRITA da fila de sugestoes do diretorio.
 *
 * Separada de `DirectoryRepository` de proposito, e nao por organizacao: aquela
 * porta e a leitura de `professionals` e tem um metodo so, porque "porta que
 * declara o que ainda nao existe vira metodo vazio em todo dobre de teste".
 * Juntar a escrita de `directory_suggestions` nela faria todo dobre da LEITURA
 * do `Perto` carregar um metodo de escrita que aquele cenario nao usa -- e
 * dobre com metodo vazio e o arranjo que ja aprovou 1037 casos com o mecanismo
 * desligado.
 *
 * Sao duas tabelas, dois sentidos e dois conjuntos de cenarios. Duas portas.
 *
 * **Um metodo so, e ele nao le.** Nao ha listar, nao ha detalhe e nao ha
 * decidir: as operacoes que o painel vai precisar para trabalhar esta fila nao
 * existem no contrato ainda, e declara-las aqui antes de existirem e como a
 * tabela de convite que o ADR-0011 secao 5.4 decidiu NAO criar antes do fluxo.
 */
import type { TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../domain/sugestao-do-diretorio.js';
import type { UserId } from '../../../shared/types/brands.js';

/**
 * O que se grava.
 *
 * **`id` e `ref` nao estao aqui**, e nem `review_status`. Os dois primeiros sao
 * identidade de linha e nascem no adaptador, junto do `INSERT`, como em
 * `kysely-network-repository.pedirParaParticipar`; o terceiro vem do `DEFAULT`
 * da tabela, porque estado inicial que viaja em argumento e estado que um dia
 * chega diferente.
 */
export interface SugestaoAGravar {
  /**
   * **A autoria.** Chega por aqui e para na borda do banco: a coluna que a
   * guarda leva a marca `NUNCA sai do servidor`, e quem a escreve e a funcao
   * `directory_suggestions_registrar` da migracao `20261017000004`.
   */
  readonly autor: UserId;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  /**
   * O CEP, oito digitos sem hifen, ou nulo.
   *
   * **A forma canonica e do CONTRATO e do `CHECK`, nao desta porta**: o
   * `pattern` `^[0-9]{8}$` de `DirectorySuggestionInput.postal_code` recusa o
   * que vem com hifen antes de chegar aqui, e a `20261017000015` repete a
   * regra no banco. Nada neste caminho tira hifen de nada: normalizar em
   * silencio aceitaria duas formas e ninguem descobriria qual e a guardada.
   */
  readonly postalCode: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  readonly note: string | null;
}

/** O que a gravacao devolve, e e tudo que o recibo precisa. */
export interface SugestaoGravada {
  readonly ref: string;
  /** O carimbo que o BANCO pos na linha, e nao o do relogio da aplicacao. */
  readonly createdAt: Date;
}

export interface DirectorySuggestionRepository {
  registrar(sugestao: SugestaoAGravar): Promise<SugestaoGravada>;
}
