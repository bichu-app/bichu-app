/**
 * A conversa de quem achou o pet e não tem conta (BICHUS-41).
 *
 * É a outra porta da MESMA conversa mediada de `conversation-service.ts`: a
 * mesma tabela, a mesma redação, a mesma retenção. O que muda é quem chama e
 * como ele prova quem é. Aqui a prova é o token do aviso, e o token é o próprio
 * endereço (`/c/{finderToken}`): as rotas não têm id no caminho, e por isso não
 * existe o arranjo "id no caminho + credencial na outra mão" que faria da
 * autorização uma verificação a lembrar (SEC-001).
 *
 * ## A ordem da resolução do token, que é a regra inteira
 *
 *   1. forma: o que não tem a forma de um `opaqueToken` não vira consulta;
 *   2. consulta com o RESUMO no `WHERE` (o token em claro não existe no banco);
 *   3. comparação do resumo gravado com o apresentado, em tempo constante;
 *   4. validade: caso aberto, ou 30 dias do aviso, ou 30 dias depois do
 *      encerramento (`acesso-do-achador.ts`).
 *
 * Os passos 1 a 3 respondem `finder-link-invalid` (401) com o mesmo corpo:
 * distinguir "malformado" de "não existe" diria a quem tenta que chegou perto.
 * O passo 4 responde `conversation-closed` (410) com corpo FIXO, nas quatro
 * operações: o token existiu, e responder 401 diria que ele nunca valeu. O
 * corpo não conta o desfecho do caso (ver `problemas.acessoDoAchadorVencido`).
 *
 * ## O que nunca sai daqui
 *
 * Nada do tutor além do primeiro nome (`participantesVisiveis`), e nenhum id:
 * `ConversaParaOAchador` não tem campo de identificador, e a rota monta a
 * resposta campo a campo a partir dela.
 */
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken, iguaisEmTempoConstante } from '../../../shared/crypto/digest.js';
import { redigirCanalMediado, type TrechoRedigido } from '../../../shared/redaction/redigir.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  ConversaDoAchador,
  ConversationRepository,
  MensagemGravada,
  MotivoDaDenuncia,
} from '../ports/conversation-repository.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  type EstadoDaConversa,
  type ParticipanteVisivel,
} from '../domain/conversa-mediada.js';
import {
  codificarCursorDoAchador,
  tokenBemFormado,
  tokenDoAchadorVale,
} from '../domain/acesso-do-achador.js';
import { retencaoDestaMensagem } from '../domain/retencao-para-revisao.js';
import { AVISO_DE_DADO_RETIRADO } from '../domain/primeira-mensagem.js';

const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000;

/** De onde veio o pedido, para a trilha. Nunca vai para resposta nenhuma. */
export interface OrigemDoPedido {
  readonly correlationId?: string | undefined;
  readonly ip?: string | undefined;
}

/**
 * A conversa na forma que o achador vê. **Sem campo de id nenhum**, e a
 * ausência é o contrato (`FinderConversation`).
 */
export interface ConversaParaOAchador {
  readonly petDisplayName: string;
  readonly status: EstadoDaConversa;
  readonly participants: readonly ParticipanteVisivel[];
  readonly messages: readonly MensagemParaOAchador[];
  readonly nextCursor: string | null;
}

/** `FinderMessage`: sem `id`, e sem a chave de objeto da foto. */
export interface MensagemParaOAchador {
  readonly senderRole: MensagemGravada['senderRole'];
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
  readonly createdAt: Date;
}

/** O que o módulo `found` pede à conversa, sem enxergar o domínio dela. */
export type AcessoDoAchador =
  | { readonly situacao: 'recusado' }
  | { readonly situacao: 'vencido' }
  | { readonly situacao: 'valido'; readonly aceitaMensagem: boolean };

export interface DependenciasDaConversaDoAchador {
  readonly repositorio: ConversationRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

interface Resolvida {
  readonly conversa: ConversaDoAchador;
  readonly resumo: Buffer;
}

export class ConversaDoAchadorService {
  constructor(private readonly deps: DependenciasDaConversaDoAchador) {}

  /** `GET /v1/finder/conversation`. */
  async ler(
    token: string,
    pagina: { readonly limit: number; readonly deslocamento: number },
  ): Promise<ConversaParaOAchador> {
    const { conversa, resumo } = await this.resolverValida(token);
    const mensagens = await this.deps.repositorio.mensagensPeloTokenDoAchador(resumo, pagina);
    return {
      petDisplayName: conversa.petDisplayName,
      status: estadoDe(conversa),
      participants: participantesVisiveis({
        nomeDoTutor: conversa.nomeDoTutor,
        nomeDoAchador: conversa.nomeDoAchador,
      }),
      messages: mensagens.map(paraOAchador),
      // Página cheia pode ter continuação; página curta é o fim. A posição é a
      // da próxima mensagem, e não o id da última (ver `acesso-do-achador.ts`).
      nextCursor:
        mensagens.length < pagina.limit
          ? null
          : codificarCursorDoAchador(pagina.deslocamento + mensagens.length),
    };
  }

  /**
   * `POST /v1/finder/conversation/messages`.
   *
   * A mesma ordem do lado com conta: recusa a conversa fechada ou bloqueada
   * (410, uma resposta para os dois motivos), redige, grava, e só então conta
   * para a retenção. A mensagem que estoura as 200 em 24 h é gravada e a
   * conversa é marcada em silêncio (`hold_for_review` não é recusa).
   */
  async enviar(token: string, texto: string, origem: OrigemDoPedido): Promise<MensagemParaOAchador> {
    const { conversa } = await this.resolverValida(token);
    if (!aceitaMensagem(estadoDe(conversa))) throw problemas.conversaEncerrada();

    const redigido = redigirCanalMediado(texto);
    const gravada = await this.deps.repositorio.gravarMensagem({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa.id,
      senderRole: 'finder',
      // Quem escreve por aqui não apresentou conta nenhuma, mesmo que tenha
      // uma: o papel é o que a tela mostra, e a conta não é afirmada sem prova.
      senderUserId: null,
      body: redigido.texto,
      redactions: redigido.retirados,
    });

    if (redigido.retirados.length > 0) {
      await this.deps.repositorio.gravarMensagemDeSistema({
        id: this.deps.ids.uuidv7(),
        conversationId: conversa.id,
        body: AVISO_DE_DADO_RETIRADO,
        redactions: [],
      });
    }

    await this.avaliarRetencao(conversa, origem);
    return paraOAchador(gravada);
  }

  /**
   * `POST /v1/finder/conversation/block`. Responde igual quando já estava
   * bloqueada: repetir o bloqueio não é erro, e dizer "já estava" contaria a
   * quem bloqueia o que o outro lado fez.
   */
  async bloquear(token: string, origem: OrigemDoPedido): Promise<void> {
    const { conversa, resumo } = await this.resolverValida(token);
    await this.deps.repositorio.bloquearPeloAchador(resumo, this.deps.clock.now());
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.blocked',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      metadata: { by_role: 'finder' },
    });
  }

  /**
   * `POST /v1/finder/conversation/report`. Vai para a fila de quem modera, e
   * **nunca age sobre o alvo**: nem bloqueia, nem encerra, nem avisa o tutor.
   * O detalhe entra como a pessoa escreveu, porque é prova para quem modera, e
   * não sai para lado nenhum da conversa.
   */
  async denunciar(
    token: string,
    motivo: MotivoDaDenuncia,
    detalhe: string | undefined,
    origem: OrigemDoPedido,
  ): Promise<void> {
    const { conversa } = await this.resolverValida(token);
    await this.deps.repositorio.registrarDenuncia({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa.id,
      papel: 'finder',
      motivo,
      detalhe: detalhe === undefined || detalhe.trim() === '' ? null : detalhe,
      agora: this.deps.clock.now(),
    });
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.reported',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      // O motivo, nunca o texto: a trilha sobrevive à exclusão da conta.
      metadata: { reason: motivo, reporter_role: 'finder' },
    });
  }

  /**
   * O alvo da denúncia, para a dimensão `report_target` do teto: o par
   * (conversa, papel denunciado). `undefined` quando o token não resolve, e aí
   * o teto não conta ninguém e a recusa sai do handler.
   */
  async alvoDaDenuncia(token: string): Promise<string | undefined> {
    try {
      const { conversa } = await this.resolverValida(token);
      return `${conversa.id}:tutor`;
    } catch {
      return undefined;
    }
  }

  /**
   * Para o módulo `found`: a situação do token, sem lançar. Lá o contrato de
   * cada operação decide qual status cada situação vira.
   */
  async acesso(token: string): Promise<AcessoDoAchador> {
    const resolvida = await this.resolver(token);
    if (resolvida === undefined) return { situacao: 'recusado' };
    if (!this.vale(resolvida.conversa)) return { situacao: 'vencido' };
    return { situacao: 'valido', aceitaMensagem: aceitaMensagem(estadoDe(resolvida.conversa)) };
  }

  /**
   * Para o módulo `found`: o recado de "Contar mais" entra na conversa como
   * mensagem do achador, redigido, pelo mesmo caminho de `enviar`. É o único
   * jeito de o tutor ler o recado: o aviso em si não tem tela do lado dele.
   */
  async entregarRecado(token: string, recado: string, origem: OrigemDoPedido): Promise<string> {
    const mensagem = await this.enviar(token, recado, origem);
    return mensagem.body;
  }

  /** Passos 1 a 3 do cabeçalho. `undefined` é sempre `finder-link-invalid` para quem chama. */
  private async resolver(token: string): Promise<Resolvida | undefined> {
    if (!tokenBemFormado(token)) return undefined;
    const resumo = hashDeToken(token);
    const conversa = await this.deps.repositorio.buscarPeloTokenDoAchador(resumo);
    if (conversa === undefined) return undefined;
    if (!iguaisEmTempoConstante(Buffer.from(conversa.resumoDoToken), resumo)) return undefined;
    return { conversa, resumo };
  }

  private vale(conversa: ConversaDoAchador): boolean {
    return tokenDoAchadorVale(
      { expiraEm: conversa.tokenExpiraEm, caso: conversa.caso },
      this.deps.clock.now(),
    );
  }

  /** Os quatro passos, lançando o problema que cada um responde. */
  private async resolverValida(token: string): Promise<Resolvida> {
    const resolvida = await this.resolver(token);
    if (resolvida === undefined) throw problemas.linkDoAchadorInvalido();
    if (!this.vale(resolvida.conversa)) throw problemas.acessoDoAchadorVencido();
    return resolvida;
  }

  /**
   * O teto de 200 mensagens em 24 h, que a borda declara e não aplica
   * (`hold_for_review`). Não há dimensão de casos distintos deste lado: o
   * token tem escopo de uma conversa só (nota do contrato, critério 7).
   */
  private async avaliarRetencao(conversa: ConversaDoAchador, origem: OrigemDoPedido): Promise<void> {
    const agora = this.deps.clock.now();
    const desde = (agora - VINTE_E_QUATRO_HORAS_EM_MS) as Instant;
    const mensagens = await this.deps.repositorio.contarMensagensDoParticipante(
      conversa.id,
      'finder',
      desde,
    );
    const motivo = retencaoDestaMensagem({
      mensagensDoParticipante: mensagens,
      casosDistintosDaConta: undefined,
    });
    if (motivo === null) return;

    await this.deps.repositorio.reterParaRevisao(conversa.id, motivo, agora);
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.held_for_review',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      metadata: { reason: motivo },
    });
  }
}

function estadoDe(conversa: ConversaDoAchador): EstadoDaConversa {
  return estadoDaConversa({
    encerradaEm: conversa.encerradaEm,
    bloqueadaEm: conversa.bloqueadaEm,
    casoEncerrado: conversa.caso !== null && !conversa.caso.aberto,
  });
}

/** Campo a campo: o `id` e a chave de objeto da mensagem ficam para trás. */
function paraOAchador(mensagem: MensagemGravada): MensagemParaOAchador {
  return {
    senderRole: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions,
    createdAt: mensagem.createdAt,
  };
}

function comoOrigem(origem: OrigemDoPedido): { correlationId?: string; actorIp?: string } {
  return {
    ...(origem.correlationId === undefined ? {} : { correlationId: origem.correlationId }),
    ...(origem.ip === undefined ? {} : { actorIp: origem.ip }),
  };
}
