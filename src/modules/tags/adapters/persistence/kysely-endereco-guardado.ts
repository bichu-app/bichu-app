/**
 * O endereco de entrega guardado na conta, no Postgres.
 *
 * ## A AUTORIZACAO ESTA NA CLAUSULA `WHERE`, e isso nao e estilo
 *
 * As duas consultas deste arquivo carregam `user_id = <chamador>`, e **nao
 * existe aqui nenhuma comparacao de dono em JavaScript**. A diferenca e
 * concreta: uma comparacao em JavaScript pode ser escrita ao contrario e
 * continuar compilando; um `WHERE` que falta nao devolve o dado. Endereco de
 * outra conta nao e recusado -- ele nao encontra linha, e a rota devolve `null`
 * (na leitura) sem nunca dizer que existe (ADR-0021).
 *
 * E **nao ha assinatura que aceite conta de terceiro**: os dois metodos recebem
 * o chamador, e o `user_id` que chega ao `WHERE` e sempre o do portador do
 * token. Nao ha caminho de codigo por onde um id de outra pessoa entre.
 *
 * ## ESTE E O ENDERECO RESIDENCIAL, e tres coisas NAO acontecem aqui
 *
 * Cada uma e deliberada, e as tres sao as mesmas de
 * `kysely-pedido-de-plaquinha.ts` -- a postura nao afrouxa por o endereco
 * passar a ser reutilizavel:
 *
 * - **nenhum `console`, nenhum `log` e nenhum `RAISE`** com conteudo de
 *   endereco. O endereco aparece em dois lugares, os dois parametrizados: o
 *   `INSERT ... ON CONFLICT` e o `SELECT`;
 * - **nada e geocodificado e nenhum CEP e resolvido** (ADR-0006). Nao ha
 *   chamada externa, nao ha `lat`/`lon`, nao ha `geography` e nao ha indice
 *   espacial. O CEP e resolvido no app, e o que chega aqui e texto;
 * - **nenhuma leitura em lista.** Nao ha `selectAll` sem `WHERE`, nao ha
 *   paginacao e nao ha agregado. A unica leitura devolve no maximo uma linha,
 *   porque `user_id` e a chave primaria.
 *
 * ## `ON CONFLICT (user_id) DO UPDATE`, e por que nao um `UPDATE` com `INSERT`
 *   de reserva
 *
 * `user_id` e a chave primaria, entao "guardar" e sempre a mesma operacao
 * independentemente de ja haver linha: um `UPDATE` que nao encontra linha
 * devolve zero afetadas em silencio, e quem escrevesse o `INSERT` de reserva
 * depois dele teria duas idas ao banco e uma corrida entre as duas. O
 * `ON CONFLICT` e uma ida e nao tem corrida.
 *
 * **`updated_at` e reescrito a cada salvamento**, e e a UNICA coisa derivada
 * aqui. Ele nao e carimbo de expiracao: nada o le para apagar nada, nao existe
 * varredura nesta frente e nao existe constante de prazo -- a decisao do
 * cliente de 17/10/2026 e apagar so com a conta, e quem apaga e o
 * `ON DELETE CASCADE` de `user_id`.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { EnderecoGuardadoRepository } from '../../ports/endereco-guardado.js';
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

/**
 * As colunas do endereco, **nomeadas uma a uma**.
 *
 * Nao e `selectAll()`, e a diferenca importa: `selectAll` publicaria toda
 * coluna futura desta tabela por omissao, e e assim que um campo novo atravessa
 * a borda sem ninguem ter decidido nada. Hoje isso ja alcancaria `updated_at`,
 * que nao faz parte do endereco e nao e projetado em resposta nenhuma.
 */
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

/**
 * A linha para o tipo do dominio, **campo a campo**.
 *
 * Nunca por espalhamento da linha: `...linha` publicaria cada coluna nova por
 * omissao, e `updated_at` ja seria uma delas. Mesma regra, e pelo mesmo motivo,
 * de `comoResposta` em `localizacao-de-referencia-routes.ts`.
 */
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
      // A AUTORIZACAO. `user_id` e a chave primaria, e o chamador e o unico
      // valor que chega aqui: nao ha endereco de terceiro a encontrar.
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
          // O unico campo derivado deste arquivo. Ver o cabecalho: NAO e
          // carimbo de expiracao.
          updated_at: new Date(),
        }),
      )
      .returning(COLUNAS_DO_ENDERECO)
      .executeTakeFirstOrThrow();
    return comoEndereco(linha);
  }
}
