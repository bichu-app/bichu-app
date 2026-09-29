/**
 * Os valores descartaveis que um ambiente de NAO-PRODUCAO precisa ter, e a
 * conferencia de que nenhuma variavel exigida ficou vazia.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * A mesma receita estava escrita TRES vezes, e as tres divergiam:
 *
 *   1. `.github/workflows/ci.yml`, em 17 linhas de `sed` mais um bloco de
 *      Python, com `TAG_CODE_KEY` fixa em `'c1' * 32`;
 *   2. `infra/integracao/gerar-env-de-integracao.mjs`, com as chaves sorteadas;
 *   3. a MAO de quem desenvolve, lendo os `Gere com:` do `.env.example` e
 *      rodando cinco `openssl` -- sem nada que conferisse o resultado.
 *
 * A terceira nao tinha dono e era a unica que subia a pilha de verdade. O custo
 * ja esta medido no repositorio: a divergencia entre (2) e (3) foi o que cegou
 * o portao no defeito do token do provedor de e-mail, em 29/09/2026, e fez uma
 * suite verde conviver com `make up` quebrado.
 *
 * Agora e uma leitura so para tres bocas, pelo mesmo motivo escrito no topo de
 * `infra/integracao/variaveis-exigidas.mjs`: duas copias da mesma leitura
 * divergem, e a que diverge para menos aprova o que nao conferiu.
 * ===========================================================================
 *
 * ## O que NAO entra aqui
 *
 * Topologia. Nome de servico, endpoint, balde, porta e URL base sao DIFERENTES
 * entre a pilha efemera e a maquina de quem desenvolve, e ja estao escritos,
 * certos, no `.env.example` e no `compose.integracao.yaml`. Enfia-los aqui
 * faria um arquivo decidir por dois ambientes que nao sao o mesmo.
 *
 * Aqui entra so o que precisa ser GERADO e nao pode ser versionado: chave,
 * senha e credencial. Cada uma carrega a marca do ambiente que a gerou -- se
 * uma delas aparecer num log de producao, a origem e obvia em vez de
 * misteriosa.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Chave RSA gerada AGORA e jogada fora com o processo. Chave de assinatura de
 * verdade nunca entra em repositorio, em worktree nem em log (ADR-0022).
 */
export function chaveRsaEmBase64() {
  const dir = mkdtempSync(join(tmpdir(), 'bichu-chave-'));
  const pem = join(dir, 'chave.pem');
  try {
    execFileSync(
      'openssl',
      ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', pem],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return readFileSync(pem).toString('base64');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A receita, um item por variavel.
 *
 * `porque` NAO e enfeite: e o que o relatorio de `gerar-env-de-dev.mjs` mostra
 * no lugar do valor. Nenhum valor gerado aqui e impresso, em nenhuma das tres
 * bocas -- quem precisa do valor le o arquivo, e quem le o log fica sabendo o
 * que foi preenchido sem ficar sabendo com o que.
 */
export const RECEITA = [
  {
    nome: 'POSTGRES_PASSWORD',
    // DETERMINISTICA de proposito, e e a unica. Sorteada a cada execucao, uma
    // segunda passada trocaria a senha de um banco que ja tem volume e dado --
    // e a falha sairia como `password authentication failed`, que ninguem
    // associa a este arquivo.
    gerar: (marca) => `${marca}-postgres`,
    porque: 'senha do Postgres da pilha local',
  },
  {
    nome: 'DATABASE_URL',
    // A SENHA VIAJA DENTRO DA URL. Trocar so `POSTGRES_PASSWORD` deixa a url
    // com senha vazia: a api sobe, a sonda passa, e a primeira consulta morre
    // com `password authentication failed`. Ja aconteceu, e esta escrito no
    // `ci.yml` desde entao.
    gerar: (marca) => `postgres://bichu:${marca}-postgres@db:5432/bichu`,
    porque: 'a URL do banco CARREGA a senha acima; as duas mudam juntas',
    // `db` e o nome do servico no `compose.yaml` e no `compose.integracao.yaml`,
    // a mesma grafia dos dois. E por isso que nao ha traducao entre ambientes.
    vaziaQuando: (valor) => /^postgres:\/\/[^:]*:@/.test(valor),
  },
  {
    nome: 'OBJECT_STORAGE_ACCESS_KEY_ID',
    // O MinIO do compose e configurado A PARTIR desta variavel: ela nao e
    // "obtida" em lugar nenhum, e qualquer par serve desde que bata dos dois
    // lados -- que e o que este arquivo garante ao escrever os dois.
    gerar: (marca) => `${marca}-chave`,
    porque: 'credencial do armazenamento de objeto local (o MinIO le a mesma)',
  },
  {
    nome: 'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    gerar: (marca) => `${marca}-segredo`,
    porque: 'o par da credencial acima',
  },
  {
    nome: 'OBJECT_STORAGE_KMS_KEY',
    // `<nome>:<32 bytes em base64>` e a forma que o KMS embutido do MinIO
    // exige. Sem ela o `compose.yaml` nem renderiza: ele usa
    // `${OBJECT_STORAGE_KMS_KEY:?}`. Ela e exigida pelo COMPOSE e nao por um
    // `requireEnv` do codigo, entao a conferencia do fim deste arquivo NAO a
    // cobre -- e por isso ela precisa estar nesta receita.
    gerar: (marca) => `${marca}:${randomBytes(32).toString('base64')}`,
    porque: 'chave do KMS embutido do MinIO; sem ela o envio de foto volta 501',
  },
  {
    nome: 'MAIL_WEBHOOK_SECRET',
    // `app-config.ts` recusa menos de 32 bytes, e tem razao: e a UNICA
    // autenticacao de um endpoint alcancavel da internet aberta. 24 bytes em
    // hexadecimal dao 48 caracteres, entao a marca pode ser curta sem que a
    // conta fique apertada.
    gerar: (marca) => `${marca}-webhook-${randomBytes(24).toString('hex')}`,
    porque: 'a unica autenticacao do webhook de entrega; minimo de 32 bytes',
  },
  {
    nome: 'TAG_CODE_KEY',
    // Hex de 64 caracteres: `app-config.ts` recusa qualquer outro tamanho.
    gerar: () => randomBytes(32).toString('hex'),
    porque: 'abre o `code_ciphertext` da tag (ADR-0004)',
  },
  {
    nome: 'TAG_CODE_INDEX_KEY',
    // Sorteada SEPARADAMENTE da de cima, e nao por estetica: `app-config.ts`
    // recusa a subida com as duas iguais (ADR-0004, Emenda 1), porque a mesma
    // chave no indice e no envelope faria um dump entregar o codigo da tag.
    gerar: () => randomBytes(32).toString('hex'),
    porque: 'o indice cego de `code_hash`; DIFERENTE da de cima, por exigencia',
  },
  {
    nome: 'IP_HMAC_KEY',
    // Ao menos 32 bytes depois de decodificar o base64, e a aplicacao confere
    // na subida: hash de IP sem chave secreta e o IP em claro com um passo a
    // mais -- o espaco do IPv4 inteiro quebra em minutos (SEC-010).
    gerar: () => randomBytes(32).toString('base64'),
    porque: 'chave do HMAC de endereco IP (SEC-010)',
  },
  {
    nome: 'JWT_ACTIVE_PRIVATE_KEY',
    gerar: () => chaveRsaEmBase64(),
    porque: 'assina todo token de acesso em circulacao (ADR-0002)',
  },
  {
    nome: 'JWT_NEXT_PRIVATE_KEY',
    gerar: () => chaveRsaEmBase64(),
    porque: 'a chave de rotacao, publicada no JWKS junto com a ativa',
  },
  {
    nome: 'FCM_PROJECT',
    // NAO PARECE um projeto de verdade, de proposito: so e lida com
    // `PUSH_TRANSPORT=fcm`, e se um dia este ambiente rodar com `fcm` o envio
    // precisa falhar dizendo que o projeto nao existe -- e nao acertar o
    // projeto de alguem.
    gerar: (marca) => `projeto-${marca}-que-nao-existe`,
    porque: 'so lida com PUSH_TRANSPORT=fcm; aqui existe para nao autenticar',
  },
  {
    nome: 'SECRET_STORE_PROJECT',
    // So e EXIGIDA em prod/preprod, onde os segredos vem do gerenciador
    // (ADR-0022). Em `dev` nenhum segredo e buscado, e este valor jamais e
    // usado. Ele esta aqui porque a conferencia do fim deste arquivo conta
    // `requireEnv('NOME')` por TEXTO e nao conhece condicional -- e isso e de
    // proposito: ensina-la a entender `if` faria dela uma analise de fluxo, e
    // analise de fluxo incompleta aprova o que nao entende.
    gerar: (marca) => `projeto-${marca}-que-nao-existe`,
    porque: 'so lida em prod/preprod; aqui existe para nao apontar para nuvem',
  },
];

/**
 * As variaveis que ficam VAZIAS de proposito, e que este arquivo nunca
 * preenche.
 *
 * A lista e curta e cada linha tem o mesmo formato de motivo: preencher
 * esconderia alguma coisa. Ela nao e "o resto" -- e uma decisao, e o comentario
 * correspondente no `.env.example` e a outra metade dela.
 */
export const VAZIAS_DE_PROPOSITO = Object.freeze({
  MAIL_API_TOKEN:
    'com `smtp` ou `log` o token nao e lido NEM BUSCADO (transporte-de-email.ts). ' +
    'Preenche-lo aqui esconderia a subida que o desenvolvedor de verdade faz -- ' +
    'foi exatamente isso que cegou o portao ate 29/09/2026.',
  SENTRY_DSN: 'vazio DESLIGA o envio sem quebrar a aplicacao, e e o padrao querido em dev.',
  FCM_SERVICE_ACCOUNT_JSON: 'credencial de nuvem de verdade; so existe com `PUSH_TRANSPORT=fcm`.',
  CAPTCHA_SITE_KEY: 'chave de servico externo; vazia desliga o desafio em dev.',
});

/**
 * Exigidas pelo TEXTO do codigo, e NAO pelo ambiente que se esta montando.
 *
 * `lerVariaveisExigidas` conta `requireEnv('NOME')` por TEXTO e nao conhece
 * condicional. O preco dessa cegueira, ate 29/09/2026, era um valor falso para
 * calar a conferencia; e um valor falso foi exatamente o que deixou a suite
 * verde com a subida real quebrada.
 *
 * A saida nao e afrouxar a conferencia: e dizer QUAL ramo este ambiente toma, e
 * deixar a conferencia cobrar o nome de volta assim que o ramo mudar. Cada
 * entrada traz o predicado, em JavaScript, sobre o ambiente JA RENDERIZADO.
 */
export const DISPENSADAS_PELO_RAMO_NAO_TOMADO = [
  {
    nome: 'MAIL_API_TOKEN',
    // O gemeo de `exigeTokenDoProvedor` em `src/shared/config/transporte-de-email.ts`.
    // Escrito aqui porque este arquivo e `.mjs` e nao importa TypeScript; se um
    // dia os dois discordarem, quem acusa e a subida `postmark` de
    // `verificar-subida-da-api.mjs`, que exige a RECUSA por este nome.
    dispensavel: (ambiente) => (ambiente['MAIL_TRANSPORT'] ?? 'smtp') !== 'postmark',
    porque:
      'o token do provedor so e lido com MAIL_TRANSPORT=postmark (ADR-0009). ' +
      'Com `smtp` ele fica VAZIO de proposito: preenche-lo esconderia a subida ' +
      'que o desenvolvedor de verdade faz.',
  },
];

/** Os valores da receita, ja gerados, para uma marca de descartabilidade. */
export function segredosDescartaveis(marca) {
  return Object.fromEntries(RECEITA.map(({ nome, gerar }) => [nome, gerar(marca)]));
}

/** As linhas `NOME=valor` de um texto de `.env`, sem comentario. */
export function lerAmbiente(texto) {
  return Object.fromEntries(
    texto
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

/**
 * Substitui a linha de `chave`, ou a acrescenta se ela nao existir.
 *
 * O resto do arquivo sai BYTE POR BYTE como entrou: comentario, ordem e linha
 * em branco sao o que faz o `.env.example` ensinar alguma coisa, e um gerador
 * que reescreve o arquivo inteiro apaga isso na primeira execucao.
 */
export function aplicar(texto, chave, valor) {
  const linha = `${chave}=${valor}`;
  const expressao = new RegExp(`^${chave}=.*$`, 'm');
  return expressao.test(texto) ? texto.replace(expressao, linha) : `${texto}\n${linha}`;
}

/**
 * Cada `requireEnv('X')` do codigo tem valor nao vazio neste ambiente?
 *
 * Devolve os nomes que faltam, ja descontadas as dispensas do ramo nao tomado e
 * as que quem chama declarou faltantes de proposito. A ausencia precisa derrubar
 * quem chama NOMEANDO a variavel, em vez de deixar a pilha subir e morrer em
 * loop de reinicio dez linhas abaixo do passo que de fato falhou.
 */
export function exigidasQueFaltam({ ambiente, exigidas, faltandoDeProposito = [] }) {
  const dispensadas = new Set(
    DISPENSADAS_PELO_RAMO_NAO_TOMADO.filter((d) => d.dispensavel(ambiente)).map((d) => d.nome),
  );
  const deProposito = new Set(faltandoDeProposito);
  return exigidas.filter(
    (v) => (ambiente[v] ?? '').trim() === '' && !dispensadas.has(v) && !deProposito.has(v),
  );
}
