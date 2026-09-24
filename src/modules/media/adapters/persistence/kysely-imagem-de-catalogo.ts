/**
 * A persistencia da intencao de envio de imagem de catalogo (ADR-0027 item 10,
 * apendice A.3).
 *
 * Funcao solta sobre um executor, e nao um repositorio com transacao propria:
 * a intencao e a linha de trilha dela vao na MESMA transacao (D49), e quem a
 * abre e a escrita administrativa.
 *
 * A confirmacao do envio, a imagem em `catalog_images` e o processamento entram
 * com a emenda de varias imagens por produto (pedido do cliente de 23/09).
 *
 * Nenhuma funcao daqui le `users` nem `user_roles` (D51). O "criado por conta
 * admin" do item 10 e garantido pelo unico caminho que cria
 * `kind = 'catalog_image'`, que passa pela guarda administrativa.
 */
import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { PropositoDaImagemDeCatalogo } from '../../../../shared/db/schema.js';
import type { ObjectKey } from '../../../../shared/types/brands.js';
import type { RegistroDeImagemDeCatalogo } from '../../ports/imagem-de-catalogo.js';

export async function registrarIntencaoDeCatalogo(
  db: DbExecutor,
  nova: {
    readonly id: string;
    readonly userId: string;
    readonly purpose: PropositoDaImagemDeCatalogo;
    readonly objectKey: ObjectKey;
    readonly declaredType: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
  },
): Promise<void> {
  await db
    .insertInto('upload_intents')
    .values({
      id: nova.id,
      user_id: nova.userId,
      pet_id: null,
      found_report_id: null,
      kind: 'catalog_image',
      purpose: nova.purpose,
      object_key: nova.objectKey,
      declared_type: nova.declaredType,
      max_bytes: nova.maxBytes,
      expires_at: nova.expiresAt,
    })
    .execute();
}

/** O que a escrita administrativa enxerga pela porta. */
export const registroDeImagemDeCatalogo: RegistroDeImagemDeCatalogo = {
  registrarIntencao: registrarIntencaoDeCatalogo,
};
