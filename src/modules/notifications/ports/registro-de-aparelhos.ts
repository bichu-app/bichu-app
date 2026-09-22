/**
 * Persistência do aparelho e do token de push (BICHUS-91).
 *
 * Porta separada de `push-sender.ts` porque o cabeçalho daquela diz, por
 * extenso, que ela **não lê nem escreve registro de aparelho**: lá é a saída,
 * aqui é o endereço. Juntar as duas faria o adaptador do FCM alcançar a tabela,
 * e a fronteira que o ADR-0008 escreveu para não perder sumiria numa assinatura.
 *
 * ## A autorização mora na cláusula `WHERE`, e o tipo cobra isso
 *
 * ADR-0021. Todo método que toca o aparelho de alguém **pelo identificador**
 * recebe o dono junto, e o adaptador leva os dois ao mesmo `WHERE`. A consulta
 * que apagaria o aparelho de outra conta não existe do outro lado desta porta:
 * ela não tem como ser escrita a partir destas assinaturas.
 *
 * `autorizacao-de-aparelho-na-clausula-where.test.ts` compila o SQL e cobra o
 * predicado, com isca que precisa reprovar.
 *
 * ### A única exceção, e por que ela não é um furo
 *
 * `revogarPorToken` **não recebe dono**, e a ausência é deliberada. Quem o chama
 * é o caminho de envio, e o que o FCM devolve quando recusa é o token — não a
 * conta. Exigir o dono aqui obrigaria a ler a linha para descobrir de quem ela
 * é e só então apagar, que é exatamente a forma "leia e confira depois" que a
 * ADR-0021 existe para eliminar.
 *
 * O token **é** a autorização, e ele é mais estreito que um identificador de
 * recurso: ele endereça uma linha e só uma (o índice único
 * `user_devices_um_token_uma_conta` garante), e quem o apresenta já podia mandar
 * notificação para aquele aparelho. Não há escalada possível — o pior que quem
 * tem o token consegue é revogar o próprio endereço de entrega.
 *
 * ## O que esta porta deliberadamente não faz
 *
 * Não decide quem recebe alerta. `contasAlcancaveisPorPush` responde **dois**
 * dos sete critérios do ADR-0006 sobre uma lista de candidatos que alguém já
 * filtrou; os outros cinco (localização, validade de 30 dias, raio de 5 km,
 * não ser o próprio tutor, teto de fadiga) são da BICHUS-20 e da BICHUS-18.
 * Uma porta que respondesse "quem recebe" traria a consulta de raio para dentro
 * de `notifications` e faria a contagem do alcance ficar decidida em dois
 * lugares.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { Aparelho, RegistroDeAparelho } from '../domain/aparelho.js';
import type { TokenDeAparelho } from './push-sender.js';

/**
 * O que o registro devolve, e por que não é só o aparelho.
 *
 * `reivindicadoDe` carrega a conta que **perdeu** aquele token, quando ela
 * existia. Sem esse dado o serviço não teria como registrar na trilha que a
 * conta anterior deixou de receber, e a revogação silenciosa é justamente a
 * que ninguém consegue explicar depois ("por que a Marina parou de receber?").
 */
export interface ResultadoDoRegistro {
  readonly aparelho: Aparelho;
  /** A conta anterior do mesmo token do FCM, ou `null` quando não havia. */
  readonly reivindicadoDe: UserId | null;
}

export interface RegistroDeAparelhos {
  /**
   * Registra ou atualiza o aparelho. **Idempotente pelo `push_token`**, como o
   * contrato declara.
   *
   * Três caminhos, e o terceiro é o que faz o critério 3 valer mesmo quando o
   * app não conseguiu chamar `DELETE`:
   *
   * 1. token novo (ou ausente): linha nova;
   * 2. token já do mesmo dono: a mesma linha é atualizada, e o `id` não muda —
   *    é isso que impede o Perfil de encher de aparelhos fantasmas a cada
   *    rotação de token do FCM;
   * 3. **token de OUTRA conta: a linha é reivindicada**, e `reivindicadoDe` diz
   *    de quem. O aparelho físico trocou de conta; deixar a linha antiga viva
   *    seria mandar o alerta da conta anterior para quem está com o aparelho
   *    agora (ADR-0002, §5: o logout sem rede não revoga nada no servidor).
   */
  registrar(
    dono: UserId,
    entrada: RegistroDeAparelho,
    agora: Instant,
  ): Promise<ResultadoDoRegistro>;

  /** Os aparelhos do dono, para o Perfil (critério 5). */
  listarDoDono(dono: UserId): Promise<readonly Aparelho[]>;

  /**
   * Apaga o aparelho do dono. Devolve o que foi apagado, ou `null`.
   *
   * `null` vira **404**, nunca 403 (ADR-0021): identificador que existe e é de
   * outra conta é indistinguível, daqui de fora, de identificador que não
   * existe — porque o `user_id` está no `WHERE` e a linha alheia nunca é lida.
   */
  revogarDoDono(dono: UserId, aparelhoId: string): Promise<Aparelho | null>;

  /**
   * Apaga o aparelho pelo token que o FCM recusou (critério 4).
   *
   * Uma linha, pelo token. Não recebe dono — ver o cabeçalho. Devolve `null`
   * quando já não havia nada, e isso é sucesso: duas entregas concorrentes
   * contra o mesmo token morto revogam uma vez e a segunda não erra.
   */
  revogarPorToken(token: TokenDeAparelho): Promise<Aparelho | null>;

  /**
   * Das contas candidatas, quais têm **ao menos um** aparelho com
   * `push_permission = granted` e token — os critérios 1 e 4 do ADR-0006, e só
   * eles.
   *
   * Recebe a lista em vez de varrer a tabela porque quem já filtrou por raio e
   * por validade é a consulta PostGIS da BICHUS-20, e refazer o filtro aqui
   * seria a segunda definição de "quem está perto".
   *
   * Conjunto e não contagem, de propósito: uma contagem devolvida daqui seria
   * confundida com `reachable_tutors`, que depende de **sete** critérios e não
   * de dois.
   */
  contasAlcancaveisPorPush(candidatos: readonly UserId[]): Promise<ReadonlySet<UserId>>;

  /**
   * O token para onde mandar, resolvido **no instante do envio**.
   *
   * É a resposta ao que acontece com um envio em curso. Um disparo lê a lista
   * de destinatários e leva segundos ou minutos para percorrê-la; entre a
   * leitura e o envio a pessoa pode sair da conta, remover o aparelho pelo
   * Perfil ou o FCM pode ter recusado o token para outra mensagem. Se o disparo
   * carregasse os tokens consigo, ele mandaria para um aparelho já revogado, e
   * nenhuma forma de marcar a linha conserta isso — só reler no momento de usar.
   *
   * `null` significa "não mande": a linha sumiu, perdeu o token ou perdeu a
   * permissão. Quem chama pula aquele aparelho e segue para o seguinte, que é o
   * "sem derrubar o envio para os outros aparelhos do mesmo usuário" do
   * critério 4.
   */
  enderecoDeEnvio(aparelhoId: string): Promise<TokenDeAparelho | null>;
}
