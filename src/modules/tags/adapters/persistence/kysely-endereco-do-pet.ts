import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { EnderecoDoPetRepository } from '../../ports/endereco-do-pet.js';
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

const COLUNAS_DO_ENDERECO = sql`
  d.recipient_name, d.recipient_phone, d.postal_code,
  d.street, d.street_number, d.complement,
  d.neighborhood, d.city, d.state
`;

const COLUNAS_DO_ENDERECO_GRAVADO = sql`
  recipient_name, recipient_phone, postal_code,
  street, street_number, complement,
  neighborhood, city, state
`;

interface LinhaDoEndereco {
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly postal_code: string;
  readonly street: string;
  readonly street_number: string;
  readonly complement: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

function comoEndereco(linha: LinhaDoEndereco): EnderecoDeEntrega {
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

export function criarEnderecoDoPetRepository(deps: { readonly db: Db }): EnderecoDoPetRepository {
  return {
    async doPetDoChamador(
      pet: PetId,
      chamador: UserId,
    ): Promise<EnderecoDeEntrega | null | undefined> {
      const dono = await sql<{ id: string }>`
        SELECT p.id
          FROM pets p
         WHERE p.id = ${pet}::uuid
           AND p.owner_user_id = ${chamador}::uuid
           AND p.deleted_at IS NULL
      `.execute(deps.db);
      if (dono.rows[0] === undefined) return undefined;

      const lida = await sql<LinhaDoEndereco>`
        SELECT ${COLUNAS_DO_ENDERECO}
          FROM pet_delivery_addresses d
          JOIN pets p ON p.id = d.pet_id
         WHERE d.pet_id = ${pet}::uuid
           AND p.owner_user_id = ${chamador}::uuid
           AND p.deleted_at IS NULL
      `.execute(deps.db);

      const linha = lida.rows[0];
      return linha === undefined ? null : comoEndereco(linha);
    },

    async guardarNoPet(
      pet: PetId,
      chamador: UserId,
      endereco: EnderecoDeEntrega,
    ): Promise<EnderecoDeEntrega | undefined> {
      const gravada = await sql<LinhaDoEndereco>`
        INSERT INTO pet_delivery_addresses (
                 pet_id, recipient_name, recipient_phone, postal_code,
                 street, street_number, complement, neighborhood, city, state)
        SELECT p.id,
               ${endereco.destinatario}, ${endereco.telefone}, ${endereco.cep},
               ${endereco.logradouro}, ${endereco.numero}, ${endereco.complemento},
               ${endereco.bairro}, ${endereco.cidade}, ${endereco.uf}
          FROM pets p
         WHERE p.id = ${pet}::uuid
           AND p.owner_user_id = ${chamador}::uuid
           AND p.deleted_at IS NULL
        ON CONFLICT (pet_id) DO UPDATE
           SET recipient_name  = EXCLUDED.recipient_name,
               recipient_phone = EXCLUDED.recipient_phone,
               postal_code     = EXCLUDED.postal_code,
               street          = EXCLUDED.street,
               street_number   = EXCLUDED.street_number,
               complement      = EXCLUDED.complement,
               neighborhood    = EXCLUDED.neighborhood,
               city            = EXCLUDED.city,
               state           = EXCLUDED.state,
               -- O unico campo derivado deste arquivo. Ver o cabecalho: NAO e
               -- carimbo de expiracao.
               updated_at      = now()
        RETURNING ${COLUNAS_DO_ENDERECO_GRAVADO}
      `.execute(deps.db);

      const linha = gravada.rows[0];
      return linha === undefined ? undefined : comoEndereco(linha);
    },
  };
}
