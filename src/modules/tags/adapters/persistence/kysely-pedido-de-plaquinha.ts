import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { AdminAccountId } from '../../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../../audit/ports/audit-log.js';
import type {
  DecisaoDoPedidoDePlaquinha,
  EnderecoDeEntrega,
  EntregaAAtualizar,
  PaginaDaFilaDePlaquinhas,
  PassoDaEntrega,
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
  PedidoNaFilaDePlaquinhas,
  RecorteDaFilaDePlaquinhas,
} from '../../ports/pedido-de-plaquinha.js';

interface LinhaDaEntrega {
  readonly delivery_state: PassoDaEntrega;
  readonly tracking_code: string | null;
  readonly shipped_at: Date | null;
  readonly delivered_at: Date | null;
}

interface LinhaDoTutor extends LinhaDaEntrega {
  readonly ref: string;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly requested_at: Date;
  readonly decided_at: Date | null;
  readonly notes: string | null;
}

interface LinhaDaFila extends LinhaDaEntrega {
  readonly id: string;
  readonly ref: string;
  readonly pet_name: string;
  readonly pet_species: string;
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly postal_code: string;
  readonly street: string;
  readonly street_number: string;
  readonly complement: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly notes: string | null;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly requested_at: Date;
  readonly decided_at: Date | null;
}

function comoEntrega(linha: LinhaDaEntrega): {
  readonly passoDaEntrega: PassoDaEntrega;
  readonly codigoDeRastreio: string | null;
  readonly despachadoEm: Date | null;
  readonly entregueEm: Date | null;
} {
  return {
    passoDaEntrega: linha.delivery_state,
    codigoDeRastreio: linha.tracking_code,
    despachadoEm: linha.shipped_at,
    entregueEm: linha.delivered_at,
  };
}

function comoPedidoDoTutor(linha: LinhaDoTutor): PedidoDoTutor {
  return {
    ref: linha.ref,
    status: linha.status,
    solicitadoEm: linha.requested_at,
    decididoEm: linha.decided_at,
    observacao: linha.notes,
    ...comoEntrega(linha),
  };
}

function comoEndereco(linha: LinhaDaFila): EnderecoDeEntrega {
  return {
    destinatario: linha.recipient_name,
    telefone: linha.recipient_phone,
    cep: linha.postal_code,
    logradouro: linha.street,
    numero: linha.street_number,
    complemento: linha.complement,
    bairro: linha.neighborhood,
    cidade: linha.city,
    uf: linha.state,
  };
}

function comoPedidoNaFila(linha: LinhaDaFila): PedidoNaFilaDePlaquinhas {
  return {
    id: linha.id,
    ref: linha.ref,
    petNome: linha.pet_name,
    petEspecie: linha.pet_species,
    endereco: comoEndereco(linha),
    observacao: linha.notes,
    status: linha.status,
    solicitadoEm: linha.requested_at,
    decididoEm: linha.decided_at,
    ...comoEntrega(linha),
  };
}

const COLUNAS_DA_ENTREGA = sql`r.delivery_state, r.tracking_code, r.shipped_at, r.delivered_at`;

const SOLICITANTE_ATIVO = sql<boolean>`conta_habilitada(r.requested_by)`;

export function criarPedidoDePlaquinhaRepository(deps: {
  readonly db: Db;
}): PedidoDePlaquinhaRepository {
  return {
    async criarOuDevolverPendente(entrada): Promise<PedidoDoTutor | undefined> {
      const { id, ref, petId, solicitante, endereco, observacao } = entrada;

      await sql`
        INSERT INTO collar_tag_requests (
                 id, ref, pet_id, requested_by,
                 recipient_name, recipient_phone, postal_code, street, street_number,
                 complement, neighborhood, city, state,
                 notes)
        SELECT ${id}::uuid, ${ref}, p.id, ${solicitante}::uuid,
               ${endereco.destinatario}, ${endereco.telefone}, ${endereco.cep},
               ${endereco.logradouro},
               ${endereco.numero}, ${endereco.complemento}, ${endereco.bairro},
               ${endereco.cidade}, ${endereco.uf},
               ${observacao}
          FROM pets p
         WHERE p.id = ${petId}::uuid
           AND p.owner_user_id = ${solicitante}::uuid
           AND p.deleted_at IS NULL
        ON CONFLICT (pet_id) WHERE status = 'pending' DO NOTHING
      `.execute(deps.db);

      const lida = await sql<LinhaDoTutor>`
        SELECT r.ref, r.status, r.requested_at, r.decided_at, r.notes, ${COLUNAS_DA_ENTREGA}
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id
         WHERE r.pet_id = ${petId}::uuid
           AND p.owner_user_id = ${solicitante}::uuid
           AND p.deleted_at IS NULL
           AND r.status = 'pending'
         ORDER BY r.requested_at DESC
         LIMIT 1
      `.execute(deps.db);

      const linha = lida.rows[0];
      return linha === undefined ? undefined : comoPedidoDoTutor(linha);
    },

    async listarDoPet(petId, solicitante): Promise<readonly PedidoDoTutor[] | undefined> {
      const dono = await sql<{ id: string }>`
        SELECT p.id
          FROM pets p
         WHERE p.id = ${petId}::uuid
           AND p.owner_user_id = ${solicitante}::uuid
           AND p.deleted_at IS NULL
      `.execute(deps.db);
      if (dono.rows[0] === undefined) return undefined;

      const lidos = await sql<LinhaDoTutor>`
        SELECT r.ref, r.status, r.requested_at, r.decided_at, r.notes, ${COLUNAS_DA_ENTREGA}
          FROM collar_tag_requests r
         WHERE r.pet_id = ${petId}::uuid
         ORDER BY r.requested_at DESC
      `.execute(deps.db);

      return lidos.rows.map(comoPedidoDoTutor);
    },

    async listarFila(recorte: RecorteDaFilaDePlaquinhas): Promise<PaginaDaFilaDePlaquinhas> {
      const status: DecisaoDoPedidoDePlaquinha = recorte.status ?? 'pending';
      const deslocamento = (recorte.page - 1) * recorte.limit;

      const passo =
        recorte.passoDaEntrega === undefined
          ? sql<boolean>`TRUE`
          : sql<boolean>`r.delivery_state = ${recorte.passoDaEntrega}`;

      const pagina = await sql<LinhaDaFila>`
        SELECT r.id, r.ref, p.name AS pet_name, p.species_code AS pet_species,
               r.recipient_name, r.recipient_phone, r.postal_code, r.street, r.street_number,
               r.complement, r.neighborhood, r.city, r.state,
               r.notes, r.status, r.requested_at, r.decided_at, ${COLUNAS_DA_ENTREGA}
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.status = ${status}
           AND ${passo}
           AND ${SOLICITANTE_ATIVO}
         ORDER BY r.requested_at ASC
         LIMIT ${recorte.limit} OFFSET ${deslocamento}
      `.execute(deps.db);

      const contagem = await sql<{ total: string }>`
        SELECT count(*)::text AS total
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.status = ${status}
           AND ${passo}
           AND ${SOLICITANTE_ATIVO}
      `.execute(deps.db);

      return {
        itens: pagina.rows.map(comoPedidoNaFila),
        total: Number(contagem.rows[0]?.total ?? '0'),
      };
    },

    async pedidoParaLeitura(ref: string): Promise<PedidoNaFilaDePlaquinhas | undefined> {
      const lida = await sql<LinhaDaFila>`
        SELECT r.id, r.ref, p.name AS pet_name, p.species_code AS pet_species,
               r.recipient_name, r.recipient_phone, r.postal_code, r.street, r.street_number,
               r.complement, r.neighborhood, r.city, r.state,
               r.notes, r.status, r.requested_at, r.decided_at, ${COLUNAS_DA_ENTREGA}
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.ref = ${ref}
           AND ${SOLICITANTE_ATIVO}
      `.execute(deps.db);
      const linha = lida.rows[0];
      return linha === undefined ? undefined : comoPedidoNaFila(linha);
    },

    async pedidoPorRef(
      trx: TransacaoDeEscrita,
      ref: string,
    ): Promise<PedidoNaFilaDePlaquinhas | undefined> {
      const lida = await sql<LinhaDaFila>`
        SELECT r.id, r.ref, p.name AS pet_name, p.species_code AS pet_species,
               r.recipient_name, r.recipient_phone, r.postal_code, r.street, r.street_number,
               r.complement, r.neighborhood, r.city, r.state,
               r.notes, r.status, r.requested_at, r.decided_at, ${COLUNAS_DA_ENTREGA}
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.ref = ${ref}
           AND ${SOLICITANTE_ATIVO}
           FOR UPDATE OF r
      `.execute(trx);
      const linha = lida.rows[0];
      return linha === undefined ? undefined : comoPedidoNaFila(linha);
    },

    async decidir(
      trx: TransacaoDeEscrita,
      id: string,
      decisao: Exclude<DecisaoDoPedidoDePlaquinha, 'pending'>,
      decisor: AdminAccountId,
      agora: Date,
    ): Promise<PedidoNaFilaDePlaquinhas> {
      const atualizada = await sql<LinhaDaFila>`
        UPDATE collar_tag_requests r
           SET status = ${decisao},
               decided_at = ${agora},
               decided_by_admin_id = ${decisor}::uuid
         WHERE r.id = ${id}::uuid
        RETURNING r.id, r.ref,
                  (SELECT p.name FROM pets p WHERE p.id = r.pet_id) AS pet_name,
                  (SELECT p.species_code FROM pets p WHERE p.id = r.pet_id) AS pet_species,
                  r.recipient_name, r.recipient_phone, r.postal_code, r.street, r.street_number,
                  r.complement, r.neighborhood, r.city, r.state,
                  r.notes, r.status, r.requested_at, r.decided_at, ${COLUNAS_DA_ENTREGA}
      `.execute(trx);
      const linha = atualizada.rows[0];
      if (linha === undefined) {
        throw new Error(`Pedido de plaquinha ${id} desapareceu dentro da transacao da decisao.`);
      }
      return comoPedidoNaFila(linha);
    },

    async atualizarEntrega(
      trx: TransacaoDeEscrita,
      id: string,
      entrega: EntregaAAtualizar,
      agora: Date,
    ): Promise<PedidoNaFilaDePlaquinhas> {
      const despachadoEm =
        entrega.passo === 'requested' ? sql`NULL` : sql`COALESCE(r.shipped_at, ${agora})`;
      const entregueEm = entrega.passo === 'arrived' ? sql`${agora}` : sql`NULL`;

      const rastreio =
        entrega.rastreio === undefined
          ? sql`r.tracking_code`
          : entrega.rastreio === null
            ? sql`NULL`
            : sql`${entrega.rastreio}`;

      const atualizada = await sql<LinhaDaFila>`
        UPDATE collar_tag_requests r
           SET delivery_state = ${entrega.passo},
               tracking_code  = ${rastreio},
               shipped_at     = ${despachadoEm},
               delivered_at   = ${entregueEm}
         WHERE r.id = ${id}::uuid
        RETURNING r.id, r.ref,
                  (SELECT p.name FROM pets p WHERE p.id = r.pet_id) AS pet_name,
                  (SELECT p.species_code FROM pets p WHERE p.id = r.pet_id) AS pet_species,
                  r.recipient_name, r.recipient_phone, r.postal_code, r.street, r.street_number,
                  r.complement, r.neighborhood, r.city, r.state,
                  r.notes, r.status, r.requested_at, r.decided_at, ${COLUNAS_DA_ENTREGA}
      `.execute(trx);
      const linha = atualizada.rows[0];
      if (linha === undefined) {
        throw new Error(`Pedido de plaquinha ${id} desapareceu dentro da transacao da entrega.`);
      }
      return comoPedidoNaFila(linha);
    },
  };
}
