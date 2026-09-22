/**
 * Rotas de conta e sessão.
 *
 * Cada rota é declarada com `defineRoute`, e o `operationId` é o mesmo da
 * especificação — é a chave de rastreio entre os dois documentos. O `effects` e
 * o `rateLimit` **espelham** `api/openapi.yaml`; a política é de
 * `docs/04-seguranca.md` e não é redefinida aqui.
 *
 * Rota com efeito e sem teto **não compila** (`shared/http/route-definition.ts`).
 * Remover o `rateLimit` de qualquer bloco abaixo é erro de compilação, não
 * achado de revisão.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import {
  registrarRota,
  CABECALHO_DE_REAUTENTICACAO,
  type RegistradorDeRotas,
  type VerificadorDeReautenticacao,
} from '../../../../shared/http/registrar-rota.js';
import type { ReauthScope } from '../../../../shared/http/route-definition.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import {
  camposPendentesDoPerfil,
  podeAbrirCasoDePerdido,
} from '../../domain/completude-do-perfil.js';
import { normalizarEmail } from '../../domain/email.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type { Conta } from '../../ports/identity-repository.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import { corpoAusenteEhCorpoVazio } from '../../../../shared/http/corpo-opcional.js';
import type { AuthService, Autenticado } from '../../application/auth-service.js';
import type { ContextoDaRequisicao } from '../../application/dependencies.js';
import type { TokenSigner } from '../../ports/token-signer.js';

export const rotaDeCadastro = defineRoute({
  operationId: 'registerUser',
  method: 'post',
  path: '/auth/register',
  effects: ['notifies', 'verifies_secret'],
  rateLimit: [
    { dimension: ['ip'], limit: 5, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 30, window: '1h', onExceed: 'challenge' },
    {
      dimension: ['origin'],
      counts: 'distinct_emails',
      limit: 50,
      window: '24h',
      onExceed: 'log_and_alert',
    },
  ],
});

export const rotaDeLogin = defineRoute({
  operationId: 'login',
  method: 'post',
  path: '/auth/login',
  effects: ['verifies_secret'],
  rateLimit: [
    { dimension: ['email'], limit: 5, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip_24'], limit: 100, window: '1h', onExceed: 'log_and_alert' },
  ],
});

export const rotaDeRenovacao = defineRoute({
  operationId: 'refreshSession',
  method: 'post',
  path: '/auth/refresh',
  effects: ['verifies_secret'],
  // `challenge` não pode ser usado aqui: quem chama é o app em segundo plano, e
  // não há quem responda ao desafio. O efeito real não seria desafiar, seria a
  // sessão morrer em silêncio — e o usuário descobre no dia em que abre o app
  // com o pet sumido.
  noChallenge: true,
  rateLimit: [
    { dimension: ['token_family'], limit: 10, window: '1m', onExceed: 'deny_429' },
    {
      dimension: ['ip'],
      appliesTo: 'invalid_attempts',
      limit: 500,
      window: '1h',
      onExceed: 'log_and_alert',
    },
    { dimension: ['ip'], limit: 2000, window: '1h', onExceed: 'log_and_alert' },
  ],
});

export const rotaDeLogout = defineRoute({
  operationId: 'logout',
  method: 'post',
  path: '/auth/logout',
  // Revogar a própria sessão não alcança ninguém de fora do processo. O teto
  // existe assim mesmo, por decisão da política: a regra é piso, não teto.
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * O outro verbo. Ver a emenda 1 do ADR-0002: `logout` é este aparelho,
 * `logout-all` é a conta inteira.
 *
 * O teto é 10/h e não 60/h como o do logout comum. A diferença é o alcance: uma
 * chamada aqui derruba todos os aparelhos da pessoa, então um token de acesso
 * roubado, repetido em laço, manteria o titular fora da própria conta sem
 * precisar da senha dele.
 */
export const rotaDeLogoutTotal = defineRoute({
  operationId: 'logoutAllDevices',
  method: 'post',
  path: '/auth/logout-all',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
  // BICHUS-48. O escopo é próprio e não reaproveita nenhum dos outros: uma
  // janela aberta para excluir a conta não derruba as sessões, e vice-versa.
  // Declarar aqui é o que instala a conferência — ver `registrarRota`.
  reauthScope: 'session_revocation',
});

/**
 * A operação que abre a janela, e a única do sistema que confere a senha de
 * alguém já autenticado (critério 10 da BICHUS-48).
 *
 * **Os dois tetos são do contrato, e o segundo é o que importa.** 10 por hora
 * por conta limita o uso legítimo; 5 **inválidas** por hora por conta é a
 * defesa contra força bruta, e ela existe porque reautenticação é oráculo de
 * senha por construção: quem tomou a sessão pode testar senhas aqui sem
 * disparar nada do login, que se defende por e-mail e por IP e não por conta.
 *
 * `deny_429` e não `challenge`: não há quem responda a um desafio nesta rota, e
 * um desafio seria mais uma maneira de continuar tentando. Cinco erros fecham a
 * porta destrutiva por uma hora **sem derrubar a sessão normal** — a pessoa
 * continua usando o app, e só o ato destrutivo espera. E a recuperação de senha
 * continua aberta pelo seu próprio caminho (critério 9), porque o teto é desta
 * rota e não da conta.
 */
export const rotaDeReautenticacao = defineRoute({
  operationId: 'reauthenticate',
  method: 'post',
  path: '/auth/reauth',
  effects: ['verifies_secret'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      limit: 5,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDeTrocaDeSenha = defineRoute({
  operationId: 'changePassword',
  method: 'put',
  path: '/auth/password',
  effects: ['verifies_secret', 'notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      limit: 5,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDoMeuPerfil = defineRoute({
  operationId: 'getMe',
  method: 'get',
  path: '/me',
  effects: [],
});

export const rotaDeEdicaoDoPerfil = defineRoute({
  operationId: 'updateMe',
  method: 'patch',
  path: '/me',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * O teto é de CONTA, 5 por 24 horas, e espelha `api/openapi.yaml`.
 *
 * A dimensão é `account` e não `ip` porque esta rota exige sessão: sem conta
 * não há pedido, e um balde por IP puniria a rede do prédio pelo que uma
 * pessoa fez. Cinco por dia é folgado para quem errou uma letra e apertado
 * para quem quer usar a nossa saída de SMTP: cada pedido manda DUAS mensagens,
 * uma ao endereço novo e outra ao antigo, e o endereço novo é escolhido por
 * quem chama. Sem teto, uma sessão viraria um disparador de e-mail nosso
 * contra endereço alheio, e um caminho de enumeração pelo tempo de resposta.
 *
 * `reauthScope` É declarado aqui, e a condição que o adiava caiu nesta
 * integração. A autora escreveu que a ausência era deliberada porque «a
 * maquinaria de reautenticação não existe em `src/` ainda» e «o tipo
 * `ReauthScope` sequer carrega `'email_change'`»: as duas coisas passaram a
 * existir com a BICHUS-48, e o portão de `rotas-registradas-contra-o-contrato`
 * passou a cobrar contrato e código nos dois sentidos. Com a maquinaria na
 * árvore, é a AUSÊNCIA que vira a divergência — operação destrutiva que o
 * documento promete sob senha e o código serve sem ela.
 */
export const rotaDeTrocaDeEmail = defineRoute({
  operationId: 'requestEmailChange',
  method: 'post',
  path: '/me/email-change',
  effects: ['notifies'],
  reauthScope: 'email_change',
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDePedidoDeVerificacao = defineRoute({
  operationId: 'requestEmailVerification',
  method: 'post',
  path: '/auth/email-verification',
  effects: ['notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 3, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
  ],
});

/**
 * Confirmar o e-mail pelo token do link.
 *
 * **`appliesTo: 'invalid_attempts'` nao e detalhe de redacao: e o que decide
 * quem paga o teto.** Sem a qualificacao, a entrada vai por `hit()`
 * (`shared/http/aplicacao-de-teto.ts`) e conta TODA requisicao -- "20
 * tentativas invalidas por hora" vira "20 requisicoes por hora". E a dimensao
 * e `ip`: vinte e uma confirmacoes de boa-fe atras do mesmo endereco nao sao
 * um ataque, sao vinte e uma pessoas no CGNAT de uma operadora movel ou na
 * rede de um escritorio, e a vigesima primeira fica trancada para fora
 * exatamente da confirmacao que estava tentando concluir. O proprio
 * `aplicacao-de-teto.ts` ja escreve o argumento na justificativa de `ip_24`:
 * teto por IP puro e armadilha no Brasil.
 *
 * A qualificacao nao afrouxa nada. O balde e CONSULTADO na chegada (`peek`) e
 * so incrementado depois, em `onResponse`, quando a resposta foi recusa de
 * credencial (`registrar-rota.ts`, `TIPOS_DE_TENTATIVA_INVALIDA`): quem varre
 * token continua sendo recusado na 21a tentativa, e recusado ANTES de
 * qualquer consulta ao banco. O que muda e que a pessoa que acertou o link
 * deixa de gastar o teto de quem errou.
 *
 * O contrato sempre declarou `applies_to: invalid_attempts` aqui
 * (`api/openapi.yaml`, `confirmEmailVerification`); era o codigo que tinha
 * perdido a qualificacao. A prova do efeito, e nao da declaracao, esta em
 * `tests/integration/teto-das-confirmacoes-por-link.test.ts`.
 */
export const rotaDeConfirmacaoDeEmail = defineRoute({
  operationId: 'confirmEmailVerification',
  method: 'post',
  path: '/auth/email-verification/confirm',
  effects: ['verifies_secret'],
  rateLimit: [
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

export const rotaDePedidoDeRedefinicao = defineRoute({
  operationId: 'requestPasswordReset',
  method: 'post',
  path: '/auth/password-reset',
  effects: ['notifies'],
  rateLimit: [
    { dimension: ['email'], limit: 3, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 10, window: '1h', onExceed: 'challenge' },
  ],
});

/**
 * Definir a senha nova pelo token do link.
 *
 * Mesmo argumento de `rotaDeConfirmacaoDeEmail`, e aqui ele custa mais caro:
 * sem `appliesTo: 'invalid_attempts'` a entrada conta toda requisicao, e a
 * vigesima primeira pessoa que redefine a senha atras do mesmo IP recebe 429
 * no meio de uma recuperacao de acesso -- que e o momento em que ela ja nao
 * consegue entrar na conta e nao tem outro caminho. O teto vira o oposto do
 * remedio.
 *
 * Com a qualificacao, o balde conta so o que saiu como recusa de credencial:
 * varrer token de redefinicao continua parando na 21a tentativa, e quem abriu
 * o proprio link nao entra na conta.
 *
 * Contrato: `api/openapi.yaml`, `confirmPasswordReset` (dimension [ip], limit
 * 20, window 1h, on_exceed deny_429, applies_to invalid_attempts). Prova de
 * efeito em `tests/integration/teto-das-confirmacoes-por-link.test.ts`.
 */
export const rotaDeConfirmacaoDeRedefinicao = defineRoute({
  operationId: 'confirmPasswordReset',
  method: 'post',
  path: '/auth/password-reset/confirm',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  rateLimit: [
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

/**
 * Diz se o link de redefinição ainda vale.
 *
 * Só lê. É a página do time web perguntando "vale a pena mostrar o
 * formulário?" antes de a pessoa digitar uma senha para um link morto.
 *
 * ## O teto: `log_and_alert`, e não `deny_429`. O argumento, medido
 *
 * Até 22/09/2026 esta rota declarava `60/1h deny_429` no código contra
 * `30/1h log_and_alert` no contrato, e ninguém cruzava os dois. O código cedeu,
 * nos dois campos, e a razão não é "o contrato manda":
 *
 * **1. O token não é adivinhável, então o teto não é a defesa.** São 256 bits
 * de CSPRNG (`shared/id/uuidv7.ts`, `opaqueToken`), guardados só como SHA-256,
 * uso único consumido atomicamente, validade de 30 minutos. Mesmo com um
 * atacante de um milhão de endereços a 60 por hora cada, dentro da janela de
 * meia hora, a chance de acertar um token vivo fica na ordem de 10^-64. Entre
 * 30 e 60 não há diferença de segurança nenhuma contra enumeração.
 *
 * **2. Recusar aqui não fecha o oráculo, porque ele não é exclusivo desta
 * rota.** `POST /auth/password-reset/confirm` também responde 410 para token
 * que não vale, e já carrega `20/1h deny_429 applies_to invalid_attempts`.
 * Quem for recusado aqui troca de verbo. O `deny_429` desta rota encarecia o
 * caminho mais barato sem fechar caminho nenhum.
 *
 * **3. Recusar aqui quebra o remédio, e na hora pior.** A dimensão é `ip`, e o
 * CGNAT das operadoras brasileiras agrupa muita gente atrás de poucos
 * endereços — o argumento está escrito em `aplicacao-de-teto.ts` (justificativa
 * de `ip_24`) e duas vezes no ADR-0016. Esta rota é chamada ao ABRIR o link do
 * e-mail: recarregar a página, abrir no outro aparelho e o varredor de link do
 * cliente de e-mail somam chamadas que a pessoa não fez conscientemente. Um 429
 * aqui deixa a página sem mostrar o formulário, e a pessoa não entra na conta
 * (é por isso que ela está redefinindo a senha) nem tem outro caminho. A
 * operação existe para que ninguém chegue a um beco; recusar transforma a
 * própria operação no beco, mais cedo. E o dia em que muita gente redefine a
 * senha na mesma hora atrás do mesmo IP é o dia do incidente, que é exatamente
 * quando o remédio precisa funcionar.
 *
 * **4. `challenge` não é opção**, e a rota declara `x-no-challenge`: não há
 * ninguém para responder a um desafio numa chamada que a página faz ao carregar.
 *
 * **O que `log_and_alert` NÃO faz, dito por extenso:** ele não recusa. O balde
 * continua contando (`hit()`) e o estouro continua virando linha de log em
 * `aplicacao-de-teto.ts`, mas a requisição passa. A proteção volumétrica desta
 * rota é da borda (ADR-0016, item 4), e hoje a borda só limita tamanho de
 * corpo. Isso é lacuna conhecida e compartilhada com `jwks`,
 * `openidConfiguration`, `resolveTag` e o webhook de entrega, que escolheram
 * `log_and_alert` pelo mesmo motivo; não é lacuna criada aqui.
 *
 * **O número 30 é do contrato e está em aberto.** 30 por hora por IP, a 1–4
 * chamadas por redefinição legítima, alerta a partir de 8 pessoas por hora
 * atrás do mesmo endereço — pouco para um pool de CGNAT, e alerta que dispara
 * em tráfego normal é alerta que alguém silencia. A pergunta fechada está em
 * `.jarvis/PAUTA-DE-REFINAMENTO-22-09.md` ("O teto de `GET
 * /public/password-reset/{token}`: 30 por hora por IP, ou 60?"). Enquanto ela não for
 * respondida vale o contrato, que é a fonte declarada do número.
 *
 * A isca que impede este teto de ser "endurecido" de volta em silêncio está em
 * `tests/integration/teto-da-conferencia-do-link.test.ts`.
 */
export const rotaDeConferenciaDeRedefinicao = defineRoute({
  operationId: 'checkPasswordResetToken',
  method: 'get',
  path: '/public/password-reset/:token',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 30, window: '1h', onExceed: 'log_and_alert' }],
});

/**
 * A exclusão de conta. Teto de 3 por 24 h, que é o do contrato.
 *
 * `reauthScope` está declarado e a verificação **não** é desta branch: ela é a
 * BICHUS-48, ainda não mesclada. A linha existe aqui desde já porque o portão
 * que a BICHUS-48 traz cobra o contrato e o código nos DOIS sentidos —
 * operação com `x-reauth-scope` cuja rota não declare o mesmo valor reprova —
 * e uma rota nova que chegasse sem ela quebraria aquele portão no merge.
 */
export const rotaDeExclusaoDaConta = defineRoute({
  operationId: 'deleteMyAccount',
  method: 'delete',
  path: '/me',
  effects: ['irreversible_write', 'verifies_secret', 'notifies'],
  reauthScope: 'account_deletion',
  rateLimit: [{ dimension: ['account'], limit: 3, window: '24h', onExceed: 'deny_429' }],
});

/**
 * O "Não fui eu", e ele é a única rota de revogação sem conta do produto.
 *
 * Três coisas dela são decisão, e não configuração:
 *
 * - **teto por `ip`, e `log_and_alert` em vez de `deny_429`.** Recusar aqui
 *   trabalharia contra quem a rota protege: quem está com a conta tomada pode
 *   estar atrás do mesmo NAT de um laço automatizado. O que defende a rota é o
 *   token de 256 bits, não o contador; o contador existe para o laço aparecer;
 * - **`noChallenge`**, porque não há quem responda a um desafio: o clique vem
 *   de um cliente de e-mail, muitas vezes de um navegador sem sessão;
 * - **sem GET equivalente.** Cliente de e-mail e antivírus de borda
 *   pré-carregam link por GET. Uma revogação disparada por pré-carga derrubaria
 *   a sessão de quem nunca clicou, e o defeito seria indistinguível de um
 *   ataque.
 */
export const rotaDoNaoFuiEu = defineRoute({
  operationId: 'disavowSessionAlert',
  method: 'post',
  path: '/public/session-alerts/:alertToken/disavow',
  effects: ['verifies_secret', 'notifies', 'irreversible_write'],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 10, window: '1h', onExceed: 'log_and_alert' }],
});


export const rotaDoJwks = defineRoute({
  operationId: 'jwks',
  method: 'get',
  path: '/.well-known/jwks.json',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDeDescoberta = defineRoute({
  operationId: 'openidConfiguration',
  method: 'get',
  path: '/.well-known/openid-configuration',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'log_and_alert' }],
});

export interface DependenciasDasRotas {
  readonly auth: AuthService;
  readonly assinador: TokenSigner;
  readonly contrato: Contrato;
  readonly issuer: string;
  readonly apiBaseUrl: string;
}

/**
 * Higiene da rota que carrega token na URL.
 *
 * O token de redefinição viaja no caminho porque ele vem de um link de e-mail,
 * e isso é inevitável. O que dá para impedir é que ele seja indexado, que vaze
 * pelo cabeçalho `Referer` para todo terceiro que a página carregar, e que
 * fique guardado em cache intermediário (critério 11: o token não aparece em
 * registro nenhum).
 */
function aplicarHigieneDeTokenNaUrl(reply: FastifyReply): void {
  void reply.header('X-Robots-Tag', 'noindex, nofollow');
  void reply.header('Referrer-Policy', 'no-referrer');
  void reply.header('Cache-Control', 'no-store');
}

function contextoDe(request: FastifyRequest): ContextoDaRequisicao {
  return {
    correlationId: request.id,
    ip: request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  };
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  return token;
}

/**
 * Schema de corpo tirado da própria especificação. Uma fonte só: schemas de
 * OpenAPI 3.1 são JSON Schema, e o Fastify valida com JSON Schema. Validação
 * escrita à mão em paralelo à spec é a segunda definição que diverge.
 */
function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/**
 * `email` para o teto, **resumido**, nunca em claro.
 *
 * O balde vai para `rate_limit_counters.bucket_key`, no Postgres: lido por quem
 * opera o banco, exportado em despejo de diagnóstico e sobrevivente à exclusão
 * da conta. Um endereço em claro ali é o mesmo problema que o SEC-010 descreve
 * para o IP, num lugar onde ninguém vai procurá-lo — e aqui é pior, porque a
 * lista de endereços que TENTARAM entrar inclui gente que nunca teve conta.
 *
 * A normalização vem do domínio (`normalizarEmail`) e não é escrita aqui: se o
 * teto normalizasse diferente do login, `A@x.com` e `a@x.com` cairiam em baldes
 * distintos e o teto de 5 por hora viraria 10 para quem alternasse a caixa.
 */
const emailDoCorpo: ResolvedorDeDimensao = (request, sigilo) => {
  const corpo = (request.body ?? {}) as { email?: unknown };
  if (typeof corpo.email !== 'string' || corpo.email === '') return undefined;
  const normalizado = normalizarEmail(corpo.email);
  return normalizado === '' ? undefined : sigilo.hmac(`email:${normalizado}`);
};

/**
 * Autenticação MEMOIZADA por requisição.
 *
 * O teto por `account` roda antes do handler e precisa saber de quem é a
 * sessão; o handler precisa da mesma coisa. Sem a memória, toda rota
 * autenticada passaria a verificar RS256 e ler `users` duas vezes — dobrar a
 * carga do banco para aplicar um teto que existe para reduzir carga.
 */
function autenticado(request: FastifyRequest, deps: DependenciasDasRotas): Promise<Autenticado> {
  return memoDaRequisicao(request, 'identity:autenticado', () =>
    deps.auth.autenticar(tokenDoCabecalho(request)),
  );
}

/**
 * `account` para o teto: o id da conta, ou `undefined` para quem não apresentou
 * credencial válida.
 *
 * Engolir a falha aqui é correto e não é atalho: quem não tem sessão não tem
 * balde de conta, e a recusa dele é 401 do handler, não 429. O que sustenta o
 * caso de quem martela sem credencial são as entradas por `ip` da mesma rota.
 *
 * O valor vai em claro na chave do balde, e essa é a exceção declarada do
 * `Sigilo`: é UUID interno, `bucket_key` não sai em resposta nenhuma, e o
 * resumo tornaria impossível responder "qual conta bateu no teto".
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotas,
): Promise<string | undefined> {
  try {
    return (await autenticado(request, deps)).conta.id;
  } catch {
    return undefined;
  }
}

export function registrarRotasDeIdentidade(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotas,
): void {
  /**
   * O perfil como o contrato o declara, campo a campo.
   *
   * `pending_profile_fields` e `can_open_lost_case` são calculados na leitura, e
   * não guardados: são função do estado da conta. Uma coluna que os guardasse
   * seria uma segunda fonte, e ela envelheceria na primeira verificação de
   * e-mail que alguém esquecesse de propagar.
   *
   * `reference_area` sai **nula inteira** quando nenhum dos campos existe, em
   * vez de um objeto com quatro nulos: a tela distingue "não informou" de
   * "informou parcialmente", e quatro nulos dentro de um objeto parecem a
   * segunda coisa.
   */
  const comoRespostaDoPerfil = (conta: Conta): Record<string, unknown> => {
    const temArea =
      conta.referencePostalCode !== null ||
      conta.referenceNeighborhood !== null ||
      conta.referenceCity !== null ||
      conta.referenceState !== null;

    return {
      id: conta.id,
      email: conta.email,
      email_verified: conta.emailVerifiedAt !== null,
      pending_email: conta.pendingEmail,
      email_deliverable: conta.emailDeliverable,
      display_name: conta.displayName,
      phone_e164: conta.phoneE164,
      phone_verified: conta.phoneVerifiedAt !== null,
      reference_area: temArea
        ? {
            postal_code: conta.referencePostalCode,
            neighborhood: conta.referenceNeighborhood,
            city: conta.referenceCity,
            state: conta.referenceState,
          }
        : null,
      pending_profile_fields: camposPendentesDoPerfil(conta),
      can_open_lost_case: podeAbrirCasoDePerdido(conta),
      created_at: conta.createdAt.toISOString(),
    };
  };

  registrarRota(
    app,
    rotaDePedidoDeVerificacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDeVerificacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // Esta é a outra operação do contrato com `requestBody: required: false`,
      // e o manipulador abaixo diz isso ao ler `request.body ?? {}`: com token
      // no cabeçalho, o e-mail vem da sessão e não há corpo a enviar. Sem este
      // gancho, o schema acima sozinho recusava a chamada sem corpo com 400
      // `body must be object`, porque o Fastify valida `request.body` mesmo
      // quando ele é `undefined` — a rota prometia 202 "exista ou não a conta"
      // e respondia 400 para quem não mandasse campo nenhum.
      preValidation: [
        corpoAusenteEhCorpoVazio(deps.contrato, rotaDePedidoDeVerificacao.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = (request.body ?? {}) as { email?: string };
      const cabecalho = request.headers.authorization;

      // A operação aceita conta OU e-mail no corpo. Com conta, o endereço vem
      // da sessão e o do corpo é ignorado: aceitar o do corpo deixaria alguém
      // logado disparar e-mail nosso para um endereço qualquer.
      let email = corpo.email;
      if (typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')) {
        const { conta } = await deps.auth.autenticar(tokenDoCabecalho(request));
        email = conta.email;
      }

      // 202 mesmo sem e-mail nenhum: a resposta não varia com a entrada.
      if (email !== undefined && email !== '') {
        await deps.auth.solicitarVerificacaoDeEmail(email, contextoDe(request));
      }
      return reply.status(202).send();
    },
  );

  registrarRota(
    app,
    rotaDeConfirmacaoDeEmail,
    { schema: { body: corpoDe(deps.contrato, rotaDeConfirmacaoDeEmail.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.body as { token: string };
      const userId = await deps.auth.confirmarVerificacaoDeEmail(token, contextoDe(request));
      const conta = await deps.auth.meuPerfil(userId);
      return reply.status(200).send(comoRespostaDoPerfil(conta));
    },
  );

  registrarRota(
    app,
    rotaDePedidoDeRedefinicao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePedidoDeRedefinicao.operationId) },
      resolvedores: { email: emailDoCorpo },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = request.body as { email: string };
      await deps.auth.solicitarRedefinicaoDeSenha(email, contextoDe(request));
      // SEMPRE 202, exista a conta ou não (critério 2). Qualquer diferença aqui
      // é um oráculo de existência de e-mail, consultável sem conta nenhuma.
      return reply.status(202).send();
    },
  );

  registrarRota(app, rotaDeConferenciaDeRedefinicao, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    aplicarHigieneDeTokenNaUrl(reply);
    const { token } = request.params as { token: string };
    await deps.auth.conferirTokenDeRedefinicao(token);
    // Corpo vazio de propósito: a página só precisa saber se vale mostrar o
    // formulário. Devolver o e-mail aqui entregaria o endereço a quem tivesse o
    // link — que é exatamente quem pode não ser o titular.
    return reply.status(200).send({ valid: true });
  });

  registrarRota(
    app,
    rotaDeConfirmacaoDeRedefinicao,
    { schema: { body: corpoDe(deps.contrato, rotaDeConfirmacaoDeRedefinicao.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { token: string; new_password: string };
      await deps.auth.confirmarRedefinicaoDeSenha(corpo.token, corpo.new_password, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(app, rotaDoMeuPerfil, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { conta } = await autenticado(request, deps);
    return reply.status(200).send(comoRespostaDoPerfil(await deps.auth.meuPerfil(conta.id)));
  });

  registrarRota(
    app,
    rotaDeEdicaoDoPerfil,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEdicaoDoPerfil.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const corpo = request.body as {
        display_name?: string;
        phone_e164?: string;
        reference_area?: {
          postal_code?: string;
          neighborhood?: string;
          city?: string;
          state?: string;
        };
      };

      // `undefined` é "não mexer". A área vem aninhada no contrato e achatada no
      // banco, e é aqui que a tradução acontece — o repositório não conhece a
      // forma do JSON e o contrato não conhece a forma da tabela.
      const area = corpo.reference_area;
      const atualizada = await deps.auth.atualizarMeuPerfil(
        conta.id,
        {
          ...(corpo.display_name === undefined ? {} : { displayName: corpo.display_name }),
          ...(corpo.phone_e164 === undefined ? {} : { phoneE164: corpo.phone_e164 }),
          ...(area?.postal_code === undefined ? {} : { referencePostalCode: area.postal_code }),
          ...(area?.neighborhood === undefined ? {} : { referenceNeighborhood: area.neighborhood }),
          ...(area?.city === undefined ? {} : { referenceCity: area.city }),
          ...(area?.state === undefined ? {} : { referenceState: area.state }),
        },
        contextoDe(request),
      );

      return reply.status(200).send(comoRespostaDoPerfil(atualizada));
    },
  );

  registrarRota(
    app,
    rotaDeTrocaDeEmail,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeTrocaDeEmail.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const { new_email } = request.body as { new_email: string };

      await deps.auth.solicitarTrocaDeEmail(conta.id, new_email, contextoDe(request));

      // 202 SEMPRE, e o corpo é vazio nos dois ramos. Endereço livre, endereço
      // que já tem dono e endereço igual ao atual produzem a mesma resposta: é
      // o que impede esta rota de virar oráculo de existência de e-mail para
      // qualquer pessoa com uma sessão.
      return reply.status(202).send();
    },
  );

  registrarRota(
    app,
    rotaDeCadastro,
    { schema: { body: corpoDe(deps.contrato, rotaDeCadastro.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as {
        email: string;
        password: string;
        display_name?: string;
        accepted_terms_version?: string;
      };
      const sessao = await deps.auth.cadastrar(
        {
          email: corpo.email,
          password: corpo.password,
          displayName: corpo.display_name,
          acceptedTermsVersion: corpo.accepted_terms_version,
        },
        contextoDe(request),
      );
      return reply.status(201).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDeLogin,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeLogin.operationId) },
      resolvedores: { email: emailDoCorpo },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { email: string; password: string; stay_signed_in?: boolean };
      const sessao = await deps.auth.entrar(
        {
          email: corpo.email,
          password: corpo.password,
          // A escolha nasce desmarcada. Ausente é falso, nunca verdadeiro.
          staySignedIn: corpo.stay_signed_in === true,
        },
        contextoDe(request),
      );
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDeRenovacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeRenovacao.operationId) },
      resolvedores: {
        token_family: async (request) => {
          const corpo = (request.body ?? {}) as { refresh_token?: string };
          if (typeof corpo.refresh_token !== 'string' || corpo.refresh_token === '') {
            return undefined;
          }
          return deps.auth.familiaDoRefresh(corpo.refresh_token);
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { refresh_token: string };
      const sessao = await deps.auth.renovar(corpo.refresh_token, contextoDe(request));
      return reply.status(200).send(sessao);
    },
  );

  /**
   * Sair **deste** aparelho (ADR-0002, emenda 1).
   *
   * O `schema` não é enfeite. Enquanto ele não estava aqui, o contrato declarava
   * a operação sem corpo e este manipulador lia `corpo.refresh_token` assim
   * mesmo: quem seguisse o contrato não mandava campo nenhum, nada era revogado,
   * e a resposta era 204 — sucesso indistinguível do nada. Com `corpoDe`, o
   * corpo vem da própria especificação, e o dia em que alguém apagar o
   * `requestBody` de lá esta rota deixa de subir, com o motivo escrito, em vez
   * de voltar a mentir em silêncio.
   *
   * O corpo é lido como `{ refresh_token: string }`, sem `??`, porque o schema
   * acima já recusou a chamada sem ele com 400 — e porque `auth.sair` exige a
   * cadeia: sem ela não há família a revogar.
   */
  registrarRota(
    app,
    rotaDeLogout,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeLogout.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { refresh_token: string };
      await deps.auth.sair(sessao, corpo.refresh_token, contextoDe(request));
      return reply.status(204).send();
    },
  );

  /**
   * Sem corpo, e é a decisão. A conta que cai é a do token — pedir um
   * identificador no corpo criaria um campo que alguém um dia confiaria, e
   * derrubar a sessão de outra pessoa passaria a depender de uma conferência
   * que pode ser esquecida (ADR-0021).
   */
  registrarRota(
    app,
    rotaDeLogoutTotal,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      await deps.auth.sairDeTodosOsAparelhos(sessao, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeReautenticacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeReautenticacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { password: string; scope: ReauthScope };
      const janela = await deps.auth.reautenticar(
        sessao,
        corpo.password,
        corpo.scope,
        contextoDe(request),
      );
      // A janela em claro sai daqui e de lugar nenhum mais: `server.ts` já
      // esconde `x-reauth-token` do log, e ela não vai para a trilha.
      return reply.status(200).send({
        reauth_token: janela.reauthToken,
        expires_in: janela.expiresIn,
        scope: janela.scope,
      });
    },
  );

  registrarRota(
    app,
    rotaDeExclusaoDaConta,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      await deps.auth.excluirMinhaConta(sessao, contextoDe(request));
      // 202, e não 204: o contrato promete exclusão lógica imediata e expurgo
      // definitivo em 30 dias. Responder 204 prometeria um efeito que só
      // termina daqui a um mês.
      return reply.status(202).send();
    },
  );

  /**
   * O token viaja no caminho porque vem de um link de e-mail, e isso é
   * inevitável. O que dá para impedir é que ele seja indexado, que vaze pelo
   * `Referer` e que fique em cache intermediário — mesma higiene da rota de
   * conferência de redefinição.
   */
  registrarRota(
    app,
    rotaDoNaoFuiEu,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      aplicarHigieneDeTokenNaUrl(reply);
      const { alertToken } = request.params as { alertToken: string };
      await deps.auth.recusarSessaoAvisada(alertToken, contextoDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeTrocaDeSenha,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeTrocaDeSenha.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessao: Autenticado = await autenticado(request, deps);
      const corpo = request.body as { current_password: string; new_password: string };
      await deps.auth.trocarSenha(
        sessao,
        corpo.current_password,
        corpo.new_password,
        contextoDe(request),
      );
      return reply.status(204).send();
    },
  );
}

/**
 * O verificador que `criarServidor` instala, e que `registrarRota` chama em toda
 * rota que declara `reauthScope`.
 *
 * Ele mora aqui, e não em `shared/http`, porque conferir a janela exige o
 * serviço de identidade. O que `shared/http` conhece é a **assinatura**, e é
 * assim que a dependência anda na direção certa.
 *
 * `autenticado` é o memo por requisição: a conferência da janela precisa da
 * conta e do `jti`, e o manipulador da rota vai precisar dos mesmos. Sem o
 * memo, toda operação destrutiva verificaria RS256 e leria `users` duas vezes.
 */
export function criarVerificadorDeReautenticacao(
  deps: DependenciasDasRotas,
): VerificadorDeReautenticacao {
  return async (request: FastifyRequest, escopo: ReauthScope): Promise<void> => {
    const sessao: Autenticado = await autenticado(request, deps);
    const cabecalho = request.headers[CABECALHO_DE_REAUTENTICACAO];
    // Cabeçalho repetido chega como lista. Concatenar o que o cliente mandou
    // duas vezes produziria um valor que não é nenhum dos dois; a primeira
    // ocorrência é o que o resto da pilha também leria.
    const apresentado = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
    await deps.auth.consumirReautenticacao(sessao, apresentado, escopo, contextoDe(request));
  };
}

/**
 * Rotas de descoberta, fora do prefixo `/v1`: quem as consulta não é o nosso
 * app, e sim o sistema operacional ou uma biblioteca, que espera encontrá-las na
 * raiz do host da API.
 */
export function registrarRotasDeDescoberta(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotas,
): void {
  registrarRota(app, rotaDoJwks, {}, async (_request: FastifyRequest, reply: FastifyReply) => {
    // Cacheável por 1 hora, e quem consome deve rebuscar quando encontrar um
    // `kid` desconhecido, em vez de recusar.
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .send({ keys: deps.assinador.jwks() });
  });

  registrarRota(app, rotaDeDescoberta, {}, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.header('Cache-Control', 'public, max-age=3600').send({
      issuer: deps.issuer,
      jwks_uri: `${deps.apiBaseUrl}${rotaDoJwks.path}`,
      token_endpoint: `${deps.apiBaseUrl}/v1${rotaDeLogin.path}`,
      id_token_signing_alg_values_supported: ['RS256'],
      grant_types_supported: ['password', 'refresh_token'],
      response_types_supported: ['token'],
    });
  });
}
