import type { Db } from '../../../../shared/db/pool.js';
import type {
  DisponibilidadeDaPagina,
  PaginaPublica,
} from '../../ports/disponibilidade-da-pagina.js';

export function criarDisponibilidadeDaPagina(db: Db): DisponibilidadeDaPagina {
  return {
    async estaPublicada(pagina: PaginaPublica): Promise<boolean> {
      try {
        const linha = await db
          .selectFrom('site_page_availability')
          .select(['is_published'])
          .where('page', '=', pagina)
          .executeTakeFirst();
        if (linha === undefined) return false;
        return linha.is_published === true;
      } catch {
        return false;
      }
    },
  };
}
