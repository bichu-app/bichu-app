/**
 * A persistência do disparo: `alert_dispatches` e `alert_recipients`.
 *
 * ## `concluir` é uma transação, e é o ponto do arquivo
 *
 * Fechar o disparo são duas escritas — o total na linha do disparo e uma linha
 * por pessoa avisada — e metade delas é pior que nenhuma. O total sem a lista
 * faria o teto de fadiga dar de graça três alertas a quem acabou de receber; a
 * lista sem o total deixaria a métrica sem numerador, com as pessoas já
 * acordadas. As duas juntas ou nenhuma.
 *
 * ## `contextoDoCaso` não lê coordenada de tutor nenhum
 *
 * Ele lê a coordenada **do caso** (`lost_cases.last_seen_point`), que é o
 * centro do raio, e o bairro, que é o teto de precisão do aviso. Nenhuma
 * coordenada de tutor sai desta camada em nenhum momento, e é isso que faz o
 * critério 8 da BICHUS-18 valer por construção em vez de por cuidado: o dado
 * não existe no caminho.
 *
 * ## ADR-0021: aqui não há autorização, e a ausência é deliberada
 *
 * Nenhum método deste arquivo recebe dono, porque nenhum atende a uma
 * requisição. Quem chama é o worker, que trabalha por identificador de caso
 * vindo da própria fila. A autorização do caso acontece uma vez, na abertura
 * (`estadoParaAbertura`, com `owner_user_id` no `WHERE`), e um disparo só
 * existe para um caso que já passou por ela. Exigir dono aqui seria pedir ao
 * worker que inventasse um chamador que não existe.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { EstadoDoDisparo } from '../../domain/disparo-do-alerta.js';
import type {
  ConclusaoDoDisparo,
  ContextoDoCaso,
  DisparoGravado,
  NovoDisparo,
  RegistroDeDisparos,
} from '../../ports/registro-de-disparos.js';
import type { CaseId, Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoDisparo {
  id: string;
  case_id: string;
  reach_status: EstadoDoDisparo;
  recipients_total: number | null;
  radius_m: number;
  cap_reached: boolean;
  requested_at: Date;
  dispatched_at: Date | null;
}

function comoDisparo(linha: LinhaDoDisparo): DisparoGravado {
  return {
    id: linha.id,
    caso: linha.case_id as CaseId,
    estado: linha.reach_status,
    destinatarios: linha.recipients_total,
    raioEmMetros: linha.radius_m,
    tetoAtingido: linha.cap_reached,
    pedidoEm: linha.requested_at,
    enviadoEm: linha.dispatched_at,
  };
}

interface LinhaDoContexto {
  case_id: string;
  owner_user_id: string;
  lat: number | null;
  lon: number | null;
  last_seen_neighborhood: string | null;
  share_token: string;
  status: string;
  pet_name: string;
  species_code: string;
  card_key: string | null;
}

export function criarRegistroDeDisparos(db: Db): RegistroDeDisparos {
  return {
    async abrir(entrada: NovoDisparo): Promise<DisparoGravado> {
      const linha = await db
        .insertInto('alert_dispatches')
        .values({
          id: entrada.id,
          case_id: entrada.caso,
          radius_m: entrada.raioEmMetros,
          reach_status: entrada.estado,
          // `null` e não `0`, e o CHECK do banco torna o par errado
          // inexprimível: só `computed` tem número. Zero gravado aqui diria
          // "não há ninguém por perto" sobre um cálculo que nem começou.
          recipients_total: null,
          requested_at: comoData(entrada.pedidoEm),
          dispatched_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return comoDisparo(linha as unknown as LinhaDoDisparo);
    },

    async ultimoDoCaso(caso: CaseId): Promise<DisparoGravado | null> {
      const linha = await db
        .selectFrom('alert_dispatches')
        .selectAll()
        .where('case_id', '=', caso)
        // `requested_at` e não `dispatched_at`: o mais RECENTE inclui o que
        // ainda está enfileirado, e é ele que a tela precisa mostrar. Ordenar
        // por `dispatched_at` traria o último que saiu e esconderia o `queued`
        // de agora, fazendo a tela dizer que o alerta já foi.
        .orderBy('requested_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      return linha === undefined ? null : comoDisparo(linha as unknown as LinhaDoDisparo);
    },

    async ultimoEnvioDoCaso(caso: CaseId): Promise<Instant | null> {
      const linha = await db
        .selectFrom('alert_dispatches')
        .select('dispatched_at')
        .where('case_id', '=', caso)
        // O `WHERE` é o que separa este método do de cima: um disparo que ficou
        // enfileirado e nunca saiu não gastou o direito de ninguém a ser
        // avisado, e contá-lo bloquearia o alerta de hoje sem nunca ter
        // acordado uma única pessoa.
        .where('dispatched_at', 'is not', null)
        .orderBy('dispatched_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (linha?.dispatched_at == null) return null;
      return linha.dispatched_at.getTime() as Instant;
    },

    async contextoDoCaso(caso: CaseId): Promise<ContextoDoCaso | null> {
      // SQL cru pelo mesmo motivo da consulta de alcance: `geography` não é um
      // tipo que o modelo do Kysely represente, e `ST_Y`/`ST_X` sobre o
      // `::geometry` são o único caminho de leitura.
      //
      // A foto é a PRINCIPAL e pronta, e a derivada `card` e não o original: o
      // original mora no bucket privado e só sai por URL assinada curta, que
      // não é endereço que um transporte de terceiro possa guardar até o
      // aparelho aparecer.
      const resultado = await sql<LinhaDoContexto>`
        SELECT
          c.id                     AS case_id,
          c.owner_user_id          AS owner_user_id,
          ST_Y(c.last_seen_point::geometry) AS lat,
          ST_X(c.last_seen_point::geometry) AS lon,
          c.last_seen_neighborhood AS last_seen_neighborhood,
          c.share_token            AS share_token,
          c.status                 AS status,
          p.name                   AS pet_name,
          p.species_code           AS species_code,
          (
            SELECT f.card_key
              FROM pet_photos f
             WHERE f.pet_id = p.id
               AND f.status = 'ready'
               AND f.deleted_at IS NULL
             ORDER BY f.is_primary DESC, f.created_at ASC
             LIMIT 1
          ) AS card_key
          FROM lost_cases c
          JOIN pets p ON p.id = c.pet_id
         WHERE c.id = ${caso}
      `.execute(db);

      const linha = resultado.rows[0];
      if (linha === undefined) return null;

      return {
        caso: linha.case_id as CaseId,
        tutor: linha.owner_user_id as UserId,
        // As duas, ou nenhuma. `last_seen_point` é anulável e a anulabilidade é
        // a regra (critério 5 da BICHUS-21): sem ponto não há raio.
        centro:
          linha.lat === null || linha.lon === null
            ? undefined
            : { lat: linha.lat, lon: linha.lon },
        bairro: linha.last_seen_neighborhood,
        nomeDoPet: linha.pet_name,
        especie: linha.species_code,
        tokenPublico: linha.share_token,
        fotoKey: linha.card_key,
        aberto: linha.status === 'open',
      };
    },

    async concluir(entrada: ConclusaoDoDisparo): Promise<void> {
      const enviadoEm = comoData(entrada.enviadoEm);

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('alert_dispatches')
          .set({
            reach_status: entrada.estado,
            // O número é o tamanho da lista que acabou de ser gravada, e não
            // uma contagem feita à parte: é a mesma regra de `contagemDe`, um
            // nível abaixo. `unavailable` grava `null`, e o CHECK
            // `alert_dispatches_total_so_quando_calculado` recusa o par errado.
            recipients_total: entrada.estado === 'computed' ? entrada.avisados.length : null,
            cap_reached: entrada.tetoAtingido,
            dispatched_at: enviadoEm,
          })
          .where('id', '=', entrada.id)
          .execute();

        if (entrada.avisados.length === 0) return;

        await trx
          .insertInto('alert_recipients')
          .values(
            entrada.avisados.map((usuario) => ({
              dispatch_id: entrada.id,
              user_id: usuario,
              notified_at: enviadoEm,
            })),
          )
          // A chave composta já torna a duplicata inexprimível; isto é o que
          // faz uma retentativa do mesmo disparo não estourar no meio do
          // caminho depois de metade das pessoas já ter recebido.
          .onConflict((oc) => oc.columns(['dispatch_id', 'user_id']).doNothing())
          .execute();
      });
    },
  };
}
