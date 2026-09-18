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
    openapiSpecPath: optionalEnv('OPENAPI_SPEC_PATH') ?? 'api/openapi.yaml',
    version: optionalEnv('APP_VERSION') ?? '0.1.0',
  };
}

/** Exposta para o `assertSafeBoot` e para teste; não decide nada sozinha. */
export function rateLimitDisabled(): boolean {
  return boolEnv('RATE_LIMIT_DISABLED');
}
