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
 *
 * ## A LEITURA (`listarDoAutor`) passa por FUNCAO, e pelo mesmo motivo
 *
 * `indicacoes_do_autor(uuid)` (`20261018000003`). O nome da coluna de autoria
 * nao esta escrito neste arquivo -- nem no `INSERT`, nem no `WHERE` --, e a
 * razao e a mesma do paragrafo de cima: a varredura de
 * `portao-colunas-que-nao-saem.ts` e de NOME LITERAL sobre todo `.ts` de
 * `src/`, inclusive comentario.
 *
 * **E a funcao devolve TABELA, nao booleano**, ao contrario de
 * `indicacao_com_autor_ativo` em `kysely-fila-de-indicacoes.ts`. A diferenca e
 * de plano de execucao: um predicado opaco no `WHERE` impediria o planejador de
 * usar o indice `directory_suggestions_do_autor`, e esta consulta e justamente
 * por autoria. O cabecalho da `20261018000003` mede isso.
 *
 * ## A AUTORIZACAO E O `WHERE` DA FUNCAO, e nao um filtro desta camada
 *
 * `listarDoAutor` passa a conta como ARGUMENTO da funcao, e e lá dentro que ela
 * entra na clausula `WHERE`. Nao ha, neste arquivo, um `if` sobre a linha lida
 * nem um filtro aplicado depois: a indicacao de outra conta nunca chega a
 * memoria deste processo. Um `if` depois da leitura responderia `403` onde o
 * ADR-0021 manda `404`, e a linha ja estaria lida.
 *
 * **Conta desabilitada devolve zero linhas pela mesma funcao**, que delega a
 * `conta_habilitada(uuid)` (`20261017000013`). Nao ha nada a conferir aqui, e
 * conferir de novo seria a segunda definicao da regra.
 *
 * ## A contagem e uma SEGUNDA consulta, e nao `count(*) OVER ()`
 *
 * `total` sai de uma contagem propria sobre a mesma funcao. Uma janela na
 * consulta das linhas devolveria o total junto -- e devolveria o total DA
 * PAGINA quando o `LIMIT` cortasse, que e o defeito que faz o paginador parar
 * no primeiro bloco. Duas consultas, e a segunda e sobre indice.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../../domain/sugestao-do-diretorio.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  DirectorySuggestionRepository,
  MinhaIndicacao,
  PaginaDasMinhasIndicacoes,
  RecorteDasMinhasIndicacoes,
  SugestaoAGravar,
  SugestaoGravada,
} from '../../ports/directory-suggestion-repository.js';

/** O que o `RETURNING` da funcao devolve. */
interface LinhaDoRegistro {
  created_at: Date;
}

/**
 * Uma linha de `indicacoes_do_autor(uuid)`.
 *
 * **A coluna da autoria nao esta aqui porque a funcao nao a projeta.** Ela e
 * parametro e filtro, nunca saida -- e o `COMMENT ON FUNCTION` da
 * `20261018000003` diz isso para quem for conferir.
 */
interface LinhaDaMinhaIndicacao {
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  city: string;
  state: string;
  neighborhood: string | null;
  contact_kind: TipoDeContatoPublico;
  contact_value: string;
  review_status: RevisaoDaIndicacao;
  created_at: Date;
  decided_at: Date | null;
  decline_reason: string | null;
  entry_slug: string | null;
}

function comoMinhaIndicacao(l: LinhaDaMinhaIndicacao): MinhaIndicacao {
  return {
    ref: l.ref,
    displayName: l.display_name,
    kind: l.kind,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    contatoKind: l.contact_kind,
    contatoValue: l.contact_value,
    reviewStatus: l.review_status,
    createdAt: l.created_at,
    decidedAt: l.decided_at,
    declineReason: l.decline_reason,
    entradaSlug: l.entry_slug,
  };
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

    async listarDoAutor(
      recorte: RecorteDasMinhasIndicacoes,
    ): Promise<PaginaDasMinhasIndicacoes> {
      // A ORDEM E O INVERSO DA FILA DO PAINEL, e e deliberado: fila de
      // trabalho humano se atende do mais antigo, lista do que EU fiz se le do
      // mais novo. `ref` entra como desempate porque dois `created_at` iguais
      // (mesma transacao, mesmo instante) dariam ordem instavel entre paginas,
      // e paginador com ordem instavel repete ou pula linha.
      // POR NOME, e nao `SELECT *`, pela mesma regra da casa que vale em
      // `kysely-fila-de-indicacoes.ts`: a lista explicita e o que faz um campo
      // novo na origem entrar nesta borda por decisao, e nao por descuido.
      // Aqui a origem e uma funcao cuja saida ja exclui a autoria -- a lista
      // nao e a protecao, e sim a segunda afirmacao da mesma coisa.
      // O FILTRO DE ESTADO, em UMA expressao usada nas duas consultas.
      //
      // Uma constante e nao duas copias: as duas sao a mesma pergunta, e a
      // copia que fica atras e a que faz o paginador oferecer pagina vazia --
      // `total` de um recorte e linhas de outro. Ausente, `TRUE`: todos os
      // estados, que e a pergunta de quem abre a tela.
      const doEstado =
        recorte.reviewStatus === undefined
          ? sql`TRUE`
          : sql`review_status = ${recorte.reviewStatus}`;

      const linhas = await sql<LinhaDaMinhaIndicacao>`
        SELECT ref, display_name, kind, city, state, neighborhood,
               contact_kind, contact_value, review_status,
               created_at, decided_at, decline_reason, entry_slug
          FROM indicacoes_do_autor(${recorte.autor}::uuid)
         WHERE ${doEstado}
         ORDER BY created_at DESC, ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}
      `.execute(db);

      // O total E O DO RECORTE, e passa pelo MESMO filtro: um total que
      // ignorasse `state` faria "Mostrando 1 a 20 de 87" sobre 3 pendentes.
      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM indicacoes_do_autor(${recorte.autor}::uuid)
         WHERE ${doEstado}
      `.execute(db);

      return {
        itens: linhas.rows.map(comoMinhaIndicacao),
        total: Number(contagem.rows[0]?.total ?? 0),
      };
    },
  };
}
