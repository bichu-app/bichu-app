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
import type { AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type {
  CanalDoReencontro,
  CasoGravado,
  DesfechoDoCaso,
  LostCaseRepository,
} from '../ports/lost-case-repository.js';
import type { CaseId, Instant, PetId, UserId } from '../../../shared/types/brands.js';

export interface DependenciasDeCasos {
  readonly repositorio: LostCaseRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  readonly alcance: AlcanceDoAlerta;
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
  ): Promise<CasoGravado> {
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

    return caso;
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

    const contagem =
      centro === undefined
        ? null
        : await this.deps.alcance.contarAlcancaveis(
            centro,
            RAIO_DO_ALERTA_EM_METROS,
            chamador.userId,
          );

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

  async buscar(caso: CaseId, chamador: ContextoDoChamador): Promise<CasoGravado> {
    const achado = await this.deps.repositorio.buscarDoTutor(caso, chamador.userId);
    if (achado === null) throw problemas.naoEncontrado();
    return achado;
  }

  async encerrar(
    caso: CaseId,
    desfecho: DesfechoDoCaso,
    canal: CanalDoReencontro | undefined,
    nota: string | undefined,
    chamador: ContextoDoChamador,
  ): Promise<CasoGravado> {
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

    return encerrado;
  }
}
