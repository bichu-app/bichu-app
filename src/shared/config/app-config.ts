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

export function loadAppConfig(): AppConfig {
  const environment = optionalEnv('ENVIRONMENT') ?? 'dev';
  const publicBaseUrl = urlAbsoluta(requireEnv('PUBLIC_BASE_URL'));
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
    throw new Error(
      `MAIL_TRANSPORT="${transporteBruto}" nao e um transporte conhecido. ` +
        'Use "smtp" (envia de verdade) ou "log" (so escreve no log). ' +
        'Valor desconhecido virava envio real em silencio ate 19/09.',
    );
  }

  const mail: MailConfig = {
    transport: transporteBruto,
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
