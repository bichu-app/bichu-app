import { configuracao } from '../config.ts';
import { handleDoInstagram } from '../rede/dominio/links.ts';

const HOST_LOCAL = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|home\.arpa|corp|test|invalid|example)$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const CONTROLE_BIDIRECIONAL = /[\u202A-\u202E\u2066-\u2069]/;

const SEM_ESPACO = 'Confira o endereço: ele não pode ter espaço.';

function temEspacoOuControle(texto: string): boolean {
  return [...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
}

/** O exemplo que as mensagens mostram. */
export const EXEMPLO_DO_INSTAGRAM = `${configuracao.urlDoPerfilDoInstagram.replace(/\/+$/, '')}/bichu.app`;

/** A base do perfil mais os 30 do handle, com folga. */
export const LIMITE_DA_URL_DO_INSTAGRAM = 120;

export type CodigoDoInstagram =
  | 'bidi_control'
  | 'instagram_url_length'
  | 'instagram_url_invalid'
  | 'instagram_url_not_https'
  | 'instagram_url_has_credentials'
  | 'instagram_url_ip_literal'
  | 'instagram_url_local_host'
  | 'instagram_url_not_instagram';

/**
 * O primeiro motivo de recusa da URL do Instagram, como o servidor; `null` quando
 * passa.
 */
export function recusaDoInstagram(valor: string): CodigoDoInstagram | null {
  if (CONTROLE_BIDIRECIONAL.test(valor)) return 'bidi_control';
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LIMITE_DA_URL_DO_INSTAGRAM) return 'instagram_url_length';
  if (temEspacoOuControle(texto)) return 'instagram_url_invalid';
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return 'instagram_url_not_https';
  }
  if (url.protocol !== 'https:' || !texto.startsWith('https://')) return 'instagram_url_not_https';
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) {
    return 'instagram_url_has_credentials';
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '') return 'instagram_url_invalid';
  if (host.startsWith('[') || IPV4.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) {
    return 'instagram_url_ip_literal';
  }
  if (!host.includes('.') || HOST_LOCAL.test(host)) return 'instagram_url_local_host';
  if (!/^(?:www\.|m\.)?instagram\.com$/.test(host)) return 'instagram_url_not_instagram';
  if (handleDoInstagram(texto) === null) return 'instagram_url_invalid';
  return null;
}

/** `https://` + 253 do dominio. */
export const LIMITE_DO_SITE = 261;

export type CodigoDoSite =
  | 'bidi_control'
  | 'site_url_length'
  | 'site_url_invalid'
  | 'site_url_not_https'
  | 'site_url_has_credentials'
  | 'site_url_ip_literal'
  | 'site_url_local_host';

/**
 * O primeiro motivo de recusa do site do parceiro, como o servidor; `null` quando
 * passa.
 */
export function recusaDoSite(valor: string): CodigoDoSite | null {
  if (CONTROLE_BIDIRECIONAL.test(valor)) return 'bidi_control';
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LIMITE_DO_SITE) return 'site_url_length';
  if (temEspacoOuControle(texto)) return 'site_url_invalid';
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return 'site_url_not_https';
  }
  if (url.protocol !== 'https:' || !texto.startsWith('https://')) return 'site_url_not_https';
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) {
    return 'site_url_has_credentials';
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '') return 'site_url_invalid';
  if (host.startsWith('[') || IPV4.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) {
    return 'site_url_ip_literal';
  }
  if (!host.includes('.') || HOST_LOCAL.test(host)) return 'site_url_local_host';
  return null;
}

/** O host que o servidor vai guardar, para a previa do campo. */
export function hostDoSite(valor: string): string | null {
  if (recusaDoSite(valor) !== null) return null;
  return new URL(valor.trim()).hostname.toLowerCase().replace(/\.+$/, '');
}

/** O texto de cada recusa do Instagram. */
export const MENSAGEM_DO_INSTAGRAM: Record<CodigoDoInstagram, string> = {
  bidi_control: 'O endereço tem caracteres invisíveis. Apague e digite de novo.',
  instagram_url_length: `Use até ${String(LIMITE_DA_URL_DO_INSTAGRAM)} caracteres.`,
  instagram_url_not_https: `Cole o endereço completo do perfil. Por exemplo: ${EXEMPLO_DO_INSTAGRAM}`,
  instagram_url_has_credentials: 'Tire o usuário e a senha do endereço.',
  instagram_url_ip_literal: 'Use o endereço do perfil, e não um número de IP.',
  instagram_url_local_host: 'O endereço precisa ser de um site público.',
  instagram_url_not_instagram: 'O endereço precisa ser de um perfil do instagram.com.',
  instagram_url_invalid: `Falta o perfil no fim do endereço. Por exemplo: ${EXEMPLO_DO_INSTAGRAM}`,
};

/** A frase da recusa LOCAL do Instagram, ou `null` quando o endereco passa. */
export function mensagemDoInstagram(valor: string): string | null {
  const code = recusaDoInstagram(valor);
  if (code === null) return null;
  const texto = valor.trim();
  if (code === 'instagram_url_not_https' && texto.toLowerCase().startsWith('http://')) {
    return 'Troque http:// por https://.';
  }
  if (code === 'instagram_url_invalid' && temEspacoOuControle(texto)) {
    return SEM_ESPACO;
  }
  return MENSAGEM_DO_INSTAGRAM[code];
}

/** O texto de cada recusa do site do parceiro. */
export const MENSAGEM_DO_SITE: Record<CodigoDoSite, string> = {
  bidi_control: 'O endereço tem caracteres invisíveis. Apague e digite de novo.',
  site_url_length: `Use até ${String(LIMITE_DO_SITE)} caracteres.`,
  site_url_not_https: 'Escreva o endereço completo do site, começando com https://.',
  site_url_has_credentials: 'Tire o usuário e a senha do endereço.',
  site_url_ip_literal: 'Use o endereço do site, e não um número de IP.',
  site_url_local_host: 'O endereço precisa ser de um site público.',
  site_url_invalid: SEM_ESPACO,
};

/** A frase da recusa LOCAL do site do parceiro, ou `null` quando o endereco passa. */
export function mensagemDoSite(valor: string): string | null {
  const code = recusaDoSite(valor);
  if (code === null) return null;
  const texto = valor.trim();
  if (code === 'site_url_not_https' && texto.toLowerCase().startsWith('http://')) {
    return 'Troque http:// por https://.';
  }
  if (code === 'site_url_invalid' && !temEspacoOuControle(texto)) {
    return MENSAGEM_DO_SITE.site_url_not_https;
  }
  return MENSAGEM_DO_SITE[code];
}
