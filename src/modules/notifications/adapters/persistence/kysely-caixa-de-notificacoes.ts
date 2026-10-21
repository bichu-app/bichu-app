/**
 * `CaixaDeNotificacoes` sobre as funcoes SQL da migracao `20261018000020`.
 *
 * ## ESTE ARQUIVO NAO MONTA CONSULTA, E ISSO E A DECISAO
 *
 * As quatro operacoes chamam FUNCAO: `caixa_de_notificacoes`,
 * `contagem_de_notificacoes`, `notificacao_marcar_lida`,
 * `notificacoes_marcar_todas_lidas` e `notificacoes_lista_vista`. Nenhuma
 * clausula `WHERE` de regra vive aqui, e o motivo nao e gosto:
 *
 * 1. **Duas das nove fontes do aviso sao alcancadas por coluna MARCADA com
 *    "NUNCA sai do servidor"** -- a autoria da indicacao e a autoria do
 *    encontro --, e `portao-colunas-que-nao-saem.ts` reprova o nome literal
 *    delas em qualquer `.ts` de `src/`, **inclusive em comentario**. Montar o
 *    `UNION` aqui seria escrever esses nomes aqui.
 * 2. **O filtro de conta desabilitada precisa estar em TRES lugares** --
 *    listagem, contagem e marcacao -- e ele esta: dentro das tres funcoes,
 *    delegando a `conta_habilitada(uuid)`, que e o ponto unico da definicao.
 *    Tres copias em TypeScript seriam tres lugares onde a correcao pode faltar,
 *    e a que falta num deles e o defeito que a fila da Rede ja produziu: o
 *    painel dizia "1 pendente" sobre fila vazia. Aqui seria pior, porque o
 *    numero mora na barra de toda tela.
 * 3. **O agrupamento e a regra do contador sao a mesma consulta que as paga.**
 *
 * ## `count(*)` volta como texto
 *
 * O driver do Postgres entrega `bigint` como `string` para nao perder precisao.
 * As funcoes que devolvem `integer` ja chegam numero; `total_de_grupos` e
 * `bigint` e passa por `Number`. Trocar a ordem dos dois e o defeito classico
 * de "total: NaN".
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AvisoDaCaixa, PaginaDaCaixa, TipoDeAviso } from '../../domain/caixa.js';
import type { CaixaDeNotificacoes } from '../../ports/caixa-de-notificacoes.js';

interface LinhaDaCaixa {
  ref: string;
  item_kind: TipoDeAviso;
  subject_label: string | null;
  occurred_at: Date;
  lida: boolean;
  agrupados: number;
  total_de_grupos: string;
}

function comoAviso(l: LinhaDaCaixa): AvisoDaCaixa {
  return {
    ref: l.ref,
    tipo: l.item_kind,
    assunto: l.subject_label,
    aconteceuEm: l.occurred_at,
    lido: l.lida,
    agrupados: l.agrupados,
  };
}

export function criarCaixaDeNotificacoes(db: Db): CaixaDeNotificacoes {
  return {
    async listar(usuario: UserId, pagina: number, limite: number): Promise<PaginaDaCaixa> {
      // As DUAS leituras acontecem aqui, e nao uma consulta so, porque
      // `unread_total` nao e derivavel da pagina: a pagina traz 30 linhas ja
      // agrupadas, e o contador conta AVISOS nao abertos da caixa inteira --
      // inclusive os que a pagina nao mostra. Somar `agrupados` da pagina daria
      // um numero que discorda do sino, que e o defeito mais visivel possivel.
      const [linhas, naoLidos] = await Promise.all([
        sql<LinhaDaCaixa>`
          SELECT * FROM caixa_de_notificacoes(${usuario}, ${pagina}, ${limite})`.execute(db),
        sql<{ total: number }>`
          SELECT contagem_de_notificacoes(${usuario}) AS total`.execute(db),
      ]);

      const itens = linhas.rows.map(comoAviso);
      // Pagina vazia nao tem de onde ler o total: zero linhas e zero grupos.
      const total = linhas.rows.length === 0 ? 0 : Number(linhas.rows[0]!.total_de_grupos);

      return {
        itens,
        pagina,
        limite,
        total,
        naoLidos: naoLidos.rows[0]?.total ?? 0,
      };
    },

    async contar(usuario: UserId): Promise<number> {
      const r = await sql<{ total: number }>`
        SELECT contagem_de_notificacoes(${usuario}) AS total`.execute(db);
      return r.rows[0]?.total ?? 0;
    },

    async marcarLida(usuario: UserId, ref: string): Promise<boolean> {
      // A funcao devolve `true` quando o aviso existia para esta conta, e NULO
      // quando nao. O `?? false` traduz o nulo, e e ele que faz a rota
      // responder 404 -- para "nao existe" e para "e de outra conta", que sao
      // indistinguiveis aqui de proposito (ADR-0021).
      const r = await sql<{ marcada: boolean | null }>`
        SELECT notificacao_marcar_lida(${usuario}, ${ref}) AS marcada`.execute(db);
      return r.rows[0]?.marcada ?? false;
    },

    async marcarTodasLidas(usuario: UserId): Promise<number> {
      const r = await sql<{ marcadas: number }>`
        SELECT notificacoes_marcar_todas_lidas(${usuario}) AS marcadas`.execute(db);
      return r.rows[0]?.marcadas ?? 0;
    },

    async dispensar(usuario: UserId, ref: string): Promise<boolean> {
      // Mesma forma de `marcarLida`, e de proposito: a funcao devolve `true`
      // quando o aviso existia para esta conta e NULO quando nao, e o
      // `?? false` traduz o nulo no 404 que a rota responde para "nao existe"
      // e para "e de outra conta" (ADR-0021).
      //
      // `notificacao_dispensar` NAO toca `read_at`: o aviso sai da lista e do
      // contador e continua nao lido.
      const r = await sql<{ dispensada: boolean | null }>`
        SELECT notificacao_dispensar(${usuario}, ${ref}) AS dispensada`.execute(db);
      return r.rows[0]?.dispensada ?? false;
    },

    async listaVista(usuario: UserId): Promise<void> {
      await sql`SELECT notificacoes_lista_vista(${usuario})`.execute(db);
    },
  };
}
