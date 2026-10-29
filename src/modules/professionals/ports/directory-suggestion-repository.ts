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
 * **DOIS metodos desde 18/10/2026, e o segundo LE.** `registrar` escreve;
 * `listarDoAutor` le as indicacoes de UMA conta, que e a tela `Minhas
 * indicacoes` (`listMyDirectorySuggestions`). A frase anterior deste cabecalho
 * -- "um metodo so, e ele nao le" -- valia enquanto nenhuma operacao de leitura
 * desta tabela existisse no contrato; agora existe uma, do lado de quem
 * indicou, e ela nasce com implementacao e com tela.
 *
 * **O que continua FORA desta porta e a fila do painel.** Listar, ler e decidir
 * do lado administrativo moram em `FilaDeIndicacoesRepository`, e nao aqui:
 * outro ator (conta de `admin_accounts`, nao de `users`), outro sentido e
 * outros cenarios. Juntar os dois faria todo dobre desta porta carregar quatro
 * metodos de painel -- e e por isso que as duas portas existem.
 *
 * **`listarDoAutor` cabe aqui, e a fila do painel nao, pela mesma regua:** o
 * ator e o mesmo de `registrar` (a conta de `users` que indicou), e o cenario e
 * o mesmo caminho do aplicativo. Quem grava e quem le a propria lista e a
 * mesma pessoa.
 */
import type { TipoDeEntidade, TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../domain/sugestao-do-diretorio.js';
// `RevisaoDaIndicacao` e o `CHECK` da tabela, e ele e UM so: reusado do dominio
// da fila em vez de redeclarado aqui. Duas copias da mesma lista fechada e a
// forma de uma delas ficar atras quando o `CHECK` crescer.
import type { RevisaoDaIndicacao } from '../domain/fila-de-indicacoes.js';
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
  /**
   * O QUE a entidade indicada E (cliente, 29/10/2026). **Nunca `undefined`
   * aqui**: quem resolve o padrao e o caso de uso, e nao o adaptador -- o
   * `coalesce` da funcao do banco e a rede de baixo, nao a decisao.
   */
  readonly entityKind: TipoDeEntidade;
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
  /**
   * O `upload_id` do LOGOTIPO que quem indicou enviou, ou nulo (cliente,
   * 29/10/2026: *"nao tem o campo do logotipo para o usuario subir e indicar o
   * estabelecimento"*).
   *
   * **E `upload_id` e nao `image_id`, e a diferenca e de responsabilidade.** A
   * imagem de catalogo ainda NAO EXISTE neste momento: quem a cria e a
   * confirmacao do envio, e ela tem de acontecer na MESMA transacao do
   * `INSERT` da indicacao (ADR-0027 item 10) -- uma imagem confirmada para uma
   * indicacao que depois nao foi gravada ficaria `processing` para sempre.
   * Entao o `id` da imagem nasce dentro do adaptador, e nao chega por aqui.
   *
   * **Nunca `undefined`**: quem resolve a ausencia e o caso de uso, como em
   * `entityKind`. Nulo quer dizer "sem logotipo", que e o estado normal.
   */
  readonly logoUploadId: string | null;
}

/** O que a gravacao devolve, e e tudo que o recibo precisa. */
export interface SugestaoGravada {
  readonly ref: string;
  /** O carimbo que o BANCO pos na linha, e nao o do relogio da aplicacao. */
  readonly createdAt: Date;
}

/**
 * O desfecho de `registrar`, e **por que ele deixou de ser so `SugestaoGravada`
 * em 29/10/2026**.
 *
 * Com o logotipo, a gravacao passou a poder RECUSAR: o `upload_id` pode ser de
 * outra conta, de outro proposito, vencido ou ja usado em outra indicacao. Essa
 * conferencia mora no adaptador porque ela E a clausula `WHERE` da consulta --
 * um `if` depois de um `SELECT` sem filtro teria lido o envio de outra pessoa
 * para a memoria deste processo.
 *
 * **Mas a RESPOSTA nao e do adaptador**, e e por isso que o tipo e este e nao um
 * `throw` lá dentro: o `400`, o `code: upload_not_usable`, a frase que a pessoa
 * le e o silencio sobre QUAL dos casos ocorreu sao decisao da camada de
 * aplicacao, onde as outras recusas desta operacao ja moram. Um `problemas.*`
 * dentro do Kysely poria redacao de erro no adaptador de banco.
 *
 * **Um valor so para os quatro casos, e o silencio e deliberado:** dizer "esse
 * envio e de outra pessoa" confirmaria a existencia de um `upload_id` alheio a
 * quem o adivinhou.
 */
export type RegistroDaSugestao =
  | { readonly tipo: 'gravada'; readonly sugestao: SugestaoGravada }
  | { readonly tipo: 'envio_nao_serve' };

/**
 * O recorte da lista de quem indicou: paginacao e o estado da revisao.
 *
 * **Nao ha `termo`, e a ausencia e medida**: o contrato nao aceita `q` nesta
 * operacao, porque buscar por nome numa lista de poucas dezenas de itens que a
 * propria pessoa escreveu e um campo a mais para manter em troca de nada.
 * Declarar o campo aqui antes de a operacao aceita-lo criaria o parametro que
 * ninguem preenche.
 *
 * **`reviewStatus` esta aqui porque ele e do SERVIDOR**, e nao do aplicativo:
 * um filtro aplicado so na pagina carregada mentiria no `total` e no
 * paginador.
 */
export interface RecorteDasMinhasIndicacoes {
  readonly autor: UserId;
  /** Ausente devolve TODOS os estados, que e a pergunta de quem abre a tela. */
  readonly reviewStatus?: RevisaoDaIndicacao | undefined;
  readonly page: number;
  readonly limit: number;
}

/**
 * Uma indicacao como QUEM INDICOU a ve.
 *
 * **Nao e `IndicacaoNaFila`** (a projecao do painel), e a diferenca nao e de
 * organizacao: `note` nao esta aqui -- ele e o recado para quem revisa --, e
 * `entradaSlug` aqui so vem quando a entrada esta PUBLICADA. Ver o esquema
 * `MyDirectorySuggestion` do contrato, que explica as duas fronteiras.
 */
export interface MinhaIndicacao {
  readonly ref: string;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade E. `NOT NULL DEFAULT 'professional'` na coluna. */
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  readonly reviewStatus: RevisaoDaIndicacao;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  /**
   * O motivo da recusa, e **ele chega a quem indicou** desde 18/10/2026.
   *
   * Isto reverte a frase do `COMMENT ON COLUMN` da `20261017000016`, e a
   * reversao esta justificada no cabecalho da `20261018000003`: recusa sem
   * motivo faz a mesma entidade ser indicada outra vez.
   */
  readonly declineReason: string | null;
  /**
   * O endereco da entrada no `Perto`, **so quando ela esta publicada**.
   *
   * Nulo com `reviewStatus: 'approved'` TEM significado, e nao e ausencia de
   * dado: a entrada existe e esta `draft`. Entrada nascida de indicacao com
   * contato `website` ou `instagram` nasce rascunho (sem `phone_e164`), e
   * `Perto` so lista `status = 'published'`. Quem decide isso e o `WHERE` da
   * funcao `indicacoes_do_autor(uuid)`, e nao esta camada.
   */
  readonly entradaSlug: string | null;
}

/** A pagina das minhas indicacoes. Sem contagem de fila alheia. */
export interface PaginaDasMinhasIndicacoes {
  readonly itens: readonly MinhaIndicacao[];
  readonly total: number;
}

export interface DirectorySuggestionRepository {
  /**
   * Grava a indicacao -- e, quando ha logotipo, confirma o envio dele na MESMA
   * transacao. Ver `RegistroDaSugestao` para por que ela pode recusar.
   */
  registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao>;
  /**
   * As indicacoes DA CONTA, da mais recente para a mais antiga.
   *
   * **A autorizacao nao e parametro desta porta, e sim o `WHERE` da funcao do
   * banco.** `autor` entra na clausula `WHERE` de `indicacoes_do_autor(uuid)`:
   * nao ha caminho, por este metodo, para a indicacao de outra conta. Conta
   * desabilitada devolve pagina vazia pelo mesmo `WHERE`, que delega a
   * `conta_habilitada(uuid)` -- e por isso nao ha "ver de conta desabilitada"
   * como opcao aqui.
   */
  listarDoAutor(recorte: RecorteDasMinhasIndicacoes): Promise<PaginaDasMinhasIndicacoes>;
}
