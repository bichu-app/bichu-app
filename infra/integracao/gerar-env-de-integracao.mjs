#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * Gera `.env.integracao` a partir de `.env.example`, com valores de TESTE.
 *
 * ===========================================================================
 * POR QUE O WORKTREE NAO RECEBE O `.env` DE VERDADE
 * ===========================================================================
 * `git worktree add` nao leva o `.env`: ele e ignorado pelo git, e isso esta
 * certo -- o `.env` da arvore principal carrega token do Postmark, credencial
 * do Atlassian e do GitHub. Copia-lo para o worktree resolveria a integracao
 * espalhando segredo real por oito diretorios em /private/tmp, cada um deles
 * uma copia que ninguem rotaciona e da qual ninguem se lembra.
 *
 * A ADR-0022 diz onde segredo mora: GCP Secret Manager. Nunca em arquivo,
 * nunca em log. Entao o worktree nao ganha o `.env`: ele GERA o seu, com
 * valores que nao valem nada em lugar nenhum, e que se anunciam como tal.
 *
 * Todo valor gerado carrega o prefixo `integracao-descartavel`. Se um desses
 * aparecer num log de producao, a origem e obvia em vez de misteriosa.
 * ===========================================================================
 *
 * O arquivo sai em `.env.integracao`, coberto por `.env.*` no `.gitignore`.
 * Ele e reescrito a cada execucao: nao ha estado para envelhecer.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lerVariaveisExigidas, autoteste } from './variaveis-exigidas.mjs';

const MARCA = 'integracao-descartavel';

/**
 * Chave RSA gerada AGORA e jogada fora com o processo. Chave de assinatura de
 * verdade nunca entra em repositorio, em worktree nem em log (ADR-0022).
 */
function chaveRsaEmBase64() {
  const dir = mkdtempSync(join(tmpdir(), 'bichu-int-'));
  const pem = join(dir, 'chave.pem');
  try {
    execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', pem], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return readFileSync(pem).toString('base64');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Os valores que o `.env.example` deixa em branco de proposito, e os que
 * precisam apontar para ESTA pilha.
 *
 * `db` e `mail` sao os nomes de servico de `compose.integracao.yaml`, que e a
 * mesma grafia do `.env.example`. Isso nao e coincidencia conveniente: e o que
 * permite a pilha efemera usar o ambiente da aplicacao sem traducao, e e por
 * isso que nenhuma porta precisa ser publicada no hospedeiro.
 */
function valoresDeIntegracao() {
  const senha = `${MARCA}-postgres`;
  return {
    ENVIRONMENT: 'dev',
    NODE_ENV: 'development',

    POSTGRES_USER: 'bichu',
    POSTGRES_PASSWORD: senha,
    POSTGRES_DB: 'bichu',
    // A senha viaja DENTRO da URL. Trocar so POSTGRES_PASSWORD deixa a url com
    // senha vazia e a falha sai como "password authentication failed", que
    // ninguem associa a este arquivo.
    DATABASE_URL: `postgres://bichu:${senha}@db:5432/bichu`,

    // Armazenamento de objeto NAO sobe nesta pilha: nenhum caso de
    // `tests/integration/` fala com ele. Os valores existem porque
    // `loadAppConfig()` os exige na subida, e apontam para um host que nao
    // resolve -- se algum caso passar a usar armazenamento, ele falha dizendo
    // que nao resolveu o nome, em vez de escrever no MinIO da pilha principal.
    OBJECT_STORAGE_ENDPOINT: `http://objeto-que-nao-existe-na-pilha-de-${MARCA}:9000`,
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: `${MARCA}-chave`,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: `${MARCA}-segredo`,
    OBJECT_STORAGE_KMS_KEY: `${MARCA}:${randomBytes(32).toString('base64')}`,

    MAIL_TRANSPORT: 'smtp',
    MAIL_HOST: 'mail',
    MAIL_PORT: '1025',
    MAIL_WEBHOOK_SECRET: `${MARCA}-webhook-com-32-bytes-no-minimo`,
    MAIL_API_TOKEN: `${MARCA}-token-que-nao-autentica`,

    // `log`: nada sai do processo. O projeto NAO existe, e isso e de proposito
    // -- se um dia esta pilha rodar com `fcm`, o envio precisa falhar dizendo
    // que o projeto nao existe, e nao acertar o projeto de alguem.
    PUSH_TRANSPORT: 'log',
    FCM_PROJECT: `projeto-${MARCA}-que-nao-existe`,
    SECRET_STORE_PROJECT: `projeto-${MARCA}-que-nao-existe`,

    // Hex de 64 caracteres: app-config.ts recusa qualquer outro tamanho.
    TAG_CODE_KEY: randomBytes(32).toString('hex'),
    // A chave do INDICE CEGO (ADR-0004, Emenda 1), exigida sem padrao desde a
    // migracao 20260921000001. Ela faltava aqui, e a conferencia logo abaixo
    // derrubava a geracao antes de a pilha subir -- reprovando, que e o
    // comportamento certo, mas deixando a suite de integracao inalcancavel de
    // dentro de worktree. Sorteada SEPARADAMENTE de `TAG_CODE_KEY`: app-config
    // recusa a subida se as duas forem iguais, e tem razao, porque a mesma
    // chave no indice e no envelope faria um dump entregar o codigo da tag.
    TAG_CODE_INDEX_KEY: randomBytes(32).toString('hex'),
    IP_HMAC_KEY: randomBytes(32).toString('base64'),
    JWT_ACTIVE_KID: `${MARCA}-ativa`,
    JWT_NEXT_KID: `${MARCA}-rotacao`,
    JWT_ACTIVE_PRIVATE_KEY: chaveRsaEmBase64(),
    JWT_NEXT_PRIVATE_KEY: chaveRsaEmBase64(),

    // A BICHUS-178 tornou esta exigida, sem padrao embutido. `postgres` e o que
    // a suite de concorrencia precisa: o driver em memoria nao atravessa
    // processo e nao prova nada sobre o balde compartilhado.
    RATE_LIMIT_DRIVER: 'postgres',
    APP_INSTANCES: '1',

    OPENAPI_SPEC_PATH: 'api/openapi.yaml',
  };
}

function aplicar(texto, chave, valor) {
  const linha = `${chave}=${valor}`;
  const expressao = new RegExp(`^${chave}=.*$`, 'm');
  return expressao.test(texto) ? texto.replace(expressao, linha) : `${texto}\n${linha}`;
}

export function gerar({ exemplo = '.env.example', destino = '.env.integracao' } = {}) {
  console.log(autoteste());

  let texto = readFileSync(exemplo, 'utf8');
  const valores = valoresDeIntegracao();
  for (const [chave, valor] of Object.entries(valores)) texto = aplicar(texto, chave, valor);

  const cabecalho = [
    '# GERADO por infra/integracao/gerar-env-de-integracao.mjs. NAO EDITE.',
    '#',
    '# Ambiente de TESTE. Todo valor daqui e descartavel e nao autentica em',
    '# lugar nenhum. Nao ha segredo neste arquivo, e nao pode passar a haver:',
    '# segredo mora no GCP Secret Manager (ADR-0022).',
    '#',
    `# Marca de descartabilidade: ${MARCA}`,
    '',
  ].join('\n');
  texto = aplicar(texto, 'BICHU_ENV_DESCARTAVEL', MARCA);
  writeFileSync(destino, cabecalho + texto);

  // A conferencia, e nao a esperanca: cada `requireEnv('X')` do codigo tem
  // valor nao vazio aqui? A ausencia derruba a geracao NOMEANDO a variavel, em
  // vez de deixar a pilha subir e morrer em loop de reinicio dez linhas abaixo
  // do passo que de fato falhou.
  const { exigidas, opacas } = lerVariaveisExigidas('src');
  if (opacas.length > 0) {
    throw new Error(
      'ha chamada de requireEnv cujo nome so existe em tempo de execucao, e que ' +
        'portanto NAO esta sendo conferida: ' + opacas.join('; '),
    );
  }
  const ambiente = Object.fromEntries(
    texto
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
  const faltando = exigidas.filter((v) => (ambiente[v] ?? '').trim() === '');
  if (faltando.length > 0) {
    throw new Error(
      `o ambiente de integracao nao preenche variavel exigida pelo codigo: ${faltando.join(', ')}. ` +
        'Acrescente um valor descartavel em valoresDeIntegracao(), em ' +
        'infra/integracao/gerar-env-de-integracao.mjs.',
    );
  }
  return { destino, conferidas: exigidas.length };
}

if (process.argv[1]?.endsWith('gerar-env-de-integracao.mjs')) {
  const { destino, conferidas } = gerar();
  console.log(`${destino} gerado; ${conferidas} variaveis exigidas pelo codigo, todas preenchidas`);
}
