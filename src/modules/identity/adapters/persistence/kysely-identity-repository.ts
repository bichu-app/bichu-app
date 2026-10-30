/** Persistência do módulo `identity`. */
import { sql, type Insertable } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { Selectable } from 'kysely';
import type { UsersTable } from '../../../../shared/db/schema.js';
import { barreiraDeContaNova } from '../../domain/session.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { Instant, TokenHash, UserId } from '../../../../shared/types/brands.js';
import type {
  ConsumoDeJanela,
  ConsequenciasDaExclusao,
  Conta,
  CredencialLocal,
  IdentityRepository,
  MotivoDeRevogacao,
  NovaConta,
  NovaJanelaDeReautenticacao,
  NovoRefresh,
  NovoTokenDeVerificacao,
  ResultadoDoConsumoDaJanela,
  TokenConsumido,
  RefreshArmazenado,
} from '../../ports/identity-repository.js';
import { EnvioDeFotoNaoServe, type FotoDoPerfil } from '../../ports/identity-repository.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../../../media/ports/imagem-de-catalogo.js';
import { conferirJanela, type JanelaDeReautenticacao } from '../../domain/reautenticacao.js';
import { problemas } from '../../../../shared/http/errors.js';

/** Uma troca de apelido a cada 60 dias (plano 4-C.7, `9d99ac0f`). */
const DIAS_ENTRE_TROCAS_DE_APELIDO = 60;

const VIOLACAO_DE_UNICIDADE = '23505';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { code?: unknown }).code === VIOLACAO_DE_UNICIDADE
  );
}

/**
 * A conta deixou de existir DEPOIS de a transacao ja ter gravado.
 *
 * No Kysely, `return` de dentro de `db.transaction().execute()` **COMITA**: a
 * transacao so e desfeita quando o corpo **lanca**. Devolver `undefined` de
 * dentro do bloco, para dizer "conta nao encontrada", confirmaria tudo o que
 * foi gravado antes -- apelido reservado, imagem de catalogo, trabalho na fila
 * -- sem nada apontando para aquilo. Esta sentinela e lancada DENTRO e
 * convertida de volta para `undefined` FORA, de modo que o contrato da porta
 * (`Promise<Conta | undefined>`) fica igual e a recusa desfaz as escritas.
 *
 * BICHUS-321.
 */
class ContaSumiuNaTransacao extends Error {
  constructor() {
    super('a conta sumiu no meio da transacao; nada deve ficar gravado');
    this.name = 'ContaSumiuNaTransacao';
  }
}

type LinhaDeConta = Pick<
  Selectable<UsersTable>,
  | 'id'
  | 'email'
  | 'email_verified_at'
  | 'display_name'
  | 'handle'
  | 'phone_e164'
  | 'phone_verified_at'
  | 'reference_postal_code'
  | 'reference_neighborhood'
  | 'reference_city'
  | 'reference_state'
  | 'pending_email'
  | 'deleted_at'
>;

const COLUNAS_DA_CONTA = [
  'id',
  'email',
  'email_verified_at',
  'display_name',
  'handle',
  'phone_e164',
  'phone_verified_at',
  'reference_postal_code',
  'reference_neighborhood',
  'reference_city',
  'reference_state',
  'pending_email',
  'email_deliverable',
  'status',
  'sessions_invalid_before',
  'created_at',
] as const;

interface LinhaSelecionada extends LinhaDeConta {
  email_deliverable: boolean;
  status: 'active' | 'suspended' | 'deletion_requested';
  sessions_invalid_before: Date;
  created_at: Date;
}

function paraConta(linha: LinhaSelecionada): Conta {
  return {
    id: linha.id as UserId,
    email: linha.email,
    emailVerifiedAt: linha.email_verified_at,
    displayName: linha.display_name,
    handle: linha.handle,
    phoneE164: linha.phone_e164,
    phoneVerifiedAt: linha.phone_verified_at,
    referencePostalCode: linha.reference_postal_code,
    referenceNeighborhood: linha.reference_neighborhood,
    referenceCity: linha.reference_city,
    referenceState: linha.reference_state,
    pendingEmail: linha.pending_email,
    emailDeliverable: linha.email_deliverable,
    status: linha.status,
    sessionsInvalidBefore: linha.sessions_invalid_before.getTime() as Instant,
    createdAt: linha.created_at,
  };
}

/** **SEC-006, revogação em massa das famílias de refresh de UMA conta.** */
export function construtorDaRevogacaoEmMassa(
  db: DbExecutor,
  userId: UserId,
  motivo: MotivoDeRevogacao,
  agora: Instant,
) {
  return db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date(agora), revoked_reason: motivo })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning('id');
}

/** **BICHUS-48: as cinco amarras da janela de reautenticação, todas no `WHERE`.** */
export function construtorDoConsumoDaJanela(db: DbExecutor, consumo: ConsumoDeJanela) {
  return db
    .updateTable('reauth_tokens')
    .set({ consumed_at: new Date(consumo.agora) })
    .where('token_hash', '=', consumo.tokenHash)
    .where('user_id', '=', consumo.userId)
    .where('scope', '=', consumo.escopoExigido)
    .where('access_jti', '=', consumo.acessoJti)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', new Date(consumo.agora))
    .where('issued_at', '>=', new Date(consumo.barreiraDaConta))
    .returning('id');
}

/** A leitura que NOMEIA a recusa, e só ela. */
export function construtorDaLeituraDaJanela(db: DbExecutor, tokenHash: TokenHash) {
  return db
    .selectFrom('reauth_tokens')
    .select(['id', 'user_id', 'scope', 'access_jti', 'issued_at', 'expires_at', 'consumed_at'])
    .where('token_hash', '=', tokenHash);
}

/** **Critério 9 da BICHUS-77: nenhum link pendente sobrevive à troca de senha.** */
export function construtorDaInvalidacaoDeTokensPendentes(
  db: DbExecutor,
  userId: UserId,
  agora: Instant,
) {
  return db
    .updateTable('verification_tokens')
    .set({ consumed_at: new Date(agora) })
    .where('user_id', '=', userId)
    .where('consumed_at', 'is', null);
}

export function criarIdentityRepository(db: Db, ids: IdGenerator): IdentityRepository {
  return {
    async criarContaLocal(nova: NovaConta): Promise<Conta | undefined> {
      const userId = ids.uuidv7();
      const identityId = ids.uuidv7();
      const agora = new Date(nova.agora);

      const valores: Insertable<UsersTable> = {
        id: userId,
        email: nova.email,
        public_ref: Buffer.from(ids.random128()).toString('base64url'),
        display_name: nova.displayName ?? null,
        birth_date: nova.birthDate,
        accepted_terms_version: nova.acceptedTermsVersion ?? null,
        accepted_terms_at: nova.acceptedTermsVersion === undefined ? null : agora,
        sessions_invalid_before: new Date(barreiraDeContaNova(nova.agora)),
        created_at: agora,
        updated_at: agora,
      };

      try {
        return await db.transaction().execute(async (trx) => {
          const conta = await trx
            .insertInto('users')
            .values(valores)
            .returning(COLUNAS_DA_CONTA)
            .executeTakeFirstOrThrow();

          if (nova.handle !== undefined) {
            await trx
              .insertInto('handles')
              .values({
                handle: nova.handle,
                handle_esqueleto: nova.handle,
                kind: 'pessoa',
                user_id: userId,
                claimed_at: agora,
              })
              .execute();

            await trx
              .updateTable('users')
              .set({ handle: nova.handle })
              .where('id', '=', userId)
              .execute();
          }

          await trx
            .insertInto('user_identities')
            .values({
              id: identityId,
              user_id: userId,
              provider: 'local',
              provider_subject: userId,
              email_at_provider: nova.email,
              linked_at: agora,
            })
            .execute();

          await trx
            .insertInto('local_credentials')
            .values({
              identity_id: identityId,
              password_phc: nova.passwordPhc,
              password_updated_at: agora,
            })
            .execute();

          await trx.insertInto('user_roles').values({ user_id: userId, role: 'tutor' }).execute();

          return paraConta(conta as LinhaSelecionada);
        });
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return undefined;
        throw erro;
      }
    },

    async buscarContaPorId(id: UserId): Promise<Conta | undefined> {
      const linha = await db
        .selectFrom('users')
        .select(COLUNAS_DA_CONTA)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
    },

    async atualizarPerfil(id: UserId, campos, agora): Promise<Conta | undefined> {
      const mudancas: Record<string, unknown> = { updated_at: new Date(Number(agora)) };
      const mapa = {
        displayName: 'display_name',
        phoneE164: 'phone_e164',
        referencePostalCode: 'reference_postal_code',
        referenceNeighborhood: 'reference_neighborhood',
        referenceCity: 'reference_city',
        referenceState: 'reference_state',
      } as const;

      for (const [campo, coluna] of Object.entries(mapa)) {
        const valor = (campos as Record<string, unknown>)[campo];
        if (valor !== undefined) mudancas[coluna] = valor;
      }

      if (mudancas['phone_e164'] !== undefined) mudancas['phone_verified_at'] = null;

      const apelidoNovo = campos.handle;
      if (apelidoNovo === undefined) {
        const linha = await db
          .updateTable('users')
          .set(mudancas)
          .where('id', '=', id)
          .where('deleted_at', 'is', null)
          .returning(COLUNAS_DA_CONTA)
          .executeTakeFirst();

        return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
      }

      try {
        return await db.transaction().execute(async (trx) => {
          const atual = await trx
            .selectFrom('users')
            .select(['handle'])
            .where('id', '=', id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();
          if (atual === undefined) return undefined;

          const anterior = atual.handle;

          const ehTroca = anterior !== null && anterior.toLowerCase() !== apelidoNovo;

          if (ehTroca) {
            const vivo = await trx
              .selectFrom('handles')
              .select(['claimed_at'])
              .where('user_id', '=', id)
              .where('kind', '=', 'pessoa')
              .executeTakeFirst();

            if (vivo !== undefined) {
              const desde = new Date(vivo.claimed_at).getTime();
              const dias = (Number(agora) - desde) / 86_400_000;
              if (dias < DIAS_ENTRE_TROCAS_DE_APELIDO) {
                const faltam = Math.ceil(DIAS_ENTRE_TROCAS_DE_APELIDO - dias);
                throw problemas.validacao([
                  {
                    field: 'handle',
                    code: 'too_soon',
                    message: `Você poderá trocar de apelido em ${String(faltam)} dias.`,
                  },
                ]);
              }
            }

            await trx
              .updateTable('handles')
              .set({ kind: 'reservado' })
              .where('user_id', '=', id)
              .where('kind', '=', 'pessoa')
              .execute();
          }

          if (anterior === null || ehTroca) {
            await trx
              .insertInto('handles')
              .values({
                handle: apelidoNovo,
                handle_esqueleto: apelidoNovo,
                kind: 'pessoa',
                user_id: id,
                claimed_at: new Date(Number(agora)),
              })
              .execute();
            mudancas['handle'] = apelidoNovo;
          }

          const linha = await trx
            .updateTable('users')
            .set(mudancas)
            .where('id', '=', id)
            .where('deleted_at', 'is', null)
            .returning(COLUNAS_DA_CONTA)
            .executeTakeFirst();

          // `return undefined` aqui COMITARIA o apelido anterior rebaixado a
          // `reservado` e a linha nova em `handles`, para uma conta que nao
          // existe mais. Lancar desfaz; o `catch` devolve o mesmo `undefined`.
          if (linha === undefined) throw new ContaSumiuNaTransacao();
          return paraConta(linha as LinhaSelecionada);
        });
      } catch (erro) {
        if (erro instanceof ContaSumiuNaTransacao) return undefined;
        throw erro;
      }
    },

    /** A foto do perfil desta conta (cliente, 18/10/2026). */
    async fotoDoPerfil(id: UserId): Promise<FotoDoPerfil | null> {
      const linha = await db
        .selectFrom('users')
        .innerJoin('catalog_images', 'catalog_images.id', 'users.photo_image_id')
        .select(['catalog_images.status as status', 'catalog_images.public_key as public_key', 'catalog_images.rejection_reason as rejection_reason'])
        .where('users.id', '=', id)
        .where('users.deleted_at', 'is', null)
        .executeTakeFirst();
      if (linha === undefined) return null;
      return {
        status: linha.status,
        publicKey: linha.public_key,
        rejectionReason: linha.rejection_reason,
      };
    },

    /** Troca ou tira a foto do perfil, com a CONTA NA CLAUSULA `WHERE`. */
    async trocarFotoDoPerfil(id: UserId, uploadId: string | null, agora: Instant): Promise<Conta | undefined> {
      try {
        return await db.transaction().execute(async (trx) => {
          let imagemId: string | null = null;

          if (uploadId !== null) {
            const r = await sql<{
              id: string;
              expires_at: Date;
              confirmed_at: Date | null;
              catalog_image_id: string | null;
              dono_da_imagem: string | null;
            }>`
              SELECT u.id, u.expires_at, u.confirmed_at, c.id AS catalog_image_id,
                     (SELECT d.id FROM users d WHERE d.photo_image_id = c.id) AS dono_da_imagem
                FROM catalog_upload_intents u
                LEFT JOIN catalog_images c ON c.upload_intent_id = u.id
               WHERE u.id = ${uploadId}::uuid
                 AND u.user_id = ${id}::uuid
                 AND u.purpose = 'user_photo'
               FOR UPDATE OF u
            `.execute(trx);
            const envio = r.rows[0];
            if (envio === undefined) throw new EnvioDeFotoNaoServe();

            if (envio.confirmed_at !== null) {
              if (envio.catalog_image_id === null) throw new EnvioDeFotoNaoServe();
              if (envio.dono_da_imagem !== null && envio.dono_da_imagem !== id) {
                throw new EnvioDeFotoNaoServe();
              }
              imagemId = envio.catalog_image_id;
            } else {
              if (envio.expires_at.getTime() <= Number(agora)) throw new EnvioDeFotoNaoServe();
              imagemId = ids.uuidv7();
              await trx
                .updateTable('catalog_upload_intents')
                .set({ confirmed_at: new Date(Number(agora)) })
                .where('id', '=', envio.id)
                .where('confirmed_at', 'is', null)
                .execute();
              await trx
                .insertInto('catalog_images')
                .values({
                  id: imagemId,
                  upload_intent_id: envio.id,
                  purpose: 'user_photo',
                  public_key: null,
                  rejection_reason: null,
                })
                .execute();
              await trx
                .insertInto('jobs')
                .values({
                  id: ids.uuidv7(),
                  kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
                  payload: JSON.stringify({ catalog_image_id: imagemId }),
                })
                .execute();
            }
          }

          const linha = await trx
            .updateTable('users')
            .set({ photo_image_id: imagemId, updated_at: new Date(Number(agora)) })
            .where('id', '=', id)
            .where('deleted_at', 'is', null)
            .returning(COLUNAS_DA_CONTA)
            .executeTakeFirst();

          // Este e o defeito da BICHUS-321 na sua forma original: acima ja
          // foram gravados o `confirmed_at` do envio, a linha em
          // `catalog_images` e o trabalho em `jobs`. `return undefined`
          // COMITARIA os tres com `photo_image_id` nunca apontando para a
          // imagem -- envio confirmado, imagem orfa e trabalho enfileirado para
          // ninguem. Lancar desfaz; o `catch` devolve o mesmo `undefined`.
          if (linha === undefined) throw new ContaSumiuNaTransacao();
          return paraConta(linha as LinhaSelecionada);
        });
      } catch (erro) {
        if (erro instanceof ContaSumiuNaTransacao) return undefined;
        throw erro;
      }
    },

    async buscarContaPorEmail(email: string): Promise<Conta | undefined> {
      const linha = await db
        .selectFrom('users')
        .select(COLUNAS_DA_CONTA)
        .where('email', '=', email)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
    },

    async buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined> {
      const linha = await db
        .selectFrom('local_credentials')
        .innerJoin('user_identities', 'user_identities.id', 'local_credentials.identity_id')
        .innerJoin('users', 'users.id', 'user_identities.user_id')
        .select([
          'local_credentials.identity_id as identity_id',
          'local_credentials.password_phc as password_phc',
          'local_credentials.must_change as must_change',
          'users.id as user_id',
        ])
        .where('users.email', '=', email)
        .where('users.deleted_at', 'is', null)
        .where('user_identities.provider', '=', 'local')
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        identityId: linha.identity_id,
        userId: linha.user_id as UserId,
        passwordPhc: linha.password_phc,
        mustChange: linha.must_change,
      };
    },

    async regravarCredencial(identityId: string, passwordPhc: string, agora: Instant): Promise<void> {
      await db
        .updateTable('local_credentials')
        .set({ password_phc: passwordPhc, password_updated_at: new Date(agora) })
        .where('identity_id', '=', identityId)
        .execute();
    },

    async registrarLogin(identityId: string, agora: Instant): Promise<void> {
      await db
        .updateTable('user_identities')
        .set({ last_login_at: new Date(agora) })
        .where('id', '=', identityId)
        .execute();
    },

    async gravarRefresh(novo: NovoRefresh): Promise<void> {
      await db
        .insertInto('refresh_tokens')
        .values({
          id: novo.id,
          user_id: novo.userId,
          family_id: novo.familyId,
          token_hash: novo.tokenHash,
          issued_at: new Date(novo.issuedAt),
          expires_at: new Date(novo.expiresAt),
          absolute_expires_at: new Date(novo.absoluteExpiresAt),
          stay_signed_in: novo.staySignedIn,
          user_agent: novo.userAgent ?? null,
          ip_hmac: novo.ipHmac,
          rotated_to_id: null,
          revoked_at: null,
          revoked_reason: null,
          device_id: null,
        })
        .execute();
    },

    async buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
      const linha = await db
        .selectFrom('refresh_tokens')
        .select([
          'id',
          'user_id',
          'family_id',
          'issued_at',
          'expires_at',
          'absolute_expires_at',
          'stay_signed_in',
          'rotated_to_id',
          'revoked_at',
        ])
        .where('token_hash', '=', hash)
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        id: linha.id,
        userId: linha.user_id as UserId,
        familyId: linha.family_id,
        issuedAt: linha.issued_at.getTime() as Instant,
        expiresAt: linha.expires_at.getTime() as Instant,
        absoluteExpiresAt: linha.absolute_expires_at.getTime() as Instant,
        staySignedIn: linha.stay_signed_in,
        rotatedToId: linha.rotated_to_id,
        revokedAt: linha.revoked_at,
      };
    },

    async rotacionar(
      tokenAtualId: string,
      sucessor: NovoRefresh,
      agora: Instant,
    ): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        await trx
          .insertInto('refresh_tokens')
          .values({
            id: sucessor.id,
            user_id: sucessor.userId,
            family_id: sucessor.familyId,
            token_hash: sucessor.tokenHash,
            issued_at: new Date(sucessor.issuedAt),
            expires_at: new Date(sucessor.expiresAt),
            absolute_expires_at: new Date(sucessor.absoluteExpiresAt),
            stay_signed_in: sucessor.staySignedIn,
            user_agent: sucessor.userAgent ?? null,
            ip_hmac: sucessor.ipHmac,
            rotated_to_id: null,
            revoked_at: null,
            revoked_reason: null,
            device_id: null,
          })
          .execute();

        const consumido = await trx
          .updateTable('refresh_tokens')
          .set({
            rotated_to_id: sucessor.id,
            revoked_at: new Date(agora),
            revoked_reason: 'rotation',
          })
          .where('id', '=', tokenAtualId)
          .where('rotated_to_id', 'is', null)
          .where('revoked_at', 'is', null)
          .returning('id')
          .executeTakeFirst();

        if (consumido === undefined) {
          throw new RotacaoPerdida();
        }
        return true;
      }).catch((erro: unknown) => {
        if (erro instanceof RotacaoPerdida) return false;
        throw erro;
      });
    },

    async revogarFamilia(
      familyId: string,
      motivo: MotivoDeRevogacao,
      agora: Instant,
    ): Promise<number> {
      const linhas = await db
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date(agora), revoked_reason: motivo })
        .where('family_id', '=', familyId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .execute();
      return linhas.length;
    },

    /** O predicado mora em {@link construtorDaRevogacaoEmMassa}. */
    async revogarTodasAsFamilias(
      userId: UserId,
      motivo: MotivoDeRevogacao,
      agora: Instant,
    ): Promise<number> {
      const linhas = await construtorDaRevogacaoEmMassa(db, userId, motivo, agora).execute();
      return linhas.length;
    },

    async invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({
          sessions_invalid_before: sql<Date>`greatest(${sql.val(new Date(barreira))}::timestamptz, sessions_invalid_before)`,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },

    async criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
      await db
        .insertInto('verification_tokens')
        .values({
          id: novo.id,
          user_id: novo.userId,
          purpose: novo.proposito,
          token_hash: novo.tokenHash,
          sent_to: novo.enviadoPara,
          expires_at: new Date(novo.expiraEm),
          created_ip_hmac: novo.ipHmac === null ? null : Buffer.from(novo.ipHmac),
        })
        .execute();
    },

    async consumirTokenDeVerificacao(hash, proposito, agora): Promise<TokenConsumido | undefined> {
      const linha = await db
        .updateTable('verification_tokens')
        .set({ consumed_at: new Date(agora) })
        .where('token_hash', '=', hash)
        .where('purpose', '=', proposito)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .returning(['user_id', 'sent_to'])
        .executeTakeFirst();

      return linha === undefined
        ? undefined
        : { userId: linha.user_id as UserId, enviadoPara: linha.sent_to };
    },

    async conferirTokenDeVerificacao(hash, proposito, agora): Promise<TokenConsumido | undefined> {
      const linha = await db
        .selectFrom('verification_tokens')
        .select(['user_id', 'sent_to'])
        .where('token_hash', '=', hash)
        .where('purpose', '=', proposito)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .executeTakeFirst();

      return linha === undefined
        ? undefined
        : { userId: linha.user_id as UserId, enviadoPara: linha.sent_to };
    },

    /** O predicado mora em {@link construtorDaInvalidacaoDeTokensPendentes}. */
    async invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
      const r = await construtorDaInvalidacaoDeTokensPendentes(db, userId, agora).executeTakeFirst();
      return Number(r.numUpdatedRows);
    },

    async criarJanelaDeReautenticacao(nova: NovaJanelaDeReautenticacao): Promise<void> {
      await db
        .insertInto('reauth_tokens')
        .values({
          id: nova.id,
          user_id: nova.userId,
          access_jti: nova.acessoJti,
          scope: nova.escopo,
          token_hash: nova.tokenHash,
          issued_at: new Date(nova.emitidaEm),
          expires_at: new Date(nova.expiraEm),
          created_ip_hmac: nova.ipHmac === null ? null : Buffer.from(nova.ipHmac),
        })
        .execute();
    },

    /** O predicado mora em {@link construtorDoConsumoDaJanela}. */
    async consumirJanelaDeReautenticacao(
      consumo: ConsumoDeJanela,
    ): Promise<ResultadoDoConsumoDaJanela> {
      const linha = await construtorDoConsumoDaJanela(db, consumo).executeTakeFirst();
      if (linha !== undefined) return { consumida: true };

      const bruta = await construtorDaLeituraDaJanela(db, consumo.tokenHash).executeTakeFirst();
      if (bruta === undefined) return { consumida: false, motivo: 'inexistente' };

      const janela: JanelaDeReautenticacao = {
        id: bruta.id,
        userId: bruta.user_id,
        escopo: bruta.scope,
        acessoJti: bruta.access_jti,
        emitidaEm: bruta.issued_at.getTime() as Instant,
        expiraEm: bruta.expires_at.getTime() as Instant,
        consumidaEm: bruta.consumed_at === null ? null : (bruta.consumed_at.getTime() as Instant),
      };
      const veredicto = conferirJanela(janela, {
        userId: consumo.userId,
        escopoExigido: consumo.escopoExigido,
        acessoJti: consumo.acessoJti,
        barreiraDaConta: consumo.barreiraDaConta,
        agora: consumo.agora,
      });
      return veredicto.vale
        ? { consumida: false, motivo: 'inexistente' }
        : { consumida: false, motivo: veredicto.motivo };
    },

    async marcarEmailVerificado(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({
          email_verified_at: new Date(agora),
          email_deliverable: true,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },

    /** Exclusão lógica e revogação das tags, numa transação só. */
    async registrarPedidoDeExclusao(
      userId: UserId,
      agora: Instant,
    ): Promise<ConsequenciasDaExclusao | undefined> {
      return db.transaction().execute(async (trx) => {
        const marcada = await trx
          .updateTable('users')
          .set({
            status: 'deletion_requested',
            deletion_requested_at: new Date(agora),
            deleted_at: new Date(agora),
            updated_at: new Date(agora),
          })
          .where('id', '=', userId)
          .where('deleted_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (marcada === undefined) return undefined;

        const tags = await trx
          .updateTable('pet_tags')
          .set({
            status: 'revoked',
            revoked_at: new Date(agora),
            revocation_reason: 'owner_request',
            code_ciphertext: null,
          })
          .where('status', '=', 'active')
          .where((eb) =>
            eb(
              'pet_id',
              'in',
              eb.selectFrom('pets').select('pets.id').where('pets.owner_user_id', '=', userId),
            ),
          )
          .returning('id')
          .execute();

        return { tagsRevogadas: tags.length };
      });
    },

    async contasAExpurgar(ate: Instant, limite: number): Promise<readonly UserId[]> {
      const linhas = await db
        .selectFrom('users')
        .select('id')
        .where('deleted_at', 'is not', null)
        .where('deleted_at', '<=', new Date(ate))
        .orderBy('deleted_at', 'asc')
        .limit(limite)
        .execute();
      return linhas.map((linha) => linha.id as UserId);
    },

    async registrarPedidoDeTrocaDeEmail(
      userId: UserId,
      novoEmail: string,
      agora: Instant,
    ): Promise<void> {
      await db
        .updateTable('users')
        .set({ pending_email: novoEmail, updated_at: new Date(agora) })
        .where('id', '=', userId)
        .where('deleted_at', 'is', null)
        .execute();
    },

    async concluirTrocaDeEmail(
      userId: UserId,
      novoEmail: string,
      agora: Instant,
    ): Promise<Conta | undefined> {
      try {
        const linha = await db
          .updateTable('users')
          .set({
            email: novoEmail,
            pending_email: null,
            email_verified_at: new Date(agora),
            email_deliverable: true,
            updated_at: new Date(agora),
          })
          .where('id', '=', userId)
          .where('deleted_at', 'is', null)
          .where('pending_email', '=', novoEmail)
          .returning(COLUNAS_DA_CONTA)
          .executeTakeFirst();

        return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return undefined;
        throw erro;
      }
    },

    async cancelarTrocaDeEmailPendente(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({ pending_email: null, updated_at: new Date(agora) })
        .where('id', '=', userId)
        .where('pending_email', 'is not', null)
        .execute();
    },
  };
}

/** Sinal interno de corrida perdida na rotação. */
class RotacaoPerdida extends Error {
  constructor() {
    super('refresh já consumido por outro pedido');
    this.name = 'RotacaoPerdida';
  }
}
