/**
 * As duas leituras de apoio da transferencia: o e-mail **verificado** de uma
 * conta e o nome de um pet.
 *
 * Elas moram aqui, e nao em `identity` e `pets`, porque sao consultas deste
 * modulo. Acrescentar `emailVerificadoDe` ao `IdentityRepository` colocaria na
 * porta de identidade um metodo que so a transferencia usa, e um repositorio
 * cresce por esse caminho ate ninguem saber quem precisa de que.
 *
 * ## `email_verified_at IS NOT NULL` e a camada 2 inteira
 *
 * A condicao nao e detalhe de implementacao: e a camada 2 das quatro que
 * protegem a transferencia. Ler `users.email` sem ela aceitaria um endereco por
 * verificar, e bastaria cadastrar uma conta com o e-mail do destinatario para
 * aceitar a transferencia dele -- o token deixaria de ser a credencial de UMA
 * pessoa e passaria a ser a credencial de quem soubesse o endereco dela.
 *
 * `deleted_at IS NULL` acompanha as duas: conta apagada nao tem e-mail para
 * onde escrever, e pet apagado nao tem nome para anunciar.
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
        // ESTA LINHA E A CAMADA 2. Ver o cabecalho: sem ela, o vinculo com o
        // destinatario deixa de valer alguma coisa.
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
