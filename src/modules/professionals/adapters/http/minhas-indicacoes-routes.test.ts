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

function indicacao(sobre: Partial<MinhaIndicacao> = {}): MinhaIndicacao {
  return {
    ref: 'u7YkQwE2tLm9ZpR4sAbC',
    displayName: 'Clínica Veterinária Santa Bárbara',
    kind: 'clinic',
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
    contrato,
  });
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
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, {
        busca: `?author=${OUTRA_CONTA}&user_id=${OUTRA_CONTA}&suggested_by=${OUTRA_CONTA}`,
      });

      if (resposta.status === 200) {
        assert.equal(recortes[0]?.autor, QUEM_CHAMA);
        assert.notEqual(recortes[0]?.autor, OUTRA_CONTA);
      } else {
        assert.deepEqual(recortes, []);
      }
    });

    void it('CONTRAPESO: duas contas, dois recortes diferentes', async () => {
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

      assert.ok(!resposta.bruto.includes(QUEM_CHAMA));
      assert.ok(!resposta.bruto.includes('suggested_by'));
      for (const item of itensDe(resposta)) {
        assert.ok(!('id' in item), 'nenhum item pode ter `id` (ADR-0010 item 6)');
        assert.ok('reference' in item);
      }
    });

    void it('CONTRAPESO: a varredura do bruto ENXERGA o UUID quando ele esta la', async () => {
      const app = servidor({
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
      const app = servidor({ itens: [indicacao()] });
      await listar(app);

      assert.equal(recortes[0]?.reviewStatus, undefined);
    });

    void it('estado fora da lista fechada e recusado pelo contrato', async () => {
      const app = servidor({ itens: [indicacao()] });
      const resposta = await listar(app, { busca: '?state=arquivada' });

      assert.equal(resposta.status, 400);
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

      assert.ok(!('note' in (itensDe(resposta)[0] ?? {})));
    });
  });
});

void describe('o adaptador le pela FUNCAO, e nao pela tabela', () => {
  const fonte = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.ts',
    ),
    'utf8',
  );

  void it('chama `indicacoes_do_autor(` nas DUAS consultas, e nao em uma', () => {
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
    const leituraDireta = `FROM ${['directory', 'suggestions'].join('_')}`;
    assert.ok(
      !fonte.includes(leituraDireta),
      `REPROVA: achei "${leituraDireta}" neste adaptador. A leitura da fila por autoria passa pela funcao ` +
        '`indicacoes_do_autor(uuid)`, e nao pela tabela: e o `WHERE` dela que e a autorizacao.',
    );
  });

  void it('nao filtra a tabela por autoria em TypeScript', () => {
    const proibido = ['suggested', 'by', 'user', 'id'].join('_');
    assert.ok(
      !fonte.includes(proibido),
      'REPROVA: o nome da coluna de autoria nao pode ser escrito em `src/` (marca `NUNCA sai do servidor`, migracao 20261017000004).',
    );
  });
});
