/**
 * O padrao de endereco da aplicacao inteira: **a pessoa digita o endereco
 * completo, com `https://`**.
 *
 * Decisao do cliente, 17/10/2026, por extenso: "mantenha o padrao, todo campo
 * de site/url, o usuario deve preencher completo o endereco completo, inclusive
 * com o https".
 *
 * ## O que o padrao PROIBE, e e isso que ele e
 *
 * **Completar esquema em silencio.** `cobasi.com.br` nao vira
 * `https://parceiro.exemplo.test` por baixo, e `@perfil` nao vira
 * o endereco do perfil. Os dois sao recusados, com uma linha dizendo
 * o que falta.
 *
 * Completar em silencio parece gentileza e e uma aposta: o servidor adivinha o
 * esquema de um endereco que a pessoa nao terminou de escrever, e quando a
 * aposta erra o erro aparece longe daqui -- numa tela, meses depois, levando
 * alguem para o lugar errado. Exigir custa um campo a mais de digitacao uma
 * vez; adivinhar custa um defeito que ninguem liga a este arquivo.
 *
 * ## Por que esta funcao existe, em vez de uma quarta copia da regra
 *
 * Quando este arquivo nasceu havia DUAS implementacoes da mesma ideia, cada
 * uma com o proprio conjunto de recusas e os proprios textos:
 * `errosDoLinkDeIngresso` (`network`) e `errosDoDestino` (`store`). As duas
 * estao certas e **continuam onde estao** -- cada uma tem regra propria que nao
 * generaliza (o teto de 500 do ingresso, o vinculo com o dominio do parceiro),
 * e mexer nelas agora seria churn em codigo que ja cumpre o padrao.
 *
 * O que esta funcao impede e a TERCEIRA e a QUARTA copia: o site do parceiro e
 * a URL do Instagram chegaram depois, e sem um lugar comum cada uma nasceria
 * com a propria ideia de "endereco completo". As divergencias entre copias nao
 * aparecem em teste -- aparecem quando um campo aceita o que o outro recusa, e
 * ninguem sabe dizer qual dos dois esta certo.
 *
 * ## Cada recusa tem `code` PROPRIO, e isso e requisito
 *
 * Em 17/10 o cliente perdeu tempo porque o painel dizia "precisa comecar com
 * https://" para recusas que nao tinham nada a ver com esquema. Ele leu a frase
 * sobre um link que comecava com `https://` e foi procurar o defeito no proprio
 * link. **Mensagem generica manda a pessoa consertar a coisa errada**, e por
 * isso nenhuma recusa daqui compartilha `code` com outra.
 */
import type { ProblemFieldError } from '../http/problem.js';

/** Controles de direcao: texto que se le ao contrario do que esta gravado. */
const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

/** IPv4 literal, inclusive com zero a esquerda. O IPv6 chega entre colchetes. */
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Host que so existe dentro de uma rede: `localhost`, `.local`, `.internal`,
 * `.home.arpa` e nome sem ponto nenhum.
 *
 * A mesma lista de `errosDoLinkDeIngresso`, e deliberadamente a mesma: um
 * endereco publico num campo e endereco publico no outro.
 */
const HOST_LOCAL = /^(?:localhost|.*\.(?:local|internal|localdomain|home\.arpa))$/;

/** O teto padrao. Quem precisa de outro passa o proprio. */
export const TETO_DO_ENDERECO = 2048;

export interface OpcoesDoEndereco {
  /** O teto de caracteres. Padrao: [TETO_DO_ENDERECO]. */
  readonly teto?: number;
  /**
   * O prefixo dos `code`, para a recusa nomear o campo
   * (`site_url_not_https`, `instagram_url_not_https`).
   *
   * Existe porque o painel escolhe a frase pelo `code`, e dois campos com
   * motivos diferentes na mesma tela precisam de `code` distintos -- senao a
   * tela volta a ter uma frase so para recusas diferentes, que e o defeito
   * inteiro que este arquivo existe para nao repetir.
   */
  readonly prefixo: string;
}

/**
 * Confere um endereco completo de site: `https://`, publico, sem credencial.
 *
 * Devolve os erros de campo, e nao lanca: quem chama junta com os outros erros
 * do corpo e responde um 400 so.
 *
 * **Query e fragmento passam.** Loja de verdade identifica produto por
 * parametro (`/p?idsku=1197673`), e recusa-los bloqueou o cliente em 17/10.
 */
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
    // **A recusa mais comum do padrao novo, e a que precisa ensinar.** Quem
    // digita `cobasi.com.br` cai aqui, porque sem esquema o `URL` nem parseia.
    // Dizer so "isso nao e um link" deixaria a pessoa olhando para um endereco
    // que ela sabe que existe, sem saber o que falta.
    return recusa('not_https', 'Escreva o endereço completo, começando com https://.');
  }

  // O texto CRU tambem precisa comecar por `https://`: `HTTPS://` e `https:/x`
  // o `URL` aceita e normaliza, e o que se guarda e o texto.
  if (url.protocol !== 'https:' || !texto.startsWith('https://')) {
    // `http://` cai aqui com frase propria: a pessoa escreveu um esquema, so
    // nao o certo, e mandar "escreva o endereco completo" seria responder
    // outra pergunta.
    return texto.toLowerCase().startsWith('http://')
      ? recusa('not_https', 'Troque http:// por https://.')
      : recusa('not_https', 'Escreva o endereço completo, começando com https://.');
  }
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) {
    return recusa('has_credentials', 'O endereço não pode ter usuário e senha.');
  }

  // O ponto final e o mesmo host em DNS (`localhost.` e `localhost`): tirado
  // uma vez, aqui, todas as regras abaixo leem o mesmo nome.
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
 * O host de um endereco que [errosDoEnderecoCompleto] ja aprovou, em
 * minusculas e sem o ponto final.
 */
export function hostDoEndereco(valor: string): string {
  return new URL(valor.trim()).hostname.toLowerCase().replace(/\.+$/, '');
}
