import type { Db } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { EnderecoGuardadoRepository } from '../../ports/endereco-guardado.js';
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

const COLUNAS_DO_ENDERECO = [
  'recipient_name',
  'recipient_phone',
  'postal_code',
  'street',
  'street_number',
  'complement',
  'neighborhood',
  'city',
  'state',
] as const;

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

export class KyselyEnderecoGuardado implements EnderecoGuardadoRepository {
  constructor(private readonly db: Db) {}

  async doChamador(chamador: UserId): Promise<EnderecoDeEntrega | null> {
    const linha = await this.db
      .selectFrom('user_delivery_addresses')
      .select(COLUNAS_DO_ENDERECO)
      .where('user_id', '=', chamador)
      .executeTakeFirst();
    return linha === undefined ? null : comoEndereco(linha);
  }

  async guardar(chamador: UserId, endereco: EnderecoDeEntrega): Promise<EnderecoDeEntrega> {
    const linha = await this.db
      .insertInto('user_delivery_addresses')
      .values({
        user_id: chamador,
        recipient_name: endereco.destinatario,
        recipient_phone: endereco.telefone,
        postal_code: endereco.cep,
        street: endereco.logradouro,
        street_number: endereco.numero,
        complement: endereco.complemento,
        neighborhood: endereco.bairro,
        city: endereco.cidade,
        state: endereco.uf,
      })
      .onConflict((conflito) =>
        conflito.column('user_id').doUpdateSet({
          recipient_name: endereco.destinatario,
          recipient_phone: endereco.telefone,
          postal_code: endereco.cep,
          street: endereco.logradouro,
          street_number: endereco.numero,
          complement: endereco.complemento,
          neighborhood: endereco.bairro,
          city: endereco.cidade,
          state: endereco.uf,
          updated_at: new Date(),
        }),
      )
      .returning(COLUNAS_DO_ENDERECO)
      .executeTakeFirstOrThrow();
    return comoEndereco(linha);
  }
}
