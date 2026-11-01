import type { Db } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type { RazaoDaRevogacao } from '../../domain/passkey.js';
import type {
  CredencialDePasskey,
  DesafioGuardado,
  NovaCredencial,
  PasskeyDaTela,
  PasskeyRepository,
} from '../../ports/passkey-repository.js';

const comoInstante = (d: Date): Instant => d.getTime() as Instant;

export class KyselyPasskeyRepository implements PasskeyRepository {
  constructor(private readonly db: Db) {}

  async guardarDesafio(desafio: {
    readonly id: string;
    readonly userId: UserId | null;
    readonly purpose: 'registration' | 'authentication';
    readonly challengeHash: Buffer;
    readonly expiraEm: Instant;
  }): Promise<void> {
    await this.db
      .insertInto('passkey_challenges')
      .values({
        id: desafio.id,
        user_id: desafio.userId,
        purpose: desafio.purpose,
        challenge_hash: desafio.challengeHash,
        expires_at: new Date(desafio.expiraEm),
      })
      .execute();
  }

  async acharDesafioPorHash(challengeHash: Buffer): Promise<DesafioGuardado | undefined> {
    const linha = await this.db
      .selectFrom('passkey_challenges')
      .select(['id', 'user_id', 'purpose', 'expires_at', 'consumed_at'])
      .where('challenge_hash', '=', challengeHash)
      .executeTakeFirst();
    if (linha === undefined) return undefined;
    return {
      id: linha.id,
      userId: linha.user_id as UserId | null,
      purpose: linha.purpose,
      expiraEm: comoInstante(linha.expires_at),
      consumidoEm: linha.consumed_at === null ? null : comoInstante(linha.consumed_at),
    };
  }

  async consumirDesafio(id: string, agora: Instant): Promise<boolean> {
    const r = await this.db
      .updateTable('passkey_challenges')
      .set({ consumed_at: new Date(agora) })
      .where('id', '=', id)
      .where('consumed_at', 'is', null)
      .executeTakeFirst();
    return r.numUpdatedRows === 1n;
  }

  async ativasDaConta(userId: UserId): Promise<readonly PasskeyDaTela[]> {
    const linhas = await this.db
      .selectFrom('passkey_credentials')
      .select(['id', 'label', 'created_at', 'last_used_at'])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return linhas.map((l) => ({
      id: l.id,
      label: l.label,
      criadaEm: comoInstante(l.created_at),
      usadaEm: l.last_used_at === null ? null : comoInstante(l.last_used_at),
    }));
  }

  async credenciaisAtivasParaExcluir(userId: UserId): Promise<readonly Buffer[]> {
    const linhas = await this.db
      .selectFrom('passkey_credentials')
      .select(['credential_id'])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
    return linhas.map((l) => l.credential_id);
  }

  async contarAtivas(userId: UserId): Promise<number> {
    const linha = await this.db
      .selectFrom('passkey_credentials')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(linha.total);
  }

  async acharPorCredentialId(credentialId: Buffer): Promise<CredencialDePasskey | undefined> {
    const linha = await this.db
      .selectFrom('passkey_credentials')
      .select(['id', 'user_id', 'credential_id', 'public_key', 'sign_count', 'revoked_at'])
      .where('credential_id', '=', credentialId)
      .executeTakeFirst();
    if (linha === undefined) return undefined;
    return {
      id: linha.id,
      userId: linha.user_id as UserId,
      credentialId: linha.credential_id,
      publicKey: linha.public_key,
      signCount: BigInt(linha.sign_count),
      revogadaEm: linha.revoked_at === null ? null : comoInstante(linha.revoked_at),
    };
  }

  async gravar(credencial: NovaCredencial, agora: Instant): Promise<PasskeyDaTela> {
    const linha = await this.db
      .insertInto('passkey_credentials')
      .values({
        id: credencial.id,
        user_id: credencial.userId,
        credential_id: credencial.credentialId,
        public_key: credencial.publicKey,
        sign_count: credencial.signCount.toString(),
        label: credencial.label,
        transports: credencial.transports === null ? null : [...credencial.transports],
        created_at: new Date(agora),
      })
      .returning(['id', 'label', 'created_at', 'last_used_at'])
      .executeTakeFirstOrThrow();
    return {
      id: linha.id,
      label: linha.label,
      criadaEm: comoInstante(linha.created_at),
      usadaEm: linha.last_used_at === null ? null : comoInstante(linha.last_used_at),
    };
  }

  async avancarContador(id: string, de: bigint, para: bigint, agora: Instant): Promise<boolean> {
    const r = await this.db
      .updateTable('passkey_credentials')
      .set({ sign_count: para.toString(), last_used_at: new Date(agora) })
      .where('id', '=', id)
      .where('sign_count', '=', de.toString())
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return r.numUpdatedRows === 1n;
  }

  async revogar(
    id: string,
    userId: UserId,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<'revogada' | 'nao-encontrada'> {
    const r = await this.db
      .updateTable('passkey_credentials')
      .set({ revoked_at: new Date(agora), revoked_reason: razao })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (r.numUpdatedRows === 1n) return 'revogada';

    const existe = await this.db
      .selectFrom('passkey_credentials')
      .select(['id'])
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return existe === undefined ? 'nao-encontrada' : 'revogada';
  }

  async revogarPorCredentialId(
    credentialId: Buffer,
    razao: RazaoDaRevogacao,
    agora: Instant,
  ): Promise<void> {
    await this.db
      .updateTable('passkey_credentials')
      .set({ revoked_at: new Date(agora), revoked_reason: razao })
      .where('credential_id', '=', credentialId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
