/**
 * Leitura de ambiente, com falha ruidosa.
 *
 * Regra da §11.2: **nenhuma variável obrigatória tem valor padrão embutido que
 * aponte para um provedor.** A ausência derruba a aplicação na subida, com o
 * nome da variável na mensagem — falha ruidosa é melhor do que um padrão
 * silencioso que funciona na máquina de quem escreveu e não em mais lugar
 * nenhum.
 *
 * As duas travas do fim do arquivo não são zelo: mecanismo de teste que
 * sobrevive em produção é porta dos fundos.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Veja .env.example e a §11.2 de docs/03-arquitetura.md.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === '' ? undefined : value;
}

export function boolEnv(name: string, fallback = false): boolean {
  const value = optionalEnv(name);
  return value === undefined ? fallback : value === 'true';
}

/**
 * Travas de subida. Chamadas por bin/api.ts e bin/worker.ts ANTES de ouvir
 * qualquer porta.
 */
export function assertSafeBoot(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  if (boolEnv('TEST_CLOCK_ENABLED')) {
    throw new Error(
      'TEST_CLOCK_ENABLED=true com NODE_ENV=production. ' +
        'O cabeçalho X-Test-Clock permitiria viajar no tempo em produção.',
    );
  }
  if (boolEnv('RATE_LIMIT_DISABLED')) {
    throw new Error(
      'RATE_LIMIT_DISABLED=true com NODE_ENV=production. ' +
        'Subir assim desliga a política inteira de docs/04-seguranca.md.',
    );
  }
  if (optionalEnv('RATE_LIMIT_DRIVER') === 'memory' && optionalEnv('APP_INSTANCES') !== '1') {
    throw new Error(
      'RATE_LIMIT_DRIVER=memory com mais de uma instância: cada instância conta ' +
        'o seu contador e todo limite dobra em silêncio. Use postgres (§16, passo 4).',
    );
  }
}
