/**
 * O desafio do login administrativo (D41): reCAPTCHA Enterprise, pontuacao,
 * acao `admin_login` (a mesma que o servidor confere). Carregado so no
 * documento `/entrar/`.
 */
import { configuracao } from '../config.ts';

export const ACAO_DO_CAPTCHA = 'admin_login';

interface GrecaptchaEnterprise {
  ready(fn: () => void): void;
  execute(chave: string, opcoes: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: { enterprise?: GrecaptchaEnterprise };
  }
}

export type ObterTokenDoCaptcha = () => Promise<string>;

export class CaptchaIndisponivel extends Error {}

/**
 * Sem chave de site no desenvolvimento local, o painel manda um token que o
 * servidor sempre recusa: o servidor nao tem modo que aprove sem avaliar, e o
 * caminho `403 captcha-rejected` continua exercitado de ponta a ponta. No build
 * de producao, chave ausente e verificacao que nao carregou (1.9).
 */
export const TOKEN_DE_DESENVOLVIMENTO = 'desenvolvimento-sem-chave-de-captcha';

let carregamento: Promise<GrecaptchaEnterprise> | undefined;

function carregarScript(chave: string): Promise<GrecaptchaEnterprise> {
  carregamento ??= new Promise<GrecaptchaEnterprise>((resolver, rejeitar) => {
    const script = document.createElement('script');
    script.src = `${configuracao.urlDoScriptDoCaptcha}?render=${encodeURIComponent(chave)}`;
    script.async = true;
    script.onload = () => {
      const g = window.grecaptcha?.enterprise;
      if (!g) {
        rejeitar(new CaptchaIndisponivel('grecaptcha ausente depois do carregamento'));
        return;
      }
      g.ready(() => resolver(g));
    };
    script.onerror = () => rejeitar(new CaptchaIndisponivel('o script do reCAPTCHA nao carregou'));
    document.head.appendChild(script);
  }).catch((erro: unknown) => {
    carregamento = undefined;
    throw erro;
  });
  return carregamento;
}

export function criarObtencaoDoToken(chave: string | undefined, desenvolvimento: boolean): ObterTokenDoCaptcha {
  if (!chave) {
    return desenvolvimento
      ? () => Promise.resolve(TOKEN_DE_DESENVOLVIMENTO)
      : () => Promise.reject(new CaptchaIndisponivel('VITE_CAPTCHA_SITE_KEY ausente'));
  }
  return async () => {
    const g = await carregarScript(chave);
    try {
      return await g.execute(chave, { action: ACAO_DO_CAPTCHA });
    } catch {
      throw new CaptchaIndisponivel('o reCAPTCHA nao devolveu token');
    }
  };
}

/** Comeca a baixar o script cedo, para o primeiro "Entrar" nao esperar. */
export function preCarregar(chave: string | undefined): void {
  if (chave) void carregarScript(chave).catch(() => undefined);
}
