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
 * **TREZE argumentos desde a `20261029000003`**, que acrescentou `entity_kind`
 * (cliente, 29/10/2026: *"esta faltando o campo se e um profissional, ong ou
 * estabelecimento"*) -- e `p_entity_kind` entra DEPOIS de `p_kind`, porque e o
 * outro eixo do mesmo par, e nao no fim como "campo novo".
 *
 * Eram **doze desde a `20261017000015`**, que acrescentou `postal_code`
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

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { TipoDeEntidade, TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../../domain/sugestao-do-diretorio.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  DirectorySuggestionRepository,
  MinhaIndicacao,
  PaginaDasMinhasIndicacoes,
  RecorteDasMinhasIndicacoes,
  RegistroDaSugestao,
  SugestaoAGravar,
} from '../../ports/directory-suggestion-repository.js';
// **Os DOIS da PORTA, e nao do caso de uso**: `arquitetura/fronteira-de-modulo`
// reprova import de `media/application/` por outro modulo, e com razao -- modulo
// so conversa com modulo por porta. Foi o linter que apontou, e o conserto foi
// mover a constante para a porta, e nao afrouxar a regra.
import {
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
} from '../../../media/ports/imagem-de-catalogo.js';

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
  entity_kind: TipoDeEntidade;
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
    entityKind: l.entity_kind,
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

/**
 * A forma de UUID, para o `upload_id` que nao e UUID devolver "nao serve" em vez
 * de estourar como erro de banco.
 *
 * O contrato ja o valida como `format: uuid` e o Ajv recusa antes do handler --
 * esta e a SEGUNDA rede, e a mesma que `envioDeCatalogo` em
 * `media/adapters/persistence/kysely-imagem-de-catalogo.ts` tem pelo mesmo
 * motivo.
 */
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarDirectorySuggestionRepository(
  db: Db,
  ids: IdGenerator,
): DirectorySuggestionRepository {
  return {
    /**
     * Grava a indicacao -- e, quando ha logotipo, confirma o envio dele NA MESMA
     * TRANSACAO (ADR-0027 item 10).
     *
     * ## POR QUE HA TRANSACAO AQUI DESDE 29/10/2026
     *
     * Ate o logotipo isto era uma instrucao so e nao precisava de transacao.
     * Agora sao tres escritas que nao podem se separar: a imagem de catalogo, o
     * envio marcado como confirmado, o trabalho enfileirado -- e o `INSERT` da
     * indicacao. **Imagem confirmada para uma indicacao que depois nao foi
     * gravada ficaria `processing` para sempre**, e o varredor de vencidos nao a
     * recolhe (ele recolhe INTENCAO nao confirmada, e esta estaria confirmada).
     * Na direcao inversa, indicacao gravada apontando para imagem que nao
     * nasceu seria chave estrangeira violada.
     *
     * **Sem logotipo nao ha transacao**, e isso nao e otimizacao de enfeite: uma
     * transacao por indicacao sem logotipo gastaria uma conexao do pool por duas
     * instrucoes que nao precisam de atomicidade -- e indicacao sem logotipo e o
     * caso comum, inclusive todo o APK publicado.
     *
     * ## A CONFERENCIA E A CLAUSULA `WHERE`, E NAO UM `if`
     *
     * Quatro coisas tornam um `upload_id` inutilizavel, e as quatro sao
     * resolvidas na consulta:
     *
     *  - **nao e da conta que esta indicando** (`u.user_id`);
     *  - **nao e do proposito desta rota** (`u.purpose`) -- e e esta linha que
     *    impede o envio do PAINEL (`directory_logo`) de entrar na fila, do mesmo
     *    jeito que `imagemDoEnvio` da escrita administrativa impede o caminho
     *    inverso. **As duas juntas sao a fronteira da fila de revisao**: a
     *    imagem de uma indicacao que ninguem aprovou nao tem caminho ate
     *    `professionals`, que e a superficie publica;
     *  - **venceu** (`expires_at`);
     *  - **ja pertence a OUTRA indicacao** (a subconsulta de
     *    `directory_suggestions`).
     *
     * **Um `if` depois de um `SELECT` sem filtro teria lido o envio de outra
     * pessoa para a memoria deste processo**, que e o que o ADR-0021 nao quer --
     * a mesma razao escrita em `capaDoEnvio` do encontro da comunidade, e a
     * mesma razao pela qual `listarDoAutor` abaixo nao filtra nada nesta camada.
     *
     * `FOR UPDATE OF u` trava a linha do envio: duas escritas com o mesmo
     * `upload_id` nao podem as duas acha-lo aberto e criar duas imagens.
     *
     * ## O ENVIO JA CONFIRMADO NAO SERVE DE NOVO, E ESSA E A DIFERENCA DA CAPA
     *
     * Em `capaDoEnvio` o envio ja confirmado serve DE NOVO para o MESMO
     * encontro, porque encontro se edita. **Indicacao nao se edita** -- nao
     * existe operacao de atualizacao de `directory_suggestions` no contrato --,
     * entao `confirmed_at` preenchido nao tem segundo uso legitimo aqui: ele e
     * uma indicacao que ja foi gravada. Devolver "nao serve" e o certo, e a
     * `directory_suggestions_logotipo_unico` e a rede de baixo.
     */
    async registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao> {
      const ref = randomBytes(16).toString('base64url');
      const logoUploadId = sugestao.logoUploadId;

      /** O `INSERT` da indicacao, pela funcao. Igual com e sem logotipo. */
      const gravar = async (
        executor: Db | DbTransaction,
        logoImageId: string | null,
      ): Promise<RegistroDaSugestao> => {
        const linha = await sql<LinhaDoRegistro>`
          SELECT directory_suggestions_registrar(
            ${ids.uuidv7()}::uuid,
            ${ref},
            ${sugestao.autor}::uuid,
            ${sugestao.displayName},
            ${sugestao.kind},
            ${sugestao.entityKind},
            ${sugestao.city},
            ${sugestao.state},
            ${sugestao.neighborhood},
            ${sugestao.postalCode},
            ${sugestao.contatoKind},
            ${sugestao.contatoValue},
            ${sugestao.note},
            ${logoImageId}::uuid
          ) AS created_at
        `.execute(executor);

        const gravada = linha.rows[0];
        if (gravada === undefined) {
          // A funcao sempre devolve uma linha; chegar aqui e defeito de esquema,
          // e nao caso de borda. Lancar com o motivo e melhor que devolver um
          // recibo com `created_at` inventado.
          throw new Error(
            'directory_suggestions_registrar nao devolveu linha: as migracoes 20261017000004, 20261017000015, 20261029000003 e 20261029000004 nao estao aplicadas neste banco, ou a funcao mudou de forma.',
          );
        }
        return { tipo: 'gravada', sugestao: { ref, createdAt: gravada.created_at } };
      };

      // O CAMINHO COMUM, e o do APK publicado: sem logotipo, uma instrucao so.
      if (logoUploadId === null) return gravar(db, null);

      // Segunda rede da forma: `format: uuid` no contrato e a primeira.
      if (!FORMA_DE_UUID.test(logoUploadId)) return { tipo: 'envio_nao_serve' };

      return db.transaction().execute(async (trx) => {
        const r = await sql<{
          id: string;
          expires_at: Date;
          confirmed_at: Date | null;
        }>`
          SELECT u.id, u.expires_at, u.confirmed_at
            FROM catalog_upload_intents u
           WHERE u.id = ${logoUploadId}::uuid
             AND u.user_id = ${sugestao.autor}::uuid
             AND u.purpose = ${PROPOSITO_DO_LOGOTIPO_DA_INDICACAO}
           FOR UPDATE OF u
        `.execute(trx);

        const envio = r.rows[0];
        // Nao existe, nao e desta conta, ou nao e deste proposito. **Os tres
        // chegam aqui como o MESMO desfecho**, e o silencio e o recurso.
        if (envio === undefined) return { tipo: 'envio_nao_serve' };
        // JA CONFIRMADO: nao serve de novo. Ver o cabecalho.
        //
        // **E esta linha, e nao uma subconsulta, que cobre "ja usado em OUTRA
        // indicacao".** A primeira versao deste metodo tinha um `SELECT` em
        // `directory_suggestions` para perguntar isso, e um portao a reprovou
        // com razao -- este adaptador nao le aquela tabela direto, e a isca de
        // `minhas-indicacoes-routes.test.ts` guarda esse caminho.
        //
        // **A subconsulta era redundante, e nao foi so removida por causa do
        // portao:** `confirmed_at` e gravado na MESMA transacao que anexa a
        // imagem a uma indicacao, e indicacao nao se edita (nao existe operacao
        // de atualizacao de `directory_suggestions` no contrato). Entao envio
        // confirmado JA pertence a alguma indicacao, sempre -- perguntar a qual
        // delas nao muda a resposta. A `directory_suggestions_logotipo_unico` e
        // a rede de baixo, para o que esta linha nao alcance.
        if (envio.confirmed_at !== null) return { tipo: 'envio_nao_serve' };
        if (envio.expires_at.getTime() <= Date.now()) return { tipo: 'envio_nao_serve' };

        const imagemId = ids.uuidv7();
        await trx
          .updateTable('catalog_upload_intents')
          .set({ confirmed_at: new Date() })
          .where('id', '=', envio.id)
          // `confirmed_at is null` de novo, e nao por desconfianca do `FOR
          // UPDATE`: e a mesma guarda que `capaDoEnvio` tem, e ela e o que faz
          // a condicao de corrida ser impossivel em vez de improvavel.
          .where('confirmed_at', 'is', null)
          .execute();
        await trx
          .insertInto('catalog_images')
          .values({
            id: imagemId,
            upload_intent_id: envio.id,
            purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
            public_key: null,
            rejection_reason: null,
          })
          .execute();
        // Imagem sem trabalho ficaria `processing` para sempre; trabalho sem
        // imagem falharia em laco. Os dois na mesma transacao -- e, aqui,
        // tambem na mesma do `INSERT` da indicacao.
        await trx
          .insertInto('jobs')
          .values({
            id: ids.uuidv7(),
            kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
            payload: JSON.stringify({ catalog_image_id: imagemId }),
          })
          .execute();

        return gravar(trx, imagemId);
      });
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
