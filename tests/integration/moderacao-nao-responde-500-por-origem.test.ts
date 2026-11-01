/**
 * **`ModerationOrigin` tem CINCO valores no contrato e `src/` decide DOIS.**
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO MEDE, E A MEDICAO QUE O ORIGINOU
 * ===========================================================================
 * Medido em 31/10/2026 contra a API da pilha efemera, antes de qualquer
 * conserto:
 *
 *   origem        targetRef   GET   removal   dismissal
 *   profile       opaco       404   **500**   **500**
 *   photo         opaco       404   **500**   **500**
 *   publication   opaco       404   **500**   **500**
 *   conversation  opaco       404   **500**   **500**
 *   review        opaco       404    404       404
 *   banana        qualquer    400    400       400
 *
 * E com uma denuncia de perfil DE VERDADE na fila:
 * `listAdminModerationReports` devolve o item (200),
 * `getAdminModerationReport` devolve o item (200), e as DUAS decisoes
 * respondem **500**. O painel mostra um item que ele nao consegue decidir.
 *
 * A CAUSA sao duas, e nao uma:
 *
 * 1. o `origin` do caminho **e** validado contra o `enum` do contrato (o
 *    `banana` acima e a prova: 400 vem de `validacao-de-parametros.ts`, que
 *    instala o schema de `params` do contrato em toda rota). Sao os CINCO
 *    valores declarados que passam, e `src/` so sabe decidir dois: os outros
 *    tres caiam no ramo `else` -- o da conversa --, que compara `targetRef`
 *    com uma coluna `uuid`. `profile_reports.subject_ref`,
 *    `photo_reports.image_public_key` e `publication_reports.publication_ref`
 *    nao sao UUID, e o Postgres lancava `22P02`;
 * 2. a MESMA pedra pega a origem `conversation`, que E implementada:
 *    `ModerationTargetRef` declara `minLength: 20, maxLength: 64, pattern:
 *    ^[A-Za-z0-9_-]+$`, e uma cadeia de 22 simbolos satisfaz o contrato e nao
 *    e UUID.
 *
 * O MINIMO INEGOCIAVEL, e o que este arquivo trava: **rota nao responde 500 a
 * valor que o proprio contrato declara valido.** As tres origens novas passam
 * a responder `400` com `code: origin_not_supported`, e a conversa com
 * `targetRef` de forma impossivel passa a responder `404` -- alvo que nao pode
 * existir nao existe.
 *
 * O QUE ESTE ARQUIVO **NAO** DECIDE: se as tres origens ganham implementacao
 * ou se o contrato encolhe para duas. Isso e decisao do cliente (apaga
 * capacidade prometida), e esta nomeada no relatorio da tarefa.
 *
 * Contra a API de verdade (`http://api:3000`), e nao contra instancia montada
 * aqui: o 500 nascia do Postgres, dentro da transacao do repositorio de
 * producao, e duble de repositorio nao o alcanca.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken } from '../../src/shared/crypto/digest.js';
import { derivarTokenAntiCsrf } from '../../src/modules/admin-access/domain/sessao-administrativa.js';
import { gerarHashDeSenha } from '../../src/modules/identity/ports/senha.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AdminAccountId } from '../../src/shared/types/brands.js';

const config = loadAppConfig();
const BASE = process.env['API_INTERNA_BASE_URL'] ?? 'http://api:3000';

/** A guarda compara a origem EXATA (ADR-0027 item 3); ausente, reprova aqui. */
const ORIGEM_ADMIN = (() => {
  const origem = config.adminOrigin;
  if (origem === undefined || origem === '') {
    throw new Error(
      'ADMIN_ORIGIN nao esta no ambiente. A guarda administrativa recusaria toda ' +
        'chamada deste arquivo com 403 de origem, e o relatorio diria "a rota ' +
        'responde 403" onde o problema e ambiente.',
    );
  }
  return origem;
})();

/** As TRES que o contrato declara e `src/` nao decide. */
const NAO_DECIDIVEIS = ['profile', 'photo', 'publication'] as const;
/** As duas escritas da fila, pelo sufixo do caminho. */
const DECISOES = ['removal', 'dismissal'] as const;
const MOTIVO = { reason: 'Motivo da decisao, com mais de tres simbolos.' };

let banco: { db: Db; close: () => Promise<void> };
let admin: AdminAccountId;
let sessao: { cookie: string; csrf: string };
const ids = criarIdGenerator(() => systemClock.now());

function sufixo(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

/** 22 simbolos de base64url: satisfaz `ModerationTargetRef` e NAO e UUID. */
function refOpaca(): string {
  return randomBytes(16).toString('base64url');
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown> | undefined;
}

async function chamar(
  metodo: string,
  caminho: string,
  opcoes: { corpo?: unknown; correlacao?: string } = {},
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = {
    accept: 'application/json',
    'x-internal-surface': 'admin',
    origin: ORIGEM_ADMIN,
    cookie: sessao.cookie,
    'x-csrf-token': sessao.csrf,
    ...(opcoes.correlacao === undefined ? {} : { 'x-correlation-id': opcoes.correlacao }),
  };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  const r = await fetch(`${BASE}/v1${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await r.text();
  return {
    status: r.status,
    corpo: texto === '' ? undefined : (JSON.parse(texto) as Record<string, unknown>),
  };
}

/** O `slug` do tipo de problema, que e o que o painel decide a tela por. */
function problemaDe(resposta: Resposta): string | undefined {
  const tipo = resposta.corpo?.['type'];
  return typeof tipo === 'string' ? tipo.split('/').pop() : undefined;
}

/** O `code` do erro de campo `origin`, quando a resposta o traz. */
function codigoDaOrigem(resposta: Resposta): string | undefined {
  const erros = resposta.corpo?.['errors'];
  if (!Array.isArray(erros)) return undefined;
  for (const erro of erros as Record<string, unknown>[]) {
    if (erro['field'] === 'origin') return typeof erro['code'] === 'string' ? erro['code'] : undefined;
  }
  return undefined;
}

async function contaDoApp(): Promise<{ id: string; ref: string }> {
  const id = ids.uuidv7();
  const ref = refOpaca();
  await banco.db
    .insertInto('users')
    .values({
      id,
      email: `moderacao-${sufixo()}@exemplo.invalid`,
      display_name: 'Tutora da medicao de origem',
      public_ref: ref,
      email_verified_at: new Date(),
      birth_date: '1990-05-12',
      sessions_invalid_before: new Date(0),
    })
    .execute();
  return { id, ref };
}

/** Uma denuncia ABERTA de PERFIL: a perna da visao que o painel ja lista. */
async function denunciaDePerfil(): Promise<string> {
  const denunciante = await contaDoApp();
  const denunciado = await contaDoApp();
  await banco.db
    .insertInto('profile_reports')
    .values({
      id: ids.uuidv7(),
      subject_user_id: denunciado.id,
      subject_ref: denunciado.ref,
      reporter_user_id: denunciante.id,
      reason: 'harassment',
      detail: 'Denuncia aberta de perfil, para a fila ter o que mostrar.',
    })
    .execute();
  return denunciado.ref;
}

/**
 * Uma denuncia ABERTA de AVALIACAO -- a origem `review`, que e implementada.
 * O CONTROLE POSITIVO deste arquivo: sem ela, um 400 em toda decisao passaria
 * por "a guarda funciona" quando o que havia era a fila inteira quebrada.
 */
async function denunciaDeAvaliacao(): Promise<string> {
  const denunciante = await contaDoApp();
  const local = ids.uuidv7();
  await banco.db
    .insertInto('professionals')
    .values({
      id: local,
      kinds: ['clinic'],
      display_name: `Clinica da medicao de origem ${sufixo()}`,
      source: 'import',
      claim_status: 'unclaimed',
      city: 'Sao Paulo',
      state: 'SP',
    })
    .execute();
  const avaliacao = ids.uuidv7();
  const ref = refOpaca();
  await banco.db
    .insertInto('professional_reviews')
    .values({
      id: avaliacao,
      ref,
      professional_id: local,
      author_user_id: denunciante.id,
      rating: 2,
      body: 'Texto da avaliacao denunciada, sem simbolo de marcacao.',
      status: 'published',
      moderation_reason: null,
      moderated_at: null,
    })
    .execute();
  await banco.db
    .insertInto('professional_review_reports')
    .values({
      id: ids.uuidv7(),
      review_id: avaliacao,
      reporter_user_id: denunciante.id,
      reason: 'offensive',
      detail: 'Denuncia aberta, para a decisao ter o que decidir.',
    })
    .execute();
  return ref;
}

async function linhasDaTrilha(correlacao: string): Promise<number> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select('action')
    .where('correlation_id', '=', correlacao)
    .execute();
  return linhas.length;
}

before(async () => {
  banco = createDb(config.databaseUrl);
  admin = randomUUID() as AdminAccountId;
  await banco.db
    .insertInto('admin_accounts')
    .values({
      id: admin,
      email: `moderacao-${sufixo()}@exemplo.invalid`,
      display_name: 'Operacao da medicao de origem',
      password_phc: await gerarHashDeSenha('uma frase longa que so esta suite conhece'),
      password_updated_at: new Date(),
    })
    .execute();
  const valor = `sessao-${randomUUID()}-${randomUUID()}`;
  const agora = systemClock.now();
  await banco.db
    .insertInto('admin_sessions')
    .values({
      id: randomUUID(),
      admin_account_id: admin,
      token_hash: hashDeToken(valor),
      csrf_token_hash: hashDeToken(derivarTokenAntiCsrf(valor)),
      created_at: new Date(agora),
      last_seen_at: new Date(agora),
      idle_expires_at: new Date(agora + 30 * 60_000),
      absolute_expires_at: new Date(agora + 12 * 3_600_000),
    })
    .execute();
  sessao = { cookie: `__Host-bichu_adm=${valor}`, csrf: derivarTokenAntiCsrf(valor) };
});

after(async () => {
  await banco.close();
});

void describe('a fila de moderacao nao responde 500 a origem que o contrato declara', () => {
  void it('controle positivo: a API de verdade esta de pe e responde /v1/health', async () => {
    const resposta = await fetch(`${BASE}/v1/health`);
    assert.equal(
      resposta.status,
      200,
      `a API de verdade nao respondeu em ${BASE}. Sem ela TODO caso deste arquivo ` +
        'reprovaria por rede e pareceria a rota recusando.',
    );
  });

  void it('controle positivo: a origem `review` decide de verdade, e grava trilha', async () => {
    const ref = await denunciaDeAvaliacao();
    const correlacao = randomUUID();
    const r = await chamar('POST', `/admin/moderation/reports/review/${ref}/removal`, {
      corpo: MOTIVO,
      correlacao,
    });
    assert.equal(
      r.status,
      200,
      `a origem implementada parou de decidir: ${String(r.status)} ${JSON.stringify(r.corpo)}. ` +
        'Sem este caso, um 400 em toda decisao passaria por "a guarda funciona".',
    );
    assert.equal(await linhasDaTrilha(correlacao), 1, 'a decisao que ACONTECEU nao gravou trilha');
  });

  for (const origem of NAO_DECIDIVEIS) {
    for (const decisao of DECISOES) {
      void it(`${origem}/${decisao}: 400 \`origin_not_supported\`, e nunca 500`, async () => {
        const r = await chamar(
          'POST',
          `/admin/moderation/reports/${origem}/${refOpaca()}/${decisao}`,
          { corpo: MOTIVO },
        );
        assert.notEqual(
          r.status,
          500,
          `${origem}/${decisao} respondeu 500 a um valor que \`ModerationOrigin\` ` +
            'declara valido. Era o defeito medido em 31/10: o ramo `else` da conversa ' +
            'comparava `targetRef` com coluna `uuid` e o Postgres lancava 22P02.',
        );
        assert.equal(r.status, 400, `esperado 400, veio ${String(r.status)} ${JSON.stringify(r.corpo)}`);
        assert.equal(problemaDe(r), 'validation-failed');
        assert.equal(
          codigoDaOrigem(r),
          'origin_not_supported',
          'o 400 tem de dizer QUAL campo e por que; sem o `code`, o painel so sabe ' +
            'que algo deu errado.',
        );
      });
    }
  }

  void it('conversation com `targetRef` que nao e UUID: 404, e nunca 500', async () => {
    for (const decisao of DECISOES) {
      const r = await chamar(
        'POST',
        `/admin/moderation/reports/conversation/${refOpaca()}/${decisao}`,
        { corpo: MOTIVO },
      );
      assert.notEqual(
        r.status,
        500,
        `conversation/${decisao} respondeu 500. \`ModerationTargetRef\` aceita de 20 a ` +
          '64 simbolos de base64url, e 22 deles nao sao UUID: o contrato declara o ' +
          'valor valido e a origem E implementada.',
      );
      assert.equal(r.status, 404, `esperado 404, veio ${String(r.status)} ${JSON.stringify(r.corpo)}`);
    }
  });

  void it('denuncia de perfil DE VERDADE na fila: lista e le, recusa decidir, e NAO grava trilha', async () => {
    const ref = await denunciaDePerfil();

    const lista = await chamar('GET', '/admin/moderation/reports?origin=profile');
    assert.equal(lista.status, 200);
    const itens = (lista.corpo?.['items'] ?? []) as Record<string, unknown>[];
    assert.ok(
      itens.some((i) => i['target_ref'] === ref),
      'a fila nao mostrou a denuncia de perfil que acabou de ser gravada. Sem isto o ' +
        'caso mediria o nada: a recusa de decidir seria sobre item que nem aparece.',
    );

    const leitura = await chamar('GET', `/admin/moderation/reports/profile/${ref}`);
    assert.equal(
      leitura.status,
      200,
      'a LEITURA da origem `profile` parou de responder. Ela funcionava antes do ' +
        'conserto, e estreitar o que o contrato promete e decisao do cliente, nao deste arquivo.',
    );

    for (const decisao of DECISOES) {
      const correlacao = randomUUID();
      const r = await chamar('POST', `/admin/moderation/reports/profile/${ref}/${decisao}`, {
        corpo: MOTIVO,
        correlacao,
      });
      assert.notEqual(r.status, 500, `${decisao} sobre denuncia de perfil real respondeu 500`);
      assert.equal(r.status, 400, `esperado 400, veio ${String(r.status)} ${JSON.stringify(r.corpo)}`);
      assert.equal(
        await linhasDaTrilha(correlacao),
        0,
        'a recusa gravou linha em `audit.events`. Nada mudou: a linha diria que ' +
          'houve decisao onde nao houve.',
      );
    }
  });

  void it('controle negativo: origem fora do `enum` continua 400 pelo CONTRATO', async () => {
    const r = await chamar('POST', `/admin/moderation/reports/banana/${refOpaca()}/removal`, {
      corpo: MOTIVO,
    });
    assert.equal(r.status, 400, `esperado 400, veio ${String(r.status)}`);
    assert.notEqual(
      codigoDaOrigem(r),
      'origin_not_supported',
      'o `banana` passou pela guarda nova em vez de pelo schema de `params` do ' +
        'contrato. Se a recusa do valor inventado vier da guarda, o schema do ' +
        'contrato deixou de ser instalado e ninguem notaria.',
    );
  });
});
