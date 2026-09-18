/**
 * Persistência do caso de perdido.
 *
 * Três pontos que não são detalhe de implementação:
 *
 * **A autorização mora na cláusula `WHERE`.** Toda leitura e toda escrita
 * carregam `owner_user_id = :dono`; a consulta que devolveria o caso de outro
 * tutor não existe neste arquivo. Caso alheio responde 404, e aqui isso vale
 * duas vezes: um 403 confirmaria que aquele pet está perdido.
 *
 * **A abertura pode perder uma corrida, e isso é tratado, não evitado.** O
 * índice único parcial `lost_cases_um_aberto_por_pet` é quem garante um caso
 * aberto por pet. Conferir antes e inserir depois deixaria a janela aberta
 * entre as duas operações — e a fila offline do app reenvia exatamente assim,
 * em rajada, quando o sinal volta. O `ON CONFLICT DO NOTHING` transforma a
 * corrida perdida em `null`, que o serviço lê como "já existe".
 *
 * **O ponto entra por SQL e nunca sai.** `ST_MakePoint` grava; nenhuma leitura
 * deste arquivo seleciona `last_seen_point`. O que sai é `has_location`, um
 * booleano — a coordenada não tem por que atravessar a aplicação, e o jeito mais
 * barato de garantir que ela não vaze é ela não estar disponível.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { rotuloDaArea } from '../../domain/abertura-do-caso.js';
import type {
  CanalDoReencontro,
  CasoGravado,
  DesfechoDoCaso,
  EstadoDoPetParaAbertura,
  LostCaseRepository,
  NovoCaso,
  StatusDoCaso,
} from '../../ports/lost-case-repository.js';
import type { CaseId, PetId, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoCaso {
  id: string;
  pet_id: string;
  status: StatusDoCaso;
  last_seen_at: Date;
  tem_ponto: boolean;
  last_seen_city: string | null;
  last_seen_neighborhood: string | null;
  description: string | null;
  share_token: string;
  share_to_public_list: boolean;
  opened_at: Date;
  closed_at: Date | null;
  closure_outcome: DesfechoDoCaso | null;
  closure_channel: CanalDoReencontro | null;
  closure_note: string | null;
}

function comoCaso(l: LinhaDoCaso): CasoGravado {
  return {
    id: l.id as CaseId,
    petId: l.pet_id as PetId,
    status: l.status,
    lastSeenAt: l.last_seen_at,
    hasLocation: l.tem_ponto,
    areaLabel: rotuloDaArea({
      city: l.last_seen_city ?? undefined,
      neighborhood: l.last_seen_neighborhood ?? undefined,
    }),
    description: l.description,
    shareToken: l.share_token,
    shareToPublicList: l.share_to_public_list,
    openedAt: l.opened_at,
    closedAt: l.closed_at,
    closureOutcome: l.closure_outcome,
    closureChannel: l.closure_channel,
    closureNote: l.closure_note,
  };
}

/**
 * As colunas da leitura do dono.
 *
 * `last_seen_point` **não está aqui**, e a ausência é a regra: o que sai é
 * `tem_ponto`, um booleano calculado no banco. A coordenada fica onde foi
 * gravada.
 */
const COLUNAS = sql<LinhaDoCaso>`
  id, pet_id, status, last_seen_at,
  (last_seen_point IS NOT NULL) AS tem_ponto,
  last_seen_city, last_seen_neighborhood, description,
  share_token, share_to_public_list, opened_at,
  closed_at, closure_outcome, closure_channel, closure_note
`;

export function criarLostCaseRepository(db: Db): LostCaseRepository {
  return {
    async estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura> {
      // UMA consulta para as cinco perguntas. Quem está do outro lado tem 11%
      // de bateria e um animal desaparecido; cinco idas ao banco aqui é latência
      // que dá para não gastar.
      const linha = await sql<{
        existe: boolean;
        tem_foto_pronta: boolean;
        pet_ja_perdido: boolean;
        abertos_da_conta: number;
        tem_canal: boolean;
      }>`
        SELECT
          EXISTS (
            SELECT 1 FROM pets p
             WHERE p.id = ${pet} AND p.owner_user_id = ${dono} AND p.deleted_at IS NULL
          ) AS existe,
          EXISTS (
            SELECT 1 FROM pet_photos f
             WHERE f.pet_id = ${pet} AND f.status = 'ready' AND f.deleted_at IS NULL
          ) AS tem_foto_pronta,
          EXISTS (
            SELECT 1 FROM lost_cases c WHERE c.pet_id = ${pet} AND c.status = 'open'
          ) AS pet_ja_perdido,
          (
            SELECT count(*) FROM lost_cases c
             WHERE c.owner_user_id = ${dono} AND c.status = 'open'
          )::int AS abertos_da_conta,
          -- E-mail OU telefone. Preenchido e não verificado não conta: contato
          -- não verificado é contato que não sabemos se alcança alguém.
          EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = ${dono}
               AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL)
          ) AS tem_canal
      `.execute(db);

      const r = linha.rows[0]!;
      return {
        existeEhDoTutor: r.existe,
        temFotoPronta: r.tem_foto_pronta,
        petJaTemCasoAberto: r.pet_ja_perdido,
        casosAbertosDaConta: Number(r.abertos_da_conta),
        temCanalVerificado: r.tem_canal,
      };
    },

    async abrir(novo: NovoCaso): Promise<CasoGravado | null> {
      const ponto =
        novo.lat === undefined || novo.lon === undefined
          ? sql`NULL`
          : sql`ST_SetSRID(ST_MakePoint(${novo.lon}, ${novo.lat}), 4326)::geography`;

      // `ON CONFLICT DO NOTHING` sobre o índice parcial: a corrida perdida sai
      // como zero linhas, e não como exceção. Exceção aqui viraria 500 para um
      // caso que o produto sabe explicar.
      const r = await sql<LinhaDoCaso>`
        INSERT INTO lost_cases (
          id, pet_id, owner_user_id, last_seen_at, last_seen_point,
          last_seen_city, last_seen_neighborhood, last_seen_state,
          description, share_to_public_list, share_token
        ) VALUES (
          ${novo.id}, ${novo.petId}, ${novo.ownerUserId}, ${new Date(Number(novo.lastSeenAt))}, ${ponto},
          ${novo.city ?? null}, ${novo.neighborhood ?? null}, ${novo.state ?? null},
          ${novo.description ?? null}, ${novo.shareToPublicList}, ${novo.shareToken}
        )
        ON CONFLICT DO NOTHING
        RETURNING ${COLUNAS}
      `.execute(db);

      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null> {
      const r = await sql<LinhaDoCaso>`
        SELECT ${COLUNAS} FROM lost_cases
         WHERE id = ${caso} AND owner_user_id = ${dono}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async encerrar(entrada): Promise<CasoGravado | null> {
      // `status = 'open'` no `WHERE` e não num `if` antes: encerrar duas vezes é
      // o que a fila offline produz, e o segundo encerramento sobrescreveria o
      // desfecho do primeiro — trocando "reencontrado" por "não encontrado" na
      // métrica que mede o produto.
      const r = await sql<LinhaDoCaso>`
        UPDATE lost_cases
           SET status = ${`closed_${entrada.desfecho}`},
               closed_at = ${new Date(Number(entrada.agora))},
               closure_outcome = ${entrada.desfecho},
               closure_channel = ${entrada.canal ?? null},
               closure_note = ${entrada.nota ?? null},
               -- 7 DIAS, e nao 30. O comentario que estava aqui defendia 30 com
               -- um argumento razoavel -- o animal que "voltou" e sumiu de novo
               -- na mesma semana e caso comum. So que o contrato promete 7
               -- (openapi.yaml: "Encerrar e reversivel por 7 dias", e o 410 de
               -- reopenLostCase diz "Passou dos 7 dias"), a tela promete 7, e a
               -- historia BICHUS-78 se chama "Reabrir o caso por 7 dias".
               --
               -- O banco guardando 30 nao e ser generoso: e a tela dizer uma
               -- coisa e o sistema fazer outra, nos dois sentidos. Quem leu
               -- "7 dias" e perdeu o prazo nao tenta no oitavo, e a generosidade
               -- nao serve para ninguem; quem tentasse no vigesimo receberia um
               -- 410 que o banco nao sustenta. Numero de produto se muda na
               -- historia, com quem promete, nao num comentario de adaptador.
               --
               -- (Sem crase neste bloco de proposito: ele vive dentro de um
               -- template literal, e uma crase aqui fecha a string.)
               reopen_deadline = ${new Date(Number(entrada.agora) + 7 * 24 * 3600 * 1000)}
         WHERE id = ${entrada.caso}
           AND owner_user_id = ${entrada.dono}
           AND status = 'open'
        RETURNING ${COLUNAS}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },
  };
}
