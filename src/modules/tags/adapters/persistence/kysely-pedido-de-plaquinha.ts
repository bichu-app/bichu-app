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
 * ## O ENDERECO E DADO PESSOAL, e este arquivo e onde ele toca o disco
 *
 * Tres coisas que NAO acontecem aqui, e cada uma e deliberada:
 *
 * - **nenhum `console`, nenhum `log`, nenhum `RAISE`** com conteudo de
 *   endereco. O unico lugar onde ele aparece e o `INSERT`, parametrizado;
 * - **nada e geocodificado e nenhum CEP e resolvido** (ADR-0006). Nao ha
 *   chamada externa, nao ha `lat`/`lon` e nao ha `geography`;
 * - **a leitura da fila e a unica que projeta endereco**, e ela so e
 *   alcancavel pela superficie administrativa. `criarOuDevolverPendente`
 *   devolve [PedidoDoTutor], que nao tem endereco nenhum.
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

// COSTURA DA MESCLA 18/10: `ref` vem da frente do aplicativo (a pagina de
// acompanhamento precisa de um numero para a pessoa falar do pedido dela) e os
// quatro campos de entrega vem da frente do painel. A leitura do dono carrega
// os dois conjuntos, e nao um ou outro.
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

/**
 * Os quatro campos da entrega, num lugar so: as duas projecoes -- a do tutor e a
 * da fila -- os leem igual, e duplicar a leitura seria o jeito de uma delas
 * passar a divergir.
 */
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
    // COSTURA DA MESCLA 18/10: aqui havia `codigoDeRastreio: null` fixo, com o
    // comentario de que "nao existe coluna que o guarde". A coluna passou a
    // existir na MESMA data, pela `20261018000004`, e o rastreio agora sai do
    // banco pelos quatro campos de `comoEntrega`. O nulo fixo foi retirado: ele
    // apagaria o rastreio real que o painel escreve.
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

/**
 * As quatro colunas da entrega, num fragmento so.
 *
 * Elas entram em SEIS consultas deste arquivo, e escrever a lista seis vezes e
 * o jeito conhecido de uma delas ficar para tras: a projecao devolveria
 * `undefined` num campo que o contrato declara, e so a tela notaria.
 */
const COLUNAS_DA_ENTREGA = sql`r.delivery_state, r.tracking_code, r.shipped_at, r.delivered_at`;

/**
 * O PREDICADO DA CONTA DESABILITADA, e ele entra em TRES lugares.
 *
 * Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
 * nenhuma pagina ou funcionalidade". Pedido de quem desabilitou a conta nao
 * aparece na fila administrativa -- nem na listagem, nem na CONTAGEM dela, nem
 * na leitura de um.
 *
 * **Sao tres, e nao um.** Na fila da Rede, filtrar so a listagem fez o painel
 * dizer "1 pendente" sobre uma fila vazia, e quem abriu procurou um pedido que
 * a listagem nao mostrava mais. A `20261017000016` deixou isso escrito, e aqui
 * o arranjo e o mesmo.
 *
 * `conta_habilitada(uuid)` e chamada DIRETO, e nao por funcao intermediaria como
 * `indicacao_com_autor_ativo`: aquele desvio existe porque a coluna de autoria da
 * indicacao leva a marca `NUNCA sai do servidor` e
 * `portao-colunas-que-nao-saem.ts` varre `src/` pelo nome literal dela.
 * `collar_tag_requests.requested_by` NAO leva essa marca -- este mesmo arquivo
 * ja a escreve no `INSERT` --, entao a chamada direta e legitima e evita uma
 * funcao de banco a mais.
 */
const SOLICITANTE_ATIVO = sql<boolean>`conta_habilitada(r.requested_by)`;

export function criarPedidoDePlaquinhaRepository(deps: {
  readonly db: Db;
}): PedidoDePlaquinhaRepository {
  return {
    async criarOuDevolverPendente(entrada): Promise<PedidoDoTutor | undefined> {
      const { id, ref, petId, solicitante, endereco, observacao } = entrada;

      // O `INSERT` e o `SELECT` que o autoriza, numa instrucao. O `SELECT`
      // interno e quem decide se existe pedido a criar.
      //
      // Todo valor de endereco viaja PARAMETRIZADO. Nenhum deles e
      // interpolado em texto de consulta, e nenhum e registrado: um endereco
      // num log de consulta lenta sobreviveria a exclusao da conta.
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

      // A leitura carrega a MESMA autorizacao, e nao o `id` que acabou de ser
      // gerado: com `DO NOTHING` sobre pedido que ja existia, aquele `id` nao
      // foi gravado, e ler por ele devolveria vazio num caso legitimo.
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
      // DUAS consultas, e nao uma, porque sao DUAS perguntas diferentes: "o
      // pet e seu?" e "quais os pedidos dele?". Uma consulta so devolveria
      // vazio nos dois casos, e a rota nao teria como distinguir 404 de uma
      // lista legitimamente vazia -- a pagina do pet recem-cadastrado passaria
      // a dizer que o pet nao existe.
      //
      // A autorizacao e a MESMA clausula `WHERE` da criacao, com a mesma
      // forma: dono e `deleted_at IS NULL`. Nao ha comparacao de dono em
      // JavaScript em lugar nenhum deste arquivo.
      const dono = await sql<{ id: string }>`
        SELECT p.id
          FROM pets p
         WHERE p.id = ${petId}::uuid
           AND p.owner_user_id = ${solicitante}::uuid
           AND p.deleted_at IS NULL
      `.execute(deps.db);
      if (dono.rows[0] === undefined) return undefined;

      // COSTURA DA MESCLA 18/10: `${COLUNAS_DA_ENTREGA}` entrou AQUI na mescla.
      // Esta consulta nasceu na frente do aplicativo, quando `LinhaDoTutor` nao
      // tinha os campos de entrega; a frente do painel acrescentou os quatro a
      // interface mas nao a esta consulta, que ela nao conhecia. Como
      // `sql<LinhaDoTutor>` e asserção e nao conferencia, o `tsc` ficaria verde
      // e os quatro campos chegariam `undefined` em TEMPO DE EXECUCAO -- a tela
      // do pedido desenharia o passo a partir de nada. Sem esta linha a costura
      // nao existe.
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

      // O filtro de PASSO e opcional e combina com o de `status`, em vez de
      // substitui-lo: os dois sao eixos diferentes. Ausente, vira `TRUE` e a
      // consulta nao muda de forma -- um `WHERE` montado por concatenacao de
      // texto seria a porta que este projeto nao abre.
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

      // A CONTAGEM carrega os MESMOS tres predicados da pagina. Um numero que
      // conte o que a pagina nao mostra e o defeito de "1 pendente" sobre fila
      // vazia, e ele nasce exatamente de divergir aqui.
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
      // SEM `FOR UPDATE`: e leitura. E COM `conta_habilitada`, que e o terceiro
      // dos tres lugares -- sem ele, o pedido que a listagem esconde voltaria a
      // ser alcancavel por quem tivesse o `ref`.
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
      // `FOR UPDATE OF r`: segura o pedido, e nao o pet. `FOR UPDATE` sem
      // alvo travaria `pets` tambem, e a decisao do painel nao tem motivo para
      // bloquear o tutor editando o animal.
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
        // Inalcancavel pela rota: `pedidoPorRef` acabou de travar a linha na
        // MESMA transacao. Lanca em vez de devolver um objeto inventado.
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
      // OS CARIMBOS SAO DERIVADOS DO PASSO, aqui dentro, e nao recebidos de
      // fora. Os dois `CHECK` bicondicionais do banco
      // (`despacho_tem_instante`, `chegada_tem_instante`) exigem o instante
      // exatamente quando o passo o exige, e deixar essa aritmetica para quem
      // chama seria deixar uma violacao de restricao esperando por um descuido.
      //
      // `shipped_at` usa `COALESCE`: marcar a chegada NAO reescreve o instante
      // do despacho, que foi registrado quando a encomenda saiu. Sem o
      // `COALESCE`, "chegou" moveria o carimbo de "saiu" para agora e a tela
      // mostraria os dois passos no mesmo minuto.
      const despachadoEm =
        entrega.passo === 'requested' ? sql`NULL` : sql`COALESCE(r.shipped_at, ${agora})`;
      const entregueEm = entrega.passo === 'arrived' ? sql`${agora}` : sql`NULL`;

      // Os TRES casos do rastreio, e os tres sao diferentes: `manter` nao toca
      // a coluna, `apagar` a zera, `definir` a escreve. `manter` e o que faz
      // "marcar que chegou" nao limpar o codigo que ja estava la.
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
        // Inalcancavel pela rota: `pedidoPorRef` acabou de travar a linha na
        // MESMA transacao. Lanca em vez de devolver um objeto inventado.
        throw new Error(`Pedido de plaquinha ${id} desapareceu dentro da transacao da entrega.`);
      }
      return comoPedidoNaFila(linha);
    },
  };
}
