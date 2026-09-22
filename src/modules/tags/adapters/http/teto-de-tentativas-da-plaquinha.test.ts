/**
 * O teto de tentativas invalidas de `GET /tags/{code}`, medido pela POSICAO da
 * recusa, na dimensao `finder_identity`.
 *
 * ===========================================================================
 * POR QUE ESTA ENTRADA, E POR QUE ELA PRIMEIRO
 * ===========================================================================
 * `resolveTagCode` e a rota que o QR da coleira abre. Ela e **publica**: nao ha
 * conta, nao ha token, e qualquer pessoa na internet chega nela com um codigo
 * na URL. O codigo tem 75 bits de aleatoriedade (`tag-code.ts`), entao adivinhar
 * um por forca bruta nao e o risco; o risco e o laco barato -- quem varre codigos
 * paga quase nada por tentativa e o servico paga uma consulta por chamada.
 *
 * A quinta entrada de `x-rate-limit` desta operacao e o freio disso: cinco
 * tentativas INVALIDAS em dez minutos, por identidade de achador, com
 * `deny_429`. Ate 22/09 ela nao tinha teste nenhum -- nem o compilador a
 * alcancava, porque apagar UMA entrada de uma lista de seis nao viola o tipo
 * `NonEmpty` de `defineRoute`.
 *
 * As DUAS entradas de `invalid_attempts` desta operacao sao medidas aqui, cada
 * uma na posicao em que ela e observavel: a quinta (5 por `finder_identity`, em
 * 10 min) pela sexta tentativa do mesmo aparelho, e a sexta (20 por `ip`, em
 * 1 h) por um aparelho LIMPO que chega depois de quatro outros terem gasto cinco
 * cada. Nenhuma das duas tinha teste ate 22/09.
 *
 * ===========================================================================
 * AS DUAS ARMADILHAS DESTA CASA, E COMO CADA UMA E DESARMADA AQUI
 * ===========================================================================
 * **1. A mesma rota tem DUAS entradas de `invalid_attempts`, as duas
 * `deny_429`.** Alem desta (5 por identidade, em 10 min) existe a sexta: 20 por
 * IP, em 1 h. Apagar a de `finder_identity` NAO faz o 429 sumir -- a de IP
 * continua recusando, so que na VIGESIMA PRIMEIRA chamada em vez da sexta. Um
 * teste que afirme "alguma chamada levou 429" passa nos dois mundos e nao vigia
 * nada. Por isso o que este arquivo afirma e a POSICAO: as cinco primeiras
 * respondem 404 e a SEXTA responde 429. Quadruplicar o que um varredor consegue
 * antes de ser barrado e exatamente a regressao que a medicao por presenca
 * deixaria passar.
 *
 * **2. Blocos de `rateLimit` de rotas diferentes sao identicos byte a byte.**
 * Por isso o caso de declaracao deste arquivo ancora no `operationId` -- ele le
 * `rotaDeResolucaoDaTag`, que e a declaracao exportada, e nao um trecho de
 * texto. Nenhuma busca textual decide nada aqui.
 *
 * **3. O numero esperado NAO sai da declaracao da rota.** `TETO_DE_INVALIDAS`
 * e literal, com a fonte citada. Um teste que tirasse o esperado do mesmo lugar
 * que exercita e tautologia: trocar 5 por 50 na rota passaria com a suite verde.
 * Isso tambem e o que este arquivo acrescenta a
 * `src/shared/http/rotas-registradas-contra-o-contrato.test.ts`, que compara a
 * rota contra o YAML: uma edicao COORDENADA nos dois arquivos passa la, e
 * reprova aqui.
 *
 * O CAMINHO, ao contrario do numero, sai da declaracao
 * (`rotaDeResolucaoDaTag.path`): caminho escrito a mao vira 404 em silencio, e
 * 404 aqui e justamente a resposta que o caso espera nas cinco primeiras -- a
 * isca reprovaria pelo motivo errado, ou pior, passaria por ele.
 *
 * ===========================================================================
 * O QUE O BANCO NAO ACRESCENTARIA
 * ===========================================================================
 * Nada deste arquivo depende de Postgres. Quem conta e
 * `criarContadorEmMemoria`, quem aplica e `registrarRota` com os ganchos de
 * verdade, e quem resolve `finder_identity` e o resolvedor de producao
 * (`resolvedoresDaTag`, que chama `hmacDeIdentidadeDoAchador`). O duble e o
 * REPOSITORIO, e so ele: uma plaquinha que nao existe e exatamente o que
 * `resolverPorCodigo` devolvendo `undefined` significa. Subir banco para provar
 * em qual chamada o 429 chega seria medir a mesma coisa mais devagar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { Idempotencia } from '../../../../shared/http/idempotency.js';
import type { RateLimitEntry } from '../../../../shared/http/route-definition.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, OpaqueToken } from '../../../../shared/types/brands.js';
import { criarTagService } from '../../application/tag-service.js';
import { gerarCodigoDaTag } from '../../domain/tag-code.js';
import { criarRasterizadorDeQr } from '../external/sharp-rasterizador-de-qr.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { TagRepository } from '../../ports/tag-repository.js';
import {
  registrarRotasDeTags,
  rotaDeResolucaoDaTag,
  type DependenciasDasRotasDeTag,
} from './tag-routes.js';

const PREFIXO_DA_API = '/v1';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;
const AGORA = 1_800_000_000_000 as Instant;

/** Da DECLARACAO, nunca escrito a mao: caminho errado vira 404 em silencio. */
const RESOLUCAO = rotaDeResolucaoDaTag.path;

/**
 * O teto de tentativas INVALIDAS por identidade de achador, literal e com fonte.
 *
 * Fonte: `api/openapi.yaml`, operacao `resolveTagCode`, quinta entrada de
 * `x-rate-limit` (`dimension: [finder_identity]`, `applies_to: invalid_attempts`,
 * `limit: 5`, `window: 10m`, `on_exceed: deny_429`). ADR-0016 define o mecanismo.
 */
const TETO_DE_INVALIDAS = 5;

/** O OUTRO teto de invalidas da MESMA rota, que torna a medicao por presenca inutil. */
const TETO_DE_INVALIDAS_POR_IP = 20;

/** Dois aparelhos distintos atras do mesmo endereco. E o par que forma a identidade. */
const APARELHO_A = 'Mozilla/5.0 (Android 14; Pixel 7) AppleWebKit/537.36';
const APARELHO_B = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)';
const ENDERECO = '203.0.113.44';

/**
 * Quantos aparelhos distintos cabem no teto por IP antes de ele estourar.
 *
 * Quatro, porque cada um gasta `TETO_DE_INVALIDAS` antes de ser barrado pelo
 * proprio balde: 4 x 5 = 20, que e exatamente `TETO_DE_INVALIDAS_POR_IP`. E a
 * conta que o contrato fez ao escolher os dois numeros, e escreve-la aqui e o
 * que faz este arquivo reprovar se qualquer um dos dois mudar sem o outro.
 */
const APARELHOS_ATE_O_TETO_DE_IP = TETO_DE_INVALIDAS_POR_IP / TETO_DE_INVALIDAS;

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

/**
 * Bancada nova a cada caso: contador em memoria zerado, e nenhum caso herda o
 * balde do anterior. Contador compartilhado faria a POSICAO medida depender da
 * ordem de execucao, que e o defeito que este arquivo existe para nao ter.
 */
function bancada(contador: RateLimitStore = criarContadorEmMemoria(() => Date.now())): RegistradorDeRotas {
  /**
   * O duble e so o repositorio, e ele devolve `undefined` SEMPRE: e assim que
   * `resolverPorCodigo` diz "nao existe plaquinha com este codigo", e o servico
   * traduz isso em `tag-code-not-found` (`tag-service.ts`). E esse tipo de
   * problema que `registrar-rota.ts` classifica como tentativa invalida.
   */
  const repositorio: TagRepository = {
    resolverPorCodigo: () => Promise.resolve(undefined),
    buscarContextoDoDono: () => naoUsado('buscarContextoDoDono'),
    listarTagsDoPet: () => naoUsado('listarTagsDoPet'),
    buscarParaReimpressao: () => naoUsado('buscarParaReimpressao'),
    emitir: () => naoUsado('emitir'),
    registrarScan: () => naoUsado('registrarScan'),
    registrarAviso: () => naoUsado('registrarAviso'),
    avisoRecenteDoMesmoAchador: () => naoUsado('avisoRecenteDoMesmoAchador'),
    jaAvisouRecentemente: () => naoUsado('jaAvisouRecentemente'),
  };
  const trilha: AuditLog = { record: () => Promise.resolve() };
  const clock: Clock = { now: () => AGORA };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: () => 'token' as OpaqueToken,
    random128: () => new Uint8Array(16).fill(0x2b),
    random80: () => new Uint8Array(10).fill(0x2b),
  };
  const cifra: SecretCipher = {
    encrypt: (texto) => Promise.resolve(new TextEncoder().encode(texto)),
    decrypt: (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
  };
  const tags = criarTagService({
    repositorio,
    cifra,
    ids,
    clock,
    trilha,
    conversaDoAviso: { aoRegistrarAviso: () => Promise.resolve() },
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaTag: 'https://tag.exemplo.invalido' as AbsoluteUrl,
    baseDaWeb: 'https://exemplo.invalido' as AbsoluteUrl,
    rasterizador: criarRasterizadorDeQr(),
  });
  const autenticador: Autenticador = {
    autenticar: () => naoUsado('autenticar'),
  };
  const idempotencia: Idempotencia = {
    reservar: () => Promise.resolve(undefined),
    concluir: () => Promise.resolve(),
    liberar: () => Promise.resolve(),
  };

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    // EM MEMORIA por padrao, e nao desligado. Um contador desligado faria este
    // arquivo inteiro medir o nada, verde, para sempre. O unico caso que passa
    // `criarContadorDesligado()` e a isca do fim, e ele o passa na linha, onde
    // a revisao ve.
    teto: tetoDeTeste(contador),
  });
  const deps: DependenciasDasRotasDeTag = {
    tags,
    autenticador,
    idempotencia,
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    ipHmacKey: Buffer.alloc(32, 7),
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaApi: 'https://api.exemplo.invalido',
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeTags(escopo, deps);
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );
  return app;
}

/**
 * Um codigo VALIDO e diferente a cada tentativa.
 *
 * Quem varre plaquinhas tenta codigos diferentes, e e por isso que o teto conta
 * por identidade e nao por codigo. Repetir o mesmo codigo nas seis chamadas
 * mediria um cenario que nao existe, e ainda deixaria a entrada por `[code]`
 * (100 por 24 h, `notify_owner`) participar da conta.
 */
function codigoValido(semente: number): string {
  return gerarCodigoDaTag(new Uint8Array(10).fill(semente));
}

interface Resposta {
  readonly status: number;
  readonly tipo: string | undefined;
  readonly retryAfter: string | undefined;
}

async function tentar(
  app: RegistradorDeRotas,
  aparelho: string,
  semente: number,
): Promise<Resposta> {
  const resposta = await app.inject({
    method: 'GET',
    url: `${PREFIXO_DA_API}${RESOLUCAO.replace(':code', codigoValido(semente))}`,
    headers: { 'x-forwarded-for': ENDERECO, 'user-agent': aparelho },
  });
  let tipo: string | undefined;
  try {
    const { type } = JSON.parse(resposta.body) as { type?: unknown };
    tipo = typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
  } catch {
    tipo = undefined;
  }
  return {
    status: resposta.statusCode,
    tipo,
    retryAfter: resposta.headers['retry-after'],
  };
}

void describe('o teto de invalidas de GET /tags/{code}, pela posicao da recusa', () => {
  void it('a sexta plaquinha inexistente do mesmo achador responde 429; as cinco antes, 404', async () => {
    const app = bancada();
    // EM SERIE, de proposito. A contagem da invalida acontece em `onResponse`,
    // DEPOIS de a resposta sair: em paralelo a sexta poderia chegar ao teto
    // antes de a quinta ter sido contada, e a posicao medida seria outra.
    const respostas: Resposta[] = [];
    for (let i = 0; i < TETO_DE_INVALIDAS + 1; i += 1) {
      respostas.push(await tentar(app, APARELHO_A, i + 1));
    }
    await app.close();
    const status = respostas.map((r) => r.status);

    assert.deepEqual(
      status.slice(0, TETO_DE_INVALIDAS),
      Array.from({ length: TETO_DE_INVALIDAS }, () => 404),
      `as ${String(TETO_DE_INVALIDAS)} primeiras tentativas com codigo inexistente deviam ` +
        `responder 404 \`tag-code-not-found\`, e sairam ${JSON.stringify(status)}. Um 429 antes ` +
        'da quinta barraria quem digitou errado o codigo de uma coleira de verdade, que e ' +
        'quem esta rota existe para atender.',
    );
    assert.deepEqual(
      respostas.slice(0, TETO_DE_INVALIDAS).map((r) => r.tipo),
      Array.from({ length: TETO_DE_INVALIDAS }, () => 'tag-code-not-found'),
      'as tentativas antes do teto precisam sair com `type: tag-code-not-found`. Outro tipo ' +
        'nao e contado como tentativa invalida (`TIPOS_DE_TENTATIVA_INVALIDA`), e ai o 429 ' +
        'seguinte teria vindo de outro teto.',
    );

    assert.equal(
      status[TETO_DE_INVALIDAS],
      429,
      `a ${String(TETO_DE_INVALIDAS + 1)}a tentativa invalida respondeu ` +
        `${String(status[TETO_DE_INVALIDAS])}, e o conjunto foi ${JSON.stringify(status)}.\n\n` +
        'E A POSICAO QUE IMPORTA, E ESTE E O MOTIVO: `resolveTagCode` declara DUAS entradas ' +
        '`deny_429` de `applies_to: invalid_attempts`. Apagar a de `finder_identity` nao faz o ' +
        `429 sumir -- a de IP (${String(TETO_DE_INVALIDAS_POR_IP)} por hora) continua recusando, ` +
        `so que na ${String(TETO_DE_INVALIDAS_POR_IP + 1)}a chamada. Se este caso saiu 404 aqui, ` +
        'quem varre codigos de plaquinha ganhou quatro vezes mais tentativas por hora e nada ' +
        'mais mudou. A rota e publica: nao ha conta, nao ha token, e o unico freio dela e este.',
    );

    const recusa = respostas[TETO_DE_INVALIDAS];
    assert.ok(recusa !== undefined, 'a sexta resposta nao chegou');
    assert.equal(
      recusa.tipo,
      'rate-limited',
      `a recusa saiu com \`type: ${String(recusa.tipo)}\` em vez de \`rate-limited\`. Um 429 de ` +
        'outro `type` nao e este teto, e o app decide pelo `type` (RFC 9457).',
    );
    assert.ok(
      recusa.retryAfter !== undefined,
      'o 429 saiu sem `Retry-After`. RFC 9110: sem ele o app offline fica martelando a rota.',
    );
  });

  void it('o balde e do par (endereco, aparelho): outro aparelho no mesmo IP ainda e atendido', async () => {
    // O QUE DISTINGUE `finder_identity` DE `ip`, e por que a distincao e cara.
    //
    // O CGNAT das operadoras brasileiras poe muita gente atras de poucos
    // enderecos (e por isso que existe a dimensao `ip_24`, ao lado). Se esta
    // entrada passasse a contar por `ip`, cinco erros de digitacao de UMA pessoa
    // trancariam a rua inteira por dez minutos -- e a rota trancada e justamente
    // a que alguem abre com um cachorro perdido na mao.
    //
    // Este caso reprova a troca de `['finder_identity']` por `['ip']`, que
    // COMPILA (`ip` e dimensao generica e nao exige resolvedor) e que passaria
    // pelo caso de posicao acima sem mudar uma linha do resultado.
    const app = bancada();
    for (let i = 0; i < TETO_DE_INVALIDAS; i += 1) {
      await tentar(app, APARELHO_A, i + 1);
    }
    const outroAparelho = await tentar(app, APARELHO_B, 90);
    const mesmoAparelho = await tentar(app, APARELHO_A, 91);
    await app.close();

    assert.equal(
      outroAparelho.status,
      404,
      `o segundo aparelho no mesmo endereco respondeu ${String(outroAparelho.status)} na ` +
        'PRIMEIRA tentativa dele. O balde deixou de ser do par (endereco, aparelho) e virou do ' +
        'endereco: sob CGNAT isso tranca todo mundo que divide a saida com quem errou.',
    );
    assert.equal(
      mesmoAparelho.status,
      429,
      `o aparelho que ja tinha gasto as ${String(TETO_DE_INVALIDAS)} tentativas respondeu ` +
        `${String(mesmoAparelho.status)}. Sem isto, o caso acima poderia estar verde por o teto ` +
        'ter sido afrouxado em vez de por ele valer.',
    );
  });

  void it('esgotados quatro aparelhos, o quinto ja chega recusado: o teto por IP', async () => {
    // ===================================================================
    // A SEXTA ENTRADA, QUE E O PAR DA QUINTA
    // ===================================================================
    // `resolveTagCode` tem DUAS entradas `invalid_attempts`, e a de IP existe
    // para o caso que a de identidade nao alcanca: quem troca o `User-Agent` a
    // cada tentativa ganha um balde novo de cinco, e faria varredura sem fim
    // por um preco desprezivel. A de IP fecha isso em vinte por hora.
    //
    // Este caso mede a POSICAO dela pelo unico caminho em que ela e observavel:
    // quatro aparelhos gastando cinco invalidas cada, e um QUINTO aparelho,
    // limpo, que precisa chegar ja recusado. Sem a entrada de IP, esse quinto
    // aparelho responderia 404 -- ele tem o proprio balde de identidade
    // intacto, e nada mais o barraria.
    // Divisao exata, e ela precisa continuar exata: o caso distribui as
    // invalidas em aparelhos INTEIROS, e um resto faria a ultima rodada parar
    // no meio -- o quinto aparelho chegaria com o balde de IP ainda com folga e
    // o 404 dele seria lido como "a entrada sumiu".
    assert.equal(
      TETO_DE_INVALIDAS_POR_IP % TETO_DE_INVALIDAS,
      0,
      'o teto por IP deixou de ser multiplo do teto por identidade. Este caso so mede o que ' +
        'diz medir enquanto a divisao for exata.',
    );
    const app = bancada();
    let semente = 0;
    const aparelho = (n: number): string => `${APARELHO_A} Build/${String(n)}`;

    const status: number[] = [];
    for (let i = 0; i < APARELHOS_ATE_O_TETO_DE_IP; i += 1) {
      for (let j = 0; j < TETO_DE_INVALIDAS; j += 1) {
        semente += 1;
        status.push((await tentar(app, aparelho(i), semente)).status);
      }
    }
    semente += 1;
    const aparelhoLimpo = await tentar(app, aparelho(99), semente);
    await app.close();

    assert.deepEqual(
      status,
      Array.from({ length: TETO_DE_INVALIDAS_POR_IP }, () => 404),
      `as ${String(TETO_DE_INVALIDAS_POR_IP)} invalidas distribuidas em ` +
        `${String(APARELHOS_ATE_O_TETO_DE_IP)} aparelhos deviam sair todas 404, e sairam ` +
        `${JSON.stringify(status)}. Cada aparelho tem o proprio balde de identidade e nenhum ` +
        'deles chega a gastar o seu; um 429 aqui significa que o teto por IP ficou mais ' +
        'apertado que os vinte do contrato.',
    );

    assert.equal(
      aparelhoLimpo.status,
      429,
      `a ${String(TETO_DE_INVALIDAS_POR_IP + 1)}a invalida do mesmo endereco respondeu ` +
        `${String(aparelhoLimpo.status)}, e ela veio de um aparelho que nunca tinha tentado ` +
        'nada. Esta e a UNICA posicao em que a entrada por IP e observavel: o balde de ' +
        'identidade dele esta limpo, entao 404 aqui quer dizer que a entrada sumiu ou deixou ' +
        'de recusar. E ela que impede a varredura de comprar baldes novos trocando o ' +
        '`User-Agent` a cada tentativa, que e a saida obvia para quem quer burlar a de ' +
        'identidade.',
    );
    assert.equal(
      aparelhoLimpo.tipo,
      'rate-limited',
      `a recusa saiu com \`type: ${String(aparelhoLimpo.tipo)}\`. Um 429 de outro \`type\` ` +
        'nao e este teto.',
    );
  });

  void it('a rota declara o teto que o contrato declara', () => {
    // O OUTRO LADO DA PINCA, independente do caso de posicao DE PROPOSITO.
    // Aquele prova que o mecanismo recusa onde deve; este prova que o numero nao
    // mudou. Se o esperado saisse da propria rota, trocar 5 por 50 passaria nos
    // dois, porque os dois teriam passado a cobrar 50.
    const declaradas: readonly RateLimitEntry[] = rotaDeResolucaoDaTag.rateLimit;
    const porIdentidade = declaradas.filter(
      (entrada) =>
        entrada.appliesTo === 'invalid_attempts' &&
        entrada.dimension.length === 1 &&
        entrada.dimension[0] === 'finder_identity',
    );
    assert.equal(
      porIdentidade.length,
      1,
      'GET /tags/{code} deixou de declarar exatamente uma entrada `invalid_attempts` por ' +
        '`finder_identity`. O contrato declara uma (`api/openapi.yaml`, `resolveTagCode`), e e ' +
        'ela que freia a varredura de codigos numa rota sem conta e sem token.',
    );
    const entrada = porIdentidade[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        appliesTo: entrada.appliesTo,
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      },
      {
        dimension: ['finder_identity'],
        appliesTo: 'invalid_attempts',
        limit: TETO_DE_INVALIDAS,
        window: '10m',
        onExceed: 'deny_429',
      },
      'o teto de invalidas por identidade de achador divergiu do contrato ' +
        '(`api/openapi.yaml`, `resolveTagCode`: dimension [finder_identity], applies_to ' +
        'invalid_attempts, limit 5, window 10m, on_exceed deny_429). `on_exceed` merece ' +
        'atencao especial: so `deny_429` recusa, e qualquer outra palavra do vocabulario ' +
        'deixa a rota declarando teto e servindo sem teto.',
    );

    const porIp = declaradas.filter(
      (outra) =>
        outra.appliesTo === 'invalid_attempts' &&
        outra.dimension.length === 1 &&
        outra.dimension[0] === 'ip',
    );
    assert.equal(
      porIp.length,
      1,
      'GET /tags/{code} deixou de declarar exatamente uma entrada `invalid_attempts` por ' +
        '`ip`. E ela que impede a varredura de comprar baldes de identidade novos trocando o ' +
        '`User-Agent`.',
    );
    const deIp = porIp[0];
    assert.ok(deIp !== undefined);
    assert.deepEqual(
      {
        dimension: [...deIp.dimension],
        appliesTo: deIp.appliesTo,
        limit: deIp.limit,
        window: deIp.window,
        onExceed: deIp.onExceed,
      },
      {
        dimension: ['ip'],
        appliesTo: 'invalid_attempts',
        limit: TETO_DE_INVALIDAS_POR_IP,
        window: '1h',
        onExceed: 'deny_429',
      },
      'o teto de invalidas por IP divergiu do contrato (`api/openapi.yaml`, `resolveTagCode`: ' +
        'dimension [ip], applies_to invalid_attempts, limit 20, window 1h, on_exceed deny_429).',
    );
  });
});

void it('ISCA: com o contador desligado a sexta tentativa passa, e o caso da posicao reprova', async () => {
  // A prova negativa, no formato que `registrar-rota.test.ts` estabeleceu.
  //
  // Sem ela, o caso da posicao poderia estar verde por qualquer coisa -- um 429
  // vindo de outro teto, ou a bancada nao chegando a resolver a plaquinha. Com
  // ela, o repositorio guarda o que aquele caso mede: desligar o contador, e SO
  // isso, muda a sexta resposta de 429 para 404. Foi exatamente assim que este
  // projeto passou semanas com `hit()` nunca chamado e a suite verde.
  const app = bancada(criarContadorDesligado());
  const status: number[] = [];
  for (let i = 0; i < TETO_DE_INVALIDAS + 1; i += 1) {
    status.push((await tentar(app, APARELHO_A, i + 1)).status);
  }
  await app.close();

  assert.deepEqual(
    status,
    Array.from({ length: TETO_DE_INVALIDAS + 1 }, () => 404),
    'com o contador desligado nada e recusado, e as seis saem 404. Se alguma saiu 429 aqui, ' +
      'o 429 do caso da posicao nao vem do teto que este arquivo diz vigiar.',
  );
});
