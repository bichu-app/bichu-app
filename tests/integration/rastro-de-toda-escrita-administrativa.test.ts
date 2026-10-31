/**
 * **O PORTÃO DA CLASSE: operação administrativa que declara `x-audit` tem de
 * produzir linha em `audit.events` quando EXERCITADA** (BICHUS-319).
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO MEDE, E POR QUE NENHUM OUTRO PORTÃO MEDIA ISSO
 * ===========================================================================
 * `src/tools/portao-contrato-administrativo.ts` (regra 2) confere que toda
 * escrita sob `/admin/` **declara** `x-audit` com `action` e `resource_kind`.
 * Declaração não é escrita. O defeito que originou esta tarefa foi exatamente
 * a diferença entre as duas: uma rota administrativa declarava `x-audit`, o
 * portão aprovava a declaração, **nada escrevia**, a rota respondia 200, a
 * coluna mudava, e `audit.events` ficava vazia.
 *
 * Nenhuma varredura de código fecha essa diferença. O módulo pode não citar
 * `EscritaAuditada` nem `auditavel` e ainda assim gravar, porque a trilha
 * transacional é INJETADA no repositório (`registrarNaTrilha`) --
 * `admin-network-routes.ts` tem oito escritas e zero menções, e as oito
 * gravam. Ausência de menção não prova ausência de rastro, e presença de
 * menção não prova que a linha nasce naquela operação.
 *
 * O que prova é exercitar a operação e LER a tabela. É o que este arquivo faz,
 * uma operação por caso.
 *
 * ===========================================================================
 * CONTRA A API DE VERDADE, E NÃO CONTRA UMA INSTÂNCIA MONTADA AQUI
 * ===========================================================================
 * Os casos chamam `http://api:3000` -- o serviço `api` da pilha efêmera, que
 * roda `dist/bin/api.js` da IMAGEM, com a fiação de `src/bin/api.ts` inteira.
 * Montar as rotas aqui com dublês provaria a fiação deste arquivo, não a que
 * sobe. A `escritaAuditada` e a `criarTrilhaTransacional` que gravam são as de
 * produção, e o banco é o mesmo que a suite lê.
 *
 * ===========================================================================
 * A LISTA SAI DO CONTRATO, E A COBERTURA É EXIGIDA
 * ===========================================================================
 * `ESCRITAS` é derivada de `api/openapi.yaml`: toda operação sob `/admin/` com
 * método que não é `get`. Operação nova entra na lista sem ninguém editar este
 * arquivo -- e **reprova no caso de cobertura** enquanto não tiver exercício
 * aqui. Zero escritas também reprova: filtro que não casa nada devolveria
 * verde sem medir.
 *
 * ## Os controles, porque todo zero precisa de um
 *
 * - **positivo (a API)**: `/v1/health` responde 200. Sem isto, todo caso
 *   reprovaria por rede e pareceria falta de trilha.
 * - **positivo (a consulta)**: a soma das linhas achadas no arquivo é > 0.
 * - **negativo (a consulta)**: uma correlação nunca usada casa ZERO linhas. É
 *   o que separa "a consulta acha qualquer coisa" de "a consulta acha a linha
 *   desta operação".
 * - **negativo (o estado)**: `publishAdminStoreItem` chamada DUAS vezes grava
 *   uma linha só. A segunda responde 200 e não muda coluna nenhuma, e é o
 *   único 200-sem-linha que este portão aceita, nomeado.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken } from '../../src/shared/crypto/digest.js';
import { carregarContrato, type OperacaoDoContrato } from '../../src/shared/http/contract.js';
import { derivarTokenAntiCsrf } from '../../src/modules/admin-access/domain/sessao-administrativa.js';
import { gerarHashDeSenha } from '../../src/modules/identity/ports/senha.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AdminAccountId } from '../../src/shared/types/brands.js';

/**
 * O contrato é lido no escopo do módulo, e não no `before`: a lista de
 * operações precisa existir ANTES de `describe` para virar um caso por
 * operação no TAP. `loadAppConfig` e `carregarContrato` são síncronos.
 */
const config = loadAppConfig();
const contrato = carregarContrato(config.openapiSpecPath);

/**
 * A API de verdade, pelo nome do serviço dentro da rede da pilha efêmera. A
 * variável existe para quem rodar a suite contra outra instância; o padrão é o
 * serviço que `infra/integracao/rodar.mjs` sobe.
 */
const BASE = process.env['API_INTERNA_BASE_URL'] ?? 'http://api:3000';
/**
 * `ADMIN_ORIGIN` do ambiente: a guarda compara a origem EXATA (ADR-0027 item
 * 3). Ausente, o arquivo REPROVA aqui e não com 403 em trinta e quatro casos.
 */
const ORIGEM = (() => {
  const origem = config.adminOrigin;
  if (origem === undefined || origem === '') {
    throw new Error(
      'ADMIN_ORIGIN não está no ambiente. A guarda administrativa recusaria toda ' +
        'chamada deste arquivo com 403 de origem, e o relatório diria "sem trilha" ' +
        'onde o problema é ambiente.',
    );
  }
  return origem;
})();
const SENHA = 'uma frase longa que so esta suite de integracao conhece';
/** O mesmo de `captcha-de-desenvolvimento-local.ts`, ligado no serviço `api`. */
const TOKEN_DE_CAPTCHA = 'desenvolvimento-sem-chave-de-captcha';

/** Toda operação administrativa que muda estado, lida do contrato. */
const ESCRITAS: readonly OperacaoDoContrato[] = [...contrato.operacoes.values()]
  .filter((op) => op.path.startsWith('/admin/') && op.method !== 'get')
  .sort((a, b) => a.operationId.localeCompare(b.operationId));

interface DeclaracaoDeTrilha {
  readonly action: string;
  readonly resourceKind: string;
}

function trilhaDeclarada(op: OperacaoDoContrato): DeclaracaoDeTrilha {
  const bruto = op.raw['x-audit'];
  assert.ok(
    typeof bruto === 'object' && bruto !== null,
    `${op.operationId}: escrita sob /admin/ sem x-audit no contrato`,
  );
  const mapa = bruto as Record<string, unknown>;
  assert.equal(typeof mapa['action'], 'string', `${op.operationId}: x-audit sem action`);
  assert.equal(typeof mapa['resource_kind'], 'string', `${op.operationId}: x-audit sem resource_kind`);
  return { action: mapa['action'] as string, resourceKind: mapa['resource_kind'] as string };
}

/** O que um exercício entrega: a chamada concreta que muda estado. */
interface Chamada {
  /** O caminho com os parâmetros já resolvidos, sem o prefixo `/v1`. */
  readonly caminho: string;
  readonly corpo?: unknown;
  /** `If-Match`, quando a operação exige versão. */
  readonly versao?: string;
  /**
   * Quantas linhas da ação declarada a operação deve gravar. O padrão é 1.
   * Operação que grava duas ações distintas na mesma transação continua
   * valendo: a conferência é pela ação declarada no `x-audit`.
   */
  readonly linhasEsperadas?: number;
  /** Cabeçalhos próprios desta chamada (o captcha do login, por exemplo). */
  readonly cabecalhos?: Record<string, string>;
  /** A operação da lista fechada que dispensa sessão (ADR-0027 item 7). */
  readonly semSessao?: boolean;
  /**
   * O ator esperado na linha. O padrão é a conta do painel compartilhada; o
   * "não fui eu" é ANÔNIMO de propósito (D62: quem tem o link provou ter a
   * caixa de entrada, não ser o titular), e `logout-all` usa conta própria
   * para não derrubar a sessão das outras operações.
   */
  readonly ator?: { readonly kind: 'admin' | 'anonymous'; readonly adminId?: string };
  /**
   * A linha tem de trazer `before` ou `after`. O padrão é `true`.
   *
   * As cinco operações de `/admin/auth` passam `false`, e a exceção é nomeada
   * e não conveniência: o recurso delas é a SESSÃO, e sessão não tem retrato de
   * colunas -- o que a trilha tem a dizer sobre ela (a etiqueta, o motivo da
   * revogação, o escopo da reautenticação) vai em `metadata`, que o caso exige
   * em seu lugar. Operação de DOMÍNIO com `retrato: false` seria o defeito que
   * esta tarefa mede, vestido de exceção.
   */
  readonly retrato?: boolean;
}

type Exercicio = () => Promise<Chamada>;

let banco: { db: Db; close: () => Promise<void> };
let admin: { id: AdminAccountId; email: string };
let sessao: { cookie: string; csrf: string };
let phcDaSenha: string;
let linhasAchadas = 0;
const idsDeTeste = criarIdGenerator(() => systemClock.now());

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown> | undefined;
  readonly etag: string | undefined;
}

async function chamar(
  metodo: string,
  caminho: string,
  opcoes: {
    corpo?: unknown;
    versao?: string;
    correlacao?: string;
    comSessao?: boolean;
    cabecalhosExtra?: Record<string, string>;
  } = {},
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = {
    accept: 'application/json',
    'x-internal-surface': 'admin',
    origin: ORIGEM,
    ...(opcoes.correlacao === undefined ? {} : { 'x-correlation-id': opcoes.correlacao }),
    ...(opcoes.comSessao === false ? {} : { cookie: sessao.cookie, 'x-csrf-token': sessao.csrf }),
    ...(opcoes.versao === undefined ? {} : { 'if-match': opcoes.versao }),
    ...opcoes.cabecalhosExtra,
  };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  const resposta = await fetch(`${BASE}/v1${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === '' ? undefined : (JSON.parse(texto) as Record<string, unknown>),
    etag: resposta.headers.get('etag') ?? undefined,
  };
}

/** Uma chamada de MASSA: 2xx exigido, e a falha nomeia o que não foi montado. */
async function montar(
  oque: string,
  metodo: string,
  caminho: string,
  opcoes: { corpo?: unknown; versao?: string } = {},
): Promise<Resposta> {
  const r = await chamar(metodo, caminho, opcoes);
  assert.ok(
    r.status >= 200 && r.status < 300,
    `a massa "${oque}" não foi montada: ${metodo} ${caminho} respondeu ${String(r.status)} ${JSON.stringify(r.corpo)}`,
  );
  return r;
}

/** O `ETag` da resposta, exigido: sem ele a operação seguinte levaria 428. */
function versaoDe(resposta: Resposta, oque: string): string {
  const etag = resposta.etag;
  assert.ok(etag !== undefined, `${oque}: a resposta não trouxe ETag, e o If-Match seguinte é obrigatório`);
  return etag;
}

interface LinhaDaTrilha {
  readonly action: string;
  readonly actor_kind: string;
  readonly actor_admin_id: string | null;
  readonly actor_user_id: string | null;
  readonly resource_kind: string;
  readonly resource_id: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly metadata: unknown;
}

async function trilhaDa(correlacao: string): Promise<LinhaDaTrilha[]> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select([
      'action',
      'actor_kind',
      'actor_admin_id',
      'actor_user_id',
      'resource_kind',
      'resource_id',
      'before',
      'after',
      'metadata',
    ])
    .where('correlation_id', '=', correlacao)
    .execute();
  return linhas;
}

/** O `slug` do tipo de problema da resposta, quando ela é um problema. */
function problemaDe(resposta: Resposta): string | undefined {
  const tipo = resposta.corpo?.['type'];
  return typeof tipo === 'string' ? tipo.split('/').pop() : undefined;
}

function sufixo(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

// ===========================================================================
// AS MASSAS
// ===========================================================================

/** Uma conta do painel, com papel `admin` (o único que abre sessão). */
async function contaDoPainel(phc: string): Promise<{ id: AdminAccountId; email: string }> {
  const email = `rastro-${sufixo()}@exemplo.invalid`;
  const id = randomUUID() as AdminAccountId;
  await banco.db
    .insertInto('admin_accounts')
    .values({
      id,
      email,
      display_name: 'Operacao do portao de rastro',
      password_phc: phc,
      password_updated_at: new Date(),
    })
    .execute();
  return { id, email };
}

/** Sessão gravada direto: o caminho do login tem caso próprio nesta lista. */
async function sessaoDireta(adminAccountId: AdminAccountId): Promise<{ cookie: string; csrf: string }> {
  const valor = `sessao-${randomUUID()}-${randomUUID()}`;
  const { sessions_invalid_before: barreira } = await banco.db
    .selectFrom('admin_accounts')
    .select('sessions_invalid_before')
    .where('id', '=', adminAccountId)
    .executeTakeFirstOrThrow();
  const agora = Math.max(systemClock.now(), barreira.getTime());
  await banco.db
    .insertInto('admin_sessions')
    .values({
      id: randomUUID(),
      admin_account_id: adminAccountId,
      token_hash: hashDeToken(valor),
      csrf_token_hash: hashDeToken(derivarTokenAntiCsrf(valor)),
      created_at: new Date(agora),
      last_seen_at: new Date(agora),
      idle_expires_at: new Date(agora + 30 * 60_000),
      absolute_expires_at: new Date(agora + 12 * 3_600_000),
    })
    .execute();
  return { cookie: `__Host-bichu_adm=${valor}`, csrf: derivarTokenAntiCsrf(valor) };
}

/**
 * Uma conta do app, gravada direto. `public_ref` é `NOT NULL` e sem `DEFAULT`,
 * e `deleted_at` nulo é o que faz `conta_habilitada(uuid)` -- lida pela fila de
 * pedidos e pela fila de indicações -- devolver verdadeiro.
 */
async function contaDoApp(): Promise<string> {
  const id = idsDeTeste.uuidv7();
  await banco.db
    .insertInto('users')
    .values({
      id,
      email: `tutora-${sufixo()}@exemplo.invalid`,
      display_name: 'Tutora do portão de rastro',
      public_ref: refOpaca(),
      email_verified_at: new Date(),
      birth_date: '1990-05-12',
      sessions_invalid_before: new Date(0),
    })
    .execute();
  return id;
}

/**
 * Vinte e dois símbolos de base64url: a forma EXATA que
 * `professional_reviews_ref_formato` e `users.public_ref` exigem, e dentro da
 * faixa de 20 a 32 dos outros `ref` e dos parâmetros de caminho do contrato.
 */
function refOpaca(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Um pedido PENDENTE de participar de encontro PRIVADO publicado, com conta
 * habilitada: as quatro condições que `listarFila` e `encontroAbertoParaDecisao`
 * exigem. Encontro e conta novos a cada chamada, porque
 * `network_event_join_requests_um_por_conta` é único por par e porque `declined`
 * só sai de `pending`.
 */
async function pedidoDeParticipacao(): Promise<string> {
  const tutor = await contaDoApp();
  const agora = new Date();
  const eventoId = idsDeTeste.uuidv7();
  await banco.db
    .insertInto('network_events')
    .values({
      id: eventoId,
      slug: `fila-${sufixo()}`,
      title: 'Caminhada da fila de pedidos',
      summary: 'Encontro privado, só para exercitar a decisão do pedido.',
      place_name: 'Parque da Cidade',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      geo_source: null,
      // NO FUTURO, e com `ends_at`: `encontroAbertoParaDecisao` recusa encontro
      // encerrado, e encontro já começado com `ends_at` nulo CONTA como
      // encerrado. Sem isto a decisão reprovaria com `event-not-open` e o caso
      // mediria a regra do tempo, não a trilha.
      starts_at: new Date(Date.now() + 10 * 86_400_000),
      ends_at: new Date(Date.now() + 10 * 86_400_000 + 7_200_000),
      time_zone: 'America/Sao_Paulo',
      visibility: 'private',
      publication_status: 'published',
      // `network_events_visivel_foi_publicado`: `published` sem instante é
      // recusado pelo banco.
      published_at: agora,
      origin: 'admin',
    })
    .execute();
  const ref = refOpaca();
  await banco.db
    .insertInto('network_event_join_requests')
    .values({
      id: idsDeTeste.uuidv7(),
      ref,
      event_id: eventoId,
      user_id: tutor,
      status: 'pending',
      requested_at: agora,
      decided_at: null,
      withdrawn_at: null,
    })
    .execute();
  return ref;
}

/** Uma entrada do diretório gravada direto, sem passar pelo painel. */
async function localDoDiretorio(): Promise<string> {
  const id = idsDeTeste.uuidv7();
  await banco.db
    .insertInto('professionals')
    .values({
      id,
      kinds: ['clinic'],
      display_name: `Clínica do portão de rastro ${sufixo()}`,
      // `import` + `unclaimed`: `professionals_aceite_antes_do_perfil` exige
      // `source = 'import'` para entrada sem dono, e
      // `professionals_titularidade_tem_marco` cobraria `claimed_at` no padrão
      // `claimed`.
      source: 'import',
      claim_status: 'unclaimed',
      city: 'São Paulo',
      state: 'SP',
    })
    .execute();
  return id;
}

/**
 * Uma avaliação PUBLICADA. `removerAvaliacao` é um `UPDATE ... WHERE ref = ? AND
 * status = 'published'`: segunda remoção do mesmo `ref` devolve 404.
 */
async function avaliacaoDoDiretorio(): Promise<string> {
  const ref = refOpaca();
  await banco.db
    .insertInto('professional_reviews')
    .values({
      id: idsDeTeste.uuidv7(),
      ref,
      professional_id: await localDoDiretorio(),
      author_user_id: await contaDoApp(),
      rating: 4,
      body: 'Atendimento bom.',
      status: 'published',
      // `professional_reviews_moderacao_tem_motivo`: publicada exige os DOIS
      // nulos.
      moderation_reason: null,
      moderated_at: null,
    })
    .execute();
  return ref;
}

/**
 * Uma indicação PENDENTE, pela função do banco e não por `insertInto`.
 *
 * `directory_suggestions.suggested_by_user_id` é `NOT NULL` e **não existe** no
 * tipo `DirectorySuggestionsTable`: a coluna leva a marca de "nunca sai do
 * servidor" e `src/tools/portao-colunas-que-nao-saem.ts` reprova o nome dela em
 * `src/`. O caminho é `directory_suggestions_registrar`, a MESMA função que a
 * rota do aplicativo chama. São QUATORZE argumentos desde a `20261029000004`:
 * assinatura diferente é outra função no Postgres, e número errado dá `42883`.
 */
async function indicacaoDoDiretorio(): Promise<string> {
  const ref = refOpaca();
  await sql`
    select directory_suggestions_registrar(
      ${idsDeTeste.uuidv7()}::uuid, ${ref}, ${await contaDoApp()}::uuid,
      ${`Clínica indicada ${sufixo()}`}, 'clinic', 'organization',
      'São Paulo', 'SP', 'Bela Vista',
      ${null}::text,
      'phone', '+551130612200', ${null}::text,
      ${null}::uuid)
  `.execute(banco.db);
  return ref;
}

async function parceiroDaLoja(): Promise<string> {
  const slug = `parceiro-${sufixo()}`;
  await montar('parceiro da loja', 'POST', '/admin/store/partners', {
    corpo: { slug, name: 'Parceiro de teste', site_url: 'https://parceiro.exemplo.invalid' },
  });
  return slug;
}

async function tagDaLoja(): Promise<{ slug: string; versao: string }> {
  const r = await montar('tag da loja', 'POST', '/admin/store/tags', {
    corpo: { label: `Etiqueta ${sufixo()}` },
  });
  const slug = r.corpo?.['slug'];
  assert.equal(typeof slug, 'string', `a tag criada não devolveu slug: ${JSON.stringify(r.corpo)}`);
  return { slug: slug as string, versao: versaoDe(r, 'tag da loja') };
}

/**
 * Um item com TUDO o que `faltaParaPublicar` exige: parceiro, descrição,
 * categoria, destino e espécie. Sem isso `publishAdminStoreItem` reprovaria em
 * 400 e o caso mediria validação, não trilha.
 */
async function itemDaLoja(): Promise<{ slug: string; versao: string }> {
  const slug = `item-${sufixo()}`;
  const r = await montar('item da loja', 'POST', '/admin/store/items', {
    corpo: {
      slug,
      partner_slug: await parceiroDaLoja(),
      title: 'Item de teste do portão de rastro',
      summary: 'Uma descrição curta, só para o item poder ser publicado.',
      category: 'food',
      target_url: 'https://parceiro.exemplo.invalid/item',
      species: ['dog'],
    },
  });
  return { slug, versao: versaoDe(r, 'item da loja') };
}

interface Encontro {
  readonly slug: string;
  readonly versao: string;
}

async function encontroDaRede(extra: Record<string, unknown> = {}): Promise<Encontro> {
  const slug = `encontro-${sufixo()}`;
  const r = await montar('encontro da rede', 'POST', '/admin/network/events', {
    corpo: {
      slug,
      title: 'Encontro de teste do portão de rastro',
      summary: 'Um encontro só para exercitar a escrita administrativa.',
      place: {
        place_name: 'Praça de teste',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
      },
      starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      ...extra,
    },
  });
  return { slug, versao: versaoDe(r, 'encontro da rede') };
}

async function entradaDoDiretorio(): Promise<{ slug: string; versao: string }> {
  const slug = `entrada-${sufixo()}`;
  const r = await montar('entrada do diretório', 'POST', '/admin/directory/entries', {
    corpo: {
      slug,
      kinds: ['vet'],
      entity_kind: 'organization',
      display_name: 'Clínica de teste do portão de rastro',
      city: 'São Paulo',
      state: 'SP',
      // Obrigatório na criação: sem ele a resposta é 400 `phone_e164 required`.
      phone_e164: '+551130612200',
    },
  });
  return { slug, versao: versaoDe(r, 'entrada do diretório') };
}

/**
 * Uma denúncia ABERTA de avaliação, a origem mais barata de montar.
 *
 * `ModerationOrigin` tem cinco valores no contrato, e `src/` implementa DUAS:
 * `OrigemDaDenuncia = 'review' | 'conversation'`. A `review` é a que não exige
 * conversa, achado e pet antes.
 *
 * O que `lerItem` exige: `origin`, `target_ref`, `reporter_active` (que delega
 * a `conta_habilitada(reporter_user_id)`) e `resolved_at IS NULL`. Denúncia já
 * resolvida responde 400 `report_already_resolved` -- por isso cada uma das
 * duas rotas recebe a SUA instância.
 */
async function denunciaNaFila(): Promise<{ origem: string; targetRef: string }> {
  const denunciante = await contaDoApp();
  const local = await localDoDiretorio();
  const avaliacao = idsDeTeste.uuidv7();
  const refDaAvaliacao = refOpaca();
  await banco.db
    .insertInto('professional_reviews')
    .values({
      id: avaliacao,
      ref: refDaAvaliacao,
      professional_id: local,
      author_user_id: denunciante,
      rating: 2,
      // Sem `<` nem `>`: `professional_reviews_body_sem_html` recusa marcação.
      body: 'Texto da avaliacao denunciada, sem simbolo de marcacao.',
      // `published` é pré-condição da remoção: o UPDATE tem
      // `WHERE status = 'published'`, e sem isso a rota responde 404.
      status: 'published',
      moderation_reason: null,
      moderated_at: null,
    })
    .execute();
  await banco.db
    .insertInto('professional_review_reports')
    .values({
      id: idsDeTeste.uuidv7(),
      review_id: avaliacao,
      reporter_user_id: denunciante,
      reason: 'offensive',
      detail: 'Denuncia aberta, para a fila do painel ter o que decidir.',
    })
    .execute();
  return { origem: 'review', targetRef: refDaAvaliacao };
}

type PassoDaEntrega = 'requested' | 'in_transit' | 'arrived';

/**
 * Um pedido de plaquinha no estado que a rota exige -- e os estados das três
 * rotas são INCOMPATÍVEIS, por isso os parâmetros:
 *
 * - `/fulfillment` e `/decline`: `status = 'pending'` (`decidir` recusa com 400
 *   `request_not_pending`), e a primeira decisão tira o pedido de `pending`:
 *   uma instância para cada;
 * - `/delivery` com `in_transit`: `status = 'fulfilled'` e
 *   `delivery_state = 'requested'`. De `requested` direto para `arrived` é 400
 *   `invalid_delivery_transition`.
 *
 * Um pet por chamada é obrigatório: `collar_tag_requests_um_pendente_por_pet`
 * é único por pet enquanto `status = 'pending'`.
 */
async function pedidoDePlaquinha(
  estado: 'pending' | 'fulfilled' = 'pending',
  passo: PassoDaEntrega = 'requested',
): Promise<string> {
  const tutor = await contaDoApp();
  const pet = idsDeTeste.uuidv7();
  const ref = refOpaca();
  const agora = new Date();
  await banco.db
    .insertInto('pets')
    .values({ id: pet, owner_user_id: tutor, name: 'Pet do portão', species_code: 'dog', size_code: 'M' })
    .execute();
  await banco.db
    .insertInto('collar_tag_requests')
    .values({
      id: idsDeTeste.uuidv7(),
      ref,
      pet_id: pet,
      requested_by: tutor,
      recipient_name: 'Quem recebe a plaquinha',
      recipient_phone: '+5511999990000',
      postal_code: '01311000',
      street: 'Avenida de teste',
      street_number: '120A',
      neighborhood: 'Bairro de teste',
      city: 'São Paulo',
      state: 'SP',
      status: estado,
      // `collar_tag_requests_decidido_tem_instante`: decidido exige instante.
      ...(estado === 'pending' ? {} : { decided_at: agora }),
      delivery_state: passo,
      // `..._despacho_tem_instante` e `..._chegada_tem_instante`.
      ...(passo === 'requested' ? {} : { shipped_at: agora }),
      ...(passo === 'arrived' ? { delivered_at: agora } : {}),
    })
    .execute();
  return ref;
}

/** Uma dúvida ABERTA: `attended_at` nulo é o que a deixa aberta. */
async function duvidaDeAjuda(): Promise<string> {
  const ref = refOpaca();
  await banco.db
    .insertInto('help_requests')
    .values({
      id: idsDeTeste.uuidv7(),
      ref,
      author_user_id: await contaDoApp(),
      subject: 'Dúvida do portão de rastro',
      body: 'Gravada direto no banco; o painel é quem a marca como atendida.',
    })
    .execute();
  return ref;
}

// ===========================================================================
// OS EXERCÍCIOS, UM POR OPERAÇÃO
// ===========================================================================

const EXERCICIOS: Record<string, Exercicio> = {
  // ---- Loja -------------------------------------------------------------
  createAdminStorePartner: () => {
    return Promise.resolve({
      caminho: '/admin/store/partners',
      corpo: {
        slug: `parceiro-${sufixo()}`,
        name: 'Parceiro novo',
        site_url: 'https://novo.exemplo.invalid',
      },
    });
  },
  updateAdminStorePartner: async () => {
    const slug = await parceiroDaLoja();
    const lido = await montar('leitura do parceiro', 'GET', `/admin/store/partners/${slug}`);
    return {
      caminho: `/admin/store/partners/${slug}`,
      corpo: { name: 'Parceiro com o nome trocado' },
      versao: versaoDe(lido, 'leitura do parceiro'),
    };
  },
  createAdminStoreTag: () => {
    return Promise.resolve({ caminho: '/admin/store/tags', corpo: { label: `Etiqueta ${sufixo()}` } });
  },
  updateAdminStoreTag: async () => {
    const tag = await tagDaLoja();
    // `label` tem teto de 24 no contrato: rótulo mais longo é 400 `maxLength`,
    // e o caso mediria validação em vez de trilha. E renomear exige `If-Match`:
    // sem ele é 428 `precondition-required`.
    return {
      caminho: `/admin/store/tags/${tag.slug}`,
      corpo: { label: `Troca ${sufixo()}` },
      versao: tag.versao,
    };
  },
  createAdminStoreItem: async () => {
    return {
      caminho: '/admin/store/items',
      corpo: {
        slug: `item-${sufixo()}`,
        partner_slug: await parceiroDaLoja(),
        title: 'Item novo',
      },
    };
  },
  updateAdminStoreItem: async () => {
    const item = await itemDaLoja();
    return {
      caminho: `/admin/store/items/${item.slug}`,
      corpo: { title: 'Item com o título trocado' },
      versao: item.versao,
    };
  },
  publishAdminStoreItem: async () => {
    const item = await itemDaLoja();
    return { caminho: `/admin/store/items/${item.slug}/publication`, versao: item.versao };
  },
  retireAdminStoreItem: async () => {
    const item = await itemDaLoja();
    const publicado = await montar('item publicado', 'PUT', `/admin/store/items/${item.slug}/publication`, {
      versao: item.versao,
    });
    return {
      caminho: `/admin/store/items/${item.slug}/publication`,
      versao: versaoDe(publicado, 'item publicado'),
    };
  },

  // ---- Mídia do catálogo -------------------------------------------------
  createAdminCatalogImageIntent: () => {
    return Promise.resolve({
      caminho: '/admin/media/catalog-image-intents',
      corpo: {
        purpose: 'store_item',
        content_type: 'image/jpeg',
        byte_size: 120_000,
        width: 1200,
        height: 900,
      },
    });
  },

  // ---- Rede --------------------------------------------------------------
  createAdminNetworkEvent: () => {
    return Promise.resolve({
      caminho: '/admin/network/events',
      corpo: {
        slug: `encontro-${sufixo()}`,
        title: 'Encontro novo',
        summary: 'Um encontro criado pelo caso de rastro.',
        place: { place_name: 'Parque', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
        starts_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      },
    });
  },
  updateAdminNetworkEvent: async () => {
    const encontro = await encontroDaRede();
    return {
      caminho: `/admin/network/events/${encontro.slug}`,
      corpo: { title: 'Encontro com o título trocado' },
      versao: encontro.versao,
    };
  },
  removeAdminNetworkEvent: async () => {
    const encontro = await encontroDaRede();
    return { caminho: `/admin/network/events/${encontro.slug}`, versao: encontro.versao };
  },
  relocateAdminNetworkEvent: async () => {
    const encontro = await encontroDaRede();
    return {
      caminho: `/admin/network/events/${encontro.slug}/relocation`,
      corpo: {
        place: { place_name: 'Outra praça', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP' },
        reason: 'A praça anterior está em obras.',
      },
      versao: encontro.versao,
    };
  },
  cancelAdminNetworkEvent: async () => {
    const encontro = await encontroDaRede();
    return {
      caminho: `/admin/network/events/${encontro.slug}/cancellation`,
      corpo: { note: 'Chuva forte prevista para o dia.' },
      versao: encontro.versao,
    };
  },
  changeAdminNetworkEventAccess: async () => {
    const encontro = await encontroDaRede();
    return {
      caminho: `/admin/network/events/${encontro.slug}/access`,
      corpo: { visibility: 'private', reason: 'O grupo pediu encontro fechado.' },
      versao: encontro.versao,
    };
  },

  // ---- Diretório ---------------------------------------------------------
  createAdminDirectoryEntry: () => {
    return Promise.resolve({
      caminho: '/admin/directory/entries',
      corpo: {
        slug: `entrada-${sufixo()}`,
        kinds: ['groomer'],
        entity_kind: 'professional',
        display_name: 'Profissional novo',
        city: 'São Paulo',
        state: 'SP',
        phone_e164: '+551130612201',
      },
    });
  },
  updateAdminDirectoryEntry: async () => {
    const entrada = await entradaDoDiretorio();
    return {
      caminho: `/admin/directory/entries/${entrada.slug}`,
      corpo: { display_name: 'Profissional com o nome trocado' },
      versao: entrada.versao,
    };
  },

  removeAdminDirectoryReview: async () => {
    return {
      caminho: `/admin/directory/reviews/${await avaliacaoDoDiretorio()}`,
      corpo: { reason: 'A avaliação cita dado pessoal de terceiro.' },
    };
  },
  approveAdminDirectorySuggestion: async () => {
    return {
      caminho: `/admin/directory/suggestions/${await indicacaoDoDiretorio()}/approval`,
      corpo: { slug: `indicada-${sufixo()}` },
    };
  },
  declineAdminDirectorySuggestion: async () => {
    return {
      caminho: `/admin/directory/suggestions/${await indicacaoDoDiretorio()}/decline`,
      corpo: { reason: 'A indicação não tem como ser conferida.' },
    };
  },

  // ---- Fila de pedidos da Rede -------------------------------------------
  approveAdminNetworkJoinRequest: async () => {
    return { caminho: `/admin/network/join-requests/${await pedidoDeParticipacao()}/approval` };
  },
  declineAdminNetworkJoinRequest: async () => {
    return { caminho: `/admin/network/join-requests/${await pedidoDeParticipacao()}/decline` };
  },

  // ---- Moderação ---------------------------------------------------------
  removeAdminModerationContent: async () => {
    const d = await denunciaNaFila();
    return {
      caminho: `/admin/moderation/reports/${d.origem}/${d.targetRef}/removal`,
      corpo: { reason: 'O texto ofende quem foi avaliado.' },
    };
  },
  dismissAdminModerationReport: async () => {
    const d = await denunciaNaFila();
    return {
      caminho: `/admin/moderation/reports/${d.origem}/${d.targetRef}/dismissal`,
      corpo: { reason: 'A denúncia não aponta nada que viole as regras.' },
    };
  },

  // ---- Fila de plaquinhas -------------------------------------------------
  fulfillAdminCollarTagRequest: async () => {
    return { caminho: `/admin/tag-requests/${await pedidoDePlaquinha()}/fulfillment` };
  },
  declineAdminCollarTagRequest: async () => {
    return { caminho: `/admin/tag-requests/${await pedidoDePlaquinha()}/decline` };
  },
  updateAdminCollarTagRequestDelivery: async () => {
    const ref = await pedidoDePlaquinha('fulfilled', 'requested');
    return {
      caminho: `/admin/tag-requests/${ref}/delivery`,
      corpo: { delivery_state: 'in_transit', tracking_code: 'BR123456789XX' },
    };
  },

  // ---- Fila de ajuda ------------------------------------------------------
  attendAdminHelpRequest: async () => {
    return { caminho: `/admin/help-requests/${await duvidaDeAjuda()}/attendance` };
  },

  // ---- Comunicado --------------------------------------------------------
  dispatchAdminBroadcast: async () => {
    // O TETO DE TRÊS POR DIA, EM UTC, É GLOBAL (migração 20261018000020):
    // `comunicado_disparar` conta `notification_broadcasts` do dia inteiro, de
    // todo mundo, e devolve zero linhas no quarto -- que sai como 409
    // `broadcast-daily-cap-reached`. Sem isto, a segunda execução da suíte
    // contra o MESMO banco reprovava aqui, e o 409 parecia falta de trilha.
    //
    // A limpeza alcança só os comunicados das contas DESTE arquivo: as linhas
    // que `destino-da-notificacao.test.ts` grava e apaga são dele, e apagá-las
    // por baixo quebraria as asserções daquele arquivo.
    await sql`
      delete from notification_broadcasts
       where dispatched_at >= date_trunc('day', now())
         and dispatched_by_admin in (
               select id from admin_accounts where email like 'rastro-%@exemplo.invalid')
    `.execute(banco.db);
    const janela = await montar('janela de disparo', 'GET', '/admin/broadcasts/dispatch-window');
    assert.ok(
      Number(janela.corpo?.['remaining_today'] ?? 0) > 0,
      `o teto diário de comunicados está esgotado (${JSON.stringify(janela.corpo)}). ` +
        `Ele é GLOBAL e em UTC: outro arquivo da suíte gravou em ` +
        `\`notification_broadcasts\` hoje. O 409 que viria daqui parece falta de ` +
        `trilha e não é.`,
    );
    return {
      caminho: '/admin/broadcasts',
      corpo: { title: 'Comunicado de teste', body: 'O corpo do comunicado de teste.' },
    };
  },

  // ---- Sessão do painel ---------------------------------------------------
  //
  // As cinco escritas de `/admin/auth` entram na MESMA lista. Elas já têm prova
  // de trilha por rota em `sessao-administrativa-pelo-http.test.ts` (P17), mas
  // lá o servidor é montado no arquivo, com dublê de captcha e de trilha. Aqui
  // elas passam pelo processo que sobe, como as outras vinte e nove -- e, mais
  // importante, ficam dentro do portão de COBERTURA: operação de sessão nova
  // reprova aqui enquanto não tiver exercício.
  openAdminSession: async () => {
    const conta = await contaDoPainel(phcDaSenha);
    return {
      caminho: '/admin/auth/login',
      corpo: { email: conta.email, password: SENHA },
      semSessao: true,
      cabecalhos: { 'x-captcha-token': TOKEN_DE_CAPTCHA },
      ator: { kind: 'admin' as const, adminId: conta.id },
      retrato: false,
    };
  },
  closeAdminSession: async () => {
    // Sessão PRÓPRIA: fechar a compartilhada deixaria as operações seguintes
    // sem cookie, e o relatório diria "sem trilha" onde o problema é ordem.
    const propria = await sessaoDireta(admin.id);
    return {
      caminho: '/admin/auth/logout',
      cabecalhos: { cookie: propria.cookie, 'x-csrf-token': propria.csrf },
      retrato: false,
    };
  },
  closeAllAdminSessions: async () => {
    // Conta PRÓPRIA: "sair de todas" move `sessions_invalid_before` da conta e
    // derrubaria a sessão compartilhada deste arquivo.
    const conta = await contaDoPainel(phcDaSenha);
    const propria = await sessaoDireta(conta.id);
    return {
      caminho: '/admin/auth/logout-all',
      cabecalhos: { cookie: propria.cookie, 'x-csrf-token': propria.csrf },
      ator: { kind: 'admin' as const, adminId: conta.id },
      retrato: false,
    };
  },
  reauthenticateAdmin: async () => {
    // Sessão PRÓPRIA, e isto foi MEDIDO: reautenticar ROTACIONA a sessão, o
    // cookie antigo passa a responder 401 `token-expired`, e com a sessão
    // compartilhada as onze operações seguintes da ordem alfabética reprovavam
    // por 401 -- onze relatórios de "sem trilha" para um defeito de ordem.
    const propria = await sessaoDireta(admin.id);
    return {
      caminho: '/admin/auth/reauth',
      corpo: { password: SENHA, scope: 'store_item_retirement' },
      cabecalhos: { cookie: propria.cookie, 'x-csrf-token': propria.csrf },
      retrato: false,
    };
  },
  disavowAdminSessionAlert: async () => {
    const alvo = await contaDoPainel(phcDaSenha);
    const token = randomBytes(32).toString('base64url');
    await banco.db
      .insertInto('admin_session_alerts')
      .values({
        id: randomUUID(),
        admin_account_id: alvo.id,
        session_id: null,
        token_hash: hashDeToken(token),
        expires_at: new Date(Date.now() + 7 * 24 * 3_600_000),
      })
      .execute();
    return {
      caminho: '/admin/auth/disavow',
      corpo: { token },
      semSessao: true,
      // ANÔNIMO de propósito (D62): quem tem o link provou ter a caixa de
      // entrada, e não ser o titular. A conta vai como RECURSO, não como ator.
      ator: { kind: 'anonymous' as const },
      retrato: false,
    };
  },
};

// ===========================================================================

before(async () => {
  banco = createDb(config.databaseUrl);
  // Uma derivação de senha para o arquivo inteiro: argon2 é caro de propósito.
  phcDaSenha = await gerarHashDeSenha(SENHA);
  admin = await contaDoPainel(phcDaSenha);
  sessao = await sessaoDireta(admin.id);
});

after(async () => {
  await banco.close();
});

void describe('BICHUS-319: o rastro de TODA escrita administrativa, pela rota e lendo a tabela', () => {
  void it('controle positivo: a API de verdade está de pé e responde /v1/health', async () => {
    const resposta = await fetch(`${BASE}/v1/health`);
    assert.equal(
      resposta.status,
      200,
      `a API de verdade não respondeu em ${BASE}. Sem ela TODO caso deste arquivo ` +
        `reprovaria por rede e pareceria falta de trilha. A pilha sobe o serviço ` +
        `\`api\` em \`infra/integracao/rodar.mjs\`.`,
    );
  });

  void it('a lista de escritas administrativas sai do contrato e não é vazia', () => {
    assert.ok(
      ESCRITAS.length >= 30,
      `o contrato devolveu ${String(ESCRITAS.length)} escritas sob /admin/. ` +
        `Eram 34 em 05d72d5a; menos que 30 é filtro que deixou de casar, e ` +
        `filtro que não casa devolve verde sem medir.`,
    );
    for (const op of ESCRITAS) trilhaDeclarada(op);
  });

  void it('cobertura: toda escrita administrativa do contrato tem exercício aqui', () => {
    const semExercicio = ESCRITAS.filter((op) => EXERCICIOS[op.operationId] === undefined).map(
      (op) => op.operationId,
    );
    assert.deepEqual(
      semExercicio,
      [],
      `escrita administrativa sem exercício neste arquivo. Enquanto ela não for ` +
        `exercitada, ninguém sabe se ela grava em \`audit.events\`: o portão do ` +
        `contrato confere só a DECLARAÇÃO do \`x-audit\`.`,
    );
  });

  void it('controle negativo da consulta: correlação nunca usada casa zero linhas', async () => {
    assert.deepEqual(await trilhaDa(randomUUID()), []);
  });

  for (const op of ESCRITAS) {
    const declarada = trilhaDeclarada(op);
    void it(`${op.operationId} grava \`${declarada.action}\` em audit.events`, async () => {
      const exercicio = EXERCICIOS[op.operationId];
      assert.ok(exercicio !== undefined, `${op.operationId} sem exercício`);
      const chamada = await exercicio();
      const correlacao = randomUUID();
      const resposta = await chamar(op.method.toUpperCase(), chamada.caminho, {
        ...(chamada.corpo === undefined ? {} : { corpo: chamada.corpo }),
        ...(chamada.versao === undefined ? {} : { versao: chamada.versao }),
        ...(chamada.cabecalhos === undefined ? {} : { cabecalhosExtra: chamada.cabecalhos }),
        ...(chamada.semSessao === true ? { comSessao: false } : {}),
        correlacao,
      });
      // A FRASE QUE A PILHA MERECE, ANTES DO VEREDITO GENÉRICO.
      //
      // `captcha-rejected` só chega aqui quando o desafio de desenvolvimento
      // NÃO está ligado no processo que atendeu -- e aí o 403 fala de captcha
      // enquanto o problema é fiação de pilha. Foi assim que a execução
      // 124430445974 reprovou 877 de 878: a variável estava no compose da
      // pilha efêmera, e o job da esteira sobe o `compose.yaml` da raiz.
      // Quem montou a pilha merece ler isto, e não deduzir do 403.
      if (problemaDe(resposta) === 'captcha-rejected') {
        assert.fail(
          `${op.operationId}: 403 \`captcha-rejected\`. O desafio de ` +
            `desenvolvimento do login NÃO está ligado na API que atendeu: falta ` +
            `\`${'CAPTCHA_DESENVOLVIMENTO_LOCAL'}=aprovar-token-de-desenvolvimento\` no ` +
            `ambiente DELA. São DUAS pilhas, e cada uma se liga no seu lugar: o ` +
            `\`environment:\` do serviço \`api\` em ` +
            `\`infra/integracao/compose.integracao.yaml\` (worktree) e o \`.env\` do ` +
            `passo \`ambiente de teste\` do job \`integracao\` de ` +
            `\`.github/workflows/ci.yml\` (esteira). ` +
            `\`src/shared/config/captcha-nas-duas-pilhas.test.ts\` reprova quando as ` +
            `duas divergem; se ele passou e este caso chegou aqui, a api que atendeu ` +
            `não é a da pilha medida.`,
        );
      }
      assert.ok(
        resposta.status >= 200 && resposta.status < 300,
        `${op.operationId}: a operação respondeu ${String(resposta.status)} ` +
          `${JSON.stringify(resposta.corpo)}. O caso mede trilha, e para isso a ` +
          `operação tem de ter ACONTECIDO.`,
      );

      const linhas = await trilhaDa(correlacao);
      const daAcao = linhas.filter((l) => l.action === declarada.action);
      assert.equal(
        daAcao.length,
        chamada.linhasEsperadas ?? 1,
        `${op.operationId}: respondeu ${String(resposta.status)} e \`audit.events\` ` +
          `tem ${String(daAcao.length)} linha(s) de \`${declarada.action}\` nesta ` +
          `correlação (todas as ações vistas: ${JSON.stringify(linhas.map((l) => l.action))}). ` +
          `Zero é o defeito que esta tarefa existe para medir: 2xx, coluna mudada e ` +
          `trilha vazia.`,
      );
      linhasAchadas += daAcao.length;

      const ator = chamada.ator ?? { kind: 'admin' as const, adminId: admin.id };
      for (const linha of daAcao) {
        assert.equal(
          linha.actor_kind,
          ator.kind,
          `${op.operationId}: \`actor_kind\` é \`${linha.actor_kind}\` e o esperado era \`${ator.kind}\``,
        );
        assert.equal(
          linha.actor_admin_id,
          ator.adminId ?? null,
          `${op.operationId}: \`actor_admin_id\` não é a conta do painel que agiu`,
        );
        assert.equal(
          linha.actor_user_id,
          null,
          `${op.operationId}: conta do painel gravada em \`actor_user_id\` (apêndice A.5)`,
        );
        assert.equal(
          linha.resource_kind,
          declarada.resourceKind,
          `${op.operationId}: \`resource_kind\` diverge do \`x-audit\` do contrato`,
        );
        assert.notEqual(linha.resource_id, null, `${op.operationId}: sem \`resource_id\``);
        if (chamada.retrato === false) {
          assert.notEqual(
            linha.metadata,
            null,
            `${op.operationId}: linha de sessão sem \`metadata\`. Sem retrato de ` +
              `colunas E sem metadata, a linha responde "alguém mexeu" e nada mais.`,
          );
        } else {
          assert.ok(
            linha.before !== null || linha.after !== null,
            `${op.operationId}: linha sem antes NEM depois. A trilha existe para dizer ` +
              `o que mudou; linha sem retrato responde "alguém mexeu" e nada mais.`,
          );
        }
      }
    });
  }

  void it('controle positivo da consulta: o arquivo achou linha de trilha', () => {
    assert.ok(
      linhasAchadas > 0,
      'nenhuma linha de trilha foi achada no arquivo inteiro: a consulta não mede nada.',
    );
  });

  void it('200 sem linha, nomeado: publicar item já publicado não grava de novo', async () => {
    const item = await itemDaLoja();
    const primeira = randomUUID();
    const publicado = await chamar('PUT', `/admin/store/items/${item.slug}/publication`, {
      versao: item.versao,
      correlacao: primeira,
    });
    assert.equal(publicado.status, 200);
    assert.equal((await trilhaDa(primeira)).length, 1, 'a primeira publicação não gravou');

    const segunda = randomUUID();
    const denovo = await chamar('PUT', `/admin/store/items/${item.slug}/publication`, {
      versao: versaoDe(publicado, 'primeira publicação'),
      correlacao: segunda,
    });
    assert.equal(denovo.status, 200, 'publicar de novo devia ser idempotente');
    assert.deepEqual(
      await trilhaDa(segunda),
      [],
      'publicar item JÁ publicado gravou linha. Não mudou coluna nenhuma: a linha ' +
        'diria que houve mudança onde não houve.',
    );
  });
});
