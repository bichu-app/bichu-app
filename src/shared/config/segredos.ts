/** Os segredos de runtime, e o passo que os coloca no ambiente antes da subida. */
import type { NomeDeSegredo, SecretProvider } from '../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../ports/secret-provider.js';
import { ehAmbienteHospedado } from './ambiente-hospedado.js';
import {
  exigeTokenDoProvedor,
  transporteDeEmailDoAmbiente,
} from './transporte-de-email.js';

/** Os segredos que saem do arquivo e passam a viver no gerenciador. */
export const SEGREDOS_DE_RUNTIME: readonly NomeDeSegredo[] = [
  /** Usuário e senha do banco estão dentro da URL. */
  'DATABASE_URL',
  /** SEC-010: hash de IP sem chave é o IP em claro com um passo a mais. */
  'IP_HMAC_KEY',
  /** Abre o `code_ciphertext`, que existe para reimprimir o QR (ADR-0004). */
  'TAG_CODE_KEY',
  /** O indice cego de `code_hash` (ADR-0004, Emenda 1, §3.1). */
  'TAG_CODE_INDEX_KEY',
  /** Assina todo token de acesso em circulação (ADR-0002). */
  'JWT_ACTIVE_PRIVATE_KEY',
  /**
   * Exigida em ambiente hospedado pelo `exigeChaveDeRotacao`, pelo mesmo predicado
   * que decide se esta lista é buscada no gerenciador.
   */
  'JWT_NEXT_PRIVATE_KEY',
  /**
   * As duas credenciais de armazenamento andam juntas; uma só assina o que o
   * armazenamento recusa, e a falha apareceria no primeiro envio de foto.
   */
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  /** O token de servidor do Postmark (ADR-0009). */
  'MAIL_API_TOKEN',
];

/** Os segredos que ESTA subida vai resolver. */
export function segredosDeRuntime(
  transporteDeEmail: string = transporteDeEmailDoAmbiente(),
  declarados: readonly NomeDeSegredo[] = SEGREDOS_DE_RUNTIME,
): readonly NomeDeSegredo[] {
  if (exigeTokenDoProvedor(transporteDeEmail)) return declarados;
  return declarados.filter((nome) => nome !== 'MAIL_API_TOKEN');
}

/** Quando os segredos vêm do gerenciador, e quando vêm do ambiente. */
export function exigeGerenciadorDeSegredos(environment: string): boolean {
  return ehAmbienteHospedado(environment);
}

/** Resolve todos os nomes e os escreve em `process.env`. */
export async function resolverSegredos(
  provider: SecretProvider,
  nomes: readonly NomeDeSegredo[] = segredosDeRuntime(),
): Promise<void> {
  const resolvidos = new Map<NomeDeSegredo, string>();
  const faltando: string[] = [];

  for (const nome of nomes) {
    try {
      resolvidos.set(nome, await provider.obter(nome));
    } catch (erro) {
      if (erro instanceof SegredoIndisponivelError) {
        faltando.push(`  - ${erro.nome}: ${erro.message.slice(erro.message.indexOf('. ') + 2)}`);
        continue;
      }
      throw new SegredoIndisponivelError(
        nome,
        `O adaptador (${provider.fonte}) falhou sem dizer qual segredo era. ` +
          `Causa: ${erro instanceof Error ? erro.message : 'desconhecida'}`,
      );
    }
  }

  if (faltando.length > 0) {
    throw new Error(
      `Não foi possível ler ${String(faltando.length)} segredo(s) de runtime em ` +
        `${provider.fonte}. A aplicação NÃO sobe sem eles:\n${faltando.join('\n')}\n` +
        `Cada nome acima é, ao mesmo tempo, o nome da variável de ambiente e o ` +
        `identificador do segredo no gerenciador — eles são iguais de propósito ` +
        `(ADR-0022). Veja .env.example e docs/07-devops.md §6.`,
    );
  }

  for (const [nome, valor] of resolvidos) process.env[nome] = valor;
}
