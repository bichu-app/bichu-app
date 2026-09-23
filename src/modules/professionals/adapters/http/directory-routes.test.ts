/**
 * A rota do diretorio, sobre um Fastify de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque tres coisas que esta
 * rota promete so existem com o framework no caminho: o **401** de quem nao tem
 * conta (a credencial e lida na borda, nao no repositorio), o **429** do teto
 * (que e um gancho `onRequest`/`preValidation`, e nao um `if`), e a
 * **serializacao real** da resposta -- que e onde um `id` vazaria.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a mudanca foi conferida no
 * disco (`git diff --stat` nao vazio), a suite rodou e reprovou, e o arquivo foi
 * restaurado. 22/09/2026, Node 22 (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | a anulacao de `distance_m` quando `distanciaDisponivel` e falso | 1 |
 * | `distance_available` saindo fixo em `true` | 2 |
 * | `deny_429` virando `log_and_alert` no teto | 1 |
 * | `chamadorAutenticado` deixando de exigir o cabecalho | 1 |
 * | `rateLimit` removido da rota (tem efeito) | **nao compila** |
 * | dimensao `account` declarada sem resolvedor | **nao compila** |
 * | `app.get` direto, fora de `registrarRota` | o portao de registro reprova |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { EntradaDoDiretorio } from '../../domain/entrada-do-diretorio.js';
import type {
  DirectoryRepository,
  PaginaDoDiretorio,
  RecorteDoDiretorio,
} from '../../ports/directory-repository.js';
import { registrarRotasDoDiretorio, rotaDoDiretorio } from './directory-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000;

const ENTRADA: EntradaDoDiretorio = {
  slug: 'clinica-veterinaria-santa-barbara',
  kind: 'clinic',
  displayName: 'Clínica Veterinária Santa Bárbara',
  about: 'Pronto atendimento 24 horas.',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  phoneE164: '+551130612200',
  verificacoes: [{ evidenceKind: 'crmv', decision: 'approved' }],
  distanciaEmMetros: 2740,
};

interface Cenario {
  readonly contador?: RateLimitStore;
  readonly distanciaDisponivel?: boolean;
  readonly itens?: readonly EntradaDoDiretorio[];
}

const recortesVistos: RecorteDoDiretorio[] = [];

function repositorio(cenario: Cenario): DirectoryRepository {
  return {
    listarPublicados: (recorte): Promise<PaginaDoDiretorio> => {
      recortesVistos.push(recorte);
      const itens = cenario.itens ?? [ENTRADA];
      return Promise.resolve({
        itens,
        total: itens.length,
        distanciaDisponivel: cenario.distanciaDisponivel ?? true,
      });
    },
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  registrarRotasDoDiretorio(app, {
    diretorio: repositorio(cenario),
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    clock,
  });
  return app;
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { url?: string; como?: UserId | null } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? QUEM_CHAMA : opcoes.como;
  const resposta = await app.inject({
    method: 'GET',
    url: opcoes.url ?? '/directory/entries',
    ...(como === null ? {} : { headers: { authorization: `Bearer ${como}` } }),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

void describe('GET /directory/entries exige conta', () => {
  void it('sem cabecalho de credencial, 401 -- e nao uma lista publica', () => {
    // NAO E ZELO: `portao-contrato-publico.ts` reprova `phone_e164` e
    // `distance_m` em toda operacao alcancavel sem conta. Se esta rota responder
    // 200 sem credencial, os dois campos viram vazamento.
    return pedir(servidor(), { como: null }).then((resposta) => {
      assert.equal(resposta.status, 401);
    });
  });

  void it('com "Bearer " vazio, 401 tambem', async () => {
    const resposta = await servidor().inject({
      method: 'GET',
      url: '/directory/entries',
      headers: { authorization: 'Bearer    ' },
    });
    assert.equal(resposta.statusCode, 401);
  });
});

void describe('a resposta do diretorio', () => {
  void it('devolve a pagina com total e o recorte que valeu', async () => {
    const resposta = await pedir(servidor());
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['total'], 1);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });

  void it('NAO devolve UUID interno em lugar nenhum do corpo', async () => {
    const resposta = await pedir(servidor());
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
      'ISCA: qualquer UUID no corpo reprova. O ADR-0010 item 6 nao admite ' +
        'identificador interno em saida, e o endereco de uma entrada e o `slug`.',
    );
    // As colunas de vinculo nao sao nomeadas aqui: o portao de saida procura o
    // literal em todo `src/`. A asserção acima ja e mais forte que o nome --
    // sem nenhum UUID no corpo, nenhuma delas tem como estar la.
    assert.equal(resposta.bruto.includes('user_id'), false);
  });

  void it('sem localizacao valida, distance_available falso e TODA distancia nula', async () => {
    const resposta = await pedir(servidor({ distanciaDisponivel: false }));
    assert.equal(resposta.corpo['distance_available'], false);
    const itens = resposta.corpo['items'] as { distance_m: number | null }[];
    assert.deepEqual(
      itens.map((item) => item.distance_m),
      [null],
      'ISCA: a entrada do dobre tem 2740 m medidos. Se a borda parar de anular, ' +
        'a tela mostra "2,7 km" ao lado de uma lista ordenada por NOME -- que e ' +
        'dizer "estes sao os mais perto" sobre uma ordem que nao mediu nada.',
    );
  });

  void it('com localizacao valida, a distancia sai na grade de 100 m', async () => {
    const resposta = await pedir(servidor());
    assert.equal(resposta.corpo['distance_available'], true);
    const itens = resposta.corpo['items'] as { distance_m: number | null }[];
    assert.equal(itens[0]?.distance_m, 2700);
  });

  void it('o nivel sai derivado, com o tipo de prova junto', async () => {
    const resposta = await pedir(servidor());
    const itens = resposta.corpo['items'] as { verification: unknown }[];
    assert.deepEqual(itens[0]?.verification, {
      level: 'document_verified',
      evidence_kinds: ['crmv'],
    });
  });

  void it('a coordenada de quem chama NAO vem da requisicao', async () => {
    recortesVistos.length = 0;
    await pedir(servidor(), { url: '/directory/entries?city=S%C3%A3o%20Paulo' });
    const recorte = recortesVistos.at(-1);
    assert.ok(recorte !== undefined);
    assert.equal(
      recorte.chamador,
      QUEM_CHAMA,
      'o ponto sai da localizacao de referencia DO CHAMADOR, que o servidor ja ' +
        'guarda. Coordenada em URL vai para log de acesso, historico do aparelho ' +
        'e cabecalho `Referer`.',
    );
    assert.equal(Object.keys(recorte).includes('lat'), false);
    assert.equal(Object.keys(recorte).includes('lon'), false);
  });

  void it('os filtros informados voltam em applied_filters, para a tela escrever', async () => {
    const resposta = await pedir(servidor(), {
      url: '/directory/entries?city=S%C3%A3o%20Paulo&kind=vet',
    });
    assert.deepEqual(resposta.corpo['applied_filters'], { city: 'São Paulo', kind: 'vet' });
  });
});

void describe('o teto da rota', () => {
  void it('a chamada 121 na mesma hora e recusada com 429', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const app = servidor({ contador });
    for (let i = 0; i < 120; i += 1) {
      const ok = await pedir(app);
      assert.equal(ok.status, 200, `a chamada ${String(i + 1)} deveria passar`);
    }
    const recusada = await pedir(app);
    assert.equal(
      recusada.status,
      429,
      'ISCA: com `log_and_alert` no lugar de `deny_429`, esta chamada responde 200.',
    );
  });

  void it('com o contador desligado, a 121 passa -- e e isso que prova que o caso mede LIMITE', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    for (let i = 0; i < 120; i += 1) await pedir(app);
    assert.equal(
      (await pedir(app)).status,
      200,
      'o mesmo caminho com o mecanismo desligado precisa deixar passar. Sem este ' +
        'controle, o caso acima mediria a capacidade de contar ate 121.',
    );
  });

  void it('o teto declarado e por conta, e nao por IP', () => {
    // No Brasil o CGNAT das operadoras poe muita gente atras de poucos
    // enderecos: teto por `ip` numa rota autenticada pegaria vizinhos inocentes
    // e erraria quem raspa.
    assert.deepEqual(
      rotaDoDiretorio.rateLimit?.map((entrada) => entrada.dimension),
      [['account']],
    );
  });
});
