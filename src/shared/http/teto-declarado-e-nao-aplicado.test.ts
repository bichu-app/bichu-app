/**
 * O teto declarado que não recusa nada.
 *
 * `on_exceed` separa orçamento de requisição de orçamento de efeito, e a borda
 * só sabia recusar `deny_429`. Toda rota que declarava `challenge` — login,
 * cadastro e recuperação de senha entre elas — contava o estouro, gravava a
 * linha e **atendia o pedido**. Força bruta no `/auth/login` não encontrava
 * freio nenhum, com os números certos declarados na rota.
 *
 * O contrato já havia decidido o que fazer: a tabela de `on_exceed` em
 * `info.description` diz que **`challenge` degenera em `deny_429` com
 * `Retry-After`** quando não há desafio para pedir (ADR-0020, camada 2). O que
 * faltava era o código da degeneração.
 *
 * **E a condição dela é a existência do VERIFICADOR, não a presença do
 * cabeçalho.** A primeira versão deste conserto leu "requisição sem
 * `X-Captcha-Token`" literalmente, e com isso `X-Captcha-Token: x` desligava o
 * teto do login: um freio que o atacante desliga com um cabeçalho. Cabeçalho
 * que ninguém verifica não é desafio. As iscas abaixo cobram as duas direções —
 * nenhum valor do cabeçalho atravessa, e havendo verificador o pedido é
 * atendido.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { FastifyRequest } from 'fastify';

import { criarServidor } from './server.js';
import { defineRoute } from './route-definition.js';
import { registrarRota } from './registrar-rota.js';
import { criarContadorEmMemoria } from './rate-limit.js';
import { tetoDeTeste } from './teto-de-teste.js';
import {
  ACOES_QUE_RECUSAM_IMPLEMENTADAS,
  SEMANTICA_DO_EXCESSO,
  conferirAcoesDeExcesso,
  dependenciasDoTeto,
} from './aplicacao-de-teto.js';
import { CHAVE_DE_HMAC_DE_TESTE } from './teto-de-teste.js';

/**
 * O cabeçalho do desafio antiabuso. Ele mora AQUI, e não no despachante, porque
 * o despachante não o consulta: quem decide é a existência do verificador. As
 * iscas deste arquivo existem para provar essa indiferença.
 */
const CABECALHO_DE_CAPTCHA = 'x-captcha-token';
import type { OnExceed } from './route-definition.js';
import type { ResolvedorDeDimensao, Sigilo } from './aplicacao-de-teto.js';
import { rotaDeLogin } from '../../modules/identity/adapters/http/routes.js';
import type { RateLimitStore } from '../ports/rate-limit-store.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

/** Um IP só, para que o balde seja o mesmo nas três chamadas. */
const IP = '198.51.100.9';

function servidor(contador: RateLimitStore) {
  return criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador),
    bodyLimitBytes: 1_048_576,
  });
}

function tipoDe(corpo: string): string | undefined {
  try {
    const { type } = JSON.parse(corpo) as { type?: unknown };
    return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
  } catch {
    return undefined;
  }
}

function rotaCom(acao: OnExceed, limite = 2) {
  return defineRoute({
    operationId: `exemploCom_${acao}`,
    method: 'post',
    path: `/exemplo-${acao.replace(/_/g, '-')}`,
    effects: ['verifies_secret'],
    rateLimit: [{ dimension: ['ip'], limit: limite, window: '1h', onExceed: acao }],
  });
}

/** Três chamadas sobre um teto de duas, e o que voltou de cada uma. */
async function statusDasTres(
  acao: OnExceed,
  cabecalhos: Record<string, string> = {},
): Promise<{ status: readonly number[]; tipoDaUltima: string | undefined }> {
  const rota = rotaCom(acao);
  const app = servidor(criarContadorEmMemoria(() => Date.now()));
  registrarRota(app, rota, {}, async (_request, reply) => reply.status(200).send({}));

  const status: number[] = [];
  let ultimo = '';
  for (let i = 0; i < 3; i += 1) {
    const resposta = await app.inject({
      method: 'POST',
      url: rota.path,
      headers: { 'x-forwarded-for': IP, ...cabecalhos },
    });
    status.push(resposta.statusCode);
    ultimo = resposta.body;
  }
  await app.close();
  return { status, tipoDaUltima: tipoDe(ultimo) };
}

void describe('isca 1: ação que RECUSA, teto estourado, recusa de verdade', () => {
  void it('`challenge` sem `X-Captcha-Token` recusa a terceira chamada', async () => {
    const { status, tipoDaUltima } = await statusDasTres('challenge');
    assert.deepEqual(
      status,
      [200, 200, 429],
      'o `challenge` estourado atendeu o pedido: o teto do login não freia nada',
    );
    assert.equal(tipoDaUltima, 'rate-limited', 'a recusa saiu com outro tipo de problema');
  });

  void it('a recusa nomeia a rota e a ação no registro quando a borda não a aplica', () => {
    const rota = rotaCom('challenge');
    assert.throws(
      () => conferirAcoesDeExcesso(rota, new Set<OnExceed>(['deny_429'])),
      (erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        assert.match(mensagem, /exemploCom_challenge/, 'a reprovação não nomeou a rota');
        assert.match(mensagem, /challenge/, 'a reprovação não nomeou a ação');
        return true;
      },
      'ação que recusa e que a borda não sabe aplicar subiu calada',
    );
  });
});

void describe('isca 2: controle positivo, o que já funcionava continua', () => {
  void it('`deny_429` recusa a terceira chamada, como antes', async () => {
    const { status, tipoDaUltima } = await statusDasTres('deny_429');
    assert.deepEqual(status, [200, 200, 429], '`deny_429` parou de recusar');
    assert.equal(tipoDaUltima, 'rate-limited');
  });

  void it('`deny_429` recusa mesmo com `X-Captcha-Token` presente', async () => {
    const { status } = await statusDasTres('deny_429', { [CABECALHO_DE_CAPTCHA]: 'token-qualquer' });
    assert.deepEqual(
      status,
      [200, 200, 429],
      'o cabeçalho de captcha virou passe livre numa ação que recusa sempre',
    );
  });
});

void describe('isca 3: controle, ação que só OBSERVA não recusa nem derruba a subida', () => {
  /**
   * `log_and_alert` é a ação informativa de propósito — a linha 67 de
   * `identity/.../routes.ts` a usa num teto de 2000/h. Derrubar a subida ou
   * recusar a requisição por causa dela seria trocar um defeito por outro.
   */
  void it('`log_and_alert` estourado continua atendendo', async () => {
    const { status } = await statusDasTres('log_and_alert');
    assert.deepEqual(status, [200, 200, 200], 'uma ação que aceita e grava passou a recusar');
  });

  void it('as três dívidas registradas do contrato não derrubam a subida', () => {
    for (const acao of ['serve_cache', 'accept_and_deduplicate', 'raise_queue_priority'] as const) {
      assert.equal(
        SEMANTICA_DO_EXCESSO[acao],
        'observa',
        `${acao} está classificada como recusa, e a subida vai cair por uma dívida datada`,
      );
      assert.doesNotThrow(() => {
        conferirAcoesDeExcesso(rotaCom(acao));
      }, `${acao} derrubou a subida`);
    }
  });

  void it('toda ação que observa atravessa o portão', () => {
    for (const [acao, semantica] of Object.entries(SEMANTICA_DO_EXCESSO)) {
      if (semantica !== 'observa') continue;
      assert.doesNotThrow(() => {
        conferirAcoesDeExcesso(rotaCom(acao as OnExceed));
      }, `${acao} observa e ainda assim derrubou a subida`);
    }
  });
});

void describe('o freio não se desliga por cabeçalho', () => {
  /**
   * A isca que faltava na primeira versão deste arquivo.
   *
   * Eu havia lido a degeneração do ADR-0020 como "não há `X-Captcha-Token` na
   * requisição", e com isso `X-Captcha-Token: x` desligava o teto do login. A
   * condição do contrato é "não há desafio PARA PEDIR", e cabeçalho que ninguém
   * verifica não é desafio: é uma string que o atacante escolhe.
   */
  void it('nenhum valor de `X-Captcha-Token` atravessa o teto', async () => {
    for (const valor of ['token-do-recaptcha', 'x', '', '   ', 'Bearer qualquer-coisa']) {
      const { status } = await statusDasTres('challenge', { [CABECALHO_DE_CAPTCHA]: valor });
      assert.deepEqual(
        status,
        [200, 200, 429],
        `\`X-Captcha-Token: ${valor}\` desligou o freio: o teto virou pedido de licença`,
      );
    }
  });

  void it('a decisão não lê o cabeçalho: com e sem ele, o resultado é o mesmo', async () => {
    const semCabecalho = await statusDasTres('challenge');
    const comCabecalho = await statusDasTres('challenge', {
      [CABECALHO_DE_CAPTCHA]: 'token-do-recaptcha',
    });
    assert.deepEqual(comCabecalho.status, semCabecalho.status);
  });
});

void describe('a condição é o VERIFICADOR, e não o cabeçalho', () => {
  /**
   * O outro lado da isca: a regra não é "challenge sempre recusa", é "recusa
   * onde não há verificador". Havendo verificador ligado para a rota, o desafio
   * tem onde ser cobrado e o pedido é atendido (camada 1 do ADR-0020) — sem
   * reescrever a condição no dia em que o captcha do app entrar.
   *
   * Hoje nenhuma superfície liga o predicado, e o único leitor de
   * `x-captcha-token` em `src/` é o login do painel.
   */
  async function statusComVerificador(
    verifica: boolean,
  ): Promise<readonly number[]> {
    const rota = rotaCom('challenge');
    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMA,
      isProduction: false,
      teto: dependenciasDoTeto({
        contador: criarContadorEmMemoria(() => Date.now()),
        chaveDeHmac: CHAVE_DE_HMAC_DE_TESTE,
        log: () => {},
        desafioVerificavelEm: () => verifica,
      }),
      bodyLimitBytes: 1_048_576,
    });
    registrarRota(app, rota, {}, async (_request, reply) => reply.status(200).send({}));
    const status: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: rota.path,
        headers: { 'x-forwarded-for': IP },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('COM verificador na superfície, `challenge` atende o estouro', async () => {
    assert.deepEqual(
      await statusComVerificador(true),
      [200, 200, 200],
      'havendo quem cobre o desafio, o pedido devia ser atendido',
    );
  });

  void it('SEM verificador, `challenge` recusa', async () => {
    assert.deepEqual(await statusComVerificador(false), [200, 200, 429]);
  });

  void it('predicado AUSENTE é o mesmo que não haver verificador', async () => {
    const { status } = await statusDasTres('challenge');
    assert.deepEqual(
      status,
      [200, 200, 429],
      'sem predicado, o padrão tem de ser recusar -- o contrário seria liberar por omissão',
    );
  });
});

void describe('o desafio não pode matar a sessão de quem não tem tela', () => {
  /**
   * O contrato: operação chamada em segundo plano leva `log_and_alert`, nunca
   * `challenge`, porque "o efeito real nao e desafiar: e a sessao morrer em
   * silencio". Com a degeneração implementada, esse efeito passou a existir de
   * verdade, então o portão o barra no registro.
   */
  void it('`challenge` numa rota `x-no-challenge: true` reprova nomeando a rota', () => {
    const rota = defineRoute({
      operationId: 'renovacaoQueDesafia',
      method: 'post',
      path: '/exemplo-no-challenge',
      effects: ['verifies_secret'],
      noChallenge: true,
      rateLimit: [{ dimension: ['ip'], limit: 2, window: '1h', onExceed: 'challenge' }],
    });
    assert.throws(
      () => {
        conferirAcoesDeExcesso(rota);
      },
      (erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        assert.match(mensagem, /renovacaoQueDesafia/);
        assert.match(mensagem, /no-challenge/);
        return true;
      },
      'desafio em operação sem tela atravessou o portão',
    );
  });
});

void describe('a rota de login DE VERDADE passa a frear', () => {
  /**
   * As iscas acima usam rota sintética. Esta usa `rotaDeLogin` como ela está
   * declarada, com o teto de 5/h por e-mail e o de 10/h por IP, porque o que
   * importa não é o mecanismo em abstrato: é que a força bruta no `/auth/login`
   * encontre freio.
   */
  const emailDoCorpo: ResolvedorDeDimensao = (
    request: FastifyRequest,
    sigilo: Sigilo,
  ): string | undefined => {
    const corpo = (request.body ?? {}) as { email?: unknown };
    if (typeof corpo.email !== 'string' || corpo.email === '') return undefined;
    return sigilo.hmac(`email:${corpo.email.trim().toLowerCase()}`);
  };

  async function tentativas(
    quantas: number,
    emailPorTentativa: (indice: number) => string,
  ): Promise<readonly number[]> {
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    registrarRota(
      app,
      rotaDeLogin,
      { resolvedores: { email: emailDoCorpo } },
      async (_request, reply) => reply.status(200).send({}),
    );
    const status: number[] = [];
    for (let i = 0; i < quantas; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-forwarded-for': IP },
        payload: { email: emailPorTentativa(i), password: 'nao-confere' },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('o teto de 5 por hora por e-mail recusa a sexta tentativa no mesmo e-mail', async () => {
    const status = await tentativas(6, () => 'vitima@bichu.test');
    assert.deepEqual(
      status.slice(0, 5),
      [200, 200, 200, 200, 200],
      'o teto cortou antes das 5 declaradas',
    );
    assert.equal(
      status[5],
      429,
      'seis tentativas de senha no mesmo e-mail e nenhuma recusa: a força bruta segue livre',
    );
  });

  void it('o teto de 10 por hora por IP recusa a décima primeira, variando o e-mail', async () => {
    const status = await tentativas(11, (i) => `alvo${String(i)}@bichu.test`);
    assert.deepEqual(status.slice(0, 10), Array.from({ length: 10 }, () => 200));
    assert.equal(
      status[10],
      429,
      'onze e-mails distintos do mesmo IP e nenhuma recusa: a varredura de contas segue livre',
    );
  });
});

void describe('`ip_24` conta por faixa, e não num balde global', () => {
  /**
   * O teto de `ip_24` era um balde só para o produto inteiro: o rótulo do /24
   * passava por `hmacDeIp`, que o reduzia a `'desconhecido'`. Com `challenge`
   * recusando de verdade, esse balde vira um teto global — foi assim que a
   * suíte de integração recusou a 31a conta de apoio, cada uma de um /24
   * diferente, num teto de 30.
   */
  async function statusDeDoisClientes(
    acao: OnExceed,
    primeiro: string,
    segundo: string,
  ): Promise<readonly number[]> {
    const rota = defineRoute({
      operationId: `exemploIp24_${acao}`,
      method: 'post',
      path: `/exemplo-ip24-${acao.replace(/_/g, '-')}`,
      effects: ['verifies_secret'],
      rateLimit: [{ dimension: ['ip_24'], limit: 1, window: '1h', onExceed: acao }],
    });
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    registrarRota(app, rota, {}, async (_request, reply) => reply.status(200).send({}));
    const status: number[] = [];
    for (const endereco of [primeiro, primeiro, segundo]) {
      const resposta = await app.inject({
        method: 'POST',
        url: rota.path,
        headers: { 'x-forwarded-for': endereco },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('faixa DIFERENTE tem balde próprio: o teto de um /24 não recusa o outro', async () => {
    const status = await statusDeDoisClientes('deny_429', '198.18.100.1', '203.0.113.7');
    assert.deepEqual(
      status,
      [200, 429, 200],
      'o `ip_24` de uma faixa recusou outra faixa: o balde voltou a ser global',
    );
  });

  void it('a MESMA faixa compartilha o balde, que é o que a dimensão promete', async () => {
    const status = await statusDeDoisClientes('deny_429', '198.18.100.1', '198.18.100.250');
    assert.deepEqual(
      status,
      [200, 429, 429],
      'dois endereços do mesmo /24 deixaram de dividir o balde de `ip_24`',
    );
  });
});

void describe('a dimensão `ip` é, por privacidade, uma faixa /24', () => {
  /**
   * `reduzirEnderecoIp` reduz todo IPv4 ao /24 ANTES de digerir (SEC-010), e
   * isso vale também para a dimensão `ip`. A consequência não é defeito, é o
   * desenho — mas muda o raio de alcance de todo teto "por IP" do produto, e
   * por isso fica medido aqui em vez de suposto.
   */
  void it('dois endereços do mesmo /24 dividem o balde de `ip`', async () => {
    const rota = rotaCom('deny_429');
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    registrarRota(app, rota, {}, async (_request, reply) => reply.status(200).send({}));
    const status: number[] = [];
    for (const endereco of ['203.0.113.10', '203.0.113.11', '203.0.113.12']) {
      const resposta = await app.inject({
        method: 'POST',
        url: rota.path,
        headers: { 'x-forwarded-for': endereco },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    assert.deepEqual(
      status,
      [200, 200, 429],
      'a dimensão `ip` passou a distinguir endereços dentro do /24, e o teto por IP ficou mais estreito do que o medido',
    );
  });
});

void describe('o vocabulário do código é o vocabulário do contrato', () => {
  /**
   * O `Record<OnExceed, …>` já reprova em `tsc` a ação sem classificação. Este
   * caso fecha o outro lado: a ação que existe no CONTRATO e não no tipo. Sem
   * ele, um valor novo no YAML viraria liberação silenciosa até alguém mexer no
   * TypeScript.
   */
  const yaml = readFileSync('api/openapi.yaml', 'utf8');

  function acoesDoContrato(): readonly string[] {
    const inicio = yaml.indexOf('\n  on_exceed:\n');
    assert.notEqual(inicio, -1, 'o bloco `on_exceed:` saiu de `api/openapi.yaml`');
    const corpo = yaml.slice(inicio + 1);
    const fim = corpo.search(/\n[^\s#]/);
    const bloco = fim === -1 ? corpo : corpo.slice(0, fim);
    const achadas = [...bloco.matchAll(/^ {4}([a-z_0-9]+):/gm)].map((casado) => casado[1] ?? '');
    return achadas;
  }

  void it('a leitura do contrato achou o vocabulário inteiro, e não uma lista vazia', () => {
    const acoes = acoesDoContrato();
    assert.equal(
      acoes.length,
      11,
      `a leitura achou ${String(acoes.length)} ações: ${acoes.join(', ')}`,
    );
    assert.ok(acoes.includes('deny_429'), 'a leitura não achou `deny_429`');
    assert.ok(acoes.includes('challenge'), 'a leitura não achou `challenge`');
  });

  void it('toda ação do contrato está classificada no código', () => {
    for (const acao of acoesDoContrato()) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SEMANTICA_DO_EXCESSO, acao),
        `\`${acao}\` existe no contrato e não está em SEMANTICA_DO_EXCESSO`,
      );
    }
  });

  void it('toda ação classificada como recusa é aplicada pela borda', () => {
    for (const [acao, semantica] of Object.entries(SEMANTICA_DO_EXCESSO)) {
      if (semantica !== 'recusa') continue;
      assert.ok(
        ACOES_QUE_RECUSAM_IMPLEMENTADAS.has(acao as OnExceed),
        `\`${acao}\` recusa e a borda não a aplica: teto declarado que libera em silêncio`,
      );
    }
  });

  void it('as duas que recusam são `deny_429` e `challenge`', () => {
    const recusam = Object.entries(SEMANTICA_DO_EXCESSO)
      .filter(([, semantica]) => semantica === 'recusa')
      .map(([acao]) => acao)
      .sort();
    assert.deepEqual(recusam, ['challenge', 'deny_429']);
  });
});
