import { useMemo } from 'react';

import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { criarApiDaRede } from './api/redeApi.ts';

/** As chamadas da Rede sobre o cliente da sessao do painel. */
export function useRede() {
  const sessao = useSessao();
  const cliente = sessao.api;
  const rede = useMemo(() => criarApiDaRede({ cliente }), [cliente]);
  return { rede, cliente };
}

/**
 * O `If-Match` de um recurso: sempre montado do `version` dele, e nunca do
 * cabecalho `ETag`.
 */
export function etagDe(e: { version: number }): string {
  return `"${String(e.version)}"`;
}
