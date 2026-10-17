/**
 * O padrao de endereco do painel: **a pessoa digita o endereco completo, com
 * `https://`**.
 *
 * Decisao do cliente, 17/10/2026: "todo campo de site/url, o usuario deve
 * preencher completo o endereco completo, inclusive com o https".
 *
 * Espelha `src/shared/url/endereco-completo.ts` no servidor, que e quem
 * decide. O painel confere antes so para dizer o motivo DENTRO do campo, sem
 * ida e volta -- e as recusas do servidor caem nos mesmos textos, escolhidos
 * pelo `code`.
 *
 * **Mora fora de `rede/` e de `loja/` de proposito.** O site do parceiro e a
 * URL do Instagram sao o mesmo problema, em duas secoes diferentes do painel;
 * a primeira versao disto nasceu em `rede/dominio/links.ts` e obrigava a Loja a
 * importar de dentro da Rede, que e a dependencia errada e a que vira
 * duplicacao na proxima vez.
 */
import { configuracao } from '../config.ts';
import { handleDoInstagram } from '../rede/dominio/links.ts';

const HOST_LOCAL = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|home\.arpa|corp|test|invalid|example)$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const CONTROLE_BIDIRECIONAL = /[\u202A-\u202E\u2066-\u2069]/;

/**
 * O exemplo que as mensagens mostram.
 *
 * Montado da configuracao (`VITE_URL_DO_PERFIL_DO_INSTAGRAM`, em
 * `config/hosts-externos.ts`) e nao escrito aqui: host de terceiro literal em
 * `src/` reprova o portao de portabilidade. O precedente e a mensagem do link
 * do convite, que PERDEU o exemplo por nao ter onde por o host -- aqui ele
 * tem, e o exemplo fica.
 */
export const EXEMPLO_DO_INSTAGRAM = `${configuracao.urlDoPerfilDoInstagram.replace(/\/+$/, '')}/bichu.app`;

/** A base do perfil mais os 30 do handle, com folga. O mesmo teto do contrato. */
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
 * O primeiro motivo de recusa da URL do Instagram, como o servidor; `null`
 * quando passa.
 *
 * **Desde 17/10/2026 o apelido cru e RECUSADO.** Padrao do cliente: todo campo
 * de site recebe o endereco completo, com `https://`. `@bichu.app` cai em
 * `instagram_url_not_https`, e a mensagem mostra a forma certa.
 */
export function recusaDoInstagram(valor: string): CodigoDoInstagram | null {
  if (CONTROLE_BIDIRECIONAL.test(valor)) return 'bidi_control';
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LIMITE_DA_URL_DO_INSTAGRAM) return 'instagram_url_length';
  if ([...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
    return 'instagram_url_invalid';
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    // Onde `@bichu.app` e `bichu.app` caem: sem esquema o `URL` nem parseia.
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

/** `https://` + 253 do dominio. O mesmo do contrato. */
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
 * O primeiro motivo de recusa do site do parceiro, como o servidor; `null`
 * quando passa.
 *
 * Mesma regra de [recusaDoLinkDoConvite], com outro teto e outro prefixo de
 * `code`. Os prefixos diferentes existem para a tela poder escolher a frase
 * certa quando dois campos de endereco recusam na mesma pagina.
 */
export function recusaDoSite(valor: string): CodigoDoSite | null {
  if (CONTROLE_BIDIRECIONAL.test(valor)) return 'bidi_control';
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LIMITE_DO_SITE) return 'site_url_length';
  if ([...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
    return 'site_url_invalid';
  }
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


/**
 * O texto de cada recusa do Instagram. Uma linha por motivo, e o motivo REAL.
 *
 * A frase de `not_https` traz o exemplo porque e a recusa que ENSINA o padrao
 * novo: quem digitava `@bichu.app` ate ontem precisa ver a forma certa, e nao
 * so ouvir que a antiga nao serve mais.
 */
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

/** O texto de cada recusa do site do parceiro. */
export const MENSAGEM_DO_SITE: Record<CodigoDoSite, string> = {
  bidi_control: 'O endereço tem caracteres invisíveis. Apague e digite de novo.',
  site_url_length: `Use até ${String(LIMITE_DO_SITE)} caracteres.`,
  // Sem exemplo com host: o site do parceiro nao tem um host de terceiro
  // que caiba em configuracao, e o precedente do link do convite e descrever.
  site_url_not_https: 'Escreva o endereço completo do site, começando com https://.',
  site_url_has_credentials: 'Tire o usuário e a senha do endereço.',
  site_url_ip_literal: 'Use o endereço do site, e não um número de IP.',
  site_url_local_host: 'O endereço precisa ser de um site público.',
  site_url_invalid: 'Confira o endereço: ele não pode ter espaço.',
};
