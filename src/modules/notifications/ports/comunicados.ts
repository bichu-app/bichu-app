/**
 * A porta do COMUNICADO.
 *
 * ## Por que `disparar` recebe a transacao
 *
 * O comunicado e escrita administrativa, e escrita administrativa deste
 * repositorio nao existe sem trilha: `EscritaAuditada` (ADR-0027 item 8, D49)
 * abre UMA transacao, roda o trabalho dentro dela, grava o evento na MESMA
 * transacao e so entao confirma. Falha de qualquer um dos dois desfaz os dois.
 *
 * **E por isso que `disparar` recebe `trx` e nao abre transacao propria.** Um
 * `disparar` que confirmasse sozinho poderia deixar um comunicado em pe sem
 * linha de trilha -- e megafone sem trilha e o que vira incidente.
 *
 * `TransacaoDoComunicado` e declarada aqui como a transacao de escrita da
 * trilha, e nao como o tipo do Kysely: a porta nao conhece banco.
 */
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';
import type {
  Comunicado,
  PaginaDeComunicados,
  JanelaDeDisparo,
  RascunhoDeComunicado,
} from '../domain/comunicado.js';

export type TransacaoDoComunicado = TransacaoDeEscrita;

/**
 * O comunidado gravado, com o `id` INTERNO ao lado.
 *
 * Os dois vem separados porque a trilha de auditoria exige o `id` interno e
 * NUNCA o `ref` (ADR-0027 item 8), enquanto `Comunicado` e o que atravessa a
 * borda e por isso nao tem `id` nenhum (ADR-0010). Um tipo so com `id` dentro
 * faria o campo existir a um espalhamento de distancia da resposta, que e
 * exatamente como um UUID interno vaza.
 */
export interface ComunicadoGravado {
  readonly id: string;
  readonly comunicado: Comunicado;
}

export interface RepositorioDeComunicados {
  /** Os ja disparados, do mais recente para o mais antigo. */
  listar(pagina: number, limite: number): Promise<PaginaDeComunicados>;

  /**
   * O que o disparo alcancaria agora, quantos ainda cabem hoje e qual e o teto.
   * **Nao grava nada, e nao recebe o rascunho** -- nenhum dos tres numeros
   * depende do texto.
   */
  janelaDeDisparo(): Promise<JanelaDeDisparo>;

  /**
   * Grava o comunicado e abre em leque uma notificacao por conta habilitada,
   * dentro da transacao recebida.
   *
   * Devolve `undefined` quando o TETO DIARIO ja foi atingido -- e `undefined` e
   * nao excecao porque limite de produto nao e erro de banco, e quem traduz o
   * limite em resposta e a camada de aplicacao, que sabe qual `Problem` ele e.
   */
  disparar(
    trx: TransacaoDoComunicado,
    adminId: string,
    rascunho: RascunhoDeComunicado,
  ): Promise<ComunicadoGravado | undefined>;
}
