/**
 * `GET /directory/suggestions` — **Minhas indicacoes**, sobre um Fastify de
 * verdade e com o CONTRATO de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque tres coisas que esta
 * operacao promete so existem com o framework no caminho: o **401** de quem nao
 * tem conta (a credencial e lida na borda), o **esquema de `query`** instalado
 * a partir do contrato (que e quem responde `400` a `page=0`) e a
 * **serializacao real** da resposta -- que e onde um identificador interno
 * vazaria.
 *
 * ## AS QUATRO ISCAS, e por que cada uma e por DESLIGAMENTO
 *
 * Caso que passa igual com o mecanismo desligado nao prova nada. Cada isca
 * abaixo tem um contrapeso que reprova se a protecao sair:
 *
 * 1. **A pessoa ve so as dela.** A isca nao e "a lista veio": e que a conta que
 *    o caso de uso recebe e **a autenticada**, e nunca um valor da requisicao.
 *    O contrapeso manda `?author=` e `?user_id=` de outra conta e cobra que o
 *    recorte continue com a conta do token. Quem trocar a origem da autoria por
 *    um parametro reprova aqui.
 * 2. **Recusada mostra o motivo.** Com o contrapeso: `pending` e `approved`
 *    **nao** podem trazer motivo, senao o caso passaria igual se a projecao
 *    devolvesse o campo sempre.
 * 3. **O identificador interno do autor nao sai.** Varredura no corpo BRUTO
 *    (texto, nao objeto): um `id` dentro de um objeto aninhado escaparia de uma
 *    conferencia de chaves de primeiro nivel. O contrapeso prova que a
 *    varredura enxerga -- ela acha o UUID quando ele esta de proposito no
 *    corpo.
 * 4. **Conta desabilitada nao lista.** Aqui o dobre devolve vazio, porque quem
 *    aplica a regra e o `WHERE` da funcao do banco. **Isto esta dito em voz
 *    alta e nao e disfarcado:** este arquivo prova que a camada HTTP entrega o
 *    vazio como `200` com `items: []` e `total: 0` -- e nao `404`, nao `403` e
 *    nao um corpo sem `items`. A prova de que a FUNCAO filtra conta
 *    desabilitada e de SQL, e foi feita em `BEGIN/ROLLBACK` contra
 *    `conta_habilitada`; ela nao cabe num teste unitario sem banco, e fingir que
 *    cabe seria o caso que aprova com o mecanismo desligado.
 *
 * ## A isca que guarda o CAMINHO ate o banco
 *
 * `o adaptador le pela funcao, e nao pela tabela` nao sobe servidor: ele le o
 * texto de `kysely-directory-suggestion-repository.ts` e cobra
 * `indicacoes_do_autor(`. Sem ela, alguem que trocasse a funcao por um
 * `WHERE` direto na tabela passaria em todos os casos acima -- e reprovaria
 * apenas no portao de colunas que nao saem, que e outro job e outra mensagem.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import { SugestaoDoDiretorio } from '../../application/sugestao-do-diretorio.js';
import type {
  DirectorySuggestionRepository,
  MinhaIndicacao,
  RecorteDasMinhasIndicacoes,
} from '../../ports/directory-suggestion-repository.js';
import {
  registrarRotaDasMinhasIndicacoes,
  rotaDasMinhasIndicacoes,
} from './directory-suggestion-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRA_CONTA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000;
const CRIADO_EM = comoData(Date.UTC(2026, 9, 17, 12, 0, 0) as Instant);
const DECIDIDO_EM = comoData(Date.UTC(2026, 9, 18, 9, 30, 0) as Instant);

/** O molde de uma indicacao do dobre. Cada caso troca o que mede. */
function indicacao(sobre: Partial<MinhaIndicacao> = {}): MinhaIndicacao {
  return {
    ref: 'u7YkQwE2tLm9ZpR4sAbC',
    displayName: 'Clínica Veterinária Santa Bárbara',
    kind: 'clinic',
    // O TIPO DE ENTIDADE (29/10/2026). `professional` na fixa porque e o
    // `DEFAULT` da coluna e o caso comum; quem mede ONG troca no `sobre`.
    entityKind: 'professional',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    contatoKind: 'phone',
    contatoValue: '+551130612200',
    reviewStatus: 'pending',
    createdAt: CRIADO_EM,
    decidedAt: null,
    declineReason: null,
    entradaSlug: null,
    ...sobre,
  };
}

interface Cenario {
  readonly itens?: readonly MinhaIndicacao[];
  readonly total?: number;
}

/** Os recortes que o repositorio recebeu. Zerado em cada `servidor()`. */
let recortes: RecorteDasMinhasIndicacoes[] = [];

function repositorio(cenario: Cenario): DirectorySuggestionRepository {
  return {
    registrar: () => Promise.reject(new Error('este arquivo nao escreve')),
    listarDoAutor: (recorte) => {
      recortes.push(recorte);
      const itens = cenario.itens ?? [];
      return Promise.resolve({ itens, total: cenario.total ?? itens.length });
    },
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  recortes = [];
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
  // O PLUGIN DE VERDADE, e nao um esquema inline, e e ele que faz os casos de
  // `page`/`limit` abaixo medirem o CONTRATO. Em producao quem o instala e
  // `src/bin/api.ts`; sem ele aqui, `?page=0` chegaria ao manipulador e os
  // casos de paginacao passariam a medir um `if` que nao existe. Prefixo vazio
  // porque este arquivo registra a rota na raiz, sem `/v1`.
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, '');
  registrarRotaDasMinhasIndicacoes(app, {
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    sugestoes: new SugestaoDoDiretorio({
      sugestoes: repositorio(cenario),
      trilha: { record: () => Promise.resolve() },
      conferencias: {
        errosDeTextoDeUsuario: () => [],
        handleDoInstagram: () => null,
      },
      canal: { temCanalVerificado: () => Promise.resolve(true) },
    }),
    // O CONTRATO DE VERDADE, do disco: e ele que instala o esquema de `query`.
    contrato,
  });
  // A conferencia de subida, chamada DEPOIS do registro, como em producao: ela
  // reprova rota sem operacao no contrato e rota que declara esquema proprio.
  conferirParametros();
  return app;
}

interface Resposta {
  readonly status: number;
  readonly cache: string | string[] | number | undefined;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function listar(
  app: RegistradorDeRotas,
  opcoes: { busca?: string; como?: UserId | null } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? QUEM_CHAMA : opcoes.como;
  const resposta = await app.inject({
    method: 'GET',
    url: `/directory/suggestions${opcoes.busca ?? ''}`,
    ...(como === null ? {} : { headers: { authorization: `Bearer ${como}` } }),
  });
  return {
    status: resposta.statusCode,
    cache: resposta.headers['cache-control'],
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

function itensDe(resposta: Resposta): Record<string, unknown>[] {
  return resposta.corpo['items'] as Record<string, unknown>[];
}

void describe('GET /directory/suggestions — Minhas indicações', () => {
  void it('a rota e a do contrato, sem teto inventado', () => {
    assert.equal(rotaDasMinhasIndicacoes.operationId, 'listMyDirectorySuggestions');
    assert.equal(rotaDasMinhasIndicacoes.method, 'get');
    assert.deepEqual(rotaDasMinhasIndicacoes.effects, []);
  });

  void it('devolve a lista com o estado de cada indicacao', async () => {
    const app = servidor({
      itens: [
        indicacao({ ref: 'aPendenteDaContaUm0001', reviewStatus: 'pending' }),
        indicacao({
          ref: 'bAprovadaDaContaUm0001',
          reviewStatus: 'approved',
          decidedAt: DECIDIDO_EM,
          entradaSlug: 'clinica-santa-barbara',
        }),
      ],
    });
    const resposta = await listar(app);

    assert.equal(resposta.status, 200);
    // `private, no-store`: lista de uma pessoa nao e resposta cacheavel -- o
    // intermediario que a guardasse a mostraria para a chamada seguinte, que
    // pode ser de outra conta no mesmo aparelho.
    assert.equal(resposta.cache, 'private, no-store');
    assert.equal(itensDe(resposta).length, 2);
    assert.equal(itensDe(resposta)[0]?.['review_status'], 'pending');
    assert.equal(itensDe(resposta)[1]?.['review_status'], 'approved');
    assert.equal(itensDe(resposta)[1]?.['entry_slug'], 'clinica-santa-barbara');
    assert.equal(resposta.corpo['total'], 2);
  });

  void it('sem conta, 401 — e a consulta nao acontece', async () => {
    const app = servidor({ itens: [indicacao()] });
    const resposta = await listar(app, { como: null });

    assert.equal(resposta.status, 401);
    // O CONTRAPESO do 401: nao basta o status: a consulta nao pode ter
    // acontecido. Um 401 depois de ler seria a linha ja na memoria do processo.
    assert.deepEqual(recortes, []);
  });

  void describe('ISCA 1 — a pessoa ve SO as indicacoes dela', () => {
    void it('a conta do recorte e a do token', async () => {
      const app = servidor({ itens: [indicacao()] });
      await listar(app);

      assert.equal(recortes.length, 1);
      assert.equal(recortes[0]?.autor, QUEM_CHAMA);
    });

    void it('CONTRAPESO: parametro de autoria na URL e IGNORADO', async () => {
      // A isca de verdade. Se alguem trocar a origem da autoria de "o token"
      // para "o que vier na requisicao", este caso reprova -- e ele reprova
      // ANTES de qualquer banco, que e onde o estrago seria invisivel.
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, {
        busca: `?author=${OUTRA_CONTA}&user_id=${OUTRA_CONTA}&suggested_by=${OUTRA_CONTA}`,
      });

      // O contrato nao declara esses parametros; o que importa e que a autoria
      // continue vindo do token, qualquer que seja o destino do campo extra.
      if (resposta.status === 200) {
        assert.equal(recortes[0]?.autor, QUEM_CHAMA);
        assert.notEqual(recortes[0]?.autor, OUTRA_CONTA);
      } else {
        // Recusado na borda tambem serve, desde que NADA tenha sido consultado
        // com a conta de outra pessoa.
        assert.deepEqual(recortes, []);
      }
    });

    void it('CONTRAPESO: duas contas, dois recortes diferentes', async () => {
      // Sem este caso, um `autor` fixo (constante, cache, variavel de modulo)
      // passaria nos dois de cima.
      const app = servidor({ itens: [indicacao()] });
      await listar(app, { como: QUEM_CHAMA });
      await listar(app, { como: OUTRA_CONTA });

      assert.equal(recortes[0]?.autor, QUEM_CHAMA);
      assert.equal(recortes[1]?.autor, OUTRA_CONTA);
    });
  });

  void describe('ISCA 2 — recusada mostra o motivo', () => {
    void it('o motivo da recusa chega a quem indicou', async () => {
      const app = servidor({
        itens: [
          indicacao({
            reviewStatus: 'declined',
            decidedAt: DECIDIDO_EM,
            declineReason: 'A clínica fechou em agosto.',
          }),
        ],
      });
      const resposta = await listar(app);

      assert.equal(itensDe(resposta)[0]?.['review_status'], 'declined');
      assert.equal(itensDe(resposta)[0]?.['decline_reason'], 'A clínica fechou em agosto.');
    });

    void it('CONTRAPESO: pendente e aprovada NAO trazem motivo', async () => {
      // Sem este caso, uma projecao que devolvesse `decline_reason` sempre
      // passaria no de cima.
      const app = servidor({
        itens: [
          indicacao({ reviewStatus: 'pending' }),
          indicacao({ reviewStatus: 'approved', decidedAt: DECIDIDO_EM }),
        ],
      });
      const resposta = await listar(app);

      assert.equal(itensDe(resposta)[0]?.['decline_reason'], null);
      assert.equal(itensDe(resposta)[1]?.['decline_reason'], null);
    });
  });

  void describe('ISCA 3 — o identificador interno do autor NAO sai', () => {
    void it('o UUID da conta nao aparece no corpo, em posicao nenhuma', async () => {
      const app = servidor({
        itens: [
          indicacao({ reviewStatus: 'pending' }),
          indicacao({
            ref: 'bRecusadaDaContaUm001',
            reviewStatus: 'declined',
            decidedAt: DECIDIDO_EM,
            declineReason: 'Não atende pet.',
          }),
        ],
      });
      const resposta = await listar(app);

      // No BRUTO, e nao nas chaves do objeto: um `id` dentro de um objeto
      // aninhado escaparia de uma conferencia de primeiro nivel.
      assert.ok(!resposta.bruto.includes(QUEM_CHAMA));
      assert.ok(!resposta.bruto.includes('suggested_by'));
      // Nem `id` como chave, em nenhum item: o enderecamento e por `reference`.
      for (const item of itensDe(resposta)) {
        assert.ok(!('id' in item), 'nenhum item pode ter `id` (ADR-0010 item 6)');
        assert.ok('reference' in item);
      }
    });

    void it('CONTRAPESO: a varredura do bruto ENXERGA o UUID quando ele esta la', async () => {
      // Prova negativa que vive numa frase evapora. Se `includes` deixar de
      // enxergar -- outra forma de serializar, outro recorte --, o caso de cima
      // fica verde por vazio. Este o derruba.
      const app = servidor({
        // `displayName` com o UUID DENTRO, de proposito: ele sai no corpo.
        itens: [indicacao({ displayName: `Clínica ${QUEM_CHAMA}` })],
      });
      const resposta = await listar(app);

      assert.ok(
        resposta.bruto.includes(QUEM_CHAMA),
        'a varredura precisa achar o UUID quando ele esta no corpo, senao o caso irmao aprova por nao enxergar',
      );
    });
  });

  void describe('ISCA 4 — conta desabilitada nao lista', () => {
    void it('lista vazia e 200 com items e total, nunca 404 nem 403', async () => {
      // O dobre devolve vazio porque quem filtra e o `WHERE` da funcao do
      // banco (`conta_habilitada`, migracao 20261018000003). O que ESTE caso
      // prova e a borda: vazio vira `200` com a forma completa, e nao um
      // `404`, um `403` nem um corpo sem `items` -- que e o que faria a tela
      // mostrar erro onde o certo e mostrar a lista vazia.
      const app = servidor({ itens: [], total: 0 });
      const resposta = await listar(app);

      assert.equal(resposta.status, 200);
      assert.deepEqual(itensDe(resposta), []);
      assert.equal(resposta.corpo['total'], 0);
      assert.equal(resposta.corpo['page'], 1);
      assert.equal(resposta.corpo['limit'], 20);
    });
  });

  void describe('o filtro de estado e do SERVIDOR', () => {
    void it('`state=declined` chega ao recorte', async () => {
      const app = servidor({ itens: [], total: 0 });
      const resposta = await listar(app, { busca: '?state=declined' });

      assert.equal(resposta.status, 200);
      assert.equal(recortes[0]?.reviewStatus, 'declined');
    });

    void it('CONTRAPESO: sem `state`, o recorte NAO filtra', async () => {
      // Sem este caso, um estado padrao (`pending`, por exemplo) passaria no
      // de cima -- e a tela abriria escondendo as aprovadas e as recusadas,
      // que e justamente o que o cliente pediu para ver.
      const app = servidor({ itens: [indicacao()] });
      await listar(app);

      assert.equal(recortes[0]?.reviewStatus, undefined);
    });

    void it('estado fora da lista fechada e recusado pelo contrato', async () => {
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, { busca: '?state=arquivada' });

      assert.equal(resposta.status, 400);
      // O CONTRAPESO: recusado sem consultar nada.
      assert.deepEqual(recortes, []);
    });
  });

  void describe('a paginacao vem do contrato', () => {
    void it('`page` e `limit` chegam ao recorte', async () => {
      const app = servidor({ itens: [indicacao()], total: 42 });
      const resposta = await listar(app, { busca: '?page=2&limit=5' });

      assert.equal(resposta.status, 200);
      assert.equal(recortes[0]?.page, 2);
      assert.equal(recortes[0]?.limit, 5);
      assert.equal(resposta.corpo['total'], 42);
    });

    void it('`page=0` e recusado pelo esquema do contrato, e nao por um `if` daqui', async () => {
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, { busca: '?page=0' });

      assert.equal(resposta.status, 400);
      // O CONTRAPESO: recusado sem consultar nada.
      assert.deepEqual(recortes, []);
    });

    void it('`limit=21` passa do teto do contrato e e recusado', async () => {
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, { busca: '?limit=21' });

      assert.equal(resposta.status, 400);
      assert.deepEqual(recortes, []);
    });
  });

  void describe('entrada em RASCUNHO nao promete link', () => {
    void it('aprovada sem entrada publicada vem com `entry_slug` nulo', async () => {
      // Entrada nascida de indicacao com contato `website`/`instagram` nasce
      // `draft` (sem `phone_e164`), e `Perto` so lista `published`. Quem anula
      // o `slug` e o `WHERE` da funcao do banco; aqui prova-se que a borda
      // ENTREGA o nulo em vez de inventar um endereco.
      const app = servidor({
        itens: [
          indicacao({
            reviewStatus: 'approved',
            decidedAt: DECIDIDO_EM,
            contatoKind: 'website',
            contatoValue: 'https://clinica.example',
            entradaSlug: null,
          }),
        ],
      });
      const resposta = await listar(app);

      assert.equal(itensDe(resposta)[0]?.['review_status'], 'approved');
      assert.equal(itensDe(resposta)[0]?.['entry_slug'], null);
    });
  });

  void describe('o recado para quem revisa NAO volta para quem indicou', () => {
    void it('`note` nao sai nesta projecao', async () => {
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app);

      // `note` e o recado PARA QUEM REVISA (ADR-0011 secao 5.4). Quem o le e o
      // painel; aqui ele nao esta nem no tipo nem no contrato, e este caso
      // reprova se alguem o acrescentar sem decidir.
      assert.ok(!('note' in (itensDe(resposta)[0] ?? {})));
    });
  });
});

void describe('o adaptador le pela FUNCAO, e nao pela tabela', () => {
  // Esta isca nao sobe servidor: ela guarda o CAMINHO ate o banco. Sem ela,
  // trocar `indicacoes_do_autor(...)` por um `WHERE` direto na tabela passaria
  // em todos os casos acima -- o dobre nao sabe de SQL -- e reprovaria so no
  // portao de colunas que nao saem, que e outro job e outra mensagem.
  const fonte = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.ts',
    ),
    'utf8',
  );

  void it('chama `indicacoes_do_autor(` nas DUAS consultas, e nao em uma', () => {
    // Duas, e nao "ao menos uma": sao duas consultas (as linhas e o total), e
    // uma delas sozinha mantinha a isca verde enquanto a outra lia a tabela
    // direto. Foi exatamente isso que a prova por desligamento mostrou.
    const vezes = fonte.split('indicacoes_do_autor(').length - 1;
    assert.ok(
      vezes >= 2,
      `REPROVA: achei ${vezes} chamada(s) de indicacoes_do_autor( e esperava ao menos 2 -- as linhas e o total. ` +
        'A funcao da migracao 20261018000003 existe porque o nome da coluna de autoria nao pode ser escrito em ' +
        '`src/`, e porque um predicado booleano no `WHERE` impediria o indice `directory_suggestions_do_autor` ' +
        'de ser usado. Uma das duas consultas lendo a tabela direto perde as duas coisas.',
    );
  });

  void it('nao le a tabela direto em consulta nenhuma', () => {
    // A isca de verdade. `FROM <tabela>` em qualquer consulta deste arquivo
    // significa que a autoria voltou a ser filtro de TypeScript -- ou, pior,
    // que deixou de ser filtro. A ESCRITA nao casa aqui: ela passa por
    // `directory_suggestions_registrar(`, que e funcao e nao `FROM`.
    const leituraDireta = `FROM ${['directory', 'suggestions'].join('_')}`;
    assert.ok(
      !fonte.includes(leituraDireta),
      `REPROVA: achei "${leituraDireta}" neste adaptador. A leitura da fila por autoria passa pela funcao ` +
        '`indicacoes_do_autor(uuid)`, e nao pela tabela: e o `WHERE` dela que e a autorizacao.',
    );
  });

  void it('nao filtra a tabela por autoria em TypeScript', () => {
    // O nome literal da coluna nao pode nem aparecer aqui, nem em comentario:
    // `portao-colunas-que-nao-saem.ts` varre este arquivo tambem. Entao a
    // conferencia e por MONTAGEM: 'suggested' mais 'by' mais o sufixo.
    const proibido = ['suggested', 'by', 'user', 'id'].join('_');
    assert.ok(
      !fonte.includes(proibido),
      'REPROVA: o nome da coluna de autoria nao pode ser escrito em `src/` (marca `NUNCA sai do servidor`, migracao 20261017000004).',
    );
  });
});
