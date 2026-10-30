/** A persistência do perfil de outra pessoa. */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import type { UserId } from '../../../../shared/types/brands.js';
import {
  comoObjectKey,
  type PropositoDaImagem,
} from '../../../media/ports/imagem-de-catalogo.js';
import type {
  FotoDoPerfilDeOutraPessoa,
  PerfilDePessoaRepository,
  PessoaVisivel,
} from '../../ports/perfil-de-pessoa-repository.js';

/** O propósito da esteira da vitrine. */
const PROPOSITO_DA_VITRINE: PropositoDaImagem = 'user_showcase';

/** Só foto `ready` sai para terceiro. */
const FOTO_PRONTA = 'ready' as const;

interface LinhaDoPerfil {
  readonly user_id: string;
  readonly handle: string;
  readonly public_ref: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  /** O selo de validado. Ver o comentário do `SELECT` no construtor. */
  readonly canal_verificado: boolean;
}

interface LinhaDaFotoDoPerfil {
  readonly grade_key: string;
  readonly aberta_key: string;
  readonly alt_text: string | null;
}

/**
 * **A pessoa de um apelido, se ela existe para quem olha.** Seis predicados na
 * mesma consulta, e nenhum deles é dispensável:
 */
export function construtorDoPerfilPorApelido(
  db: Kysely<Database>,
  apelido: string,
  quemOlha: UserId,
): CompiledQuery<LinhaDoPerfil> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
    .select([
      'u.id as user_id',
      'h.handle as handle',
      'u.public_ref as public_ref',
      'u.display_name as display_name',
    ])
    .select(
      sql<number>`(SELECT count(*) FROM pets p
         WHERE p.owner_user_id = u.id AND p.deleted_at IS NULL)`.as('pets_count'),
    )
    .select(
      canalDeContatoConfirmadoNoSql('u').as('canal_verificado'),
    )
    .where('h.handle', '=', apelido)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemOlha}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemOlha}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemOlha}::uuid)`,
    )
    .compile();
}

/** **A vitrine de `dono`, e a conexão aceita está no `WHERE`.** */
export function construtorDaVitrineDeConexao(
  db: Kysely<Database>,
  dono: UserId,
  quemOlha: UserId,
): CompiledQuery<LinhaDaFotoDoPerfil> {
  return db
    .selectFrom('user_showcase_images as v')
    .innerJoin('catalog_images as c', 'c.id', 'v.image_id')
    .select(['c.thumb_key as grade_key', 'c.public_key as aberta_key', 'v.alt_text as alt_text'])
    .where('v.user_id', '=', dono)
    .where('c.purpose', '=', PROPOSITO_DA_VITRINE)
    .where('c.status', '=', FOTO_PRONTA)
    .where(sql<boolean>`c.thumb_key IS NOT NULL`)
    .where(sql<boolean>`c.public_key IS NOT NULL`)
    .where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND ((uc.requester_user_id = ${dono}::uuid AND uc.addressee_user_id = ${quemOlha}::uuid)
             OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = ${dono}::uuid))
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))`,
    )
    .where(sql<boolean>`NOT bloqueio_entre(${dono}::uuid, ${quemOlha}::uuid)`)
    .where(
      sql<boolean>`NOT foto_ocultada_para_quem_denunciou(c.public_key, ${quemOlha}::uuid)`,
    )
    .orderBy('v.position', 'asc')
    .compile();
}

function comoPessoa(linha: LinhaDoPerfil): PessoaVisivel {
  return {
    userId: linha.user_id as UserId,
    handle: linha.handle,
    publicRef: linha.public_ref,
    displayName: linha.display_name,
    petsCount: Number(linha.pets_count),
    canalVerificado: linha.canal_verificado,
  };
}

function comoFoto(linha: LinhaDaFotoDoPerfil): FotoDoPerfilDeOutraPessoa {
  return {
    gradeKey: comoObjectKey(linha.grade_key),
    abertaKey: comoObjectKey(linha.aberta_key),
    altText: linha.alt_text,
  };
}

export function criarPerfilDePessoaRepository(db: Kysely<Database>): PerfilDePessoaRepository {
  return {
    async perfilPorApelido(apelido: string, quemOlha: UserId) {
      const { rows } = await db.executeQuery(
        construtorDoPerfilPorApelido(db, apelido, quemOlha),
      );
      const linha = rows[0];
      return linha === undefined ? undefined : comoPessoa(linha);
    },

    async vitrineDeConexao(dono: UserId, quemOlha: UserId) {
      const { rows } = await db.executeQuery(
        construtorDaVitrineDeConexao(db, dono, quemOlha),
      );
      return rows.map(comoFoto);
    },
  };
}
