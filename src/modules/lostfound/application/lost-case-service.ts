/**
 * As operações do caso de perdido.
 *
 * Quem está do outro lado: uma tutora em pânico, com o celular em 11%, que não
 * abre o app há quatro meses. Tudo neste arquivo é escrito contra esse retrato.
 *
 * Quatro regras atravessam o módulo:
 *
 * 1. **A abertura é conferida e ainda assim pode perder a corrida.** As duas
 *    coisas: a conferência dá a mensagem certa, e o índice único do banco dá a
 *    garantia. Só a conferência deixaria a janela entre ler e gravar, que é
 *    exatamente por onde a fila offline passa em rajada quando o sinal volta.
 * 2. **Coordenada não é obrigatória.** Área sozinha abre o caso; o que muda é o
 *    alcance, não a existência.
 * 3. **Caso de outro tutor responde 404**, nunca 403 — um 403 confirmaria que
 *    aquele pet está perdido a quem não deveria saber.
 * 4. **A resposta nunca traz coordenada.** Nem no corpo do dono: ele já sabe
 *    onde o pet dele sumiu, e o campo só existiria para vazar depois.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import {
  atingiuTetoDaConta,
  bloqueiosParaAbrirCaso,
  rotuloDaArea,
  temOndeSuficiente,
  type Bloqueio,
} from '../domain/abertura-do-caso.js';
import {
  alcanceDe,
  RAIO_DO_ALERTA_EM_METROS,
  type CentroDoAlcance,
  type EstadoDoAlcance,
} from '../domain/previa-do-alcance.js';
import { contagemDe, estadoInicialDoDisparo } from '../domain/disparo-do-alerta.js';
import type { AlcanceCalculado, AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { DisparoGravado, RegistroDeDisparos } from '../ports/registro-de-disparos.js';
import type { JobQueue } from '../../../shared/ports/index.js';
import type {
  CanalDoReencontro,
  CandidatoDecidido,
  CasoGravado,
  DecisaoDoCandidato,
  DesfechoDoCaso,
  LostCaseRepository,
} from '../ports/lost-case-repository.js';
import type {
  CaseId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

/**
 * Quem abre a conversa mediada quando o tutor **confirma** uma correspondência.
 *
 * Porta de um método só, declarada por quem a exige, e com a mesma forma da
 * `AberturaDeConversaPorAviso` do módulo de tags — de propósito: o outro lado é
 * `ConversationService.abrirPorAviso`, que é indiferente à origem do achado, e
 * duas formas diferentes para a mesma abertura seriam duas verdades sobre a
 * primeira mensagem do sistema.
 *
 * A assimetria com o caminho da plaquinha está na seção 20.5 do backlog e é
 * deliberada: **o aviso do QR abre a conversa ao ser registrado; o achado avulso
 * abre no portão da decisão humana.** Quem escaneia a plaquinha está com o
 * animal identificado na mão; quem registra um achado avulso ainda é um palpite
 * do cruzamento, e abrir o canal antes da confirmação entregaria o tutor ao
 * falso achador — que é exatamente o que o critério 20 da BICHUS-86 proíbe.
 */
export interface AberturaDeConversaPorCorrespondencia {
  aoConfirmarCorrespondencia(aviso: {
    readonly foundReportId: FoundReportId;
    readonly petId: PetId;
    readonly nomeDoPet: string;
    readonly escaneadoEm: Instant;
    readonly rotuloDaArea: string | null;
    readonly recado: string | null;
    readonly achadorComConta: UserId | null;
    readonly avisoAnteriorId: FoundReportId | null;
  }): Promise<void>;
}

/**
 * BICHUS-66. O que a abertura de caso precisa dizer ao modulo de transferencia.
 *
 * Uma porta de UM metodo, e nao o servico inteiro: o que `lostfound` sabe e que
 * "este pet foi dado como perdido"; o que se faz com uma transferencia em curso
 * e decisao do outro modulo. Injetar `PetTransferService` aqui acoplaria os dois
 * pela implementacao e faria os testes de caso precisarem de um servico de
 * transferencia inteiro para abrir um caso.
 *
 * **Ela nao lanca, e a implementacao tem de honrar isso**: abrir o caso e a
 * coisa urgente, e uma falha ao cancelar um convite nao pode derrubar o alerta
 * de um animal na rua. A barreira que GARANTE nao e esta -- e a reconferencia
 * dentro da transacao que consumaria a transferencia.
 */
export interface AvisoDeCasoAberto {
  cancelarPorCasoAberto(pet: PetId): Promise<void>;
}

export interface DependenciasDeCasos {
  readonly repositorio: LostCaseRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  readonly alcance: AlcanceDoAlerta;
  readonly disparos: RegistroDeDisparos;
  /**
   * A fila. **A API enfileira e o worker envia** (ADR-0001, e a métrica de
   * arquitetura fala em "da abertura ao último push ENFILEIRADO, ≤ 60 s").
   *
   * Mandar 500 push dentro do `POST` que abre o caso faria a tutora em pânico
   * esperar o transporte responder 500 vezes antes de ver a tela do caso — no
   * exato minuto em que ela precisa do cartaz e do link.
   */
  readonly fila: JobQueue;
  /**
   * BICHUS-66. Avisado quando um caso abre, para que a transferencia viva
   * daquele pet caia em vez de consumar no meio da emergencia.
   */
  readonly transferencias: AvisoDeCasoAberto;
  /** BICHUS-86 critério 4. Confirmar abre a conversa; rejeitar não a abre. */
  readonly conversaDaCorrespondencia: AberturaDeConversaPorCorrespondencia;
}

/**
 * O caso e o estado do alerta dele, juntos.
 *
 * Juntos porque a resposta do contrato traz `alert` em toda leitura de caso
 * (`LostCase.alert` é obrigatório), e porque montar aquele objeto a partir de
 * `hasLocation` — que foi o que esta camada fez enquanto não havia tabela de
 * disparo — deixou de ser verdade no instante em que o worker passou a gravar
 * o número real. Uma tela que continuasse dizendo `queued` depois de o alerta
 * ter saído para 87 pessoas seria falsa de um jeito que nada acusaria.
 */
export interface CasoComAlerta {
  readonly caso: CasoGravado;
  /** `null` só enquanto a linha do disparo não existir (casos abertos antes desta história). */
  readonly alerta: DisparoGravado | null;
}

/** `LostCaseReachPreview`, ainda em vocabulário de domínio. */
export interface PreviaDoCaso {
  readonly estadoDoAlcance: EstadoDoAlcance;
  readonly tutoresAlcancaveis: number | null;
  readonly raioEmMetros: number;
  readonly rotuloDaArea: string | null;
  readonly bloqueios: readonly Bloqueio[];
}

export interface EntradaDoCaso {
  /**
   * Já em milissegundos. A conversão de ISO para instante acontece na BORDA,
   * e não aqui: a camada de aplicação não constrói `Date` (regra do relógio
   * injetável), e uma data malformada precisa virar `validation-failed` com o
   * nome do campo antes de chegar a esta função.
   */
  readonly lastSeenAt: Instant;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
  readonly description?: string | undefined;
  readonly shareToPublicList?: boolean | undefined;
}

export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

/** O bloqueio vira o problema que a tela sabe explicar. */
function problemaDoBloqueio(bloqueio: Bloqueio): ReturnType<typeof problemas.naoEncontrado> {
  switch (bloqueio) {
    case 'contact_channel_unverified':
      return problemas.canalDeContatoNaoVerificado();
    case 'pet_photo_missing':
      return problemas.petSemFoto();
    case 'pet_already_lost':
      return problemas.petJaEstaPerdido();
  }
}

export class LostCaseService {
  constructor(private readonly deps: DependenciasDeCasos) {}

  async abrir(
    pet: PetId,
    entrada: EntradaDoCaso,
    chamador: ContextoDoChamador,
  ): Promise<CasoComAlerta> {
    const estado = await this.deps.repositorio.estadoParaAbertura(pet, chamador.userId);
    // Pet inexistente e pet de outro tutor são a mesma resposta.
    if (!estado.existeEhDoTutor) throw problemas.naoEncontrado();

    // O teto da conta vem ANTES dos bloqueios do pet: ele é o único que não se
    // resolve mexendo neste pet, e mandar a pessoa verificar o e-mail para
    // depois descobrir que o teto barrou é uma ida à caixa de entrada à toa.
    if (atingiuTetoDaConta(estado)) throw problemas.tetoDeCasosAbertos();

    const bloqueios = bloqueiosParaAbrirCaso(estado);
    if (bloqueios.length > 0) throw problemaDoBloqueio(bloqueios[0]!);

    const onde = {
      lat: entrada.lat,
      lon: entrada.lon,
      city: entrada.city,
      neighborhood: entrada.neighborhood,
      state: entrada.state,
    };
    if (!temOndeSuficiente(onde)) {
      // Sem ponto e sem cidade o caso não apareceria no alerta NEM na lista
      // pública: um caso invisível, que a pessoa acha que abriu.
      throw problemas.validacao([
        {
          field: 'last_seen_area',
          code: 'required',
          message: 'Precisamos do bairro para avisar quem está por perto.',
        },
      ]);
    }

    const caso = await this.deps.repositorio.abrir({
      id: this.deps.ids.uuidv7() as CaseId,
      petId: pet,
      ownerUserId: chamador.userId,
      lastSeenAt: entrada.lastSeenAt,
      lat: entrada.lat,
      lon: entrada.lon,
      city: entrada.city,
      neighborhood: entrada.neighborhood,
      state: entrada.state,
      description: entrada.description,
      // Critério 10: o padrão é VERDADEIRO. Quem abre um caso está pedindo
      // alcance, e perguntar isso a quem está em pânico é uma decisão a mais no
      // pior momento.
      shareToPublicList: entrada.shareToPublicList ?? true,
      shareToken: this.deps.ids.opaqueToken(),
    });

    // `null` é a corrida perdida para o índice único: outra requisição abriu o
    // caso entre a conferência e a gravação. A resposta é a verdade.
    if (caso === null) throw problemas.petJaEstaPerdido();

    // BICHUS-66. O PET ACABOU DE SER DADO COMO PERDIDO, E ISSO DERRUBA UMA
    // TRANSFERENCIA EM CURSO.
    //
    // A assimetria decide: consumar com caso aberto revogaria TODAS as tags do
    // pet (ADR-0004, irreversivel) no minuto em que um estranho pode estar com o
    // animal no colo lendo o QR da coleira -- e ele chegaria a um beco sem
    // saida. Cancelar a transferencia custa ao tutor refazer o convite depois do
    // reencontro. O contrato ja tinha escolhido esse lado na direcao inversa:
    // `startPetTransfer` responde 409 para pet com caso aberto.
    //
    // Fica DEPOIS da abertura de proposito. Cancelar antes e ver a abertura
    // falhar por corrida no indice unico deixaria o tutor sem caso E sem
    // transferencia, que e o pior dos tres desfechos.
    await this.deps.transferencias.cancelarPorCasoAberto(pet);

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.opened',
      resourceKind: 'lost_case',
      resourceId: caso.id,
      // SEM coordenada no metadado. A trilha não guarda coordenada bruta
      // (docs/04-seguranca.md 9), e `has_location` responde o que importa
      // para investigar depois: houve alerta ou não.
      metadata: { has_location: caso.hasLocation, shared: caso.shareToPublicList },
    });

    return { caso, alerta: await this.pedirOAlerta(caso) };
  }

  /**
   * Registra o disparo e o enfileira — ou registra por que ele não vai existir.
   *
   * **O caso já está gravado quando esta função roda, e é isso que a torna
   * segura.** O critério 6 da BICHUS-20 é explícito: *"o caso é criado mesmo
   * assim; o caso nunca se perde por falha de push"*. Se a fila estiver fora do
   * ar, o que se perde é o alerta, e o tutor continua com o caso, o cartaz, o
   * link e a tag.
   *
   * Sem coordenada, o disparo nasce `no_location` e **não é enfileirado**:
   * critério 14 da BICHUS-18, que é explícito em dizer que isso não é falha de
   * envio e não gera retentativa. Enfileirar para depois descobrir que não há
   * centro produziria uma tentativa fracassada onde não havia o que tentar.
   */
  private async pedirOAlerta(caso: CasoGravado): Promise<DisparoGravado> {
    const disparo = await this.deps.disparos.abrir({
      id: this.deps.ids.uuidv7(),
      caso: caso.id,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      estado: estadoInicialDoDisparo(caso.hasLocation),
      pedidoEm: this.deps.clock.now(),
    });

    if (disparo.estado === 'queued') {
      // Só o identificador do caso. A regra do payload da fila (§11.5) é
      // "carrega identificador, nunca conteúdo renderizado": o nome do pet e o
      // bairro são lidos pelo worker no instante do envio, e enfileirados aqui
      // eles congelariam o que a tutora corrigir nos próximos cinco minutos.
      await this.deps.fila.enqueue('alert.dispatch', { caseId: caso.id });
    }

    return disparo;
  }

  /**
   * A prévia do alcance, ANTES de abrir o caso (F3.2).
   *
   * Três coisas que decidem o desenho desta função, na ordem em que importam:
   *
   * 1. **Pet que não é do chamador responde 404**, e a decisão vem da ADR-0021 —
   *    não do corpo da BICHUS-21, cujo critério 12 diz 403. A divergência é
   *    conhecida e está resolvida a favor da ADR: aqui um 403 confirmaria a
   *    existência de um pet alheio, e a rota viraria oráculo de enumeração de
   *    UUID para qualquer pessoa com cadastro. A conferência é a leitura do
   *    `existeEhDoTutor` que já veio VINCULADO da consulta, e não um `if` sobre
   *    um pet que a consulta tenha devolvido sem vínculo.
   * 2. **Bloqueio não é erro.** A abertura lança `problemaDoBloqueio`; a prévia
   *    devolve os três em lista, e responde 200. É o que faz a folha de bloqueio
   *    ter o texto certo sem uma segunda chamada, e é literalmente o que o
   *    contrato declara em `blockers`.
   * 3. **Nada aqui inventa número.** `alcanceDe` só produz `computed` quando a
   *    porta devolveu um inteiro; `null` vira `unavailable` e ausência de centro
   *    vira `no_location`.
   *
   * O teto de casos abertos por conta NÃO é consultado aqui, e a ausência é
   * deliberada: ele não está entre os três `blockers` do contrato, e acrescentá-lo
   * faria a resposta entregar mais do que o documento declara — que é o defeito
   * que nenhum portão de contrato pega.
   */
  async previa(
    pet: PetId,
    centro: CentroDoAlcance | undefined,
    chamador: ContextoDoChamador,
  ): Promise<PreviaDoCaso> {
    const estado = await this.deps.repositorio.estadoParaPrevia(pet, chamador.userId);
    if (!estado.existeEhDoTutor) throw problemas.naoEncontrado();

    // `contagemDe` sobre o MESMO objeto que o disparo vai percorrer. Não há
    // `COUNT(*)` nesta rota, e a ausência é o critério 9 da BICHUS-20: o número
    // da tela é o número real de destinatários. Uma contagem própria aqui
    // divergiria da lista no dia em que alguém acrescentasse um critério a uma
    // e esquecesse a outra, e nenhum teste acusaria.
    const contagem = centro === undefined ? null : contagemDe(await this.calcular(centro, chamador));

    const alcance = alcanceDe(centro, contagem);

    return {
      estadoDoAlcance: alcance.estado,
      tutoresAlcancaveis: alcance.tutoresAlcancaveis,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      // Com centro o rótulo é `null`: não há geocodificação no MVP (ADR-0006),
      // então nomear o ponto onde o pet sumiu com o bairro de casa do tutor
      // seria uma mentira de aparência plausível — e a tela a exibiria com a
      // confiança de um dado do servidor.
      rotuloDaArea: centro === undefined ? rotuloDaArea(estado.areaDeReferenciaDoTutor) : null,
      bloqueios: bloqueiosParaAbrirCaso(estado),
    };
  }

  async buscar(caso: CaseId, chamador: ContextoDoChamador): Promise<CasoComAlerta> {
    const achado = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
    if (achado === null) throw problemas.naoEncontrado();
    // A leitura do alerta vem DEPOIS da conferência do dono, e não junto: ela
    // é por `case_id` e não carrega o dono no `WHERE`, então fazê-la antes
    // devolveria o estado do alerta de um caso alheio a quem pediu por
    // identificador. O 404 do ADR-0021 acontece primeiro.
    return { caso: achado, alerta: await this.deps.disparos.ultimoDoCaso(achado.id) };
  }

  async encerrar(
    caso: CaseId,
    desfecho: DesfechoDoCaso,
    canal: CanalDoReencontro | undefined,
    nota: string | undefined,
    chamador: ContextoDoChamador,
  ): Promise<CasoComAlerta> {
    const encerrado = await this.deps.repositorio.encerrar({
      caso,
      dono: chamador.userId,
      desfecho,
      // O canal só faz sentido com reencontro: é ele que torna a métrica
      // atribuível. Preenchê-lo nos outros desfechos sujaria a conta.
      canal: desfecho === 'reunited' ? canal : undefined,
      nota,
      agora: this.deps.clock.now(),
    });

    // `null` cobre não existe, não é seu, e já estava encerrado. O terceiro é o
    // que a fila offline produz, e o segundo encerramento sobrescreveria o
    // desfecho do primeiro.
    if (encerrado === null) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      action: 'lost_case.closed',
      resourceKind: 'lost_case',
      resourceId: encerrado.id,
      metadata: { outcome: desfecho, channel: encerrado.closureChannel },
    });

    return { caso: encerrado, alerta: await this.deps.disparos.ultimoDoCaso(encerrado.id) };
  }

  /**
   * `POST /v1/lost-cases/{caseId}/candidates/{candidateId}/decision`.
   *
   * O fecho da BICHUS-86: o cruzamento sugere, e é aqui que uma pessoa afirma.
   *
   * **Três coisas acontecem, e a ordem entre elas é a regra.**
   *
   * 1. A escrita da decisão carrega a autorização na própria cláusula `WHERE`
   *    (`lost_cases.owner_user_id = :dono`). Nada é lido antes para comparar
   *    depois, então não existe o caminho em que a linha de outro tutor chega a
   *    esta camada.
   * 2. **Só `confirmed` abre a conversa.** `rejected` não abre nada, não avisa
   *    ninguém e não é reversível — a seção 4.10 de `docs/03-arquitetura.md` e o
   *    critério 12 da BICHUS-86 dizem a mesma frase, *"rejeitado não volta"*, e
   *    quem a cumpre é o predicado `status = 'suggested'` da escrita mais o
   *    filtro `m.status = 'rejected'` do cruzamento, que a partir desta
   *    operação passa a ter o que eliminar.
   * 3. A trilha registra as duas decisões, e não só a confirmação. Uma rejeição
   *    é irreversível: ela precisa ter autor e instante em lugar auditável, que
   *    é a mesma razão de `match_candidates_decisao_tem_autor` existir.
   *
   * **O reenvio da fila offline devolve 200, e não 404.** O critério 7 põe a
   * confirmação numa fila quando falta conexão, e fila reenvia: a segunda
   * chamada não encontra mais o candidato em `suggested`, e sem a leitura de
   * `candidatoDecididoDoTutor` ela responderia "não encontramos isso" logo
   * depois de a ação ter dado certo. Mudar de ideia é outra coisa, e continua
   * recusada: só o reenvio da **mesma** decisão passa.
   */
  async decidirCandidato(
    caso: CaseId,
    candidato: string,
    decisao: DecisaoDoCandidato,
    chamador: ContextoDoChamador,
  ): Promise<CandidatoDecidido> {
    const decidido = await this.deps.repositorio.decidirCandidato({
      caso,
      candidato,
      dono: chamador.userId,
      decisao,
      agora: this.deps.clock.now(),
    });

    if (decidido === null) return this.reenvioDaFila(caso, candidato, decisao, chamador);

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      actorIp: chamador.ip,
      correlationId: chamador.correlationId,
      // A ação é UMA, e a decisão é metadado. Duas ações diriam a mesma coisa
      // com dois vocabulários, e a consulta "o que aconteceu com este
      // candidato" passaria a depender de lembrar dos dois nomes.
      action: 'match.candidate_decided',
      resourceKind: 'match_candidate',
      resourceId: decidido.id,
      metadata: {
        case_id: decidido.caseId,
        decision: decisao,
        link_origin: decidido.linkOrigin,
      },
    });

    // **A ÚNICA porta entre a decisão e a conversa.** Fora do `if`, rejeitar
    // abriria o canal com quem o tutor acabou de dizer que não é quem achou o
    // pet dele.
    if (decisao === 'confirmed') {
      await this.deps.conversaDaCorrespondencia.aoConfirmarCorrespondencia({
        foundReportId: decidido.foundReportId,
        // O pet vem do CASO que casou, porque o achado avulso não tem `pet_id`.
        petId: decidido.petId,
        nomeDoPet: decidido.nomeDoPet,
        // Para um achado não existe escaneamento: o instante da primeira
        // mensagem do sistema é quando o animal foi visto.
        escaneadoEm: decidido.achado.achadoEm.getTime() as Instant,
        rotuloDaArea: rotuloDaArea({
          city: decidido.achado.cidade ?? undefined,
          neighborhood: decidido.achado.bairro ?? undefined,
        }),
        recado: decidido.achado.observacao,
        achadorComConta: decidido.relatorUserId,
        // Achado avulso não agrupa: o agrupamento é do achador anônimo que
        // escaneia duas plaquinhas, e este caminho exige conta.
        avisoAnteriorId: null,
      });
    }

    return decidido;
  }

  /**
   * O reenvio da mesma decisão, e só dele.
   *
   * Decisão diferente da que está gravada cai no mesmo 404 de tudo o mais: a
   * decisão pendente que a requisição pede não existe mais. Não há caminho de
   * "mudar de ideia" nesta operação, e a ausência é a regra, não um vazio.
   */
  private async reenvioDaFila(
    caso: CaseId,
    candidato: string,
    decisao: DecisaoDoCandidato,
    chamador: ContextoDoChamador,
  ): Promise<CandidatoDecidido> {
    const jaDecidido = await this.deps.repositorio.candidatoDecididoDoTutor(
      caso,
      candidato,
      chamador.userId,
    );
    if (jaDecidido === null || jaDecidido.status !== decisao) throw problemas.naoEncontrado();
    return jaDecidido;
  }

  /**
   * O alcance da prévia, com a falha traduzida em `null`.
   *
   * O `catch` é aqui porque é esta camada que conhece a diferença entre "o
   * banco não respondeu" e "não há ninguém por perto", e porque a consulta
   * deliberadamente não engole exceção (ver o cabeçalho dela). `null` vira
   * `unavailable`, que é a regra do ADR-0006 em uma frase: *"falha de cálculo
   * não vira zero"*. Um `0` aqui faria desistir quem tinha cem vizinhos ao
   * redor.
   */
  private async calcular(
    centro: CentroDoAlcance,
    chamador: ContextoDoChamador,
  ): Promise<AlcanceCalculado | null> {
    try {
      return await this.deps.alcance.alcancaveis({
        centro,
        raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
        excluir: chamador.userId,
        agora: this.deps.clock.now(),
      });
    } catch (erro: unknown) {
      // O erro não some: ele sai no log com a correlação da requisição, e a
      // tela diz que não conseguiu calcular. Engolir sem registrar
      // transformaria um defeito de esquema num `unavailable` que ninguém
      // procura — a verificação que não consegue verificar e mesmo assim não
      // reprova.
      console.error(
        JSON.stringify({
          evento: 'lost_case.reach_failed',
          correlation_id: chamador.correlationId,
          erro: String(erro),
        }),
      );
      return null;
    }
  }
}
