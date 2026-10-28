/**
 * O endereco de entrega guardado no pet, no Postgres.
 *
 * **Decisao do cliente de 27/10/2026** (*"endereco um por pet"*), que supera a
 * de 21/10/2026 (*"um endereco de entrega salvo na conta"*). O registro inteiro
 * das duas, com as palavras dele, mora em `ports/endereco-do-pet.ts` e no
 * cabecalho da migracao `20261027000001`.
 *
 * ## A AUTORIZACAO ESTA NA CLAUSULA `WHERE`, e isso nao e estilo
 *
 * As duas consultas deste arquivo carregam, as duas, a MESMA tripla:
 *
 *     p.id = <pet>  AND  p.owner_user_id = <chamador>  AND  p.deleted_at IS NULL
 *
 * e **nao existe aqui nenhuma comparacao de dono em JavaScript**. A diferenca e
 * concreta: uma comparacao em JavaScript pode ser escrita ao contrario e
 * continuar compilando; um `WHERE` que falta nao devolve o dado. Pet de outra
 * pessoa nao e recusado -- ele nao encontra linha, e a rota devolve 404 sem
 * nunca dizer que existe (ADR-0021).
 *
 * **A ESCRITA USA A MESMA CLAUSULA DA LEITURA, e nao um caminho proprio.** O
 * `INSERT` e um `INSERT ... SELECT` sobre `pets` com aquela tripla: quando ela
 * nao casa, nao ha linha para inserir e o `RETURNING` volta vazio. E assim que
 * uma das duas nao acaba mais frouxa que a outra num conserto futuro.
 *
 * ## OS DOIS VAZIOS SAO DIFERENTES, e a rota os traduz diferente
 *
 * - `undefined` -- a tripla nao casou: **404**;
 * - `null` -- a tripla casou e nao ha linha de endereco: **200 com `null`**.
 *
 * E e por isso que a LEITURA sao duas consultas e nao uma: uma consulta so com
 * `LEFT JOIN` responderia "nada" nos dois casos, e a rota passaria a dizer "sem
 * endereco" para pet que nao e do chamador. Mesma forma, e mesmo motivo, de
 * `listarDoPet` em `kysely-pedido-de-plaquinha.ts`.
 *
 * ## ESTE E O ENDERECO RESIDENCIAL, e tres coisas NAO acontecem aqui
 *
 * As tres sao as mesmas de `kysely-endereco-guardado.ts` e de
 * `kysely-pedido-de-plaquinha.ts` -- a postura nao afrouxa por o endereco mudar
 * de dono:
 *
 * - **nenhum `console`, nenhum `log` e nenhum `RAISE`** com conteudo de
 *   endereco. Todo valor viaja PARAMETRIZADO, e nenhum e interpolado em texto de
 *   consulta: um endereco num log de consulta lenta sobreviveria a exclusao da
 *   conta;
 * - **nada e geocodificado e nenhum CEP e resolvido** (ADR-0006). Nao ha chamada
 *   externa, nao ha `lat`/`lon`, nao ha `geography` e nao ha indice espacial. O
 *   CEP e resolvido no app, e o que chega aqui e texto;
 * - **nenhuma leitura em lista.** Nao ha `SELECT` sem a tripla, nao ha paginacao
 *   e nao ha agregado. A unica leitura devolve no maximo uma linha, porque
 *   `pet_id` e a chave primaria -- e nao existe neste arquivo consulta que
 *   receba so o chamador e devolva os enderecos de todos os pets dele.
 *
 * ## `ON CONFLICT (pet_id) DO UPDATE`, e por que nao um `UPDATE` com `INSERT`
 *   de reserva
 *
 * `pet_id` e a chave primaria, entao "guardar" e sempre a mesma operacao
 * independentemente de ja haver linha: um `UPDATE` que nao encontra linha
 * devolve zero afetadas em silencio, e quem escrevesse o `INSERT` de reserva
 * depois dele teria duas idas ao banco e uma corrida entre as duas. O
 * `ON CONFLICT` e uma ida e nao tem corrida.
 *
 * **`updated_at` e reescrito a cada salvamento**, e e a UNICA coisa derivada
 * aqui. Ele nao e carimbo de expiracao: nada o le para apagar nada, nao existe
 * varredura nesta frente e nao existe constante de prazo -- a decisao do cliente
 * de 17/10/2026 e apagar so com o pet ou com a conta, e quem apaga sao os dois
 * `ON DELETE CASCADE` em cadeia.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { EnderecoDoPetRepository } from '../../ports/endereco-do-pet.js';
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

/**
 * As colunas do endereco, **nomeadas uma a uma**.
 *
 * Nao e `SELECT d.*`, e a diferenca importa: a estrela publicaria toda coluna
 * futura desta tabela por omissao, e e assim que um campo novo atravessa a borda
 * sem ninguem ter decidido nada. Hoje isso ja alcancaria `updated_at`, que nao
 * faz parte do endereco e nao e projetado em resposta nenhuma.
 */
const COLUNAS_DO_ENDERECO = sql`
  d.recipient_name, d.recipient_phone, d.postal_code,
  d.street, d.street_number, d.complement,
  d.neighborhood, d.city, d.state
`;

/**
 * As MESMAS nove colunas, **sem o apelido da tabela**, para o `RETURNING`.
 *
 * Nao e duplicacao por descuido: dentro de `RETURNING` nao existe apelido
 * nenhum em escopo -- `d.recipient_name` ali e erro de sintaxe, nao uma
 * qualificacao redundante. A alternativa seria um `RETURNING *`, e e justamente
 * ele que publicaria `updated_at` e toda coluna futura por omissao.
 *
 * As duas listas sao conferidas uma contra a outra por
 * `src/tools/endereco-do-pet-nao-sai-em-publico.test.ts`: a nove e nove, pelo
 * nome, para que acrescentar coluna a uma e esquecer a outra reprove em vez de
 * chegar `undefined` em tempo de execucao -- `sql<LinhaDoEndereco>` e asserção e
 * nao conferencia, e o `tsc` ficaria verde.
 */
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

/**
 * A linha para o tipo do dominio, **campo a campo**.
 *
 * Nunca por espalhamento da linha: `...linha` publicaria cada coluna nova por
 * omissao, e `updated_at` ja seria uma delas. Mesma regra, e pelo mesmo motivo,
 * de `comoEndereco` em `kysely-endereco-guardado.ts`.
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

export function criarEnderecoDoPetRepository(deps: { readonly db: Db }): EnderecoDoPetRepository {
  return {
    async doPetDoChamador(
      pet: PetId,
      chamador: UserId,
    ): Promise<EnderecoDeEntrega | null | undefined> {
      // PRIMEIRA PERGUNTA: "o pet e seu?". Ver o cabecalho -- sem ela, pet de
      // terceiro e pet sem endereco dariam a mesma resposta.
      const dono = await sql<{ id: string }>`
        SELECT p.id
          FROM pets p
         WHERE p.id = ${pet}::uuid
           AND p.owner_user_id = ${chamador}::uuid
           AND p.deleted_at IS NULL
      `.execute(deps.db);
      if (dono.rows[0] === undefined) return undefined;

      // SEGUNDA PERGUNTA: "qual o endereco dele?". A tripla vem de novo, e nao
      // por desconfianca da primeira: e para que esta consulta continue
      // autorizada sozinha se alguem a mover ou reusar.
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
      // O `INSERT` e o `SELECT` que o autoriza, numa instrucao -- a mesma forma
      // de `criarOuDevolverPendente`. Quando a tripla nao casa nao ha linha a
      // inserir, o `RETURNING` volta vazio, e a rota responde 404.
      //
      // Todo valor de endereco viaja PARAMETRIZADO. Nenhum e interpolado em
      // texto de consulta e nenhum e registrado.
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
