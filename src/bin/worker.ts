/**
 * Processo de trabalho: alerta, lembrete, e-mail, processamento de imagem e
 * consumação de transferência.
 *
 * Mesma imagem de `api.ts`, outro comando. Consome a tabela `jobs` com
 * `FOR UPDATE SKIP LOCKED`, que já é seguro para várias instâncias — por isso o
 * passo 3 da §16 não exige mudança de código, só do lugar onde roda.
 *
 * `WORKER_IMAGE_CONCURRENCY=1` não é ajuste fino: em `e2-small` com 2 GB, o
 * redimensionamento de uma foto de 10 MB aloca centenas de megabytes de uma vez,
 * e quem o sistema mata quando falta memória é o processo maior, que quase
 * sempre é o **banco**. O sintoma aparece como "o banco caiu sozinho", sem
 * relação aparente com upload (ADR-0013).
 *
 * ESQUELETO.
 */
import { assertSafeBoot, requireEnv } from '../shared/config/env.js';

export async function main(): Promise<void> {
  assertSafeBoot();
  requireEnv('DATABASE_URL');
  requireEnv('PUBLIC_BASE_URL');

  throw new Error('Não implementado: esqueleto da Onda 0.');
}
