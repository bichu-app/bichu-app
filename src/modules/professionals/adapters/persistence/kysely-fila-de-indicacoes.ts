/**
 * Persistencia da FILA DE REVISAO das indicacoes do `Perto`.
 *
 * ## O FILTRO DE CONTA DESABILITADA ESTA EM TRES LUGARES NESTE ARQUIVO
 *
 * Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
 * nenhuma pagina ou funcionalidade". Aqui isso custa TRES clausulas `WHERE`, e
 * nao uma:
 *
 *   1. `listar`, na consulta das linhas **e na contagem do recorte**;
 *   2. `indicacaoPorRef`, na leitura de uma indicacao (fora e dentro da
 *      transacao, pela mesma funcao);
 *   3. `listar`, na contagem de `pendentes` -- **o aviso do menu**.
 *
 * O terceiro e o que a fila da Rede ensinou a nao esquecer: la o filtro entrou
 * primeiro so na listagem, e o painel passou a dizer "1 pendente" sobre uma
 * fila vazia -- quem abria procurava um pedido que a listagem nao mostrava
 * mais. O comentario da `20261017000014` registra o episodio.
 *
 * ## O predicado e FUNCAO, e o nome da coluna nao esta escrito aqui
 *
 * `indicacao_com_autor_ativo(s.id)` (migracao `20261017000016`), que delega a
 * `conta_habilitada(uuid)` (`20261017000013`). Chamar `conta_habilitada` daqui
 * exigiria escrever o nome da coluna de autoria em TypeScript, e
 * `src/tools/portao-colunas-que-nao-saem.ts` reprova o nome literal em todo
 * `.ts` de `src/`, inclusive em comentario. Mesmo arranjo de
 * `encontro_com_autor_ativo` em `kysely-network-repository.ts`.
 *
 * ## `SELECT` por nome de coluna, e nunca `select('*')`
 *
 * A tabela tem uma coluna a mais que `DirectorySuggestionsTable`, de proposito.
 * Um `*` traria a autoria para a memoria do processo e para qualquer `log` de
 * objeto que passasse por ali. A lista de colunas e explicita, e `ref` e o
 * identificador que sai.
 *
 * ## A aprovacao grava a entrada pelo caminho do diretorio
 *
 * `emTransacao` compoe `criarTransacaoDoDiretorio` com os tres metodos da fila,
 * na MESMA transacao do Kysely: a aprovacao chama `inserirEntrada` de la e
 * `marcarAprovada` daqui, e a trilha fecha as duas. Nao ha segunda escrita de
 * entrada neste produto.
 */
import { sql } from 'kysely';

import type { DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../../domain/sugestao-do-diretorio.js';
import type { IndicacaoNaFila, RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  FilaDeIndicacoesRepository,
  PaginaDaFila,
  RecorteDaFila,
  TransacaoDaFila,
} from '../../ports/fila-de-indicacoes.js';
import {
  criarTransacaoDoDiretorio,
  type DependenciasDoDiretorioAdministrativo,
} from './kysely-diretorio-administrativo.js';

export type DependenciasDaFilaDeIndicacoes = DependenciasDoDiretorioAdministrativo;

/**
 * O predicado da conta de quem indicou, como expressao reusada nas TRES
 * consultas.
 *
 * Uma constante e nao tres copias: tres copias sao tres lugares onde uma
 * correcao pode faltar, e a correcao que falta num deles e justamente o defeito
 * que este arquivo existe para nao repetir.
 */
const AUTOR_ATIVO = sql<boolean>`indicacao_com_autor_ativo(s.id)`;

/** As colunas que saem, por nome. A autoria nao esta aqui e nao pode estar. */
const COLUNAS = sql`
  s.ref, s.display_name, s.kind, s.city, s.state, s.neighborhood,
  s.contact_kind, s.contact_value, s.note, s.review_status,
  s.created_at, s.decided_at, s.decline_reason,
  (SELECT p.slug FROM professionals p WHERE p.id = s.approved_entry_id) AS entry_slug`;

interface LinhaDaIndicacao {
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  city: string;
  state: string;
  neighborhood: string | null;
  contact_kind: TipoDeContatoPublico;
  contact_value: string;
  note: string | null;
  review_status: RevisaoDaIndicacao;
  created_at: Date;
  decided_at: Date | null;
  decline_reason: string | null;
  entry_slug: string | null;
}

function comoIndicacao(l: LinhaDaIndicacao): IndicacaoNaFila {
  return {
    ref: l.ref,
    displayName: l.display_name,
    kind: l.kind,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    contatoKind: l.contact_kind,
    contatoValue: l.contact_value,
    note: l.note,
    reviewStatus: l.review_status,
    createdAt: l.created_at,
    decidedAt: l.decided_at,
    declineReason: l.decline_reason,
    entradaSlug: l.entry_slug,
  };
}

/**
 * LUGAR 2 do filtro: a leitura de UMA indicacao.
 *
 * `travar` liga `FOR UPDATE OF s`: a decisao le e grava na mesma transacao, e
 * sem a trava dois operadores clicando juntos em "aprovar" passariam os dois
 * pela conferencia de `pending`. `OF s` porque a subconsulta do `slug` da
 * entrada esta na lista de selecao, e travar `professionals` por causa dela
 * faria uma decisao de fila bloquear a edicao do diretorio.
 */
async function lerIndicacao(
  db: DbExecutor,
  ref: string,
  travar: boolean,
): Promise<IndicacaoNaFila | null> {
  const r = await sql<LinhaDaIndicacao>`
    SELECT ${COLUNAS}
      FROM directory_suggestions s
     WHERE s.ref = ${ref} AND ${AUTOR_ATIVO}
     ${travar ? sql`FOR UPDATE OF s` : sql``}`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoIndicacao(linha);
}

export function criarFilaDeIndicacoesRepository(
  deps: DependenciasDaFilaDeIndicacoes,
): FilaDeIndicacoesRepository {
  const { db } = deps;

  const metodosDaFila = (trx: DbTransaction) => ({
    indicacaoPorRef: (ref: string) => lerIndicacao(trx, ref, true),

    async marcarAprovada(ref: string, entradaSlug: string, agora: Instant) {
      // O UUID da entrada e resolvido AQUI, por `slug`, e nao atravessa a porta
      // (ADR-0010 item 6). Subconsulta e nao segunda viagem: `approved_entry_id`
      // tem chave estrangeira, e um `slug` que nao existisse viraria violacao
      // de chave em vez de nulo silencioso.
      const r = await sql<LinhaDaIndicacao>`
        UPDATE directory_suggestions s
           SET review_status = 'approved',
               decided_at = ${new Date(agora)},
               approved_entry_id = (SELECT p.id FROM professionals p WHERE p.slug = ${entradaSlug})
         WHERE s.ref = ${ref}
        RETURNING ${COLUNAS}`.execute(trx);
      const linha = r.rows[0];
      if (linha === undefined) {
        throw new Error(
          `marcarAprovada nao encontrou a indicacao ${ref} que a propria transacao acabou de ler com FOR UPDATE: defeito de esquema, e nao caso de borda.`,
        );
      }
      return comoIndicacao(linha);
    },

    async marcarRecusada(ref: string, motivo: string, agora: Instant) {
      // **Nao ha `DELETE` nesta porta.** Recusar e um `UPDATE`: a indicacao
      // continua legivel, com o motivo, e o `down` da `20261017000016` recusa
      // a propria descida justamente para que ela continue.
      const r = await sql<LinhaDaIndicacao>`
        UPDATE directory_suggestions s
           SET review_status = 'declined',
               decided_at = ${new Date(agora)},
               decline_reason = ${motivo}
         WHERE s.ref = ${ref}
        RETURNING ${COLUNAS}`.execute(trx);
      const linha = r.rows[0];
      if (linha === undefined) {
        throw new Error(
          `marcarRecusada nao encontrou a indicacao ${ref} que a propria transacao acabou de ler com FOR UPDATE: defeito de esquema, e nao caso de borda.`,
        );
      }
      return comoIndicacao(linha);
    },
  });

  return {
    emTransacao: (trabalho) =>
      db.transaction().execute((trx) => {
        const transacao: TransacaoDaFila = {
          ...criarTransacaoDoDiretorio(trx, deps),
          ...metodosDaFila(trx),
        };
        return trabalho(transacao);
      }),

    async listar(recorte: RecorteDaFila): Promise<PaginaDaFila> {
      // Sem filtro, a fila de PENDENTES: e a pergunta que o painel faz ao
      // abrir, e e a ordem do indice parcial `directory_suggestions_fila_de_revisao`.
      const estado: RevisaoDaIndicacao = recorte.reviewStatus ?? 'pending';

      // LUGAR 1: as linhas e a contagem do recorte.
      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM directory_suggestions s
         WHERE s.review_status = ${estado} AND ${AUTOR_ATIVO}`.execute(db);

      const linhas = await sql<LinhaDaIndicacao>`
        SELECT ${COLUNAS}
          FROM directory_suggestions s
         WHERE s.review_status = ${estado} AND ${AUTOR_ATIVO}
         ORDER BY s.created_at ASC, s.ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(db);

      // LUGAR 3: a CONTAGEM DO AVISO DO MENU. Ela ignora o recorte -- o numero
      // do item da navegacao responde "quanto trabalho esta esperando" -- e
      // passa pelo MESMO predicado. Sem ele, o painel diria "1 pendente" sobre
      // uma fila que a listagem mostra vazia.
      const pendentes = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM directory_suggestions s
         WHERE s.review_status = 'pending' AND ${AUTOR_ATIVO}`.execute(db);

      return {
        itens: linhas.rows.map(comoIndicacao),
        total: Number(contagem.rows[0]?.total ?? 0),
        pendentes: Number(pendentes.rows[0]?.total ?? 0),
      };
    },

    indicacaoPorRef: (ref: string) => lerIndicacao(db, ref, false),
  };
}
