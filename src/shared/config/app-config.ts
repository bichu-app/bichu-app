/**
 * Configuração da aplicação, lida uma vez na subida.
 *
 * Tudo aqui vem de ambiente (§11.2). Nenhum valor padrão aponta para provedor,
 * para hostname ou para segredo: a ausência derruba a aplicação com o nome da
 * variável, que é melhor do que um padrão que funciona só na máquina de quem
 * escreveu.
 *
 * As chaves de assinatura são **duas desde o início** (ADR-0002): a ativa
 * assina, e a de rotação já é publicada no JWKS. Publicar só a ativa impede
 * rotacionar sem derrubar sessão, porque quem valida precisa conhecer a próxima
 * antes de ela começar a assinar.
 */
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { boolEnv, optionalEnv, requireEnv } from './env.js';
import { ehAmbienteHospedado } from './ambiente-hospedado.js';
import type { AbsoluteUrl } from '../types/brands.js';
import type { RateLimitDriver } from '../ports/rate-limit-store.js';

export interface SigningKey {
  readonly kid: string;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

export interface TokenConfig {
  readonly issuer: string;
  readonly audience: string;
  /**
   * Lista de emissores aceitos, e não um emissor fixo (ADR-0002). Uma lista com
   * um item hoje é uma linha de configuração amanhã, e é o que permite dois
   * emissores coexistirem durante a virada para o Keycloak.
   */
  readonly trustedIssuers: readonly string[];
  readonly activeKey: SigningKey;
  /** Ativa mais a de rotação, nesta ordem. É o que o JWKS publica. */
  readonly allKeys: readonly SigningKey[];
  readonly accessTokenTtlSeconds: number;
  readonly clockToleranceSeconds: number;
}

export interface SessionConfig {
  /** Janela de inatividade padrão (docs/04-seguranca.md 7.5). */
  readonly idleTtlSeconds: number;
  /** Janela de inatividade com "continuar conectado", que nasce desmarcado. */
  readonly staySignedInIdleTtlSeconds: number;
  /**
   * Teto absoluto desde a autenticação com senha. Sem ele a rotação transforma
   * roubo de refresh em acesso permanente: cada uso empurra a inatividade.
   */
  readonly absoluteTtlSeconds: number;
}

export interface AppConfig {
  readonly environment: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly bindHost: string;
  readonly databaseUrl: string;
  /**
   * Endereço público DESTE serviço, e nada mais desde 19/09.
   *
   * Ele carregava cinco coisas (ADR-0017 item 2): o que o QR codifica, o
   * cartaz, o link do caso, os links dos e-mails e o destino do deep link.
   * Duas delas saíram para `tagBaseUrl` e `webBaseUrl`, porque uma dessas
   * cinco **não é reversível** e a variável única apagava justamente essa
   * informação. O que sobrou aqui é o endereço que a borda atende e do qual
   * sai o `type` do `application/problem+json` — quer dizer, a identidade
   * deste processo, não a das páginas.
   */
  readonly publicBaseUrl: AbsoluteUrl;
  /**
   * O que o QR da plaquinha codifica: `{TAG_BASE_URL}/t/{código}`.
   *
   * **É o único valor da configuração que vira plástico.** Depois de prensada,
   * a plaquinha não se corrige (ADR-0004): trocar este valor não conserta tag
   * nenhuma que já saiu, só muda as próximas. Toda guarda em volta dele existe
   * por isso.
   */
  readonly tagBaseUrl: AbsoluteUrl;
  /**
   * Onde vivem as páginas públicas do time web (ADR-0017): cartaz, caso,
   * perfil, conversa do achador, verificação de e-mail, redefinição de senha e
   * cancelamento de transferência. É a base dos links dos e-mails.
   *
   * Reversível: trocar o valor troca o link do próximo e-mail enviado, e
   * nenhum link já entregue deixa de ser um link que alguém tem.
   */
  readonly webBaseUrl: AbsoluteUrl;
  readonly apiBaseUrl: AbsoluteUrl;
  readonly mediaPublicBaseUrl: AbsoluteUrl;
  readonly problemBaseUrl: AbsoluteUrl;
  readonly token: TokenConfig;
  readonly session: SessionConfig;
  /** Chave do HMAC de endereço IP (SEC-010). Nunca hash sem chave. */
  readonly ipHmacKey: Buffer;
  /**
   * Chave da cifra do código da tag, 32 bytes em hexadecimal (`TAG_CODE_KEY`).
   *
   * Ela abre o `code_ciphertext`, que existe para **reimprimir o QR** e nada
   * mais: a resolução pública busca por `code_hash` e nunca decifra. A validação
   * do tamanho está no adaptador, junto do algoritmo que a exige.
   */
  readonly tagCodeKey: Buffer;
  /**
   * Chave do índice cego do código da tag, 32 bytes em hexadecimal
   * (`TAG_CODE_INDEX_KEY`). É ela que entra no HMAC-SHA-256 que produz
   * `code_hash` (ADR-0004, Emenda 1, §3.1).
   *
   * **Não é a mesma de `tagCodeKey`, e a subida recusa se for.** Quem vaza uma
   * vazaria a outra, e o índice cego deixaria de ser cego para quem já tivesse
   * a chave do `code_ciphertext`.
   *
   * **Não é rotacionável sozinha:** o valor buscado depende dela, então trocá-la
   * exige recalcular `code_hash` da base inteira a partir de `code_ciphertext`.
   * O procedimento está em `infra/roteiro-provisionamento.md`, passo 4.1.
   */
  readonly tagCodeIndexKey: Buffer;
  readonly openapiSpecPath: string;
  readonly version: string;
  readonly objectStorage: ObjectStorageConfig;
  readonly mail: MailConfig;
  readonly push: PushConfig;
}

/**
 * Push (ADR-0008).
 *
 * Mesma convenção de `MailConfig`: o comportamento é escolhido por ambiente e
 * não por `if (isProduction)` espalhado pelo código. `log` existe para o
 * desenvolvimento e para a esteira — ele **prova o disparo**, e o ADR-0008 é
 * explícito sobre o que ele não prova: que o telefone vibra.
 *
 * Quem lê isto para escolher o adaptador é `criarPushSender`, em
 * `modules/notifications/adapters/external/`. A escolha mora lá pelo mesmo
 * motivo de `criarSecretProvider`: o `import` do arquivo do FCM carrega o nome
 * do provedor no caminho, e nome de provedor não entra em `config/`.
 */
export interface PushConfig {
  readonly transport: 'fcm' | 'log';
  /**
   * O projeto para onde o envio vai: o endereço do HTTP v1 é
   * `/v1/projects/{projeto}/messages:send`.
   *
   * `undefined` com `log`, e é assim que se lê, do próprio tipo, que **ninguém
   * envia nada** — e não um projeto vazio que viraria um endereço de envio sem
   * projeto no meio. Com `fcm` ele é obrigatório; ver `exigeProjetoDoFcm`.
   */
  readonly projeto: string | undefined;
}

/**
 * E-mail transacional.
 *
 * `transport` segue a convenção de `PUSH_TRANSPORT` e `KMS_TRANSPORT`: o
 * comportamento é escolhido por ambiente, não por `if (isProduction)` espalhado
 * no código. `log` existe para teste e para a esteira — ele **prova o disparo**
 * sem provar a entrega, e a diferença entre as duas coisas precisa ficar
 * visível no nome.
 */
export interface MailConfig {
  readonly transport: 'smtp' | 'log';
  readonly host: string;
  readonly port: number;
  /**
   * Precisa ser em `@mail.<domínio>`, não no apex. O DMARC do apex está em
   * `p=reject` com `adkim=s`: um remetente no apex quebra o alinhamento estrito
   * e o e-mail é **descartado em silêncio** — sem devolução, sem erro, sem nada.
   */
  readonly from: string;
  readonly fromName: string;
  readonly replyTo: string;
  /**
   * Segredo do webhook de entrega (`MAIL_WEBHOOK_SECRET`), o que `api/openapi.yaml`
   * declara no esquema `webhookSignature`.
   *
   * **`Buffer` e não `string`, e isso não é estilo.** A comparação precisa ser
   * em tempo constante (`iguaisEmTempoConstante`), que só opera sobre bytes.
   * Deixar `string` aqui convidaria o `===` de volta na rota — e `===` sobre
   * segredo vaza o tamanho do prefixo comum pelo tempo de resposta, que é
   * medível de fora e transforma "adivinhar 32 bytes" em "adivinhar 32 vezes um
   * byte".
   */
  readonly webhookSecret: Buffer;
}

/**
 * Armazenamento de objeto compatível com S3 (ADR-0007).
 *
 * **Nenhum valor aqui tem padrão que aponte para provedor**, e nenhum nome
 * carrega marca: o ADR trata o armazenamento como interface, não como produto.
 * Trocar MinIO por S3, GCS, R2 ou Spaces é mexer nestas variáveis e no DNS de
 * mídia — nenhuma linha de código.
 */
export interface ObjectStorageConfig {
  /** Vazio significa o endpoint padrão do provedor, e é um valor legítimo. */
  readonly endpoint: string | undefined;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `true` no MinIO, `false` na maioria dos gerenciados. */
  readonly forcePathStyle: boolean;
  /** Originais e derivadas privadas. Nasce sem leitura anônima. */
  readonly bucketPrivate: string;
  /** SÓ as derivadas que a rota pública mostra, servidas pelo domínio de mídia. */
  readonly bucketPublic: string;
}

const SEGUNDO = 1;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const TTL_TOKEN_DE_ACESSO = 15 * MINUTO;
const TTL_INATIVIDADE_PADRAO = 30 * DIA;
const TTL_INATIVIDADE_CONTINUAR_CONECTADO = 180 * DIA;
const TTL_ABSOLUTO = 180 * DIA;
const TOLERANCIA_DE_RELOGIO = 60 * SEGUNDO;

/**
 * Aceita PEM cru ou PEM em base64. As duas formas existem porque quebra de
 * linha dentro de um arquivo `.env` é a origem mais comum de chave que "sumiu"
 * na subida, e o operador não deveria precisar saber disso.
 */
function lerPem(bruto: string, nomeDaVariavel: string): string {
  const texto = bruto.includes('-----BEGIN')
    ? bruto
    : Buffer.from(bruto, 'base64').toString('utf8');
  if (!texto.includes('-----BEGIN')) {
    throw new Error(
      `${nomeDaVariavel} não é uma chave PEM nem um PEM em base64. ` +
        `Gere com: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`,
    );
  }
  return texto;
}

/**
 * Recebe o `kid` e o PEM ja lidos, e nao o sufixo para monta-los.
 *
 * O arranjo anterior montava os nomes com template literal
 * (`JWT_${sufixo}_KID`), e isso tinha um custo que so apareceu em 18/09: a
 * guarda da esteira le `requireEnv('NOME')` por TEXTO, entao ela nunca viu
 * `JWT_ACTIVE_KID` -- uma variavel sem a qual a API nao sobe -- e mesmo assim
 * imprimia "todas preenchidas". Guarda com ponto cego e pior que guarda
 * nenhuma, porque a nenhuma ninguem confia.
 *
 * `nomeDoPem` continua entrando porque as mensagens de erro citam a variavel
 * pelo nome, e erro de subida que nao diz QUAL variavel esta errada e o defeito
 * que esta guarda inteira existe para evitar.
 */
function carregarChave(
  kid: string | undefined,
  pem: string | undefined,
  nomeDoPem: string,
): SigningKey | undefined {
  if (kid === undefined || pem === undefined) return undefined;

  const privateKey = createPrivateKey(lerPem(pem, nomeDoPem));
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new Error(
      `${nomeDoPem} não é RSA. O contrato fixa RS256, e HS256 ` +
        `fecharia a porta do Keycloak (ADR-0002).`,
    );
  }
  return { kid, privateKey, publicKey: createPublicKey(privateKey) };
}

/**
 * Onde a chave de rotação deixa de ser conveniência e passa a ser obrigação.
 *
 * O critério é **o mesmo que `src/bin/seed.ts` já usa** para recusar semear:
 * `NODE_ENV=production` (o que os estágios de produção do `Dockerfile` definem)
 * ou `ENVIRONMENT` em `prod`/`preprod`. Reusar a definição que já existe é de
 * propósito — duas respostas diferentes para "estou num ambiente de gente de
 * verdade?" viram duas verdades, e a que fica para trás é sempre a que protege.
 *
 * `preprod` entra junto com `prod` porque quem consome o JWKS **não é este
 * serviço**: é terceiro, que cacheia. Homologação é o ambiente que o time web
 * consome (`infra/verificacao/docs-fechada.yml`) e é onde a rotação vai ser
 * exercitada pela primeira vez (dívida 9.10). Descobrir lá que a segunda chave
 * nunca esteve publicada é descobrir no dia da rotação, que é tarde.
 *
 * `dev` e teste ficam de fora de propósito: ninguém cacheia o JWKS de
 * `localhost`, e exigir a segunda chave para rodar `npm test` ou subir o compose
 * seria atrito novo sem risco atrás dele.
 */
function exigeChaveDeRotacao(environment: string): boolean {
  // O predicado saiu daqui para `ambiente-hospedado.ts` quando o ADR-0022
  // precisou da MESMA pergunta para decidir de onde vêm os segredos. Delegar,
  // e não copiar, é o que o parágrafo acima exige: duas respostas viram duas
  // verdades, e a que fica para trás é sempre a que protege.
  return ehAmbienteHospedado(environment);
}

function carregarToken(environment: string): TokenConfig {
  const issuer = requireEnv('TOKEN_ISSUER');
  const activeKey = carregarChave(
    requireEnv('JWT_ACTIVE_KID'),
    requireEnv('JWT_ACTIVE_PRIVATE_KEY'),
    'JWT_ACTIVE_PRIVATE_KEY',
  );
  // `activeKey` nao pode ser `undefined` aqui: os dois `requireEnv` acima ja
  // morreram citando a variavel exata, que e uma mensagem melhor do que esta
  // linha daria. A checagem fica mesmo assim, e nao e redundancia inutil --
  // `carregarChave` devolve `undefined` por contrato de tipo, e tirar isto
  // trocaria a falha ruidosa por um `SigningKey | undefined` vazando para o
  // resto da configuracao no dia em que alguem afrouxar o carregamento.
  if (activeKey === undefined) throw new Error('JWT_ACTIVE_KID e JWT_ACTIVE_PRIVATE_KEY são obrigatórias.');

  // O contrato promete **"Sempre duas chaves"** em `GET /.well-known/jwks.json`
  // (api/openapi.yaml), e até aqui isso era comentário no `.env.example` — não
  // guarda. A aplicação subia com uma chave só e o JWKS respondia 200 com um
  // `kid` sozinho: falha silenciosa onde a regra do projeto é falha ruidosa.
  // O estrago não aparece na subida, e sim no dia da rotação, quando rotacionar
  // sem a próxima chave já publicada derruba toda sessão de quem cacheou o
  // arquivo antigo.
  //
  // As duas chamadas são `requireEnv` com o nome LITERAL, e não um `if` sobre
  // `nextKey`, por dois motivos: a mensagem morre citando a variável exata que
  // falta, e o passo "nenhuma variavel exigida ficou vazia" da esteira
  // (.github/workflows/ci.yml) lê os `requireEnv('X')` de `src/` e `bin/` por
  // texto — escrito assim, variável esquecida no workflow reprova em segundos
  // com o nome dela, em vez de matar a subida de um ambiente hospedado. O valor
  // devolvido é descartado porque quem o lê é o `carregarChave` logo abaixo; o
  // que interessa aqui é a recusa.
  if (exigeChaveDeRotacao(environment)) {
    requireEnv('JWT_NEXT_KID');
    requireEnv('JWT_NEXT_PRIVATE_KEY');
  }

  const nextKey = carregarChave(
    optionalEnv('JWT_NEXT_KID'),
    optionalEnv('JWT_NEXT_PRIVATE_KEY'),
    'JWT_NEXT_PRIVATE_KEY',
  );

  if (nextKey !== undefined && nextKey.kid === activeKey.kid) {
    throw new Error(
      'JWT_NEXT_KID é igual a JWT_ACTIVE_KID. Duas chaves com o mesmo `kid` ' +
        'no JWKS fazem o consumidor escolher a errada e a assinatura falhar.',
    );
  }

  const declarados = optionalEnv('TOKEN_TRUSTED_ISSUERS');
  const trustedIssuers = declarados === undefined
    ? [issuer]
    : declarados.split(',').map((item) => item.trim()).filter((item) => item !== '');
  if (!trustedIssuers.includes(issuer)) trustedIssuers.push(issuer);

  return {
    issuer,
    audience: optionalEnv('TOKEN_AUDIENCE') ?? issuer,
    trustedIssuers,
    activeKey,
    allKeys: nextKey === undefined ? [activeKey] : [activeKey, nextKey],
    accessTokenTtlSeconds: TTL_TOKEN_DE_ACESSO,
    clockToleranceSeconds: TOLERANCIA_DE_RELOGIO,
  };
}

/**
 * Recebe o VALOR ja exigido, e nao o nome da variavel.
 *
 * A diferenca nao e estilo: a guarda da esteira le `requireEnv('NOME')` por
 * texto, e `requireEnv(nome)` escondia o nome atras de um parametro. Variavel
 * que a guarda nao enxerga e variavel que ela jura estar conferindo e nao
 * confere -- foi assim que `JWT_ACTIVE_KID` passou despercebida.
 */
function urlAbsoluta(valor: string): AbsoluteUrl {
  return valor.replace(/\/+$/, '') as AbsoluteUrl;
}

/**
 * Base pública de página, conferida na FORMA e não só aparada.
 *
 * `urlAbsoluta` acima corta a barra final e acredita no resto, e isso bastava
 * enquanto errar a base dava página errada — coisa que se conserta com um
 * `docker compose up`. `TAG_BASE_URL` é de outra natureza: o valor é
 * concatenado em `{base}/t/{código}` e o resultado sai **prensado no plástico**
 * (ADR-0004). `bichu.app` sem esquema vira `bichu.app/t/ABC`, que leitor de QR
 * nenhum abre como endereço; um `?` ou um `#` no fim viram um link que leva a
 * lugar nenhum. A hora de descobrir isso é a subida, com o nome da variável na
 * mensagem, e não a primeira leva impressa.
 *
 * Recebe o nome como SEGUNDO parâmetro, já literal na chamada: quem chama
 * escreve `requireEnv('TAG_BASE_URL')` por extenso, que é o que a guarda da
 * esteira lê por texto.
 */
function baseDePaginaPublica(valor: string, nome: string): AbsoluteUrl {
  const aparada = valor.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(aparada);
  } catch {
    throw new Error(
      `${nome}="${valor}" não é uma URL absoluta. Escreva esquema e host, ` +
        'sem barra no fim — o valor é concatenado com `/t/{código}` e com ' +
        '`/cartaz/{token}`, e o que sai daí é lido por gente e por leitor de QR.',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `${nome}="${valor}" tem esquema \`${url.protocol}\`. Só http e https: ` +
        'o que está aqui vira endereço que um estranho abre no telefone dele.',
    );
  }
  if (url.search !== '' || url.hash !== '' || url.username !== '') {
    throw new Error(
      `${nome}="${valor}" traz consulta, fragmento ou credencial. A base é ` +
        'esquema, host e no máximo caminho: o que vem depois é acrescentado ' +
        'por quem monta o link, e um `?` aqui empurra o resto para dentro da ' +
        'consulta em silêncio.',
    );
  }
  return aparada as AbsoluteUrl;
}

/**
 * Os dois últimos rótulos do host. Aproximação deliberada de "domínio
 * registrável": não carrega lista pública de sufixos, e não precisa carregar —
 * ela só decide se dois hosts NOSSOS são da mesma casa. Em `.com.br` a
 * comparação fica mais frouxa (`com.br` dos dois lados), o que produz
 * aprovação a mais e nunca reprovação a mais; para o que esta guarda protege,
 * errar para o lado de deixar subir é o lado certo de errar.
 */
function dominioRegistravel(host: string): string {
  const rotulos = host.split('.');
  return rotulos.length <= 2 ? host : rotulos.slice(-2).join('.');
}

/**
 * Onde o projeto do FCM deixa de ser conveniência e passa a ser obrigação.
 *
 * O critério é **o transporte, e não o ambiente**, e a diferença é deliberada.
 * `exigeChaveDeRotacao` pergunta "estou num ambiente de gente de verdade?"
 * porque quem consome o JWKS é terceiro e cacheia — a obrigação nasce do
 * ambiente. Aqui a obrigação nasce de outro lugar: quem **usa** o projeto é o
 * adaptador do FCM, e ele só existe quando `PUSH_TRANSPORT=fcm`. Com `log`
 * ninguém envia nada, e exigir o projeto para rodar `npm test` ou subir o
 * compose seria atrito novo sem risco atrás dele — a mesma frase que o
 * `.env.example` já usa para `SECRET_STORE_PROJECT`.
 *
 * E há uma razão concreta para NÃO reusar `ehAmbienteHospedado` aqui, apesar de
 * a forma ser a mesma: **homologação roda em `log` hoje**, de propósito
 * (docs/07-devops.md 4.1 — o projeto Firebase com o app registrado é pendência
 * do cliente, ADR-0008). Amarrar a exigência ao ambiente recusaria subir
 * justamente o ambiente que a decisão do cliente ainda não desbloqueou, e a
 * saída de quem estivesse às onze da noite seria inventar um valor — que é o
 * pior desfecho possível, porque projeto errado não dá erro de configuração:
 * dá `SENDER_ID_MISMATCH` por aparelho, que parece token inválido.
 *
 * Função nomeada, e não um `if` solto, pelo mesmo motivo do original: a
 * pergunta tem resposta única e o raciocínio precisa morar ao lado dela.
 */
function exigeProjetoDoFcm(transporte: 'fcm' | 'log'): boolean {
  return transporte === 'fcm';
}

/**
 * O transporte do push, e o projeto quando ele for usado.
 *
 * **O padrão é `log`, e não `fcm`.** A assimetria é a mesma da porteira de
 * `conteudo-do-push.ts`: push que não sai é barulhento (o log registra, o teste
 * reprova, a fila acusa) e push que sai sem ninguém ter pedido é irreversível —
 * o telefone de um tutor toca uma vez só, e a bandeja de notificação não tem
 * `UPDATE`. Um padrão que enviasse de verdade transformaria "esqueci de definir
 * a variável" em alerta real na tela de bloqueio de alguém.
 *
 * O valor desconhecido **derruba a subida citando o que veio e os aceitos**, e
 * isso não é preciosismo: é literalmente a família de `MAIL_TRANSPORT`, que até
 * 19/09 era `=== 'log' ? 'log' : 'smtp'` e mandava e-mail de verdade para
 * QUALQUER valor fora dos dois. Escrito frouxo aqui, `PUSH_TRANSPORT=logs`,
 * `PUSH_TRANSPORT=local` ou um valor herdado de outro ambiente viraria envio
 * real em silêncio — com a agravante de que push não tem receptor local
 * nenhum para segurar o estrago, como o mailpit segurou aquele.
 */
function carregarPush(): PushConfig {
  const transporteBruto = optionalEnv('PUSH_TRANSPORT') ?? 'log';
  if (transporteBruto !== 'fcm' && transporteBruto !== 'log') {
    throw new Error(
      `PUSH_TRANSPORT="${transporteBruto}" não é um transporte conhecido. ` +
        'Os aceitos são "log" (escreve o payload e o destinatário no log, e ' +
        'nada sai deste processo) e "fcm" (envia de verdade, pelo FCM HTTP ' +
        'v1). Valor desconhecido não vira `fcm` por omissão e não vira `log` ' +
        'por otimismo: o primeiro toca o telefone de um tutor sem ninguém ter ' +
        'pedido, e o segundo desliga o alerta de pet perdido em silêncio. ' +
        'Foi assim que MAIL_TRANSPORT mandava e-mail de verdade até 19/09.',
    );
  }

  // `requireEnv` com o nome LITERAL, e dentro do ramo — igual ao
  // `requireEnv('SECRET_STORE_PROJECT')` de `criarSecretProvider`. A guarda da
  // esteira lê `requireEnv('X')` por TEXTO e não conhece condicional, então
  // `FCM_PROJECT` precisa de um valor descartável no passo "ambiente de teste"
  // do workflow mesmo sem nunca ser lida em `dev`. Isso é o ponto cego
  // conhecido da guarda, e ele é de propósito: ensiná-la a entender `if` faria
  // dela uma análise de fluxo, e análise de fluxo incompleta aprova o que não
  // entende.
  const projeto = exigeProjetoDoFcm(transporteBruto)
    ? requireEnv('FCM_PROJECT')
    : optionalEnv('FCM_PROJECT');

  return { transport: transporteBruto, projeto };
}

export function loadAppConfig(): AppConfig {
  const environment = optionalEnv('ENVIRONMENT') ?? 'dev';
  const publicBaseUrl = urlAbsoluta(requireEnv('PUBLIC_BASE_URL'));

  // As duas bases que o ADR-0017 item 2 separou de `PUBLIC_BASE_URL`, e a
  // separação inteira existe para registrar QUAL das cinco coisas que a
  // variável única carregava é a irreversível: esta primeira.
  //
  // Obrigatórias e sem padrão embutido, como o resto do arquivo. Um padrão aqui
  // seria pior do que a ausência: a aplicação subiria emitindo tag com o
  // endereço da máquina de quem escreveu o padrão, e cada tag emitida assim é
  // plástico que não volta atrás (ADR-0004).
  const tagBaseUrl = baseDePaginaPublica(requireEnv('TAG_BASE_URL'), 'TAG_BASE_URL');
  const webBaseUrl = baseDePaginaPublica(requireEnv('WEB_BASE_URL'), 'WEB_BASE_URL');

  // `http` na base da tag é aceitável em desenvolvimento e inaceitável em
  // ambiente de gente de verdade: o QR guarda o esquema junto com o host, e um
  // `http://` prensado continua `http://` para sempre. Não há redirecionamento
  // que conserte plaquinha — e no `.app`, que tem HSTS pré-carregado, o
  // endereço em `http` nem chega a sair do telefone.
  if (ehAmbienteHospedado(environment) && !tagBaseUrl.startsWith('https://')) {
    throw new Error(
      `TAG_BASE_URL="${tagBaseUrl}" não é https, e o ambiente é hospedado. ` +
        'O esquema vai codificado no QR junto com o host: tag prensada em ' +
        'http continua em http para sempre (ADR-0004).',
    );
  }

  // O ADR-0017 item 2 exige que os dois hosts sejam O MESMO e manda a aplicação
  // recusar subir se divergirem. **O cliente decidiu em 19/09 valores que
  // divergem** -- `tag.<domínio>` para a plaquinha e o apex para as páginas --,
  // e implementar a invariante ao pé da letra seria entregar uma aplicação que
  // não sobe com a configuração que ela acabou de receber.
  //
  // Então a guarda protege o que continua valendo, e o que ela deixou de
  // proteger está escrito aqui e no relato, em vez de sumir: a invariante
  // servia aos arquivos de associação de deep link, que o sistema operacional
  // busca NO HOST DO LINK. Com os hosts separados, o host da plaquinha precisa
  // dos seus próprios `/.well-known/*` — e a falta deles não produz erro em
  // lugar nenhum, só o link abrindo o navegador em vez do app (ADR-0017 item
  // 3). Isso virou alvo de `infra/verificacao/associacao.yml`, que é onde dá
  // para verificar de fora; aqui não dá.
  //
  // O que a subida ainda consegue afirmar é que as duas bases são da mesma
  // casa. Divergir de domínio registrável é o erro que custa caro e é fácil de
  // cometer com copiar e colar: a plaquinha apontaria para um domínio que não é
  // nosso, e nenhuma tag já impressa voltaria atrás.
  const hostDaTag = new URL(tagBaseUrl).hostname;
  const hostDaWeb = new URL(webBaseUrl).hostname;
  if (dominioRegistravel(hostDaTag) !== dominioRegistravel(hostDaWeb)) {
    throw new Error(
      `TAG_BASE_URL (${hostDaTag}) e WEB_BASE_URL (${hostDaWeb}) estão em ` +
        'domínios diferentes. O ADR-0017 item 2 pede o mesmo host; o mínimo ' +
        'que a subida aceita é o mesmo domínio: o que o QR codifica é ' +
        'irreversível depois de impresso (ADR-0004), e uma plaquinha apontando ' +
        'para domínio de terceiro não se corrige.',
    );
  }

  const ipHmacKeyBruta = requireEnv('IP_HMAC_KEY');
  const ipHmacKey = Buffer.from(ipHmacKeyBruta, 'base64');
  if (ipHmacKey.length < 32) {
    throw new Error(
      'IP_HMAC_KEY precisa ter ao menos 32 bytes em base64. Hash de IP sem ' +
        'chave secreta é o IP em claro com um passo a mais (SEC-010).',
    );
  }

  // 32 bytes exatos: AES-256 com chave curta não é uma cifra mais fraca, é uma
  // chamada que falha. E falhar aqui, com o nome da variável e o comando para
  // gerar, é melhor do que falhar na primeira emissão de tag.
  const tagCodeKey = Buffer.from(requireEnv('TAG_CODE_KEY').trim(), 'hex');
  if (tagCodeKey.length !== 32) {
    throw new Error(
      'TAG_CODE_KEY precisa ter 32 bytes em hexadecimal (64 caracteres) e tem ' +
        `${String(tagCodeKey.length)}. Gere com: openssl rand -hex 32`,
    );
  }

  // O índice cego (ADR-0004, Emenda 1, §3.1). A recusa aqui é o ponto inteiro
  // desta variável: chave ausente que degradasse para hash sem chave devolveria
  // o estado em que um dump do banco entrega a base de códigos, e nenhum teste
  // funcional acusaria, porque a resolução continuaria encontrando as tags.
  const tagCodeIndexKey = Buffer.from(requireEnv('TAG_CODE_INDEX_KEY').trim(), 'hex');
  if (tagCodeIndexKey.length !== 32) {
    throw new Error(
      'TAG_CODE_INDEX_KEY precisa ter 32 bytes em hexadecimal (64 caracteres) e tem ' +
        `${String(tagCodeIndexKey.length)}. Ela e a chave do indice cego de ` +
        '`code_hash` (ADR-0004). Gere com: openssl rand -hex 32',
    );
  }
  if (tagCodeIndexKey.equals(tagCodeKey)) {
    throw new Error(
      'TAG_CODE_INDEX_KEY e TAG_CODE_KEY precisam ser chaves diferentes. A ' +
        'primeira indexa e a segunda cifra: iguais, quem vaza uma vaza a outra ' +
        'e o indice cego deixa de ser cego.',
    );
  }

  // As duas credenciais são exigidas juntas: uma sozinha assina requisição que
  // o armazenamento recusa, e a falha aparece no primeiro envio de foto de um
  // usuário real, e não na subida.
  const objectStorage: ObjectStorageConfig = {
    endpoint: optionalEnv('OBJECT_STORAGE_ENDPOINT'),
    // SEM padrão embutido. Região é obrigatória na assinatura V4 e o valor
    // varia por provedor; um padrão aqui seria marca de provedor em código, que
    // o ADR-0007 proíbe e o portão de portabilidade reprova — foi ele que pegou
    // esta linha.
    region: requireEnv('OBJECT_STORAGE_REGION'),
    accessKeyId: requireEnv('OBJECT_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    forcePathStyle: boolEnv('OBJECT_STORAGE_FORCE_PATH_STYLE', true),
    bucketPrivate: requireEnv('OBJECT_BUCKET_PRIVATE'),
    bucketPublic: requireEnv('OBJECT_BUCKET_PUBLIC'),
  };

  // `MAIL_TRANSPORT` recusa valor desconhecido, e isso nao e preciosismo: a
  // forma anterior era `=== 'log' ? 'log' : 'smtp'`, entao QUALQUER valor fora
  // dos dois virava envio real em silencio. Achado em 19/09 com o `.env` desta
  // maquina em `MAIL_TRANSPORT=mailpit` -- um valor que ninguem definiu, que
  // parecia dizer "manda para o receptor local", e que na verdade dizia "manda
  // para o mundo". A unica razao de nao ter doido e o host apontar para o
  // mailpit; trocar o host sem trocar isto mandaria e-mail de verdade para
  // endereco de teste.
  //
  // Falha ruidosa, como o resto da configuracao: morre citando o valor visto e
  // os aceitos.
  const transporteBruto = optionalEnv('MAIL_TRANSPORT') ?? 'smtp';
  if (transporteBruto !== 'smtp' && transporteBruto !== 'log') {
    // `postmark` ganha mensagem propria porque o roteiro de provisionamento
    // mandava usar exatamente esse valor em homologacao, e quem seguir uma
    // versao antiga dele vai cair aqui. Dizer so "valor desconhecido" mandaria
    // a pessoa duvidar da propria instrucao em vez de entender o estado.
    const explicacao =
      transporteBruto === 'postmark'
        ? 'O adaptador do Postmark ainda NAO existe (ADR-0009): a chave pode ja ' +
          'estar no cofre, mas nao ha codigo que a use. Ate ele existir, use ' +
          '"log" em homologacao -- o e-mail e escrito no log e nada sai.'
        : 'Use "smtp" (envia de verdade) ou "log" (so escreve no log).';
    throw new Error(
      `MAIL_TRANSPORT="${transporteBruto}" nao e um transporte conhecido. ` +
        explicacao +
        ' Valor desconhecido virava envio real em silencio ate 19/09.',
    );
  }

  // OBRIGATORIA, e sem padrao embutido, porque um padrao aqui seria pior do que
  // a ausencia: o webhook de entrega e chamada DE ENTRADA, vinda da internet
  // aberta, e o unico que separa o provedor de qualquer um e este segredo.
  // Subir com um valor de exemplo daria um endpoint que aceita evento forjado e
  // parece configurado -- quem quisesse marcar o e-mail de um tutor como nao
  // entregavel so precisaria saber o `MessageID`, e o tutor pararia de receber
  // aviso de pet perdido sem nada acusar. Falha ruidosa no start, §11.2.
  //
  // 32 bytes e o piso: o segredo e comparado byte a byte e nao deriva nada, e
  // abaixo disso a forca bruta deixa de ser teorica.
  const webhookSecret = Buffer.from(requireEnv('MAIL_WEBHOOK_SECRET').trim(), 'utf8');
  if (webhookSecret.length < 32) {
    throw new Error(
      'MAIL_WEBHOOK_SECRET precisa ter ao menos 32 bytes e tem ' +
        `${String(webhookSecret.length)}. Ele e a UNICA autenticacao do webhook de ` +
        'entrega (api/openapi.yaml, esquema `webhookSignature`): com ele fraco, ' +
        'qualquer um forja evento de devolucao e desliga o e-mail de um tutor. ' +
        'Gere com: openssl rand -hex 32',
    );
  }

  const mail: MailConfig = {
    transport: transporteBruto,
    host: optionalEnv('MAIL_HOST') ?? 'mail',
    port: Number.parseInt(optionalEnv('MAIL_PORT') ?? '1025', 10),
    from: requireEnv('MAIL_FROM'),
    fromName: optionalEnv('MAIL_FROM_NAME') ?? 'Bichu',
    replyTo: optionalEnv('MAIL_REPLY_TO') ?? requireEnv('MAIL_FROM'),
    webhookSecret,
  };

  return {
    environment,
    isProduction: process.env['NODE_ENV'] === 'production',
    port: Number.parseInt(optionalEnv('PORT') ?? '3000', 10),
    bindHost: optionalEnv('BIND_HOST') ?? '127.0.0.1',
    databaseUrl: requireEnv('DATABASE_URL'),
    publicBaseUrl,
    tagBaseUrl,
    webBaseUrl,
    apiBaseUrl: urlAbsoluta(requireEnv('API_BASE_URL')),
    mediaPublicBaseUrl: urlAbsoluta(requireEnv('MEDIA_PUBLIC_BASE_URL')),
    // O contrato fixa `type` sob `<domínio>/problems/`. O domínio vem de
    // ambiente: hostname literal em `src/` é reprovado pelo portão de
    // portabilidade, e com razão — trocar o domínio precisa ser uma linha.
    problemBaseUrl: `${publicBaseUrl}/problems` as AbsoluteUrl,
    token: carregarToken(environment),
    session: {
      idleTtlSeconds: TTL_INATIVIDADE_PADRAO,
      staySignedInIdleTtlSeconds: TTL_INATIVIDADE_CONTINUAR_CONECTADO,
      absoluteTtlSeconds: TTL_ABSOLUTO,
    },
    ipHmacKey,
    tagCodeKey,
    tagCodeIndexKey,
    objectStorage,
    mail,
    push: carregarPush(),
    openapiSpecPath: optionalEnv('OPENAPI_SPEC_PATH') ?? 'api/openapi.yaml',
    version: optionalEnv('APP_VERSION') ?? '0.1.0',
  };
}

/** Exposta para o `assertSafeBoot` e para teste; não decide nada sozinha. */
export function rateLimitDisabled(): boolean {
  return boolEnv('RATE_LIMIT_DISABLED');
}

/**
 * Qual contador de teto a subida usa.
 *
 * `requireEnv` e não um padrão embutido, pela §11.2: o padrão silencioso aqui
 * seria o mais caro de todos, porque a escolha errada não quebra nada — ela
 * apenas deixa de proteger, e o serviço responde 200 a tudo como se estivesse
 * certo. Faltando a variável, o boot morre nomeando ela.
 *
 * `disabled` fora de `dev` não chega aqui: `assertSafeBoot` já derrubou.
 */
export function rateLimitDriver(): RateLimitDriver {
  const bruto = requireEnv('RATE_LIMIT_DRIVER');
  if (bruto === 'memory' || bruto === 'postgres' || bruto === 'disabled') return bruto;
  throw new Error(
    `RATE_LIMIT_DRIVER=${bruto} não é um contador conhecido. ` +
      'Use `memory` (uma instância só), `postgres` (compartilhado) ou `disabled` (só em dev).',
  );
}
