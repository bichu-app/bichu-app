/**
 * O pedido do OBJETO FISICO da plaquinha da coleira.
 *
 * ## Solicitar nao e emitir, e confundir os dois custa caro
 *
 * `issuePetTag` cria o CODIGO: 16 simbolos Crockford com simbolo de
 * verificacao, irreversivel, sem reciclagem e sem reativacao (ADR-0004). Ele
 * nasce a pedido do tutor e so ele o ve em claro.
 *
 * O que esta porta registra e outra coisa: o pedido do PLASTICO. Quem toca o
 * botao `Fazer a tag da coleira` ja tem o codigo -- a tela de `Pet cadastrado`
 * emite a tag antes de oferecer o botao -- e o que falta e alguem prensar e
 * entregar. Por isso **nenhum metodo daqui emite, revoga ou le codigo**, e por
 * isso nao ha `tagId` no pedido: qual tag ativa do pet vai para o plastico e
 * decisao de quem atende, no minuto em que atende.
 *
 * ## O endereco de entrega, e o cuidado que ele exige
 *
 * O cliente decidiu em 17/10: **o endereco entra, e e obrigatorio**. Sem ele a
 * administracao nao cumpre, que era o motivo da pergunta.
 *
 * Ele e DADO PESSOAL, e as quatro regras andam com o tipo:
 *
 * 1. **so o necessario para entregar** -- sete campos de endereco e o nome de
 *    quem recebe. Sem documento, sem data de nascimento, sem telefone;
 * 2. **nao sai em superficie publica**. [PedidoDoTutor], que e o que o app ve,
 *    **nao tem endereco**: quem o enviou acabou de digita-lo, e devolve-lo
 *    seria uma copia a mais. Quem o le e a administracao, por
 *    [PedidoNaFilaDePlaquinhas];
 * 3. **nao entra na trilha**. Nenhum campo de [EnderecoDeEntrega] e copiado
 *    para `audit.events`, nem em `before`/`after`, nem em `metadata`;
 * 4. **nao e geocodificado**. Nao ha `lat`, nao ha `lon` e nao ha resolucao de
 *    CEP por servico externo (ADR-0006): todo campo e digitado.
 *
 * O valor continua fora: nao ha preco, nao ha pagamento e nao ha cobranca.
 */
import type { AdminAccountId, PetId, UserId } from '../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';

/** O `CHECK` `collar_tag_requests_decisao_conhecida`. */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/**
 * O endereco de entrega, como o tutor o digitou.
 *
 * **Nenhum campo e resolvido por ninguem** (ADR-0006): `cep` nao completa
 * `bairro`, `cidade` nao vem de `uf`, e nao ha latitude nem longitude. O que
 * chega e o que a pessoa escreveu.
 *
 * `uf` e a sigla de dois caracteres. **O conjunto das 27 nao mora aqui nem no
 * banco**: ele vive no app (`app/lib/api/estados_brasileiros.dart`), e uma
 * segunda lista deste lado seria a segunda fonte para divergir.
 */
export interface EnderecoDeEntrega {
  /** Quem recebe, como vai na etiqueta. */
  readonly destinatario: string;
  /** Oito digitos, sem mascara. Ja normalizado quando chega aqui. */
  readonly cep: string;
  readonly logradouro: string;
  /** Texto, e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. */
  readonly numero: string;
  /** O unico opcional do endereco. */
  readonly complemento: string | null;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

/**
 * O pedido como o APP o ve. Sem `ref` e sem UUID nenhum (ADR-0010 item 6), e
 * **sem endereco**: ver a regra 2 no cabecalho deste arquivo.
 */
export interface PedidoDoTutor {
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly observacao: string | null;
}

/**
 * O pedido como a FILA DO PAINEL o ve.
 *
 * `petNome` e `petEspecie` identificam qual plaquinha prensar; `endereco` e
 * para onde ela vai, e e o unico dado pessoal desta projecao.
 *
 * **Nenhum PERFIL do solicitante entra aqui**: nem e-mail, nem telefone, nem
 * UUID, nem identificador estavel, nem historico. O nome que aparece e o de
 * quem recebe a encomenda, dentro do endereco, e nao uma leitura de conta -- a
 * unica leitura de conta do backoffice v1 segue sendo a fila de pedidos de
 * encontro (D53 a D57).
 */
export interface PedidoNaFilaDePlaquinhas {
  /** Interno, para a trilha. Nunca projetado em resposta. */
  readonly id: string;
  readonly ref: string;
  readonly petNome: string;
  readonly petEspecie: string;
  readonly endereco: EnderecoDeEntrega;
  readonly observacao: string | null;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly decididoEm: Date | null;
}

export interface RecorteDaFilaDePlaquinhas {
  readonly status?: DecisaoDoPedidoDePlaquinha | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaFilaDePlaquinhas {
  readonly itens: readonly PedidoNaFilaDePlaquinhas[];
  readonly total: number;
}

export interface PedidoDePlaquinhaRepository {
  /**
   * Cria o pedido do tutor, ou devolve o pendente que ja existe.
   *
   * **A autorizacao esta na clausula `WHERE`**, e e isso que faz pedido para
   * pet de outra pessoa simplesmente NAO EXISTIR: o `INSERT ... SELECT` so
   * encontra linha quando o pet e do chamador, e `undefined` vira 404 na rota
   * -- nunca 403, porque 403 confirmaria que o pet existe (ADR-0021).
   */
  criarOuDevolverPendente(entrada: {
    readonly id: string;
    readonly ref: string;
    readonly petId: PetId;
    readonly solicitante: UserId;
    readonly endereco: EnderecoDeEntrega;
    readonly observacao: string | null;
  }): Promise<PedidoDoTutor | undefined>;

  /** A fila do painel. Pedido de pet excluido nao aparece: a linha cai com o pet. */
  listarFila(recorte: RecorteDaFilaDePlaquinhas): Promise<PaginaDaFilaDePlaquinhas>;

  /** Com `FOR UPDATE`: a decisao segura a linha ate o `COMMIT`. */
  pedidoPorRef(trx: TransacaoDeEscrita, ref: string): Promise<PedidoNaFilaDePlaquinhas | undefined>;

  decidir(
    trx: TransacaoDeEscrita,
    id: string,
    decisao: Exclude<DecisaoDoPedidoDePlaquinha, 'pending'>,
    decisor: AdminAccountId,
    agora: Date,
  ): Promise<PedidoNaFilaDePlaquinhas>;
}
