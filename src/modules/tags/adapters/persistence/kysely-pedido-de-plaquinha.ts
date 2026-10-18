/**
 * O pedido da plaquinha no Postgres.
 *
 * ## A AUTORIZACAO ESTA NA CLAUSULA `WHERE`, e isso nao e estilo
 *
 * A criacao e um `INSERT ... SELECT` cujo `SELECT` carrega
 * `pets.owner_user_id = <chamador>` e `pets.deleted_at IS NULL`. Pedido para
 * pet de outra pessoa nao e recusado: ele **nao encontra linha**, o `INSERT`
 * nao insere, a leitura seguinte nao acha nada, e a rota responde 404
 * (ADR-0021). Nao existe neste arquivo nenhuma comparacao de dono em
 * JavaScript, e e exatamente isso que se quer: uma comparacao assim pode ser
 * escrita ao contrario, e um `WHERE` que falta nao devolve o dado.
 *
 * Pelo mesmo motivo a decisao do painel nao confere nada sobre dono: quem
 * chega ate ela passou pela guarda do prefixo `/v1/admin`.
 *
 * ## `ON CONFLICT` e o indice parcial
 *
 * `collar_tag_requests_um_pendente_por_pet` e unico sobre `pet_id` **onde
 * `status = 'pending'`**. O `ON CONFLICT` aponta para ele com a mesma
 * condicao, entao pedir de novo nao cria linha e nao mexe na que existe: o
 * `DO NOTHING` deixa a observacao do primeiro pedido de pe, que e o correto --
 * quem toca o botao duas vezes nao quis apagar o que escreveu antes.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { AdminAccountId } from '../../../../shared/types/brands.js';
import type { TransacaoDeEscrita } from '../../../audit/ports/audit-log.js';
import type {
  DecisaoDoPedidoDePlaquinha,
  PaginaDaFilaDePlaquinhas,
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
  PedidoNaFilaDePlaquinhas,
  RecorteDaFilaDePlaquinhas,
} from '../../ports/pedido-de-plaquinha.js';

interface LinhaDoTutor {
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly requested_at: Date;
  readonly notes: string | null;
}

interface LinhaDaFila {
  readonly id: string;
  readonly ref: string;
  readonly pet_name: string;
  readonly pet_species: string;
  readonly notes: string | null;
  readonly status: DecisaoDoPedidoDePlaquinha;
  readonly requested_at: Date;
  readonly decided_at: Date | null;
}

function comoPedidoDoTutor(linha: LinhaDoTutor): PedidoDoTutor {
  return { status: linha.status, solicitadoEm: linha.requested_at, observacao: linha.notes };
}

function comoPedidoNaFila(linha: LinhaDaFila): PedidoNaFilaDePlaquinhas {
  return {
    id: linha.id,
    ref: linha.ref,
    petNome: linha.pet_name,
    petEspecie: linha.pet_species,
    observacao: linha.notes,
    status: linha.status,
    solicitadoEm: linha.requested_at,
    decididoEm: linha.decided_at,
  };
}

export function criarPedidoDePlaquinhaRepository(deps: {
  readonly db: Db;
}): PedidoDePlaquinhaRepository {
  return {
    async criarOuDevolverPendente(entrada): Promise<PedidoDoTutor | undefined> {
      const { id, ref, petId, solicitante, observacao } = entrada;

      // O `INSERT` e o `SELECT` que o autoriza, numa instrucao. O `SELECT`
      // interno e quem decide se existe pedido a criar.
      await sql`
        INSERT INTO collar_tag_requests (id, ref, pet_id, requested_by, notes)
        SELECT ${id}::uuid, ${ref}, p.id, ${solicitante}::uuid, ${observacao}
          FROM pets p
         WHERE p.id = ${petId}::uuid
           AND p.owner_user_id = ${solicitante}::uuid
           AND p.deleted_at IS NULL
        ON CONFLICT (pet_id) WHERE status = 'pending' DO NOTHING
      `.execute(deps.db);

      // A leitura carrega a MESMA autorizacao, e nao o `id` que acabou de ser
      // gerado: com `DO NOTHING` sobre pedido que ja existia, aquele `id` nao
      // foi gravado, e ler por ele devolveria vazio num caso legitimo.
      const lida = await sql<LinhaDoTutor>`
        SELECT r.status, r.requested_at, r.notes
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

    async listarFila(recorte: RecorteDaFilaDePlaquinhas): Promise<PaginaDaFilaDePlaquinhas> {
      const status: DecisaoDoPedidoDePlaquinha = recorte.status ?? 'pending';
      const deslocamento = (recorte.page - 1) * recorte.limit;

      const pagina = await sql<LinhaDaFila>`
        SELECT r.id, r.ref, p.name AS pet_name, p.species_code AS pet_species,
               r.notes, r.status, r.requested_at, r.decided_at
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.status = ${status}
         ORDER BY r.requested_at ASC
         LIMIT ${recorte.limit} OFFSET ${deslocamento}
      `.execute(deps.db);

      const contagem = await sql<{ total: string }>`
        SELECT count(*)::text AS total
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.status = ${status}
      `.execute(deps.db);

      return {
        itens: pagina.rows.map(comoPedidoNaFila),
        total: Number(contagem.rows[0]?.total ?? '0'),
      };
    },

    async pedidoPorRef(
      trx: TransacaoDeEscrita,
      ref: string,
    ): Promise<PedidoNaFilaDePlaquinhas | undefined> {
      // `FOR UPDATE OF r`: segura o pedido, e nao o pet. `FOR UPDATE` sem
      // alvo travaria `pets` tambem, e a decisao do painel nao tem motivo para
      // bloquear o tutor editando o animal.
      const lida = await sql<LinhaDaFila>`
        SELECT r.id, r.ref, p.name AS pet_name, p.species_code AS pet_species,
               r.notes, r.status, r.requested_at, r.decided_at
          FROM collar_tag_requests r
          JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
         WHERE r.ref = ${ref}
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
                  r.notes, r.status, r.requested_at, r.decided_at
      `.execute(trx);
      const linha = atualizada.rows[0];
      if (linha === undefined) {
        // Inalcancavel pela rota: `pedidoPorRef` acabou de travar a linha na
        // MESMA transacao. Lanca em vez de devolver um objeto inventado.
        throw new Error(`Pedido de plaquinha ${id} desapareceu dentro da transacao da decisao.`);
      }
      return comoPedidoNaFila(linha);
    },
  };
}
