/**
 * Os dois casos de uso do pedido da plaquinha: o do tutor e o do painel.
 *
 * **Nenhum dos dois emite codigo.** Emitir e `issuePetTag`, e o codigo e
 * irreversivel (ADR-0004): um painel que emitisse criaria plaquinha sem o
 * tutor pedir, e um pedido que emitisse transformaria "quero a plaquinha" em
 * um codigo a mais no pet.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { PetId, UserId } from '../../../shared/types/brands.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import type { EscritaAuditada } from '../../audit/ports/audit-log.js';
import {
  eventoAdministrativo,
  type AtorAdministrativo,
  type DeclaracaoDeTrilha,
} from '../../audit/ports/trilha-administrativa.js';
import type {
  EnderecoDeEntrega,
  PaginaDaFilaDePlaquinhas,
  PassoAlcancavelDoPedido,
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
  PedidoNaFilaDePlaquinhas,
  RecorteDaFilaDePlaquinhas,
} from '../ports/pedido-de-plaquinha.js';
import {
  entregaPodeAndar,
  sanearRastreio,
  transicaoDeEntregaPermitida,
} from '../domain/entrega-da-plaquinha.js';

/** 128 bits em base64url, a MESMA forma do `ref` do pedido de encontro. */
function refDoPedido(ids: IdGenerator): string {
  return Buffer.from(ids.random128()).toString('base64url');
}

/**
 * O pedido do tutor.
 *
 * Idempotente **sem chave de idempotencia**, e quem garante isso e o banco:
 * `collar_tag_requests_um_pendente_por_pet` e um indice parcial unico, entao
 * ha no maximo um pedido `pending` por pet e pedir de novo devolve o que ja
 * existe. Uma chave de idempotencia aqui seria um segundo mecanismo para a
 * mesma propriedade, e o do banco e o que vale mesmo quando o cliente perde a
 * resposta.
 */
export class PedidoDePlaquinhaService {
  constructor(
    private readonly deps: {
      readonly repositorio: PedidoDePlaquinhaRepository;
      readonly ids: IdGenerator;
    },
  ) {}

  /**
   * **404 e nao 403 para pet de outra pessoa**, e a decisao nao e desta
   * camada: ela esta na clausula `WHERE` do repositorio, que nao encontra
   * linha nenhuma. Aqui so se traduz "nao encontrei" para a resposta, e por
   * isso nao ha ramo que compare dono com chamador -- um ramo assim poderia
   * ser escrito ao contrario.
   */
  async pedir(
    petId: PetId,
    solicitante: UserId,
    endereco: EnderecoDeEntrega,
    observacao: string | null,
  ): Promise<PedidoDoTutor> {
    const pedido = await this.deps.repositorio.criarOuDevolverPendente({
      id: this.deps.ids.uuidv7(),
      ref: refDoPedido(this.deps.ids),
      petId,
      solicitante,
      endereco,
      observacao,
    });
    if (pedido === undefined) throw problemas.naoEncontrado();
    return pedido;
  }

  /**
   * Os pedidos de um pet do chamador, para a pagina de acompanhamento.
   *
   * **404 e nao 403 para pet de outra pessoa**, e pelo mesmo motivo de
   * [pedir]: a decisao esta na clausula `WHERE` do repositorio, e aqui so se
   * traduz "nao encontrei" para a resposta.
   *
   * **Lista vazia NAO e 404.** Pet que e seu e ainda nao tem pedido responde
   * `200` com zero itens: e um estado legitimo, e confundi-lo com "nao existe"
   * faria a pagina do pet recem-cadastrado mentir sobre o proprio pet.
   */
  async listarDoPet(petId: PetId, solicitante: UserId): Promise<readonly PedidoDoTutor[]> {
    const pedidos = await this.deps.repositorio.listarDoPet(petId, solicitante);
    if (pedidos === undefined) throw problemas.naoEncontrado();
    return pedidos;
  }
}

/** A fila do painel: listar e decidir. A TELA e da sessao Backoffice. */
export class FilaDePlaquinhasAdministrativa {
  constructor(
    private readonly deps: {
      readonly repositorio: PedidoDePlaquinhaRepository;
      readonly escrita: EscritaAuditada;
      readonly clock: Clock;
    },
  ) {}

  listar(recorte: RecorteDaFilaDePlaquinhas): Promise<PaginaDaFilaDePlaquinhas> {
    return this.deps.repositorio.listarFila(recorte);
  }

  /**
   * UM pedido, para a tela de entrega.
   *
   * **404 e nao 403**, e a decisao nao e desta camada: o `WHERE` do repositorio
   * carrega `conta_habilitada(requested_by)` e nao encontra linha nenhuma
   * quando a conta esta desabilitada. Aqui so se traduz "nao encontrei" para a
   * resposta -- e por isso nao ha ramo que compare nada, porque um ramo assim
   * poderia ser escrito ao contrario.
   */
  async ler(ref: string): Promise<PedidoNaFilaDePlaquinhas> {
    const pedido = await this.deps.repositorio.pedidoParaLeitura(ref);
    if (pedido === undefined) throw problemas.naoEncontrado();
    return pedido;
  }

  /**
   * A ATUALIZACAO DA ENTREGA: o passo e o codigo de rastreio, numa escrita so --
   * como o cliente pediu em 18/10, numa frase so.
   *
   * A ordem das recusas e deliberada, e vai da mais geral para a mais
   * especifica: o pedido existe, o pedido foi atendido, a transicao e
   * permitida, o rastreio e aceitavel. Trocar essa ordem faria um pedido
   * pendente com rastreio vazio responder sobre o rastreio, e o que quem
   * clicou precisa ouvir primeiro e que falta atender.
   *
   * A escrita e o evento da trilha na MESMA transacao (D49): falha da trilha
   * desfaz a atualizacao.
   *
   * **`before`/`after` carregam `delivery_state` e `tracking_code`, e NENHUM
   * campo do endereco** -- nem em `metadata`. O rastreio entra de proposito: e
   * numero de encomenda e nao dado pessoal, e e o campo cuja troca alguem vai
   * querer auditar depois.
   */
  async atualizarEntrega(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    ref: string,
    passo: PassoAlcancavelDoPedido,
    rastreio: string | null | undefined,
  ): Promise<PedidoNaFilaDePlaquinhas> {
    const saneado = sanearRastreio(rastreio);
    const agora = comoData(this.deps.clock.now());

    return this.deps.escrita.executar(async (trx) => {
      const atual = await this.deps.repositorio.pedidoPorRef(trx, ref);
      if (atual === undefined) throw problemas.naoEncontrado();

      // Mesma regra do `CHECK` `entrega_exige_atendimento`, traduzida para uma
      // resposta que diz qual e o proximo passo em vez de estourar uma violacao
      // de restricao do Postgres como 500.
      if (!entregaPodeAndar(atual.status)) {
        throw problemas.validacao([
          {
            field: 'delivery_state',
            code: 'request_not_fulfilled',
            message: 'Atenda o pedido antes de registrar a entrega.',
          },
        ]);
      }

      if (!transicaoDeEntregaPermitida(atual.passoDaEntrega, passo)) {
        throw problemas.validacao([
          {
            field: 'delivery_state',
            code: 'invalid_delivery_transition',
            message: 'Este passo não pode ser alcançado a partir do atual.',
          },
        ]);
      }

      if (!saneado.ok) {
        throw problemas.validacao([
          {
            field: 'tracking_code',
            code: saneado.code,
            message: 'Informe um código de rastreio válido, ou nenhum.',
          },
        ]);
      }

      const atualizado = await this.deps.repositorio.atualizarEntrega(
        trx,
        atual.id,
        { passo, rastreio },
        agora,
      );

      return {
        resultado: atualizado,
        evento: eventoAdministrativo(declaracao, ator, {
          resourceId: atual.id,
          before: {
            delivery_state: atual.passoDaEntrega,
            tracking_code: atual.codigoDeRastreio,
          },
          after: {
            delivery_state: atualizado.passoDaEntrega,
            tracking_code: atualizado.codigoDeRastreio,
          },
          metadata: { ref: atual.ref },
        }),
      };
    });
  }

  atender(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    ref: string,
  ): Promise<PedidoNaFilaDePlaquinhas> {
    return this.decidir(declaracao, ator, ref, 'fulfilled');
  }

  recusar(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    ref: string,
  ): Promise<PedidoNaFilaDePlaquinhas> {
    return this.decidir(declaracao, ator, ref, 'declined');
  }

  /**
   * A escrita e o evento da trilha na MESMA transacao, pela unidade de
   * trabalho de `EscritaAuditada`: falha da trilha desfaz a decisao (D49).
   *
   * **Pelo `id` interno e pelo `ref`, nunca por quem pediu e NUNCA pelo
   * endereco.** A trilha registra que houve decisao e qual foi; o endereco de
   * entrega e dado pessoal e nao e copiado para `audit.events` -- nem em
   * `before`, nem em `after`, nem em `metadata`. `before`/`after` carregam so
   * o `status`, que e o que mudou.
   */
  private async decidir(
    declaracao: DeclaracaoDeTrilha,
    ator: AtorAdministrativo,
    ref: string,
    decisao: 'fulfilled' | 'declined',
  ): Promise<PedidoNaFilaDePlaquinhas> {
    // `comoData` sobre a porta `Clock`, e nunca `new Date()`: o instante da
    // decisao e o mesmo que o teste controla.
    const agora = comoData(this.deps.clock.now());
    return this.deps.escrita.executar(async (trx) => {
      const atual = await this.deps.repositorio.pedidoPorRef(trx, ref);
      if (atual === undefined) throw problemas.naoEncontrado();
      if (atual.status !== 'pending') {
        throw problemas.validacao([
          {
            field: 'status',
            code: 'request_not_pending',
            message: 'Este pedido não pode mais receber esta decisão.',
          },
        ]);
      }
      const decidido = await this.deps.repositorio.decidir(
        trx,
        atual.id,
        decisao,
        ator.adminAccountId,
        agora,
      );
      return {
        resultado: decidido,
        evento: eventoAdministrativo(declaracao, ator, {
          resourceId: atual.id,
          before: { status: atual.status },
          after: { status: decisao },
          metadata: { ref: atual.ref },
        }),
      };
    });
  }
}
