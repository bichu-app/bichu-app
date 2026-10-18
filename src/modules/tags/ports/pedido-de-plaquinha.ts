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
 * 1. **so o necessario para entregar** -- os campos do endereco, o nome de
 *    quem recebe e o telefone dele, que e o que a transportadora pede. Sem
 *    documento e sem data de nascimento;
 * 2. **nao sai em superficie publica**. [PedidoDoTutor], que e o que o app ve,
 *    **nao tem endereco**: quem o enviou acabou de digita-lo, e devolve-lo
 *    seria uma copia a mais. Quem o le e a administracao, por
 *    [PedidoNaFilaDePlaquinhas];
 * 3. **nao entra na trilha**. Nenhum campo de [EnderecoDeEntrega] e copiado
 *    para `audit.events`, nem em `before`/`after`, nem em `metadata`;
 * 4. **nao e geocodificado**. Nao ha `lat` e nao ha `lon`: a ADR-0006 proibe
 *    endereco virar COORDENADA. O app passou a preencher rua, bairro, cidade
 *    e UF a partir do CEP (ViaCEP, decisao do cliente de 17/10), e isso e
 *    TEXTO -- **o servidor nao participa da busca**: ele recebe campos ja
 *    digitados ou ja corrigidos e nao sabe se ela aconteceu.
 *
 * O valor continua fora: nao ha preco, nao ha pagamento e nao ha cobranca.
 */
import type { AdminAccountId, PetId, UserId } from '../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';

/**
 * O `CHECK` `collar_tag_requests_decisao_conhecida`: a DECISAO do painel, e so
 * ela. Nao diz onde a encomenda esta -- isso e [PassoDaEntrega].
 */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/**
 * O `CHECK` `collar_tag_requests_entrega_conhecida`: o EIXO DA ENTREGA, e os
 * tres passos que o cliente nomeou em 18/10 -- solicitado, em transporte,
 * chegou.
 *
 * **Eixo separado de [DecisaoDoPedidoDePlaquinha], e a escolha foi medida.**
 * Acrescentar um quarto valor a `status` quebraria o contrato pela regra
 * `response-property-enum-value-added` do `oasdiff` -- quatro erros, um por
 * operacao que projeta o estado --, e dispensar portao nao era opcao nesta
 * frente. Campo acrescentado nao quebra ninguem.
 *
 * Os eixos NAO sao independentes: `collar_tag_requests_entrega_exige_atendimento`
 * proibe sair de `requested` sem o pedido estar `fulfilled`, e com isso
 * recusado-que-chegou e pendente-em-transporte deixam de existir no banco.
 *
 * **Nunca nulo**: a coluna e `NOT NULL DEFAULT 'requested'`, entao todo pedido
 * tem um passo escrito -- inclusive os criados antes de a entrega existir -- e
 * a tela nunca infere "solicitado" de uma ausencia.
 */
export type PassoDaEntrega = 'requested' | 'in_transit' | 'arrived';

/**
 * Os passos que a rota aceita como ALVO.
 *
 * `requested` fica de fora porque ele e so INICIAL: ninguem volta a ele, e o
 * `enum` do corpo no contrato (`AdminCollarTagDeliveryUpdate.delivery_state`)
 * tem exatamente estes dois valores. Derivado por `Exclude` e nao escrito a
 * mao, para que um passo novo em [PassoDaEntrega] apareca aqui sozinho.
 */
export type PassoAlcancavelDoPedido = Exclude<PassoDaEntrega, 'requested'>;

/**
 * O que o painel escreve numa atualizacao de entrega: o passo e o que fazer com
 * o codigo de rastreio.
 *
 * `rastreio` e `undefined` quando o corpo nao trouxe o campo -- o rastreio nao
 * muda --, e `null` quando ele veio nulo, que e o pedido de APAGAR. A diferenca
 * entre os dois e o que faz "marcar que chegou" nao limpar o codigo que ja
 * estava la.
 */
export interface EntregaAAtualizar {
  readonly passo: PassoDaEntrega;
  readonly rastreio: string | null | undefined;
}

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
  /** E.164 do Brasil. Obrigatorio: a transportadora costuma exigir. */
  readonly telefone: string;
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
 * O pedido como o APP o ve. **Sem endereco**: ver a regra 2 no cabecalho
 * deste arquivo.
 *
 * **`ref` entrou em 18/10**, quando o cliente pediu a pagina de
 * acompanhamento: a pessoa precisa de um numero para falar sobre o pedido
 * dela. E o MESMO `ref` opaco da fila do painel -- nao ha identificador novo
 * --, e nenhum UUID interno sai (ADR-0010 item 6).
 */
export interface PedidoDoTutor {
  /** O identificador opaco, 128 bits em base64url. Nao e o UUID. */
  readonly ref: string;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly solicitadoEm: Date;
  readonly decididoEm: Date | null;
  readonly observacao: string | null;
  /**
   * O passo da entrega -- `requested`, `in_transit` ou `arrived`. **Nunca
   * nulo**: e o campo UNICO que a pagina privada do aplicativo le para desenhar
   * o passo, e nao ha nulo a tratar.
   */
  readonly passoDaEntrega: PassoDaEntrega;
  /**
   * O codigo de rastreio, ou nulo. Nulo e o caso comum e NAO e defeito: nem
   * todo envio tem rastreio, e nenhum pedido tem rastreio antes de sair.
   *
   * **COSTURA DA MESCLA DE 18/10/2026.** Este campo foi declarado DUAS VEZES,
   * uma por frente, e a mescla ficou com esta. O ramo do aplicativo
   * (`feat/acompanhar-pedido-plaquinha`) o declarou como *"hoje sempre nulo, e
   * deliberadamente"*, porque quando ele foi escrito nao havia coluna nem
   * escrita; o ramo do painel (`feat/entrega-da-plaquinha-no-painel`) criou a
   * coluna `tracking_code`, a rota que a escreve e a tela que a preenche. A
   * promessa de nulo perpetuo morreu com a segunda frente, e manter as duas
   * declaracoes nao compilava. Quem le este campo hoje recebe VALOR REAL
   * quando ha despacho com rastreio.
   */
  readonly codigoDeRastreio: string | null;
  /** Quando saiu. Nulo enquanto o passo e `requested`. */
  readonly despachadoEm: Date | null;
  /** Quando chegou. Nulo em tudo que nao chegou. */
  readonly entregueEm: Date | null;
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
  readonly passoDaEntrega: PassoDaEntrega;
  readonly codigoDeRastreio: string | null;
  readonly despachadoEm: Date | null;
  readonly entregueEm: Date | null;
}

export interface RecorteDaFilaDePlaquinhas {
  readonly status?: DecisaoDoPedidoDePlaquinha | undefined;
  /**
   * Recorta por PASSO DA ENTREGA, e combina com `status` em vez de substitui-lo:
   * os dois sao eixos diferentes. `fulfilled` com `requested` e a fila de
   * trabalho de quem despacha.
   */
  readonly passoDaEntrega?: PassoDaEntrega | undefined;
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

  /**
   * Os pedidos de UM pet do chamador, do mais recente para o mais antigo.
   *
   * **A autorizacao esta na clausula `WHERE`**, como na criacao: o `SELECT`
   * exige `pets.owner_user_id = <chamador>`, entao pet de outra pessoa nao
   * devolve linha nenhuma e a rota responde 404 -- nunca 403, que confirmaria
   * a existencia do pet (ADR-0021).
   *
   * Devolve `undefined` quando o PET nao e do chamador (ou nao existe), e uma
   * lista vazia quando o pet e dele e ainda nao tem pedido. **Os dois casos
   * sao diferentes e a rota os responde diferente**: 404 no primeiro, 200 com
   * lista vazia no segundo. Colapsa-los faria a pagina do pet sem pedido
   * dizer "este pet nao existe".
   */
  listarDoPet(
    petId: PetId,
    solicitante: UserId,
  ): Promise<readonly PedidoDoTutor[] | undefined>;

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

  /**
   * UM pedido, para a tela de entrega do painel. SEM `FOR UPDATE`: e leitura, e
   * travar linha numa leitura seguraria o pedido pelo tempo da requisicao sem
   * ninguem escrever nada.
   *
   * **Pedido de conta desabilitada nao existe aqui**, pela mesma clausula
   * `WHERE` da listagem (decisao do cliente de 17/10). `undefined` vira 404 na
   * rota -- nunca 403 (ADR-0021).
   */
  pedidoParaLeitura(ref: string): Promise<PedidoNaFilaDePlaquinhas | undefined>;

  /**
   * Grava o passo da entrega e o codigo de rastreio.
   *
   * Os carimbos NAO vem de fora: `shipped_at` e `delivered_at` sao derivados do
   * passo de destino dentro do `UPDATE`, porque os dois `CHECK` bicondicionais
   * do banco (`despacho_tem_instante`, `chegada_tem_instante`) os exigem
   * exatamente quando o passo os exige -- deixar isso para quem chama seria
   * deixar uma violacao de restricao esperando por um descuido.
   */
  atualizarEntrega(
    trx: TransacaoDeEscrita,
    id: string,
    entrega: EntregaAAtualizar,
    agora: Date,
  ): Promise<PedidoNaFilaDePlaquinhas>;
}
