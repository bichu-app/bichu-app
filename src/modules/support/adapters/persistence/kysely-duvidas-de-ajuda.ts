/**
 * `help_requests` -- a duvida que o tutor manda pelo botao `Ajuda`
 * (migracao `20261029000010`, 29/10/2026).
 *
 * ## INSERT E SO INSERT
 *
 * Nao ha `ON CONFLICT`, nao ha `UPDATE` e **nao ha `DELETE` em lugar nenhum
 * deste arquivo**. Duvida repetida e duvida repetida: o tutor que manda duas
 * vezes mandou duas, e deduplicar seria o servidor decidir que a segunda nao
 * conta. Quem segura repeticao em rajada e o teto de chamada (`deny_429`), que
 * recusa com mensagem em vez de engolir calado.
 *
 * A ausencia de `DELETE` e regra desta casa e nao distracao: nada se apaga. O
 * dia em que a fila ganhar "resolvida" e "arquivada", elas serao coluna de
 * DATA e mudanca de estado, como `dismissed_at` em `notification_items`.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  DuvidaNaFila,
  DuvidaParaRegistrar,
  DuvidasDeAjuda,
} from '../../ports/duvidas-de-ajuda.js';

export function criarDuvidasDeAjuda(db: Db, ids: IdGenerator): DuvidasDeAjuda {
  return {
    async registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void> {
      await db
        .insertInto('help_requests')
        .values({
          id: ids.uuidv7(),
          author_user_id: duvida.autor,
          subject: duvida.assunto,
          body: duvida.texto,
          created_at: comoData(agora),
        })
        .execute();
    },

    async listarAFila(limite: number): Promise<readonly DuvidaNaFila[]> {
      // A CONSULTA QUE O PAINEL VAI USAR, e e esta que o caso de integracao
      // exerce. `created_at desc` casa com `help_requests_da_fila`; trocar a
      // ordem aqui deixa o indice sem leitor.
      //
      // Nenhuma juncao com `users`: o nome e o e-mail de quem perguntou sao do
      // cadastro, e quem os resolve e a tela do painel, que ainda nao existe.
      // Trazer coluna de pessoa agora seria escolher, sem tela na mesa, o que
      // sai do perfil de alguem.
      const linhas = await db
        .selectFrom('help_requests')
        .select(['id', 'author_user_id', 'subject', 'body', 'created_at'])
        .orderBy('created_at', 'desc')
        .limit(limite)
        .execute();

      return linhas.map((linha) => ({
        id: linha.id,
        autor: linha.author_user_id as UserId,
        assunto: linha.subject,
        texto: linha.body,
        criadaEm: linha.created_at.getTime() as Instant,
      }));
    },
  };
}
