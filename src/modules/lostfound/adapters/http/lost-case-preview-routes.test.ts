/**
 * `GET /pets/:petId/lost-case-preview` sobre um Fastify de verdade (BICHUS-202).
 *
 * A rota estava **declarada no contrato, no tipo gerado e no inventário do
 * Cypress, e não existia em `src/`**. Este arquivo é a metade que faltava do par
 * declaração/implementação, e ele sobe o servidor em vez de chamar o handler
 * porque três das quatro coisas que a rota promete só existem com o Fastify no
 * caminho: o 429 do teto (que é um gancho `onRequest`, não um `if` do handler),
 * o `application/problem+json` do 404 e a serialização real da resposta — que é
 * onde um UUID vazaria.
 *
 * ## As iscas deste arquivo
 *
 * Nenhuma afirmação aqui vale por confiança: cada mecanismo foi **desligado no
 * código de produção, rodado e visto reprovar** em 22/09/2026, e depois
 * restaurado com o SHA-256 conferido contra a cópia anterior
 * (`lost-case-routes.ts` = `bdf52c37…5ebbd`, `lost-case-service.ts` =
 * `b3104966…b729c`). O que cada desligamento derrubou:
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | a conferência de `existeEhDoTutor` (autorização some) | 4 casos |
 * | `naoEncontrado()` virando `semPermissao()` (403 no lugar de 404) | 4 casos |
 * | `pet_id` acrescentado ao montador da resposta | 3 casos |
 * | `rateLimit` removido da declaração da rota | **não compila** |
 * | dimensão `pet` declarada sem resolvedor | **não compila** |
 * | `app.get` direto, fora de `registrarRota` | o portão de registro reprova, nomeando arquivo e linha |
 * | `deny_429` virando `log_and_alert` (teto declarado que não recusa) | 3 casos |
 *
 * As duas últimas linhas da tabela são a razão de a terceira isca ser
 * **automática**, marcada com `ISCA` no nome: o mesmo caminho com
 * `criarContadorDesligado()` precisa deixar a 31ª passar, e é isso que prova
 * que o caso acima mede limite, e não a capacidade de contar até 31.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { AbsoluteUrl, CaseId, PetId, UserId } from '../../../../shared/types/brands.js';
import type { AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../../shared/ports/index.js';
import { LostCaseService } from '../../application/lost-case-service.js';
import type { AlcanceDoAlerta } from '../../ports/alcance-do-alerta.js';
import type { RegistroDeDisparos } from '../../ports/registro-de-disparos.js';
import type {
  CasoGravado,
  EstadoDoPetParaAbertura,
  EstadoDoPetParaPrevia,
  LostCaseRepository,
} from '../../ports/lost-case-repository.js';
import { registrarRotasDeCasos, rotaDePreviaDoCaso } from './lost-case-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DA_WEB = 'https://bichu.test' as AbsoluteUrl;

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
/** O pet é do `DONO`. O `OUTRO_TUTOR` sabe o UUID dele e tenta mesmo assim. */
const PET_DO_DONO = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
/** Não é de ninguém. O 404 dele precisa ser indistinguível do 404 do pet alheio. */
const PET_INEXISTENTE = '018f3a2b-0000-7000-8000-0000000000dd' as PetId;

/** O token é o próprio UUID do chamador: o autenticador deste arquivo é trivial. */
function comoToken(userId: UserId): string {
  return `Bearer ${userId}`;
}

interface Cenario {
  /** O que `AlcanceDoAlerta` responde. `null` = não foi possível contar. */
  readonly contagem?: number | null;
  readonly temFotoPronta?: boolean;
  readonly temCanalVerificado?: boolean;
  readonly petJaTemCasoAberto?: boolean;
  readonly areaDeReferencia?: { city?: string; neighborhood?: string };
  readonly contador?: RateLimitStore;
  /**
   * **A isca da autorização.** Com `true`, o dobre do repositório para de olhar
   * o dono — é o equivalente exato de tirar `owner_user_id = :dono` da cláusula
   * `WHERE` e conferir depois, que é o arranjo que o ADR-0021 elimina.
   */
  readonly autorizacaoDesligada?: boolean;
  /** O caso que `buscarDoTutor` devolve ao DONO. Sem ele, a leitura é 404. */
  readonly casoDoDono?: CasoGravado;
}

/**
 * O repositório, com a autorização **dentro da consulta**.
 *
 * `existeEhDoTutor` é falso para qualquer chamador que não seja o dono, e essa
 * é a única coisa que o serviço recebe: ele não tem como saber se o pet existe e
 * é de outra pessoa, ou se não existe. Os dois casos chegam idênticos, que é o
 * que faz o 404 ser estrutural em vez de lembrado.
 */
function repositorio(cenario: Cenario): LostCaseRepository {
  const naoUsado = (): never => {
    throw new Error('A prévia não escreve nem lê caso: este método não devia ser chamado.');
  };

  const estadoBase = (dono: UserId): EstadoDoPetParaAbertura => ({
    existeEhDoTutor: cenario.autorizacaoDesligada === true ? true : dono === DONO,
    temFotoPronta: cenario.temFotoPronta ?? true,
    petJaTemCasoAberto: cenario.petJaTemCasoAberto ?? false,
    casosAbertosDaConta: 0,
    temCanalVerificado: cenario.temCanalVerificado ?? true,
  });

  return {
    estadoParaAbertura: (_pet, dono) => Promise.resolve(estadoBase(dono)),
    estadoParaPrevia: (_pet, dono): Promise<EstadoDoPetParaPrevia> =>
      Promise.resolve({
        ...estadoBase(dono),
        areaDeReferenciaDoTutor: {
          city: cenario.areaDeReferencia?.city,
          neighborhood: cenario.areaDeReferencia?.neighborhood,
        },
      }),
    abrir: naoUsado,
    buscarDoTutor: (_caso, dono): Promise<CasoGravado | null> =>
      Promise.resolve(dono === DONO ? (cenario.casoDoDono ?? null) : null),
    encerrar: (): Promise<CasoGravado | null> => Promise.resolve(null),
    decidirCandidato: naoUsado,
    candidatoDecididoDoTutor: naoUsado,
  };
}

/**
 * `n` destinatários, com um aparelho cada.
 *
 * Os identificadores não importam para esta rota — ela só conta — e é
 * exatamente por isso que eles existem: se a prévia algum dia começar a olhar
 * para dentro da lista, é aqui que o teste vai precisar mudar, e a mudança vai
 * aparecer na revisão.
 */
function destinatariosDeTeste(n: number): { usuario: UserId; aparelhos: string[] }[] {
  return Array.from({ length: n }, (_, i) => ({
    usuario: `018f3a2b-0000-7000-8000-${String(i).padStart(12, '0')}` as UserId,
    aparelhos: [`018f3a2b-0000-7000-8000-a${String(i).padStart(11, '0')}`],
  }));
}

/** O registro de disparos, em memória. A prévia não escreve nada nele. */
function disparosDeTeste(): RegistroDeDisparos {
  return {
    abrir: (entrada) =>
      Promise.resolve({
        id: entrada.id,
        caso: entrada.caso,
        estado: entrada.estado,
        destinatarios: null,
        raioEmMetros: entrada.raioEmMetros,
        tetoAtingido: false,
        pedidoEm: new Date(Number(entrada.pedidoEm)),
        enviadoEm: null,
      }),
    ultimoDoCaso: () => Promise.resolve(null),
    ultimoEnvioDoCaso: () => Promise.resolve(null),
    contextoDoCaso: () => Promise.resolve(null),
    concluir: () => Promise.resolve(),
  };
}

/** A fila, em memória. */
function filaDeTeste(): JobQueue {
  return {
    enqueue: () => Promise.resolve('018f3a2b-0000-7000-8000-00000000f11a'),
    claim: () => Promise.resolve([]),
    // Este teste nao exercita a fila; a varredura de orfaos entra na porta
    // porque o tipo a exige, e devolver lista vazia e o que um dublê honesto
    // faz -- inventar orfao aqui seria o dublê contando uma historia propria.
    recuperarOrfaos: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });

  // `contagem` vira uma LISTA de destinatários, e não um número: a porta não
  // tem mais como devolver "quantos" sem devolver "quem", e o dublê precisa
  // obedecer à mesma regra que a implementação real — senão ele testa uma porta
  // que não existe.
  const alcance: AlcanceDoAlerta = {
    alcancaveis: () =>
      Promise.resolve(
        cenario.contagem == null
          ? null
          : { destinatarios: destinatariosDeTeste(cenario.contagem), tetoAtingido: false },
      ),
  };
  const clock: Clock = { now: () => 1_800_000_000_000 as ReturnType<Clock['now']> };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: naoDeviaSerChamado,
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const trilha: AuditLog = { record: () => Promise.resolve() };

  registrarRotasDeCasos(app, {
    casos: new LostCaseService({
      repositorio: repositorio(cenario),
      ids,
      clock,
      trilha,
      alcance,
      disparos: disparosDeTeste(),
      fila: filaDeTeste(),
      // BICHUS-66. Esta bancada nao abre caso -- ela le a previa --, entao o
      // dublê nunca e chamado. Ele existe porque a porta e obrigatoria por
      // tipo, que e o que faz a fiacao de `api.ts` nao poder esquecer dela.
      transferencias: { cancelarPorCasoAberto: () => Promise.resolve() },
      conversaDaCorrespondencia: { aoConfirmarCorrespondencia: () => Promise.resolve() },
    }),
    autenticador: {
      autenticar: (token: string) => Promise.resolve({ userId: token as UserId }),
    },
    idempotencia: {
      reservar: () => Promise.resolve(undefined),
      concluir: () => Promise.resolve(),
      liberar: () => Promise.resolve(),
    },
    // O contrato DE VERDADE: é ele que decide o schema do corpo das outras rotas
    // deste registrador, e uma cópia aqui deixaria de acusar mudança na spec.
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    baseDaWeb: BASE_DA_WEB,
  });

  return app;
}

function naoDeviaSerChamado(): never {
  throw new Error('A prévia não gera identificador.');
}

const CAMINHO = `/pets/${PET_DO_DONO}/lost-case-preview`;

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { como?: UserId; consulta?: string } = {},
): Promise<{ status: number; corpo: Record<string, unknown>; bruto: string }> {
  const resposta = await app.inject({
    method: 'GET',
    url: `${CAMINHO}${opcoes.consulta ?? ''}`,
    headers: { authorization: comoToken(opcoes.como ?? DONO) },
  });
  return {
    status: resposta.statusCode,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
    bruto: resposta.body,
  };
}

/** O slug de `type` do Problem Details. É por ele que o cliente decide. */
function tipoDe(corpo: Record<string, unknown>): string | undefined {
  const { type } = corpo;
  return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
}

void describe('a rota existe e responde o que o contrato declara', () => {
  void it('o dono recebe 200 com os cinco campos de LostCaseReachPreview', async () => {
    const app = servidor({ areaDeReferencia: { neighborhood: 'Vila Madalena', city: 'São Paulo' } });
    const { status, corpo } = await pedir(app);
    await app.close();

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(corpo).sort(), [
      'area_label',
      'blockers',
      'radius_m',
      'reach_status',
      'reachable_tutors',
    ]);
    assert.equal(corpo['radius_m'], 5000);
  });

  void it('sem coordenada o estado é no_location, e NÃO zero tutores', async () => {
    const app = servidor();
    const { corpo } = await pedir(app);
    await app.close();

    assert.equal(corpo['reach_status'], 'no_location');
    // A asserção que importa: `0` aqui diria "não há ninguém por perto" quando a
    // verdade é "não há raio". São decisões opostas para quem está em pânico.
    assert.equal(corpo['reachable_tutors'], null);
    assert.notEqual(corpo['reachable_tutors'], 0);
  });

  void it('com coordenada e sem base para contar, o estado é unavailable', async () => {
    const app = servidor({ contagem: null });
    const { corpo } = await pedir(app, { consulta: '?lat=-23.56&lon=-46.68' });
    await app.close();

    assert.equal(corpo['reach_status'], 'unavailable');
    assert.equal(corpo['reachable_tutors'], null);
  });

  void it('com contagem de verdade o estado é computed, e zero é um zero honesto', async () => {
    const app = servidor({ contagem: 0 });
    const { corpo } = await pedir(app, { consulta: '?lat=-23.56&lon=-46.68' });
    await app.close();

    assert.equal(corpo['reach_status'], 'computed');
    assert.equal(corpo['reachable_tutors'], 0);
  });

  void it('os blockers são os três do contrato, e falta de coordenada não é um deles', async () => {
    const app = servidor({
      temCanalVerificado: false,
      temFotoPronta: false,
      petJaTemCasoAberto: true,
    });
    const { corpo } = await pedir(app);
    await app.close();

    assert.deepEqual(corpo['blockers'], [
      'contact_channel_unverified',
      'pet_photo_missing',
      'pet_already_lost',
    ]);
    // Critério 14 da BICHUS-20: `no_location` NÃO entra em `blockers`.
    assert.equal(corpo['reach_status'], 'no_location');
  });

  void it('meia coordenada é recusada com o campo que faltou, e não vira no_location', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, { consulta: '?lat=-23.56' });
    await app.close();

    assert.equal(status, 400);
    assert.equal(tipoDe(corpo), 'validation-failed');
  });

  void it('coordenada fora do Brasil é recusada antes da consulta cara', async () => {
    const app = servidor({ contagem: 7 });
    // Latitude e longitude trocadas de ordem: o erro mais comum de quem monta a
    // consulta à mão, e ele cai fora do retângulo declarado no contrato.
    const { status } = await pedir(app, { consulta: '?lat=-46.68&lon=-23.56' });
    await app.close();

    assert.equal(status, 400);
  });
});

void describe('ISCA 1 — autorização na cláusula WHERE, 404 e nunca 403 (ADR-0021)', () => {
  void it('pet de outro tutor responde 404, com o mesmo corpo de pet inexistente', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, { como: OUTRO_TUTOR });
    await app.close();

    assert.equal(status, 404);
    assert.equal(tipoDe(corpo), 'not-found');
  });

  void it('pet de outro tutor NÃO responde 403: um 403 confirmaria que o pet existe', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, { como: OUTRO_TUTOR });
    await app.close();

    // Escrito como duas negações separadas de propósito. O corpo da BICHUS-21,
    // critério 12, diz 403; a ADR-0021 diz 404 e é ela que vale. Se alguém
    // "corrigir" o código pela issue, este caso nomeia a divergência em vez de
    // deixar a mudança passar como ajuste de status.
    assert.notEqual(status, 403);
    assert.notEqual(tipoDe(corpo), 'forbidden');
  });

  void it('pet de outro tutor NÃO responde 200: a consulta nunca o alcança', async () => {
    const app = servidor();
    const { status } = await pedir(app, { como: OUTRO_TUTOR });
    await app.close();

    assert.notEqual(status, 200);
  });

  /**
   * A prova de que os três casos acima medem alguma coisa.
   *
   * Com `autorizacaoDesligada` o dobre do repositório responde sobre o pet sem
   * olhar o dono — o mesmo efeito de tirar `owner_user_id = :dono` do `WHERE` e
   * conferir depois. Os três casos acima passam a receber **200**, e reprovam.
   *
   * Conferido em 22/09/2026 rodando com a isca ligada de verdade no código de
   * produção: três casos reprovaram de uma vez.
   */
  void it('ISCA: com a autorização fora da consulta, o pet alheio responde 200', async () => {
    const app = servidor({ autorizacaoDesligada: true });
    const { status } = await pedir(app, { como: OUTRO_TUTOR });
    await app.close();

    assert.equal(
      status,
      200,
      'Se este caso deixar de dar 200, a isca parou de ligar o defeito — e os ' +
        'três casos acima passaram a poder passar sem autorização nenhuma.',
    );
  });
});

void describe('ISCA 2 — nenhum UUID interno na resposta (ADR-0010, itens 6 e 7)', () => {
  /**
   * Busca por FORMA e não por nome de campo.
   *
   * Um teste que procurasse `pet_id` continuaria verde no dia em que alguém
   * acrescentasse `case_id`, `owner_id` ou `photo_id`. O que esta expressão
   * procura é qualquer coisa com a cara de um UUID, em qualquer campo — inclusive
   * num campo que ainda não existe.
   */
  const FORMATO_DE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  void it('o corpo do 200 não contém nada com forma de UUID', async () => {
    const app = servidor({ contagem: 12, areaDeReferencia: { city: 'São Paulo' } });
    const { bruto } = await pedir(app, { consulta: '?lat=-23.56&lon=-46.68' });
    await app.close();

    assert.equal(
      FORMATO_DE_UUID.test(bruto),
      false,
      `A resposta carregou um identificador interno: ${bruto}`,
    );
  });

  /**
   * O corpo do 404 carrega DOIS valores com forma de UUID por desenho do
   * servidor, e nenhum deles é identificador interno: `correlation_id`, que é
   * gerado por requisição, e `instance`, que é o caminho que o próprio chamador
   * pediu. Procurar forma de UUID ali acusaria os dois e não acusaria vazamento
   * nenhum.
   *
   * O que o 404 precisa provar é outra coisa, e é a mais forte: ele é
   * **indistinguível** entre "o pet é de outra pessoa" e "o pet não existe". Um
   * corpo que diferisse nos dois casos seria o 403 de volta, escrito em prosa.
   */
  void it('o 404 do pet alheio é idêntico ao 404 do pet inexistente', async () => {
    const app = servidor();
    const alheio = await pedir(app, { como: OUTRO_TUTOR });
    const inexistente = await app.inject({
      method: 'GET',
      url: `/pets/${PET_INEXISTENTE}/lost-case-preview`,
      headers: { authorization: comoToken(OUTRO_TUTOR) },
    });
    await app.close();

    const semRastroDaRequisicao = (corpo: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(corpo).filter(([campo]) => campo !== 'correlation_id' && campo !== 'instance'),
      );

    assert.equal(inexistente.statusCode, 404);
    assert.deepEqual(
      semRastroDaRequisicao(alheio.corpo),
      semRastroDaRequisicao(JSON.parse(inexistente.body) as Record<string, unknown>),
    );
    // E o que sobra, fora a correlação e o caminho que o chamador mandou, não
    // tem nada com forma de UUID.
    assert.equal(FORMATO_DE_UUID.test(JSON.stringify(semRastroDaRequisicao(alheio.corpo))), false);
  });

  void it('a resposta não agrupa os pets do tutor nem conta os casos da conta', async () => {
    const app = servidor();
    const { corpo } = await pedir(app);
    await app.close();

    // O item 7 do ADR-0010 proíbe agrupar os pets de um tutor. O serviço tem
    // `casosAbertosDaConta` na mão e não o devolve: propriedade a MAIS não quebra
    // cliente nenhum, então nenhum portão de contrato a acusa, e é exatamente por
    // ali que a implementação se afasta do documento.
    assert.deepEqual(Object.keys(corpo).sort(), [
      'area_label',
      'blockers',
      'radius_m',
      'reach_status',
      'reachable_tutors',
    ]);
  });
});

void describe('ISCA 3 — o teto de chamada da rota vigora (BICHUS-178)', () => {
  /** O teto que o contrato declara para `previewLostCaseReach`, por conta. */
  const TETO_POR_CONTA = 30;

  async function statusAteEstourar(contador: RateLimitStore): Promise<number[]> {
    const app = servidor({ contador });
    const status: number[] = [];
    for (let i = 0; i < TETO_POR_CONTA + 1; i += 1) {
      const resposta = await app.inject({
        method: 'GET',
        url: CAMINHO,
        headers: { authorization: comoToken(DONO) },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('a rota declara os dois tetos do contrato, com os números dele', () => {
    // Os números vivem no contrato; este caso é o que impede alguém de afrouxar
    // o teto no código sem tocar na especificação que o portão da esteira lê.
    assert.deepEqual(rotaDePreviaDoCaso.rateLimit, [
      { dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' },
      { dimension: ['pet'], limit: 10, window: '1h', onExceed: 'serve_cache' },
    ]);
  });

  void it('a 31ª chamada da mesma conta na mesma hora recebe 429', async () => {
    const status = await statusAteEstourar(criarContadorEmMemoria(() => Date.now()));

    assert.equal(status[TETO_POR_CONTA - 1], 200, 'a 30ª ainda passa');
    assert.equal(status[TETO_POR_CONTA], 429, 'a 31ª é recusada');
  });

  void it('o 429 sai como rate-limited, e não como um 400 qualquer', async () => {
    const app = servidor({ contador: criarContadorEmMemoria(() => Date.now()) });
    let ultima = await app.inject({ method: 'GET', url: CAMINHO, headers: { authorization: comoToken(DONO) } });
    for (let i = 1; i <= TETO_POR_CONTA; i += 1) {
      ultima = await app.inject({ method: 'GET', url: CAMINHO, headers: { authorization: comoToken(DONO) } });
    }
    await app.close();

    assert.equal(ultima.statusCode, 429);
    assert.equal(tipoDe(JSON.parse(ultima.body) as Record<string, unknown>), 'rate-limited');
  });

  /**
   * A prova de que o caso acima mede limite, e não a capacidade de contar até 31.
   *
   * `criarContadorDesligado` é a única forma legítima de desligar o teto neste
   * repositório, e ela está escrita na linha, onde a revisão vê. Com ela, a 31ª
   * passa — e o caso acima reprovaria.
   */
  void it('ISCA: com o contador desligado a 31ª passa, e o caso acima reprova', async () => {
    const status = await statusAteEstourar(criarContadorDesligado());

    assert.equal(
      status[TETO_POR_CONTA],
      200,
      'Se a 31ª for recusada com o contador DESLIGADO, o 429 está vindo de ' +
        'outro lugar e o caso acima não prova o teto desta rota.',
    );
  });
});

/**
 * Os links que a resposta do caso entrega ao tutor apontam para as páginas do
 * site, nos caminhos do ADR-0017: `/p/{shareToken}` é a página do caso, e
 * `/c/{finderToken}` é a CONVERSA de quem avisou sem conta. Até esta branch o
 * `share_url` saía em `/c/`, e o link que o tutor compartilhava no WhatsApp
 * levaria o site a chamar `getFinderConversation` com um token de outra
 * natureza. O montador agora é um só, `linksDoCaso`, o mesmo das rotas
 * públicas, e este caso cobra o resultado na resposta de `getLostCase`.
 */
void describe('getLostCase: os links do caso apontam para as páginas do site', () => {
  void it('share_url é /p/{shareToken} e poster_url é /cartaz/{shareToken}', async () => {
    const caso: CasoGravado = {
      id: '018f3a2b-0000-7000-8000-0000000000ee' as CaseId,
      petId: PET_DO_DONO,
      status: 'open',
      lastSeenAt: new Date('2026-09-20T18:30:00.000Z'),
      hasLocation: false,
      areaLabel: 'Pinheiros, São Paulo',
      description: null,
      shareToken: 'k3J9-share-token-opaco-0001',
      shareToPublicList: true,
      openedAt: new Date('2026-09-20T19:00:00.000Z'),
      closedAt: null,
      closureOutcome: null,
      closureChannel: null,
      closureNote: null,
    };
    const resposta = await servidor({ casoDoDono: caso }).inject({
      method: 'GET',
      url: `/lost-cases/${caso.id}`,
      headers: { authorization: comoToken(DONO) },
    });
    assert.equal(resposta.statusCode, 200, resposta.body);
    const corpo = JSON.parse(resposta.body) as Record<string, unknown>;
    assert.equal(corpo['share_url'], `${BASE_DA_WEB}/p/${caso.shareToken}`);
    assert.equal(corpo['poster_url'], `${BASE_DA_WEB}/cartaz/${caso.shareToken}`);
  });
});
