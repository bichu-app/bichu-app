/**
 * **"Sair de todos os aparelhos", pela rota, contra Postgres de verdade.**
 *
 * ## O que este arquivo existe para pegar
 *
 * A emenda 1 do ADR-0002 separa dois verbos: `logout` derruba a família
 * daquele aparelho, `logout_all` derruba a conta inteira. O segundo é o
 * remédio de quem perdeu o aparelho ou teve a conta tomada, e é o único que
 * fecha a janela de até quinze minutos que o logout comum deixa aberta de
 * propósito.
 *
 * O defeito que este arquivo reprova é o seguinte: a restrição
 * `refresh_tokens_revoked_reason_check` não listava `logout_all`, o `UPDATE`
 * de `revogarTodasAsFamilias` levava `23514` do Postgres, e como ele é a
 * PRIMEIRA instrução de `derrubarTodasAsSessoes`, a transação abortava antes
 * de qualquer revogação — `invalidarSessoes` nem chegava a rodar. A pessoa
 * apertava o botão, e o invasor continuava dentro.
 *
 * ## Por que dublê nenhum pega isto
 *
 * `revoked_reason` é `text` do lado do TypeScript; o que recusa o valor é a
 * cláusula `CHECK`, que só existe no banco. O dublê em memória guarda a string
 * que receber e devolve sucesso. Os 980 casos unitários ficaram verdes com a
 * rota derrubada em `development` — e ficariam verdes de novo.
 *
 * ## Por que a asserção começa pelo código HTTP
 *
 * Porque o modo de falhar importa tanto quanto a falha. Se a rota respondesse
 * `204` e não revogasse nada, a tela diria que deu certo e ninguém procuraria.
 * O primeiro caso mede o código; os seguintes medem o efeito. Os dois juntos
 * são o que distingue "não funciona" de "não funciona e mente".
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, migra do zero e é derrubada com `-v` no fim. É isso que
 * faz deste arquivo uma prova sobre a MIGRAÇÃO, e não sobre o banco que por
 * acaso estava na máquina de quem rodou.
 *
 * Para iterar sem reconstruir a imagem:
 *
 *   npx tsc -p tsconfig.json --outDir dist/_tests
 *   docker compose run --rm --no-deps \
 *     -v "$PWD/dist/_tests:/app/dist/_tests" api \
 *     node --test "dist/_tests/tests/integration/sair-de-todos-pelo-http.test.js"
 *
 * ## O que sobrevive à execução
 *
 * As linhas de `audit.events`, de propósito: a trilha não tem chave
 * estrangeira para `users` e o papel da aplicação não tem `DELETE`. As contas
 * criadas aqui são apagadas no fim.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  registrarRotasDeIdentidade,
  rotaDeLogoutTotal,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';

const PREFIXO_DA_API = '/v1';

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * Quantos aparelhos a conta principal abre antes de pedir para sair de todos.
 *
 * Dois é o mínimo que distingue os dois verbos: com um só, `logout` e
 * `logout_all` teriam o mesmo efeito observável e o arquivo passaria com a
 * emenda 1 do ADR-0002 desfeita.
 */
const APARELHOS = 3;

/**
 * O motivo que a rota grava. Sai da aplicação, não de uma constante local: se
 * alguém trocar o motivo de `sairDeTodosOsAparelhos`, o que este arquivo mede
 * muda junto, em vez de continuar afirmando um valor que ninguém mais escreve.
 *
 * Não há como importar o literal do serviço — ele é argumento de chamada, não
 * constante exportada. O que dá para amarrar é a rota, e ela é amarrada logo
 * abaixo.
 */
const MOTIVO = 'logout_all';

/**
 * O caminho vem da definição da rota, não escrito à mão: `/auth/logout-all`
 * repetido aqui viraria mentira silenciosa no dia em que a rota mudasse de
 * endereço, e este arquivo passaria a medir um 404.
 */
const CAMINHO_DO_LOGOUT_TOTAL = rotaDeLogoutTotal.path;

interface RespostaDeSessao {
  readonly access_token: string;
  readonly refresh_token: string;
}

interface LinhaDeRefresh {
  readonly revoked_at: Date | null;
  readonly revoked_reason: string | null;
}

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;

/** As contas criadas aqui, para serem apagadas no fim. */
const contas: UserId[] = [];

/** As mensagens que o serviço mandaria. Ninguém sai da máquina. */
const caixaDeEntrada: Mensagem[] = [];

const emailPrincipal = `sair-de-todos-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
const emailVizinho = `vizinho-de-fora-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
/** Nada em comum com o endereço: a política recusa senha parecida com o e-mail. */
const SENHA = 'chuva-morna-no-telhado-47';

async function chamar(
  caminho: string,
  opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; token?: string },
): Promise<{ status: number; corpo: unknown }> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

async function criarConta(email: string): Promise<UserId> {
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} não foi criada (${String(cadastro.status)}): sem conta não há ` +
      `sessão para derrubar. Resposta: ${JSON.stringify(cadastro.corpo)}`,
  );
  const id = (cadastro.corpo as { user: { id: string } }).user.id as UserId;
  contas.push(id);
  return id;
}

async function entrar(email: string): Promise<RespostaDeSessao> {
  const login = await chamar('/auth/login', {
    metodo: 'POST',
    corpo: { email, password: SENHA, stay_signed_in: false },
  });
  assert.equal(
    login.status,
    200,
    `o login de ${email} falhou (${String(login.status)}): ${JSON.stringify(login.corpo)}`,
  );
  return login.corpo as RespostaDeSessao;
}

/** O retrato de `refresh_tokens` de uma conta, por linha. */
async function refreshDe(userId: UserId): Promise<LinhaDeRefresh[]> {
  return banco.db
    .selectFrom('refresh_tokens')
    .select(['revoked_at', 'revoked_reason'])
    .where('user_id', '=', userId)
    .execute();
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      console.error('trilha de auditoria não gravou:', erro);
    },
  });

  const repositorio = criarIdentityRepository(db, ids);

  const mailer: Mailer = {
    enviar: (mensagem: Mensagem) => {
      caixaDeEntrada.push(mensagem);
      return Promise.resolve();
    },
  };

  const auth = criarAuthService({
    repositorio,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    registrarOcorrencia: (dados, mensagem) => {
      console.info(mensagem, dados);
    },
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio,
      mailer,
      ids,
      baseDaWeb: config.publicBaseUrl,
      registrarOcorrencia: (dados, mensagem) => {
        console.warn(mensagem, dados);
      },
    }),
  });

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, {
        auth,
        assinador,
        contrato,
        issuer: config.token.issuer,
        apiBaseUrl: config.apiBaseUrl,
      });
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${String(endereco.port)}`;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    for (const id of contas) {
      await banco.db.deleteFrom('users').where('id', '=', id).execute();
    }
    await banco.close();
  }
});

void describe(`BICHUS-125 — POST ${CAMINHO_DO_LOGOUT_TOTAL} derruba a conta, contra Postgres`, () => {
  let titular: UserId;
  let vizinho: UserId;
  let sessoes: RespostaDeSessao[];
  let sessaoDoVizinho: RespostaDeSessao;
  let respostaDoBotao: { status: number; corpo: unknown };

  before(async () => {
    titular = await criarConta(emailPrincipal);
    vizinho = await criarConta(emailVizinho);

    sessoes = [];
    for (let i = 0; i < APARELHOS; i += 1) {
      sessoes.push(await entrar(emailPrincipal));
    }
    sessaoDoVizinho = await entrar(emailVizinho);

    // O retrato de partida tem de mostrar as famílias VIVAS. Sem esta
    // conferência, um erro de login faria o arquivo "provar" a revogação de um
    // conjunto vazio, e passaria com a rota morta.
    //
    // O piso é `APARELHOS`, e não a igualdade: `/auth/register` já devolve uma
    // sessão, então o cadastro conta como um aparelho a mais. Prender o número
    // exato aqui faria este arquivo reprovar no dia em que o cadastro deixasse
    // de logar — que é decisão de outro lugar e não tem nada a ver com sair de
    // todos os aparelhos.
    const vivasAntes = (await refreshDe(titular)).filter((l) => l.revoked_at === null).length;
    assert.ok(
      vivasAntes >= APARELHOS,
      `a conta tem ${String(vivasAntes)} famílias vivas antes do botão, e o mínimo para ` +
        `este arquivo medir alguma coisa é ${String(APARELHOS)}. Sem sessão viva não há o ` +
        `que derrubar, e todos os casos abaixo passariam sobre um conjunto vazio.`,
    );

    respostaDoBotao = await chamar(CAMINHO_DO_LOGOUT_TOTAL, {
      metodo: 'POST',
      token: sessoes[0]!.access_token,
    });
  });

  void it('responde 204, e não um erro nem um 200 mentiroso', () => {
    assert.equal(
      respostaDoBotao.status,
      204,
      `"sair de todos os aparelhos" respondeu ${String(respostaDoBotao.status)}: ` +
        `${JSON.stringify(respostaDoBotao.corpo)}.\n\n` +
        `Se veio 5xx, a revogação não aconteceu: \`revogarTodasAsFamilias\` é a PRIMEIRA ` +
        `instrução de \`derrubarTodasAsSessoes\`, e um \`23514\` ali aborta antes de ` +
        `\`invalidarSessoes\`. Confira se \`refresh_tokens_revoked_reason_check\` lista ` +
        `\`${MOTIVO}\` no banco MIGRADO DO ZERO — a migração que o acrescenta já ficou ` +
        `registrada como aplicada sem ter deixado efeito nenhum, por faltar o marcador ` +
        `\`-- Up Migration\`.\n\n` +
        `Se veio 2xx e os casos seguintes reprovaram, é pior: a tela diz que deu certo ` +
        `e o invasor continua dentro.`,
    );
  });

  void it(`marca TODAS as famílias da conta com \`${MOTIVO}\``, async () => {
    const depois = await refreshDe(titular);

    const vivas = depois.filter((l) => l.revoked_at === null);
    assert.equal(
      vivas.length,
      0,
      `${String(vivas.length)} de ${String(depois.length)} famílias continuam vivas ` +
        `depois do botão. É exatamente o aparelho perdido que sobrou: a emenda 1 do ` +
        `ADR-0002 promete a conta inteira, não a sessão de quem apertou.`,
    );

    const motivosErrados = depois.filter((l) => l.revoked_reason !== MOTIVO);
    assert.equal(
      motivosErrados.length,
      0,
      `${String(motivosErrados.length)} linhas foram revogadas com outro motivo ` +
        `(${JSON.stringify([...new Set(motivosErrados.map((l) => l.revoked_reason))])}). ` +
        `Gravar \`logout\` aqui apagaria da trilha a distinção que a emenda 1 do ADR-0002 ` +
        `existe para fixar, e quem investigar uma tomada de conta não saberia se a pessoa ` +
        `encerrou UM aparelho ou pediu para derrubar a conta inteira.`,
    );
  });

  void it('o banco de fato aceita o motivo, e não só a coluna', async () => {
    // A conferência direta da restrição. Ela é redundante com os casos acima
    // **por desenho**: se a rota um dia parar de gravar `logout_all`, os casos
    // acima passam a medir outro motivo e a restrição voltaria a poder perder o
    // valor sem ninguém acusar. Este caso pergunta ao catálogo.
    const restricao = await sql<{ definicao: string }>`
      select pg_get_constraintdef(con.oid) as definicao
        from pg_constraint con
        join pg_class rel    on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
       where con.contype = 'c'
         and ns.nspname = 'public'
         and rel.relname = 'refresh_tokens'
         and con.conname = 'refresh_tokens_revoked_reason_check'
    `.execute(banco.db);

    const definicao = restricao.rows[0]?.definicao;
    assert.ok(
      definicao !== undefined,
      'a restrição `refresh_tokens_revoked_reason_check` não existe neste banco. ' +
        'Sem ela `revoked_reason` aceita qualquer string, e a trilha de revogação ' +
        'deixa de ser um conjunto fechado de motivos.',
    );
    assert.match(
      definicao,
      new RegExp(`'${MOTIVO}'`),
      `a restrição não lista \`${MOTIVO}\`: ${definicao}\n\n` +
        `O banco foi migrado do zero por esta pilha, então isto é uma afirmação sobre ` +
        `as MIGRAÇÕES do repositório, e não sobre o estado de um banco qualquer. ` +
        `A causa conhecida é migração sem o marcador \`-- Up Migration\`: o ` +
        `node-pg-migrate manda o arquivo inteiro como subida, a metade de baixo desfaz ` +
        `a de cima, e a migração fica registrada como aplicada sem efeito.`,
    );
  });

  void it('não encosta na conta do vizinho', async () => {
    const dele = await refreshDe(vizinho);
    const atingidas = dele.filter((l) => l.revoked_at !== null);
    assert.equal(
      atingidas.length,
      0,
      `${String(atingidas.length)} famílias da conta vizinha foram revogadas por um ` +
        `botão apertado em OUTRA conta. O \`WHERE\` de \`revogarTodasAsFamilias\` perdeu ` +
        `o \`user_id\`, e uma tutora apertando "sair de todos" derruba a base inteira.`,
    );

    // A prova comportamental, que é a que uma pessoa entende: o vizinho ainda
    // entra. Contar linha não pega o caso em que a barreira
    // `sessions_invalid_before` foi empurrada para todo mundo sem tocar em
    // `refresh_tokens`.
    const perfil = await chamar('/me', {
      metodo: 'GET',
      token: sessaoDoVizinho.access_token,
    });
    assert.equal(
      perfil.status,
      200,
      `o token da conta vizinha parou de valer (${String(perfil.status)}: ` +
        `${JSON.stringify(perfil.corpo)}) depois de OUTRA conta sair de todos os ` +
        `aparelhos. A barreira em massa alcançou quem não pediu nada.`,
    );
  });

  void it('o refresh de um aparelho que não apertou o botão deixa de rotacionar', async () => {
    // O aparelho perdido. Ele não é quem apertou, e é por ele que o botão
    // existe: se este refresh ainda rotaciona, quem tomou a conta segue dentro
    // com sessão renovável por tempo indeterminado.
    const renovacao = await chamar('/auth/refresh', {
      metodo: 'POST',
      corpo: { refresh_token: sessoes[APARELHOS - 1]!.refresh_token },
    });
    assert.equal(
      renovacao.status,
      401,
      `o refresh do aparelho que NÃO apertou o botão ainda rotacionou ` +
        `(${String(renovacao.status)}: ${JSON.stringify(renovacao.corpo)}). ` +
        `O botão respondeu, a tela disse que deu certo, e o aparelho perdido continua ` +
        `com sessão renovável — que é o incidente inteiro da emenda 1 do ADR-0002.`,
    );
  });
});
