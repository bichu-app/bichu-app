/**
 * Persistência do módulo `identity`.
 *
 * Aqui mora a tradução entre a linguagem do domínio e as tabelas. Dois pontos em
 * que a implementação decide correção, e não desempenho:
 *
 * - **criação de conta** grava `users`, `user_identities` e `local_credentials`
 *   na mesma transação. Conta sem credencial é um estado que ninguém consegue
 *   corrigir pela interface;
 * - **rotação de refresh** consome o token apresentado com um `UPDATE`
 *   condicional e grava o sucessor na mesma transação. Ler e depois atualizar em
 *   dois passos permitiria a dois pedidos simultâneos rotacionarem o mesmo
 *   token, que é exatamente o cenário que a detecção de reuso existe para
 *   distinguir de um roubo.
 */
import type { Insertable } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import type { UsersTable } from '../../../../shared/db/schema.js';
import { barreiraDeContaNova } from '../../domain/session.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { Instant, TokenHash, UserId } from '../../../../shared/types/brands.js';
import type {
  Conta,
  CredencialLocal,
  IdentityRepository,
  MotivoDeRevogacao,
  NovaConta,
  NovoRefresh,
  NovoTokenDeVerificacao,
  TokenConsumido,
  RefreshArmazenado,
} from '../../ports/identity-repository.js';

const VIOLACAO_DE_UNICIDADE = '23505';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { code?: unknown }).code === VIOLACAO_DE_UNICIDADE
  );
}

type LinhaDeConta = Pick<
  UsersTable,
  | 'id'
  | 'email'
  | 'email_verified_at'
  | 'display_name'
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
    phoneE164: linha.phone_e164,
    phoneVerifiedAt: linha.phone_verified_at,
    referencePostalCode: linha.reference_postal_code,
    referenceNeighborhood: linha.reference_neighborhood,
    referenceCity: linha.reference_city,
    referenceState: linha.reference_state,
    pendingEmail: linha.pending_email,
    emailDeliverable: linha.email_deliverable,
    status: linha.status,
    // A conversão para `Instant` acontece na borda da persistência: o domínio
    // fala em milissegundos e nunca constrói data.
    sessionsInvalidBefore: linha.sessions_invalid_before.getTime() as Instant,
    createdAt: linha.created_at,
  };
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
        display_name: nova.displayName ?? null,
        accepted_terms_version: nova.acceptedTermsVersion ?? null,
        accepted_terms_at: nova.acceptedTermsVersion === undefined ? null : agora,
        // A conta nasce com a barreira do SEC-006 no segundo da criação: assim
        // nenhum token anterior a ela pode existir, nem por relógio adiantado.
        // TRUNCADA AO SEGUNDO de propósito — ver `barreiraDeContaNova`: com a
        // precisão de milissegundo, o token que o próprio cadastro devolve
        // nascia revogado, e `POST /v1/auth/register` entregava uma sessão que
        // não abria nenhuma tela.
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

          await trx
            .insertInto('user_identities')
            .values({
              id: identityId,
              user_id: userId,
              provider: 'local',
              // `provider_subject` do provedor local é o próprio UUID interno.
              // Usar o e-mail aqui reintroduziria pelo lado do vínculo a chave
              // que o ADR-0002 existe para proibir.
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
        // E-mail já cadastrado é resposta, não incidente. Quem chama decide o
        // que a resposta revela.
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
      // Só entra no `SET` o que veio no corpo. `undefined` é "não mexer" e
      // `null` é "apagar": montar o objeto com todos os campos transformaria um
      // `PATCH` de um campo numa limpeza silenciosa dos outros cinco.
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

      // Trocar o telefone invalida a verificação anterior: o número novo não
      // herda a confiança do antigo, e `can_open_lost_case` precisa cair junto.
      if (mudancas['phone_e164'] !== undefined) mudancas['phone_verified_at'] = null;

      const linha = await db
        .updateTable('users')
        .set(mudancas)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(COLUNAS_DA_CONTA)
        .executeTakeFirst();

      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
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
          token_hash: Buffer.from(novo.tokenHash, 'base64'),
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
          'expires_at',
          'absolute_expires_at',
          'stay_signed_in',
          'rotated_to_id',
          'revoked_at',
        ])
        .where('token_hash', '=', Buffer.from(hash, 'base64'))
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        id: linha.id,
        userId: linha.user_id as UserId,
        familyId: linha.family_id,
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
            token_hash: Buffer.from(sucessor.tokenHash, 'base64'),
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

        // O `WHERE` carrega a condição de consumo. Se outro pedido já consumiu
        // este token, nenhuma linha volta e a transação inteira é desfeita,
        // inclusive o sucessor recém-inserido.
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

    async invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({ sessions_invalid_before: new Date(agora), updated_at: new Date(agora) })
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
          token_hash: Buffer.from(novo.tokenHash),
          sent_to: novo.enviadoPara,
          expires_at: new Date(novo.expiraEm),
          created_ip_hmac: novo.ipHmac === null ? null : Buffer.from(novo.ipHmac),
        })
        .execute();
    },

    async consumirTokenDeVerificacao(hash, proposito, agora): Promise<TokenConsumido | undefined> {
      // UMA instrução. As três condições no `WHERE` e a marcação no `SET` são
      // avaliadas sob a mesma trava de linha: duas aberturas simultâneas do
      // mesmo link disputam a linha, e só uma sai com `RETURNING`.
      const linha = await db
        .updateTable('verification_tokens')
        .set({ consumed_at: new Date(agora) })
        .where('token_hash', '=', Buffer.from(hash))
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
        .where('token_hash', '=', Buffer.from(hash))
        .where('purpose', '=', proposito)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .executeTakeFirst();

      return linha === undefined
        ? undefined
        : { userId: linha.user_id as UserId, enviadoPara: linha.sent_to };
    },

    async invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
      const r = await db
        .updateTable('verification_tokens')
        .set({ consumed_at: new Date(agora) })
        .where('user_id', '=', userId)
        .where('consumed_at', 'is', null)
        .executeTakeFirst();
      return Number(r.numUpdatedRows);
    },

    async marcarEmailVerificado(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({
          email_verified_at: new Date(agora),
          // Verificar o e-mail prova que ele entrega. Uma devolução antiga não
          // pode continuar marcando a conta como inalcançável depois disso.
          email_deliverable: true,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },
  };
}

/** Sinal interno de corrida perdida na rotação. Nunca sai deste arquivo. */
class RotacaoPerdida extends Error {
  constructor() {
    super('refresh já consumido por outro pedido');
    this.name = 'RotacaoPerdida';
  }
}
