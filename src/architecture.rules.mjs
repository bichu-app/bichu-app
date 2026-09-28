/**
 * Regras de fronteira da arquitetura, em um lugar só.
 *
 * Este arquivo é CONTEÚDO (as regras) e não FIAÇÃO (como a esteira as roda).
 * A configuração do ESLint na raiz importa daqui. A separação é deliberada:
 * as regras são da arquitetura, a esteira é de quem opera.
 *
 * Cada regra existe porque uma decisão escrita seria, sem ela, uma recomendação.
 * A referência está ao lado de cada uma.
 */

/** Módulos do monólito modular (ADR-0001). */
export const MODULES = [
  'identity', 'pets', 'tags', 'lostfound', 'found',
  'messaging', 'media', 'notifications', 'professionals', 'audit',
  // BICHUS-66. A transferencia e modulo proprio e nao um canto de `pets`: ela
  // tem maquina de estado, tokens, fila e dois tutores, e escreve em `pets` e
  // em `pet_tags` na mesma transacao. Dentro de `pets` isso viraria um segundo
  // dominio sem fronteira.
  'transfers',
  // BICHUS-185 / BICHUS-189. A vitrine da `Loja` e modulo proprio e nao um
  // canto de `professionals`: as duas secoes sao listagens do mesmo formato e
  // nao compartilham tabela, regra nem publico -- `Perto` e um diretorio de
  // pessoas que exige conta, e a `Loja` e um catalogo publico de produto de
  // terceiro. Junta-las faria uma fronteira que a arquitetura nao consegue
  // vigiar, com `professionals` importando `store_items`.
  'store',
  // ADR-0027 item 20. A sessao e o cadastro do painel sao modulo proprio, e nao
  // um canto de `identity`: o painel tem contas separadas das do app, e esta
  // fronteira e o que vigia a separacao no codigo. `admin-access` importa de
  // `identity` so `ports/senha.ts` e `ports/lista-de-senhas-vazadas.ts`, e
  // `identity` nao importa nada daqui.
  'admin-access',
  // BICHUS/Rede (ADR-0025). Os encontros da comunidade sao modulo proprio pela
  // mesma razao de `store`: e uma listagem do mesmo formato que `Perto` e
  // `Loja` e nao compartilha tabela, regra nem publico com nenhuma das duas.
  // E ha uma razao a mais aqui, que e de privacidade: `network_event_checkins`
  // e a unica tabela desta secao que identifica alguem, e manter a fronteira e
  // o que garante que nenhum outro modulo consiga le-la a nao ser por `ports/`.
  'network',
];

/**
 * Um módulo só enxerga `ports/` de outro módulo. Nunca `domain/`,
 * `application/`, `adapters/` nem tabela alheia.
 * docs/03-arquitetura.md §6.
 */
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

/**
 * O domínio não conhece framework, banco, HTTP nem nuvem.
 * `import` de ORM dentro de regra de negócio é violação estrutural, não estilo.
 */
export const domainPurity = {
  from: 'src/modules/[^/]+/(domain|application)/',
  forbiddenPackages: [
    'fastify', 'kysely', 'pg', '@aws-sdk/*', '@google-cloud/*',
    'firebase-admin', 'postmark', 'sharp', 'node:fs', 'node:http', 'node:https',
  ],
  message: 'domain/ e application/ não conhecem framework, banco, HTTP nem nuvem.',
};

/**
 * SDK de provedor só em adapters/external/.
 * docs/03-arquitetura.md §11.1, proibição 2.
 */
export const providerSdkConfinement = {
  allowedOnly: 'src/modules/[^/]+/adapters/external/',
  packages: ['@aws-sdk/*', '@google-cloud/*', 'firebase-admin', 'postmark', 'minio'],
  message: 'SDK de provedor vive atrás da porta, em adapters/external/.',
};

/**
 * Relógio injetável. `Date.now()` e `new Date()` proibidos em domain/ e
 * application/. A exceção é UM arquivo, declarada por caminho e não por
 * comentário de supressão — comentário que o formatador move deixa de cobrir o
 * que deveria. docs/03-arquitetura.md §7.
 */
export const injectableClock = {
  from: 'src/modules/[^/]+/(domain|application)/',
  forbiddenSyntax: ['Date.now()', 'new Date()'],
  soleException: 'src/shared/time/clock.ts',
  message: 'Use a porta Clock. Tempo real só em shared/time/clock.ts.',
};

/**
 * Nome de recurso de provedor em `src/` é defeito, mesmo em comentário de
 * exemplo. Tudo vem de ambiente. §11.1, proibição 1.
 */
export const noHardcodedProviderResources = {
  from: 'src/',
  forbiddenPatterns: [
    's3\\.amazonaws\\.com', 'storage\\.googleapis\\.com', 'blob\\.core\\.windows\\.net',
    'arn:aws:', '\\.rds\\.amazonaws\\.com',
  ],
  message: 'Endpoint, bucket, região e conta vêm de variável de ambiente.',
};

/**
 * Tipos gerados não se editam à mão: a fonte é api/openapi.yaml.
 * Editar aqui faz o contrato e o código divergirem sem que o diff mostre.
 */
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
