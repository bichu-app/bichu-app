import { sql, type CompiledQuery, type Kysely } from 'kysely';

import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ListaDaRegiaoRepository,
  PaginaDaListaDaRegiao,
  PessoaDaRegiao,
} from '../../ports/lista-da-regiao-repository.js';

interface LinhaDaRegiao {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  readonly connections_count: string | number;
  readonly total: string | number;
}

/**
 * **A LISTAGEM DA REGIÃO, com os SETE predicados na cláusula `WHERE`.**
 *
 * Os sete estão aqui e não num filtro de borda (ADR-0021), como os seis de
 * `construtorDaBuscaDePessoas`: autorização que filtra depois de a linha sair do
 * banco é autorização que alguém pode esquecer de chamar.
 *
 * **NÃO HÁ `photo_key` NESTA CONSULTA**, e a ausência é o desenho: a busca
 * carrega a foto porque os três freios dela garantem que quem a vê já sabe quem
 * procura; esta lista é folhear, e com foto seria o catálogo de rostos que o
 * plano 4-B recusou.
 *
 * **NÃO HÁ TERMO, e não existe parâmetro por onde um entrar**: a decisão 2 do
 * cliente é que a busca não muda, e um `q` aqui seria uma segunda busca sem os
 * freios da primeira.
 */
export function construtorDaListaDaRegiao(
  db: Kysely<Database>,
  quemVe: UserId,
  pagina: number,
  limite: number,
): CompiledQuery<LinhaDaRegiao> {
  return (
    db
      .selectFrom('handles as h')
      .innerJoin('users as u', 'u.id', 'h.user_id')
      // A conta de QUEM VÊ entra na consulta, e não como parâmetro de região:
      // é daqui que a cidade e o estado saem. Uma assinatura que recebesse
      // `cidade` deixaria quem chama escolher a região que quer olhar.
      .innerJoin('users as eu', (join) =>
        join.on(sql<boolean>`eu.id = ${quemVe}::uuid`),
      )
      .select(['h.handle as handle', 'u.display_name as display_name'])
      .select(
        sql<number>`(SELECT count(*) FROM pets p
         WHERE p.owner_user_id = u.id AND p.deleted_at IS NULL)`.as('pets_count'),
      )
      .select(
        sql<number>`(SELECT count(*) FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND (uc.requester_user_id = u.id OR uc.addressee_user_id = u.id)
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))`.as('connections_count'),
      )
      // `count(*) OVER ()` e NÃO uma segunda consulta, pela mesma razão da
      // busca: duas consultas seriam duas chances de a página e o total
      // discordarem sem nada acusar.
      .select(sql<number>`count(*) OVER ()`.as('total'))

      // 1. A MESMA REGIÃO: cidade E estado, normalizados por `texto_para_busca`
      //    -- a MESMA função do diretório e da busca, e não uma segunda
      //    normalização, que divergiria em silêncio ficando só lenta.
      //
      //    Ela é `STRICT`: cidade nula devolve nulo, e `NULL = NULL` não é
      //    verdadeiro. **Então quem não tem região de referência não casa com
      //    ninguém e não é casado por ninguém, sem nenhum `if`** -- nos DOIS
      //    lados, porque as duas pontas passam pela mesma função.
      //
      //    **O BAIRRO NÃO ESTÁ AQUI**, nem no `WHERE` nem no `ORDER BY`: ele é
      //    texto livre sem forma canônica, e ordenar por ele entregaria o
      //    bairro PELA POSIÇÃO mesmo sem campo de bairro na resposta.
      .where(
        sql<boolean>`texto_para_busca(u.reference_city) = texto_para_busca(eu.reference_city)`,
      )
      .where(
        sql<boolean>`texto_para_busca(u.reference_state) = texto_para_busca(eu.reference_state)`,
      )

      // 2. ADERIU. A decisão 1 do cliente: só quem optar aparece, e a adesão
      //    nasce DESLIGADA. Revogável -- o predicado é lido a cada requisição.
      .where('u.region_listing_opted_in_at', 'is not', null)

      // 3. RECIPROCIDADE: quem não aparece na lista não vê a lista.
      //    **É a RECOMENDAÇÃO desta frente, e é reversível nesta linha** -- o
      //    cliente decidiu quem APARECE, e não quem VÊ. O argumento é o dos
      //    outros freios: sem ela, quem quer só raspar o catálogo não paga
      //    nada. O custo, dito: é um pedágio para folhear.
      .where('eu.region_listing_opted_in_at', 'is not', null)

      // 4. VERIFICADO, nos dois lados. A MESMA régua do selo, numa fonte só
      //    (`shared/db/canal-de-contato-confirmado.ts`): e-mail OU telefone.
      //    Nada escreve `phone_verified_at` hoje, e por isso ela vale hoje como
      //    "e-mail confirmado" -- no dia em que o telefone confirmar, as duas
      //    pontas se movem juntas porque leem a mesma expressão.
      .where(canalDeContatoConfirmadoNoSql('u'))
      .where(canalDeContatoConfirmadoNoSql('eu'))

      // 5. CONTA HABILITADA, dos dois lados (decisão de 17/10/2026: conta
      //    desabilitada *"não é mais encontrada em nenhuma página ou
      //    funcionalidade"*).
      .where(sql<boolean>`conta_habilitada(u.id)`)
      .where(sql<boolean>`conta_habilitada(${quemVe}::uuid)`)

      // 6. BLOQUEIO, NOS DOIS SENTIDOS. `bloqueio_entre` é simétrica de
      //    propósito: sem a simetria, quem foi bloqueado continuaria vendo quem
      //    o bloqueou -- que é a situação de quem bloqueia por estar sendo
      //    perseguido.
      .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemVe}::uuid)`)

      // 7. PERFIL QUE QUEM OLHA DENUNCIOU não aparece -- o mesmo predicado da
      //    busca, pela mesma razão.
      .where(
        sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemVe}::uuid)`,
      )

      // 8. QUEM CHAMA NÃO APARECE PARA SI MESMO: a conta não se conecta consigo
      //    mesma, e o único botão de um item é `Pedir conexão`.
      .where(sql<boolean>`u.id <> ${quemVe}::uuid`)

      // Só pessoa. Apelido de PET e apelido RESERVADO não entram, como na
      // busca.
      .where('h.kind', '=', 'pessoa')

      // A MESMA ordem da busca: nome e depois apelido. **E não bairro** -- ver
      // o predicado 1.
      .orderBy('u.display_name', 'asc')
      .orderBy('h.handle', 'asc')
      .limit(limite)
      .offset((pagina - 1) * limite)
      .compile()
  );
}

function comoPessoa(linha: LinhaDaRegiao): PessoaDaRegiao {
  return {
    handle: linha.handle,
    displayName: linha.display_name,
    petsCount: Number(linha.pets_count),
    connectionsCount: Number(linha.connections_count),
  };
}

export function criarListaDaRegiaoRepository(db: Kysely<Database>): ListaDaRegiaoRepository {
  return {
    async listar(quemVe: UserId, pagina: number, limite: number) {
      const { rows } = await db.executeQuery(
        construtorDaListaDaRegiao(db, quemVe, pagina, limite),
      );
      const pessoas = rows.map(comoPessoa);
      const total = rows.length === 0 ? 0 : Number(rows[0]?.total ?? 0);
      const resultado: PaginaDaListaDaRegiao = { itens: pessoas, total };
      return resultado;
    },
  };
}
