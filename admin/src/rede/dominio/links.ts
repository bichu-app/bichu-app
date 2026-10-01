/**
 * Os dois links do encontro (ADR-0027 item 22), com a MESMA regra do servidor
 * (`errosDoLinkDeIngresso` e `handleDoInstagram` em
 * `src/modules/network/domain/escrita-do-encontro.ts`). O painel confere
 * antes para dizer o motivo no campo; quem decide e o servidor, e as recusas
 * dele caem nos mesmos textos (por `code`).
 */

const HOST_LOCAL = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|home\.arpa|corp|test|invalid|example)$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const CONTROLE_BIDIRECIONAL = /[\u202A-\u202E\u2066-\u2069]/;

/** O servidor conta `texto.length` (unidades UTF-16) neste campo, e o `maxLength` nativo conta igual. */
export const LIMITE_DO_LINK_DO_CONVITE = 500;

export type CodigoDoLink =
  | 'bidi_control'
  | 'length'
  | 'ticket_url_invalid'
  | 'ticket_url_not_https'
  | 'ticket_url_has_credentials'
  | 'ticket_url_ip_literal'
  | 'ticket_url_local_host';

/** O primeiro motivo de recusa do link, como o servidor; `null` quando o link passa. */
export function recusaDoLinkDoConvite(valor: string): CodigoDoLink | null {
  if (CONTROLE_BIDIRECIONAL.test(valor)) return 'bidi_control';
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LIMITE_DO_LINK_DO_CONVITE) return 'length';
  if ([...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return 'ticket_url_invalid';
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return 'ticket_url_invalid';
  }
  if (url.protocol !== 'https:' || !texto.startsWith('https://')) return 'ticket_url_not_https';
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) return 'ticket_url_has_credentials';
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || IPV4.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) return 'ticket_url_ip_literal';
  if (!host.includes('.') || HOST_LOCAL.test(host)) return 'ticket_url_local_host';
  return null;
}

/** `usuario`, `@usuario` ou a URL do perfil em instagram.com viram o handle puro, em minusculas; senao, `null`. */
export function handleDoInstagram(valor: string): string | null {
  let texto = valor.trim();
  const daUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(texto);
  if (daUrl !== null) texto = daUrl[1] ?? '';
  if (texto.startsWith('@')) texto = texto.slice(1);
  return /^[A-Za-z0-9._]{1,30}$/.test(texto) ? texto.toLowerCase() : null;
}

/** O texto de cada recusa, no campo. Vale para a conferencia do painel e para o `400` do servidor. */
export const MENSAGEM_DO_LINK: Record<CodigoDoLink, string> = {
  bidi_control: 'Tire do link os caracteres invisíveis de direção.',
  length: `Use até ${String(LIMITE_DO_LINK_DO_CONVITE)} caracteres no link.`,
  ticket_url_invalid: 'Isso não é um link. Confira se não ficou espaço no meio.',
  ticket_url_not_https: 'O link precisa começar com https://.',
  ticket_url_has_credentials: 'Tire o usuário e a senha do link.',
  ticket_url_ip_literal: 'Use o endereço do site, e não um número de IP.',
  ticket_url_local_host: 'O link precisa ser de um site público.',
};

export const MENSAGEM_DO_INSTAGRAM = 'Use o @ do Instagram (até 30 letras, números, ponto ou sublinhado) ou o link do perfil.';
