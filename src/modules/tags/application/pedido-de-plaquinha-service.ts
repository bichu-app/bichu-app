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
  PaginaDaFilaDePlaquinhas,
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
  PedidoNaFilaDePlaquinhas,
  RecorteDaFilaDePlaquinhas,
} from '../ports/pedido-de-plaquinha.js';

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
    observacao: string | null,
  ): Promise<PedidoDoTutor> {
    const pedido = await this.deps.repositorio.criarOuDevolverPendente({
      id: this.deps.ids.uuidv7(),
      ref: refDoPedido(this.deps.ids),
      petId,
      solicitante,
      observacao,
    });
    if (pedido === undefined) throw problemas.naoEncontrado();
    return pedido;
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
   * **Pelo `id` interno e pelo `ref`, nunca por quem pediu.** A trilha de uma
   * fila nao e o lugar de guardar o nome de ninguem.
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
