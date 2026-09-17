/**
 * Processo HTTP: API `/v1` e as rotas HTML públicas.
 *
 * Uma imagem Docker, dois comandos de entrada (ADR-0001). Este e `worker.ts`
 * são o MESMO código com pontos de partida diferentes: uma imagem para
 * construir e testar, dois processos para operar. É o que torna o passo 3 da
 * §16 uma questão de subir a mesma imagem com outro comando.
 *
 * ESQUELETO. Nenhuma funcionalidade aqui; a composição entra com a
 * implementação.
 */
import { assertSafeBoot, requireEnv } from '../shared/config/env.js';

export async function main(): Promise<void> {
  // Primeira coisa, antes de ouvir qualquer porta: as travas da §11.2.
  assertSafeBoot();

  // Falha ruidosa e cedo, com o nome da variável, em vez de erro obscuro no
  // primeiro pedido que precisar dela.
  requireEnv('DATABASE_URL');
  requireEnv('PUBLIC_BASE_URL');
  requireEnv('API_BASE_URL');
  requireEnv('MEDIA_PUBLIC_BASE_URL');
  requireEnv('TOKEN_ISSUER');

  throw new Error('Não implementado: esqueleto da Onda 0.');
}
