/** Módulos do monólito modular (ADR-0001). */
export const MODULES = [
  'identity', 'pets', 'tags', 'lostfound', 'found',
  'messaging', 'media', 'notifications', 'professionals', 'audit',
  'transfers',
  'store',
  'admin-access',
  'network',
  'addresses',
  'moderation',
  'showcase',
  'connections',
  'safety',
  'app-release',
  'people',
  'sections',
  'support',
  'publications',
];

/** Um módulo só enxerga `ports/` de outro módulo. */
export const moduleBoundaries = {
  /** Raiz dos módulos, relativa à raiz do projeto. */
  root: 'src/modules',
  /** A única camada de um módulo que outro módulo enxerga. */
  publicLayer: 'ports',
  message:
    'Módulo só conversa com módulo por porta. Importe de modules/<outro>/ports/, ' +
    'ou declare a porta no módulo que precisa dela.',
  undeclaredMessage:
    'Módulo não declarado em MODULES. Acrescente-o à lista ou mova o arquivo: ' +
    'a fronteira não sabe vigiar módulo que a arquitetura não reconhece.',
};

/** O domínio não conhece framework, banco, HTTP nem nuvem. */
export const domainPurity = {
  from: 'src/modules/[^/]+/(domain|application)/',
  forbiddenPackages: [
    'fastify', 'kysely', 'pg', '@aws-sdk/*', '@google-cloud/*',
    'firebase-admin', 'postmark', 'sharp', 'node:fs', 'node:http', 'node:https',
  ],
  message: 'domain/ e application/ não conhecem framework, banco, HTTP nem nuvem.',
};

/** SDK de provedor só em adapters/external/. */
export const providerSdkConfinement = {
  allowedOnly: 'src/modules/[^/]+/adapters/external/',
  packages: ['@aws-sdk/*', '@google-cloud/*', 'firebase-admin', 'postmark', 'minio'],
  message: 'SDK de provedor vive atrás da porta, em adapters/external/.',
};

/**
 * Relógio injetável. `Date.now()` e `new Date()` proibidos em domain/ e
 * application/.
 */
export const injectableClock = {
  from: 'src/modules/[^/]+/(domain|application)/',
  forbiddenSyntax: ['Date.now()', 'new Date()'],
  soleException: 'src/shared/time/clock.ts',
  message: 'Use a porta Clock. Tempo real só em shared/time/clock.ts.',
};

/** Nome de recurso de provedor em `src/` é defeito, mesmo em comentário de exemplo. */
export const noHardcodedProviderResources = {
  from: 'src/',
  forbiddenPatterns: [
    's3\\.amazonaws\\.com', 'storage\\.googleapis\\.com', 'blob\\.core\\.windows\\.net',
    'arn:aws:', '\\.rds\\.amazonaws\\.com',
  ],
  message: 'Endpoint, bucket, região e conta vêm de variável de ambiente.',
};

/** Tipos gerados não se editam à mão: a fonte é api/openapi.yaml. */
export const generatedIsReadOnly = {
  path: 'src/shared/types/generated/',
  message: 'Gerado de api/openapi.yaml. Rode a geração; não edite.',
};

export default {
  MODULES,
  moduleBoundaries,
  domainPurity,
  providerSdkConfinement,
  injectableClock,
  noHardcodedProviderResources,
  generatedIsReadOnly,
};
