/**
 * O vocabulario da FILA DE MODERACAO do painel (18/10/2026).
 *
 * Decisao do cliente, literal: "quem modera vai ser o administrador, deve ir
 * para a pagina de backoffice".
 *
 * ## O ITEM DA FILA E O ALVO, E NAO A DENUNCIA
 *
 * Esta e a decisao de modelo com mais consequencia do modulo, e ela vem de uma
 * frase do despacho: "contagem de repeticao e o sinal que separa briga de
 * problema real".
 *
 * Se o item fosse a DENUNCIA, tres pessoas denunciando a mesma avaliacao
 * virariam tres itens de fila, e quem modera decidiria a mesma coisa tres
 * vezes -- sem nunca ver o numero que importa. Sendo o item o ALVO, o numero
 * aparece: `reportCount` (quantas pessoas diferentes denunciaram) e
 * `repeatTotal` (quantas vezes, somando a insistencia de cada uma). Uma
 * briga de vizinho da 1 e 1; um problema real da 7 e 11.
 *
 * Consequencia direta: as duas acoes resolvem **todas** as denuncias abertas
 * daquele alvo de uma vez. Nao ha como decidir "esta denuncia sim, aquela
 * nao" sobre o mesmo conteudo, porque isso nao e uma decisao que exista -- o
 * conteudo ou sai do ar ou fica.
 *
 * ## AS ORIGENS: duas construidas, duas declaradas
 *
 * `review` e `conversation` existem, e as duas tem tabela com dado gravado.
 * PERFIL e FOTO vem na frente de comunidade e **nao estao construidos**: nao
 * existe tabela de denuncia de perfil nem de foto neste repositorio, e nada
 * neste modulo finge que existe. O que esta pronto para elas e o caminho:
 * acrescentar uma vale uma perna de `UNION ALL` na visao `fila_de_moderacao`
 * (migracao `20261018000009`), um valor neste `type`, um no `enum`
 * `ModerationOrigin` do contrato e um rotulo na tela. **Nenhuma consulta de
 * `src/` muda**, porque a consulta le a visao e nao as tabelas.
 *
 * ## NENHUMA ACAO SOBRE A CONTA DA PESSOA
 *
 * Nao ha `desabilitarConta` neste modulo, e a ausencia e deliberada.
 * Desabilitar conta e outro poder: ele mora em `src/bin/conta-admin.ts` (conta
 * do painel) e no caminho de privacidade (conta do app), com eventos de trilha
 * proprios. Juntar os dois poderes nesta fila faria o clique mais facil do
 * painel ser o de maior consequencia do produto.
 *
 * ## NENHUMA NOTIFICACAO
 *
 * O denunciante NAO recebe resultado e o denunciado NAO e avisado -- avisar o
 * denunciado e retaliacao. Nada neste modulo monta mensagem, enfileira envio
 * nem escreve em `notification_deliveries`.
 *
 * ## NENHUMA MODERACAO AUTOMATICA
 *
 * Nada aqui olha o texto para decidir. A lista de palavras e de outro lugar
 * (`src/shared/texto/`) e nao e chamada por este modulo: o juizo e de pessoa,
 * e e por isso que toda escrita exige motivo escrito.
 *
 * ## NENHUM PRAZO
 *
 * Nao ha campo de vencimento, de SLA nem de prioridade por tempo. A fila e
 * lida da denuncia mais antiga para a mais nova -- a unica ordem justa numa
 * fila de trabalho humano -- e o produto nao promete prazo a ninguem.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { DecisaoDaModeracao } from '../../../shared/db/schema.js';

export type { DecisaoDaModeracao };

/**
 * De onde a denuncia veio.
 *
 * **Duas construidas.** `profile` e `photo` NAO entram aqui ainda, e a
 * ausencia e informacao: um valor declarado sem tabela por tras faria a tela
 * ganhar um rotulo para um estado que nunca acontece, e faria o `enum` do
 * contrato prometer o que nenhuma consulta devolve. Quando a frente de
 * comunidade criar as tabelas, a origem entra aqui, na visao e no contrato no
 * mesmo commit.
 */
export type OrigemDaDenuncia = 'review' | 'conversation';

export const ORIGENS: readonly OrigemDaDenuncia[] = ['review', 'conversation'];

export function ehOrigem(valor: string): valor is OrigemDaDenuncia {
  return (ORIGENS as readonly string[]).includes(valor);
}

/** O recorte da fila: na fila, ou ja decidida. */
export type EstadoDaFila = 'open' | 'resolved';

export const ESTADOS: readonly EstadoDaFila[] = ['open', 'resolved'];

export function ehEstado(valor: string): valor is EstadoDaFila {
  return (ESTADOS as readonly string[]).includes(valor);
}

/**
 * O motivo da decisao: 3 a 500, o MESMO par de
 * `professional_reviews.moderation_reason`.
 *
 * Nao e o 2..280 da fila de indicacao: la o motivo e um rotulo curto para o
 * proximo revisor ("fechou", "nao atende pet"), e aqui ele e a justificativa
 * de ter tirado conteudo de pessoa do ar, que e o que alguem vai ler numa
 * contestacao. O `CHECK` do banco cobra o mesmo par, nas duas tabelas.
 */
export const MINIMO_DO_MOTIVO = 3;
export const MAXIMO_DO_MOTIVO = 500;

/**
 * Um item da fila, como o servidor o carrega: um ALVO com as denuncias abertas
 * (ou resolvidas) agregadas.
 */
export interface ItemDaFila {
  readonly origem: OrigemDaDenuncia;
  /**
   * O identificador PUBLICO do alvo.
   *
   * `professional_reviews.ref` na avaliacao (22 simbolos base64url, criado
   * pela `20261017000017` justamente para "a denuncia e a remocao pelo
   * painel"); `conversations.id` na conversa, que JA e o identificador publico
   * da conversa no contrato em vigor (`parameters/ConversationId`) -- inventar
   * um segundo para a mesma linha seria exposicao nova, e nao menos.
   */
  readonly targetRef: string;
  /** O nome do local (avaliacao) ou o nome do pet (conversa): o que identifica o alvo. */
  readonly assunto: string;
  /**
   * O conteudo denunciado, quando ele e **publicado**.
   *
   * Nulo na conversa, e isso e desenho: a conversa mediada e privada entre
   * duas pessoas e nada neste produto autoriza o administrador a le-la. O que
   * a conversa entrega para quem decide e `detalhe` -- o texto que o
   * denunciante escreveu -- mais o motivo e a contagem.
   */
  readonly conteudo: string | null;
  /** A nota da avaliacao. Nula na conversa, que nao tem nota. */
  readonly nota: number | null;
  /** O motivo da denuncia MAIS ANTIGA aberta deste alvo. */
  readonly motivo: string;
  /** Os motivos distintos de todas as denuncias deste recorte, para a triagem. */
  readonly motivos: readonly string[];
  /** O que o denunciante escreveu para quem modera. Da denuncia mais antiga. */
  readonly detalhe: string | null;
  /** Quantas denuncias (de pessoas diferentes) este alvo tem neste recorte. */
  readonly reportCount: number;
  /** A soma de `repeat_count`: a insistencia somada. E o sinal de repeticao. */
  readonly repeatTotal: number;
  readonly primeiraEm: Date;
  readonly ultimaEm: Date;
  /** O conteudo ja esta fora do ar? */
  readonly conteudoRemovido: boolean;
  /** Nula enquanto na fila. */
  readonly decisao: DecisaoDaModeracao | null;
  readonly motivoDaDecisao: string | null;
  readonly decididaEm: Date | null;
}

/** `AdminModerationItem` do contrato. */
export interface ItemProjetado {
  readonly origin: OrigemDaDenuncia;
  readonly target_ref: string;
  readonly subject: string;
  readonly content: string | null;
  readonly rating: number | null;
  readonly reason: string;
  readonly reasons: readonly string[];
  readonly detail: string | null;
  readonly report_count: number;
  readonly repeat_total: number;
  readonly first_reported_at: string;
  readonly last_reported_at: string;
  readonly content_removed: boolean;
  readonly resolution: DecisaoDaModeracao | null;
  readonly resolution_reason: string | null;
  readonly resolved_at: string | null;
}

/**
 * O item como o contrato o declara.
 *
 * **Nada do denunciante** e **nada do denunciado**, em campo nenhum: nem nome,
 * nem UUID, nem a existencia de uma conta por tras. Os dois sao pessoas que
 * nao pediram para estar numa tela de administrador, e a decisao e sobre o
 * CONTEUDO. O que o filtro de conta desabilitada faz com o denunciante e
 * tira-lo da fila inteira (tres lugares), e nem para isso o nome dele sai do
 * servidor -- o predicado devolve booleano.
 */
export function projetarItem(i: ItemDaFila): ItemProjetado {
  return {
    origin: i.origem,
    target_ref: i.targetRef,
    subject: i.assunto,
    content: i.conteudo,
    rating: i.nota,
    reason: i.motivo,
    reasons: i.motivos,
    detail: i.detalhe,
    report_count: i.reportCount,
    repeat_total: i.repeatTotal,
    first_reported_at: i.primeiraEm.toISOString(),
    last_reported_at: i.ultimaEm.toISOString(),
    content_removed: i.conteudoRemovido,
    resolution: i.decisao,
    resolution_reason: i.motivoDaDecisao,
    resolved_at: i.decididaEm === null ? null : i.decididaEm.toISOString(),
  };
}

/**
 * **A MESMA DENUNCIA NAO SE RESOLVE DUAS VEZES.**
 *
 * O caso que isto guarda: dois operadores com a fila aberta, os dois clicam.
 * O primeiro remove e grava o motivo; o segundo chegaria com `resolution` ja
 * escrita e sobrescreveria o motivo da decisao que VALEU -- apagando a memoria
 * de quem decidiu o que.
 *
 * A protecao de verdade e a trava de linha do adaptador (`FOR UPDATE`) mais o
 * `WHERE resolved_at IS NULL` da escrita: o segundo nao encontra denuncia
 * aberta e a rota responde `404`. Esta funcao e o juizo legivel para o caso em
 * que o item foi LIDO ja resolvido -- a tela estava velha --, e responde `400`
 * com codigo proprio, em vez de um `404` que a tela leria como "sumiu".
 */
export function erroSeJaResolvido(i: ItemDaFila): ProblemFieldError | null {
  if (i.decisao === null) return null;
  return {
    field: 'resolution',
    code: 'report_already_resolved',
    message:
      i.decisao === 'content_removed'
        ? 'Esta denúncia já foi resolvida: o conteúdo já foi removido, com motivo registrado.'
        : 'Esta denúncia já foi resolvida: ela foi descartada, com motivo registrado.',
  };
}

/**
 * O retrato do item para a trilha.
 *
 * **Nao carrega `conteudo` nem `detalhe`.** A trilha sobrevive a exclusao da
 * conta de proposito, e copiar para dentro dela o texto de uma avaliacao
 * removida por ser ofensiva -- ou o relato de quem denunciou -- deixaria
 * aquele texto gravado onde ele nao tem o mesmo controle de acesso. Mesmo
 * juizo de `removerAvaliacao` em `diretorio-administrativo.ts`, que leva a
 * NOTA e nao o texto, e de `docs/04-seguranca.md` 9, que proibe conteudo de
 * mensagem na trilha.
 *
 * O que vai: a origem, o estado do conteudo, e os DOIS numeros da repeticao --
 * que sao o que explica a decisao para quem auditar.
 */
export function retratoDoItem(i: ItemDaFila): Record<string, unknown> {
  return {
    origin: i.origem,
    content_removed: i.conteudoRemovido,
    resolution: i.decisao,
    report_count: i.reportCount,
    repeat_total: i.repeatTotal,
    reasons: i.motivos,
  };
}
