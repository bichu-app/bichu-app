/**
 * O bloqueio, visto de fora — **lido, nunca escrito, por este módulo**.
 *
 * `user_blocks` é da **fatia E** (bloquear e denunciar), que outro agente está
 * construindo agora. Esta fatia **não constrói bloqueio**: ela o consome.
 *
 * A porta é declarada **aqui**, no módulo que precisa dela, e não em
 * `modules/<E>/ports/`, porque é o caminho que a própria regra de fronteira
 * oferece: *"Importe de modules/<outro>/ports/, ou declare a porta no módulo que
 * precisa dela."* Quando E existir, a implementação dela entra pela fiação e
 * este arquivo não muda.
 *
 * ## Por que ler bloqueio aqui, se E já apaga a aresta
 *
 * São duas defesas com alcances diferentes, e a segunda não é desconfiança da
 * primeira:
 *
 * 1. **E chama `desfazerPorBloqueio`** na mesma transação do bloqueio (ver
 *    `ConexaoSobBloqueio`), e isso limpa o passado: o pendente das duas direções
 *    sai, e a conexão é desfeita.
 * 2. **Este leitor cobre o futuro**: um convite emitido antes do bloqueio e
 *    resgatado depois, um `ref` guardado na tela de alguém que ficou aberta, uma
 *    corrida entre o bloqueio e um aceite em voo. Sem ele, o passado estaria
 *    limpo e o canal continuaria aberto por um instante — e um instante basta.
 *
 * ## O efeito é 404, nunca 403
 *
 * ADR-0021. O 403 contaria que existe algo ali e que alguém decidiu te barrar —
 * para quem foi bloqueado, isso é o aviso de bloqueio, que é exatamente o que o
 * desenho não dá. **Perfil de quem bloqueou responde 404**, e nesta fatia toda
 * rota responde 404 pela mesma razão: o predicado mora na cláusula `WHERE` e na
 * resolução do convite, não num `if` que escolhe o código de erro.
 */
import type { UserId } from '../../../shared/types/brands.js';

export interface LeitorDeBloqueio {
  /**
   * Existe bloqueio entre estes dois, **em qualquer direção**?
   *
   * Simétrico de propósito, embora `user_blocks` seja direcional: para o efeito
   * desta fatia não importa quem bloqueou quem. Se A bloqueou B, nem A nem B
   * podem pedir, aceitar ou ler a aresta — fazer o efeito depender da direção
   * deixaria o bloqueado pedir conexão ao bloqueador, que é um toque que o
   * bloqueio existe para impedir.
   */
  existeBloqueioEntre(um: UserId, outro: UserId): Promise<boolean>;
}

/**
 * A fiação de hoje, enquanto a fatia E não desce: **nenhum bloqueio conhecido**.
 *
 * Ela é honesta e é a única opção correta: `user_blocks` **não existe em
 * `origin/development`** — medido em 18/10/2026, nem a tabela nem a migração
 * aparecem em nenhuma ref. Fingir um leitor que consultasse uma tabela ausente
 * derrubaria toda leitura de conexão com erro de SQL.
 *
 * **O que isso custa hoje: nada.** Com `nenhumConviteExiste` ligado, nenhuma
 * aresta pode ser criada em produção, então não há par para bloquear. A dívida é
 * de uma linha na fiação, e o relatório da entrega a declara.
 */
export const semBloqueioConhecido: LeitorDeBloqueio = {
  existeBloqueioEntre: () => Promise.resolve(false),
};
