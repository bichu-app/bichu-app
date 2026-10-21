/**
 * **De onde um pedido de conexão pode nascer — e é aqui que a regra do cliente
 * vira arquitetura.**
 *
 * ## A DECISÃO MUDOU EM 20/10/2026, E ESTE ARQUIVO MUDOU COM ELA
 *
 * Até 20/10/2026 esta porta recebia **só** um token de convite, e recusava por
 * escrito receber apelido. A recusa estava certa para o produto daquele dia e a
 * prosa dela ficava aqui. O cliente reverteu a decisão, literal:
 *
 * > *"vamos implementar a busca pelo usuário, mas vamos implementar também o
 * > qr-code no perfil do usuário para que o convidado possa escanear e conectar
 * > com o usuário presencialmente e vamos implementar o link de convite, para o
 * > usuário compartilhar no whatsapp por exemplo e ao clicar vai para a página
 * > do perfil do usuário com o botão de adicionar"*
 *
 * **O texto antigo não foi deixado no lugar com uma ressalva ao lado.** Ele
 * afirmava que não existia caminho por apelido e que pedir por apelido *"seria
 * busca de pessoas pela porta de trás, e um oráculo de existência de apelido"* —
 * e as duas frases passaram a contradizer o código. Comentário que contradiz o
 * código é defeito, e comentário que contradiz a **decisão** é pior, porque ele
 * parece autoridade: quem o lesse em novembro concluiria que a busca é um
 * acidente a consertar.
 *
 * ## O que a reversão NÃO comprou, e a diferença decide o desenho
 *
 * A frase antiga tinha duas metades, e **só a primeira caiu**:
 *
 * - *"busca de pessoas pela porta de trás"* — **caiu.** A busca passou a existir
 *   pela porta da frente: `GET /v1/people` é operação de primeira classe, com
 *   piso de três caracteres, teto por conta, recorte de resposta fechado e os
 *   seis predicados na cláusula `WHERE`. Pedir por apelido já não é um caminho
 *   lateral para algo negado, porque nada mais é negado ali;
 * - *"um oráculo de existência de apelido"* — **NÃO caiu, e continua valendo
 *   inteira.** O cliente abriu a busca; ele não abriu *"este apelido existe?"*
 *   como pergunta respondível. A diferença é o que [ResolvedorDeApelido]
 *   existe para manter: a busca devolve quem **existe para quem busca**, e o
 *   pedido por apelido responde o **mesmo 404** para apelido inexistente, para
 *   apelido de pet, para apelido reservado, para conta desabilitada, para quem
 *   bloqueou quem pede e para quem quem pede denunciou. Seis motivos, uma
 *   resposta.
 *
 * ## Os caminhos, e o que cada um é hoje
 *
 * | Caminho | Credencial | `origin` | Existe? |
 * |---|---|---|---|
 * | convite (link **e** QR) | `invite_token` | `invite_link` | **sim**, desde 20/10 |
 * | busca | `handle` | `people_search` | **sim**, desde 20/10 |
 * | caso devolvido | token (H′) | `anchored_case` | não |
 * | encontro em comum | token (H′) | `anchored_event` | não |
 * | código presencial rotativo | token (H″) | `presence_code` | não |
 *
 * **O QR e o link são o MESMO token**, e é o próprio pedido do cliente que diz
 * isso: o QR é o link codificado em imagem. Por isso há **um** valor de `origin`
 * para os dois e não dois — um valor por transporte registraria como a pessoa
 * leu a tela, que não é procedência e que o servidor não tem como conferir.
 *
 * **`presence_code` não foi reaproveitado para o QR**, e isso é deliberado: ele
 * é a fatia H″, token curto e **rotativo de 5 min** para código mostrado cara a
 * cara. O QR que o cliente pediu mora no perfil e dura 30 dias. Declarar um link
 * durável como código rotativo faria a primeira pessoa a consultar `origin` para
 * medir risco ler o contrário do que aconteceu.
 *
 * ## O aceite continua obrigatório, e é ele que sobrou de pé
 *
 * Nenhum dos cinco caminhos cria conexão: os cinco criam `pending`. O convite
 * não dispensa aceite, não dá acesso à vitrine e não cria aresta por si. Os
 * tetos de 150 conexões, 20 pendentes e 10 pedidos por dia são cobrados em
 * **cada** pedido que um convite gera, na cláusula `WHERE` do `INSERT`
 * (`20261018000030`) — um link reusado não compra conexão nenhuma.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { OrigemDoPedido } from '../domain/conexao.js';

export interface ConviteResolvido {
  /** A conta que vai receber o pedido. Nunca atravessa a borda HTTP. */
  readonly alvo: UserId;
  /** Qual dos cinco caminhos produziu este convite. Vai para `origin`. */
  readonly origem: OrigemDoPedido;
  /**
   * O apelido de quem emitiu, **que é o que a tela de destino precisa**.
   *
   * Ele sai desta porta e não de uma segunda leitura porque o convite já tem a
   * conta na mão: pedir o apelido depois seria uma consulta a mais pelo mesmo
   * dado, e duas consultas são duas chances de os predicados divergirem.
   *
   * **Apelido e não `UserId`**: a página de destino é `getPersonProfile`, que é
   * endereçada pelo apelido, e é assim que resolver um convite reusa o perfil
   * inteiro — com o recorte da emenda 2 do ADR-0010 e a regra da vitrine — em
   * vez de projetar uma segunda versão dele que divergiria da primeira.
   *
   * Convite cujo dono **não tem apelido** não resolve (`undefined`): quem não
   * tem apelido não tem endereço e por isso não tem esta página, que é a mesma
   * regra que `PersonProfile.handle` já declara ao não ser anulável.
   */
  readonly apelido: string;
}

export interface ResolvedorDeConvite {
  /**
   * `undefined` para token inexistente, **vencido**, **revogado**, de outra
   * conta, cujo dono não tem apelido, ou que aponte para quem bloqueou quem
   * chama. **Um `undefined` só**, de propósito: a borda transforma todos eles no
   * **mesmo 404** (ADR-0021), e distinguir "vencido" de "revogado" de
   * "inexistente" já seria um oráculo — e seria o oráculo mais útil que existe
   * aqui, porque "este token já existiu" é a informação que diz a alguém que
   * vale a pena continuar tentando.
   */
  resolver(token: string, quemChama: UserId): Promise<ConviteResolvido | undefined>;
}

/**
 * **Quem o apelido endereça, se essa pessoa existe para quem pergunta.**
 *
 * Esta porta é o caminho por apelido que a decisão de 20/10/2026 abriu, e ela é
 * desenhada para **não** ser o oráculo que a decisão de 18/10 temia. O
 * mecanismo é um só e está na forma do tipo: ela devolve `UserId | undefined`, e
 * `undefined` funde **os seis** motivos que
 * `construtorDoAlvoPorApelido` cobra na cláusula `WHERE` — inexistente, apelido
 * de pet, apelido reservado, conta desabilitada de qualquer lado, bloqueio em
 * qualquer direção e perfil denunciado por quem pergunta.
 *
 * **Não existe um segundo valor de retorno, e não existe um segundo método.**
 * Uma variante que dissesse "existe, mas você não pode" é a definição do
 * oráculo; uma que distinguisse bloqueio de inexistência contaria o bloqueio a
 * quem foi bloqueado, que é o aviso que o desenho não dá.
 */
export interface ResolvedorDeApelido {
  resolver(apelido: string, quemPergunta: UserId): Promise<UserId | undefined>;
}

/** O convite recém-emitido. O token **cru existe só aqui e na resposta**. */
export interface ConviteEmitido {
  /**
   * O token em claro, **a única vez em que ele existe**. O banco guarda o resumo
   * de 32 bytes (`connection_invites.token_hash`), então nem esta casa nem um
   * despejo do banco o recuperam depois: quem perde o link emite outro.
   */
  readonly token: string;
  /** Quando ele para de resolver. 30 dias, o mesmo prazo do pendente. */
  readonly expiraEm: Instant;
}

/**
 * **Quem emite o convite do próprio perfil** — o que alimenta o link e o QR.
 *
 * Emitir **revoga o anterior** da mesma conta, e isso é uma garantia do banco e
 * não uma promessa desta porta: o índice parcial único
 * `connection_invites_um_ativo_por_conta` conta os `revoked_at IS NULL`, então
 * duas linhas ativas para a mesma conta não são exprimíveis. O motivo está na
 * migração `20261020000012`: vários links simultâneos tornariam *"quantos links
 * meus estão soltos por aí?"* uma pergunta sem resposta para o dono — que é a
 * pergunta que ele faz justamente quando algo deu errado.
 */
export interface EmissorDeConvite {
  /** Emite, revogando o convite ativo anterior da mesma conta. */
  emitir(dono: UserId, agora: Instant): Promise<ConviteEmitido>;
  /**
   * Revoga o convite ativo, se houver. Idempotente: sem convite ativo não falha
   * e não cria linha — revogar duas vezes é o mesmo que revogar uma.
   */
  revogar(dono: UserId, agora: Instant): Promise<void>;
}
