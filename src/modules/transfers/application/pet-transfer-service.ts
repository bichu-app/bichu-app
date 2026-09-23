/**
 * A transferencia de pet: as quatro camadas do contrato, e a decisao que nem a
 * BICHUS-66 nem a BICHUS-21 tinham previsto.
 *
 * ## O desenho, em uma frase
 *
 * Transferir e a operacao mais destrutiva do produto porque consumar revoga
 * **todas** as tags do pet (ADR-0004): a plaquinha que esta na coleira deixa de
 * resolver, para sempre, e nao ha como reativa-la. Tudo aqui e escrito contra
 * esse fato.
 *
 * As quatro camadas sao do contrato e nao deste arquivo:
 *
 *   1. reautenticacao com senha (`X-Reauth-Token`) -- **nao e implementada
 *      aqui**; ver o bloco "O QUE ESTE ARQUIVO NAO FAZ", abaixo;
 *   2. vinculo com o destinatario: so a conta cujo e-mail **verificado** e o
 *      destinatario consegue aceitar;
 *   3. token de 256 bits, guardado como SHA-256, entregue so por e-mail;
 *   4. janela de 24 h: aceitar NAO consuma.
 *
 * ## A pergunta que a issue nao respondeu: e se o pet for marcado como perdido
 * no meio da janela?
 *
 * O contrato ja decidiu metade dela: `startPetTransfer` responde 409 para pet
 * com caso aberto. Ou seja, **caso aberto e transferencia sao mutuamente
 * exclusivos**, e o contrato escolheu o caso quando os dois disputam o inicio.
 *
 * A outra metade -- o caso chegando DEPOIS, com a janela ja correndo -- nao
 * estava escrita, e a escolha aqui e a conservadora pela assimetria do custo:
 *
 *   consumar com caso aberto  revoga a plaquinha no minuto em que um estranho
 *                             pode estar com o animal no colo lendo o QR. E
 *                             irreversivel, e o achador chega a um beco sem
 *                             saida no unico momento em que o produto existe
 *                             para funcionar.
 *   cancelar a transferencia  custa ao tutor refazer o convite depois. Dois
 *                             toques, e so depois de o pet voltar.
 *
 * Entao **abrir um caso de perdido cancela a transferencia viva daquele pet**,
 * com `lost_case_opened`, e os dois lados sao avisados. Nada e revogado.
 *
 * E ha DUAS barreiras, nao uma, e a duplicacao e deliberada:
 *
 *   - `cancelarPorCasoAberto`, chamada quando o caso abre, para que a tela diga
 *     a verdade na hora em vez de o prazo continuar correndo em silencio;
 *   - a reconferencia dentro de `consumar`, na mesma transacao, que e a que
 *     **garante**. O caso pode abrir na corrida entre a checagem e a escrita, e
 *     numa operacao irreversivel a barreira que vale e a que o banco segura.
 *
 * Nao inventei um estado `paused`: `cancelled` ja esta no enum do contrato, e um
 * estado a mais seria contrato inventado. A pergunta fechada sobre retomar
 * automaticamente ao encerrar o caso esta na pauta de refinamento.
 *
 * ## O QUE ESTE ARQUIVO NAO FAZ, e por que
 *
 * **Nao verifica `X-Reauth-Token`.** Transferir e uma das acoes sensiveis --
 * `api/openapi.yaml` ja declara `x-reauth-scope: pet_transfer` e
 * `security: [bearerAuth, reauth]` na operacao, e `pet_transfer` ja esta no
 * enum de `POST /v1/auth/reauth`. O mecanismo que emite e valida aquele token e
 * de outra historia, em construcao agora; escrever aqui uma segunda verificacao
 * produziria duas definicoes da mesma regra, e a que diverge primeiro e sempre a
 * que ninguem esta olhando. A rota **declara** o escopo
 * (`reauthScope: 'pet_transfer'`), que e a marca que o portao confere contra o
 * contrato; a aplicacao dele entra com o mecanismo.
 *
 * **Nao enfileira o convite.** O e-mail sai sincronamente, pela mesma razao que
 * `ports/mailer.ts` escreve por extenso: o payload de `jobs` e GRAVADO, e o que
 * precisa chegar ao e-mail e o token **em claro**. Enfileirar o deixaria numa
 * linha de banco que sobrevive ao envio.
 *
 * **Nao monta link guardado.** `baseDaWeb` e lida no instante do envio. Link
 * gravado carrega o dominio do dia em que foi escrito, e e a forma mais provavel
 * de `localhost` vazar para producao.
 */
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken } from '../../../shared/crypto/digest.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../shared/ports/index.js';
import type { Mailer } from '../../identity/ports/mailer.js';
import {
  instanteDaConsumacao,
  instanteDoVencimentoDoConvite,
  mascararEmail,
  podeCancelar,
  type MotivoDoCancelamento,
} from '../domain/janela-da-transferencia.js';
import type {
  TransferId,
  TransferRepository,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../ports/transfer-repository.js';
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';

/** O que o servico precisa saber sobre quem chama, e nada alem. */
export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

/**
 * O canal de contato **verificado** do chamador, para a camada 2.
 *
 * E uma porta e nao uma consulta direta a `users` porque a pergunta que importa
 * nao e "qual e o e-mail desta conta" e sim "qual e o e-mail que esta conta
 * PROVOU ser dela". Um `users.email` lido cru aceitaria um endereco por
 * verificar, e a camada inteira cairia: bastaria cadastrar uma conta com o
 * endereco do destinatario para aceitar a transferencia dele.
 */
export interface EmailVerificadoDoChamador {
  /** `undefined` quando a conta nao tem e-mail verificado. */
  emailVerificadoDe(conta: UserId): Promise<string | undefined>;
}

/** Como o pet se chama, para o texto dos e-mails. Nunca guardado na linha. */
export interface NomeDoPet {
  nomeDe(pet: PetId): Promise<string | undefined>;
}

export interface DependenciasDeTransferencia {
  readonly repositorio: TransferRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  readonly mailer: Mailer;
  readonly contas: EmailVerificadoDoChamador;
  readonly pets: NomeDoPet;
  /** So para AGENDAR a consumacao. Nenhum token entra no payload. */
  readonly fila: JobQueue;
  readonly baseDaWeb: string;
}

/**
 * Normaliza o endereco **antes** de qualquer conferencia ou comparacao.
 *
 * A ordem nao e detalhe: `ports/mailer.ts` documenta os 82 pontos de codigo que
 * passam numa conferencia e viram caractere proibido depois de normalizados.
 * Aqui a normalizacao e a mesma do cadastro (`trim` + `toLowerCase`), e ela roda
 * primeiro -- inclusive porque a comparacao da camada 2 e entre dois enderecos
 * que precisam ter passado pelo mesmo tratamento, senao `Marina@…` deixa de ser
 * a mesma pessoa que `marina@…`.
 */
function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

export class PetTransferService {
  constructor(private readonly deps: DependenciasDeTransferencia) {}

  /** Camada 3: o convite sai, e o token existe so na caixa de entrada dele. */
  async iniciar(
    pet: PetId,
    emailDoDestinatario: string,
    chamador: ContextoDoChamador,
  ): Promise<TransferenciaGravada> {
    const destinatario = normalizarEmail(emailDoDestinatario);

    // Transferir para si mesmo nao e erro de digitacao inofensivo: consumado,
    // ele revogaria todas as tags do pet e devolveria o animal para o mesmo
    // dono sem plaquinha nenhuma. E o unico caminho em que a operacao destroi
    // sem transferir coisa alguma.
    const meu = await this.deps.contas.emailVerificadoDe(chamador.userId);
    if (meu !== undefined && normalizarEmail(meu) === destinatario) {
      throw problemas.validacao([
        {
          field: 'recipient_email',
          code: 'conflict',
          message: 'Este e o seu proprio e-mail. Escolha para quem o pet vai.',
        },
      ]);
    }

    const agora = this.deps.clock.now();
    const tokenBruto = this.deps.ids.opaqueToken();

    const resultado = await this.deps.repositorio.abrir(
      {
        id: this.deps.ids.uuidv7() as TransferId,
        petId: pet,
        fromUserId: chamador.userId,
        recipientEmail: destinatario,
        inviteTokenHash: hashDeToken(tokenBruto),
        inviteExpiresAt: instanteDoVencimentoDoConvite(agora),
      },
      agora,
    );

    if (resultado.tipo === 'pet_nao_e_deste_tutor') throw problemas.naoEncontrado();
    if (resultado.tipo === 'ja_em_andamento') throw problemas.transferenciaEmAndamento();
    if (resultado.tipo === 'caso_aberto') throw problemas.transferenciaComCasoAberto();

    const nome = (await this.deps.pets.nomeDe(pet)) ?? 'seu pet';
    const base = this.deps.baseDaWeb.replace(/\/$/, '');

    // A RESPOSTA E A MESMA EXISTA OU NAO A CONTA. O contrato e explicito, e o
    // motivo e que a diferenca transformaria esta rota em oraculo de cadastro:
    // qualquer tutor descobriria, um endereco por vez, quem tem conta no Bichu.
    // Por isso o convite explica como criar conta em vez de o servidor decidir.
    await this.deps.mailer.enviar({
      para: destinatario,
      assunto: `Voce foi convidado a ser o tutor de ${nome} no Bichu`,
      corpo:
        `Alguem quer transferir ${nome} para voce no Bichu.\n\n` +
        `Para aceitar, abra:\n\n${base}/transferencia?token=${tokenBruto}\n\n` +
        `Se voce ainda nao tem conta, a propria pagina te leva para criar uma. ` +
        `Voce precisa confirmar este mesmo e-mail antes de aceitar.\n\n` +
        `O convite vale por 72 horas. Depois de aceitar, o tutor atual ainda ` +
        `tem 24 horas para desistir; so depois disso ${nome} passa a ser seu.\n\n` +
        `Se voce nao esperava este convite, ignore esta mensagem.`,
    });

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.started',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: resultado.transferencia.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      // O endereco entra MASCARADO. A trilha sobrevive a exclusao da conta, e
      // gravar o endereco em claro deixaria ali um dado pessoal de alguem que
      // pode nem ter conta.
      metadata: { pet_id: pet, recipient_email_masked: mascararEmail(destinatario) },
    });

    return resultado.transferencia;
  }

  /** O cancelamento de dentro do app. Vinculado ao tutor pela porta. */
  async cancelarPeloTutor(
    transferencia: TransferId,
    chamador: ContextoDoChamador,
  ): Promise<TransferenciaGravada> {
    const atual = await this.deps.repositorio.buscarDoTutor(transferencia, chamador.userId);
    // `undefined` cobre "nao existe" e "nao e sua", e as duas viram 404
    // (ADR-0021). Um 403 confirmaria a existencia de uma transferencia alheia.
    if (atual === undefined) throw problemas.naoEncontrado();

    const agora = this.deps.clock.now();
    if (!podeCancelar(comoEstado(atual), agora)) throw problemas.transferenciaJaConsumada();

    const cancelada = await this.deps.repositorio.cancelar({
      transferencia,
      motivo: 'current_owner',
      quando: agora,
      // O token de cancelamento continua valendo? Nao: a transferencia acabou.
      // Deixa-lo vivo manteria um link no e-mail apontando para uma linha morta,
      // e a rota publica responderia 410 -- o mesmo destino, por um caminho mais
      // longo. Consumir aqui e dizer a verdade uma vez so.
      consumirTokenDeCancelamento: true,
    });
    // Perdeu a corrida entre a leitura e a escrita: o estado mudou. A condicao
    // esta no `WHERE` do adaptador, e e ela que garante.
    if (cancelada === undefined) throw problemas.transferenciaJaConsumada();

    await this.avisarCancelamento(cancelada, 'current_owner');
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.cancelled',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { reason: 'current_owner' },
    });

    return cancelada;
  }

  /**
   * Camada 2 em uma funcao: o token abre a porta, o e-mail verificado decide de
   * quem ela e.
   *
   * **403 e nao 410 quando o token e valido e a conta e outra**, e o contrato e
   * explicito sobre isso: o token nao esta errado, quem apresenta e que nao e o
   * destinatario. Responder 410 mandaria a pessoa certa, logada na conta errada,
   * pedir um convite novo que nao resolveria nada.
   */
  async aceitar(tokenBruto: string, chamador: ContextoDoChamador): Promise<TransferenciaGravada> {
    const convite = await this.deps.repositorio.buscarPorTokenDeConvite(hashDeToken(tokenBruto));
    const agora = this.deps.clock.now();

    // Inexistente, ja usado e vencido sao a MESMA resposta. Distinguir contaria
    // a um estranho se aquele token existiu -- o mesmo raciocinio de
    // `verification-token-expired`.
    if (convite === undefined) throw problemas.tokenDeVerificacaoVencido();
    if (convite.status !== 'pending_acceptance') throw problemas.tokenDeVerificacaoVencido();
    if (agora >= (convite.inviteExpiresAt.getTime() as Instant)) {
      throw problemas.tokenDeVerificacaoVencido();
    }

    const meu = await this.deps.contas.emailVerificadoDe(chamador.userId);
    // Conta sem e-mail verificado nao aceita, e a resposta e a mesma de conta
    // com outro e-mail: 403. A camada 2 inteira depende de "verificado", e
    // tratar "ainda nao verifiquei" como caso proprio daria a quem tem o token
    // uma pista sobre o cadastro do destinatario.
    if (meu === undefined || normalizarEmail(meu) !== convite.recipientEmail) {
      throw problemas.transferenciaNaoEDestaConta();
    }

    const cancelToken = this.deps.ids.opaqueToken();
    const efetivaEm = instanteDaConsumacao(agora);

    const resultado = await this.deps.repositorio.registrarAceite({
      transferencia: convite.id,
      toUserId: chamador.userId,
      cancelTokenHash: hashDeToken(cancelToken),
      acceptedAt: agora,
      effectiveAt: efetivaEm,
    });
    if (resultado.tipo === 'estado_mudou') throw problemas.tokenDeVerificacaoVencido();

    // O TRABALHO AGENDADO E O QUE FECHA A JANELA. Payload so com identificador
    // (regra normativa da fila): nenhum token, nenhum e-mail, nenhum nome.
    await this.deps.fila.enqueue('case.transfer_consummate', { transferId: convite.id }, efetivaEm);

    const nome = (await this.deps.pets.nomeDe(convite.petId)) ?? 'o pet';
    const base = this.deps.baseDaWeb.replace(/\/$/, '');
    // `comoIso` e nao `new Date(...)`: o caminho declarado da conversao de
    // instante, que a regra de lint de `application/` exige (shared/time/clock.ts).
    const quando = comoIso(efetivaEm);

    // O E-MAIL DO TUTOR ATUAL E A ROTA PUBLICA INTEIRA. Ele pode estar em outro
    // aparelho, deslogado, com o app desinstalado -- e este e o momento em que
    // NAO se pede que ele entre na conta, porque um obstaculo aqui e um pet
    // transferido por engano.
    const tutor = await this.deps.contas.emailVerificadoDe(convite.fromUserId);
    if (tutor !== undefined) {
      await this.deps.mailer.enviar({
        para: tutor,
        assunto: `A transferencia de ${nome} foi aceita. Voce tem 24 horas para desistir`,
        corpo:
          `Quem voce convidou aceitou receber ${nome}.\n\n` +
          `A partir de ${quando} o cadastro passa para a outra pessoa e as ` +
          `plaquinhas de QR de ${nome} param de funcionar para sempre.\n\n` +
          `Se isso nao era para acontecer, desfaca aqui, sem precisar entrar na conta:\n\n` +
          `${base}/transferencia/cancelar?token=${cancelToken}\n\n` +
          `Ate esse horario nada foi desativado.`,
      });
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.accepted',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: convite.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { pet_id: convite.petId, effective_at: quando },
    });

    return resultado.transferencia;
  }

  /** A leitura publica da tela de cancelamento. Sem conta, e com o minimo. */
  async verPorTokenDeCancelamento(tokenBruto: string): Promise<TransferenciaPorTokenDeCancelamento> {
    const achada = await this.deps.repositorio.buscarPorTokenDeCancelamento(
      hashDeToken(tokenBruto),
    );
    // Consumada, cancelada e token que nao vale mais respondem IGUAL. Dizer qual
    // deles ocorreu entregaria a quem tem um token velho o estado atual de uma
    // transferencia alheia (descricao do 410 no contrato).
    if (achada === undefined) throw problemas.tokenDeVerificacaoVencido();
    if (!podeCancelar(comoEstado(achada), this.deps.clock.now())) {
      throw problemas.tokenDeVerificacaoVencido();
    }
    return achada;
  }

  /** O cancelamento pelo link do e-mail. Uso unico, consumido aqui. */
  async cancelarPorToken(tokenBruto: string): Promise<void> {
    const achada = await this.deps.repositorio.buscarPorTokenDeCancelamento(
      hashDeToken(tokenBruto),
    );
    if (achada === undefined) throw problemas.tokenDeVerificacaoVencido();

    const agora = this.deps.clock.now();
    const cancelada = await this.deps.repositorio.cancelar({
      transferencia: achada.id,
      motivo: 'cancel_token',
      quando: agora,
      consumirTokenDeCancelamento: true,
    });
    // A CONDICAO ESTA NO `WHERE`, e nao numa leitura anterior. E isso que faz o
    // token parar de funcionar depois de consumada mesmo que duas requisicoes
    // cheguem no mesmo milissegundo.
    if (cancelada === undefined) throw problemas.tokenDeVerificacaoVencido();

    await this.avisarCancelamento(cancelada, 'cancel_token');
    await this.deps.trilha.record({
      // ATOR ANONIMO, e de proposito: quem cancelou apresentou um token que
      // chegou por e-mail, e pode nao estar logado. Afirmar a conta do tutor
      // aqui seria a trilha inventando um ator que ela nao viu.
      actorKind: 'anonymous',
      action: 'pet_transfer.cancelled',
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      metadata: { reason: 'cancel_token' },
    });
  }

  /**
   * O pet foi marcado como perdido. A transferencia viva dele cai.
   *
   * Silenciosa quando nao ha transferencia -- que e o caminho de quase todo
   * caso de perdido. Ela nao pode lancar: falhar aqui derrubaria a abertura do
   * caso, e abrir o caso e a coisa urgente.
   */
  async cancelarPorCasoAberto(pet: PetId): Promise<void> {
    const cancelada = await this.deps.repositorio.cancelarVivaDoPet({
      pet,
      motivo: 'lost_case_opened',
      quando: this.deps.clock.now(),
    });
    if (cancelada === undefined) return;

    await this.avisarCancelamento(cancelada, 'lost_case_opened');
    await this.deps.trilha.record({
      actorKind: 'system',
      action: 'pet_transfer.cancelled',
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      metadata: { reason: 'lost_case_opened', pet_id: pet },
    });
  }

  /**
   * A consumacao, chamada pelo worker quando o trabalho agendado vence.
   *
   * Reconfere tudo dentro da transacao do adaptador. Devolve o que aconteceu em
   * vez de lancar: "ja cancelada" e resultado normal, e um trabalho que falha
   * por um desfecho normal e um trabalho que volta a tentar para sempre.
   */
  async consumar(transferencia: TransferId): Promise<ResultadoDaTentativaDeConsumar> {
    const agora = this.deps.clock.now();
    const resultado = await this.deps.repositorio.consumar(transferencia, agora);

    if (resultado.tipo === 'ja_resolvida') return { tipo: 'nada_a_fazer' };
    if (resultado.tipo === 'ainda_na_janela') {
      return { tipo: 'reagendar', para: resultado.effectiveAt.getTime() as Instant };
    }

    // A SEGUNDA BARREIRA DO CASO ABERTO, e a que garante: ela roda na mesma
    // transacao que trocaria o dono. Cancelar em vez de adiar mantem a promessa
    // que a tela do tutor ja fez quando o caso abriu.
    if (resultado.tipo === 'caso_aberto' || resultado.tipo === 'destinatario_sumiu') {
      const motivo: MotivoDoCancelamento =
        resultado.tipo === 'caso_aberto' ? 'lost_case_opened' : 'recipient_gone';
      const cancelada = await this.deps.repositorio.cancelar({
        transferencia,
        motivo,
        quando: agora,
        consumirTokenDeCancelamento: true,
      });
      if (cancelada !== undefined) {
        await this.avisarCancelamento(cancelada, motivo);
        await this.deps.trilha.record({
          actorKind: 'system',
          action: 'pet_transfer.cancelled',
          resourceKind: 'pet_transfer',
          resourceId: cancelada.id,
          metadata: { reason: motivo },
        });
      }
      return { tipo: 'cancelada', motivo };
    }

    const nome = (await this.deps.pets.nomeDe(resultado.transferencia.petId)) ?? 'o pet';
    for (const [conta, assunto, corpo] of [
      [
        resultado.transferencia.fromUserId,
        `${nome} nao esta mais na sua conta`,
        `A transferencia de ${nome} se concluiu. O cadastro agora e da outra pessoa, ` +
          `e as plaquinhas de QR antigas foram desativadas e nao voltam a funcionar.`,
      ],
      [
        resultado.transferencia.toUserId,
        `${nome} agora e seu no Bichu`,
        `A transferencia se concluiu e ${nome} esta na sua conta.\n\n` +
          `As plaquinhas antigas foram desativadas: emita uma nova pelo app e ` +
          `troque a da coleira. Ate la, o QR antigo nao leva a lugar nenhum.`,
      ],
    ] as const) {
      if (conta === null) continue;
      const para = await this.deps.contas.emailVerificadoDe(conta);
      if (para === undefined) continue;
      await this.deps.mailer.enviar({ para, assunto, corpo });
    }

    await this.deps.trilha.record({
      actorKind: 'system',
      action: 'pet_transfer.consummated',
      resourceKind: 'pet_transfer',
      resourceId: resultado.transferencia.id,
      metadata: {
        pet_id: resultado.transferencia.petId,
        tags_revoked: resultado.tagsRevogadas,
      },
    });

    return { tipo: 'consumada', tagsRevogadas: resultado.tagsRevogadas };
  }

  /**
   * O aviso dos dois lados. Nunca lanca: um transporte fora do ar nao pode
   * desfazer um cancelamento que ja esta gravado.
   */
  private async avisarCancelamento(
    transferencia: TransferenciaGravada,
    motivo: MotivoDoCancelamento,
  ): Promise<void> {
    const nome = (await this.deps.pets.nomeDe(transferencia.petId)) ?? 'o pet';
    const explicacao =
      motivo === 'lost_case_opened'
        ? `${nome} foi marcado como perdido, entao a transferencia foi desfeita. ` +
          `As plaquinhas de QR continuam funcionando -- e por elas que quem ` +
          `encontrar o animal chega ao tutor. Quando o caso for encerrado, da ` +
          `para transferir de novo.`
        : motivo === 'recipient_gone'
          ? `A transferencia de ${nome} foi desfeita porque a conta que a aceitou ` +
            `deixou de existir. Nada foi desativado.`
          : `A transferencia de ${nome} foi desfeita. Nada foi desativado e as ` +
            `plaquinhas continuam funcionando.`;

    for (const conta of [transferencia.fromUserId, transferencia.toUserId]) {
      if (conta === null) continue;
      const para = await this.deps.contas.emailVerificadoDe(conta);
      if (para === undefined) continue;
      try {
        await this.deps.mailer.enviar({
          para,
          assunto: `A transferencia de ${nome} foi desfeita`,
          corpo: explicacao,
        });
      } catch {
        // Engolido de proposito, e so aqui: o aviso e consequencia do
        // cancelamento, e nao condicao dele. Lancar faria uma falha de SMTP
        // devolver 500 para um tutor cujo cancelamento ja esta gravado, e ele
        // tentaria de novo achando que nao funcionou.
        continue;
      }
    }
  }
}

export type ResultadoDaTentativaDeConsumar =
  | { readonly tipo: 'consumada'; readonly tagsRevogadas: number }
  | { readonly tipo: 'cancelada'; readonly motivo: MotivoDoCancelamento }
  | { readonly tipo: 'reagendar'; readonly para: Instant }
  | { readonly tipo: 'nada_a_fazer' };

function comoEstado(t: {
  readonly status: TransferenciaGravada['status'];
  readonly effectiveAt: Date | null;
}): { status: TransferenciaGravada['status']; inviteExpiresAt: Instant; effectiveAt: Instant | null } {
  return {
    status: t.status,
    // `podeCancelar` nao olha o vencimento do convite -- desistir e a direcao
    // segura e vale durante toda a janela. O campo entra zerado de proposito, e
    // nao lido do banco a toa.
    inviteExpiresAt: 0 as Instant,
    effectiveAt: t.effectiveAt === null ? null : (t.effectiveAt.getTime() as Instant),
  };
}
