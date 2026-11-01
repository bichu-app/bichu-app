import { requireEnv, optionalEnv } from '../../config/env.js';
import type { NomeDeSegredo, SecretProvider } from '../../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../../ports/secret-provider.js';
import { exigeGerenciadorDeSegredos } from '../../config/segredos.js';
import { criarSecretProviderGerenciado } from './gcp-secret-manager.js';

const VERSAO_PADRAO = 'latest';

export function criarSecretProviderDeAmbiente(): SecretProvider {
  return {
    fonte: 'variável de ambiente (arquivo fora do git, via env_file)',

    obter(nome: NomeDeSegredo): Promise<string> {
      const valor = process.env[nome];
      if (valor === undefined || valor === '') {
        return Promise.reject(
          new SegredoIndisponivelError(
            nome,
            'A variável de ambiente não está definida, ou está vazia. ' +
              'Veja .env.example e a §11.2 de docs/03-arquitetura.md.',
          ),
        );
      }
      return Promise.resolve(valor);
    },
  };
}

/** O adaptador do ambiente, ou o do gerenciador em `prod` e `preprod`. */
export function criarSecretProvider(environment: string): SecretProvider {
  if (!exigeGerenciadorDeSegredos(environment)) return criarSecretProviderDeAmbiente();

  return criarSecretProviderGerenciado({
    projeto: requireEnv('SECRET_STORE_PROJECT'),
    versao: optionalEnv('SECRET_STORE_VERSION') ?? VERSAO_PADRAO,
  });
}
