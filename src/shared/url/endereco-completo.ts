import type { ProblemFieldError } from '../http/problem.js';

const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const HOST_LOCAL = /^(?:localhost|.*\.(?:local|internal|localdomain|home\.arpa))$/;

/** O teto padrao. Quem precisa de outro passa o proprio. */
export const TETO_DO_ENDERECO = 2048;

export interface OpcoesDoEndereco {
  /** O teto de caracteres. Padrao: [TETO_DO_ENDERECO]. */
  readonly teto?: number;
  /**
   * O prefixo dos `code`, para a recusa nomear o campo (`site_url_not_https`,
   * `instagram_url_not_https`).
   */
  readonly prefixo: string;
}

/** Confere um endereco completo de site: `https://`, publico, sem credencial. */
export function errosDoEnderecoCompleto(
  campo: string,
  valor: string,
  opcoes: OpcoesDoEndereco,
): ProblemFieldError[] {
  const teto = opcoes.teto ?? TETO_DO_ENDERECO;
  const recusa = (sufixo: string, message: string): ProblemFieldError[] => [
    { field: campo, code: `${opcoes.prefixo}_${sufixo}`, message },
  ];

  if (CONTROLE_BIDIRECIONAL.test(valor)) {
    return recusa('bidi_control', 'O texto tem um caractere de controle de direção.');
  }
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > teto) {
    return recusa('length', `De 1 a ${String(teto)} caracteres.`);
  }
  if ([...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
    return recusa('invalid', 'O endereço não pode ter espaço.');
  }

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return recusa('not_https', 'Escreva o endereço completo, começando com https://.');
  }

  if (url.protocol !== 'https:' || !texto.startsWith('https://')) {
    return texto.toLowerCase().startsWith('http://')
      ? recusa('not_https', 'Troque http:// por https://.')
      : recusa('not_https', 'Escreva o endereço completo, começando com https://.');
  }
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) {
    return recusa('has_credentials', 'O endereço não pode ter usuário e senha.');
  }

  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '') return recusa('invalid', 'Escreva o endereço completo, começando com https://.');
  if (host.startsWith('[') || IPV4.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) {
    return recusa('ip_literal', 'Use o endereço do site, e não um número de IP.');
  }
  if (!host.includes('.') || HOST_LOCAL.test(host)) {
    return recusa('local_host', 'O endereço precisa ser de um site público.');
  }
  return [];
}

/**
 * O host de um endereco que [errosDoEnderecoCompleto] ja aprovou, em minusculas e
 * sem o ponto final.
 */
export function hostDoEndereco(valor: string): string {
  return new URL(valor.trim()).hostname.toLowerCase().replace(/\.+$/, '');
}
