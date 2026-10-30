/**
 * As duas leituras de apoio da transferencia: o e-mail **verificado** de uma conta
 * e o nome de um pet.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type {
  EmailVerificadoDoChamador,
  NomeDoPet,
} from '../../application/pet-transfer-service.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';

export function criarEmailVerificadoDoChamador(db: Db): EmailVerificadoDoChamador {
  return {
    async emailVerificadoDe(conta: UserId): Promise<string | undefined> {
      const linha = await db
        .selectFrom('users')
        .select('users.email')
        .where('users.id', '=', conta)
        .where('users.email_verified_at', 'is not', null)
        .where('users.deleted_at', 'is', null)
        .executeTakeFirst();
      return linha?.email;
    },
  };
}

export function criarNomeDoPet(db: Db): NomeDoPet {
  return {
    async nomeDe(pet: PetId): Promise<string | undefined> {
      const linha = await db
        .selectFrom('pets')
        .select('pets.name')
        .where('pets.id', '=', pet)
        .where('pets.deleted_at', 'is', null)
        .executeTakeFirst();
      return linha?.name;
    },
  };
}
