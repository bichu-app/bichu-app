import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  BuscaDePessoasRepository,
  PaginaDeBuscaDePessoas,
  PessoaEncontrada,
} from '../../ports/busca-de-pessoas-repository.js';

interface LinhaDaBusca {
  readonly handle: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  readonly photo_key: string | null;
  readonly connections_count: string | number;
  readonly total: string | number;
}

/** **A busca, com os seis predicados e o casamento por nome OU apelido.** */
export function construtorDaBuscaDePessoas(
  db: Kysely<Database>,
  termo: string,
  quemBusca: UserId,
  pagina: number,
  limite: number,
): CompiledQuery<LinhaDaBusca> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
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
    .select(
      sql<string | null>`(SELECT foto.thumb_key FROM catalog_images foto
         WHERE foto.id = u.photo_image_id
           AND foto.purpose = 'user_photo'
           AND foto.status = 'ready'
           AND foto.thumb_key IS NOT NULL)`.as('photo_key'),
    )
    .select(sql<number>`count(*) OVER ()`.as('total'))
    .where(
      sql<boolean>`(texto_para_busca(u.display_name) LIKE padrao_de_busca(${termo})
                 OR texto_para_busca(h.handle::text) LIKE padrao_de_busca(${termo}))`,
    )
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemBusca}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemBusca}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemBusca}::uuid)`,
    )
    .where(sql<boolean>`u.id <> ${quemBusca}::uuid`)
    .orderBy('u.display_name', 'asc')
    .orderBy('h.handle', 'asc')
    .limit(limite)
    .offset((pagina - 1) * limite)
    .compile();
}

function comoPessoa(linha: LinhaDaBusca): PessoaEncontrada {
  return {
    handle: linha.handle,
    displayName: linha.display_name,
    petsCount: Number(linha.pets_count),
    connectionsCount: Number(linha.connections_count),
    photoKey: linha.photo_key,
  };
}

export function criarBuscaDePessoasRepository(db: Kysely<Database>): BuscaDePessoasRepository {
  return {
    async buscar(termo: string, quemBusca: UserId, pagina: number, limite: number) {
      const { rows } = await db.executeQuery(
        construtorDaBuscaDePessoas(db, termo, quemBusca, pagina, limite),
      );
      const pessoas = rows.map(comoPessoa);
      const total = rows.length === 0 ? 0 : Number(rows[0]?.total ?? 0);
      const resultado: PaginaDeBuscaDePessoas = { itens: pessoas, total };
      return resultado;
    },
  };
}
