/**
 * A base de senhas vazadas (D43) pela consulta de faixa do Pwned Passwords.
 *
 * ## O que sai da maquina
 *
 * Os **cinco primeiros caracteres hexadecimais** do SHA-1 da senha, e nada
 * mais. O servico devolve todos os sufixos que comecam por aquele prefixo (da
 * ordem de centenas), e a comparacao e feita AQUI. Nem a senha nem o hash
 * inteiro atravessam a rede: e o modelo de k-anonimato que o proprio servico
 * documenta, e e o que o NIST SP 800-63B 5.1.1.2 pede ("compare against a list
 * of commonly-used, expected, or compromised values").
 *
 * `Add-Padding: true` faz o servico completar a resposta com sufixos falsos de
 * contagem zero, para que o tamanho da resposta nao revele o prefixo a quem
 * observa a conexao. Os sufixos de contagem zero sao descartados.
 *
 * ## `desconhecido` nao e "limpa"
 *
 * Qualquer falha (rede, tempo, status, corpo estranho) devolve `desconhecido`.
 * Quem chama decide o que isso significa; o comando de papel recusa, porque
 * definir senha e o unico momento em que da para recusar sem trancar ninguem
 * do lado de fora.
 *
 * SHA-1 aqui nao e escolha de seguranca: e o formato da base. O hash e
 * descartado logo depois da comparacao e nunca e gravado.
 */
import { createHash } from 'node:crypto';

import type { ListaDeSenhasVazadas } from '../../ports/lista-de-senhas-vazadas.js';

export const ENDERECO_DA_FAIXA = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 5_000;
const TAMANHO_DO_PREFIXO = 5;

export type Buscar = typeof globalThis.fetch;

/** `SUFIXO:CONTAGEM` por linha. Contagem zero e preenchimento. */
export function sufixoPresente(corpo: string, sufixo: string): boolean {
  for (const linha of corpo.split(/\r?\n/)) {
    const separador = linha.indexOf(':');
    if (separador === -1) continue;
    if (linha.slice(0, separador).trim().toUpperCase() !== sufixo) continue;
    const contagem = Number.parseInt(linha.slice(separador + 1).trim(), 10);
    return Number.isFinite(contagem) && contagem > 0;
  }
  return false;
}

export function criarListaDeSenhasVazadasPorFaixa(buscar: Buscar = globalThis.fetch): ListaDeSenhasVazadas {
  return {
    async contem(senha) {
      const hash = createHash('sha1').update(senha, 'utf8').digest('hex').toUpperCase();
      const prefixo = hash.slice(0, TAMANHO_DO_PREFIXO);
      const sufixo = hash.slice(TAMANHO_DO_PREFIXO);
      try {
        const resposta = await buscar(`${ENDERECO_DA_FAIXA}${prefixo}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'bichu-conceder-papel' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) return 'desconhecido';
        const corpo = await resposta.text();
        // Resposta sem nenhuma linha no formato e resposta que nao e da base:
        // tratar como "nao achei" seria aprovar por falta de verificacao.
        if (!/^[0-9A-F]{35}:\d+/im.test(corpo)) return 'desconhecido';
        return sufixoPresente(corpo, sufixo);
      } catch {
        // Falha de rede ou tempo esgotado: sem resposta da base, sem veredito.
        return 'desconhecido';
      }
    },
  };
}
