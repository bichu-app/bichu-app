/** Configuração da aplicação, lida uma vez na subida. */
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { boolEnv, optionalEnv, requireEnv } from './env.js';
import { ehAmbienteHospedado } from './ambiente-hospedado.js';
import { exigeTokenDoProvedor } from './transporte-de-email.js';
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
  /** Lista de emissores aceitos, e não um emissor fixo (ADR-0002). */
  readonly trustedIssuers: readonly string[];
  readonly activeKey: SigningKey;
  /** Ativa mais a de rotação, nesta ordem. */
  readonly allKeys: readonly SigningKey[];
  readonly accessTokenTtlSeconds: number;
  readonly clockToleranceSeconds: number;
}

export interface SessionConfig {
  /** Janela de inatividade padrão (docs/04-seguranca.md 7.5). */
  readonly idleTtlSeconds: number;
  /** Janela de inatividade com "continuar conectado", que nasce desmarcado. */
  readonly staySignedInIdleTtlSeconds: number;
  /** Teto absoluto desde a autenticação com senha. */
  readonly absoluteTtlSeconds: number;
}

export interface AppConfig {
  readonly environment: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly bindHost: string;
  readonly databaseUrl: string;
  /** Endereço público DESTE serviço, e nada mais desde 19/09. */
  readonly publicBaseUrl: AbsoluteUrl;
  /** O que o QR da plaquinha codifica: `{TAG_BASE_URL}/t/{código}`. */
  readonly tagBaseUrl: AbsoluteUrl;
  /**
   * Onde vivem as páginas públicas do time web (ADR-0017): cartaz, caso, perfil,
   * conversa do achador, verificação de e-mail, redefinição de senha e cancelamento
   * de transferência.
   */
  readonly webBaseUrl: AbsoluteUrl;
  /** A identidade do Relying Party do passkey (BICHUS-301). */
  readonly passkey: {
    readonly rpId: string;
    readonly rpName: string;
    /** `android:apk-key-hash:...`, NAO uma URL. */
    readonly origensAceitas: readonly string[];
  };
  /**
   * `ADMIN_ORIGIN`: a origem exata do painel (em producao, o host `admin.bichu.app`
   * com esquema https), contra a qual o `Origin` de toda escrita administrativa e
   * comparado (ADR-0027 item 3, D39).
   */
  readonly adminOrigin: string | undefined;
  readonly apiBaseUrl: AbsoluteUrl;
  readonly mediaPublicBaseUrl: AbsoluteUrl;
  /** `INSTAGRAM_PROFILE_BASE_URL`; nula quando nao configurada. */
  readonly instagramProfileBaseUrl: AbsoluteUrl | null;
  readonly problemBaseUrl: AbsoluteUrl;
  readonly token: TokenConfig;
  readonly session: SessionConfig;
  /** Chave do HMAC de endereço IP (SEC-010). */
  readonly ipHmacKey: Buffer;
  /** Chave da cifra do código da tag, 32 bytes em hexadecimal (`TAG_CODE_KEY`). */
  readonly tagCodeKey: Buffer;
  /**
   * Chave do índice cego do código da tag, 32 bytes em hexadecimal
   * (`TAG_CODE_INDEX_KEY`).
   */
  readonly tagCodeIndexKey: Buffer;
  readonly openapiSpecPath: string;
  readonly version: string;
  readonly objectStorage: ObjectStorageConfig;
  readonly mail: MailConfig;
  readonly push: PushConfig;
}

/** Push (ADR-0008). */
export interface PushConfig {
  readonly transport: 'fcm' | 'log';
  /**
   * O projeto para onde o envio vai: o endereço do HTTP v1 é
   * `/v1/projects/{projeto}/messages:send`.
   */
  readonly projeto: string | undefined;
}

/** E-mail transacional. */
export interface MailConfig {
  /**
   * `postmark` e o unico que entrega a gente de verdade (ADR-0009); `smtp` fala com
   * o receptor local (mailpit) e nao sabe autenticar; `log` escreve e nao manda.
   */
  readonly transport: 'smtp' | 'postmark' | 'log';
  readonly host: string;
  readonly port: number;
  /** Precisa ser em `@mail.<domínio>`, não no apex. */
  readonly from: string;
  readonly fromName: string;
  readonly replyTo: string;
  /**
   * Segredo do webhook de entrega (`MAIL_WEBHOOK_SECRET`), o que `api/openapi.yaml`
   * declara no esquema `webhookSignature`.
   */
  readonly webhookSecret: Buffer;
  /**
   * O token de servidor do provedor (`MAIL_API_TOKEN`), que vai no cabecalho
   * `X-Postmark-Server-Token` de cada envio.
   */
  readonly apiToken: string | undefined;
}

/** Armazenamento de objeto compatível com S3 (ADR-0007). */
function dialetoDeAssinaturaEnv(): 'amz' | 'goog' {
  const valor = optionalEnv('OBJECT_STORAGE_SIGNATURE_DIALECT') ?? 'amz';
  if (valor !== 'amz' && valor !== 'goog') {
    throw new Error(
      `OBJECT_STORAGE_SIGNATURE_DIALECT invalido: ${JSON.stringify(valor)}. Use amz ou goog.`,
    );
  }
  return valor;
}

export interface ObjectStorageConfig {
  /** Vazio significa o endpoint padrão do provedor, e é um valor legítimo. */
  readonly endpoint: string | undefined;
  /**
   * `OBJECT_STORAGE_PUBLIC_ENDPOINT`: o endereco pelo qual o NAVEGADOR e o app
   * alcancam o armazenamento.
   */
  readonly publicEndpoint?: string | undefined;
  /**
   * `OBJECT_STORAGE_SIGNATURE_DIALECT`: `amz` (padrao; API S3, MinIO) ou `goog` (o
   * XML API do armazenamento gerenciado com chave HMAC).
   */
  readonly dialetoDeAssinatura?: 'amz' | 'goog';
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `true` no MinIO, `false` na maioria dos gerenciados. */
  readonly forcePathStyle: boolean;
  /** Originais e derivadas privadas. */
  readonly bucketPrivate: string;
  /** SÓ as derivadas que a rota pública mostra, servidas pelo domínio de mídia. */
  readonly bucketPublic: string;
  /** Prazo de HEAD e DELETE: sem corpo, é ida e volta de metadado. */
  readonly prazoCurtoMs: number;
  /** Prazo de GET e PUT, que carregam os bytes da foto. */
  readonly prazoDeTransferenciaMs: number;
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

const MILISSEGUNDO_POR_SEGUNDO = 1000;

/**
 * HEAD e DELETE. Cinco segundos é duas ordens de grandeza acima do que o MinIO na
 * mesma rede leva, e ainda folgado para um gerenciado do outro lado da internet.
 */
export const PRAZO_CURTO_DO_ARMAZENAMENTO_MS = 5 * MILISSEGUNDO_POR_SEGUNDO;

/** Vazão mínima que o prazo de transferência tolera: 256 KiB/s, ou 2 Mbit/s. */
export const VAZAO_MINIMA_DO_ARMAZENAMENTO_BYTES_POR_SEGUNDO = 256 * 1024;
const MAIOR_OBJETO_TRAFEGADO_BYTES = 10 * 1024 * 1024;
export const PRAZO_DE_TRANSFERENCIA_DO_ARMAZENAMENTO_MS =
  (MAIOR_OBJETO_TRAFEGADO_BYTES / VAZAO_MINIMA_DO_ARMAZENAMENTO_BYTES_POR_SEGUNDO) * MILISSEGUNDO_POR_SEGUNDO +
  PRAZO_CURTO_DO_ARMAZENAMENTO_MS;

/** Prazo em milissegundos, inteiro e positivo, ou o padrão quando ausente. */
function milissegundosEnv(nome: string, padrao: number): number {
  const bruto = optionalEnv(nome);
  if (bruto === undefined) return padrao;
  if (!/^[1-9]\d*$/.test(bruto.trim())) {
    throw new Error(
      `${nome}=${JSON.stringify(bruto)} não é um prazo válido. Use um inteiro positivo em ` +
        `milissegundos, ou apague a variável para usar o padrão de ${String(padrao)} ms.`,
    );
  }
  return Number(bruto.trim());
}

/** Aceita PEM cru ou PEM em base64. */
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

/** Recebe o `kid` e o PEM ja lidos, e nao o sufixo para monta-los. */
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

/** Onde a chave de rotação deixa de ser conveniência e passa a ser obrigação. */
function exigeChaveDeRotacao(environment: string): boolean {
  return ehAmbienteHospedado(environment);
}

function carregarToken(environment: string): TokenConfig {
  const issuer = requireEnv('TOKEN_ISSUER');
  const activeKey = carregarChave(
    requireEnv('JWT_ACTIVE_KID'),
    requireEnv('JWT_ACTIVE_PRIVATE_KEY'),
    'JWT_ACTIVE_PRIVATE_KEY',
  );
  if (activeKey === undefined) throw new Error('JWT_ACTIVE_KID e JWT_ACTIVE_PRIVATE_KEY são obrigatórias.');

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

/** Recebe o VALOR ja exigido, e nao o nome da variavel. */
function urlAbsoluta(valor: string): AbsoluteUrl {
  return valor.replace(/\/+$/, '') as AbsoluteUrl;
}

/** Base pública de página, conferida na FORMA e não só aparada. */
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

/** Os dois últimos rótulos do host. */
function dominioRegistravel(host: string): string {
  const rotulos = host.split('.');
  return rotulos.length <= 2 ? host : rotulos.slice(-2).join('.');
}

/** Onde o projeto do FCM deixa de ser conveniência e passa a ser obrigação. */
function exigeProjetoDoFcm(transporte: 'fcm' | 'log'): boolean {
  return transporte === 'fcm';
}

/** O transporte do push, e o projeto quando ele for usado. */
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

  const projeto = exigeProjetoDoFcm(transporteBruto)
    ? requireEnv('FCM_PROJECT')
    : optionalEnv('FCM_PROJECT');

  return { transport: transporteBruto, projeto };
}

export function loadAppConfig(): AppConfig {
  const environment = optionalEnv('ENVIRONMENT') ?? 'dev';
  const publicBaseUrl = urlAbsoluta(requireEnv('PUBLIC_BASE_URL'));

  const tagBaseUrl = baseDePaginaPublica(requireEnv('TAG_BASE_URL'), 'TAG_BASE_URL');
  const webBaseUrl = baseDePaginaPublica(requireEnv('WEB_BASE_URL'), 'WEB_BASE_URL');

  if (ehAmbienteHospedado(environment) && !tagBaseUrl.startsWith('https://')) {
    throw new Error(
      `TAG_BASE_URL="${tagBaseUrl}" não é https, e o ambiente é hospedado. ` +
        'O esquema vai codificado no QR junto com o host: tag prensada em ' +
        'http continua em http para sempre (ADR-0004).',
    );
  }

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

  const passkeyRpId = hostDaWeb;
  if (environment === 'prod' && passkeyRpId !== dominioRegistravel(passkeyRpId)) {
    throw new Error(
      `WEB_BASE_URL aponta para o subdominio "${passkeyRpId}" e o ambiente e ` +
        `"${environment}". O \`rpId\` do passkey sairia dai, e credencial emitida para um ` +
        `subdominio NAO vale no apex "${dominioRegistravel(passkeyRpId)}" -- enquanto o ` +
        'contrario vale. Como o `rpId` nao pode mudar depois (trocar invalida toda ' +
        'credencial ja emitida), producao precisa servir a web do apex.',
    );
  }

  const digitaisDoApk = (
    optionalEnv('PASSKEY_ANDROID_CERT_FINGERPRINTS') ??
    '5D:7A:C5:50:5F:C6:C4:77:28:F9:86:75:F8:F9:7E:9A:64:27:AB:95:4A:2E:B7:74:B8:FF:72:6F:CA:3F:12:55'
  )
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '');
  for (const digital of digitaisDoApk) {
    if (!/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/.test(digital)) {
      throw new Error(
        `PASSKEY_ANDROID_CERT_FINGERPRINTS tem uma digital malformada (${digital}). ` +
          'O formato e o do `assetlinks.json`: 32 bytes em hexadecimal separados por `:`.',
      );
    }
  }
  const passkeyOrigensAceitas = digitaisDoApk.map(
    (digital) =>
      `android:apk-key-hash:${Buffer.from(digital.replace(/:/g, ''), 'hex').toString('base64url')}`,
  );

  const ipHmacKeyBruta = requireEnv('IP_HMAC_KEY');
  const ipHmacKey = Buffer.from(ipHmacKeyBruta, 'base64');
  if (ipHmacKey.length < 32) {
    throw new Error(
      'IP_HMAC_KEY precisa ter ao menos 32 bytes em base64. Hash de IP sem ' +
        'chave secreta é o IP em claro com um passo a mais (SEC-010).',
    );
  }

  const tagCodeKey = Buffer.from(requireEnv('TAG_CODE_KEY').trim(), 'hex');
  if (tagCodeKey.length !== 32) {
    throw new Error(
      'TAG_CODE_KEY precisa ter 32 bytes em hexadecimal (64 caracteres) e tem ' +
        `${String(tagCodeKey.length)}. Gere com: openssl rand -hex 32`,
    );
  }

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

  const objectStorage: ObjectStorageConfig = {
    endpoint: optionalEnv('OBJECT_STORAGE_ENDPOINT'),
    publicEndpoint: optionalEnv('OBJECT_STORAGE_PUBLIC_ENDPOINT'),
    dialetoDeAssinatura: dialetoDeAssinaturaEnv(),
    region: requireEnv('OBJECT_STORAGE_REGION'),
    accessKeyId: requireEnv('OBJECT_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    forcePathStyle: boolEnv('OBJECT_STORAGE_FORCE_PATH_STYLE', true),
    bucketPrivate: requireEnv('OBJECT_BUCKET_PRIVATE'),
    bucketPublic: requireEnv('OBJECT_BUCKET_PUBLIC'),
    prazoCurtoMs: milissegundosEnv('OBJECT_STORAGE_TIMEOUT_MS', PRAZO_CURTO_DO_ARMAZENAMENTO_MS),
    prazoDeTransferenciaMs: milissegundosEnv(
      'OBJECT_STORAGE_TRANSFER_TIMEOUT_MS',
      PRAZO_DE_TRANSFERENCIA_DO_ARMAZENAMENTO_MS,
    ),
  };

  const transporteBruto = optionalEnv('MAIL_TRANSPORT') ?? 'smtp';
  if (
    transporteBruto !== 'smtp' &&
    transporteBruto !== 'postmark' &&
    transporteBruto !== 'log'
  ) {
    throw new Error(
      `MAIL_TRANSPORT="${transporteBruto}" nao e um transporte conhecido. ` +
        'Use "postmark" (o provedor do ADR-0009: entrega de verdade, por HTTP, e ' +
        'exige MAIL_API_TOKEN), "smtp" (o receptor LOCAL, mailpit: sem AUTH e sem ' +
        'STARTTLS, nao serve para provedor nenhum) ou "log" (so escreve no log, e ' +
        'nada sai do processo). Valor desconhecido virava envio real em silencio ' +
        'ate 19/09.',
    );
  }

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

  const apiToken = exigeTokenDoProvedor(transporteBruto)
    ? requireEnv('MAIL_API_TOKEN')
    : optionalEnv('MAIL_API_TOKEN');

  const mail: MailConfig = {
    transport: transporteBruto,
    host: optionalEnv('MAIL_HOST') ?? 'mail',
    port: Number.parseInt(optionalEnv('MAIL_PORT') ?? '1025', 10),
    from: requireEnv('MAIL_FROM'),
    fromName: optionalEnv('MAIL_FROM_NAME') ?? 'Bichu',
    replyTo: optionalEnv('MAIL_REPLY_TO') ?? requireEnv('MAIL_FROM'),
    webhookSecret,
    apiToken,
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
    passkey: {
      rpId: passkeyRpId,
      rpName: 'Bichu',
      origensAceitas: passkeyOrigensAceitas,
    },
    adminOrigin: optionalEnv('ADMIN_ORIGIN'),
    apiBaseUrl: urlAbsoluta(requireEnv('API_BASE_URL')),
    mediaPublicBaseUrl: urlAbsoluta(requireEnv('MEDIA_PUBLIC_BASE_URL')),
    instagramProfileBaseUrl: (() => {
      const bruto = optionalEnv('INSTAGRAM_PROFILE_BASE_URL');
      return bruto === undefined ? null : urlAbsoluta(bruto);
    })(),
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

/** Qual contador de teto a subida usa. */
export function rateLimitDriver(): RateLimitDriver {
  const bruto = requireEnv('RATE_LIMIT_DRIVER');
  if (bruto === 'memory' || bruto === 'postgres' || bruto === 'disabled') return bruto;
  throw new Error(
    `RATE_LIMIT_DRIVER=${bruto} não é um contador conhecido. ` +
      'Use `memory` (uma instância só), `postgres` (compartilhado) ou `disabled` (só em dev).',
  );
}
