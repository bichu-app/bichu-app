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
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  DuvidaParaRegistrar,
  DuvidasDeAjuda,
  PaginaDaFila,
} from '../../ports/duvidas-de-ajuda.js';

export function criarDuvidasDeAjuda(db: Db, ids: IdGenerator): DuvidasDeAjuda {
  return {
    async registrar(duvida: DuvidaParaRegistrar, agora: Instant): Promise<void> {
      await db
        .insertInto('help_requests')
        .values({
          id: ids.uuidv7(),
          // 128 bits de CSPRNG em base64url (22 simbolos), a mesma forma de
          // `users.public_ref`. E ele que sai para o painel; o `id` nunca sai.
          ref: Buffer.from(ids.random128()).toString('base64url'),
          author_user_id: duvida.autor,
          subject: duvida.assunto,
          body: duvida.texto,
          created_at: comoData(agora),
        })
        .execute();
    },

    async listarAFila(pagina: number, limite: number): Promise<PaginaDaFila> {
      const deslocamento = (pagina - 1) * limite;
      // A CONSULTA QUE O PAINEL VAI USAR, e e esta que o caso de integracao
      // exerce. `created_at desc` casa com `help_requests_da_fila`; trocar a
      // ordem aqui deixa o indice sem leitor.
      //
      // **NENHUMA JUNCAO COM `users`, e `author_user_id` nao esta no `select`.**
      //
      // Nao e economia de consulta: e a regra do backoffice. O contrato afirma
      // em tres lugares que a fila de pedidos de encontro e "a unica leitura de
      // pessoa do backoffice v1" (D53 a D57, cliente 23/09), e a fila de
      // plaquinhas repete a afirmacao e se abstem. Projetar o autor aqui criaria
      // a segunda, e tornaria aquela frase falsa nos tres lugares.
      //
      // `id` tambem fica de fora: o que sai e `ref`, opaco. UUIDv7 e ordenavel
      // no tempo, e dois deles entregam a taxa de criacao (SEC-001/SEC-002).
      const linhas = await db
        .selectFrom('help_requests')
        .select(['ref', 'subject', 'body', 'created_at'])
        .orderBy('created_at', 'desc')
        .offset(deslocamento)
        .limit(limite)
        .execute();

      // A CONTAGEM VEM DO BANCO e nao do tamanho da pagina: com `linhas.length`
      // o painel desenharia uma pagina so e esconderia o resto da fila --
      // exatamente o defeito que uma fila nao pode ter.
      const { total } = await db
        .selectFrom('help_requests')
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow();

      return {
        itens: linhas.map((linha) => ({
          ref: linha.ref,
          assunto: linha.subject,
          texto: linha.body,
          criadaEm: linha.created_at.getTime() as Instant,
        })),
        total: Number(total),
      };
    },
  };
}
