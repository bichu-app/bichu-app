/**
 * O "x" DE CADA NOTIFICACAO contra um Postgres de verdade.
 *
 * Pedido do cliente (20/10/2026): *"na notificacao alem da acao de marcar como
 * lida, cada notificacao tem que ter um x para fechar aquela notificacao para
 * ir limpando a lista"*.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE, e por que a prova NAO podia morar na unitaria
 * ===========================================================================
 *
 * `caixa-de-notificacoes-service.test.ts` roda sobre um DUBLE do porto: ali o
 * que decide se a linha sai da lista e o proprio duble. Afirmar la que "a
 * notificacao dispensada nao volta" seria medir uma constante escrita no
 * arquivo de teste -- vacuidade, que e o defeito recorrente deste
 * repositorio. La ficou o que a APLICACAO decide (o dono vem do token, "nao
 * achei" vira 404, e dispensar nao encadeia marcar como lida); aqui fica o que
 * o BANCO decide, que e a regra inteira:
 *
 *   - o filtro `dismissed_at IS NULL` nos tres lugares da `20261020000011`;
 *   - o recorte do GRUPO em `notificacao_dispensar(uuid, text)`;
 *   - a independencia dos dois eixos, medida na COLUNA e nao no duble.
 *
 * ===========================================================================
 * AS ISCAS, e com o mecanismo desligado cada uma REPROVA
 * ===========================================================================
 *
 * 1. **A LINHA DE BASE.** Antes de qualquer afirmacao sobre o que NAO aparece,
 *    este arquivo confere o que aparece: tres linhas na lista e cinco avisos no
 *    sino. Sem isto, toda isca de ausencia abaixo passaria por vazio -- e
 *    "verificacao que nao consegue verificar REPROVA".
 *
 * 2. **DISPENSADA NAO VOLTA NA LISTAGEM.** Tira a linha de `tag_scanned` e
 *    lista DE NOVO: ela nao esta. Com o `AND i.dismissed_at IS NULL` fora do
 *    CTE `visiveis`, este caso reprova -- e esse e exatamente o defeito obvio
 *    deste recurso: some da tela e reaparece no recarregamento.
 *
 * 3. **DISPENSADA NAO CONTA NO SINO.** O contador cai, e cai pelo numero de
 *    AVISOS da linha e nao por um. `tag_scanned` e um dos dois tipos que
 *    ATRAVESSAM o zero do contador (`notificacao_persiste_no_contador`), e e
 *    de proposito que a isca usa justamente ele: se o predicado novo tivesse
 *    entrado DENTRO da disjuncao do persiste, a linha sairia da lista e
 *    continuaria contando no sino -- dois numeros discordando sobre a mesma
 *    caixa.
 *
 * 4. **DISPENSAR NAO MARCA COMO LIDA**, medido na COLUNA: depois do 204, a
 *    linha dispensada tem `dismissed_at` preenchido e `read_at` AINDA NULO.
 *    Um `notificacao_dispensar` que tocasse `read_at` reprova aqui.
 *
 * 5. **LER NAO DISPENSA**, o outro sentido: marcar como lida deixa a linha NA
 *    LISTA, dizendo `read: true`, com `dismissed_at` nulo. Um `read` que
 *    dispensasse por tabela reprova aqui.
 *
 * 6. **A LINHA AGRUPADA SAI INTEIRA.** Tres `broadcast` do mesmo dia sao UMA
 *    linha com `grouped_count: 3`, e o `ref` que sai e o de UM deles.
 *    Dispensar essa linha tem de levar os TRES: com a dispensa recaindo so
 *    sobre o `ref`, o grupo volta na listagem seguinte com outro `ref` e
 *    `grouped_count: 2`, e a isca reprova. Esta e a parte do recurso que uma
 *    implementacao de uma linha erra.
 *
 * 7. **O AVISO DE OUTRA CONTA RESPONDE 404, e NAO E TOCADO.** Nao basta o
 *    status: o caso confere na coluna que a linha da outra conta continua com
 *    `dismissed_at` nulo. Um `WHERE` sem o dono devolveria 204 e dispensaria a
 *    notificacao de outra pessoa.
 *
 * 8. **IDEMPOTENTE.** Dispensar duas vezes responde 204 nas duas, e o
 *    `dismissed_at` NAO se move na segunda -- e o `COALESCE`, e nao um
 *    `IS NULL` no `WHERE`, que faz o reenvio do aparelho nao virar 404.
 *
 * 9. **"MARCAR TODAS COMO LIDAS" NAO ALCANCA A DISPENSADA**, e o `marked` da
 *    resposta nao a conta: a operacao nao mexe no que a caixa nao mostra mais,
 *    pela mesma razao pela qual ela respeita a janela de 90 dias.
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
const PREFIXO = 'isca-dispensa-';

/**
 * Os `ref` da caixa: OPACOS, `^[A-Za-z0-9_-]{20,32}$`, como o `CHECK`
 * `notification_items_ref_formato` manda. Nao sao UUID (ADR-0010).
 */
const REF_DA_PLAQUINHA = 'aviDispPlaquinha00000A';
const REF_DO_CANCELAMENTO = 'aviDispCancelamento00B';
const REF_DO_COMUNICADO_1 = 'aviDispComunicado0001C';
const REF_DO_COMUNICADO_2 = 'aviDispComunicado0002D';
const REF_DO_COMUNICADO_3 = 'aviDispComunicado0003E';
const REF_DA_OUTRA_CONTA = 'aviDispDeOutraConta00F';

/** Um `ref` bem formado que nao existe em conta nenhuma: a borda do 404. */
const REF_QUE_NAO_EXISTE = 'aviDispNaoExisteNunca0';

let banco: DbHandle;
let cliente: pg.Client;
let app: RegistradorDeRotas;
let eu = '';
let outra = '';

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

async function chamar(
  metodo: 'GET' | 'POST',
  url: string,
  conta: string | undefined,
): Promise<Resposta> {
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

async function listar(conta: string): Promise<Resposta> {
  return chamar('GET', '/me/notifications?page=1&limit=30', conta);
}

async function contar(conta: string): Promise<number> {
  const r = await chamar('GET', '/me/notifications/count', conta);
  assert.equal(r.status, 200, 'REPROVA: o contador do sino nao respondeu 200');
  return r.corpo['unread_total'] as number;
}

/** As LINHAS que a caixa devolve, na ordem do servidor. */
function linhasDe(r: Resposta): { ref: string; kind: string; read: boolean; grouped: number }[] {
  const itens = r.corpo['items'] as Record<string, unknown>[];
  return itens.map((i) => ({
    ref: i['ref'] as string,
    kind: i['kind'] as string,
    read: i['read'] as boolean,
    grouped: i['grouped_count'] as number,
  }));
}

/** O ESTADO NA COLUNA, que e onde a independencia dos dois eixos se mede. */
async function estadoNaColuna(
  ref: string,
): Promise<{ lido: boolean; dispensado: boolean; dispensadoEm: string | null }> {
  const r = await cliente.query<{ read_at: Date | null; dismissed_at: Date | null }>(
    'SELECT read_at, dismissed_at FROM notification_items WHERE ref = $1',
    [ref],
  );
  const linha = r.rows[0];
  assert.ok(linha !== undefined, `REPROVA: o aviso ${ref} nao esta mais na tabela. O apagamento e LOGICO, nunca DELETE`);
  return {
    lido: linha.read_at !== null,
    dispensado: linha.dismissed_at !== null,
    dispensadoEm: linha.dismissed_at === null ? null : linha.dismissed_at.toISOString(),
  };
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

/**
 * Um aviso na caixa, inserido DIRETO.
 *
 * Direto e nao pelo gatilho da fonte de proposito: o que este arquivo mede e a
 * LEITURA e a DISPENSA, e passar por `tag_scans`, `network_events` e
 * `notification_broadcasts` traria nove tabelas de preparo para provar algo
 * que nao e sobre elas. Os gatilhos tem as iscas deles na `20261018000020`.
 *
 * `source_kind`/`source_id` sao obrigatorios e entram com valor proprio por
 * linha: `notification_items_um_por_destinatario` e UNIQUE em
 * (source_kind, source_id, recipient_user_id), e repetir o par faria o segundo
 * `INSERT` cair calado no `ON CONFLICT` que nem existe aqui.
 */
async function inserirAviso(opcoes: {
  ref: string;
  dono: string;
  tipo: string;
  assunto: string | null;
  /** Horas a partir de agora; negativo e passado. A ordem da caixa e esta. */
  horas: number;
  lido?: boolean;
}): Promise<void> {
  await cliente.query(
    `INSERT INTO notification_items
       (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id,
        occurred_at, read_at)
     VALUES ($1, $2, $3, $4, $5, gen_random_uuid(),
             now() + make_interval(hours => $6::int),
             CASE WHEN $7::boolean THEN now() END)`,
    [
      opcoes.ref,
      opcoes.dono,
      opcoes.tipo,
      opcoes.assunto,
      `${PREFIXO}${opcoes.ref}`,
      opcoes.horas,
      opcoes.lido ?? false,
    ],
  );
}

async function limpar(): Promise<void> {
  await cliente.query('DELETE FROM notification_items WHERE source_kind LIKE $1', [`${PREFIXO}%`]);
  await cliente.query('DELETE FROM users WHERE email LIKE $1', [
    `${PREFIXO}%@exemplo-de-teste.invalid`,
  ]);
}

/**
 * O cenario, e cada linha dele tem uma razao:
 *
 * - `tag_scanned`: NUNCA agrupa e ATRAVESSA o zero do contador. E a linha das
 *   iscas 2, 3 e 4, justamente porque e o tipo em que um filtro posto no lugar
 *   errado da contagem passaria batido.
 * - tres `broadcast` no MESMO dia e sem autor: agrupam em UMA linha com
 *   `grouped_count: 3`. E a linha da isca 6.
 * - `event_cancelled`: a linha que FICA, e e ela que faz as iscas de ausencia
 *   nao passarem por vazio -- uma lista que ficasse vazia por outro motivo
 *   reprovaria aqui.
 */
async function montarCenario(): Promise<void> {
  await inserirAviso({
    ref: REF_DA_PLAQUINHA,
    dono: eu,
    tipo: 'tag_scanned',
    assunto: 'Tobias',
    horas: -1,
  });
  await inserirAviso({
    ref: REF_DO_CANCELAMENTO,
    dono: eu,
    tipo: 'event_cancelled',
    assunto: 'Encontro no parque',
    horas: -2,
  });
  // Os tres do grupo, no mesmo dia e a horas diferentes. O mais NOVO e o
  // `ref` que a listagem devolve para a linha -- e e por isso que dispensar
  // "a linha" tem de alcancar os outros dois.
  await inserirAviso({
    ref: REF_DO_COMUNICADO_1,
    dono: eu,
    tipo: 'broadcast',
    assunto: 'Recado um',
    horas: -3,
  });
  await inserirAviso({
    ref: REF_DO_COMUNICADO_2,
    dono: eu,
    tipo: 'broadcast',
    assunto: 'Recado dois',
    horas: -4,
  });
  await inserirAviso({
    ref: REF_DO_COMUNICADO_3,
    dono: eu,
    tipo: 'broadcast',
    assunto: 'Recado tres',
    horas: -5,
  });
  // A conta VIZINHA, que este arquivo nunca pode alcancar.
  await inserirAviso({
    ref: REF_DA_OUTRA_CONTA,
    dono: outra,
    tipo: 'tag_scanned',
    assunto: 'Pet de outra pessoa',
    horas: -1,
  });
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova que a notificacao dispensada nao volta ' +
        'na lista nem conta no sino, e sem banco ele nao prova nada. Rode ' +
        '`npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  await limpar();
  eu = await criarConta();
  outra = await criarConta();
  await montarCenario();

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
  // Guardas de `undefined`: quando o `before` levanta (sem `DATABASE_URL`), o
  // `after` roda com os dois nao inicializados, e um erro aqui esconderia a
  // mensagem que explica o que falta.
  if (cliente !== undefined) {
    await limpar();
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
});

void describe('o "x" da notificacao, contra um Postgres de verdade', () => {
  void it('1. LINHA DE BASE: tres linhas na lista e cinco avisos no sino', async () => {
    const lista = await listar(eu);
    assert.equal(lista.status, 200, 'REPROVA: a listagem nao respondeu 200');

    const linhas = linhasDe(lista);
    assert.deepEqual(
      linhas.map((l) => l.kind),
      ['tag_scanned', 'event_cancelled', 'broadcast'],
      'REPROVA: a linha de base nao e a esperada. Sem ela, toda isca de AUSENCIA abaixo ' +
        'passaria por vazio',
    );
    assert.equal(
      linhas[2]?.grouped,
      3,
      'REPROVA: os tres `broadcast` do mesmo dia nao viraram UMA linha de `grouped_count: 3`. ' +
        'A isca 6 depende deste agrupamento',
    );
    assert.equal(
      await contar(eu),
      5,
      'REPROVA: o sino nao conta os CINCO avisos (o grupo vale 3, e nao 1)',
    );
  });

  void it('2+3+4. a dispensada SAI da lista, SAI do sino, e continua NAO LIDA', async () => {
    const antes = await contar(eu);

    const dispensa = await chamar(
      'POST',
      `/me/notifications/${REF_DA_PLAQUINHA}/dismiss`,
      eu,
    );
    assert.equal(dispensa.status, 204, 'REPROVA: dispensar nao respondeu 204');

    // ISCA 2: lista DE NOVO -- e o recarregamento que o defeito obvio deste
    // recurso quebraria.
    const depois = linhasDe(await listar(eu));
    assert.ok(
      !depois.some((l) => l.ref === REF_DA_PLAQUINHA),
      'REPROVA: a notificacao dispensada VOLTOU na listagem. Este e o defeito obvio deste ' +
        'recurso: some da tela e reaparece ao recarregar',
    );
    assert.ok(
      depois.some((l) => l.kind === 'event_cancelled'),
      'REPROVA: a lista perdeu a linha que NAO foi dispensada -- a isca acima estaria verde por ' +
        'lista vazia',
    );

    // ISCA 3: o sino. `tag_scanned` ATRAVESSA o zero do contador, e e por isso
    // que ele e a isca: um predicado posto dentro da disjuncao do persiste
    // deixaria este numero parado.
    assert.equal(
      await contar(eu),
      antes - 1,
      'REPROVA: a notificacao dispensada continua CONTANDO no sino. `tag_scanned` atravessa o ' +
        'zero da lista vista, e nao a dispensa -- se o predicado novo entrou dentro do OR de ' +
        '`notificacao_persiste_no_contador`, e aqui que isso aparece',
    );

    // ISCA 4: na COLUNA. Dispensar nao e ler.
    const estado = await estadoNaColuna(REF_DA_PLAQUINHA);
    assert.equal(
      estado.dispensado,
      true,
      'REPROVA: `dismissed_at` nao foi preenchido -- a linha saiu da lista por outro motivo',
    );
    assert.equal(
      estado.lido,
      false,
      'REPROVA: dispensar MARCOU COMO LIDA. Os dois eixos sao independentes: dispensar tira da ' +
        'LISTA e ler tira do CONTADOR, e dispensar sem ter lido e o caso comum',
    );
  });

  void it('5. o outro sentido: LER nao dispensa -- a linha FICA, dizendo lido', async () => {
    const leitura = await chamar(
      'POST',
      `/me/notifications/${REF_DO_CANCELAMENTO}/read`,
      eu,
    );
    assert.equal(leitura.status, 204, 'REPROVA: marcar como lida nao respondeu 204');

    const linhas = linhasDe(await listar(eu));
    const linha = linhas.find((l) => l.ref === REF_DO_CANCELAMENTO);
    assert.ok(
      linha !== undefined,
      'REPROVA: marcar como lida TIROU a linha da lista. Ler tira do contador e deixa a linha ' +
        'na lista dizendo `Lido`; so o "x" a tira',
    );
    assert.equal(linha.read, true, 'REPROVA: a linha lida nao voltou com `read: true`');

    const estado = await estadoNaColuna(REF_DO_CANCELAMENTO);
    assert.equal(estado.lido, true, 'REPROVA: `read_at` nao foi preenchido');
    assert.equal(
      estado.dispensado,
      false,
      'REPROVA: marcar como lida DISPENSOU o aviso. Os dois eixos sao independentes nos DOIS ' +
        'sentidos',
    );
  });

  void it('6. a linha AGRUPADA sai INTEIRA, e o grupo nao volta com outro ref', async () => {
    const antesDaLista = linhasDe(await listar(eu));
    const grupo = antesDaLista.find((l) => l.kind === 'broadcast');
    assert.ok(grupo !== undefined, 'REPROVA: o grupo de `broadcast` nao esta na lista');
    assert.equal(
      grupo.grouped,
      3,
      'REPROVA: o grupo nao resume os tres avisos -- esta isca precisa do agrupamento para medir ' +
        'o que mede',
    );

    const dispensa = await chamar('POST', `/me/notifications/${grupo.ref}/dismiss`, eu);
    assert.equal(dispensa.status, 204, 'REPROVA: dispensar a linha agrupada nao respondeu 204');

    const depois = linhasDe(await listar(eu));
    assert.ok(
      !depois.some((l) => l.kind === 'broadcast'),
      'REPROVA: o grupo VOLTOU na listagem. O `ref` de uma linha agrupada e o do item MAIS NOVO; ' +
        'dispensar so ele deixa os outros de pe e a linha reaparece com outro `ref` e ' +
        '`grouped_count` menor. A unidade da dispensa e a LINHA que a pessoa ve',
    );

    // E na coluna: os TRES, e nao so o do `ref`.
    for (const ref of [REF_DO_COMUNICADO_1, REF_DO_COMUNICADO_2, REF_DO_COMUNICADO_3]) {
      const estado = await estadoNaColuna(ref);
      assert.equal(
        estado.dispensado,
        true,
        `REPROVA: ${ref} nao foi dispensado. A dispensa recaiu so sobre o item do \`ref\`, e nao ` +
          'sobre o grupo que a linha representa',
      );
      assert.equal(
        estado.lido,
        false,
        `REPROVA: ${ref} foi marcado como LIDO pela dispensa do grupo`,
      );
    }
  });

  void it('7. o aviso de OUTRA conta responde 404, e NAO e tocado', async () => {
    const alheio = await chamar(
      'POST',
      `/me/notifications/${REF_DA_OUTRA_CONTA}/dismiss`,
      eu,
    );
    assert.equal(
      alheio.status,
      404,
      'REPROVA: dispensar aviso de outra conta nao respondeu 404. A autorizacao e a propria ' +
        'clausula WHERE',
    );
    assert.notEqual(
      alheio.status,
      403,
      'REPROVA: respondeu 403. Um 403 confirmaria que o `ref` existe (ADR-0021)',
    );

    // O STATUS NAO BASTA: a linha da outra conta tem de estar intacta.
    const estado = await estadoNaColuna(REF_DA_OUTRA_CONTA);
    assert.equal(
      estado.dispensado,
      false,
      'REPROVA: a notificacao de OUTRA CONTA foi dispensada. O 404 veio da projecao, e nao do ' +
        '`WHERE` -- o `UPDATE` alcancou a linha de outra pessoa',
    );

    // CONTRAPESO: a dona continua vendo o aviso dela.
    const dela = linhasDe(await listar(outra));
    assert.ok(
      dela.some((l) => l.ref === REF_DA_OUTRA_CONTA),
      'REPROVA: a dona perdeu o aviso dela -- o caso acima estaria verde porque a linha sumiu ' +
        'para todo mundo',
    );

    const inexistente = await chamar(
      'POST',
      `/me/notifications/${REF_QUE_NAO_EXISTE}/dismiss`,
      eu,
    );
    assert.equal(
      inexistente.status,
      404,
      'REPROVA: um `ref` bem formado que nao existe nao respondeu 404',
    );
  });

  void it('8. dispensar duas vezes e idempotente, e o instante NAO se move', async () => {
    const estadoAntes = await estadoNaColuna(REF_DA_PLAQUINHA);
    assert.equal(
      estadoAntes.dispensado,
      true,
      'REPROVA: a linha nao estava dispensada -- este caso depende do caso 2',
    );

    const segunda = await chamar(
      'POST',
      `/me/notifications/${REF_DA_PLAQUINHA}/dismiss`,
      eu,
    );
    assert.equal(
      segunda.status,
      204,
      'REPROVA: dispensar de novo nao respondeu 204. O aparelho REENVIA, e um 404 na segunda ' +
        'transformaria o reenvio em erro visivel',
    );

    const estadoDepois = await estadoNaColuna(REF_DA_PLAQUINHA);
    assert.equal(
      estadoDepois.dispensadoEm,
      estadoAntes.dispensadoEm,
      'REPROVA: o `dismissed_at` se moveu na segunda chamada. O `COALESCE` existe para que o ' +
        'instante seja o da PRIMEIRA dispensa',
    );
  });

  void it('9. "marcar todas como lidas" NAO alcanca a dispensada', async () => {
    const todas = await chamar('POST', '/me/notifications/read-all', eu);
    assert.equal(todas.status, 200, 'REPROVA: marcar todas nao respondeu 200');

    const estado = await estadoNaColuna(REF_DA_PLAQUINHA);
    assert.equal(
      estado.lido,
      false,
      'REPROVA: "marcar todas como lidas" marcou a linha DISPENSADA. Ela nao mexe no que a caixa ' +
        'nao mostra mais, pela mesma razao pela qual respeita a janela de 90 dias',
    );

    // E o `marked` nao conta as dispensadas: a essa altura a unica linha nao
    // lida e nao dispensada e o grupo... que tambem foi dispensado no caso 6.
    // Sobra ZERO, e e isso que o numero tem de dizer.
    assert.equal(
      todas.corpo['marked'],
      0,
      'REPROVA: o `marked` contou linha dispensada, e diria ter marcado mais do que havia na tela',
    );
  });
});
