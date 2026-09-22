/**
 * Persistencia da transferencia de pet.
 *
 * **A autorizacao mora na clausula `WHERE`** (ADR-0021), e nao num `if` depois
 * da busca. `buscarDoTutor` traz `from_user_id = :dono` junto de `id = :t`, e e
 * por isso que a porta exige o dono como argumento: a consulta que devolveria a
 * transferencia de outro tutor nao existe neste arquivo.
 *
 * ## As condicoes de estado tambem moram no `WHERE`, e isso nao e estilo
 *
 * `registrarAceite`, `cancelar` e `consumar` levam o estado esperado para dentro
 * do `UPDATE`. Ler, decidir em JavaScript e escrever depois funciona em teste e
 * abre uma janela em producao: dois aceites do mesmo convite, ou um cancelamento
 * chegando no milissegundo da consumacao, passam os dois pela leitura e escrevem
 * os dois. Com a condicao no `WHERE`, o segundo acerta zero linhas e o chamador
 * recebe "o estado mudou" -- que e a verdade.
 *
 * ## Por que a consumacao e uma transacao so
 *
 * Trocar o dono e revogar as tags sao duas escritas que nao podem existir uma
 * sem a outra. Separadas, existe um instante em que o pet e do tutor novo e a
 * plaquinha antiga ainda resolve -- e um processo que morra ali deixa esse
 * estado permanente, com o tutor anterior podendo ler o QR do animal que nao e
 * mais dele.
 */
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type {
  ConviteResolvido,
  NovaTransferencia,
  ResultadoDaAbertura,
  ResultadoDaConsumacao,
  ResultadoDoAceite,
  TransferId,
  TransferRepository,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../../ports/transfer-repository.js';
import type {
  MotivoDoCancelamento,
  StatusDaTransferencia,
} from '../../domain/janela-da-transferencia.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';

/**
 * Os dois estados que ocupam a vaga do indice parcial
 * `pet_transfers_uma_viva_por_pet`. A lista esta escrita aqui **e** na migracao,
 * e as duas precisam concordar: `tests/integration/transferencia-de-pet.test.ts`
 * compara esta constante com o predicado que o catalogo do Postgres guarda, em
 * vez de confiar que alguem manteve as duas em sincronia.
 */
export const ESTADOS_VIVOS = ['pending_acceptance', 'accepted'] as const;

/**
 * O que substitui o resumo do convite quando ele e consumido.
 *
 * Nao e `null` porque a coluna e `NOT NULL` -- e ela e `NOT NULL` de proposito:
 * linha de transferencia sem resumo de convite nunca existiu, e permitir o nulo
 * abriria a porta para uma insercao que esquecesse o token. Trinta e dois zeros
 * satisfazem o `CHECK` de tamanho e nao sao o resumo de nada que um gerador de
 * 256 bits produza: nenhum token apresentado vai casar com isto.
 *
 * E por causa desta queima que `pet_transfers_invite_token` e um indice PARCIAL
 * sobre `status = 'pending_acceptance'`: queimados, todos os convites aceitos
 * carregam o mesmo valor, e um indice unico total recusaria o segundo aceite do
 * sistema inteiro.
 */
const RESUMO_QUEIMADO = Buffer.alloc(32);

/** As colunas da visao do tutor, num lugar so: cinco consultas usam a lista. */
const COLUNAS = [
  'pet_transfers.id',
  'pet_transfers.pet_id',
  'pet_transfers.from_user_id',
  'pet_transfers.to_user_id',
  'pet_transfers.recipient_email',
  'pet_transfers.status',
  'pet_transfers.invite_expires_at',
  'pet_transfers.accepted_at',
  'pet_transfers.effective_at',
  'pet_transfers.cancelled_at',
  'pet_transfers.cancellation_reason',
] as const;

/** As mesmas colunas sem o prefixo da tabela, para `RETURNING`. */
const COLUNAS_DE_RETORNO = [
  'id',
  'pet_id',
  'from_user_id',
  'to_user_id',
  'recipient_email',
  'status',
  'invite_expires_at',
  'accepted_at',
  'effective_at',
  'cancelled_at',
  'cancellation_reason',
] as const;

interface Linha {
  id: string;
  pet_id: string;
  from_user_id: string;
  to_user_id: string | null;
  recipient_email: string;
  status: StatusDaTransferencia;
  invite_expires_at: Date;
  accepted_at: Date | null;
  effective_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: MotivoDoCancelamento | null;
}

function comoDominio(linha: Linha): TransferenciaGravada {
  return {
    id: linha.id as TransferId,
    petId: linha.pet_id as PetId,
    fromUserId: linha.from_user_id as UserId,
    toUserId: linha.to_user_id === null ? null : (linha.to_user_id as UserId),
    recipientEmail: linha.recipient_email,
    status: linha.status,
    inviteExpiresAt: linha.invite_expires_at,
    acceptedAt: linha.accepted_at,
    effectiveAt: linha.effective_at,
    cancelledAt: linha.cancelled_at,
    cancellationReason: linha.cancellation_reason,
  };
}

// ---------------------------------------------------------------------------
// OS CONSTRUTORES, EXPORTADOS
// ---------------------------------------------------------------------------
// Eles existem separados dos metodos por um motivo so: `autorizacao-na-clausula-
// where.test.ts` os COMPILA com `DummyDriver`, sem banco, e le o predicado que
// saiu. Uma conferencia que lesse o texto-fonte deste arquivo casaria com a
// mencao da coluna dentro destes proprios comentarios e ficaria verde com a
// clausula removida.
//
// Consequencia: quem mexer numa destas funcoes mexe na coisa que o portao le.
// Reescrever a consulta inline dentro do metodo devolve o adaptador ao estado em
// que a autorizacao vale por confianca.

/** A busca vinculada da transferencia: `id` E `from_user_id`, juntos. */
export function construtorDaBuscaDoTutor(db: DbExecutor, t: string, dono: string) {
  return db
    .selectFrom('pet_transfers')
    .select([...COLUNAS])
    .where('pet_transfers.id', '=', t)
    // ESTA LINHA E A AUTORIZACAO. Sem ela a rota devolve a transferencia de
    // qualquer tutor para qualquer conta autenticada.
    .where('pet_transfers.from_user_id', '=', dono);
}

/** A conferencia do pet antes de abrir: `id` E `owner_user_id`, juntos. */
export function construtorDoPetDoTutor(db: DbExecutor, pet: string, dono: string) {
  return db
    .selectFrom('pets')
    .select('pets.id')
    .where('pets.id', '=', pet)
    .where('pets.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null);
}

/**
 * O aceite, com as DUAS condicoes de estado no `WHERE`.
 *
 * Sem `status = 'pending_acceptance'`, dois aceites do mesmo convite agendam
 * duas consumacoes. Sem `invite_expires_at > agora`, um convite vencido e aceito
 * por quem guardou o e-mail por uma semana.
 */
export function construtorDoAceite(
  db: DbExecutor,
  entrada: {
    readonly transferencia: string;
    readonly toUserId: string;
    readonly cancelTokenHash: Uint8Array;
    readonly acceptedAt: Instant;
    readonly effectiveAt: Instant;
  },
) {
  return db
    .updateTable('pet_transfers')
    .set({
      to_user_id: entrada.toUserId,
      cancel_token_hash: Buffer.from(entrada.cancelTokenHash),
      status: 'accepted',
      accepted_at: new Date(entrada.acceptedAt),
      effective_at: new Date(entrada.effectiveAt),
      // USO UNICO, na mesma escrita que registra o aceite (criterio 3 da
      // BICHUS-66). A condicao `status = 'pending_acceptance'` ja bastaria para
      // recusar um segundo aceite, mas ela e uma conferencia; apagar o resumo e
      // o segredo deixando de existir. Os dois, e nao um.
      invite_token_hash: RESUMO_QUEIMADO,
    })
    .where('id', '=', entrada.transferencia)
    .where('status', '=', 'pending_acceptance')
    .where('invite_expires_at', '>', new Date(entrada.acceptedAt))
    .returning([...COLUNAS_DE_RETORNO]);
}

/**
 * O cancelamento, condicionado a linha ainda estar viva.
 *
 * `status IN ('pending_acceptance','accepted')` e o que faz o token parar de
 * funcionar depois da consumacao, sem depender de nenhuma leitura anterior ter
 * acontecido.
 */
export function construtorDoCancelamento(
  db: DbExecutor,
  entrada: {
    readonly transferencia: string;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
    readonly consumirTokenDeCancelamento: boolean;
  },
) {
  return db
    .updateTable('pet_transfers')
    .set({
      status: 'cancelled',
      cancelled_at: new Date(entrada.quando),
      cancellation_reason: entrada.motivo,
      ...(entrada.consumirTokenDeCancelamento ? { cancel_token_hash: null } : {}),
    })
    .where('id', '=', entrada.transferencia)
    .where('status', 'in', [...ESTADOS_VIVOS])
    .returning([...COLUNAS_DE_RETORNO]);
}

/** A troca de dono, condicionada a o pet ainda ser de quem iniciou. */
export function construtorDaTrocaDeDono(
  db: DbExecutor,
  pet: string,
  deQuem: string,
  paraQuem: string,
  agora: Instant,
) {
  return db
    .updateTable('pets')
    .set({ owner_user_id: paraQuem, updated_at: new Date(agora) })
    .where('id', '=', pet)
    // Se o pet ja nao e de quem iniciou, algo fora desta maquina de estado
    // mexeu na posse, e consumar por cima disso apagaria essa mudanca.
    .where('owner_user_id', '=', deQuem)
    .where('deleted_at', 'is', null);
}

/** A revogacao de TODAS as tags ativas do pet, com `pet_transferred`. */
export function construtorDaRevogacaoDasTags(db: DbExecutor, pet: string, agora: Instant) {
  return db
    .updateTable('pet_tags')
    .set({
      status: 'revoked',
      revoked_at: new Date(agora),
      revocation_reason: 'pet_transferred',
      // O cifrado existe para UM proposito, reimprimir o QR. Reimprimir uma
      // plaquinha revogada entregaria um arquivo com cara de bom para uma
      // coleira que responde "tag desativada" (ADR-0004).
      code_ciphertext: null,
    })
    .where('pet_id', '=', pet)
    .where('status', '=', 'active');
}

/** Ha caso de perdido ABERTO para este pet? Uma consulta, usada em dois pontos. */
async function temCasoAberto(trx: DbExecutor, pet: string): Promise<boolean> {
  const caso = await trx
    .selectFrom('lost_cases')
    .select('lost_cases.id')
    .where('lost_cases.pet_id', '=', pet)
    .where('lost_cases.status', '=', 'open')
    .executeTakeFirst();
  return caso !== undefined;
}

export function criarTransferRepository(db: Db): TransferRepository {
  return {
    async abrir(nova: NovaTransferencia, agora: Instant): Promise<ResultadoDaAbertura> {
      return db.transaction().execute(async (trx): Promise<ResultadoDaAbertura> => {
        // A AUTORIZACAO E A PRIMEIRA COISA, e ela e vinculada: `id` e
        // `owner_user_id` na mesma clausula. `FOR UPDATE` porque entre esta
        // leitura e a insercao alguem pode excluir o pet.
        const pet = await construtorDoPetDoTutor(trx, nova.petId, nova.fromUserId)
          .forUpdate()
          .executeTakeFirst();
        if (pet === undefined) return { tipo: 'pet_nao_e_deste_tutor' };

        if (await temCasoAberto(trx, nova.petId)) return { tipo: 'caso_aberto' };

        // A conferencia da a MENSAGEM; o indice parcial da a GARANTIA. As duas,
        // e nao uma: sem a conferencia o tutor receberia 500 de violacao de
        // restricao, e sem o indice duas requisicoes simultaneas abririam duas
        // transferencias para o mesmo pet.
        const viva = await trx
          .selectFrom('pet_transfers')
          .select('pet_transfers.id')
          .where('pet_transfers.pet_id', '=', nova.petId)
          .where('pet_transfers.status', 'in', [...ESTADOS_VIVOS])
          .executeTakeFirst();
        if (viva !== undefined) return { tipo: 'ja_em_andamento' };

        const linha = await trx
          .insertInto('pet_transfers')
          .values({
            id: nova.id,
            pet_id: nova.petId,
            from_user_id: nova.fromUserId,
            recipient_email: nova.recipientEmail,
            invite_token_hash: Buffer.from(nova.inviteTokenHash),
            status: 'pending_acceptance',
            invite_expires_at: new Date(nova.inviteExpiresAt),
            created_at: new Date(agora),
          })
          .returning([...COLUNAS_DE_RETORNO])
          .executeTakeFirstOrThrow();

        return { tipo: 'aberta', transferencia: comoDominio(linha) };
      });
    },

    async buscarDoTutor(transferencia: TransferId, dono: UserId) {
      const linha = (await construtorDaBuscaDoTutor(
        db,
        transferencia,
        dono,
      ).executeTakeFirst()) as Linha | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async buscarPorTokenDeConvite(hash: Uint8Array): Promise<ConviteResolvido | undefined> {
      const linha = await db
        .selectFrom('pet_transfers')
        .select([
          'pet_transfers.id',
          'pet_transfers.pet_id',
          'pet_transfers.from_user_id',
          'pet_transfers.recipient_email',
          'pet_transfers.status',
          'pet_transfers.invite_expires_at',
        ])
        .where('pet_transfers.invite_token_hash', '=', Buffer.from(hash))
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        id: linha.id as TransferId,
        petId: linha.pet_id as PetId,
        fromUserId: linha.from_user_id as UserId,
        recipientEmail: linha.recipient_email,
        status: linha.status,
        inviteExpiresAt: linha.invite_expires_at,
      };
    },

    async buscarPorTokenDeCancelamento(
      hash: Uint8Array,
    ): Promise<TransferenciaPorTokenDeCancelamento | undefined> {
      // O NOME DO PET VEM DA JUNCAO, e nao de uma copia na linha. E a unica
      // coisa que a superficie publica mostra, e uma copia congelaria o nome
      // que o pet tinha no dia do aceite.
      const linha = await db
        .selectFrom('pet_transfers')
        .innerJoin('pets', 'pets.id', 'pet_transfers.pet_id')
        .select([
          'pet_transfers.id',
          'pets.name as pet_name',
          'pet_transfers.status',
          'pet_transfers.effective_at',
          'pet_transfers.created_at',
        ])
        .where('pet_transfers.cancel_token_hash', '=', Buffer.from(hash))
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        id: linha.id as TransferId,
        petDisplayName: linha.pet_name,
        status: linha.status,
        effectiveAt: linha.effective_at,
        requestedAt: linha.created_at,
      };
    },

    async registrarAceite(entrada): Promise<ResultadoDoAceite> {
      const linha = (await construtorDoAceite(db, entrada).executeTakeFirst()) as
        | Linha
        | undefined;
      // Zero linhas afetadas significa que a condicao do `WHERE` nao valeu mais:
      // outra requisicao aceitou, o tutor cancelou, ou o convite venceu no meio.
      if (linha === undefined) return { tipo: 'estado_mudou' };
      return { tipo: 'aceita', transferencia: comoDominio(linha) };
    },

    async cancelar(entrada): Promise<TransferenciaGravada | undefined> {
      const linha = (await construtorDoCancelamento(db, entrada).executeTakeFirst()) as
        | Linha
        | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async cancelarVivaDoPet(entrada): Promise<TransferenciaGravada | undefined> {
      const linha = (await db
        .updateTable('pet_transfers')
        .set({
          status: 'cancelled',
          cancelled_at: new Date(entrada.quando),
          cancellation_reason: entrada.motivo,
          cancel_token_hash: null,
        })
        .where('pet_id', '=', entrada.pet)
        .where('status', 'in', [...ESTADOS_VIVOS])
        .returning([...COLUNAS_DE_RETORNO])
        .executeTakeFirst()) as unknown as Linha | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async expirar(transferencia: TransferId, quando: Instant): Promise<boolean> {
      const r = await db
        .updateTable('pet_transfers')
        // Mesma razao da consumacao: estado terminal nao guarda credencial.
        .set({ status: 'expired', cancel_token_hash: null })
        .where('id', '=', transferencia)
        .where('status', '=', 'pending_acceptance')
        .where('invite_expires_at', '<=', new Date(quando))
        .executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },

    async consumar(transferencia: TransferId, agora: Instant): Promise<ResultadoDaConsumacao> {
      return db.transaction().execute(async (trx): Promise<ResultadoDaConsumacao> => {
        const linha = (await trx
          .selectFrom('pet_transfers')
          .select([...COLUNAS])
          .where('pet_transfers.id', '=', transferencia)
          // `FOR UPDATE` e nao leitura otimista: e a linha que vai trocar o dono
          // de um pet e matar plaquinhas. Duas consumacoes simultaneas da mesma
          // linha revogariam as tags duas vezes e gravariam a trilha duas vezes.
          .forUpdate()
          .executeTakeFirst()) as Linha | undefined;

        if (linha === undefined) return { tipo: 'ja_resolvida' };
        if (linha.status !== 'accepted') return { tipo: 'ja_resolvida' };
        if (linha.effective_at === null) return { tipo: 'ja_resolvida' };
        if (agora < linha.effective_at.getTime()) {
          return { tipo: 'ainda_na_janela', effectiveAt: linha.effective_at };
        }

        // A RECONFERENCIA DO CASO ABERTO, dentro da transacao que trocaria o
        // dono. O trabalho foi agendado 24 h antes, e a barreira que vale numa
        // operacao irreversivel e a que o banco segura, nao a que alguem checou
        // um dia atras.
        if (await temCasoAberto(trx, linha.pet_id)) return { tipo: 'caso_aberto' };

        // `ON DELETE SET NULL` na FK do destinatario: nulo aqui significa que a
        // conta dele deixou de existir depois do aceite. Nao ha para quem
        // transferir, e revogar as tags do pet seria destruicao pura.
        if (linha.to_user_id === null) return { tipo: 'destinatario_sumiu' };
        const novoDono = linha.to_user_id;

        const trocou = await construtorDaTrocaDeDono(
          trx,
          linha.pet_id,
          linha.from_user_id,
          novoDono,
          agora,
        ).executeTakeFirst();
        if (Number(trocou.numUpdatedRows) === 0) return { tipo: 'ja_resolvida' };

        // TODAS AS TAGS ATIVAS CAEM, COM `pet_transferred` (ADR-0004, ciclo de
        // vida), na MESMA transacao da troca de dono.
        const revogadas = await construtorDaRevogacaoDasTags(
          trx,
          linha.pet_id,
          agora,
        ).executeTakeFirst();

        const atualizada = await trx
          .updateTable('pet_transfers')
          // O RESUMO DO TOKEN MORRE AQUI TAMBEM, e nao so no cancelamento.
          // Medido contra Postgres: sem esta linha o token de cancelamento
          // continuava RESOLVENDO para uma linha `effective`. O servico
          // recusava (o 410 vem de `podeCancelar`), entao a rota estava certa
          // -- mas o resumo de uma credencial gasta ficava no banco para
          // sempre, e a corretude passava a depender de uma conferencia na
          // aplicacao em vez de o segredo simplesmente nao existir mais.
          .set({ status: 'effective', cancel_token_hash: null })
          .where('id', '=', transferencia)
          .where('status', '=', 'accepted')
          .returning([...COLUNAS_DE_RETORNO])
          .executeTakeFirstOrThrow();

        return {
          tipo: 'consumada',
          transferencia: comoDominio(atualizada),
          tagsRevogadas: Number(revogadas.numUpdatedRows),
        };
      });
    },
  };
}

/**
 * As transferencias que o worker precisa olhar: as vencidas por falta de aceite
 * e as que passaram do instante de consumacao.
 *
 * Existe porque trabalho agendado pode nao ter rodado -- processo caido, fila
 * atrasada, banco restaurado de backup. Sem esta varredura, uma transferencia
 * aceita ficaria `accepted` para sempre, com a tela do tutor dizendo que a
 * janela corre e nada acontecendo quando ela fecha.
 */
export async function transferenciasVencidas(
  db: Db,
  agora: Instant,
  limite: number,
): Promise<{ aExpirar: TransferId[]; aConsumar: TransferId[] }> {
  const quando = new Date(agora);
  const aExpirar = await db
    .selectFrom('pet_transfers')
    .select('id')
    .where('status', '=', 'pending_acceptance')
    .where('invite_expires_at', '<=', quando)
    .limit(limite)
    .execute();
  const aConsumar = await db
    .selectFrom('pet_transfers')
    .select('id')
    .where('status', '=', 'accepted')
    .where('effective_at', '<=', quando)
    .limit(limite)
    .execute();
  return {
    aExpirar: aExpirar.map((l) => l.id as TransferId),
    aConsumar: aConsumar.map((l) => l.id as TransferId),
  };
}
