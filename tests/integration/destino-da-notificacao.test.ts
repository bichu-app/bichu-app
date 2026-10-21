/**
 * O DESTINO DE CADA NOTIFICACAO, contra um Postgres de verdade.
 *
 * Pedido do cliente (20/10/2026): *"tem que ter a pagina interna da
 * notificacao ou o link que leva para a acao que foi notificada"*.
 *
 * ===========================================================================
 * AS NOTIFICACOES NASCEM DOS GATILHOS, E NAO DE `INSERT` NA MAO
 * ===========================================================================
 *
 * **Esta e a decisao mais importante deste arquivo.** Seria MUITO mais curto
 * inserir linhas em `notification_items` com `source_kind` e `source_id`
 * escolhidos por mim e conferir o destino que sai. Isso mediria a minha propria
 * escolha: se o GATILHO gravar um `source_id` diferente do que
 * `notificacao_destino` espera, o recurso esta quebrado em producao e o teste
 * fica verde. E vacuidade -- o defeito recorrente deste repositorio.
 *
 * Entao cada tipo e provocado pelo FATO que o origina: um `INSERT` em
 * `tag_scans`, um `UPDATE` de `status` em `collar_tag_requests`, uma chamada a
 * `comunicado_disparar`. O gatilho da `20261018000020` escreve a linha da
 * caixa, e a leitura resolve o destino sobre o que ELE gravou. Os dois lados
 * sao de migracoes diferentes e nenhum sabe do outro: e justamente essa junta
 * que este arquivo mede.
 *
 * **A unica excecao e o `broadcast`**, e ela esta justificada no proprio lugar:
 * `comunicado_disparar` abre em leque GLOBAL -- uma linha por conta da base
 * inteira --, e chamada daqui ela contaminaria a caixa das contas de todos os
 * outros arquivos da suite, que roda concorrente sobre o mesmo banco. Isso foi
 * MEDIDO: a primeira versao deste arquivo a chamava, e
 * `dispensar-a-notificacao.test.ts` reprovou na linha de base com um aviso que
 * ele nao criou.
 *
 * Quatro tipos tem `source_kind`/`source_id` NAO obvios, e eram onde um teste
 * de `INSERT` na mao erraria calado:
 *
 * - **`neighborhood_alert`**: `source_id` e o DISPARO (`alert_dispatches.id`),
 *   e nao a linha de `alert_recipients` -- que tem chave composta;
 * - **`event_join_decided`**: `source_kind` e `event_join_decision`, e nao
 *   `event_join_request`, embora as duas saiam da MESMA linha;
 * - **`event_cancelled`**: `source_id` e o PROPRIO encontro, e nao um pedido;
 * - **`tag_request_updated`**: `source_kind` carrega o EIXO e o valor
 *   (`collar_tag_status_fulfilled`), e varia.
 *
 * ===========================================================================
 * AS ISCAS
 * ===========================================================================
 *
 * 1. **LINHA DE BASE: os dez tipos nascem.** Antes de afirmar qualquer coisa
 *    sobre destino, este arquivo confere que os dez chegaram a caixa. Sem isso,
 *    toda assercao de destino abaixo passaria por caixa vazia.
 *
 * 2. **CADA TIPO CHEGA AO DESTINO CERTO**, e o esperado e lido da FONTE e nao
 *    escrito a mao: o `slug` conferido e o `slug` que esta em `network_events`,
 *    o token e o `share_token` de `lost_cases`, o `pets.id` e o do pet que eu
 *    criei. Um destino que apontasse para a linha errada -- o pedido em vez do
 *    pet, o achado em vez do caso -- reprova aqui.
 *
 * 3. **`match_suggested` NAO OFERECE TOQUE.** `destination` e
 *    `destination_ref` sao os dois NULOS, porque nao existe tela de confirmar
 *    candidato neste app. Um valor aqui seria um toque para uma tela que nao
 *    existe, que e pior que toque ausente.
 *
 * 4. **DESTINO QUE SUMIU VIRA NULO, e a linha NAO quebra.** O pet escaneado
 *    recebe `deleted_at`; a notificacao CONTINUA na lista -- com `subject` e
 *    data -- e perde so o destino. O `LEFT JOIN LATERAL` e o que garante isso:
 *    com `JOIN` interno a notificacao DESAPARECERIA, trocando "aviso sem
 *    destino" por "aviso que nao existe".
 *
 * 5. **OS DOIS CAMPOS ANDAM JUNTOS.** Nenhuma linha da caixa sai com um
 *    preenchido e o outro nulo, em nenhum dos dez tipos.
 *
 * 6. **O COMUNICADO: o corpo sai para quem RECEBEU e so para ele.**
 *    `getMyBroadcast` devolve 200 com o corpo para o destinatario e **404**
 *    para uma conta que nao recebeu aquele comunicado -- e nunca 403
 *    (ADR-0021), porque um 403 confirmaria que aquele `ref` foi disparado.
 *    CONTRAPESO: o 404 nao e "a rota nao funciona" -- o mesmo `ref` responde
 *    200 para quem recebeu, na mesma execucao.
 *
 * 7. **Ler o comunicado NAO marca o aviso como lido**, medido na coluna.
 *
 * **Verificacao que nao consegue verificar REPROVA.** Sem `DATABASE_URL` o
 * `before` levanta.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

import { criarCaixaDeNotificacoes } from '../../src/modules/notifications/adapters/persistence/kysely-caixa-de-notificacoes.js';
import { registrarRotasDaCaixaDeNotificacoes } from '../../src/modules/notifications/adapters/http/caixa-de-notificacoes-routes.js';
import { CaixaDeNotificacoesService } from '../../src/modules/notifications/application/caixa-de-notificacoes-service.js';
import { createDb, type DbHandle } from '../../src/shared/db/pool.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { problemas } from '../../src/shared/http/errors.js';
import { criarContadorDesligado } from '../../src/shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import type { AbsoluteUrl, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** Prefixo proprio: a limpeza apaga so o que este arquivo criou. */
const PREFIXO = 'isca-destino-';

let banco: DbHandle;
let cliente: pg.Client;
let app: RegistradorDeRotas;

/** O TUTOR: dono dos pets e destinatario da maioria dos avisos. */
let tutor = '';
/** A VIZINHA: recebe o alerta de vizinhanca e NAO recebe o comunicado. */
let vizinha = '';
/** QUEM PEDE: abre o pedido de participacao, para o organizador ser outro. */
let requerente = '';
let admin = '';

/** O que cada fato criou, para o esperado sair da FONTE e nao da minha mao. */
const fonte = {
  petDaPlaquinha: '',
  petDoPedidoDeTag: '',
  achado: '',
  shareTokenDoCaso: '',
  slugDoEncontroDoPedido: '',
  slugDoEncontroCancelado: '',
  refDaIndicacao: '',
  refDoComunicado: '',
};

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

async function chamar(metodo: 'GET', url: string, conta: string | undefined): Promise<Resposta> {
  const r = await app.inject({
    method: metodo,
    url: `/v1${url}`,
    headers: conta === undefined ? {} : { authorization: `Bearer ${conta}` },
  });
  return {
    status: r.statusCode,
    corpo: r.body === '' ? {} : (JSON.parse(r.body) as Record<string, unknown>),
  };
}

interface Linha {
  readonly kind: string;
  readonly subject: string | null;
  readonly destination: string | null;
  readonly destination_ref: string | null;
}

async function linhasDe(conta: string): Promise<Linha[]> {
  const r = await chamar('GET', '/me/notifications?page=1&limit=30', conta);
  assert.equal(r.status, 200, 'REPROVA: a listagem nao respondeu 200');
  return (r.corpo['items'] as Record<string, unknown>[]).map((i) => ({
    kind: i['kind'] as string,
    subject: i['subject'] as string | null,
    destination: i['destination'] as string | null,
    destination_ref: i['destination_ref'] as string | null,
  }));
}

/** A linha de UM tipo, e reprova dizendo o nome do tipo quando ela falta. */
function doTipo(linhas: readonly Linha[], kind: string): Linha {
  const l = linhas.find((x) => x.kind === kind);
  assert.ok(
    l !== undefined,
    `REPROVA: nao ha linha de \`${kind}\` na caixa. O gatilho da fonte nao gravou, e qualquer ` +
      'afirmacao sobre o destino dele passaria por vazio',
  );
  return l;
}

async function criarConta(): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `${PREFIXO}${id}@exemplo-de-teste.invalid`],
  );
  return id;
}

async function criarPet(dono: string, nome: string): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code,
                       primary_color_code, breed_code, sex)
     VALUES ($1, $2, $3, 'dog', 'M', 'caramelo', 'srd_dog', 'male')`,
    [id, dono, nome],
  );
  return id;
}

/** Um `ref` opaco no formato que os `CHECK` do banco exigem. */
function refOpaco(semente: string): string {
  return `${semente}${'A'.repeat(Math.max(0, 22 - semente.length))}`.slice(0, 22);
}

/**
 * OS DEZ FATOS. Cada um provoca o GATILHO que cria a notificacao -- nenhuma
 * linha de `notification_items` e escrita por este arquivo.
 */
async function provocarOsDezFatos(): Promise<void> {
  // ---- 1. `tag_scanned`: alguem escaneou a plaquinha do pet do tutor -------
  fonte.petDaPlaquinha = await criarPet(tutor, 'Tobias');
  const tag = randomUUID();
  await cliente.query(
    `INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix, code_ciphertext, status)
     VALUES ($1, $2, decode(repeat('a1', 32), 'hex'), 'ABCD', decode('00', 'hex'), 'active')`,
    [tag, fonte.petDaPlaquinha],
  );
  await cliente.query(
    `INSERT INTO tag_scans (id, tag_id, scanned_at) VALUES ($1, $2, now() - interval '1 hour')`,
    [randomUUID(), tag],
  );

  // ---- 2. `found_reported`: a vizinha registrou um achado do pet -----------
  const petAchado = await criarPet(tutor, 'Mel');
  fonte.achado = randomUUID();
  await cliente.query(
    `INSERT INTO found_reports (id, origin, reporter_user_id, pet_id, found_at,
                                species, size, found_city, retention_until)
     VALUES ($1, 'stray_report', $2, $3, now() - interval '2 hours',
             'dog', 'M', 'São Paulo', now() + interval '30 days')`,
    [fonte.achado, vizinha, petAchado],
  );

  // ---- 3. `match_suggested`: nasceu um candidato para o caso do tutor ------
  //
  // O caso tambem serve ao `neighborhood_alert` abaixo: e o mesmo
  // `share_token`, e e ele que a isca 2 confere.
  const petPerdido = await criarPet(tutor, 'Pingo');
  const caso = randomUUID();
  fonte.shareTokenDoCaso = refOpaco('cas0Token');
  await cliente.query(
    `INSERT INTO lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_point,
                             last_seen_city, share_token)
     VALUES ($1, $2, $3, now() - interval '2 days',
             ST_SetSRID(ST_MakePoint(-46.63, -23.55), 4326)::geography,
             'São Paulo', $4)`,
    [caso, petPerdido, tutor, fonte.shareTokenDoCaso],
  );
  const achadoDoCandidato = randomUUID();
  await cliente.query(
    `INSERT INTO found_reports (id, origin, reporter_user_id, found_at,
                                species, size, found_city, retention_until)
     VALUES ($1, 'stray_report', $2, now() - interval '1 day',
             'dog', 'M', 'São Paulo', now() + interval '30 days')`,
    [achadoDoCandidato, vizinha],
  );
  await cliente.query(
    `INSERT INTO match_candidates (id, case_id, found_report_id, score, link_origin,
                                   strategy_version)
     VALUES ($1, $2, $3, 0.800, 'attribute_match', 'v1')`,
    [randomUUID(), caso, achadoDoCandidato],
  );

  // ---- 4. `neighborhood_alert`: o caso foi disparado para a VIZINHA --------
  //
  // O gatilho ouve `alert_recipients`, mas grava `source_id` do DISPARO. Se o
  // destino procurasse por `alert_recipients`, ele nao acharia nada.
  const disparo = randomUUID();
  await cliente.query(
    `INSERT INTO alert_dispatches (id, case_id, radius_m, reach_status, recipients_total,
                                   requested_at, dispatched_at)
     VALUES ($1, $2, 5000, 'computed', 1, now() - interval '1 day', now() - interval '1 day')`,
    [disparo, caso],
  );
  await cliente.query(
    `INSERT INTO alert_recipients (dispatch_id, user_id, notified_at)
     VALUES ($1, $2, now() - interval '1 day')`,
    [disparo, vizinha],
  );

  // ---- 5 e 6. `event_join_requested` e `event_join_decided` ---------------
  //
  // UMA linha de pedido produz DOIS avisos, para pessoas diferentes: o pedido
  // vai ao ORGANIZADOR (o tutor) e a resposta vai a QUEM PEDIU (o requerente).
  const encontro = randomUUID();
  // 30 caracteres e o teto do `CHECK network_events_slug_formato`, e
  // `isca-destino-encontro-do-pedido` tinha 31 -- medido, nao suposto.
  fonte.slugDoEncontroDoPedido = `${PREFIXO}enc-do-pedido`;
  await cliente.query(
    `INSERT INTO network_events (id, slug, title, summary, place_name, neighborhood, city,
                                 state, starts_at, ends_at, time_zone, origin,
                                 publication_status, created_by_user_id, published_at)
     VALUES ($1, $2, 'Encontro no parque', 'Um encontro da isca do destino.',
             'Praca da Isca', 'Bairro da Isca', 'São Paulo', 'SP',
             now() + interval '2 days', now() + interval '2 days 2 hours',
             'America/Sao_Paulo', 'community', 'published', $3, now() - interval '5 days')`,
    [encontro, fonte.slugDoEncontroDoPedido, tutor],
  );
  const pedido = randomUUID();
  await cliente.query(
    `INSERT INTO network_event_join_requests (id, ref, event_id, user_id, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [pedido, refOpaco('pedid0Part'), encontro, requerente],
  );
  // O `UPDATE` de `status` e o que dispara o aviso de RESPOSTA.
  await cliente.query(
    `UPDATE network_event_join_requests SET status = 'approved', decided_at = now() WHERE id = $1`,
    [pedido],
  );

  // ---- 7. `event_cancelled`: o encontro com pedido APROVADO foi cancelado --
  const cancelado = randomUUID();
  fonte.slugDoEncontroCancelado = `${PREFIXO}enc-cancelado`;
  await cliente.query(
    `INSERT INTO network_events (id, slug, title, summary, place_name, neighborhood, city,
                                 state, starts_at, ends_at, time_zone, origin,
                                 publication_status, created_by_user_id, published_at)
     VALUES ($1, $2, 'Encontro que caiu', 'Outro encontro da isca.',
             'Praca da Isca', 'Bairro da Isca', 'São Paulo', 'SP',
             now() + interval '3 days', now() + interval '3 days 2 hours',
             'America/Sao_Paulo', 'community', 'published', $3, now() - interval '5 days')`,
    [cancelado, fonte.slugDoEncontroCancelado, requerente],
  );
  await cliente.query(
    `INSERT INTO network_event_join_requests (id, ref, event_id, user_id, status, decided_at)
     VALUES ($1, $2, $3, $4, 'approved', now())`,
    [randomUUID(), refOpaco('pedid0Canc'), cancelado, tutor],
  );
  await cliente.query(
    `UPDATE network_events SET publication_status = 'cancelled', cancelled_at = now(),
            cancellation_note = 'Chuva forte prevista.'
      WHERE id = $1`,
    [cancelado],
  );

  // ---- 8. `suggestion_decided`: a indicacao do tutor foi aprovada ---------
  const indicacao = randomUUID();
  fonte.refDaIndicacao = refOpaco('indica0Ref');
  await cliente.query(
    `INSERT INTO directory_suggestions (id, ref, suggested_by_user_id, display_name, kind,
                                        city, state, contact_kind, contact_value)
     VALUES ($1, $2, $3, 'Clinica da Isca', 'clinic', 'São Paulo', 'SP', 'phone', '+5511999990000')`,
    [indicacao, fonte.refDaIndicacao, tutor],
  );
  await cliente.query(
    `UPDATE directory_suggestions SET review_status = 'approved', decided_at = now() WHERE id = $1`,
    [indicacao],
  );

  // ---- 9. `tag_request_updated`: o pedido da plaquinha foi atendido -------
  //
  // O destino aqui e o PET e nao o pedido: a tela de acompanhamento e
  // enderecada por pet.
  fonte.petDoPedidoDeTag = await criarPet(tutor, 'Nina');
  const pedidoDeTag = randomUUID();
  await cliente.query(
    `INSERT INTO collar_tag_requests (id, ref, pet_id, requested_by, recipient_name,
                                      recipient_phone, postal_code, street, street_number,
                                      neighborhood, city, state)
     VALUES ($1, $2, $3, $4, 'Quem Recebe', '+5511999990000', '01310100',
             'Avenida da Isca', '100', 'Bairro da Isca', 'São Paulo', 'SP')`,
    [pedidoDeTag, refOpaco('tagReq0Ref'), fonte.petDoPedidoDeTag, tutor],
  );
  await cliente.query(
    `UPDATE collar_tag_requests SET status = 'fulfilled', decided_at = now() WHERE id = $1`,
    [pedidoDeTag],
  );

  // ---- 10. `broadcast`: o comunicado que chegou a esta caixa --------------
  //
  // **ESTE e o unico fato que NAO passa pela funcao de producao, e a razao e
  // medida e nao preguica.** `comunicado_disparar(uuid, text, text)` abre em
  // LEQUE GLOBAL: ela insere uma linha da caixa para TODA conta habilitada da
  // base. Chamada daqui, ela poria um `broadcast` na caixa das contas de todos
  // os OUTROS arquivos da suite -- que roda os arquivos concorrentemente sobre
  // o MESMO banco. Foi medido: a primeira versao deste arquivo a chamava, e
  // `dispensar-a-notificacao.test.ts` reprovou na linha de base dele com um
  // aviso que ele nao criou. Alem disso o teto de TRES POR DIA e global, e
  // tornaria este arquivo dependente da ordem de execucao.
  //
  // Entao a linha e inserida direto, **na forma exata que a funcao escreve**
  // (`item_kind` e `source_kind` iguais a 'broadcast', `source_id` = o id do
  // comunicado, `subject_label` = o titulo), e so para o tutor. O que o
  // destino precisa provar e o caminho
  // `notification_items -> notification_broadcasts.ref`, e ele e o mesmo.
  admin = randomUUID();
  await cliente.query(
    `INSERT INTO admin_accounts (id, email, display_name, password_phc, password_updated_at)
     VALUES ($1, $2, 'Admin da Isca', '$pbkdf2-sha512$naoimporta', now())`,
    [admin, `${PREFIXO}${admin}@exemplo-de-teste.invalid`],
  );
  const comunicado = randomUUID();
  fonte.refDoComunicado = refOpaco('comunic0Ref');
  await cliente.query(
    `INSERT INTO notification_broadcasts (id, ref, title, body, dispatched_by_admin,
                                          recipients_total)
     VALUES ($1, $2, 'Manutencao no sabado', 'O app fica fora do ar das 2h as 4h.', $3, 1)`,
    [comunicado, fonte.refDoComunicado, admin],
  );
  await cliente.query(
    `INSERT INTO notification_items
       (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
     VALUES (notificacao_ref_novo(), $1, 'broadcast', 'Manutencao no sabado',
             'broadcast', $2, now() - interval '10 minutes')`,
    [tutor, comunicado],
  );
}

async function limpar(): Promise<void> {
  // Os encontros primeiro: `network_events` nao cai por cascata de `users`.
  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [`${PREFIXO}%`]);
  // O comunicado antes do admin: `dispatched_by_admin` e `ON DELETE RESTRICT`.
  await cliente.query(
    `DELETE FROM notification_broadcasts
      WHERE dispatched_by_admin IN (SELECT id FROM admin_accounts WHERE email LIKE $1)`,
    [`${PREFIXO}%@exemplo-de-teste.invalid`],
  );
  await cliente.query('DELETE FROM admin_accounts WHERE email LIKE $1', [
    `${PREFIXO}%@exemplo-de-teste.invalid`,
  ]);
  // E as contas por ultimo: a cascata leva pets, casos, achados, indicacoes,
  // pedidos de plaquinha e as proprias linhas da caixa.
  await cliente.query('DELETE FROM users WHERE email LIKE $1', [
    `${PREFIXO}%@exemplo-de-teste.invalid`,
  ]);
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova que cada tipo de notificacao chega ao ' +
        'destino certo, e sem banco ele nao prova nada. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  await limpar();
  tutor = await criarConta();
  vizinha = await criarConta();
  requerente = await criarConta();
  await provocarOsDezFatos();

  const contrato = carregarContrato('api/openapi.yaml');
  app = criarServidor({
    problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  vigiarParametrosDasRotas(app, contrato, '/v1');
  const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDaCaixaDeNotificacoes(escopo, {
        caixa: new CaixaDeNotificacoesService({ caixa: criarCaixaDeNotificacoes(banco.db) }),
        autenticador: {
          autenticar: (token: string) =>
            FORMA_DE_UUID.test(token)
              ? Promise.resolve({ userId: token as UserId })
              : Promise.reject(problemas.naoAutenticado()),
        },
        contrato,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  await app.ready();
});

after(async () => {
  if (cliente !== undefined) {
    await limpar();
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
});

void describe('o destino de cada notificacao, contra um Postgres de verdade', () => {
  void it('1. LINHA DE BASE: os gatilhos criaram os dez tipos', async () => {
    const doTutor = await linhasDe(tutor);
    const daVizinha = await linhasDe(vizinha);
    const doRequerente = await linhasDe(requerente);

    // O tutor recebe sete; a vizinha o alerta e o comunicado; o requerente a
    // resposta do pedido e o comunicado.
    const esperadosDoTutor = [
      'tag_scanned',
      'found_reported',
      'match_suggested',
      'event_join_requested',
      'event_cancelled',
      'suggestion_decided',
      'tag_request_updated',
      'broadcast',
    ];
    for (const kind of esperadosDoTutor) {
      assert.ok(
        doTutor.some((l) => l.kind === kind),
        `REPROVA: o gatilho de \`${kind}\` nao gravou na caixa do tutor. Sem a linha, a isca do ` +
          'destino dele passaria por vazio',
      );
    }
    assert.ok(
      daVizinha.some((l) => l.kind === 'neighborhood_alert'),
      'REPROVA: o alerta de vizinhanca nao chegou a vizinha',
    );
    assert.ok(
      doRequerente.some((l) => l.kind === 'event_join_decided'),
      'REPROVA: a resposta do pedido nao chegou a quem pediu',
    );
  });

  void it('2. cada tipo chega ao destino CERTO, com a chave da fonte', async () => {
    const doTutor = await linhasDe(tutor);
    const daVizinha = await linhasDe(vizinha);
    const doRequerente = await linhasDe(requerente);

    // O PET escaneado -- e o pet, nao a leitura nem a tag.
    const plaquinha = doTipo(doTutor, 'tag_scanned');
    assert.equal(plaquinha.destination, 'pet', 'REPROVA: `tag_scanned` nao leva ao pet');
    assert.equal(
      plaquinha.destination_ref,
      fonte.petDaPlaquinha,
      'REPROVA: a chave de `tag_scanned` nao e o pet escaneado. O caminho e ' +
        'tag_scans -> pet_tags -> pets, e apontar para a leitura ou para a tag levaria a lugar nenhum',
    );

    // O ACHADO -- o unico cuja chave e o proprio `source_id`.
    const achado = doTipo(doTutor, 'found_reported');
    assert.equal(achado.destination, 'found_report', 'REPROVA: `found_reported` nao leva ao achado');
    assert.equal(
      achado.destination_ref,
      fonte.achado,
      'REPROVA: a chave de `found_reported` nao e o achado registrado',
    );

    // O CASO, por `share_token` -- e a chave e PUBLICA porque a pagina e.
    const alerta = doTipo(daVizinha, 'neighborhood_alert');
    assert.equal(
      alerta.destination,
      'public_case',
      'REPROVA: `neighborhood_alert` nao leva a pagina publica do caso',
    );
    assert.equal(
      alerta.destination_ref,
      fonte.shareTokenDoCaso,
      'REPROVA: a chave de `neighborhood_alert` nao e o `share_token` do caso. O gatilho grava o ' +
        'DISPARO em `source_id`, e o destino precisa ir alert_dispatches -> lost_cases',
    );

    // O ENCONTRO, pelos dois lados do pedido.
    const pedido = doTipo(doTutor, 'event_join_requested');
    assert.equal(
      pedido.destination,
      'network_event',
      'REPROVA: `event_join_requested` nao leva ao encontro',
    );
    assert.equal(
      pedido.destination_ref,
      fonte.slugDoEncontroDoPedido,
      'REPROVA: a chave de `event_join_requested` nao e o `slug` do encontro',
    );

    const resposta = doTipo(doRequerente, 'event_join_decided');
    assert.equal(
      resposta.destination,
      'network_event',
      'REPROVA: `event_join_decided` nao leva ao encontro',
    );
    assert.equal(
      resposta.destination_ref,
      fonte.slugDoEncontroDoPedido,
      'REPROVA: a chave de `event_join_decided` nao e o `slug` do encontro. O `source_kind` dele e ' +
        '`event_join_decision` e nao `event_join_request`, e um destino que ramificasse por ' +
        '`source_kind` perderia este caso',
    );

    const cancelado = doTipo(doTutor, 'event_cancelled');
    assert.equal(
      cancelado.destination,
      'network_event',
      'REPROVA: `event_cancelled` nao leva ao encontro',
    );
    assert.equal(
      cancelado.destination_ref,
      fonte.slugDoEncontroCancelado,
      'REPROVA: a chave de `event_cancelled` nao e o `slug` do encontro cancelado. Aqui ' +
        '`source_id` e o PROPRIO encontro e nao um pedido',
    );

    // A INDICACAO, pelo `ref` opaco dela.
    const indicacao = doTipo(doTutor, 'suggestion_decided');
    assert.equal(
      indicacao.destination,
      'directory_suggestion',
      'REPROVA: `suggestion_decided` nao leva a indicacao',
    );
    assert.equal(
      indicacao.destination_ref,
      fonte.refDaIndicacao,
      'REPROVA: a chave de `suggestion_decided` nao e o `ref` da indicacao',
    );

    // O PEDIDO DA PLAQUINHA -> o PET, porque a tela e enderecada por pet.
    const pedidoDeTag = doTipo(doTutor, 'tag_request_updated');
    assert.equal(
      pedidoDeTag.destination,
      'collar_tag_request',
      'REPROVA: `tag_request_updated` nao leva a tela de acompanhar a plaquinha',
    );
    assert.equal(
      pedidoDeTag.destination_ref,
      fonte.petDoPedidoDeTag,
      'REPROVA: a chave de `tag_request_updated` nao e o PET. A tela de acompanhamento e ' +
        'enderecada por pet (`listCollarTagRequests` e por pet), e devolver o `ref` do pedido ' +
        'levaria a uma rota que nao existe',
    );

    // O COMUNICADO -> a pagina intermediaria, pelo `ref` do comunicado.
    const comunicado = doTipo(doTutor, 'broadcast');
    assert.equal(
      comunicado.destination,
      'broadcast',
      'REPROVA: `broadcast` nao leva a pagina do comunicado',
    );
    assert.equal(
      comunicado.destination_ref,
      fonte.refDoComunicado,
      'REPROVA: a chave de `broadcast` nao e o `ref` do comunicado disparado',
    );
  });

  void it('3. `match_suggested` NAO oferece toque: os dois campos nulos', async () => {
    const candidato = doTipo(await linhasDe(tutor), 'match_suggested');

    assert.equal(
      candidato.destination,
      null,
      'REPROVA: `match_suggested` ganhou destino. NAO EXISTE tela de confirmar candidato neste ' +
        'app -- o `destinoDe` do aplicativo manda o push desse tipo para `mostrarNoApp` pelo ' +
        'mesmo motivo --, e toque para tela inexistente e pior que toque ausente',
    );
    assert.equal(
      candidato.destination_ref,
      null,
      'REPROVA: `match_suggested` veio com chave de destino sem destino',
    );
    // CONTRAPESO: a linha EXISTE e continua informando.
    assert.equal(
      candidato.subject,
      'Pingo',
      'REPROVA: a linha sem destino perdeu o assunto. Sem destino ela nao e tocavel, mas ' +
        'continua sendo um aviso que a pessoa le',
    );
  });

  void it('4. destino que SUMIU vira nulo, e a linha NAO desaparece', async () => {
    const antes = doTipo(await linhasDe(tutor), 'tag_scanned');
    assert.equal(
      antes.destination,
      'pet',
      'REPROVA: a linha nao tinha destino antes -- este caso depende dela ter',
    );

    // O pet sai por exclusao LOGICA, que e como este produto apaga pet.
    await cliente.query('UPDATE pets SET deleted_at = now() WHERE id = $1', [
      fonte.petDaPlaquinha,
    ]);
    try {
      const depois = doTipo(await linhasDe(tutor), 'tag_scanned');
      assert.equal(
        depois.destination,
        null,
        'REPROVA: a notificacao continua oferecendo destino para um pet EXCLUIDO -- o toque ' +
          'levaria a um 404',
      );
      assert.equal(depois.destination_ref, null, 'REPROVA: sobrou chave sem destino');
      assert.equal(
        depois.subject,
        'Tobias',
        'REPROVA: a notificacao DESAPARECEU da lista junto com o destino. O `LATERAL` tem de ser ' +
          '`LEFT`: um `JOIN` interno troca "aviso sem destino" por "aviso que nao existe", que e ' +
          'o defeito pior',
      );
    } finally {
      await cliente.query('UPDATE pets SET deleted_at = NULL WHERE id = $1', [
        fonte.petDaPlaquinha,
      ]);
    }
  });

  void it('5. os dois campos andam JUNTOS em toda linha das tres caixas', async () => {
    const todas = [
      ...(await linhasDe(tutor)),
      ...(await linhasDe(vizinha)),
      ...(await linhasDe(requerente)),
    ];
    assert.ok(todas.length >= 10, 'REPROVA: menos de dez linhas nas tres caixas');

    for (const l of todas) {
      assert.equal(
        l.destination === null,
        l.destination_ref === null,
        `REPROVA: a linha de \`${l.kind}\` saiu com um campo de destino preenchido e o outro ` +
          'nulo. Os dois vem do mesmo `LATERAL` e nao ha caminho que produza um sem o outro',
      );
    }
  });

  void it('6. o comunicado: 200 com o CORPO para quem recebeu, 404 para quem nao', async () => {
    const minha = await chamar('GET', `/me/broadcasts/${fonte.refDoComunicado}`, tutor);
    assert.equal(minha.status, 200, 'REPROVA: o destinatario nao conseguiu ler o proprio comunicado');
    assert.equal(
      minha.corpo['body'],
      'O app fica fora do ar das 2h as 4h.',
      'REPROVA: o CORPO nao saiu. E ele a razao desta operacao existir -- a caixa carrega so o titulo',
    );
    assert.equal(minha.corpo['title'], 'Manutencao no sabado', 'REPROVA: o titulo nao saiu');
    assert.equal(
      minha.corpo['ref'],
      fonte.refDoComunicado,
      'REPROVA: o `ref` devolvido nao e o pedido',
    );

    // A VIZINHA nao recebeu este comunicado: a linha da caixa foi inserida so
    // para o tutor. Ela conhece o `ref` -- ele chegou aqui pelo mesmo caminho
    // que chegaria a qualquer um que o visse --, e isso e exatamente o cenario
    // que o recorte tem de barrar: ter o `ref` nao e ter recebido.
    const alheia = await chamar('GET', `/me/broadcasts/${fonte.refDoComunicado}`, vizinha);
    assert.equal(
      alheia.status,
      404,
      'REPROVA: uma conta que NAO recebeu o comunicado conseguiu le-lo. O recorte e pelo ' +
        'DESTINATARIO e mora na clausula WHERE -- o painel ter listagem de comunicados nao ' +
        'autoriza ninguem a ler o de outra pessoa',
    );
    assert.notEqual(
      alheia.status,
      403,
      'REPROVA: respondeu 403. Um 403 confirmaria que aquele `ref` foi disparado (ADR-0021)',
    );

    // CONTRAPESO: o 404 acima nao e "a rota nao funciona".
    const aindaMinha = await chamar('GET', `/me/broadcasts/${fonte.refDoComunicado}`, tutor);
    assert.equal(
      aindaMinha.status,
      200,
      'REPROVA: o mesmo `ref` deixou de responder 200 para quem recebeu -- o 404 acima estaria ' +
        'medindo uma rota quebrada, e nao o recorte',
    );
  });

  void it('7. ler o comunicado NAO marca o aviso da caixa como lido', async () => {
    const estadoAntes = await cliente.query<{ read_at: Date | null }>(
      `SELECT read_at FROM notification_items
        WHERE recipient_user_id = $1 AND item_kind = 'broadcast'`,
      [tutor],
    );
    assert.equal(
      estadoAntes.rows[0]?.read_at,
      null,
      'REPROVA: o aviso do comunicado ja estava lido -- este caso nao teria o que medir',
    );

    await chamar('GET', `/me/broadcasts/${fonte.refDoComunicado}`, tutor);

    const estadoDepois = await cliente.query<{ read_at: Date | null }>(
      `SELECT read_at FROM notification_items
        WHERE recipient_user_id = $1 AND item_kind = 'broadcast'`,
      [tutor],
    );
    assert.equal(
      estadoDepois.rows[0]?.read_at,
      null,
      'REPROVA: abrir a pagina do comunicado marcou o AVISO como lido. Sao dois fatos, e o `ref` ' +
        'do comunicado nao e o `ref` da notificacao -- quem marca e `markNotificationRead`',
    );
  });
});
