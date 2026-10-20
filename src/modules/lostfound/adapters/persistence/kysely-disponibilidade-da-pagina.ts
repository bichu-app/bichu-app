/**
 * Leitura do interruptor da pagina publica, por chave primaria.
 *
 * ## NAO HA CACHE EM PROCESSO, pelo mesmo motivo da tabela irma
 *
 * `kysely-politica-de-versao.ts` recusou cache e o argumento vale inteiro aqui,
 * com um ajuste no item 1:
 *
 * 1. **O cache atrasaria o gesto que nao pode atrasar.** Aqui o gesto urgente e
 *    APAGAR: a pagina subiu quebrada, ou saiu do ar, e quem digita o `UPDATE`
 *    precisa que o proximo `GET` ja nao ofereca o compartilhamento. Com cache de
 *    30 s o produto continuaria mandando gente para uma pagina morta por mais 30
 *    segundos depois do comando, com quem o digitou sem saber se consertou.
 * 2. **A leitura e de uma linha por chave primaria.**
 *    `site_page_availability` tem duas linhas (migracao `20261020000005`), a
 *    tabela nunca cresce, e a pagina dela vive no `shared_buffers`. A consulta e
 *    mais barata que o aperto de mao TLS que trouxe a requisicao.
 *
 * `select` explicito e nao `selectAll()`: `updated_by` e texto livre escrito por
 * quem opera a publicacao, e o efeito desta leitura sai numa resposta de API.
 * Coluna nova nao pode comecar a vazar por `selectAll()` ter sido mais curto.
 *
 * ## O `try` E A PORTA, E NAO UM REMENDO
 *
 * O contrato de `estaPublicada` -- "nunca lanca, e somente `true` explicito
 * acende" -- esta escrito na porta e e provado em
 * `disponibilidade-da-pagina.test.ts`. O `catch` aqui e a implementacao daquele
 * contrato, e a assimetria que o justifica (fabricar o valor RESTRITIVO nao e
 * afirmar o que nao se mediu; fabricar o PERMISSIVO seria) esta no cabecalho da
 * porta. Nada vai para log: a leitura e por requisicao, e um `reportError` por
 * requisicao com o banco fora afogaria a observabilidade do incidente de
 * verdade, que e o banco estar fora.
 *
 * `linha.is_published === true` e nao `!!linha.is_published`: o `===` recusa
 * tambem o `'t'` que um driver poderia entregar como texto, e e a quarta linha
 * da lista fechada da porta.
 */
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
