/** A base de senhas vazadas (D43) pela consulta de faixa do Pwned Passwords. */
import { createHash } from 'node:crypto';

import type { ListaDeSenhasVazadas } from '../../ports/lista-de-senhas-vazadas.js';

export const ENDERECO_DA_FAIXA = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 5_000;
const TAMANHO_DO_PREFIXO = 5;

export type Buscar = typeof globalThis.fetch;

/** `SUFIXO:CONTAGEM` por linha. */
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
          headers: { 'Add-Padding': 'true', 'User-Agent': 'bichu-senhas-vazadas' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) return 'desconhecido';
        const corpo = await resposta.text();
        if (!/^[0-9A-F]{35}:\d+/im.test(corpo)) return 'desconhecido';
        return sufixoPresente(corpo, sufixo);
      } catch {
        return 'desconhecido';
      }
    },
  };
}
