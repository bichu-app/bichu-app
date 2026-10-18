/**
 * `PATCH /v1/lost-cases/:caseId` **não reescreve `share_to_public_list`** quando
 * o corpo não o traz (BICHUS-278).
 *
 * ## O defeito que este arquivo trava
 *
 * O Fastify monta o Ajv com `useDefaults: true` — `criarServidor` não passa
 * configuração de `ajv`. O Ajv então **escreve no corpo recebido** o `default`
 * de todo campo ausente. A edição do caso reusa `LostCaseInput`, o MESMO `$ref`
 * da criação (`api/openapi.yaml`), e lá:
 *
 * ```
 * share_to_public_list: { type: boolean, default: true }
 * ```
 *
 * Medido em 17/10/2026, com o schema que a rota de fato usa, num Fastify nu:
 *
 * ```
 * PATCH  { last_seen_at, last_seen_area: { city }, description }
 * o manipulador VIU:
 *   { last_seen_at, last_seen_area, description, share_to_public_list: true }
 * ```
 *
 * O repositório é explícito e cuidadoso — `share_to_public_list = COALESCE` à
 * mão, mantendo o valor antigo quando `shareToPublicList === undefined` —, e
 * **esse ramo nunca era alcançado**: o Ajv já tinha preenchido `true`.
 *
 * Efeito para quem usa: **o tutor que tirou o caso da lista pública e depois
 * corrige onde o pet foi visto volta a publicar o caso**, com `200` e sem
 * aviso. É o campo que decide se o caso de um pet perdido aparece numa página
 * PÚBLICA, então o defeito é de privacidade, e não de cosmética.
 *
 * ## Por que são DOIS casos, e não um
 *
 * O primeiro (um campo só no corpo) reprova se o padrão for injetado. O segundo
 * (`share_to_public_list: false` explícito) reprova se a correção virar "ignora
 * o campo sempre" — que seria outro defeito, igualmente silencioso: o tutor
 * pediria para tirar da lista pública e o caso continuaria lá. Um caso sozinho
 * aprova a metade errada da correção.
 *
 * A asserção é sobre **o que chegou ao repositório**, e não sobre o corpo da
 * resposta: é no repositório que a coluna é escrita, e é `undefined` ali que
 * decide se a coluna é tocada. Olhar só o `200` é exatamente o que deixou o
 * defeito passar.
 *
 * ## As iscas
 *
 * Os dois lados foram **desligados no código de produção, rodados e vistos
 * reprovar** em 17/10/2026, e depois restaurados com o SHA-256 conferido contra
 * a cópia anterior (`lost-case-routes.ts` = `a32d972b…118f94`):
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `corpoSemPadroes(corpoDe(…))` de volta para `corpoDe(…)` (o defeito original) | o 1º caso, com `actual: true, expected: undefined` |
 * | `shareToPublicList: corpo.share_to_public_list` virando `undefined` fixo (a correção preguiçosa) | o 2º e o 3º, com `actual: undefined` |
 *
 * Nenhum dos dois desligamentos reprova os dois lados, e é por isso que os
 * casos vêm em par: cada um sozinho aprova metade errada da correção.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, CaseId, PetId, UserId } from '../../../../shared/types/brands.js';
import type { AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../../shared/ports/index.js';
import { LostCaseService } from '../../application/lost-case-service.js';
import type { AlcanceDoAlerta } from '../../ports/alcance-do-alerta.js';
import type { RegistroDeDisparos } from '../../ports/registro-de-disparos.js';
import type {
  AtualizacaoDoCaso,
  CasoGravado,
  LostCaseRepository,
} from '../../ports/lost-case-repository.js';
import { registrarRotasDeCasos, rotaDeAtualizacaoDoCaso } from './lost-case-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DA_WEB = 'https://bichu.test' as AbsoluteUrl;

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET_DO_DONO = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const CASO = '018f3a2b-0000-7000-8000-0000000000ee' as CaseId;

/** O instante do relógio da bancada. `last_seen_at` precisa ser ANTES dele. */
const AGORA = 1_800_000_000_000;
const VISTO_EM = new Date(AGORA - 3_600_000).toISOString();

/**
 * O caso como ele está gravado **antes** da edição: fora da lista pública.
 *
 * `shareToPublicList: false` é o estado que o defeito destruía. Ele está aqui
 * para o cenário ser o real — o tutor que tirou o caso da lista — e não um
 * caso neutro em que a injeção do padrão passaria desapercebida.
 */
const CASO_FORA_DA_LISTA: CasoGravado = {
  id: CASO,
  petId: PET_DO_DONO,
  status: 'open',
  lastSeenAt: new Date(AGORA - 7_200_000),
  hasLocation: false,
  areaLabel: 'Vila Madalena',
  description: 'Fugiu pelo portão.',
  shareToken: 'tok-aaaaaaaaaaaaaaaa',
  shareToPublicList: false,
  openedAt: new Date(AGORA - 86_400_000),
  closedAt: null,
  closureOutcome: null,
  closureChannel: null,
  closureNote: null,
};

/** O que `atualizarOndeEQuando` recebeu. É a única coisa que estes casos medem. */
interface Espiao {
  readonly recebido: () => AtualizacaoDoCaso | undefined;
  readonly repositorio: LostCaseRepository;
}

function espiaoDoRepositorio(): Espiao {
  const naoUsado = (): never => {
    throw new Error('A edição não abre nem encerra caso: este método não devia ser chamado.');
  };

  let visto: AtualizacaoDoCaso | undefined;

  return {
    recebido: () => visto,
    repositorio: {
      estadoParaAbertura: () =>
        Promise.resolve({
          existeEhDoTutor: true,
          temFotoPronta: true,
          petJaTemCasoAberto: false,
          casosAbertosDaConta: 0,
          temCanalVerificado: true,
        }),
      estadoParaPrevia: naoUsado,
      abrir: naoUsado,
      buscarDoTutor: () => Promise.resolve(CASO_FORA_DA_LISTA),
      encerrar: () => Promise.resolve(null),
      atualizarOndeEQuando: (entrada: AtualizacaoDoCaso): Promise<CasoGravado | null> => {
        visto = entrada;
        // O dublê devolve o caso com a decisão que a entrada carrega, do mesmo
        // jeito que o SQL real faz: `undefined` mantém o valor antigo.
        return Promise.resolve({
          ...CASO_FORA_DA_LISTA,
          shareToPublicList: entrada.shareToPublicList ?? CASO_FORA_DA_LISTA.shareToPublicList,
          description: entrada.description ?? CASO_FORA_DA_LISTA.description,
          lastSeenAt: new Date(Number(entrada.lastSeenAt)),
        });
      },
      decidirCandidato: naoUsado,
      candidatoDecididoDoTutor: naoUsado,
      candidatosDoCaso: () => Promise.resolve([]),
    },
  };
}

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

function filaDeTeste(): JobQueue {
  return {
    enqueue: () => Promise.resolve('018f3a2b-0000-7000-8000-00000000f11a'),
    claim: () => Promise.resolve([]),
    recuperarOrfaos: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };
}

function bancada(): { app: RegistradorDeRotas; recebido: () => AtualizacaoDoCaso | undefined } {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  const espiao = espiaoDoRepositorio();
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  const alcance: AlcanceDoAlerta = { alcancaveis: () => Promise.resolve(null) };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: () => {
      throw new Error('A edição não gera identificador.');
    },
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const trilha: AuditLog = { record: () => Promise.resolve() };

  registrarRotasDeCasos(app, {
    casos: new LostCaseService({
      repositorio: espiao.repositorio,
      ids,
      clock,
      trilha,
      alcance,
      disparos: disparosDeTeste(),
      fila: filaDeTeste(),
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
    // O contrato DE VERDADE: é dele que sai o schema do corpo desta rota, e é
    // nele que vive o `default: true`. Uma cópia aqui faria o teste medir a
    // cópia, e não a spec — e deixaria de acusar mudança na spec.
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    baseDaWeb: BASE_DA_WEB,
  });

  return { app, recebido: espiao.recebido };
}

async function editar(
  app: RegistradorDeRotas,
  corpo: Record<string, unknown>,
): Promise<{ status: number }> {
  const resposta = await app.inject({
    method: 'PATCH',
    url: `/lost-cases/${CASO}`,
    headers: { authorization: `Bearer ${DONO}` },
    payload: corpo,
  });
  return { status: resposta.statusCode };
}

void describe('a edição do caso não republica o que o tutor tirou da lista pública', () => {
  void it('corpo com UM campo só: `share_to_public_list` chega ao repositório como `undefined`', async () => {
    const { app, recebido } = bancada();
    // O corpo mínimo que o contrato aceita nesta operação: `last_seen_at` é
    // obrigatório e o `anyOf` exige ponto OU área. É a correção de "onde e
    // quando" — ninguém mencionou a lista pública.
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    // A asserção que importa. Com o `default` do contrato injetado isto é
    // `true`, o `COALESCE` do repositório não é alcançado, e a coluna é
    // reescrita: o caso volta para a lista pública.
    assert.equal(
      entrada.shareToPublicList,
      undefined,
      'campo que o corpo não trouxe não pode chegar ao repositório com valor',
    );
    assert.notEqual(entrada.shareToPublicList, true);
    // `description` não tem `default` no contrato, e já estava a salvo. Está
    // aqui para o caso não passar a falhar por ela se um `default` for
    // acrescentado a ela algum dia.
    assert.equal(entrada.description, undefined);
  });

  void it('`share_to_public_list: false` explícito CHEGA como `false` — a correção não ignora o campo', async () => {
    const { app, recebido } = bancada();
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
      share_to_public_list: false,
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    // Sem este caso, "ignora o campo sempre" aprovaria o teste acima — e o
    // tutor que pede para tirar o caso da lista pública continuaria nela.
    assert.equal(entrada.shareToPublicList, false);
    assert.notEqual(entrada.shareToPublicList, undefined);
  });

  void it('`share_to_public_list: true` explícito também chega, e não é confundido com o padrão', async () => {
    const { app, recebido } = bancada();
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
      share_to_public_list: true,
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    // O `true` do padrão e o `true` que o tutor mandou são indistinguíveis no
    // corpo DEPOIS do Ajv — é essa indistinguibilidade que é o defeito. Aqui o
    // `true` é do tutor, e ele precisa passar: republicar por pedido é certo.
    assert.equal(entrada.shareToPublicList, true);
  });

  void it('a rota desta bancada é a `updateLostCase` do contrato', () => {
    // Guarda contra a bancada medir outra rota se o `operationId` mudar.
    assert.equal(rotaDeAtualizacaoDoCaso.operationId, 'updateLostCase');
    assert.equal(rotaDeAtualizacaoDoCaso.method, 'patch');
  });
});
