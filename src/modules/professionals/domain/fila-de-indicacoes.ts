/**
 * A FILA DE REVISAO das indicacoes do `Perto`, do lado do dominio: o tipo que o
 * servidor carrega, a projecao que o painel ve, e a unica regra de transicao.
 *
 * ## O que este tipo NAO tem, e a ausencia e a regra
 *
 * **Nao tem quem indicou.** Nem o nome, nem a conta, nem um identificador
 * dela. A coluna que guarda a autoria leva a marca `NUNCA sai do servidor` no
 * `COMMENT ON COLUMN` da migracao `20261017000004` (ADR-0011 secao 4,
 * BICHUS-174), e `src/tools/portao-colunas-que-nao-saem.ts` varre todo `.ts` de
 * `src/` pelo nome literal dela. O que nao chega a `IndicacaoNaFila` nao tem
 * como sair da projecao -- a mesma defesa de `EntradaAdministrativa`.
 *
 * **Nao tem `id`.** O enderecamento e por `ref` (ADR-0010 item 6), de ponta a
 * ponta: a rota recebe `ref`, a porta recebe `ref`, o `UPDATE` casa por `ref`.
 * Um `id` neste tipo seria um UUID interno viajando por tres camadas para,
 * eventualmente, cair numa resposta por descuido.
 *
 * **Nao tem coordenada, endereco por extenso nem documento** (ADR-0006,
 * ADR-0011 secao 4): a tabela tambem nao tem, e as ausencias estao escritas por
 * extenso no cabecalho da `20261017000004`.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { TipoDeEntidade, TipoDeProfissional } from './entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from './sugestao-do-diretorio.js';

/** O `CHECK` `directory_suggestions_revisao_conhecida` (`20261017000004`). */
export type RevisaoDaIndicacao = 'pending' | 'approved' | 'declined';

/** O teto do motivo da recusa: o mesmo do recado da indicacao. */
export const MINIMO_DO_MOTIVO = 2;
export const MAXIMO_DO_MOTIVO = 280;

/**
 * Uma indicacao como o servidor a carrega.
 *
 * `entradaSlug` e lido por `JOIN` com `professionals`, e nao e a coluna:
 * `approved_entry_id` e UUID interno e nao atravessa esta fronteira.
 */
export interface IndicacaoNaFila {
  readonly ref: string;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  /**
   * O QUE a entidade indicada E -- eixo SEPARADO de `kind` (cliente,
   * 29/10/2026). Toda linha tem valor: a coluna e `NOT NULL DEFAULT
   * 'professional'`, e a indicacao gravada antes de 29/10 vale como
   * profissional porque nao havia como dizer outra coisa.
   */
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  /** O recado PARA QUEM REVISA. Nao e publicado, nem quando a indicacao e aprovada. */
  readonly note: string | null;
  readonly reviewStatus: RevisaoDaIndicacao;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly declineReason: string | null;
  /** O `slug` da entrada que a aprovacao produziu, ou da que ja existia. */
  readonly entradaSlug: string | null;
}

/** `AdminDirectorySuggestion` do contrato. */
export interface IndicacaoProjetada {
  readonly reference: string;
  readonly display_name: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade E. O revisor precisa dele para aprovar com o tipo certo. */
  readonly entity_kind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly public_contact: { readonly kind: TipoDeContatoPublico; readonly value: string };
  readonly note: string | null;
  readonly review_status: RevisaoDaIndicacao;
  readonly created_at: string;
  readonly decided_at: string | null;
  readonly decline_reason: string | null;
  readonly entry_slug: string | null;
}

/**
 * A projecao.
 *
 * **O estado da revisao sai como `review_status`, e nao como `state`**, porque
 * `state` nesta mesma projecao e a Unidade Federativa -- exatamente como na
 * tabela, e a `20261017000004` escreveu o motivo por extenso.
 * `DirectorySuggestionReceipt` pode chamar o seu de `state` porque o recibo do
 * aplicativo nao devolve a UF.
 */
export function projetarIndicacao(i: IndicacaoNaFila): IndicacaoProjetada {
  return {
    reference: i.ref,
    display_name: i.displayName,
    kind: i.kind,
    entity_kind: i.entityKind,
    city: i.city,
    state: i.state,
    neighborhood: i.neighborhood,
    public_contact: { kind: i.contatoKind, value: i.contatoValue },
    note: i.note,
    review_status: i.reviewStatus,
    created_at: i.createdAt.toISOString(),
    decided_at: i.decidedAt === null ? null : i.decidedAt.toISOString(),
    decline_reason: i.declineReason,
    entry_slug: i.entradaSlug,
  };
}

/**
 * A UNICA transicao que esta fila conhece: so `pending` recebe decisao.
 *
 * Devolve o erro em vez de lanca-lo, pela mesma razao de `planejarEdicao`: quem
 * chama junta os erros antes de responder, e um `throw` no meio de uma
 * transacao esconde de onde ele veio.
 *
 * **Nao ha reverter.** Aprovado nao volta a recusado -- a entrada do diretorio
 * ja pode estar no ar, e desfazer aqui a deixaria orfa; recusado nao volta a
 * aprovado -- o motivo escrito seria lavado. As duas reversoes tem caminho
 * proprio e ele nao e este: retirar entrada e `updateAdminDirectoryEntry` com
 * `status: hidden`.
 */
export function erroSeJaDecidida(i: IndicacaoNaFila): ProblemFieldError | null {
  if (i.reviewStatus === 'pending') return null;
  return {
    field: 'review_status',
    code: 'suggestion_not_pending',
    message:
      i.reviewStatus === 'approved'
        ? 'Esta indicação já foi aprovada, e a entrada do diretório já existe.'
        : 'Esta indicação já foi recusada, com motivo registrado.',
  };
}

/**
 * O que a entrada do diretorio recebe da indicacao: o TELEFONE.
 *
 * Sai daqui **so quando o contato publico indicado e telefone**. Copiar um site
 * para a coluna do telefone poria `https://...` onde a tela do aplicativo liga.
 *
 * **`note` nao e copiado.** Ele e recado para quem revisa; publica-lo faria o
 * diretorio carregar avaliacao da comunidade, que e outro modelo e nao existe
 * (ADR-0011 secao 5.4).
 */
export function telefoneDaIndicacao(i: IndicacaoNaFila): string | null {
  return i.contatoKind === 'phone' ? i.contatoValue : null;
}

/**
 * O SITE que a entrada recebe da indicacao -- **o conserto de um dado que se
 * perdia**.
 *
 * Esta funcao e a razao de existir da coluna `professionals.site_url`
 * (`20261020000014`). Antes dela, `directory_suggestions` ACEITAVA
 * `contact_kind = 'website'` desde 17/10/2026, VALIDAVA o endereco com o mesmo
 * `errosDoEnderecoCompleto` da escrita do painel, e a aprovacao **nao tinha onde
 * copiar o valor**: a entrada nascia sem canal nenhum e o site que alguem
 * digitou morria na fila. Nao era recurso que faltava -- era dado descartado.
 *
 * Simetrica a `telefoneDaIndicacao`, e pela mesma razao de forma: o valor so sai
 * quando o `contact_kind` DECLARADO e `website`. A fila guarda um `contact_value`
 * para qualquer um dos tres tipos, e adivinhar pelo formato aceitaria telefone no
 * campo de site e vice-versa -- a migracao `20261017000004` diz isso por extenso
 * no comentario de `contact_kind`.
 *
 * **O valor nao e reconferido aqui, e nao e esquecimento:** `contact_value` com
 * `contact_kind = 'website'` so entrou na fila depois de passar por
 * `errosDoEnderecoCompleto`, e o teto da fila (120) e menor que o da coluna
 * (261), entao o que esta gravado cabe. Reconferir seria uma segunda definicao
 * do mesmo padrao.
 *
 * `instagram` continua sem destino, e de proposito: nao ha coluna de rede social
 * e inventa-la nao foi pedido.
 */
export function siteDaIndicacao(i: IndicacaoNaFila): string | null {
  return i.contatoKind === 'website' ? i.contatoValue : null;
}
