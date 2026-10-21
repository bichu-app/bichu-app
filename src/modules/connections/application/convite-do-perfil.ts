/**
 * O caso de uso do **convite do próprio perfil** — o que alimenta o link e o QR
 * (decisão do cliente de 20/10/2026).
 *
 * > *"vamos implementar também o qr-code no perfil do usuário para que o
 * > convidado possa escanear e conectar com o usuário presencialmente e vamos
 * > implementar o link de convite, para o usuário compartilhar no whatsapp por
 * > exemplo"*
 *
 * ## UM segredo, DOIS transportes — e o servidor não sabe qual foi
 *
 * O QR é o link codificado em imagem, e é o próprio pedido do cliente que diz
 * isso. Então **este módulo emite um token e mais nada**: ele não gera imagem,
 * não monta URL e não sabe o que é um QR. Quem desenha o QR é a tela (outro
 * agente), e quem monta a URL do link é a tela também.
 *
 * **Por que o servidor não monta a URL:** gravar ou devolver URL absoluta
 * amarraria o convite ao domínio do dia (§11.1 proibição 9, a mesma razão pela
 * qual o banco guarda chave de objeto e não URL de mídia). O que sai é o token;
 * o endereço é de quem publica a tela.
 *
 * **A consequência honesta, e ela vale dita:** como os dois transportes carregam
 * o mesmo segredo, `origin` registra `invite_link` para os dois e **não há como
 * saber se alguém chegou por câmera ou por WhatsApp**. Isso não é uma lacuna a
 * preencher: um valor por transporte seria informação que o servidor não tem e
 * não pode conferir, e `origin` existe para dizer de onde o pedido nasceu de
 * forma verificável, não para registrar palpite. Quem quiser medir câmera contra
 * link mede na tela, que é quem sabe.
 *
 * ## Emitir REVOGA o anterior, e isso é decisão com motivo
 *
 * **Um convite ativo por conta.** Vários simultâneos tornariam *"quantos links
 * meus estão soltos por aí?"* uma pergunta sem resposta para o dono — que é a
 * pergunta que ele faz justamente quando algo deu errado. Com um, a tela do
 * perfil mostra **um** QR, e trocá-lo é um ato único com consequência óbvia: o
 * anterior para de valer.
 *
 * A garantia é do banco e não deste arquivo: o índice parcial único
 * `connection_invites_um_ativo_por_conta` (migração `20261020000012`) conta os
 * `revoked_at IS NULL`, então duas linhas ativas para a mesma conta **não são
 * exprimíveis**. Se este arquivo esquecesse de revogar, o `INSERT` falharia — e
 * é por isso que a revogação e a inserção estão na mesma transação.
 *
 * ## O que este arquivo NÃO faz
 *
 * - **não cria conexão.** O convite resolve para um perfil, e o botão de
 *   adicionar cria `pending`. Os tetos de 150/20/10 são cobrados em cada pedido
 *   que o convite gera, e **um link reusado não compra conexão nenhuma**;
 * - **não lista convites.** Não há "meus convites": há um, ou nenhum. A tela
 *   pergunta pelo ativo e recebe o ativo;
 * - **não diz quem usou o convite.** Seria a lista de quem viu o perfil de
 *   alguém, que ninguém pediu e que o plano 4-B não reconhece. Quem pediu
 *   conexão aparece na caixa de pedidos, que é onde isso já mora;
 * - **não reemite sozinho.** Convite vencido não se renova na leitura: o dono
 *   emite. Renovação automática faria o prazo de 30 dias não existir.
 */
import type { AuditAction, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock } from '../../../shared/ports/index.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { EmissorDeConvite } from '../ports/convite-de-conexao.js';
import type { ContextoDoChamador } from './conexao-entre-pessoas.js';

/** As acoes de trilha desta fatia. Fechada: acao inventada nao compila. */
type AcaoDoConvite = Extract<AuditAction, `connection.invite.${string}`>;

/** O convite, no vocabulário do contrato. */
export interface ConviteProjetado {
  /**
   * O token em claro — **a única vez em que ele existe**. O banco guarda o
   * resumo de 32 bytes, então nem esta casa nem um despejo do banco o recuperam
   * depois: quem perde o link emite outro.
   */
  readonly invite_token: string;
  /** Quando ele para de resolver, em ISO-8601. */
  readonly expires_at: string;
}

export interface DependenciasDoConviteDoPerfil {
  readonly convites: EmissorDeConvite;
  readonly trilha: AuditLog;
  readonly clock: Clock;
}

export class ConviteDoPerfil {
  constructor(private readonly deps: DependenciasDoConviteDoPerfil) {}

  /**
   * Emitir o convite do próprio perfil, **revogando o anterior**.
   *
   * Não há conferência de "já tem um": emitir é idempotente no efeito que
   * importa (a conta fica com **um** convite ativo) e não no valor (o token é
   * novo). Devolver o token antigo seria pior: quem aperta "gerar novo link"
   * depois de desconfiar que o antigo vazou receberia o vazado de volta.
   */
  async emitir(contexto: ContextoDoChamador): Promise<ConviteProjetado> {
    const agora = this.deps.clock.now();
    const emitido = await this.deps.convites.emitir(contexto.userId, agora);
    // **O token NAO vai para a trilha**, e isso e o ponto do ADR-0022: a trilha
    // e lida por gente e viaja em despejo de diagnostico, e o token em claro ali
    // abriria o perfil de alguem a quem leia o registro. O que se registra e que
    // houve emissao -- `resourceId` e a propria conta, que e o recurso.
    await this.registrar(contexto, 'connection.invite.issued');
    return { invite_token: emitido.token, expires_at: comoIso(emitido.expiraEm) };
  }

  /**
   * Revogar o convite ativo. **204, e idempotente.**
   *
   * Sem convite ativo não falha e não cria linha: revogar duas vezes é o mesmo
   * que revogar uma. Um 404 para "não havia convite" diria à tela que o estado
   * dela estava velho, o que não é informação útil num botão cujo efeito
   * desejado — *não existe link meu valendo* — já foi alcançado.
   */
  async revogar(contexto: ContextoDoChamador): Promise<void> {
    const agora = this.deps.clock.now();
    await this.deps.convites.revogar(contexto.userId, agora);
    await this.registrar(contexto, 'connection.invite.revoked');
  }

  private async registrar(contexto: ContextoDoChamador, acao: AcaoDoConvite): Promise<void> {
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: contexto.userId,
      action: acao,
      // A CONTA e o recurso, porque o convite e dela e ha um so. O `id` da
      // linha nao sai e nao entra aqui: ele e UUID interno, e a trilha ja
      // nomeia a conta.
      resourceKind: 'user',
      resourceId: contexto.userId,
      correlationId: contexto.correlationId,
      ...(contexto.ip === undefined ? {} : { actorIp: contexto.ip }),
      metadata: {},
    });
  }
}
