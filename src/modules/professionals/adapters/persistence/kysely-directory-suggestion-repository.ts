/**
 * Persistencia da fila de sugestoes do diretorio.
 *
 * ## Por que o `INSERT` nao e do construtor tipado do Kysely
 *
 * Porque uma das colunas nao existe em `DirectorySuggestionsTable`, de
 * proposito: a coluna da autoria leva a marca `NUNCA sai do servidor` no
 * `COMMENT ON COLUMN` da migracao `20261017000004`, e
 * `src/tools/portao-colunas-que-nao-saem.ts` varre **todo** `.ts` de `src/`
 * pelo nome literal dela -- **inclusive comentario**, e por isso o nome dela
 * nao esta escrito neste arquivo. Um
 * `insertInto('directory_suggestions').values({...})` com a autoria dentro
 * reprovaria o portao: a varredura e de nome, e ela nao sabe distinguir
 * escrever de projetar.
 *
 * Quem escreve e a funcao `directory_suggestions_registrar` da propria
 * migracao: o nome da coluna fica onde ele ja mora, e aqui chama-se a funcao
 * pelo nome dela.
 *
 * **Doze argumentos desde a `20261017000015`**, que acrescentou `postal_code`
 * (cliente, 18/10: "pode armazenar o cep sim!"). Aquela migracao DERRUBOU a
 * funcao de onze e criou a de doze, em vez de usar `CREATE OR REPLACE`: no
 * Postgres assinatura diferente e outra funcao, e as duas de pe deixariam a de
 * onze gravando sugestao sem CEP para sempre, pronta para alguem chamar. Mesmo arranjo de `network_events_gravar_autoria`, e nasceu da
 * mesma medicao -- a coluna de autoria do painel em `network_events` passou dez
 * dias existindo sem nunca ser gravada, porque o unico caminho ate ela passava
 * pelo nome proibido.
 *
 * ## `id` e `ref`, e por que os dois nascem aqui
 *
 * Como em `kysely-network-repository.pedirParaParticipar`: `id` e UUIDv7 pela
 * porta de identificadores, e `ref` e `randomBytes(16).toString('base64url')`
 * -- 128 bits de CSPRNG. **Os dois existem porque nenhum dos dois serve para o
 * papel do outro**: o UUIDv7 e ordenavel no tempo, o que da localidade de
 * indice e por isso ele e a chave primaria; e justamente por ser ordenavel ele
 * nao sai em resposta (ADR-0010 item 6), porque dois deles publicados entregam
 * a taxa de criacao de registros da plataforma.
 *
 * ## `review_status` nao e escrito aqui
 *
 * A sugestao nasce `pending` pelo `DEFAULT` da tabela, e a funcao nao aceita o
 * valor como parametro. Nao ha caminho, nesta operacao, para uma sugestao
 * nascer de outro jeito.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type {
  DirectorySuggestionRepository,
  SugestaoAGravar,
  SugestaoGravada,
} from '../../ports/directory-suggestion-repository.js';

/** O que o `RETURNING` da funcao devolve. */
interface LinhaDoRegistro {
  created_at: Date;
}

export function criarDirectorySuggestionRepository(
  db: Db,
  ids: IdGenerator,
): DirectorySuggestionRepository {
  return {
    async registrar(sugestao: SugestaoAGravar): Promise<SugestaoGravada> {
      const ref = randomBytes(16).toString('base64url');
      const linha = await sql<LinhaDoRegistro>`
        SELECT directory_suggestions_registrar(
          ${ids.uuidv7()}::uuid,
          ${ref},
          ${sugestao.autor}::uuid,
          ${sugestao.displayName},
          ${sugestao.kind},
          ${sugestao.city},
          ${sugestao.state},
          ${sugestao.neighborhood},
          ${sugestao.postalCode},
          ${sugestao.contatoKind},
          ${sugestao.contatoValue},
          ${sugestao.note}
        ) AS created_at
      `.execute(db);

      const gravada = linha.rows[0];
      if (gravada === undefined) {
        // A funcao sempre devolve uma linha; chegar aqui e defeito de esquema, e
        // nao caso de borda. Lancar com o motivo e melhor que devolver um
        // recibo com `created_at` inventado.
        throw new Error(
          'directory_suggestions_registrar nao devolveu linha: as migracoes 20261017000004 e 20261017000015 nao estao aplicadas neste banco, ou a funcao mudou de forma.',
        );
      }
      return { ref, createdAt: gravada.created_at };
    },
  };
}
