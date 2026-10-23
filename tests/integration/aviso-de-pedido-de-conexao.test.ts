/**
 * O AVISO DE PEDIDO DE CONEXAO, contra um Postgres de verdade.
 *
 * Pedido do cliente (22/10/2026), literal: *"quando o usuario me adicionou, nao
 * apareceu na notificacao que eu tinha uma solicitacao de amizade. Isso precisa
 * aparecer na notificacao"*.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO E DE INTEGRACAO, E NAO UNITARIO
 * ===========================================================================
 *
 * O recurso inteiro mora em SQL: um `CHECK` ampliado, um gatilho em
 * `user_connections` e um ramo em `notificacao_destino`. `tsc` nao le nada
 * disso -- ele sai `EXIT 0` com um caractere trocado numa chave de JSON, e saiu,
 * nesta casa, em 21/10, derrubando 6 casos de integracao. Typecheck verde nao e
 * evidencia para SQL.
 *
 * ===========================================================================
 * O PEDIDO NASCE DO `INSERT` DE PRODUCAO, E NAO DE UM `INSERT` MEU
 * ===========================================================================
 *
 * **Esta e a decisao mais importante deste arquivo**, e e a mesma de
 * `destino-da-notificacao.test.ts`. A aresta e criada por
 * `criarConnectionsRepository(...).pedir(...)` -- o MESMO `construtorDoPedido`
 * que a borda usa, com os quatro tetos e o `ON CONFLICT (pair_low, pair_high)
 * DO UPDATE` dentro. Escrever o `INSERT` a mao aqui mediria a minha escolha de
 * colunas: se producao gravar um `requested_at` que o gatilho nao ouve, o
 * recurso esta quebrado e o teste fica verde. E vacuidade.
 *
 * E nenhuma linha de `notification_items` e escrita por este arquivo: quem a
 * escreve e o gatilho, que e de outra migracao e nao sabe deste teste.
 *
 * ===========================================================================
 * AS ISCAS
 * ===========================================================================
 *
 * 1. **O AVISO NASCE PARA QUEM RECEBE, E NAO PARA QUEM PEDIU.** Controle
 *    POSITIVO e NEGATIVO no mesmo caso: a caixa de quem recebeu tem a linha, e
 *    a de quem pediu nao tem nenhuma. Um gatilho que avisasse os dois lados
 *    passaria por um teste que so olhasse o destinatario.
 * 2. **O NOME DE QUEM PEDIU SAI EM `subject`**, apelido com arroba quando ha e
 *    nome de exibicao quando nao ha -- a mesma regra de `nomeParaLer`, para a
 *    mesma pessoa nao ter dois nomes em duas telas.
 * 3. **O AVISO LEVA A TELA DE PEDIDOS**, com `destination:
 *    'connection_request'` e `destination_ref` igual ao `ref` da aresta lido da
 *    FONTE -- nao escrito a mao.
 * 4. **NENHUM IDENTIFICADOR INTERNO NO CORPO DA CAIXA.** O corpo INTEIRO da
 *    resposta e varrido por forma de UUID, e `destination_ref` e conferido
 *    contra `^[A-Za-z0-9_-]{22}$`. `author_user_id` existe no banco e NAO pode
 *    aparecer: ele serve ao agrupamento, nunca a resposta.
 * 5. **VAZAMENTO: a conta A nao ve nem toca o aviso da conta B**, e a recusa e
 *    **404** -- byte a byte igual a de um `ref` que nunca existiu, porque um
 *    404 com `detail` diferente continuaria sendo um oraculo (ADR-0021: a
 *    autorizacao esta no `WHERE`, e nunca 403).
 * 6. **O PEDIDO REFEITO VOLTA A CAIXA, NAO LIDO.** `user_connections` tem UMA
 *    linha por par, e um pedido novo sobre aresta morta e um `UPDATE` da mesma
 *    linha. Com `ON CONFLICT DO NOTHING` -- a forma do molde -- o segundo
 *    pedido nao avisaria ninguem, calado. Este caso e o que fixa o `DO UPDATE`.
 * 7. **CONTRAPESO: o pedido RESPONDIDO perde o destino e a linha FICA.** O ramo
 *    filtra `state = 'pending'`, e `LEFT JOIN LATERAL` mantem a linha na caixa
 *    sem toque -- em vez de a fazer desaparecer, que e o defeito pior.
 *
 * **Verificacao que nao consegue verificar REPROVA.** Sem `DATABASE_URL` o
 * `before` levanta.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

import { criarConnectionsRepository } from '../../src/modules/connections/adapters/persistence/kysely-connections-repository.js';
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
import type { AbsoluteUrl, Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** Prefixo proprio: a limpeza apaga so o que este arquivo criou. */
const PREFIXO = 'isca-conexao-aviso-';

/** A forma que NAO pode aparecer em saida autenticada de borda (ADR-0010). */
const FORMA_DE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** A forma do `ref` opaco da aresta: 22 caracteres base64url. */
const FORMA_DE_REF_DA_ARESTA = /^[A-Za-z0-9_-]{22}$/;

let banco: DbHandle;
let cliente: pg.Client;
let app: RegistradorDeRotas;

/** QUEM PEDE, com apelido: o `subject` precisa sair como `@apelido`. */
let pedinte = '';
/** QUEM RECEBE: o destinatario do aviso, e o unico. */
let recebedor = '';
/** QUEM PEDE SEM APELIDO: o `subject` cai para o nome de exibicao. */
let pedinteSemApelido = '';
/** QUEM RECEBE do pedinte sem apelido. Conta separada: um pedido por par. */
let recebedorDoSemApelido = '';
/** A TERCEIRA: nao participa de nada, e e ela que tenta ver o aviso alheio. */
let estranha = '';

/** O que os fatos criaram, para o esperado sair da FONTE e nao da minha mao. */
const fonte = { refDaAresta: '', refDaArestaSemApelido: '', idDaAresta: '' };

interface Resposta {
  readonly status: number;
  readonly cru: string;
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
    cru: r.body,
    corpo: r.body === '' ? {} : (JSON.parse(r.body) as Record<string, unknown>),
  };
}

interface Linha {
  readonly ref: string;
  readonly kind: string;
  readonly subject: string | null;
  readonly read: boolean;
  readonly destination: string | null;
  readonly destination_ref: string | null;
}

/** A caixa de uma conta, com o corpo CRU junto -- a isca 4 varre o cru. */
async function caixaDe(conta: string): Promise<{ linhas: Linha[]; cru: string }> {
  const r = await chamar('GET', '/me/notifications?page=1&limit=30', conta);
  assert.equal(r.status, 200, `REPROVA: a listagem nao respondeu 200 (${String(r.status)})`);
  const itens = r.corpo['items'] as Record<string, unknown>[];
  return {
    cru: r.cru,
    linhas: itens.map((i) => ({
      ref: i['ref'] as string,
      kind: i['kind'] as string,
      subject: i['subject'] as string | null,
      read: i['read'] as boolean,
      destination: i['destination'] as string | null,
      destination_ref: i['destination_ref'] as string | null,
    })),
  };
}

/** A unica linha de pedido de conexao da caixa de uma conta. */
function oAviso(linhas: readonly Linha[]): Linha {
  const achadas = linhas.filter((l) => l.kind === 'connection_requested');
  assert.equal(
    achadas.length,
    1,
    `REPROVA: esperava UMA linha de \`connection_requested\` na caixa, achei ${String(
      achadas.length,
    )}. Zero e o gatilho nao tendo gravado -- o defeito que o cliente relatou. Mais de uma e a ` +
      'idempotencia do `ON CONFLICT` tendo falhado, e o sino passaria a subir sozinho',
  );
  return achadas[0]!;
}

async function criarConta(nomeDeExibicao: string | null): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO users (id, email, display_name, public_ref)
     VALUES ($1, $2, $3,
             translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
                       '+/=', '-_'))`,
    [id, `${PREFIXO}${id}@exemplo-de-teste.invalid`, nomeDeExibicao],
  );
  return id;
}

/** O apelido, pelas DUAS tabelas: `handles` e a FK de `users.handle`. */
async function darApelido(conta: string, apelido: string): Promise<void> {
  await cliente.query(`INSERT INTO handles (handle, kind, user_id) VALUES ($1, 'pessoa', $2)`, [
    apelido,
    conta,
  ]);
  await cliente.query('UPDATE users SET handle = $1 WHERE id = $2', [apelido, conta]);
}

/**
 * O pedido, pelo `INSERT` DE PRODUCAO.
 *
 * `criarConnectionsRepository(...).pedir` e o mesmo caminho da borda. Devolve o
 * `ref` que o banco gravou -- a isca 3 confere o destino contra ELE.
 */
async function pedirConexao(
  quemPede: string,
  alvo: string,
  quando: Date,
): Promise<{ ref: string; id: string }> {
  const id = randomUUID();
  const ref = Buffer.from(randomUUID().replace(/-/g, ''), 'hex').toString('base64url');
  const criada = await criarConnectionsRepository(banco.db).pedir({
    id,
    ref,
    quemPede: quemPede as UserId,
    alvo: alvo as UserId,
    origem: 'presence_code',
    agora: quando.getTime() as Instant,
  });
  assert.ok(
    criada !== undefined,
    'REPROVA: o `INSERT` guardado de producao recusou o pedido. Sem aresta nao ha gatilho, e ' +
      'toda afirmacao deste arquivo passaria por caixa vazia',
  );
  return { ref: criada.ref, id };
}

async function limpar(): Promise<void> {
  // As contas primeiro: a cascata leva `user_connections` e as linhas da caixa.
  // Os apelidos NAO caem por cascata (`handles.user_id` e `ON DELETE SET NULL`,
  // de proposito: apelido de conta que sai nao volta ao pool na hora), entao
  // eles saem a mao, DEPOIS -- `users.handle` referencia `handles.handle`.
  await cliente.query('DELETE FROM users WHERE email LIKE $1', [
    `${PREFIXO}%@exemplo-de-teste.invalid`,
  ]);
  await cliente.query('DELETE FROM handles WHERE handle LIKE $1', [`${PREFIXO}%`]);
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo prova que pedir conexao cria o aviso para ' +
        'quem recebe, e sem banco ele nao prova nada. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  await limpar();
  pedinte = await criarConta('Maria da Isca');
  recebedor = await criarConta('Recebedora da Isca');
  pedinteSemApelido = await criarConta('Joao Sem Apelido');
  recebedorDoSemApelido = await criarConta('Outra Recebedora');
  estranha = await criarConta('Estranha da Isca');
  // 5 a 20 caracteres, `^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$`: o prefixo deste
  // arquivo nao cabe inteiro, e por isso o apelido e curto e proprio.
  await darApelido(pedinte, 'isca-conexao-1');

  const agora = new Date();
  const primeiro = await pedirConexao(pedinte, recebedor, agora);
  fonte.refDaAresta = primeiro.ref;
  fonte.idDaAresta = primeiro.id;
  const segundo = await pedirConexao(pedinteSemApelido, recebedorDoSemApelido, agora);
  fonte.refDaArestaSemApelido = segundo.ref;

  const contrato = carregarContrato('api/openapi.yaml');
  app = criarServidor({
    problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  // A BANCADA MONTA O QUE PRODUCAO MONTA. Sem esta linha um caso mediria a
  // AUSENCIA de `vigiarParametrosDasRotas` -- foi descoberto em 21/10, e um
  // caso media a falta de uma peca e nao um defeito.
  vigiarParametrosDasRotas(app, contrato, '/v1');
  const UUID_INTEIRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDaCaixaDeNotificacoes(escopo, {
        caixa: new CaixaDeNotificacoesService({ caixa: criarCaixaDeNotificacoes(banco.db) }),
        autenticador: {
          autenticar: (token: string) =>
            UUID_INTEIRO.test(token)
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

void describe('o aviso de pedido de conexao, contra um Postgres de verdade', () => {
  void it(
    '1. ISCA: o aviso nasce para QUEM RECEBE -- e CONTRAPESO: nao nasce para quem pediu',
    async () => {
      const doRecebedor = await caixaDe(recebedor);
      // POSITIVO: a linha existe, e e uma so.
      const aviso = oAviso(doRecebedor.linhas);
      assert.equal(
        aviso.read,
        false,
        'REPROVA: o aviso nasceu LIDO. Aviso que nasce lido nao entra no contador do sino, e o ' +
          'defeito que o cliente relatou continuaria -- invisivel de outra forma',
      );

      // NEGATIVO, no MESMO caso: quem pediu nao e avisado do proprio pedido.
      const doPedinte = await caixaDe(pedinte);
      assert.equal(
        doPedinte.linhas.filter((l) => l.kind === 'connection_requested').length,
        0,
        'REPROVA: quem PEDIU recebeu aviso do proprio pedido. O gatilho tem de gravar so para ' +
          '`addressee_user_id`; avisar os dois lados passaria por um teste que so olhasse o ' +
          'destinatario, e poria no sino de todo mundo um aviso do que ele mesmo acabou de fazer',
      );

      // E a conta que nao participa nao ve nada -- o leque e de UM.
      const daEstranha = await caixaDe(estranha);
      assert.equal(
        daEstranha.linhas.length,
        0,
        'REPROVA: uma conta que nao participa da aresta recebeu linha na caixa',
      );
    },
  );

  void it('2. ISCA: `subject` leva o nome de quem pediu, pela regra de `nomeParaLer`', async () => {
    const comApelido = oAviso((await caixaDe(recebedor)).linhas);
    assert.equal(
      comApelido.subject,
      '@isca-conexao-1',
      'REPROVA: o apelido nao saiu com arroba. A tela de pedidos de conexao escreve a pessoa ' +
        'assim (`nomeParaLer`), e a mesma pessoa com dois nomes em duas telas e o defeito',
    );

    const semApelido = oAviso((await caixaDe(recebedorDoSemApelido)).linhas);
    assert.equal(
      semApelido.subject,
      'Joao Sem Apelido',
      'REPROVA: sem apelido o `subject` tem de cair para o nome de exibicao. `users.handle` e ' +
        'ANULAVEL e nenhum fluxo obriga a escolher apelido -- este e o caso comum hoje',
    );
  });

  void it('3. ISCA: o aviso leva a tela de pedidos, com o `ref` da FONTE', async () => {
    const aviso = oAviso((await caixaDe(recebedor)).linhas);
    assert.equal(
      aviso.destination,
      'connection_request',
      'REPROVA: o aviso de pedido de conexao nao aponta para a tela de pedidos. Cada linha da ' +
        'caixa leva a algum lugar (cliente, 21/10), e esta leva a `/conexoes/pedidos`',
    );
    // O esperado vem do `ref` que o `INSERT` DE PRODUCAO gravou, e nao de um
    // literal meu: um destino que apontasse para a aresta errada reprova aqui.
    assert.equal(
      aviso.destination_ref,
      fonte.refDaAresta,
      'REPROVA: a chave do destino nao e o `ref` da aresta que nasceu do pedido',
    );
  });

  void it('4. ISCA: nenhum identificador interno no corpo da caixa', async () => {
    const { linhas, cru } = await caixaDe(recebedor);
    const aviso = oAviso(linhas);
    assert.match(
      aviso.destination_ref ?? '',
      FORMA_DE_REF_DA_ARESTA,
      'REPROVA: `destination_ref` nao esta na forma opaca de 22 caracteres base64url. ' +
        '`user_connections.ref` existe justamente porque `id` e UUID interno (ADR-0010 item 6)',
    );
    assert.doesNotMatch(
      cru,
      FORMA_DE_UUID,
      'REPROVA: o corpo da caixa carrega algo com forma de UUID. `author_user_id` existe no ' +
        'banco SO para agrupar e nao pode sair, e `user_connections.id` nunca atravessa a borda',
    );
    assert.ok(
      !cru.includes(pedinte) && !cru.includes(recebedor) && !cru.includes(fonte.idDaAresta),
      'REPROVA: o corpo da caixa contem o identificador interno de uma conta ou da aresta',
    );
  });

  void it(
    '5. ISCA DE VAZAMENTO: a conta A nao toca o aviso de B, e a recusa e 404 IDENTICA',
    async () => {
      const refDoAviso = oAviso((await caixaDe(recebedor)).linhas).ref;

      // A conta que nao e dona do item tenta marca-lo como lido.
      const alheio = await chamar('POST', `/me/notifications/${refDoAviso}/read`, estranha);
      // E o mesmo caminho com um `ref` que nunca existiu, no mesmo formato.
      const inexistente = await chamar(
        'POST',
        '/me/notifications/naoExisteRef12345678901/read',
        estranha,
      );

      assert.equal(
        alheio.status,
        404,
        `REPROVA: tocar o aviso de outra conta respondeu ${String(alheio.status)}. A autorizacao ` +
          'esta no `WHERE` e a recusa e 404 e NUNCA 403 (ADR-0021) -- um 403 confirmaria que ' +
          'aquele `ref` existe, e no caso de um pedido de conexao confirmaria que ele foi feito',
      );
      assert.equal(
        alheio.cru,
        inexistente.cru,
        'REPROVA: o 404 do aviso ALHEIO difere do 404 do `ref` que nunca existiu. Um 404 com ' +
          '`detail` diferente continua sendo um oraculo, so mais discreto -- e a mesma licao de ' +
          '`indistinguibilidade-do-pedido-por-apelido.test.ts`',
      );

      // CONTRAPESO: o caminho FUNCIONA para quem e dono, na mesma execucao --
      // os 404 acima nao sao "a rota esta quebrada".
      const doDono = await chamar('POST', `/me/notifications/${refDoAviso}/read`, recebedor);
      assert.equal(
        doDono.status,
        204,
        `REPROVA: o dono do aviso nao conseguiu marca-lo como lido (${String(doDono.status)}). ` +
          'Sem este contrapeso os dois 404 acima poderiam ser a rota nao funcionando para ninguem',
      );
    },
  );

  void it('6. ISCA: o pedido REFEITO volta a caixa, nao lido', async () => {
    // A aresta e envelhecida no banco para o `INSERT` de producao poder refazer
    // o pedido: `construtorDoPedido` so atualiza linha `pending` VENCIDA (ou
    // `declined` com descanso cumprido). O relogio nao e empurrado -- a linha e.
    await cliente.query(
      `UPDATE user_connections
          SET requested_at = now() - interval '60 days',
              expires_at   = now() - interval '30 days'
        WHERE id = $1`,
      [fonte.idDaAresta],
    );
    // Garante o estado de partida: o aviso existe e esta LIDO (caso 5 o marcou).
    const antes = oAviso((await caixaDe(recebedor)).linhas);
    assert.equal(antes.read, true, 'REPROVA: a linha de partida deste caso nao esta lida');

    const refeito = await pedirConexao(pedinte, recebedor, new Date());
    assert.notEqual(
      refeito.ref,
      fonte.refDaAresta,
      'REPROVA: o pedido refeito nao sorteou `ref` novo -- `construtorDoPedido` nao passou pelo ' +
        '`ON CONFLICT ... DO UPDATE`, e este caso nao esta medindo o que diz medir',
    );

    const depois = oAviso((await caixaDe(recebedor)).linhas);
    assert.equal(
      depois.read,
      false,
      'REPROVA: o pedido REFEITO nao voltou ao sino. `user_connections` tem UMA linha por par, e ' +
        'um pedido novo sobre aresta morta e um `UPDATE` da MESMA linha com o MESMO `id` -- com ' +
        '`ON CONFLICT DO NOTHING` (a forma do molde) o segundo pedido nao avisaria ninguem, e o ' +
        'defeito que o cliente relatou voltaria calado, so para quem pede duas vezes',
    );
    assert.equal(
      depois.destination_ref,
      refeito.ref,
      'REPROVA: o destino continua apontando para o `ref` ANTIGO da aresta, que nao existe mais',
    );
  });

  void it('7. CONTRAPESO: pedido RESPONDIDO perde o destino, e a linha FICA', async () => {
    const antes = oAviso((await caixaDe(recebedorDoSemApelido)).linhas);
    assert.equal(
      antes.destination,
      'connection_request',
      'REPROVA: a linha de partida deste caso ja estava sem destino',
    );

    await criarConnectionsRepository(banco.db).aceitar(
      fonte.refDaArestaSemApelido,
      recebedorDoSemApelido as UserId,
      Date.now() as Instant,
    );

    const depois = oAviso((await caixaDe(recebedorDoSemApelido)).linhas);
    assert.equal(
      depois.destination,
      null,
      'REPROVA: o pedido ja respondido continua oferecendo toque para a tela de pedidos, onde ' +
        'ele nao esta mais. O ramo filtra `state = \'pending\'` pelo mesmo motivo que o ramo do ' +
        'pet filtra `deleted_at IS NULL`',
    );
    assert.equal(
      depois.destination_ref,
      null,
      'REPROVA: `destination` saiu nulo e `destination_ref` nao. O contrato promete que os dois ' +
        'andam juntos, e e essa conjuncao que impede `/conexoes/pedidos/null` do outro lado',
    );
    assert.equal(
      depois.subject,
      'Joao Sem Apelido',
      'REPROVA: a linha perdeu o assunto junto com o destino. O `LEFT JOIN LATERAL` existe para ' +
        'a notificacao CONTINUAR na caixa, informando, sem toque -- um `JOIN` interno a faria ' +
        'DESAPARECER, trocando "aviso sem destino" por "aviso que nao existe"',
    );
  });
});
