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
 *
 * A isca da BUSCA, provada do mesmo jeito em 22/09: o resolvedor de `q` em
 * `aplicacao-de-teto.ts` passou a devolver o TERMO no lugar de
 * `MARCA_DE_BUSCA`, a suite rodou e saiu `1549 casos, 1548 passaram, 1
 * falharam` -- a falha foi `a 61a busca e recusada com 429 AINDA QUE cada
 * termo seja diferente`, e so ela. E a diferenca entre um teto que pega
 * enumeracao e um que so pega quem repete a mesma busca.
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
import { PONTUACAO_VAZIA } from '../../domain/avaliacao-do-local.js';
import type {
  DirectoryRepository,
  PaginaDoDiretorio,
  RecorteDoDiretorio,
} from '../../ports/directory-repository.js';
import { registrarRotasDoDiretorio, rotaDoDiretorio } from './directory-routes.js';

/** A montagem de URL de midia, pela porta. Nenhum caso deste arquivo tem imagem. */
const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000;

const ENTRADA: EntradaDoDiretorio = {
  slug: 'clinica-veterinaria-santa-barbara',
  kinds: ['clinic'],
  entityKind: 'professional',
  displayName: 'Clínica Veterinária Santa Bárbara',
  about: 'Pronto atendimento 24 horas.',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  phoneE164: '+551130612200',
  siteUrl: null,
  verificacoes: [{ evidenceKind: 'crmv', decision: 'approved' }],
  distanciaEmMetros: 2740,
  logoPublicKey: null,
  pontuacao: PONTUACAO_VAZIA,
};

/**
 * A MESMA entrada, mas com avaliacoes publicadas. Existe para o corpo da
 * resposta poder ser medido nos dois estados -- com e sem avaliacao --, que e o
 * unico jeito de o caso da media NULA nao ser vacuo.
 */
const ENTRADA_AVALIADA: EntradaDoDiretorio = {
  ...ENTRADA,
  slug: 'clinica-veterinaria-do-largo',
  pontuacao: { media: 4.3, quantidade: 128, histograma: { 1: 3, 2: 4, 3: 11, 4: 39, 5: 71 } },
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
    // OS CINCO METODOS DA AVALIACAO (18/10/2026) EXISTEM AQUI E RECUSAM.
    //
    // **Nao sao corpos vazios**, e a diferenca e a razao pela qual o cabecalho
    // da porta avisa contra dobre com metodo vazio: um `async () => undefined`
    // faria estes casos passarem medindo nada. Este arquivo cobre
    // `listDirectoryEntries` e so ela; qualquer caso que chegue a um destes
    // metodos esta exercitando outra rota pelo dobre errado, e o `throw`
    // reprova esse caso em vez de aprova-lo em silencio.
    lerLocalPublicado: () => {
      throw new Error('lerLocalPublicado nao e exercitado por este arquivo');
    },
    listarAvaliacoes: () => {
      throw new Error('listarAvaliacoes nao e exercitado por este arquivo');
    },
    gravarMinhaAvaliacao: () => {
      throw new Error('gravarMinhaAvaliacao nao e exercitado por este arquivo');
    },
    temCanalVerificadoParaAvaliar: () => {
      throw new Error('temCanalVerificadoParaAvaliar nao e exercitado por este arquivo');
    },
    apagarMinhaAvaliacao: () => {
      throw new Error('apagarMinhaAvaliacao nao e exercitado por este arquivo');
    },
    denunciarAvaliacao: () => {
      throw new Error('denunciarAvaliacao nao e exercitado por este arquivo');
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
    urlDeMidia: URL_DE_MIDIA,
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

  // -----------------------------------------------------------------------
  // A PONTUACAO NO CORPO DA RESPOSTA (BICHUS-313)
  // -----------------------------------------------------------------------
  //
  // **Medido no CORPO, e nao na projecao.** Nesta borda so o corpo da
  // REQUISICAO e conferido contra o contrato; a resposta sai sem ninguem olhar.
  // Entao um `rating` que a projecao produz e a rota deixa cair pelo caminho --
  // um `...resto`, uma reescrita apos o espalhamento -- nao tem portao algum na
  // frente. Estes casos sao esse portao.

  void it('o cartao da lista traz `rating` com media, contagem e histograma', async () => {
    const resposta = await pedir(servidor({ itens: [ENTRADA_AVALIADA] }));
    const [entrada] = resposta.corpo['items'] as Record<string, unknown>[];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      entrada['rating'],
      { average: 4.3, count: 128, histogram: { '1': 3, '2': 4, '3': 11, '4': 39, '5': 71 } },
      'REPROVA: `rating` nao saiu no cartao da lista, ou saiu com outra forma. ' +
        '`DirectoryEntrySummary.rating` nao e `required`: sem este caso, a rota ' +
        'pode voltar a omitir o campo e nenhum portao acusa -- foi exatamente ' +
        'assim que a BICHUS-313 passou despercebida.',
    );
  });

  void it('cartao SEM avaliacao sai com `average` NULO no corpo, e nunca zero', async () => {
    // `ENTRADA` carrega `PONTUACAO_VAZIA`, que e o estado da maioria das
    // entradas de verdade.
    const resposta = await pedir(servidor());
    const [entrada] = resposta.corpo['items'] as Record<string, unknown>[];
    assert.ok(entrada !== undefined);
    assert.deepEqual(entrada['rating'], {
      average: null,
      count: 0,
      histogram: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
    // E no JSON CRU: `"average":0` nao pode estar no corpo. Zero numa escala de
    // 1 a 5 le-se como "pessimo", e um local que ninguem avaliou nao e pessimo
    // -- o cartao escreve "Ainda sem avaliacoes" e nao desenha estrela nenhuma.
    assert.equal(
      resposta.bruto.includes('"average":0'),
      false,
      `REPROVA: media ZERO no corpo. JSON: ${resposta.bruto}`,
    );
    assert.ok(resposta.bruto.includes('"average":null'), `JSON: ${resposta.bruto}`);
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

  void it('os tetos declarados sao por conta, e nenhum e por IP', () => {
    // No Brasil o CGNAT das operadoras poe muita gente atras de poucos
    // enderecos: teto por `ip` numa rota autenticada pegaria vizinhos inocentes
    // e erraria quem raspa.
    //
    // O conjunto esta escrito POR EXTENSO, e nao derivado da rota: derivar
    // compararia a rota com ela mesma e ficaria verde com qualquer teto.
    assert.deepEqual(
      rotaDoDiretorio.rateLimit?.map((entrada) => ({
        dimension: entrada.dimension,
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      })),
      [
        { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
        { dimension: ['account', 'q'], limit: 60, window: '1h', onExceed: 'deny_429' },
      ],
    );
  });
});

/**
 * O teto da BUSCA, que e a parte que decide se ele serve para alguma coisa.
 *
 * A pergunta nao e "a rota tem um teto de busca": e "o teto conta a coisa
 * certa". Um teto por (conta, TERMO) passaria em qualquer caso que repetisse a
 * mesma busca, e seria inutil contra o unico uso que preocupa -- enumerar o
 * diretorio, que e variar o termo a cada chamada.
 *
 * Por isso os casos abaixo usam um termo DIFERENTE em cada requisicao.
 */
void describe('o teto da busca', () => {
  /** `busca-001`, `busca-002`... Termo distinto a cada chamada, de proposito. */
  function termo(n: number): string {
    return `busca-${String(n).padStart(3, '0')}`;
  }

  void it('a 61a busca e recusada com 429 AINDA QUE cada termo seja diferente', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const app = servidor({ contador });
    for (let i = 1; i <= 60; i += 1) {
      const ok = await pedir(app, { url: `/directory/entries?q=${termo(i)}` });
      assert.equal(ok.status, 200, `a busca ${String(i)} deveria passar`);
    }
    const recusada = await pedir(app, { url: `/directory/entries?q=${termo(61)}` });
    assert.equal(
      recusada.status,
      429,
      'ISCA: se o resolvedor de `q` devolvesse o TERMO em vez da marca de ' +
        'presenca, cada uma destas 61 chamadas abriria um balde proprio com um ' +
        'uso, e nenhuma seria recusada. E esse o caminho de quem mapeia o ' +
        'diretorio inteiro: ele varia o termo por definicao.',
    );
  });

  void it('com o contador desligado a 61a busca passa -- e e isso que prova que o caso mede LIMITE', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    for (let i = 1; i <= 60; i += 1) await pedir(app, { url: `/directory/entries?q=${termo(i)}` });
    assert.equal(
      (await pedir(app, { url: `/directory/entries?q=${termo(61)}` })).status,
      200,
      'o mesmo caminho com o mecanismo desligado precisa deixar passar. Sem este ' +
        'controle, o caso acima mediria a capacidade de contar ate 61.',
    );
  });

  void it('chamada SEM `q` nao gasta o teto da busca', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const app = servidor({ contador });
    // 59 chamadas sem busca: elas contam no teto de 120 da rota e nao podem
    // contar no de 60 da busca.
    for (let i = 0; i < 59; i += 1) {
      assert.equal((await pedir(app)).status, 200);
    }
    for (let i = 1; i <= 60; i += 1) {
      assert.equal(
        (await pedir(app, { url: `/directory/entries?q=${termo(i)}` })).status,
        200,
        `ISCA: a busca ${String(i)} levou 429. Se a entrada [account, q] contasse ` +
          'tambem a chamada sem `q`, o balde ja chegaria com 59 usos e a segunda ' +
          'busca seria recusada -- quem so abre a aba e rola a lista pagaria o ' +
          'teto da busca sem nunca ter buscado.',
      );
    }
  });
});

void describe('o parametro `q` chega ao recorte e volta para a tela', () => {
  void it('o termo atravessa a borda aparado, e o recorte o recebe', async () => {
    recortesVistos.length = 0;
    await pedir(servidor(), { url: '/directory/entries?q=%20Veterin%C3%A1ria%20' });
    assert.equal(recortesVistos.at(-1)?.q, ' Veterinária ');
  });

  void it('`q` volta em applied_filters COMO FOI DIGITADO, com acento e caixa', async () => {
    const resposta = await pedir(servidor(), { url: '/directory/entries?q=Veterin%C3%A1ria' });
    assert.deepEqual(
      resposta.corpo['applied_filters'],
      { q: 'Veterinária' },
      'a tela escreve "resultados para <termo>" com o que a pessoa digitou. ' +
        'Devolver a forma normalizada faria ela nao reconhecer o proprio texto.',
    );
  });

  void it('sem `q`, applied_filters continua dizendo scope: all', async () => {
    const resposta = await pedir(servidor());
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });
});

// ===========================================================================
// `GET /public/directory-entries` -- A MESMA LISTA, SEM CONTA (27/10/2026)
//
// **Estes casos medem o CORPO da resposta, e nao o status.** Nenhum portao
// deste repositorio confere corpo de resposta: `portao-contrato-publico.ts` le
// o CONTRATO, e o validador de requisicao confere o corpo do PEDIDO. Entre o
// schema aprovado e os bytes que saem do servidor nao havia nada -- e e
// exatamente nesse vao que um `phone_e164` voltaria sem ninguem ver, com o
// portao verde e o contrato certo.
//
// A isca de cada caso esta escrita no `reason` dele.
// ===========================================================================

/** Os quatro nomes que NAO podem sair sem conta, e por que cada um. */
const PROIBIDOS_SEM_CONTA = [
  // Proibidos por NOME EXATO em `portao-contrato-publico.ts`.
  'phone_e164',
  'distance_m',
  // Proibido pela razao declarada no proprio campo: sai ao lado de
  // `phone_e164` e so pode existir porque a operacao exige conta.
  'site_url',
  // Fora da projecao publica por decisao de produto: o cartao nao o desenha.
  'about',
] as const;

void describe('GET /public/directory-entries: a MESMA lista, sem conta', () => {
  void it('responde 200 SEM cabecalho de credencial', async () => {
    const resposta = await pedir(servidor(), {
      url: '/public/directory-entries',
      como: null,
    });
    assert.equal(
      resposta.status,
      200,
      'REPROVA: a lista publica do diretorio pediu conta. O pedido do cliente ' +
        'de 26/10/2026 e que a Comunidade liste para quem esta deslogado.',
    );
    const itens = resposta.corpo['items'] as unknown[];
    assert.equal(itens.length, 1, 'REPROVA: a lista publica saiu vazia.');
  });

  void it('ISCA: o corpo NAO traz telefone, distancia, site nem sobre', async () => {
    const resposta = await pedir(servidor(), {
      url: '/public/directory-entries',
      como: null,
    });
    const [entrada] = resposta.corpo['items'] as Record<string, unknown>[];
    assert.ok(entrada !== undefined);

    for (const campo of PROIBIDOS_SEM_CONTA) {
      // `in` e nao `=== undefined`: a chave presente com valor nulo JA e o
      // defeito. `{"phone_e164": null}` prova que a projecao publica esta
      // passando pelo campo, e o dia em que o valor deixar de ser nulo nao tem
      // portao nenhum na frente.
      assert.equal(
        campo in entrada,
        false,
        `REPROVA: \`${campo}\` saiu no corpo da lista SEM CONTA. ` +
          'Troque `projetarEntradaSemConta` por `projetarEntrada` na rota ' +
          'publica e este caso reprova nos quatro nomes.',
      );
    }

    // E a busca pelo NOME no texto cru, que pega o campo aninhado que o laco
    // acima nao alcancaria.
    for (const campo of PROIBIDOS_SEM_CONTA) {
      assert.equal(
        resposta.bruto.includes(`"${campo}"`),
        false,
        `REPROVA: \`${campo}\` aparece no JSON cru da rota publica.`,
      );
    }
  });

  void it('CONTRAPESO: a MESMA entrada, COM conta, traz os quatro', async () => {
    // **Sem este caso o de cima e vacuo.** Ele ficaria verde com a massa sem
    // telefone, com a rota devolvendo lista vazia, ou com os quatro campos
    // apagados das DUAS projecoes -- e a terceira hipotese seria uma quebra do
    // APK publicado passando por melhoria de privacidade.
    const resposta = await pedir(servidor(), { url: '/directory/entries' });
    const [entrada] = resposta.corpo['items'] as Record<string, unknown>[];
    assert.ok(entrada !== undefined);
    for (const campo of PROIBIDOS_SEM_CONTA) {
      assert.equal(
        campo in entrada,
        true,
        `REPROVA: \`${campo}\` desapareceu da resposta COM conta. O APK ` +
          'publicado le esta resposta: campo que sai dela e quebra de contrato.',
      );
    }
    assert.equal(entrada['phone_e164'], '+551130612200');
    assert.equal(entrada['distance_m'], 2700);
  });

  void it('o que o cartao deslogado TEM: nome, atividade e lugar', async () => {
    // O contrapeso do contrapeso: provar que a projecao magra nao ficou magra
    // demais. Uma projecao que devolvesse so o `slug` passaria em todos os
    // casos de ausencia acima.
    const resposta = await pedir(servidor(), {
      url: '/public/directory-entries',
      como: null,
    });
    const [entrada] = resposta.corpo['items'] as Record<string, unknown>[];
    assert.ok(entrada !== undefined);
    assert.equal(entrada['slug'], 'clinica-veterinaria-santa-barbara');
    assert.equal(entrada['display_name'], 'Clínica Veterinária Santa Bárbara');
    assert.equal(entrada['kind'], 'clinic');
    assert.deepEqual(entrada['kinds'], ['clinic']);
    assert.equal(entrada['entity_kind'], 'professional');
    assert.equal(entrada['neighborhood'], 'Pinheiros');
    assert.equal(entrada['city'], 'São Paulo');
    assert.equal(entrada['state'], 'SP');
    assert.deepEqual(entrada['verification'], {
      level: 'document_verified',
      evidence_kinds: ['crmv'],
    });
    // E A PONTUACAO, no cartao DESLOGADO tambem (BICHUS-313). O contrato pedia
    // as duas projecoes no mesmo commit, com o mesmo recorte, "para a media do
    // cartao deslogado e a do logado nunca discordarem" -- e aqui as duas vem da
    // MESMA `EntradaDoDiretorio`, entao discordar exigiria duas projecoes
    // diferentes do mesmo valor.
    assert.deepEqual(entrada['rating'], {
      average: null,
      count: 0,
      histogram: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
  });

  void it('`distance_available` sai FALSO, e a ordem pedida ao banco e `name`', async () => {
    // Os dois lados da mesma promessa. O campo falso sozinho ficaria verde com
    // a consulta ordenando por distancia e o servidor mentindo na resposta; o
    // recorte sozinho nao provaria o que a tela le.
    recortesVistos.length = 0;
    const resposta = await pedir(
      servidor({ distanciaDisponivel: false }),
      { url: '/public/directory-entries', como: null },
    );
    assert.equal(resposta.corpo['distance_available'], false);

    const recorte = recortesVistos.at(-1);
    assert.ok(recorte !== undefined);
    assert.equal(
      recorte.sort,
      'name',
      'REPROVA: a rota publica pediu ordem por distancia. Sem conta nao ha ' +
        'ponto de onde medir, e ordenar por distancia numa rota publica e o ' +
        'oraculo de posicao que o ADR-0010 itens 4 e 5 proibem.',
    );
    assert.equal(
      recorte.chamador,
      undefined,
      'REPROVA: a rota publica inventou um chamador. Sem conta nao ha de onde ' +
        'sair a localizacao de referencia.',
    );
    assert.equal(recorte.familia, undefined);
  });

  void it('nao e indexavel e nao deixa `Referer`', async () => {
    const resposta = await servidor().inject({
      method: 'GET',
      url: '/public/directory-entries',
    });
    assert.equal(resposta.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(resposta.headers['referrer-policy'], 'no-referrer');
    assert.equal(resposta.headers['cache-control'], 'no-store');
  });
});
