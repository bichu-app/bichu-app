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
import type { AbsoluteUrl } from '../types/brands.js';

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
  readonly publicBaseUrl: AbsoluteUrl;
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
  readonly openapiSpecPath: string;
  readonly version: string;
  readonly objectStorage: ObjectStorageConfig;
  readonly mail: MailConfig;
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

function carregarChave(sufixo: string, obrigatoria: boolean): SigningKey | undefined {
  const kid = obrigatoria ? requireEnv(`JWT_${sufixo}_KID`) : optionalEnv(`JWT_${sufixo}_KID`);
  const pem = obrigatoria
    ? requireEnv(`JWT_${sufixo}_PRIVATE_KEY`)
    : optionalEnv(`JWT_${sufixo}_PRIVATE_KEY`);
  if (kid === undefined || pem === undefined) return undefined;

  const privateKey = createPrivateKey(lerPem(pem, `JWT_${sufixo}_PRIVATE_KEY`));
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new Error(
      `JWT_${sufixo}_PRIVATE_KEY não é RSA. O contrato fixa RS256, e HS256 ` +
        `fecharia a porta do Keycloak (ADR-0002).`,
    );
  }
  return { kid, privateKey, publicKey: createPublicKey(privateKey) };
}

function carregarToken(): TokenConfig {
  const issuer = requireEnv('TOKEN_ISSUER');
  const activeKey = carregarChave('ACTIVE', true);
  if (activeKey === undefined) throw new Error('JWT_ACTIVE_KID e JWT_ACTIVE_PRIVATE_KEY são obrigatórias.');
  const nextKey = carregarChave('NEXT', false);

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

function urlAbsoluta(nome: string): AbsoluteUrl {
  const valor = requireEnv(nome).replace(/\/+$/, '');
  return valor as AbsoluteUrl;
}

export function loadAppConfig(): AppConfig {
  const environment = optionalEnv('ENVIRONMENT') ?? 'dev';
  const publicBaseUrl = urlAbsoluta('PUBLIC_BASE_URL');
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

  const mail: MailConfig = {
    transport: optionalEnv('MAIL_TRANSPORT') === 'log' ? 'log' : 'smtp',
    host: optionalEnv('MAIL_HOST') ?? 'mail',
    port: Number.parseInt(optionalEnv('MAIL_PORT') ?? '1025', 10),
    from: requireEnv('MAIL_FROM'),
    fromName: optionalEnv('MAIL_FROM_NAME') ?? 'Bichu',
    replyTo: optionalEnv('MAIL_REPLY_TO') ?? requireEnv('MAIL_FROM'),
  };

  return {
    environment,
    isProduction: process.env['NODE_ENV'] === 'production',
    port: Number.parseInt(optionalEnv('PORT') ?? '3000', 10),
    bindHost: optionalEnv('BIND_HOST') ?? '127.0.0.1',
    databaseUrl: requireEnv('DATABASE_URL'),
    publicBaseUrl,
    apiBaseUrl: urlAbsoluta('API_BASE_URL'),
    mediaPublicBaseUrl: urlAbsoluta('MEDIA_PUBLIC_BASE_URL'),
    // O contrato fixa `type` sob `<domínio>/problems/`. O domínio vem de
    // ambiente: hostname literal em `src/` é reprovado pelo portão de
    // portabilidade, e com razão — trocar o domínio precisa ser uma linha.
    problemBaseUrl: `${publicBaseUrl}/problems` as AbsoluteUrl,
    token: carregarToken(),
    session: {
      idleTtlSeconds: TTL_INATIVIDADE_PADRAO,
      staySignedInIdleTtlSeconds: TTL_INATIVIDADE_CONTINUAR_CONECTADO,
      absoluteTtlSeconds: TTL_ABSOLUTO,
    },
    ipHmacKey,
    tagCodeKey,
    objectStorage,
    mail,
    openapiSpecPath: optionalEnv('OPENAPI_SPEC_PATH') ?? 'api/openapi.yaml',
    version: optionalEnv('APP_VERSION') ?? '0.1.0',
  };
}

/** Exposta para o `assertSafeBoot` e para teste; não decide nada sozinha. */
export function rateLimitDisabled(): boolean {
  return boolEnv('RATE_LIMIT_DISABLED');
}
