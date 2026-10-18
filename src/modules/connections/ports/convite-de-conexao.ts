/**
 * **De onde um pedido de conexão pode nascer — e é aqui que a regra do cliente
 * vira arquitetura.**
 *
 * A regra: *"o que não pode é ser público, sem ter nenhum relacionamento"*. O
 * eixo é **relação contra público**, e não "logado contra deslogado". Com a
 * descoberta por link morta (plano 4-B.1), **não existe caminho pelo qual uma
 * conta arbitrária alcance um perfil arbitrário**.
 *
 * ## Por que o pedido não aceita um identificador de pessoa
 *
 * Esta porta recebe um **token de convite**, nunca um apelido, um `UserId` nem
 * um `ref` de pessoa. Qualquer uma das três alternativas reabriria o que a
 * decisão fechou:
 *
 * - **por apelido** seria busca de pessoas pela porta de trás, e um oráculo de
 *   existência de apelido — o plano já recusou até a rota de *disponibilidade*
 *   de apelido por ser superfície de enumeração (4-C.5);
 * - **por identificador de pessoa** seria o endereço estável e compartilhável
 *   que matou a fatia H: *"vira endereço público no primeiro grupo em que alguém
 *   o cola"*;
 * - **por `ref` de aresta** não existe antes do pedido — `ref` nasce com a
 *   linha, e é dela, não de ninguém.
 *
 * Então o pedido só existe se alguém **já entregou uma relação**, e quem resolve
 * o token é quem conhece o contexto. São **duas** formas, e as duas são **outras
 * fatias**:
 *
 * 1. **H′ — conexão ancorada no contexto**: caso de pet encerrado como
 *    `devolvido`, e encontro em que os dois estiveram. Os dois lados são
 *    perguntados **em separado** e a identidade só aparece se os dois disserem
 *    sim. A conversa mediada continua despersonalizada do começo ao fim, e o
 *    achador sem conta simplesmente não se conecta.
 * 2. **H″ — código presencial**: "mostrar meu código" e "ler um código", cara a
 *    cara. Token **curto e rotativo (5 min)**, nunca um identificador estável,
 *    então captura de tela não vira link permanente. Não é enumerável, pela
 *    razão que fez o código da plaquinha ter 128 bits (ADR-0004). Depende do
 *    leitor de QR — BICHUS-54, nunca construída.
 *
 * ## Como esta fatia deixa o modelo PREPARADO para as duas, sem construir nenhuma
 *
 * - O caso de uso depende **só desta interface**, e nunca de como o token é
 *   emitido. H′ e H″ entram cada uma com uma implementação, sem tocar no
 *   domínio, no repositório nem nas rotas.
 * - `user_connections.origin` já tem os **três** valores em lista fechada
 *   (`anchored_case`, `anchored_event`, `presence_code`), e `ConviteResolvido`
 *   obriga quem resolve a dizer qual é — então a procedência de toda aresta fica
 *   gravada desde a primeira linha, e não há migração de dado depois.
 * - **Não existe um quarto valor**, e acrescentar um exige mexer na migração,
 *   que é onde a decisão do cliente está escrita.
 * - A fiação de produção liga `nenhumConviteExiste` (abaixo), então **hoje
 *   nenhum pedido pode ser criado em produção** — e isso é o desenho, não uma
 *   lacuna: era exatamente a fatia H que comprava essa capacidade, e ela saiu.
 */
import type { UserId } from '../../../shared/types/brands.js';
import type { OrigemDoPedido } from '../domain/conexao.js';

export interface ConviteResolvido {
  /** A conta que vai receber o pedido. Nunca atravessa a borda HTTP. */
  readonly alvo: UserId;
  /** Qual dos três caminhos produziu este convite. Vai para `origin`. */
  readonly origem: OrigemDoPedido;
}

export interface ResolvedorDeConvite {
  /**
   * `undefined` para token inexistente, expirado, já usado, de outra conta, ou
   * que aponte para quem bloqueou quem chama. **Um `undefined` só**, de
   * propósito: a borda transforma todos eles no **mesmo 404** (ADR-0021), e
   * distinguir "expirado" de "inexistente" já seria um oráculo.
   */
  resolver(token: string, quemChama: UserId): Promise<ConviteResolvido | undefined>;
}

/**
 * A implementação de produção **de hoje**: não existe convite nenhum.
 *
 * Ela não é um esboço nem um `TODO`. Ela é a afirmação, executável, de que
 * **nesta fatia nenhuma conta alcança nenhuma outra**: toda chamada de
 * `requestConnection` responde 404, qualquer que seja o token, e não há segundo
 * caminho no código que crie uma aresta pendente.
 *
 * Trocá-la é o trabalho de H′ e H″, e é uma linha na fiação.
 */
export const nenhumConviteExiste: ResolvedorDeConvite = {
  resolver: () => Promise.resolve(undefined),
};
