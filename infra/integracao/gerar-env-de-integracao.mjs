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
import { readFileSync, writeFileSync } from 'node:fs';

import { lerVariaveisExigidas, autoteste } from './variaveis-exigidas.mjs';
// A receita de valores descartaveis mora FORA da integracao desde 29/09/2026,
// porque ela nao e da integracao: as mesmas chaves sao o que `make env-dev`
// poe na maquina de quem desenvolve e o que o `ci.yml` poe no runner. Eram
// tres copias, e a divergencia entre elas foi o que cegou o portao no defeito
// do token do provedor. Ver o topo de `infra/segredos-descartaveis.mjs`.
import {
  DISPENSADAS_PELO_RAMO_NAO_TOMADO,
  aplicar,
  exigidasQueFaltam,
  lerAmbiente,
  segredosDescartaveis,
} from '../segredos-descartaveis.mjs';

const MARCA = 'integracao-descartavel';

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
  return {
    // As chaves, senhas e credenciais vem da receita unica. Senha do Postgres e
    // `DATABASE_URL` inclusas, JUNTAS: a senha viaja dentro da URL, e trocar so
    // uma das duas deixa a falha sair como "password authentication failed",
    // que ninguem associa a este arquivo.
    ...segredosDescartaveis(MARCA),

    ENVIRONMENT: 'dev',
    NODE_ENV: 'development',

    POSTGRES_USER: 'bichu',
    POSTGRES_DB: 'bichu',

    // Armazenamento de objeto AGORA SOBE nesta pilha (BICHUS-245). Ate aqui
    // este valor apontava para um host que nao resolve, e o comentario dizia
    // que nenhum caso falava com armazenamento -- o que era verdade, e era o
    // buraco: os 358 casos de integracao nunca subiram um byte de foto, entao
    // "a funcao de envio nunca foi chamada" nao tinha como ser pega por
    // ninguem.
    //
    // `objeto` e o nome do servico em `compose.integracao.yaml`, que e a mesma
    // grafia do `.env.example`. Como em `db` e `mail`, isso nao e coincidencia
    // conveniente: e o que permite a pilha efemera usar o ambiente da
    // aplicacao sem traducao, e e por isso que nenhuma porta precisa ser
    // publicada no hospedeiro.
    OBJECT_STORAGE_ENDPOINT: 'http://objeto:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    // Os MESMOS nomes de `.env.example`, e nao nomes de teste. O caso de
    // seguranca afirma coisas sobre a politica dos baldes; afirma-las sobre
    // baldes com outro nome seria provar a configuracao de um ambiente que
    // nao existe.
    OBJECT_BUCKET_PRIVATE: 'bichu-media-private',
    OBJECT_BUCKET_PUBLIC: 'bichu-media-public',

    MAIL_TRANSPORT: 'smtp',
    MAIL_HOST: 'mail',
    MAIL_PORT: '1025',
    // VAZIO, e o vazio E O TESTE. Ate 29/09/2026 esta linha preenchia um token
    // falso, e era ela que cegava o portao: a pilha de integracao subia com um
    // valor que a pilha de quem desenvolve nao tem, entao a suite ficava verde
    // enquanto `make up` pelo caminho do README matava `api` e `worker` por
    // `MAIL_API_TOKEN` vazio COM `MAIL_TRANSPORT=smtp`. O defeito atravessou um
    // `fechar-integracao` verde por causa desta unica linha.
    //
    // Com `smtp` o token nao e lido por ninguem (`exigeTokenDoProvedor`), entao
    // preenche-lo so servia para esconder a unica coisa que precisava aparecer.
    // A conferencia de variaveis exigidas logo abaixo sabe disto, e a excecao
    // dela e CONDICIONADA ao transporte: com `postmark` o token volta a ser
    // cobrado aqui.
    MAIL_API_TOKEN: '',

    // `log`: nada sai do processo. O projeto NAO existe, e isso e de proposito
    // -- se um dia esta pilha rodar com `fcm`, o envio precisa falhar dizendo
    // que o projeto nao existe, e nao acertar o projeto de alguem.
    PUSH_TRANSPORT: 'log',

    // Os identificadores das chaves, e nao as chaves: eles nomeiam ESTA pilha
    // no JWKS, entao ficam aqui e nao na receita compartilhada.
    JWT_ACTIVE_KID: `${MARCA}-ativa`,
    JWT_NEXT_KID: `${MARCA}-rotacao`,

    // A BICHUS-178 tornou esta exigida, sem padrao embutido. `postgres` e o que
    // a suite de concorrencia precisa: o driver em memoria nao atravessa
    // processo e nao prova nada sobre o balde compartilhado.
    RATE_LIMIT_DRIVER: 'postgres',
    APP_INSTANCES: '1',

    OPENAPI_SPEC_PATH: 'api/openapi.yaml',
  };
}

export function gerar({
  exemplo = '.env.example',
  destino = '.env.integracao',
  sobrepor = {},
  faltandoDeProposito = [],
} = {}) {
  console.log(autoteste());

  let texto = readFileSync(exemplo, 'utf8');
  const valores = valoresDeIntegracao();
  // `sobrepor` vem depois dos valores padrao, e existe para UM uso: a segunda
  // subida de `verificar-subida-da-api.mjs`, que precisa do mesmo ambiente em
  // `MAIL_TRANSPORT=postmark` para provar que a subida RECUSA sem o token.
  const valoresFinais = { ...valores, ...sobrepor };
  for (const [chave, valor] of Object.entries(valoresFinais)) texto = aplicar(texto, chave, valor);

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
  const ambiente = lerAmbiente(texto);
  const dispensadas = new Map(
    DISPENSADAS_PELO_RAMO_NAO_TOMADO.filter((d) => d.dispensavel(ambiente)).map((d) => [
      d.nome,
      d.porque,
    ]),
  );
  // `faltandoDeProposito` existe para UM uso, e ele precisa do nome escrito:
  // o ambiente da RECUSA de `verificar-subida-da-api.mjs`, que e `postmark` SEM
  // token. Aquele ambiente e invalido de proposito -- provar que a subida
  // recusa exige gerar o arquivo que a faz recusar. Fora dali, variavel exigida
  // que falta continua derrubando a geracao nomeando a variavel.
  const faltando = exigidasQueFaltam({ ambiente, exigidas, faltandoDeProposito });
  if (faltando.length > 0) {
    throw new Error(
      `o ambiente de integracao nao preenche variavel exigida pelo codigo: ${faltando.join(', ')}. ` +
        'Se ela e gerada, acrescente uma entrada em RECEITA, em ' +
        'infra/segredos-descartaveis.mjs; se ela e topologia desta pilha, o ' +
        'lugar dela e valoresDeIntegracao(), aqui mesmo.',
    );
  }
  for (const [nome, porque] of dispensadas) {
    console.log(`  ${nome} fica VAZIA neste ambiente: ${porque}`);
  }
  return { destino, conferidas: exigidas.length };
}

if (process.argv[1]?.endsWith('gerar-env-de-integracao.mjs')) {
  const { destino, conferidas } = gerar();
  console.log(`${destino} gerado; ${conferidas} variaveis exigidas pelo codigo, todas preenchidas`);
}
