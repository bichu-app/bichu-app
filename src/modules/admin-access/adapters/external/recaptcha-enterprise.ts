/**
 * O reCAPTCHA Enterprise do login administrativo (D41), por HTTP, sem SDK.
 *
 * **Este e o unico arquivo do produto que sabe que o desafio e do Google.**
 * Quem consome enxerga `VerificadorDeCaptcha`, que devolve uma nota ou nada.
 *
 * ## Por que Enterprise, e de onde vem a credencial
 *
 * E o transporte que `.env.example` ja declarava (`CAPTCHA_TRANSPORT`,
 * `CAPTCHA_SITE_KEY`, `CAPTCHA_PROJECT`), e que nenhum codigo lia. Enterprise
 * nao tem chave secreta: o servidor chama a API de avaliacao com o token da
 * conta de servico da VM, do servidor de metadados, pelo mesmo caminho do
 * Secret Manager (`shared/adapters/external/gcp-secret-manager.ts`). Nenhuma
 * chave de conta de servico em arquivo.
 *
 * ## O que ele faz quando nao consegue avaliar
 *
 * Devolve `undefined`, e o servico responde `403 captcha-rejected`. Sem
 * configuracao, o verificador e `captchaNaoConfigurado`, que tambem recusa
 * sempre. **Nao existe modo que aprove sem avaliar**: um desafio que se
 * desliga por variavel e um desafio que um dia sobe desligado.
 */
import {
  captchaNaoConfigurado,
  type VerificadorDeCaptcha,
} from '../../ports/verificador-de-captcha.js';
import { TOKEN_DA_CONTA_DE_SERVICO } from '../../../../shared/adapters/external/metadados-do-gcp.js';

const METADADOS = TOKEN_DA_CONTA_DE_SERVICO;
const API = 'https://recaptchaenterprise.googleapis.com/v1';
const TIMEOUT_MS = 5_000;
const MARGEM_DO_TOKEN_MS = 60_000;

export type Buscar = typeof globalThis.fetch;

export interface ConfiguracaoDoCaptcha {
  readonly transporte: string | undefined;
  readonly siteKey: string | undefined;
  readonly projeto: string | undefined;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function criarVerificadorDeCaptcha(
  configuracao: ConfiguracaoDoCaptcha,
  buscar: Buscar = globalThis.fetch,
): VerificadorDeCaptcha {
  const { transporte, siteKey, projeto } = configuracao;
  if (transporte !== 'recaptcha_enterprise' || siteKey === undefined || projeto === undefined) {
    return captchaNaoConfigurado;
  }

  let token: { valor: string; venceEm: number } | undefined;
  async function tokenDaInstancia(): Promise<string | undefined> {
    const agora = Date.now();
    if (token !== undefined && token.venceEm > agora) return token.valor;
    const resposta = await buscar(METADADOS, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) return undefined;
    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo) || typeof corpo['access_token'] !== 'string') return undefined;
    const expira = typeof corpo['expires_in'] === 'number' ? corpo['expires_in'] : 0;
    token = { valor: corpo['access_token'], venceEm: agora + Math.max(expira * 1000 - MARGEM_DO_TOKEN_MS, 0) };
    return token.valor;
  }

  return {
    async avaliar(tokenDoDesafio, acaoEsperada) {
      if (tokenDoDesafio === undefined || tokenDoDesafio === '') return undefined;
      try {
        const credencial = await tokenDaInstancia();
        if (credencial === undefined) return undefined;
        const resposta = await buscar(`${API}/projects/${encodeURIComponent(projeto)}/assessments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${credencial}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: { token: tokenDoDesafio, siteKey, expectedAction: acaoEsperada } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) return undefined;
        const corpo: unknown = await resposta.json();
        if (!ehObjeto(corpo)) return undefined;
        const propriedades = corpo['tokenProperties'];
        const analise = corpo['riskAnalysis'];
        if (!ehObjeto(propriedades) || propriedades['valid'] !== true) return undefined;
        // Token valido colhido para OUTRA acao (outra pagina do mesmo site) nao
        // serve aqui: e o reaproveitamento que a acao esperada existe para barrar.
        if (propriedades['action'] !== acaoEsperada) return undefined;
        if (!ehObjeto(analise) || typeof analise['score'] !== 'number') return undefined;
        return analise['score'];
      } catch {
        // Rede, tempo esgotado, JSON quebrado: nao deu para avaliar, e quem
        // decide o que isso significa e o servico (recusa).
        return undefined;
      }
    },
  };
}
