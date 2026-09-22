/**
 * O adaptador local da porta `SecretProvider`, e a escolha entre os dois.
 *
 * ## O adaptador de variável de ambiente
 *
 * É o que roda em `dev`, em teste e no `compose.yaml`: o valor já está em
 * `process.env`, posto ali pelo `env_file` a partir do arquivo fora do git
 * (docs/07-devops.md §6). Ele parece trivial, e é — de propósito. Ele existe
 * para que **a regra do ADR-0012 continue valendo**: nenhuma porta entra em
 * produção com um adaptador só, porque um adaptador só é um acoplamento com
 * nome bonito. E é ele que garante que `npm test` e o compose não precisem de
 * nuvem nenhuma.
 *
 * Ele não é `requireEnv` com outro nome: `requireEnv` lança `Error` genérico, e
 * a porta exige `SegredoIndisponivelError` com o campo `nome`, para que quem
 * resolve sete segredos consiga dizer **quais** faltaram em vez de morrer no
 * primeiro. A mensagem continua citando a variável, que é a regra da §11.2.
 *
 * ## A escolha
 *
 * `criarSecretProvider` é o único lugar que conhece os dois adaptadores. Ela
 * mora aqui, em `adapters/external/`, e não em `shared/config/`, por uma razão
 * que é a regra dura do projeto e não preferência: **nome de provedor não entra
 * fora de `adapters/external/`** — e o `import` do arquivo do GCP carrega o nome
 * dele no caminho. Um `if` sobre o ambiente escrito em `config/` colocaria a
 * marca do provedor na camada que o portão de portabilidade varre.
 */
import { requireEnv, optionalEnv } from '../../config/env.js';
import type { NomeDeSegredo, SecretProvider } from '../../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../../ports/secret-provider.js';
import { exigeGerenciadorDeSegredos } from '../../config/segredos.js';
import { criarSecretProviderGerenciado } from './gcp-secret-manager.js';

/** `latest` é o padrão; ver o porquê em `GcpSecretManagerConfig.versao`. */
const VERSAO_PADRAO = 'latest';

export function criarSecretProviderDeAmbiente(): SecretProvider {
  return {
    fonte: 'variável de ambiente (arquivo fora do git, via env_file)',

    obter(nome: NomeDeSegredo): Promise<string> {
      const valor = process.env[nome];
      // String vazia é ausência, e é assim que `optionalEnv` já a trata. A
      // alternativa seria subir com `IP_HMAC_KEY=` e descobrir no primeiro
      // hash de IP — exigência 3 da porta.
      if (valor === undefined || valor === '') {
        return Promise.reject(
          new SegredoIndisponivelError(
            nome,
            'A variável de ambiente não está definida, ou está vazia. ' +
              'Veja .env.example e a §11.2 de docs/03-arquitetura.md.',
          ),
        );
      }
      // A falha sai como promessa REJEITADA, nunca como exceção síncrona: a
      // porta declara `Promise<string>`, e quem trata com `.catch()` nunca
      // chega a instalar o `catch` se a função lançar antes de devolver. É a
      // mesma razão escrita em `aes-gcm-secret-cipher.ts`.
      return Promise.resolve(valor);
    },
  };
}

/**
 * O adaptador do ambiente, ou o do gerenciador em `prod` e `preprod`.
 *
 * `SECRET_STORE_PROJECT` é exigida com `requireEnv` e com o nome LITERAL, e não
 * é opcional com padrão: um padrão aqui apontaria para um projeto de nuvem
 * escrito em código, que é a proibição 1 da §11.1 e o que o portão de
 * portabilidade reprova. Faltando ela, a subida morre citando o nome — em vez
 * de tentar a rede e morrer com `403` daqui a cinco segundos, dizendo a coisa
 * errada.
 */
export function criarSecretProvider(environment: string): SecretProvider {
  if (!exigeGerenciadorDeSegredos(environment)) return criarSecretProviderDeAmbiente();

  return criarSecretProviderGerenciado({
    projeto: requireEnv('SECRET_STORE_PROJECT'),
    versao: optionalEnv('SECRET_STORE_VERSION') ?? VERSAO_PADRAO,
  });
}
