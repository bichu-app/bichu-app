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

/** O nome e o unico valor que ligam o desafio de desenvolvimento do painel. */
export const VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO = 'CAPTCHA_DESENVOLVIMENTO_LOCAL';

/** Host que so resolve na propria maquina: `localhost`, loopback, `*.localhost` e `*.test`. */
export function ehHostLocal(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')
  );
}

/**
 * QA, 28/09: o desafio de desenvolvimento do login do painel (ver
 * `admin-access/adapters/external/captcha-de-desenvolvimento-local.ts`) so
 * existe na pilha local. Devolve o motivo da recusa, ou `undefined`.
 *
 * A variavel PRESENTE ja e o gatilho, com qualquer valor: uma
 * `CAPTCHA_DESENVOLVIMENTO_LOCAL` num ambiente hospedado e engano de
 * configuracao mesmo quando o valor nao ligaria o modo, e quem le o log de um
 * boot que morreu precisa ver isso antes de alguem "consertar" o valor.
 */
export function recusaDoCaptchaDeDesenvolvimento(ambiente: NodeJS.ProcessEnv): string | undefined {
  const valor = ambiente[VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO];
  if (valor === undefined || valor === '') return undefined;
  const motivos: string[] = [];
  if (ambiente['NODE_ENV'] === 'production') motivos.push('NODE_ENV=production');
  const nome = ambiente['ENVIRONMENT'] ?? 'dev';
  if (nome !== 'dev') motivos.push(`ENVIRONMENT=${nome}`);
  for (const chave of ['PUBLIC_BASE_URL', 'ADMIN_ORIGIN']) {
    const url = ambiente[chave];
    if (url !== undefined && url !== '' && !ehHostLocal(url)) motivos.push(`${chave}=${url} (host que nao e local)`);
  }
  if (motivos.length === 0) return undefined;
  return (
    `${VARIAVEL_DO_CAPTCHA_DE_DESENVOLVIMENTO} presente com ${motivos.join(', ')}. ` +
    'O desafio de desenvolvimento aprova um token fixo no login do painel e so pode existir na ' +
    'pilha local. Tire a variavel do ambiente.'
  );
}

/**
 * Travas de subida. Chamadas por bin/api.ts e bin/worker.ts ANTES de ouvir
 * qualquer porta.
 */
export function assertSafeBoot(): void {
  // ANTES do desvio de produção abaixo, e de propósito: esta trava vale em todo
  // ambiente que não seja `dev`, e não só em produção. Homologação subindo sem
  // teto é a mesma classe de silêncio que fez a BICHUS-178 existir — a diferença
  // é que ali ninguém percebe, porque ninguém está martelando homologação.
  const ambiente = optionalEnv('ENVIRONMENT') ?? 'dev';
  if (optionalEnv('RATE_LIMIT_DRIVER') === 'disabled' && ambiente !== 'dev') {
    throw new Error(
      `RATE_LIMIT_DRIVER=disabled com ENVIRONMENT=${ambiente}. ` +
        'O contador desligado sempre permite, então TODA rota passa a servir sem ' +
        'teto e nada acusa — que é exatamente o estado que a BICHUS-178 conserta. ' +
        'Ele só é legítimo em `dev` e em teste. Use `memory` ou `postgres`.',
    );
  }

  const recusaDoCaptcha = recusaDoCaptchaDeDesenvolvimento(process.env);
  if (recusaDoCaptcha !== undefined) throw new Error(recusaDoCaptcha);

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
