/**
 * O serviço da conversa mediada.
 *
 * ## A ordem de `enviar`, que é a regra inteira em quatro linhas
 *
 *   1. ler a conversa **com o chamador no `WHERE`** — 404 se não for dele;
 *   2. recusar se ela não aceita mensagem (encerrada ou bloqueada);
 *   3. **redigir**, e só então gravar;
 *   4. contar, e reter para revisão quando for o caso.
 *
 * O passo 3 acontece antes do 4 de propósito: a mensagem que estoura o teto de
 * retenção **é gravada**, redigida, e a conversa é marcada. `hold_for_review`
 * não é recusa — recusar avisaria o remetente de que ele foi marcado, que é
 * ajudar o golpe a se corrigir (critérios 10 e 11).
 *
 * ## Por que a redação roda aqui e não na borda
 *
 * Porque ela precisa valer para **os dois sentidos** (critério 13), e um dos
 * dois sentidos não passa por rota nenhuma hoje: a mensagem de abertura carrega
 * o recado que o achador digitou no formulário do aviso, e esse texto está
 * gravado em claro em `found_reports.notes`, coluna que nasceu antes desta
 * história. Redigir na borda protegeria o caminho que já tem tela e deixaria
 * passar justamente o primeiro recado, que é o mais provável de conter um
 * telefone — a pessoa está com o animal na mão e quer resolver.
 */
import { problemas } from '../../../shared/http/errors.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type {
  ConversaDoChamador,
  ConversationRepository,
  EspecieDoSistema,
  MensagemGravada,
  MotivoDaDenuncia,
  Pagina,
  PaginaDaLista,
} from '../ports/conversation-repository.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  previaDaMensagem,
  type EstadoDaConversa,
  type ParticipanteVisivel,
  type SinaisDeEstado,
} from '../domain/conversa-mediada.js';
import { retencaoDestaMensagem } from '../domain/retencao-para-revisao.js';
import { chaveHigienizadaOuRecusa } from '../domain/foto-anexada.js';
import { fotoAlcancaOutroLado } from '../domain/leitura-da-foto.js';
import type { FotoDaConversa } from '../ports/foto-da-conversa.js';
import { codificarCursor } from '../domain/paginacao.js';
import {
  primeiraMensagemDoSistema,
  AVISO_DE_DADO_RETIRADO,
  type DadosDoAviso,
} from '../domain/primeira-mensagem.js';
import type {
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000;

export interface Chamador {
  readonly userId: UserId;
  readonly correlationId?: string | undefined;
  readonly ip?: string | undefined;
}

/** A conversa como as rotas autenticadas a devolvem. Montada campo a campo. */
export interface ConversaVisivel {
  readonly id: ConversationId;
  /** O aviso que abriu a conversa. Ver `ConversaDoChamador.foundReportId`. */
  readonly foundReportId: string;
  /**
   * Uma foto que ESTE chamador enviar chega a ser lida pelo outro lado?
   *
   * Derivado de `achadorTemConta` por `fotoAlcancaOutroLado`
   * (`domain/leitura-da-foto.ts`), que e onde o raciocinio inteiro esta
   * escrito. **Expectativa, nao permissao**: o envio e aceito e a mensagem e
   * gravada de todo jeito.
   */
  readonly fotoAlcancaOutroLado: boolean;
  readonly caseId: string | null;
  readonly petDisplayName: string;
  readonly status: EstadoDaConversa;
  readonly participants: readonly ParticipanteVisivel[];
  readonly messages: readonly MensagemGravada[];
  readonly nextCursor: string | null;
  /** `Conversation.unread` do contrato. Vem do banco, nunca de contagem local. */
  readonly naoLida: boolean;
  /** `Conversation.last_message_preview`, já cortado pelo domínio. */
  readonly previaDaUltima: string | null;
  readonly ultimaMensagemEm: Date | null;
}

/** A página de `GET /v1/conversations`, com o cursor da próxima. */
export interface PaginaDeConversas {
  readonly items: readonly ConversaVisivel[];
  readonly nextCursor: string | null;
  /**
   * `ConversationPage.unread_count` do contrato: o contador do sino.
   *
   * **Não é `items.filter(naoLida).length`**, e a diferença é a regra: o
   * contador conhece a lista vista e a exceção do aviso de plaquinha; a marca de
   * item não. Além disso ele conta a conta INTEIRA, e não a página — somar a
   * página faria o sino mostrar 20 para quem tem 57.
   */
  readonly naoLidas: number;
  /**
   * `ConversationPage.total`: quantas conversas o RECORTE tem no servidor.
   *
   * **Nem `items.length` nem [naoLidas]**, e os três são números diferentes: o
   * primeiro é o tamanho da página, o segundo é o sino da conta inteira, e este
   * é quantas conversas satisfazem o `q` desta chamada. A linha de resumo da
   * listagem lê este — alimentá-la com o tamanho da página diria `10` a quem
   * tem 57.
   */
  readonly total: number;
}

/** O que o aviso entrega ao abrir a conversa. */
export interface AvisoRegistrado {
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  readonly nomeDoPet: string;
  readonly escaneadoEm: Instant;
  readonly rotuloDaArea: string | null;
  readonly recado: string | null;
  readonly achadorComConta: UserId | null;
  /**
   * O aviso anterior do mesmo achador, quando este foi agrupado. Presente,
   * a conversa daquele aviso recebe a mensagem nova em vez de nascer outra:
   * agrupar e abrir a segunda conversa são a mesma informação repartida em dois
   * lugares, e o tutor veria duas linhas para a mesma pessoa.
   */
  readonly avisoAnteriorId: FoundReportId | null;
  /**
   * Que AVISO é este (BICHUS-278): plaquinha lida, ou achado confirmado.
   *
   * Decide o `system_kind` da mensagem de abertura, e com isso se o aviso
   * sobrevive a uma passada de olho na lista — os dois sobrevivem, e é por isso
   * que os dois valores possíveis aqui são os dois que a exceção nomeia.
   *
   * **Argumento, e não dedução pelo texto.** Uma heurística sobre a microcopy
   * da primeira mensagem quebraria no dia em que a frase mudasse, e quebraria em
   * silêncio: o aviso sumiria do contador e ninguém saberia por quê.
   *
   * Quem decide é a composição (`src/bin/api.ts`), que é o único lugar do
   * sistema que conhece os dois caminhos — `tags` e `lostfound` continuam
   * indiferentes à conversa, como o comentário daquele arquivo já dizia.
   */
  readonly especie: EspecieDoAviso;
}

/**
 * As duas espécies de AVISO. São as duas que não saem do contador quando a
 * pessoa abre a lista.
 *
 * `redaction_warning` não está aqui de propósito: ela é explicação de
 * interface, não aviso, e sai do contador pela regra geral.
 */
export type EspecieDoAviso = Extract<EspecieDoSistema, 'scan_notice' | 'found_notice'>;

export interface DependenciasDaConversa {
  readonly repositorio: ConversationRepository;
  /**
   * A resolução da foto anexada. Porta SEPARADA do repositório, e não um método
   * nele: ela lê `upload_intents`, que é a tabela da esteira de mídia, e o
   * repositório da conversa não tem nada a dizer sobre o estado de uma higiene.
   * Ver `ports/foto-da-conversa.ts`.
   */
  readonly fotos: FotoDaConversa;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class ConversationService {
  constructor(private readonly deps: DependenciasDaConversa) {}

  /**
   * Abre a conversa a partir de um aviso, ou anexa o aviso à que já existe.
   *
   * **É o único caminho de criação de conversa no sistema.** Não há rota que
   * crie uma, e o contrato não declara nenhuma: quem abre é sempre um
   * escaneamento de plaquinha, isto é, alguém que está com o animal na mão. Um
   * `POST /conversations` transformaria o produto em mensagem direta entre
   * desconhecidos, que é o que a própria história declara fora de escopo.
   */
  async abrirPorAviso(aviso: AvisoRegistrado): Promise<ConversationId | undefined> {
    const agora = this.deps.clock.now();
    const anterior =
      aviso.avisoAnteriorId === null
        ? undefined
        : await this.deps.repositorio.porAviso(aviso.avisoAnteriorId);

    let conversa: ConversationId;
    if (anterior === undefined) {
      const id = this.deps.ids.uuidv7() as ConversationId;
      await this.deps.repositorio.abrirPorAviso({
        id,
        foundReportId: aviso.foundReportId,
        petId: aviso.petId,
        achadorComConta: aviso.achadorComConta,
      });
      const gravada = await this.deps.repositorio.porAviso(aviso.foundReportId);
      // `undefined` aqui significa que o pet sumiu entre o aviso e a abertura
      // (exclusão lógica). Não é erro do chamador, e inventar uma conversa sem
      // pet seria gravar uma linha que nenhuma tela consegue abrir.
      if (gravada === undefined) return undefined;
      conversa = gravada;
      await this.deps.trilha.record({
        ...(aviso.achadorComConta === null
          ? { actorKind: 'anonymous' as const }
          : { actorKind: 'user' as const, actorUserId: aviso.achadorComConta }),
        action: 'conversation.opened',
        resourceKind: 'conversation',
        resourceId: conversa,
      });
    } else {
      conversa = anterior;
    }

    await this.gravarAbertura(conversa, aviso, agora);
    return conversa;
  }

  /**
   * `GET /v1/conversations` — as conversas de quem chamou, dos dois lados.
   *
   * **Cada item vem com `messages: []`**, e isso precisa estar dito em voz alta
   * em vez de descoberto na tela: a lista carrega cabeçalho, e trazer as
   * mensagens de cada linha seria N+1 na tela que o tutor abre com o telefone
   * tocando. Quem precisa da prévia da última mensagem abre a conversa. O
   * contrato exige o campo presente, e `[]` é o valor verdadeiro para esta
   * vista — não "esta conversa está vazia", e sim "esta vista não as carrega".
   */
  async listar(chamador: Chamador, pagina: PaginaDaLista): Promise<PaginaDeConversas> {
    // As TRÊS em paralelo: o contador do sino é da CONTA inteira e não depende
    // da página, e o total é do recorte e não da página — serializá-las só
    // somaria latência na tela que o tutor abre com o telefone tocando.
    const [conversas, naoLidas, total] = await Promise.all([
      this.deps.repositorio.listarDoChamador(chamador.userId, pagina),
      this.deps.repositorio.contarParaOSino(chamador.userId),
      this.deps.repositorio.contarDoChamador(chamador.userId, pagina.termo),
    ]);
    return {
      items: conversas.map((c) => this.comoVisivel(c, [], null)),
      nextCursor: proximoDaLista(conversas, pagina.limit),
      total,
      // **ESTA LINHA NÃO CHAMA `marcarListaVista`.** Ler a lista é um GET e
      // declara `x-effects: []`; zerar o contador é uma escrita e tem rota
      // própria. Pendurá-la aqui faria um `Atualizar`, ou um pré-carregamento,
      // apagar o sino sem a pessoa ter olhado nada.
      naoLidas,
    };
  }

  /** `GET /v1/conversations/{id}` — a conversa e as mensagens. */
  async buscar(
    conversa: ConversationId,
    chamador: Chamador,
    pagina: Pagina,
  ): Promise<ConversaVisivel> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    const mensagens = await this.deps.repositorio.mensagens(conversa, chamador.userId, pagina);
    // ABRIR A CONVERSA É O QUE SIGNIFICA "LIDO" (BICHUS-278).
    //
    // A escrita acontece DEPOIS da leitura vinculada, e por isso ela não é um
    // oráculo: conversa de terceiro já saiu por 404 em `exigirDoChamador`, e
    // nada é gravado. O `chamador` entra no `WHERE` da escrita de todo modo --
    // duas chaves, como no resto deste arquivo.
    //
    // **A primeira página é a condição.** Paginar para trás (`cursor`) é a
    // pessoa buscando mensagem ANTIGA; marcar ali faria o contador zerar sem a
    // pessoa ter visto a mensagem nova, que é o topo da conversa.
    if (pagina.depoisDe === undefined) {
      await this.deps.repositorio.marcarConversaLida(
        conversa,
        chamador.userId,
        this.deps.clock.now(),
      );
    }
    // A conversa devolvida é a LIDA ANTES da marca, de propósito: é esse o
    // estado que a pessoa está abrindo. Devolver `unread: false` aqui faria a
    // tela não ter como destacar o que acabou de chegar.
    return this.comoVisivel(encontrada, mensagens, proximoCursor(mensagens, pagina.limit));
  }

  /**
   * `POST /v1/conversations/{id}/messages`.
   *
   * Devolve a mensagem **já redigida**, com `redactions` preenchido, para a
   * interface explicar o que saiu em vez de o remetente achar que o texto sumiu
   * sozinho. O critério 16 acrescenta o aviso do sistema quando o próprio tutor
   * escreve o endereço dele: proteger só um lado deixa a casa do tutor exposta
   * por iniciativa dele mesmo.
   */
  async enviar(
    conversa: ConversationId,
    texto: string,
    chamador: Chamador,
    /**
     * O `photo_upload_id` do corpo, quando a pessoa anexou foto.
     *
     * Opcional, e o envio sem foto continua idêntico ao que era: a redação do
     * texto (`redigirCanalMediado`) não muda uma linha.
     */
    fotoUploadId?: string,
  ): Promise<MensagemGravada> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    if (!aceitaMensagem(estadoDaConversa(sinaisDe(encontrada)))) {
      throw problemas.conversaEncerrada();
    }

    // A FOTO É RESOLVIDA DEPOIS DO GUARDA DE ESTADO, e a ordem é o que faz
    // BLOQUEAR impedir envio COM foto sem uma linha nova: `aceitaMensagem`
    // acima já recusa conversa bloqueada, encerrada ou removida, e nada abaixo
    // dele roda. Resolver a foto antes faria a conversa bloqueada consumir uma
    // consulta e, pior, devolver `photo-not-ready` em vez do 410 verdadeiro --
    // dizendo à pessoa para tentar de novo um envio que nunca vai ser aceito.
    const chaveDaFoto =
      fotoUploadId === undefined
        ? null
        : chaveHigienizadaOuRecusa(
            await this.deps.fotos.porUploadId(conversa, chamador.userId, fotoUploadId),
            'photo_upload_id',
          );

    const redigido = redigirCanalMediado(texto);
    const gravada = await this.deps.repositorio.gravarMensagem({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      senderRole: encontrada.papelDoChamador,
      senderUserId: chamador.userId,
      body: redigido.texto,
      redactions: redigido.retirados,
      // A chave HIGIENIZADA. Ver `ports/foto-da-conversa.ts`.
      photoObjectKey: chaveDaFoto,
    });

    if (redigido.retirados.length > 0) {
      await this.deps.repositorio.gravarMensagemDeSistema({
        id: this.deps.ids.uuidv7(),
        conversationId: conversa,
        body: AVISO_DE_DADO_RETIRADO,
        redactions: [],
        // Explicação de interface, e NÃO aviso: sai do contador pela regra
        // geral. Marcá-la como aviso faria o sino de quem escreveu o telefone
        // ficar aceso por uma frase que ele acabou de ler na própria tela.
        especie: 'redaction_warning',
      });
    }

    await this.avaliarRetencao(conversa, encontrada, chamador);
    return gravada;
  }

  /**
   * `POST /v1/conversations/{id}/block` — o lado COM CONTA bloqueia a outra parte.
   *
   * **A assimetria de segurança que isto fecha**: o achador sem conta já tinha
   * `/finder/conversation/block` no ar, e o lado autenticado não tinha nada. Um
   * tutor sendo extorquido pelo falso achador não tinha saída nenhuma dentro do
   * canal que o produto desenhou para protegê-lo.
   *
   * **Espelha o lado do achador, e não inventa desenho novo.** Mesma coluna,
   * mesma idempotência (`blocked_at IS NULL` no `WHERE`), mesma ação de trilha
   * com o papel no metadado. O envio já recusa conversa bloqueada
   * (`aceitaMensagem` sobre `estadoDaConversa`), então a conversa passa a modo
   * leitura sem uma linha nova em `enviar`.
   *
   * **Repetir responde igual.** O contrato declara `accept_and_deduplicate`, e a
   * razão é de produto: bloquear é a ação que a pessoa executa com medo, e
   * responder com texto sobre limite de chamadas a quem está se protegendo é o
   * pior erro possível desta tela. Dizer "já estava bloqueada" também não serve:
   * contaria a quem bloqueia o que o outro lado fez.
   *
   * **A conversa encerrada não é recusada.** Bloquear depois do encerramento
   * continua valendo: é o que impede a conversa de voltar a aceitar mensagem se
   * o caso for reaberto, e é o registro de que aquela pessoa não é bem-vinda.
   */
  async bloquear(conversa: ConversationId, chamador: Chamador): Promise<void> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    await this.deps.repositorio.bloquearPeloChamador(
      conversa,
      chamador.userId,
      this.deps.clock.now(),
    );
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...comoOrigem(chamador),
      action: 'conversation.blocked',
      resourceKind: 'conversation',
      resourceId: conversa,
      // O papel sai da LEITURA VINCULADA, e não de um argumento de quem chama:
      // é o mesmo valor que o `CASE` do `UPDATE` grava em `blocked_by_role`.
      metadata: { by_role: encontrada.papelDoChamador },
    });
  }

  /**
   * `POST /v1/conversations/{id}/report` — denúncia do lado COM CONTA.
   *
   * Vai para a fila de quem modera e **nunca age sobre o alvo**: não bloqueia,
   * não encerra, não avisa a outra pessoa. O detalhe entra como foi escrito,
   * porque é prova para quem modera, e não sai para lado nenhum da conversa.
   *
   * **A quarta denúncia do mesmo lado não abre item novo**: ela soma no que já
   * está na fila, pelo índice parcial de denúncia aberta por lado — o
   * `accept_and_deduplicate` do contrato, cumprido no banco. E **não recusa**:
   * quem toca em Denunciar a cada mensagem está com medo, e responder com limite
   * de chamadas a quem pede ajuda é o pior erro possível desta tela.
   */
  async denunciar(
    conversa: ConversationId,
    motivo: MotivoDaDenuncia,
    detalhe: string | undefined,
    chamador: Chamador,
  ): Promise<void> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    await this.deps.repositorio.registrarDenuncia({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      // Quem denuncia é o lado em que o chamador está, lido da consulta
      // vinculada. O alvo é o outro papel, e nada aqui age sobre ele.
      papel: encontrada.papelDoChamador,
      motivo,
      detalhe: detalhe === undefined || detalhe.trim() === '' ? null : detalhe,
      agora: this.deps.clock.now(),
    });
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...comoOrigem(chamador),
      action: 'conversation.reported',
      resourceKind: 'conversation',
      resourceId: conversa,
      // O MOTIVO, nunca o texto: a trilha sobrevive à exclusão da conta.
      metadata: { reason: motivo, reporter_role: encontrada.papelDoChamador },
    });
  }

  /**
   * O alvo da denúncia, para a dimensão `report_target` do teto: o par
   * (conversa, papel denunciado).
   *
   * **É o papel OPOSTO ao do chamador**, e é essa a dimensão que pega a denúncia
   * em laço — muitos denunciantes contra o mesmo alvo, que é o ataque do
   * concorrente. Usar o papel de quem denuncia inverteria a contramedida: ela
   * passaria a contar quantas vezes a VÍTIMA denunciou.
   *
   * `undefined` quando a conversa não é do chamador, e aí o teto não conta
   * ninguém: a recusa dele é o 404 do handler, e não um 429 que esconderia o
   * motivo verdadeiro.
   */
  async alvoDaDenuncia(
    conversa: ConversationId,
    chamador: Chamador,
  ): Promise<string | undefined> {
    const encontrada = await this.deps.repositorio.buscarDoChamador(conversa, chamador.userId);
    if (encontrada === undefined) return undefined;
    return `${conversa}:${encontrada.papelDoChamador === 'tutor' ? 'finder' : 'tutor'}`;
  }

  /** A conversa do chamador, ou 404. Nunca 403 (ADR-0021). */
  private async exigirDoChamador(
    conversa: ConversationId,
    chamador: Chamador,
  ): Promise<ConversaDoChamador> {
    const encontrada = await this.deps.repositorio.buscarDoChamador(conversa, chamador.userId);
    if (encontrada === undefined) throw problemas.naoEncontrado();
    return encontrada;
  }

  /** A mensagem de abertura, com o recado já redigido (critério 2). */
  private async gravarAbertura(
    conversa: ConversationId,
    aviso: AvisoRegistrado,
    agora: Instant,
  ): Promise<void> {
    const dados: DadosDoAviso = {
      nomeDoPet: aviso.nomeDoPet,
      escaneadoEm: comoData(aviso.escaneadoEm),
      agora: comoData(agora),
      rotuloDaArea: aviso.rotuloDaArea,
      recado: aviso.recado,
    };
    const mensagem = primeiraMensagemDoSistema(dados);
    await this.deps.repositorio.gravarMensagemDeSistema({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      body: mensagem.texto,
      redactions: mensagem.retirados,
      // ESTA É A MENSAGEM QUE NÃO PODE SUMIR DO CONTADOR. Ela carrega o recado
      // de quem está com o animal na mão, e é a razão de a exceção existir.
      especie: aviso.especie,
    });
  }

  /**
   * Os dois tetos de `hold_for_review`, que a borda declara não aplicar.
   *
   * Ela está certa em não aplicar: `hold_for_review` não é recusa, e
   * `counts: distinct_cases` conta casos, que a porta `RateLimitStore` não sabe
   * contar. O que ela não pode é ficar calada, e não fica —
   * `inventariarNaoAplicaveis` devolve as duas entradas com o motivo e a subida
   * imprime a lista. É este método que as torna verdade.
   */
  private async avaliarRetencao(
    conversa: ConversationId,
    encontrada: ConversaDoChamador,
    chamador: Chamador,
  ): Promise<void> {
    const agora = this.deps.clock.now();
    const desde = (agora - VINTE_E_QUATRO_HORAS_EM_MS) as Instant;

    const [mensagens, casos] = await Promise.all([
      this.deps.repositorio.contarMensagensDoParticipante(
        conversa,
        encontrada.papelDoChamador,
        desde,
      ),
      this.deps.repositorio.contarCasosDistintosDaConta(chamador.userId, desde),
    ]);

    const motivo = retencaoDestaMensagem({
      mensagensDoParticipante: mensagens,
      casosDistintosDaConta: casos,
    });
    if (motivo === null) return;

    await this.deps.repositorio.reterParaRevisao(conversa, motivo, agora);
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...(chamador.correlationId === undefined
        ? {}
        : { correlationId: chamador.correlationId }),
      ...(chamador.ip === undefined ? {} : { actorIp: chamador.ip }),
      action: 'conversation.held_for_review',
      resourceKind: 'conversation',
      resourceId: conversa,
      // O motivo, nunca o texto. A trilha sobrevive à exclusão da conta.
      metadata: { reason: motivo },
    });
  }

  /**
   * A conversa na forma que sai do servidor, campo a campo.
   *
   * Lista explícita e não espalhamento do objeto do repositório: `tutor_user_id`
   * e `held_for_review_at` existem do lado de dentro, e um `...conversa` os
   * publicaria por omissão — o primeiro fere o item 6 do ADR-0010, o segundo
   * avisa o golpista de que ele foi marcado.
   */
  private comoVisivel(
    conversa: ConversaDoChamador,
    mensagens: readonly MensagemGravada[],
    nextCursor: string | null,
  ): ConversaVisivel {
    return {
      id: conversa.id,
      foundReportId: conversa.foundReportId,
      fotoAlcancaOutroLado: fotoAlcancaOutroLado(conversa),
      caseId: conversa.caseId,
      petDisplayName: conversa.petDisplayName,
      status: estadoDaConversa(sinaisDe(conversa)),
      participants: participantesVisiveis({
        nomeDoTutor: conversa.nomeDoTutor,
        nomeDoAchador: conversa.nomeDoAchador,
        tutorDesabilitado: conversa.tutorDesabilitado,
        achadorDesabilitado: conversa.achadorDesabilitado,
        // O LADO DE QUEM CHAMA sai da CONSULTA (`papel_do_chamador`), e nunca
        // de uma comparacao aqui: o id do chamador nao volta para a aplicacao,
        // e um `if` daqui poderia discordar do `WHERE`.
        papelDoChamador: conversa.papelDoChamador,
        // JA RECORTADOS (emenda 3 do ADR-0010, 19/10/2026). O predicado de
        // conexao aceita mora no `WHERE` das subconsultas que produzem estes
        // dois campos (ADR-0021). **Nao ha `if` de conexao neste servico**, e a
        // ausencia e a regra: um segundo lugar decidindo a mesma coisa esconde
        // o que o primeiro deixou passar, e um `LeitorDeConexao` chamado por
        // conversa seriam dez idas ao banco por pagina da lista.
        apelidoDoOutro: conversa.apelidoDoOutro,
        chaveDaFotoDoOutro: conversa.chaveDaFotoDoOutro,
      }),
      messages: mensagens,
      nextCursor,
      naoLida: conversa.naoLida,
      // O CORTE ACONTECE AQUI, no caminho que as duas rotas atravessam, e não
      // no SQL: o teto é um número e ele mora num lugar só. `previaDaMensagem`
      // recebe o corpo COMO ESTÁ NO BANCO -- isto é, já redigido --, e por isso
      // a prévia não tem de onde desfazer a redação.
      previaDaUltima:
        conversa.corpoDaUltima === null ? null : previaDaMensagem(conversa.corpoDaUltima),
      ultimaMensagemEm: conversa.ultimaMensagemEm,
    };
  }

  /**
   * `POST /v1/me/conversations-seen` -- a conta VIU a área de mensagens.
   *
   * Zera o contador e **não marca conversa nenhuma como lida**. É um método de
   * uma linha e precisa continuar sendo: toda tentação de "aproveitar e marcar
   * as da página" cabe exatamente aqui, e seria o defeito que a regra proíbe --
   * o tutor abriria a área, veria o sino apagar, e perderia a marca de qual
   * conversa guarda o recado.
   */
  async marcarListaVista(chamador: Chamador): Promise<void> {
    await this.deps.repositorio.marcarListaVista(chamador.userId, this.deps.clock.now());
  }
}

function sinaisDe(conversa: ConversaDoChamador): SinaisDeEstado {
  return {
    encerradaEm: conversa.encerradaEm,
    bloqueadaEm: conversa.bloqueadaEm,
    casoEncerrado: conversa.casoEncerrado,
    // O PONTO ÚNICO DA TRAVA, lado com conta (17/10). `enviar` e `comoVisivel`
    // são os dois consumidores, e os dois passam por aqui: o `status` que a tela
    // lê e a recusa do `POST` saem do MESMO sinal, então não existe o arranjo em
    // que a tela diz "encerrada" e a rota aceita, nem o inverso.
    //
    // `||` e não `&&`: basta UM lado ter saído. Ver o comentário de
    // `SinaisDeEstado.participanteDesabilitado` -- "não receber mensagem nova"
    // só existe se quem escreve também for travado.
    participanteDesabilitado: conversa.tutorDesabilitado || conversa.achadorDesabilitado,
  };
}

/**
 * O cursor da lista sai da CHAVE DA ORDEM, que é por onde ela ordena.
 *
 * `ultimaMensagemEm ?? abertaEm` é o `coalesce` do `ORDER BY`, repetido aqui
 * porque é aqui que a última linha entregue vira o endereço da próxima. **Os dois têm de ser a mesma expressão**: cursor
 * sobre `abertaEm` com a lista ordenada pela última mensagem pula e repete
 * linhas, e o sintoma aparece só na SEGUNDA página.
 */
function proximoDaLista(
  conversas: readonly ConversaDoChamador[],
  limite: number,
): string | null {
  if (conversas.length < limite) return null;
  const ultima = conversas[conversas.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({
    criadaEm: ultima.ultimaMensagemEm ?? ultima.abertaEm,
    id: ultima.id,
  });
}

/** Só há próxima página quando a atual encheu. Página curta é o fim da lista. */
function proximoCursor(mensagens: readonly MensagemGravada[], limite: number): string | null {
  if (mensagens.length < limite) return null;
  const ultima = mensagens[mensagens.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({ criadaEm: ultima.createdAt, id: ultima.id });
}

/** Correlação e IP, quando existem. Nunca vão para resposta nenhuma. */
function comoOrigem(chamador: Chamador): { correlationId?: string; actorIp?: string } {
  return {
    ...(chamador.correlationId === undefined ? {} : { correlationId: chamador.correlationId }),
    ...(chamador.ip === undefined ? {} : { actorIp: chamador.ip }),
  };
}
