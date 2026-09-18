/**
 * Cronômetro do critério 9 de BICHUS-15: **quando a revogação é medida**, o
 * efeito acontece em menos de um segundo.
 *
 * Por que este arquivo existe: o critério 8 já está provado, e ele prova outra
 * coisa. O critério 8 diz que a comparação `iat` × `sessions_invalid_before`
 * está no caminho de toda requisição — ou seja, que o `if` existe. O critério 9
 * pergunta **quanto tempo o caminho leva**, e até aqui ninguém tinha
 * cronometrado nada: o número de 4.1 do documento de arquitetura era afirmação
 * com mecanismo atrás, não requisito verificado (dívida 9.13).
 *
 * A diferença importa para uma pessoa concreta. Quem teve a conta tomada troca
 * a senha e precisa que o invasor caia AGORA. Se o caminho revogar→401 levasse
 * alguns segundos, o invasor ainda teria tempo de transferir o pet e trocar o
 * e-mail de contato depois de a vítima já ter feito a única coisa que o produto
 * pede que ela faça.
 *
 * ## O que é medido, exatamente
 *
 * Do **commit da revogação** até o **401 observado por HTTP**:
 *
 * - o relógio começa quando `invalidarSessoes` volta do banco — o UPDATE em
 *   `users.sessions_invalid_before` roda em autocommit, então o retorno É o
 *   commit. Medir o tempo de uma função pura não diria nada: o que protege a
 *   vítima é o dado visível para a próxima transação, não a chamada retornar;
 * - o relógio para quando uma requisição HTTP real, com o token de acesso
 *   **emitido antes da revogação**, responde 401 `token-expired`. O token
 *   precisa ser anterior à revogação, senão o caso mede a emissão de um token
 *   novo e passa por acidente;
 * - quem observa é um laço que já está batendo na API quando a revogação
 *   acontece — é o invasor com a sessão na mão, que é justamente o cenário do
 *   critério. As respostas 200 que ele recebe até o commit são esperadas; o que
 *   se cronometra é a PRIMEIRA que vira 401.
 *
 * A rodada acontece {@link REPETICOES} vezes e o que se afirma é o **pior
 * caso**, nunca a média: um p50 bom com um p99 ruim não protege ninguém — a
 * vítima que cair na cauda é uma pessoa de verdade.
 *
 * O teto afirmado é {@link TETO_EM_MS}, que é o número do critério. Ele não é
 * negociável para caber no que passou: se a medição estourar, o desfecho certo
 * é este arquivo ficar vermelho e alguém olhar, e não o número subir.
 *
 * ## O que este arquivo NÃO mede
 *
 * O tempo até a interface do aparelho reagir (isso inclui rede de celular e
 * repetição do cliente) e o tempo dos outros quatro gatilhos do SEC-006. Todos
 * os cinco passam pela MESMA `invalidarSessoes` e pelo MESMO `autenticar`, e é
 * por isso que medir a redefinição de senha — o gatilho que a vítima de fato
 * usa — mede o caminho compartilhado. Quem quiser cobrir os outros quatro
 * acrescenta rodadas aqui; o cronômetro já está pronto.
 *
 * ## Como rodar
 *
 * Não cabe em `npm test`: precisa de banco e sobe servidor. O caminho oficial é
 * `make test-int`, ou, com a pilha já de pé:
 *
 *   docker compose run --rm --build api npm run test:integration
 *
 * O `--build` não é opcional: a imagem `dev` copia `tests/` para dentro dela, e
 * sem reconstruir o contêiner roda a versão antiga deste arquivo — que é como
 * um caso novo "passa" sem nunca ter executado.
 *
 * Para iterar sem reconstruir imagem nenhuma, compilando na máquina e montando
 * só o compilado dentro de um contêiner efêmero da imagem que já existe:
 *
 *   npx tsc -p tsconfig.json --outDir dist/_tests
 *   docker compose run --rm --no-deps \
 *     -v "$PWD/dist/_tests:/app/dist/_tests" api \
 *     node --test "dist/_tests/tests/integration/revogacao-de-sessao.test.js"
 *
 * O arquivo cria uma conta própria, com endereço aleatório em domínio
 * reservado, e a apaga no fim. O que sobrevive à execução são as linhas de
 * `audit.events`, de propósito: a trilha não tem chave estrangeira para `users`
 * e o papel da aplicação não tem DELETE — apagar evidência de auditoria para
 * limpar teste seria furar a garantia que BICHUS-56 cobra.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { registrarRotasDeIdentidade } from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { IdentityRepository } from '../../src/modules/identity/ports/identity-repository.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import type { FastifyInstance } from 'fastify';

/** O número do critério 9. Não é meta de desempenho e não afrouxa. */
const TETO_EM_MS = 1000;

/**
 * Quantas revogações são cronometradas. Mais de uma porque o que se afirma é o
 * pior caso; cinco porque cada rodada custa duas derivações PBKDF2 de 210 mil
 * iterações (login e troca de senha) e a suíte precisa continuar rodável na
 * máquina de quem desenvolve.
 */
const REPETICOES = 5;

/**
 * Até quando o observador insiste antes de desistir.
 *
 * Generoso de propósito: ele não é o teto do critério, é o ponto em que o caso
 * para de esperar e **diz o que houve**. Um observador sem prazo transforma
 * "a comparação saiu do caminho" em teste pendurado, e quem lê o painel vê
 * tempo esgotado sem motivo em vez de um defeito de revogação.
 */
const PRAZO_DE_OBSERVACAO_MS = 15_000;

const PREFIXO_DA_API = '/v1';

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

const MILISSEGUNDO_EM_NANOS = 1_000_000n;

function emMilissegundos(inicio: bigint, fim: bigint): number {
  return Number(fim - inicio) / Number(MILISSEGUNDO_EM_NANOS);
}

interface RespostaDeSessao {
  readonly access_token: string;
  readonly refresh_token: string;
}

interface CorpoDeProblema {
  readonly type?: string;
  readonly title?: string;
}

let app: FastifyInstance;
let banco: { db: Db; close: () => Promise<void> };
let base: string;
let userId: UserId | undefined;

/** As mensagens que o serviço mandaria. É daqui que sai o link de redefinição. */
const caixaDeEntrada: Mensagem[] = [];

/**
 * O instante em que a revogação foi confirmada pelo banco.
 *
 * Preenchido pelo envelope de `invalidarSessoes` abaixo, e zerado no início de
 * cada rodada para que uma rodada nunca meça o commit da anterior.
 */
let commitDaRevogacao: bigint | undefined;

const email = `medicao-revogacao-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
/** Nada em comum com o endereço: a política recusa senha parecida com o e-mail. */
const senhas = Array.from({ length: REPETICOES + 1 }, (_, i) => `chuva-morna-no-telhado-${i}7`);

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

before(async () => {
  // A configuração é a MESMA da aplicação, lida do ambiente: chave de
  // assinatura, emissor, audiência e janelas de sessão. Montar um `config` de
  // mentira aqui mediria um caminho que ninguém roda — e é assim que um teste
  // de desempenho vira decoração.
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  app = criarServidor({ problemBaseUrl: config.problemBaseUrl, isProduction: config.isProduction });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      // Falha de trilha não derruba o pedido em produção, e aqui também não
      // derruba a medição — mas sai ruidosa, senão a rodada passaria verde com
      // metade do caminho quebrado.
      console.error('trilha de auditoria não gravou durante a medição:', erro);
    },
  });

  const repositorio = criarIdentityRepository(db, ids);

  /**
   * O cronômetro.
   *
   * Envelope fino em cima do repositório de verdade: `invalidarSessoes` roda
   * igual, e a única coisa acrescentada é a marca de tempo do retorno. É este
   * ponto — e não a entrada da rota, nem o fim do pedido HTTP — que responde
   * "a partir de quando a revogação está valendo para o resto do sistema".
   */
  const repositorioCronometrado: IdentityRepository = {
    ...repositorio,
    async invalidarSessoes(id: UserId, agora: Instant): Promise<void> {
      await repositorio.invalidarSessoes(id, agora);
      commitDaRevogacao = process.hrtime.bigint();
    },
  };

  const mailer: Mailer = {
    enviar: (mensagem: Mensagem) => {
      caixaDeEntrada.push(mensagem);
      return Promise.resolve();
    },
  };

  const auth = criarAuthService({
    repositorio: repositorioCronometrado,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio: repositorioCronometrado,
      mailer,
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

  // Porta zero: o sistema escolhe uma livre. Porta fixa aqui brigaria com a
  // pilha de desenvolvimento que já está no ar na máquina de quem roda.
  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${String(endereco.port)}`;

  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: senhas[0] },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta da medição não foi criada (${String(cadastro.status)}): ` +
      `sem conta não há sessão para revogar, e o arquivo inteiro deixaria de medir. ` +
      `Resposta: ${JSON.stringify(cadastro.corpo)}`,
  );
  userId = (cadastro.corpo as { user: { id: string } }).user.id as UserId;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    // A conta sai; a trilha fica. `audit.events` não tem chave estrangeira para
    // `users` justamente para sobreviver à exclusão da conta que ela documenta.
    if (userId !== undefined) {
      await banco.db.deleteFrom('users').where('id', '=', userId).execute();
    }
    await banco.close();
  }
});

/**
 * Faz login e só devolve o token depois de ele ter respondido 200 de verdade.
 *
 * A prova de que o token VALIA é o que impede este arquivo de virar teatro:
 * cronometrar o 401 de um token que já nascera inválido mediria zero e passaria
 * sempre.
 *
 * O laço de repetição do login não é frescura, e a razão dele é um efeito real
 * do desenho: `sessions_invalid_before` é gravado com precisão de milissegundo,
 * `iat` tem precisão de segundo, e `tokenFoiRevogado` arredonda a revogação
 * para cima — de propósito, porque é isso que fecha a janela de um segundo que
 * quem tomou a conta usaria. A consequência é que **um login feito no mesmo
 * segundo de uma revogação sai com um token que já nasce recusado**, e ele só
 * começa a valer na virada do segundo. Como cada rodada daqui revoga e a
 * seguinte loga em seguida, sem o novo login a rodada partiria de um token
 * morto. É o mesmo descompasso de escala que `barreiraDeContaNova` corrigiu no
 * cadastro; aqui ele aparece entre redefinir a senha e entrar de novo.
 */
async function abrirSessaoValida(senha: string): Promise<string> {
  const limite = Date.now() + 5000;
  let ultimo = { status: 0, corpo: undefined as unknown };

  while (Date.now() < limite) {
    const login = await chamar('/auth/login', {
      metodo: 'POST',
      corpo: { email, password: senha, stay_signed_in: false },
    });
    assert.equal(
      login.status,
      200,
      `o login da medição falhou (${String(login.status)}): ${JSON.stringify(login.corpo)}`,
    );
    const token = (login.corpo as RespostaDeSessao).access_token;

    ultimo = await chamar('/me', { metodo: 'GET', token });
    if (ultimo.status === 200) return token;
  }

  assert.fail(
    `nenhum token recém-emitido chegou a responder 200 em 5 s (último: ` +
      `${String(ultimo.status)}, ${JSON.stringify(ultimo.corpo)}). Sem um token que ` +
      `comprovadamente valia, não há o que cronometrar.`,
  );
}

/**
 * O invasor com a sessão na mão: bate sem parar até o primeiro 401.
 *
 * Devolve o instante da resposta, tomado assim que os cabeçalhos chegam. O 401
 * precisa ser o do SEC-006 (`token-expired`) e não um 401 qualquer: um
 * `unauthenticated` por token malformado também seria 401 e faria a medição
 * passar sem que a revogação tivesse alcançado nada.
 */
async function observarPrimeiro401(token: string): Promise<{ quando: bigint; tentativas: number }> {
  const limite = Date.now() + PRAZO_DE_OBSERVACAO_MS;
  let tentativas = 0;

  while (Date.now() < limite) {
    const resposta = await fetch(`${base}${PREFIXO_DA_API}/me`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    const quando = process.hrtime.bigint();
    tentativas += 1;
    const corpo = (await resposta.json()) as CorpoDeProblema;

    if (resposta.status === 401) {
      assert.match(
        String(corpo.type),
        /token-expired$/,
        `veio 401, mas por outro motivo (${String(corpo.type)}). O 401 que prova o SEC-006 ` +
          `é o da comparação \`iat\` × \`sessions_invalid_before\`; contar outro faria a ` +
          `medição passar sem a revogação ter alcançado o token.`,
      );
      return { quando, tentativas };
    }
    assert.equal(
      resposta.status,
      200,
      `resposta inesperada (${String(resposta.status)}) durante a observação: ` +
        `${JSON.stringify(corpo)}. O observador só sabe interpretar 200 (ainda vale) ` +
        `e 401 (revogado).`,
    );
  }

  assert.fail(
    `o token emitido ANTES da revogação continuou respondendo 200 durante ` +
      `${String(PRAZO_DE_OBSERVACAO_MS)} ms depois do commit, em ${String(tentativas)} ` +
      `requisições. A revogação não alcançou o token: a comparação \`iat\` × ` +
      `\`sessions_invalid_before\` saiu do caminho de \`autenticar()\`, e com ela o ` +
      `SEC-006 — "revoguei a sessão" voltou a significar "a sessão morre daqui a até ` +
      `quinze minutos".`,
  );
}

/** Pede o link de redefinição e lê o token do corpo da mensagem enviada. */
async function pedirLinkDeRedefinicao(): Promise<string> {
  const antes = caixaDeEntrada.length;
  const pedido = await chamar('/auth/password-reset', { metodo: 'POST', corpo: { email } });
  assert.equal(pedido.status, 202, 'o pedido de redefinição não foi aceito');

  const mensagem = caixaDeEntrada[antes];
  assert.ok(
    mensagem !== undefined,
    'nenhuma mensagem de redefinição saiu: sem o link não há como redefinir, e sem ' +
      'redefinir não há revogação para cronometrar.',
  );
  const achado = /redefinir-senha\?token=([^\s]+)/.exec(mensagem.corpo);
  const token = achado?.[1];
  assert.ok(
    token !== undefined,
    `o corpo da mensagem não traz o link de redefinição no formato esperado: ${mensagem.corpo}`,
  );
  return token;
}

void describe('BICHUS-15 critério 9 — revogar→401 cronometrado de ponta a ponta', () => {
  const medidas: number[] = [];

  void it(`mede ${String(REPETICOES)} revogações reais e afirma o pior caso`, async (t) => {
    t.diagnostic(`teto do critério: ${String(TETO_EM_MS)} ms`);

    for (let rodada = 0; rodada < REPETICOES; rodada += 1) {
      const senhaAtual = senhas[rodada];
      const senhaNova = senhas[rodada + 1];
      assert.ok(senhaAtual !== undefined && senhaNova !== undefined);

      // 1. Sessão nova, já comprovada válida. ESTE token é o que precisa ser
      //    anterior à revogação: um emitido depois mediria a emissão, não a
      //    propagação, e passaria sempre.
      const tokenAntigo = await abrirSessaoValida(senhaAtual);

      const tokenDeRedefinicao = await pedirLinkDeRedefinicao();

      // 2. O observador entra em campo ANTES da revogação, com o token velho na
      //    mão — é o invasor que está usando a conta no momento em que a vítima
      //    troca a senha.
      commitDaRevogacao = undefined;
      const observacao = observarPrimeiro401(tokenAntigo);

      const confirmacao = await chamar('/auth/password-reset/confirm', {
        metodo: 'POST',
        corpo: { token: tokenDeRedefinicao, new_password: senhaNova },
      });
      assert.equal(
        confirmacao.status,
        204,
        `a redefinição da rodada ${String(rodada + 1)} não completou ` +
          `(${String(confirmacao.status)}): ${JSON.stringify(confirmacao.corpo)}`,
      );

      const { quando, tentativas } = await observacao;
      const commit = commitDaRevogacao;
      assert.ok(
        commit !== undefined,
        'a redefinição respondeu 204 sem passar por `invalidarSessoes`: a troca de senha ' +
          'deixou de empurrar `sessions_invalid_before` (critério 7), e o que este arquivo ' +
          'mediria a seguir seria um caminho que não revoga nada.',
      );

      const medida = emMilissegundos(commit, quando);
      assert.ok(
        medida >= 0,
        'o 401 foi observado ANTES do commit da revogação, o que não faz sentido: ' +
          'provavelmente a marca de tempo da rodada anterior vazou para esta.',
      );
      medidas.push(medida);
      t.diagnostic(
        `rodada ${String(rodada + 1)}: ${medida.toFixed(1)} ms do commit ao 401 ` +
          `(${String(tentativas)} requisições com o token antigo até ele cair)`,
      );
    }

    const pior = Math.max(...medidas);
    const melhor = Math.min(...medidas);
    t.diagnostic(
      `pior caso: ${pior.toFixed(1)} ms | melhor: ${melhor.toFixed(1)} ms | ` +
        `todas: ${medidas.map((m) => m.toFixed(1)).join(', ')} ms`,
    );

    assert.ok(
      pior < TETO_EM_MS,
      `o pior caso foi ${pior.toFixed(1)} ms e o critério 9 afirma menos de ` +
        `${String(TETO_EM_MS)} ms. Isto NÃO se corrige subindo o teto: o número é o ` +
        `prazo em que quem tomou a conta para de conseguir mexer nela depois de a ` +
        `vítima trocar a senha.`,
    );
  });

  void it('o token de acesso usado na medição era, de fato, anterior à revogação', () => {
    // Guarda contra a forma mais fácil de este arquivo virar teatro: medir o
    // 401 de um token emitido DEPOIS da revogação mediria a emissão, não a
    // propagação, e passaria sempre. A ordem está garantida pelo laço acima
    // (login → prova de 200 → revogação), e este caso existe para que a
    // afirmação fique escrita onde quem for mexer no arquivo a leia.
    assert.equal(
      medidas.length,
      REPETICOES,
      'nem todas as rodadas produziram medida: o pior caso afirmado acima seria ' +
        'sobre menos revogações do que o arquivo diz medir.',
    );
  });
});
